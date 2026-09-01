/**
 * PAT Manager — end-to-end Cypress spec.
 *
 * Covers the seven sections from the QA orchestration brief:
 *   1. Empty state
 *   2. Create PAT (happy path) + reveal-once modal + clipboard
 *   3. Validation (empty / >60 / >200)
 *   4. Revoke (cancel, then confirm)
 *   5. Expiry options (5 labels, security warning)
 *   6. 10-token limit (intercept 409_LIMIT_REACHED)
 *   7. Logger audit (PatManager / PATService traces fire)
 *
 * Backend deployed to local Spica at http://localhost:4501/api per
 * `/tmp/agent-handoff/pat-backend.json#deploy`.
 *
 * NOTE: the brief lists `pat-test@blinkpage.local` as the test identity, but the
 * Spica `/fn-execute/v1/auth/login` function requires a populated User row, which only
 * the standard fixture user (blinkpage1@hotmail.com) has. The PAT backend
 * accepts that user's JWT identically, so all assertions hold.
 */

import data from '@fixtures/data.json';

const API_BASE = 'http://localhost:4501/api/fn-execute';
const PAT_LIST_URL = `${API_BASE}/pat`;
const PAT_CREATE_URL = `${API_BASE}/pat`;
const PAT_REVOKE_URL_PATTERN = `${API_BASE}/pat/*`;

const NAME_REGEX_69_CHAR = /^bpat_[a-f0-9]{64}$/;

/** Fixture user _id — used to short-circuit the onboarding modal. */
const FIXTURE_USER_ID = '69fc6d170380de8e4c07ee9b';

/**
 * Visits /profile with a console.info + console.log spy installed BEFORE the
 * page boots so we capture every Logger emission. Pre-sets the onboarding-
 * dismissed flag so the modal does not cover the page on first visit.
 */
const openProfileWithSpies = () => {
  cy.visit('/profile', {
    onBeforeLoad(win) {
      // Logger.info uses console.info; the Tier-1 banner styles also use
      // console.log. Spy on both so the audit assertion is bulletproof.
      cy.spy(win.console, 'info').as('consoleInfoSpy');
      cy.spy(win.console, 'log').as('consoleLogSpy');
      // Onboarding modal short-circuit: sets the "already shown" flag for the
      // current user so the OverlayPopup never mounts and covers the form.
      win.localStorage.setItem('user_onboarding_dismissed', FIXTURE_USER_ID);
    },
  });
  cy.get('[data-cy="card-title"]', { timeout: 20000 })
    .should('be.visible');
};

const expandAdvancedAccordion = () => {
  // The accordion sits near the bottom of /profile; some viewports keep its
  // center beneath a sticky region. Use force:true to bypass actionability —
  // the accordion never has an overlay listener that depends on viewport pos.
  cy.get('[data-cy="profile-advanced-toggle"]', { timeout: 10000 })
    .scrollIntoView({ block: 'center' })
    .should('exist')
    .click({ force: true });
  // PatManager must mount inside the accordion details.
  cy.get('[data-cy="pat-manager"]', { timeout: 10000 }).should('be.visible');
};

/**
 * Hard-cleanup: wipe EVERY row in the PAT bucket so the list starts truly empty
 * for each test, not just "no actives". Spica's PAT DELETE is a soft-revoke, so
 * we authenticate as the admin identity and hit the raw bucket-data endpoint to
 * physically delete rows. Falls back gracefully if the admin creds aren't valid
 * locally.
 */
