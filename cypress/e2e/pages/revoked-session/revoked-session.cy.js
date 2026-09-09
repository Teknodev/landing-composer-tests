/**
 * Revoked session — full audit Cypress spec.
 *
 * An account deletion revokes every open session. A tab that was already
 * authenticated must not keep working after that: the next `/fn-execute/`
 * response of 401 is caught by `useRequestTracker`'s PerformanceObserver,
 * which logs the user out and navigates to `/authentication`.
 *
 * A `verify-token` response of 404 is an intentional legacy safety net (not
 * a mistake) that also forces the same outcome via the auth bootstrap path.
 *
 * Source: landing-composer/src/custom-hooks/request-tracker.tsx:17-26
 *         landing-composer/src/prefabs/app-initializer/AppInitializer.tsx
 *
 * Note: a plain logged-out visitor (no prior session) still lands on
 * /landing, not /authentication — that case is intentionally NOT covered
 * here (see cy.login() below; every test starts from a real session).
 */

// FE source: landing-composer/src/classes/Function.ts:1402
//   verifyToken(token) -> apiUtils.apiService.post(`/v1/auth/verify-token`, { token })
// Resulting URL: <VITE_API_URL>/fn-execute/v1/auth/verify-token
const VERIFY_TOKEN_API = '**/fn-execute/v1/auth/verify-token*';

// FE source: landing-composer/src/classes/Function.ts:1396 (getMyProjects)
// Resulting URL: <VITE_API_URL>/fn-execute/v1/projects
const PROJECTS_API = '**/fn-execute/v1/projects*';

describe('Revoked Session — Forced Logout', () => {
  beforeEach(() => {
    cy.login();
    // The tracker-forced logout leaves an unhandled promise rejection in the
    // in-flight request (pre-existing app behavior, not under test here).
    cy.on('uncaught:exception', () => false);
  });

  it('N1: a protected page request that 401s from /fn-execute/ forces logout to /authentication', () => {
    cy.getTestProjectId().then((id) => {
      cy.visit(`/project/${id}/overview`);
    });
    cy.contains('body', /./, { timeout: 15000 });

    cy.intercept('GET', PROJECTS_API, {
      statusCode: 401,
      body: { message: 'Your session has expired. Please log in again.' },
    }).as('revoked');

    cy.reload();

    cy.wait('@revoked', { timeout: 15000 });
    cy.url({ timeout: 15000 }).should('include', '/authentication');
    cy.window({ log: false }).then((win) => {
      expect(win.localStorage.getItem('token')).to.be.null;
    });
  });

  it('N2: a verify-token 404 (legacy safety net) also forces logout to /authentication', () => {
    cy.intercept('POST', VERIFY_TOKEN_API, {
      statusCode: 404,
      body: { message: 'Not found' },
    }).as('verify404');

    cy.getTestProjectId().then((id) => {
      cy.visit(`/project/${id}/overview`);
    });

    cy.wait('@verify404', { timeout: 15000 });
    cy.url({ timeout: 15000 }).should('include', '/authentication');
  });

  it('N3: a page refresh in the revoked tab does not restore authenticated access', () => {
    cy.getTestProjectId().then((id) => {
      cy.visit(`/project/${id}/overview`);
    });
    cy.contains('body', /./, { timeout: 15000 });

    cy.intercept('GET', PROJECTS_API, {
      statusCode: 401,
      body: { message: 'Your session has expired. Please log in again.' },
    }).as('revoked');

    cy.reload();
    cy.wait('@revoked', { timeout: 15000 });
    cy.url({ timeout: 15000 }).should('include', '/authentication');

    cy.reload();
    cy.url({ timeout: 15000 }).should('not.include', '/project/');
  });
});
