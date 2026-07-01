/**
 * E2E — Unified Error System (FE): global backend-error toast.
 *
 * Proves the behaviour of the global axios RESPONSE interceptor added in
 * `landing-composer/src/utils/local-apikey-interceptor.ts` (branch
 * `feat/unified-error-toast`):
 *
 *   - Auto-toasts `error.response.data.message` for any 4xx/5xx EXCEPT
 *     401 (auth-redirect / session-expired path, unchanged) and
 *     402 (insufficient-balance, handled upstream by the 402 broker block).
 *   - Falls back to "Something went wrong. Please try again." when the body
 *     carries no `message`.
 *   - Dedupes via a shared `errorToastShown` marker so a single failing
 *     request never yields two toasts.
 *   - The buy-credits / one-time-payment popup (decision 5C) no longer renders
 *     the misleading generic "Payment failed. Please check your card and try
 *     again." inline message — the real backend reason surfaces via the toast.
 *
 * ---------------------------------------------------------------------------
 * WHY WE DRIVE THROUGH THE BUY-CREDITS POPUP:
 *   `createSession` (POST /fn-execute/stripe/session) is issued via the RAW
 *   default `axios` instance (see classes/functions/Stripe/index.js), so the
 *   GLOBAL response interceptor under test runs for it. It is the one
 *   deterministic, on-demand `/fn-execute/*` call we can fully control from the
 *   UI, which also lets case 5C assert the popup's inline-error behaviour in the
 *   same flow. Backend is NOT deployed, so every response is stubbed with the
 *   unified body `{ message, code }` via cy.intercept.
 *
 * DATA-AGNOSTIC: no hardcoded project/identity/price ids. The popup is made
 * renderable by stubbing GET /fn-execute/payment-method (one default card) and
 * GET /fn-execute/price (token packages), exactly like buy-token-auth.cy.js.
 * We land on the clean authenticated /projects dashboard (TopBar + AIToken).
 *
 * TOAST SELECTOR: react-toastify content is wrapped by NotificationService in a
 *   <span> carrying BOTH data-cy and the project-standard data-test-id with the
 *   same value (see classes/NotificationService.ts, commit 2df62e9). Error /
 *   warning / info toasts use "toast-message"; success uses "toast-success".
 *   This spec targets the standard [data-test-id="toast-message"].
 * ---------------------------------------------------------------------------
 */

// --- Stub fixtures (created on-demand; no environment-specific ids) ---------
const STUB_PAYMENT_METHODS = [
  {
    _id: 'pm_doc_stub',
    id: 'pm_stub_card_visa',
    last4: '4242',
    brand: 'visa',
    title: 'QA Stub Card',
    is_default: true,
  },
];

const STUB_PRICES = [
  { _id: 'price_stub_1k', price: 10, tokens: 1000, product: { _id: 'prod_token_stub', tag: 'token' } },
  { _id: 'price_stub_5k', price: 45, tokens: 5000, product: { _id: 'prod_token_stub', tag: 'token' } },
];

const PRICE_URL_RE = /\/fn-execute\/price(\?|$)/;
const SESSION_URL = '**/fn-execute/stripe/session';
const TOAST = '[data-test-id="toast-message"]';
const TOAST_SUCCESS = '[data-test-id="toast-success"]';

/** Seed the stubs that make the buy-credits popup renderable, log in, land on
 *  /projects. Intercepts are registered BEFORE cy.visit so bootstrap is served
 *  the stubbed data. */
function seedPopupDataAndEnter() {
  cy.intercept('GET', '**/fn-execute/payment-method', {
    statusCode: 200,
    body: STUB_PAYMENT_METHODS,
  }).as('paymentMethods');

  cy.intercept('GET', PRICE_URL_RE, {
    statusCode: 200,
    body: STUB_PRICES,
  }).as('prices');

  cy.login();
  cy.visit('/projects');

  cy.get('[data-cy="header"]', { timeout: 30000 }).should('be.visible');
  cy.get('img[alt="Token"]', { timeout: 20000 }).should('exist');
  cy.wait(2000);
}

/** Open the OneTimePaymentPopup by clicking the AIToken pill. */
function openBuyCreditsPopup() {
  cy.get('img[alt="Token"]').first().click({ force: true });
  cy.get('[data-cy="one-time-payment-popup"]', { timeout: 10000 }).should('be.visible');
  cy.get('[data-cy^="token-package-"]', { timeout: 10000 }).should('have.length.greaterThan', 0);
}