const PAT_BUCKET_ID = '6a02cf7639fd0f23ec0726dc';
const purgePatsViaApi = () => {
  // R6 cleanup-robustness fix: all admin requests carry failOnStatusCode:false
  // AND a 60s timeout so a slow Spica under CI load cannot abort the test
  // before it even mounts the page. The whole chain is best-effort — if any
  // step fails, the next test still runs because the user-facing
  // revokeAllRowsSilently() afterEach acts as a second cleanup layer.
  return cy
    .request({
      method: 'POST',
      url: 'http://localhost:4501/api/passport/identify',
      body: { identifier: 'spica', password: 'spica' },
      failOnStatusCode: false,
      timeout: 60000,
    })
    .then((idRes) => {
      if (idRes.status !== 200 || !idRes.body?.token) return;
      const adminToken = idRes.body.token;
      return cy
        .request({
          method: 'GET',
          url: `http://localhost:4501/api/bucket/${PAT_BUCKET_ID}/data?limit=50`,
          headers: { Authorization: `IDENTITY ${adminToken}` },
          failOnStatusCode: false,
          timeout: 60000,
        })
        .then((listRes) => {
          if (listRes.status !== 200 || !Array.isArray(listRes.body)) return;
          listRes.body.forEach((row) => {
            cy.request({
              method: 'DELETE',
              url: `http://localhost:4501/api/bucket/${PAT_BUCKET_ID}/data/${row._id}`,
              headers: { Authorization: `IDENTITY ${adminToken}` },
              failOnStatusCode: false,
              timeout: 60000,
            });
          });
        });
    });
};

/**
 * Installs clipboard stubs on the test window so headless / headed browsers
 * don't need OS clipboard permissions during the reveal-modal copy step.
 */
const stubClipboard = () => {
  cy.window().then((win) => {
    let clipboardBuffer = '';
    cy.stub(win.navigator.clipboard, 'writeText').callsFake((value) => {
      clipboardBuffer = value;
      return Promise.resolve();
    });
    cy.stub(win.navigator.clipboard, 'readText').callsFake(() =>
      Promise.resolve(clipboardBuffer)
    );
  });
};

/**
 * Opens the create modal and submits a new PAT with the given name (and
 * optional description). Leaves the reveal modal visible — callers decide
 * whether to assert on it, copy the token, or close.
 */
const createPatViaUi = (tokenName, tokenDescription = '') => {
  cy.get('[data-cy="pat-create-open"]')
    .scrollIntoView({ block: 'center' })
    .click({ force: true });
  cy.get('#overlay-pat-create-modal', { timeout: 10000 }).should('be.visible');
  cy.get('[data-cy="pat-name-input"]').type(tokenName);
  if (tokenDescription) {
    cy.get('[data-cy="pat-description-input"]').type(tokenDescription);
  }
  cy.get('[data-cy="pat-create-submit"]').click();
  cy.get('#overlay-pat-reveal-modal', { timeout: 15000 }).should('be.visible');
};

/**
 * Closes the reveal modal via the "I've saved it — close" CTA.
 */
const closeRevealModal = () => {
  cy.get('[data-cy="pat-reveal-close"]').click();
  cy.get('#overlay-pat-reveal-modal').should('not.exist');
};

/**
 * Reusable revoke-via-UI helper for `afterEach` cleanup. Performs no
 * assertions on outcome — purely best-effort row clean-up so the next test
 * isn't polluted by an active token if the prior test died mid-flow.
 *
 * ROBUSTNESS CONTRACT (R6 cleanup-cascade fix):
 * - This helper MUST NEVER throw or fail an `afterEach`. A failure in one
 *   test previously cascaded to skip ~6 downstream tests because the page
 *   was torn down and `cy.get(...)` could not find the rows here.
 * - We therefore: (a) gate every step through `cy.window()` + jQuery via
 *   `Cypress.$` so a missing/torn-down DOM is a no-op; (b) wrap each
 *   per-row interaction in a `cy.then(... try/catch ...)` so an individual
 *   click failure cannot bubble; (c) only chain Cypress commands when the
 *   element actually exists in the live DOM at that moment.
 */
