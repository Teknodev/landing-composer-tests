/**
 * E2E — COMP-2557: Buy-Token purchase auth.
 *
 * What this spec proves (behavioural, against the running editor at :3000):
 *
 *   1. (CORE) The buy-token purchase request
 *      `POST /fn-execute/stripe/session` (createSession) now carries a
 *      NON-EMPTY `Authorization` header. Previously the JWT was only in the
 *      request BODY, so the backend header-only `Api.decodeToken(req)` gate
 *      returned 401 → the global request-tracker force-logged-out the user.
 *      The fix is the global axios request interceptor in
 *      `landing-composer/src/utils/local-apikey-interceptor.ts`, which injects
 *      the stored SPICA token as the raw `Authorization` header on every raw
 *      `axios.request()` that targets the API host (createSession bypasses the
 *      `apiUtils.api` instance, so it never set the header before).
 *
 *   2. Selecting a token package is LOCAL STATE ONLY — it must NOT trigger a
 *      network call, a logout, or a redirect to `/authentication`.
 *
 * NOTE: the request-tracker payment-path exclusion was REVERTED — uniform
 * `401 → logout` is the intended behavior again — so the prior payment-401
 * "no logout" defense-in-depth case has been removed from this spec.
 *
 * ---------------------------------------------------------------------------
 * HOW THE POPUP IS REACHED (deterministic, data-agnostic):
 *
 *   The `OneTimePaymentPopup` (data-cy="one-time-payment-popup") is rendered by
 *   `usePaymentPopup` inside the `<AIToken/>` token pill, which lives in the
 *   global `<TopBar/>` (mounted by `app.tsx` on every non-preview route). It
 *   only renders when the user has a DEFAULT payment method AND there are
 *   token-tagged `prices` to show as packages. Rather than depend on the test
 *   account's real Stripe state (not data-agnostic) we STUB:
 *
 *     - GET **\/fn-execute/payment-method  -> one default card (is_default:true)
 *     - GET **\/fn-execute/price           -> two token-tagged packages
 *
 *   The popup is opened by clicking the AIToken pill (`img[alt="Token"]`):
 *   `AIToken.handleClick` calls `setShowPopup(true)` when a payment method
 *   exists. We DON'T use the stale `loginToEditor` hardcoded project URL (it
 *   redirects to "/" for accounts that don't own that id) NOR a discovered
 *   project editor (whose project-specific state can auto-open modals like
 *   "Translate Pages"). Instead we use the clean authenticated `/projects`
 *   dashboard route, which `app.tsx` renders with the same TopBar + AIToken
 *   and opens no editor modals.
 *
 * WHAT IS STUBBED (documented for the orchestrator):
 *   - `/fn-execute/payment-method` (default card) — so the popup renders.
 *   - `/fn-execute/price` (token packages)        — so package cards render.
 *   - `/fn-execute/stripe/session` (createSession) — so NO real Stripe charge
 *     occurs; the stub is also where the Authorization header is asserted.
 *   Nothing else is stubbed — login, routing, and the global axios interceptor
 *   under test all run for real.
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

// GET /fn-execute/price may carry query params — match path with or without one.
const PRICE_URL_RE = /\/fn-execute\/price(\?|$)/;

/**
 * Register the data stubs that make the buy-token popup renderable, log in, and
 * land on the clean authenticated `/projects` dashboard (data-agnostic — no
 * hardcoded ids). Intercepts are registered BEFORE the cy.visit so the app's
 * context bootstrap (UserContext.getPaymentMethods + app.tsx getPrices) is
 * served the stubbed data.
 */
function seedPopupDataAndEnterEditor() {
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

  // TopBar (and its AIToken pill) renders on /projects.
  cy.get('[data-cy="header"]', { timeout: 30000 }).should('be.visible');
  // Let UserContext.getPaymentMethods + getPrices settle so AIToken.handleClick
  // sees the stubbed default card (otherwise it would route to /profile).
  cy.get('img[alt="Token"]', { timeout: 20000 }).should('exist');
  cy.wait(2000);
}

