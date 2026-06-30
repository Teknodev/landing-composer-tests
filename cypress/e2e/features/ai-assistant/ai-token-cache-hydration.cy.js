/**
 * E2E — COMP-2548: the AI token counter must NOT flash "0" on page refresh.
 *
 * The fix (landing-composer):
 *   - `contexts/general-store.tsx` lazily hydrates `aiTokens` initial state from
 *     localStorage key `aiTokenBalance` (STORAGE_KEY.AI_TOKEN_BALANCE), falling
 *     back to 0 only when nothing valid is cached.
 *   - `custom-hooks/use-token.tsx` writes the freshly-fetched balance to that same
 *     localStorage key after every successful `/ai/usage/budget` fetch.
 *   - The counter renders in `prefabs/ai-token/AIToken.tsx` as `<span>{aiTokens}</span>`.
 *
 * Selector note:
 *   The counter `<span>` carries `data-test-id="ai-token-count"` (AIToken.tsx), so this
 *   spec targets the value directly via that stable hook.
 *
 * Determinism / data-agnostic:
 *   The real balance is unknown on a freshly-seeded account, so every load's
 *   `/ai/usage/budget` response is stubbed to a KNOWN value. No project id, identity,
 *   or balance is hardcoded against the environment — the authenticated top-bar
 *   (which renders <AIToken/>) is reached via `cy.login()` + `cy.visit('/projects')`
 *   and the balance is injected at runtime. The counter renders identically in the
 *   top bar across the dashboard and the editor, so the dashboard is the most
 *   stable, data-agnostic surface to exercise the refresh-hydration behavior.
 */

const TOKEN_KEY = 'aiTokenBalance';
const SEED_BALANCE = 4242; // known non-zero balance served on first load

const budgetBody = (allowance) => ({
  ok: true,
  allowance,
  monthlyTokenQuota: 0,
  monthlyTokenUsed: 0,
  monthlyTokenRemaining: 0,
});

// Serve a known balance immediately (used on the first editor load to seed cache).
const stubBudget = (allowance) =>
  cy.intercept('GET', '**/ai/usage/budget*', {
    statusCode: 200,
    body: budgetBody(allowance),
  });

// STALL the budget response so the network can provide NO value within the test.
// Any value the counter shows can therefore ONLY come from the localStorage cache
// (or the 0 fallback) — this is what makes the "no 0-flash" assertion deterministic
// and immune to React mount-timing races.
const stallBudget = () =>
  cy.intercept('GET', '**/ai/usage/budget*', {
    statusCode: 200,
    body: budgetBody(99999),
    delay: 60000,
  });

// The counter <span> carries a stable data-test-id (AIToken.tsx).
const tokenCount = () =>
  cy.get('[data-test-id="ai-token-count"]', { timeout: 20000 }).first();

// Reach the authenticated dashboard top-bar (which renders <AIToken/>), serving a
// known budget so the counter + cache are deterministic. Data-agnostic: no project
// id is referenced — the top-bar token renders for any authenticated, non-anonymous
// user on /projects.
const openDashboardWithBudget = (allowance) => {
  stubBudget(allowance).as('budgetFirst');
  cy.login();
  cy.visit('/projects');
};

describe('COMP-2548 — AI token counter hydrates from cache (no 0-flash on refresh)', () => {
  it('M1: fresh fetch caches the balance, then reload hydrates from cache and never flashes 0', () => {
    // First load: serve a known balance so the cache is seeded deterministically.
    openDashboardWithBudget(SEED_BALANCE);

    // BEFORE → counter shows the freshly-fetched value...
    tokenCount().should('have.text', String(SEED_BALANCE));

    // ...and the successful fetch persisted it to localStorage (the cache-write
    // mutation owned by use-token.tsx).
    cy.window()
      .its('localStorage')
      .invoke('getItem', TOKEN_KEY)
      .should('eq', String(SEED_BALANCE));

    // For the reload, STALL the network. With no network value available, the only
    // way the counter can show SEED_BALANCE at first paint is cache hydration. An
    // unfixed build would render 0 here (and stay 0 while the request is pending).
    stallBudget().as('budgetStalled');

    // ACTION
    cy.reload();

    // AFTER → counter shows the cached value immediately and never 0.
    tokenCount().should('have.text', String(SEED_BALANCE)).and('not.have.text', '0');
  });

  it('N1: no cached balance → counter falls back to 0 (no NaN/empty/crash) while fetch is pending', () => {
    openDashboardWithBudget(SEED_BALANCE);
    tokenCount().should('have.text', String(SEED_BALANCE));

    // Remove the cache, then reload with a stalled network so the fallback branch
    // (nothing cached → 0) is observable before any fetch could resolve.
    cy.window().then((win) => win.localStorage.removeItem(TOKEN_KEY));
    stallBudget().as('budgetStalled');

    cy.reload();

    tokenCount().should('have.text', '0');
  });

  it('N2: corrupt/unparseable cached balance → counter falls back to 0 (Number.isFinite guard)', () => {
    openDashboardWithBudget(SEED_BALANCE);
    tokenCount().should('have.text', String(SEED_BALANCE));

    // Poison the cache with a non-numeric value, then reload with a stalled network.
    cy.window().then((win) => win.localStorage.setItem(TOKEN_KEY, 'not-a-number'));
    stallBudget().as('budgetStalled');

    cy.reload();

    tokenCount().should('have.text', '0');
  });
});