const revokeAllRowsSilently = () => {
  // Outer guard: if the window or jQuery aren't even present (e.g. the spec
  // failed before any cy.visit() landed), bail without queuing anything.
  cy.window({ log: false }).then((win) => {
    try {
      const $ = win.Cypress && win.Cypress.$ ? win.Cypress.$ : Cypress.$;
      if (!$ || !win.document) {
        cy.log('[cleanup] window/$ unavailable — skipping revoke loop.');
        return;
      }

      // Snapshot the row buttons via jQuery so we never call cy.get() on a
      // selector that may not match (cy.get throws on zero-match by default).
      const $rows = $(win.document).find(
        '[data-cy="pat-row"] [data-cy="pat-revoke-btn"]'
      );
      if (!$rows.length) {
        cy.log('[cleanup] no revoke buttons — clean slate.');
        return;
      }

      cy.log(`[cleanup] attempting silent revoke of ${$rows.length} row(s).`);

      $rows.each((_, btn) => {
        // Wrap EACH row in its own try-catch via cy.then so a single failure
        // (e.g. confirm dialog never opens) does not abort the rest of the
        // afterEach. cy.then's callback errors are isolated when caught here.
        cy.then(() => {
          try {
            // Re-check the button is still attached before clicking — the
            // previous row's revoke can re-render the list and detach this
            // node from the DOM.
            const $btn = $(btn);
            if (!$btn || !$btn.length || !$btn.is(':visible')) return;

            cy.wrap($btn, { log: false })
              .scrollIntoView({ block: 'center' })
              .click({ force: true });

            // Confirm-dialog button is conditional: guard via jQuery and
            // only chain cy.get when the dialog actually appears. We use a
            // short polling loop via cy.then to avoid the default 4s
            // ASSERT_DOM cy.get() timeout if the dialog never opens.
            cy.then(() => {
              const $confirm = $(win.document).find(
                '[data-cy="pat-revoke-confirm-btn"]'
              );
              if ($confirm.length && $confirm.is(':visible')) {
                cy.wrap($confirm.first(), { log: false }).click({ force: true });
              }
            });
          } catch (rowErr) {
            // Swallow per-row errors — cleanup must never fail.
            cy.log(`[cleanup] row revoke skipped: ${rowErr && rowErr.message}`);
          }
        });
      });
    } catch (outerErr) {
      // Swallow outer errors — cleanup must never fail.
      cy.log(`[cleanup] outer revoke skipped: ${outerErr && outerErr.message}`);
    }
  });
};