/** Select the first package + submit the purchase (fires createSession). */
function selectPackageAndPay() {
  cy.get('[data-cy^="token-package-"]').first().click();
  cy.get('[data-cy="one-time-payment-popup-pay-btn"]').should('not.be.disabled').click();
}

describe('Unified error system — global backend-error toast (5C)', () => {
  it('M1: createSession returns 400 {message} → error toast shows the backend message', () => {
    seedPopupDataAndEnter();
    cy.intercept('POST', SESSION_URL, {
      statusCode: 400,
      body: { message: 'Invalid quantity', code: 'INVALID_QUANTITY' },
    }).as('createSession');

    openBuyCreditsPopup();

    // BEFORE: no error toast on screen.
    cy.get('body').should('not.contain.text', 'Invalid quantity');

    // ACTION: submit the purchase → createSession 400s.
    selectPackageAndPay();
    cy.wait('@createSession');

    // AFTER: the global interceptor toasted the exact backend message.
    cy.get(TOAST, { timeout: 10000 }).should('contain.text', 'Invalid quantity');
  });

  it('M2: createSession returns 500 {message} → error toast shows the 500 message', () => {
    seedPopupDataAndEnter();
    const msg500 = 'Something went wrong. Please try again.';
    cy.intercept('POST', SESSION_URL, {
      statusCode: 500,
      body: { message: msg500, code: 'INTERNAL' },
    }).as('createSession');

    openBuyCreditsPopup();
    cy.get('body').should('not.contain.text', msg500);

    // ACTION: submit → createSession 500s.
    selectPackageAndPay();
    cy.wait('@createSession');

    // AFTER: the 5xx message is surfaced via toast.
    cy.get(TOAST, { timeout: 10000 }).should('contain.text', msg500);
  });

  it('N1: createSession returns 401 → the new system does NOT toast the backend message (auth path unchanged)', () => {
    seedPopupDataAndEnter();
    // A distinctive body message the NEW unified toast must NEVER surface for 401.
    const forbidden = 'AUTH401_BACKEND_MESSAGE_MUST_NOT_TOAST';
    cy.intercept('POST', SESSION_URL, {
      statusCode: 401,
      body: { message: forbidden, code: 'UNAUTHENTICATED' },
    }).as('createSession');

    openBuyCreditsPopup();

    // ACTION: submit → createSession 401s.
    selectPackageAndPay();
    cy.wait('@createSession');

    // AFTER: give the interceptor + any async toast a beat, then assert the new
    // unified system produced NO toast carrying the backend message. (The
    // existing session-expired warning + /authentication redirect is the
    // intended 401 behaviour and is owned by request-tracker.tsx, unchanged.)
    cy.wait(1500);
    cy.get('body').should('not.contain.text', forbidden);
    // If any toast rendered at all (e.g. the session-expired warning), it must
    // not be the backend message.
    cy.get('body').then(($b) => {
      if ($b.find(TOAST).length) {
        cy.get(TOAST).should('not.contain.text', forbidden);
      }
    });
  });

  it('N2: createSession returns 402 insufficient_balance → existing broker toast fires, NOT a generic/duplicate unified toast', () => {
    seedPopupDataAndEnter();
    // Distinctive raw `message` the generic unified toast would surface if the
    // 402 exclusion were broken. The broker block must swallow it and toast its
    // own "Insufficient AI tokens" copy instead.
    const rawMsg = 'GENERIC_402_MESSAGE_MUST_NOT_TOAST';
    cy.intercept('POST', SESSION_URL, {
      statusCode: 402,
      body: {
        error: 'insufficient_balance',
        required: 5000,
        available: 100,
        message: rawMsg,
        code: 'INSUFFICIENT_BALANCE',
      },
    }).as('createSession');

    openBuyCreditsPopup();

    // ACTION: submit → createSession 402s.
    selectPackageAndPay();
    cy.wait('@createSession');

    // AFTER: the insufficient-balance broker toast fired (existing behaviour)…
    cy.get(TOAST, { timeout: 10000 }).should('contain.text', 'Insufficient AI tokens');
    // …and the NEW generic unified toast did NOT surface the raw backend message.
    cy.get('body').should('not.contain.text', rawMsg);
  });

  it('M3: buy-credits popup (5C) — createSession 400 toasts "Invalid quantity" and popup shows NO old generic inline error', () => {
    seedPopupDataAndEnter();
    cy.intercept('POST', SESSION_URL, {
      statusCode: 400,
      body: { message: 'Invalid quantity', code: 'INVALID_QUANTITY' },
    }).as('createSession');

    openBuyCreditsPopup();

    // ACTION: submit the purchase → createSession 400s.
    selectPackageAndPay();
    cy.wait('@createSession');

    // AFTER (a): the toast surfaces the backend reason.
    cy.get(TOAST, { timeout: 10000 }).should('contain.text', 'Invalid quantity');

    // AFTER (b): the popup stays OPEN but renders NO inline error — neither the
    // removed generic copy nor the inline error node.
    cy.get('[data-cy="one-time-payment-popup"]').should('be.visible');
    cy.get('[data-cy="one-time-payment-popup"]')
      .should('not.contain.text', 'Payment failed. Please check your card and try again.');
    cy.get('[data-cy="one-time-payment-popup-error"]').should('not.exist');
  });

  it('M4: a single failing createSession yields exactly ONE error toast (dedupe)', () => {
    seedPopupDataAndEnter();
    // Unique message so no cross-test toast can be mistaken for a duplicate.
    const uniq = 'DEDUPE_PROBE_SINGLE_TOAST_ONLY';
    cy.intercept('POST', SESSION_URL, {
      statusCode: 400,
      body: { message: uniq, code: 'DEDUPE_PROBE' },
    }).as('createSession');

    openBuyCreditsPopup();

    // ACTION: submit ONE failing request.
    selectPackageAndPay();
    cy.wait('@createSession');

    // AFTER: exactly one toast rendered for the single request (errorToastShown
    // dedupe marker prevents a second toast across api-utils + global handlers).
    cy.get(TOAST, { timeout: 10000 }).should('contain.text', uniq);
    cy.wait(500);
    cy.get(TOAST).filter(`:contains(${uniq})`).should('have.length', 1);
  });

  // ---------------------------------------------------------------------------
  // N3 (SKIPPED — no UI consumer yet): `config.suppressErrorToast === true`
  // opt-out.
  //
  // The global interceptor supports an opt-out: a 4xx/5xx whose axios request
  // config carries `suppressErrorToast: true` must NOT auto-toast, while the
  // same request WITHOUT the flag DOES (interceptor branch at
  // landing-composer/src/utils/local-apikey-interceptor.ts:130).
  //
  // WHY SKIPPED: as of feat/unified-error-toast @ 2df62e9 NO in-app flow sets
  // `suppressErrorToast: true` — the only reference in the codebase is a comment
  // in custom-hooks/use-payment-popup.tsx explicitly declining to pass it
  // ("Do NOT pass suppressErrorToast — we WANT that toast", decision 5C), and
  // the app exposes no window-scoped axios instance for Cypress to issue a raw
  // request with that config. There is therefore NO feasible, non-synthetic
  // in-app way to exercise this branch behaviourally. The opt-out is covered
  // structurally by the verifier (interceptor diff) rather than by a brittle
  // hack here. TOAST_SUCCESS is referenced so a future enabler has the standard
  // success selector to hand.
  //
  // ENABLE THIS TEST WHEN: a real UI consumer issues an in-app axios call with
  // `suppressErrorToast: true` (e.g. a background/polling request), OR the app
  // exposes a window-scoped axios/apiService instance Cypress can drive. Then:
  //   1. stub that endpoint to return a distinctive 4xx {message},
  //   2. trigger the suppressed flow → assert NO [data-test-id="toast-message"]
  //      carries that message,
  //   3. trigger the same endpoint via a NON-suppressed flow → assert the toast
  //      DOES surface it (proving the flag, not a broken endpoint, silenced it).
  // ---------------------------------------------------------------------------
  it.skip('N3: suppressErrorToast=true suppresses the 4xx error toast (same request without the flag DOES toast)', () => {
    // Placeholder — see block comment above. Selectors ready for the enabler:
    const ERR = TOAST;
    const OK = TOAST_SUCCESS;
    void ERR;
    void OK;
    expect(true, 'no in-app suppressErrorToast consumer yet — enable per comment above').to.equal(true);
  });
});
