/**
 * E2E — COMP-2548: the AI token counter shows a LOADING SPINNER (never a "0"
 * flash) while the balance is fetched fresh on every page load, and there is NO
 * localStorage cache — so the count is always server-fresh.
 *
 * The fix (landing-composer, branch `fix/comp-2548-token-count-zero-flash`):
 *   - `contexts/general-store.tsx` seeds `aiTokensLoading = true` (and `aiTokens = 0`)
 *     so the counter starts in the loading state on every mount.
 *   - `custom-hooks/use-token.tsx` fetches the balance fresh from
 *     `GET /ai/usage/budget` on mount, then sets `aiTokens` and flips
 *     `aiTokensLoading -> false` in the `.finally` of every branch. There is NO
 *     write to a localStorage cache — the previous `aiTokenBalance` key was removed.
 *   - `prefabs/ai-token/AIToken.tsx` renders, while `aiTokensLoading` is true, a
 *     spinner `<WCircularProgress data-test-id="ai-token-loading" />`; once loading
 *     resolves it renders `<span data-test-id="ai-token-count">{aiTokens}</span>`.
 *     While loading, the count <span> does NOT exist at all — so "0" can never be
 *     painted during the transition.
 *
 * Why this replaces the old cache-hydration spec:
 *   The prior model hydrated `aiTokens` from a localStorage cache to avoid a
 *   "0-flash". That cache is gone. The 0-flash is now prevented by the spinner,
 *   and staleness (the exact user-reported bug: a post-purchase refresh showing
 *   the OLD count) is impossible because there is nothing cached to go stale.
 *
 * Determinism / data-agnostic:
 *   The real balance is unknown on a freshly-seeded account, so every
 *   `/ai/usage/budget` response is stubbed to a KNOWN value with a controlled
 *   delay. No project id, identity, or balance is hardcoded against the
 *   environment — the authenticated top-bar (which renders <AIToken/>) is reached
 *   via `cy.login()` + `cy.visit('/projects')` and the balance is injected at
 *   runtime. The counter renders identically in the top bar across the dashboard
 *   and the editor, so the dashboard is the most stable, data-agnostic surface.
 *
 * Non-vacuity:
 *   The spinner assertion uses a deliberate multi-second intercept delay. If the
 *   spinner element were removed from the build, `[data-test-id="ai-token-loading"]`
 *   would never appear and the `.should('be.visible')` would fail — the test can
 *   fail, so a pass is meaningful.
 */

const TOKEN_KEY = 'aiTokenBalance'; // the removed cache key — must never be written
const BUDGET_ROUTE = '**/ai/usage/budget*';

const budgetBody = (allowance) => ({
  ok: true,
  allowance,
  monthlyTokenQuota: 0,
  monthlyTokenUsed: 0,
  monthlyTokenRemaining: 0,
});

// Serve a known balance after `delay` ms so the pending (spinner) state is
// observable for long enough for Cypress' retry queue to catch it.
const stubBudget = (allowance, delay = 2500) =>
  cy.intercept('GET', BUDGET_ROUTE, {
    statusCode: 200,
    body: budgetBody(allowance),
    delay,
  });

// The top bar renders AIToken twice — the desktop instance and a hidden
// (`display:none`) mobile-actions instance. Target the VISIBLE one via `:visible`
// so visibility assertions exercise the counter the user actually sees.
const spinner = () =>
  cy.get('[data-test-id="ai-token-loading"]:visible', { timeout: 20000 });

const tokenCount = () =>
  cy.get('[data-test-id="ai-token-count"]:visible', { timeout: 20000 }).first();

// Reach the authenticated dashboard top-bar (which renders <AIToken/>) with a
// known, delayed budget response so the spinner -> value transition is
// deterministic. Data-agnostic: no project id is referenced — the top-bar token
// renders for any authenticated, non-anonymous user on /projects.
const openDashboardWithBudget = (allowance, delay) => {
  stubBudget(allowance, delay).as('budget');
  cy.login();
  cy.visit('/projects');
};

describe('COMP-2548 — AI token counter shows a loading spinner, fetches fresh, never flashes 0', () => {
  it('M1: on load the spinner shows while the balance is pending, then resolves to the fresh value and never renders 0', () => {
    const SEED = 4242;

    // ACTION: load the dashboard with a long-delayed budget response so the
    // pending (loading) window comfortably outlasts app bootstrap + AIToken mount
    // and Cypress' retry queue reliably catches the spinner (non-vacuity relies on
    // this delay — a build without the spinner would still never satisfy the get).
    openDashboardWithBudget(SEED, 8000);

    // AFTER (pending): the spinner is visible and the count <span> does not exist
    // yet — so no "0" can be painted during the transition (the 0-flash guard).
    spinner().should('be.visible');
    cy.get('[data-test-id="ai-token-count"]').should('not.exist');

    // Let the fetch resolve.
    cy.wait('@budget');

    // AFTER (resolved): the count shows the fresh server value, the spinner is
    // gone, and the value was never "0".
    tokenCount().should('have.text', String(SEED)).and('not.have.text', '0');
    cy.get('[data-test-id="ai-token-loading"]').should('not.exist');
  });

  it('M2: after an in-session balance change, a reload shows the FRESH value (5100), not the previous one (100) — proving the removed cache', () => {
    // First load: the account currently has 100.
    openDashboardWithBudget(100, 500);
    tokenCount().should('have.text', '100');

    // Simulate the user buying 5000 tokens: the backend now reports 5100. If any
    // stale cache survived, the reload would still show 100 (the original bug).
    stubBudget(5100, 500).as('budgetAfterPurchase');

    // ACTION: refresh the page (a full reload resets the once-per-user fetch
    // guard, so the balance is re-fetched fresh).
    cy.reload();

    // AFTER: the counter reflects the fresh, server-authoritative balance.
    cy.wait('@budgetAfterPurchase');
    tokenCount().should('have.text', '5100').and('not.have.text', '100');
  });

  it('N1: no aiTokenBalance localStorage cache key is written after a load (the cache was removed)', () => {
    openDashboardWithBudget(777, 300);
    // Wait for the fetch to fully settle so any (erroneous) cache write would
    // already have happened.
    tokenCount().should('have.text', '777');

    cy.window()
      .its('localStorage')
      .invoke('getItem', TOKEN_KEY)
      .should('be.null');
  });
});