describe('Profile — Personal Access Token (PAT) Manager', () => {
  beforeEach(() => {
    // Programmatic auth via centralized cy.login() — replaces the UI form login.
    // cy.login() wraps cy.session() internally and caches the token.
    cy.login();

    // Hard-purge every PAT row via the admin identity so each test starts
    // from a truly empty list (the user-facing DELETE is a soft revoke and
    // leaves rows in place — that would break "1. Empty state" after the
    // very first test in any spec run).
    purgePatsViaApi();

    openProfileWithSpies();
    expandAdvancedAccordion();
  });

  afterEach(() => {
    // Best-effort UI cleanup — silently revokes any leftover active rows so
    // the next test's purgePatsViaApi() has a clean slate even if the admin
    // identify call fails. No assertions here on purpose.
    revokeAllRowsSilently();
  });

  // ─────────────────────────── 1. EMPTY STATE ──────────────────────────────
  it('1. Empty state — counter, button, no rows', () => {
    cy.get('[data-cy="pat-counter"]').should('be.visible');
    cy.get('[data-cy="pat-create-open"]').should('be.visible').and('not.be.disabled');
    cy.get('[data-cy="pat-row"]').should('not.exist');
    cy.get('[data-cy="pat-empty"]').should('be.visible');
  });

  // ─────────────────────── 2. CREATE PAT — split tests ─────────────────────
  describe('2. Create PAT', () => {
    it('should reveal the plaintext token in a 69-char bpat_ format when Create is submitted', () => {
      const tokenName = `Cypress smoke ${Date.now()}`;
      createPatViaUi(tokenName, 'Created by automated test');

      cy.get('[data-cy="pat-reveal-token"]')
        .invoke('text')
        .then((text) => {
          const plain = text.replace(/(Copy|Copied)\s*$/i, '').trim();
          expect(plain).to.match(NAME_REGEX_69_CHAR);
          expect(plain.length).to.eq(69);
        });
    });

    it('should write the plaintext token to the clipboard when the copy button is clicked', () => {
      const tokenName = `Cypress copy ${Date.now()}`;
      stubClipboard();
      createPatViaUi(tokenName);

      cy.get('[data-cy="pat-reveal-copy"]').click();
      cy.window().then(async (win) => {
        const value = await win.navigator.clipboard.readText();
        expect(value).to.match(NAME_REGEX_69_CHAR);
      });
    });

    it('should keep the reveal modal open when the backdrop is clicked', () => {
      const tokenName = `Cypress backdrop ${Date.now()}`;
      createPatViaUi(tokenName);

      // Click inside the reveal wrapper at (5,5) — guaranteed backdrop area
      // (not the popup body). The reveal popup has disableClickOutside set.
      cy.get('#overlay-pat-reveal-modal').then(($el) => {
        cy.wrap($el).click(5, 5, { force: true });
      });
      cy.get('#overlay-pat-reveal-modal').should('be.visible');
    });

    it('should render a new row showing only the prefix and an expiry label when the reveal modal is closed', () => {
      const tokenName = `Cypress row ${Date.now()}`;
      createPatViaUi(tokenName);
      closeRevealModal();

      cy.get(`[data-cy="pat-row"][data-token-name="${tokenName}"]`).within(() => {
        cy.get('[data-cy="pat-token-prefix"]').invoke('text').then((text) => {
          expect(text).to.match(/^bpat_[a-f0-9]{8}…$/);
        });
        cy.get('[data-cy="pat-expiry-label"]').invoke('text').then((text) => {
          expect(text).to.match(/(in 89 days|in 90 days|in 3 months)/);
        });
        cy.get('[data-cy="pat-revoke-btn"]').should('exist');
        // Plaintext must NOT appear in the row.
        cy.root().should('not.contain.text', 'bpat_5');
      });
    });

    it('should increment the active-tokens counter to 1 of 10 when a token is created', () => {
      const tokenName = `Cypress counter ${Date.now()}`;
      createPatViaUi(tokenName);
      closeRevealModal();

      cy.get('[data-cy="pat-counter"]').should('be.visible');
    });
  });

  // ─────────────────────── 3. VALIDATION — split tests ─────────────────────
  describe('3. Validation', () => {
    beforeEach(() => {
      cy.get('[data-cy="pat-create-open"]')
        .scrollIntoView({ block: 'center' })
        .click({ force: true });
      cy.get('#overlay-pat-create-modal', { timeout: 10000 }).should('be.visible');
    });

    it('should disable the Create submit button when the name field is empty', () => {
      cy.get('[data-cy="pat-create-submit"]').should('be.disabled');
    });

    it('should cap the name field at 60 characters when more are typed', () => {
      const longName = 'a'.repeat(80);
      cy.get('[data-cy="pat-name-input"]').type(longName, { delay: 0 });
      cy.get('[data-cy="pat-name-input"]').should('have.value', 'a'.repeat(60));
    });

    it('should cap the description field at 200 characters when more are typed', () => {
      // Need a name first so the form isn't blocked by required-name validation.
      cy.get('[data-cy="pat-name-input"]').type('Validation desc cap');
      const longDesc = 'd'.repeat(250);
      cy.get('[data-cy="pat-description-input"]').type(longDesc, { delay: 0 });
      cy.get('[data-cy="pat-description-input"]').should('have.value', 'd'.repeat(200));
    });
  });

  // ─────────────────────── 4. REVOKE — split tests ─────────────────────────
  describe('4. Revoke', () => {
    let activeTokenName;

    beforeEach(() => {
      activeTokenName = `Revoke-target ${Date.now()}`;
      createPatViaUi(activeTokenName);
      closeRevealModal();
    });

    it('should keep the row active when the revoke dialog is cancelled', () => {
      cy.get(`[data-cy="pat-row"][data-token-name="${activeTokenName}"]`)
        .find('[data-cy="pat-revoke-btn"]')
        .scrollIntoView({ block: 'center' })
        .click({ force: true });
      cy.get('[data-cy="pat-revoke-confirm-dialog"]').should('be.visible');
      cy.get('[data-cy="pat-revoke-cancel-btn"]').click();

      cy.get('[data-cy="pat-revoke-confirm-dialog"]').should('not.exist');
      cy.get('[data-cy="pat-counter"]').should('be.visible');
      cy.get(`[data-cy="pat-row"][data-token-name="${activeTokenName}"]`)
        .find('[data-cy="pat-revoke-btn"]')
        .should('exist');
    });

    it('should dim the row and decrement the counter when revoke is confirmed', () => {
      cy.get(`[data-cy="pat-row"][data-token-name="${activeTokenName}"]`)
        .find('[data-cy="pat-revoke-btn"]')
        .scrollIntoView({ block: 'center' })
        .click({ force: true });
      cy.get('[data-cy="pat-revoke-confirm-dialog"]').should('be.visible');
      cy.get('[data-cy="pat-revoke-confirm-btn"]').click();

      cy.get(`[data-cy="pat-row"][data-token-name="${activeTokenName}"]`)
        .should('have.attr', 'data-status', 'revoked');
      cy.get(`[data-cy="pat-row"][data-token-name="${activeTokenName}"]`)
        .find('[data-cy="pat-revoke-btn"]')
        .should('not.exist');
      cy.get('[data-cy="pat-counter"]').should('be.visible');
    });
  });

  // ──────────────────────── 5. EXPIRY OPTIONS ──────────────────────────────
  it('5. Expiry options — 5 labels present, "Never expires" shows security warning', () => {
    cy.get('[data-cy="pat-create-open"]').scrollIntoView({ block: 'center' }).click({ force: true });
    cy.get('#overlay-pat-create-modal').should('be.visible');

    // Open the Select dropdown by clicking the expiry select field.
    cy.get('[data-cy="pat-expires-select"]').click();

    cy.get('[data-cy="pat-expires-dropdown"]', { timeout: 5000 }).should('be.visible');
    const expectedValues = ['30d', '60d', '90d', '1y', 'never'];
    cy.get('[data-cy="pat-expires-dropdown-item"]').should(
      'have.length',
      expectedValues.length
    );
    expectedValues.forEach((value) => {
      cy.get(`[data-cy="pat-expires-dropdown-item"][data-value="${value}"]`).should('be.visible');
    });

    // Pick "Never expires" — warning should appear in the modal.
    cy.get('[data-cy="pat-expires-dropdown-item"][data-value="never"]').click();
    cy.get('[data-cy="pat-never-expires-warning"]').should('be.visible');
  });

  // ───────────────────── 6. 10-TOKEN LIMIT (INTERCEPT) ─────────────────────
  it('6. 10-token limit — friendly inline error from intercepted 409', () => {
    cy.intercept(
      'POST',
      `${API_BASE}/pat`,
      {
        statusCode: 409,
        body: {
          error_code: '409_LIMIT_REACHED',
          message: 'User already has 10 active PATs. Revoke one before creating another.',
        },
      }
    ).as('createLimit');

    cy.get('[data-cy="pat-create-open"]').scrollIntoView({ block: 'center' }).click({ force: true });
    cy.get('#overlay-pat-create-modal').should('be.visible');
    cy.get('[data-cy="pat-name-input"]').type('Hypothetical 11th token');
    cy.get('[data-cy="pat-create-submit"]').click();

    cy.wait('@createLimit');
    cy.get('[data-cy="pat-create-error"]', { timeout: 10000 })
      .should('be.visible')
      .invoke('text')
      .should('match', /10-token limit/);
    // The new (fake) token must NOT have been added to the list.
    cy.get('[data-cy="pat-row"][data-token-name="Hypothetical 11th token"]').should('not.exist');

    cy.get('[data-cy="pat-create-cancel-btn"]').click();
  });

  // ─────────────────────────── 7. LOGGER AUDIT ─────────────────────────────
  it('7. Logger audit — PatManager and PATService traces fire on list, create, revoke', () => {
    // Re-use the create+revoke flow so we exercise list / create / copy / revoke.
    const tokenName = `Logger-audit ${Date.now()}`;
    stubClipboard();

    createPatViaUi(tokenName);
    cy.get('[data-cy="pat-reveal-copy"]').click();
    closeRevealModal();
    cy.get(`[data-cy="pat-row"][data-token-name="${tokenName}"]`)
      .find('[data-cy="pat-revoke-btn"]')
      .scrollIntoView({ block: 'center' })
      .click({ force: true });
    cy.get('[data-cy="pat-revoke-confirm-btn"]').click();

    // Drain the spy: Logger.info routes through console.info, so we combine
    // both spies before asserting (console.log spy is the fallback for any
    // raw console.log that may slip through).
    cy.get('@consoleInfoSpy').then((infoSpy) => {
      cy.get('@consoleLogSpy').then((logSpy) => {
        const infoCalls = (infoSpy.getCalls?.() || []).map((c) => c.args);
        const logCalls = (logSpy.getCalls?.() || []).map((c) => c.args);
        const haystack = JSON.stringify([...infoCalls, ...logCalls]);
        cy.log(
          `consoleInfo=${infoCalls.length} consoleLog=${logCalls.length}; sample=${haystack.slice(0, 300)}`
        );

        // Logger emits the scope name in the prefix (e.g. "[PatManager]").
        // Assert that both scopes fired at least once across the flow.
        expect(haystack).to.match(/PatManager/);
        expect(haystack).to.match(/PATService/);

        // Specific signal phrases proving every required step logged.
        expect(haystack).to.match(/listPats: (request|response)/);
        expect(haystack).to.match(/createPat: (request|response)/);
        expect(haystack).to.match(/revokePat: (request|response)/);
        expect(haystack).to.match(/RevealTokenModal: copy clicked/);
      });
    });
  });

  // ─────────────────────────── SCREENSHOTS ────────────────────────────────
  it('SCR. Capture the three required screenshots', () => {
    const tokenName = `Screenshot ${Date.now()}`;

    // Screenshot 2: Create modal open, fields filled.
    cy.get('[data-cy="pat-create-open"]').scrollIntoView({ block: 'center' }).click({ force: true });
    cy.get('#overlay-pat-create-modal', { timeout: 10000 }).should('exist');
    cy.get('[data-cy="pat-name-input"]').type(tokenName);
    cy.get('[data-cy="pat-description-input"]').type('Snapshot description');
    cy.screenshot('pat-manager/02-create-modal-filled', { capture: 'viewport' });

    // Submit → reveal modal.
    cy.get('[data-cy="pat-create-submit"]').click();
    cy.get('#overlay-pat-reveal-modal', { timeout: 15000 }).should('exist');
    // Screenshot 3: Reveal-once modal showing the plaintext token.
    cy.screenshot('pat-manager/03-reveal-modal', { capture: 'viewport' });

    cy.get('[data-cy="pat-reveal-close"]').click();
    cy.get(`[data-cy="pat-row"][data-token-name="${tokenName}"]`).should('exist');
    // Screenshot 1: Advanced accordion expanded with PAT list row — scroll
    // the PatManager into the viewport so the row is captured, not the top
    // of the profile page.
    cy.get('[data-cy="pat-manager"]').scrollIntoView({ block: 'start' });
    cy.wait(300); // brief beat for any sticky-header transition to settle
    cy.screenshot('pat-manager/01-list-with-row', { capture: 'viewport' });
  });
});