/**
 * Open the OneTimePaymentPopup by clicking the AIToken pill in the TopBar.
 * AIToken.handleClick -> setShowPopup(true) when a payment method exists.
 */
function openBuyTokenPopup() {
  // Click the token pill (onClick lives on the container; clicking the inner
  // img bubbles to it). force:true because the pill can be visually small.
  cy.get('img[alt="Token"]').first().click({ force: true });

  // The popup + its package cards must be present before any interaction.
  cy.get('[data-cy="one-time-payment-popup"]', { timeout: 10000 }).should('be.visible');
  cy.get('[data-cy^="token-package-"]', { timeout: 10000 }).should('have.length.greaterThan', 0);
}

describe('COMP-2557 — Buy-token purchase auth', () => {
  it('M1: createSession (POST /fn-execute/stripe/session) carries a non-empty Authorization header and the user stays in the editor', () => {
    seedPopupDataAndEnterEditor();

    // Stub createSession: no real Stripe charge. Returning a body WITHOUT a
    // client_secret short-circuits useCreateSession BEFORE Stripe.js
    // confirmCardPayment, so no live Stripe call is made. The Authorization
    // header is captured here regardless of downstream outcome.
    let capturedAuth = null;
    cy.intercept('POST', '**/fn-execute/stripe/session', (req) => {
      capturedAuth = req.headers['authorization'];
      req.reply({ statusCode: 200, body: { data: {} } });
    }).as('createSession');

    openBuyTokenPopup();

    // BEFORE: we are inside the editor, not on /authentication.
    cy.location('pathname').should('include', '/projects');
    cy.location('pathname').should('not.include', '/authentication');

    // ACTION: select a package + submit the purchase.
    cy.get('[data-cy^="token-package-"]').first().click();
    cy.get('[data-cy="one-time-payment-popup-pay-btn"]').should('not.be.disabled').click();

    // AFTER: the outgoing createSession request carried a non-empty Authorization
    // header (the COMP-2557 core assertion).
    cy.wait('@createSession').then((interception) => {
      const auth = interception.request.headers['authorization'];
      expect(auth, 'createSession Authorization header is present').to.be.a('string');
      expect(auth, 'createSession Authorization header is non-empty').to.have.length.greaterThan(10);
      // The fix sets the RAW token (no `IDENTITY ` scheme — backend sig-verify
      // rejects IDENTITY). Bearer-prefixed is also acceptable; IDENTITY is not.
      expect(auth.startsWith('IDENTITY '), 'header must not use the rejected IDENTITY scheme').to.eq(false);
    });

    cy.then(() => {
      expect(capturedAuth, 'handler-captured Authorization header non-empty').to.be.a('string').and.not.be.empty;
    });

    // The purchase attempt must NOT have logged the user out.
    cy.location('pathname').should('not.include', '/authentication');
    cy.location('pathname').should('include', '/projects');
  });

  it('M2: selecting a token package is local-state-only — no createSession call, no redirect to /authentication', () => {
    seedPopupDataAndEnterEditor();

    // Spy on createSession so we can prove selection fires NO network call.
    cy.intercept('POST', '**/fn-execute/stripe/session', { statusCode: 200, body: { data: {} } }).as('createSession');

    openBuyTokenPopup();

    cy.location('pathname').then((before) => {
      // ACTION: select the (second) package — a pure local-state mutation.
      cy.get('[data-cy^="token-package-"]').eq(1).click();

      // AFTER: still in the editor, popup still open, no logout/redirect.
      cy.get('[data-cy="one-time-payment-popup"]').should('be.visible');
      cy.location('pathname').should('eq', before);
      cy.location('pathname').should('not.include', '/authentication');
    });

    // Selection must NOT have triggered the purchase endpoint. Give the app a
    // beat, then assert no createSession interception was recorded.
    cy.wait(500);
    cy.get('@createSession.all').should('have.length', 0);
  });
});
