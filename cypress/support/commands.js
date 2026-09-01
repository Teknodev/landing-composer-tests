// ***********************************************
// Custom Cypress commands for Blinkpage E2E suite.
// ***********************************************

/**
 * Selects elements by data-cy attribute.
 * Usage: cy.getCy('signin-btn') => cy.get('[data-cy="signin-btn"]')
 */
Cypress.Commands.add('getCy', (value, options) => {
  return cy.get(`[data-cy="${value}"]`, options);
});

/**
 * Programmatic login via the Spica auth endpoint.
 *
 * - Reads credentials from Cypress env (see cypress.config.js):
 *     AUTH_USERNAME, AUTH_PASSWORD, API_URL
 * - POSTs { email, password } to ${API_URL}/fn-execute/v1/auth/login
 * - Persists the returned token to window.localStorage (key: 'token')
 *   so the editor's Authentication service picks it up on next visit.
 * - Wrapped in cy.session() keyed by the username so the session is
 *   cached across tests in the same run and not repeatedly re-issued.
 *
 * Usage:
 *   beforeEach(() => { cy.login(); });
 *
 * Optional overrides (rarely used — guest flows should NOT call cy.login()):
 *   cy.login({ username: 'someone@example.com', password: 'Secret1' });
 */
Cypress.Commands.add('login', (overrides = {}) => {
  const username = overrides.username || Cypress.env('AUTH_USERNAME');
  const password = overrides.password || Cypress.env('AUTH_PASSWORD');
  const apiUrl = overrides.apiUrl || Cypress.env('API_URL');

  if (!username || !password || !apiUrl) {
    throw new Error(
      '[cy.login] Missing required env: AUTH_USERNAME, AUTH_PASSWORD, API_URL. ' +
      'Define them in cypress.config.js env block.'
    );
  }

  cy.session(
    ['blinkpage-auth', username],
    () => {
      // Visit /authentication (NOT /) so we land on a static page tied to the
      // baseUrl origin without triggering Landing's handleDemo() which would
      // overwrite our real token with an anonymous one. cy.session() needs a
      // real window on this origin to capture localStorage.
      cy.visit('/authentication');

      cy.request({
        method: 'POST',
        url: `${apiUrl}/fn-execute/v1/auth/login`,
        body: { email: username, password },
        failOnStatusCode: true,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body).to.have.property('token');
        const token = response.body.token;

        cy.window({ log: false }).then((win) => {
          win.localStorage.setItem('token', token);
          // Clear anonymous flag so the editor treats this as a real user.
          win.localStorage.setItem('isAnonim', 'false');
        });

        // Hardening: call the same verify-token endpoint AppInitializer hits
        // on bootstrap. If the response is missing the shape the SPA expects
        // (specifically `user._id`) the suite must fail loudly here rather
        // than letting downstream visits redirect silently to "/". The SPA's
        // RoleBasedGuard depends on the auth bootstrap setting `user._id`
        // before any /project/:id/* route is visited.
        cy.request({
          method: 'POST',
          url: `${apiUrl}/fn-execute/v1/auth/verify-token`,
          body: { token },
          failOnStatusCode: true,
        }).then((verifyResponse) => {
          expect(verifyResponse.status, '[cy.login] verifyToken status').to.eq(200);
          const body = verifyResponse.body || {};
          const user = body.user || body;
          expect(user, '[cy.login] verifyToken response.user').to.be.an('object');
          expect(user, '[cy.login] verifyToken response.user._id').to.have.property('_id');
          if (!user.role_assignment) {
            // role_assignment may legitimately be absent for owners of
            // personal projects (the FE handles this via an ownership
            // short-circuit in RoleBasedGuard). Log so a future regression
            // shows up in the Cypress runner log rather than vanishing.
            // eslint-disable-next-line no-console
            console.warn(
              '[cy.login] verifyToken: user.role_assignment is empty (owner-only path will be used by RoleBasedGuard)'
            );
          }
        });

        // Dynamically discover a project the authenticated user actually
        // owns/has access to. Hardcoded project ids in specs break whenever
        // fixtures are reseeded or ownership changes; this resolves that by
        // calling the same GET /v1/projects endpoint the editor's
        // Function.getProjects() uses, picking the first non-deleted entry,
        // and parking it on Cypress.env('testProjectId') for cy.getTestProjectId().
        cy.request({
          method: 'GET',
          url: `${apiUrl}/fn-execute/v1/projects`,
          headers: { Authorization: token },
          failOnStatusCode: true,
        }).then((resourceResponse) => {
          const body = resourceResponse.body || [];
          const projects = Array.isArray(body) ? body : (body.data || []);
          if (!projects.length) {
            throw new Error(
              '[cy.login] GET /v1/projects returned zero projects — test fixture is broken. ' +
              'The authenticated user must own at least one non-deleted project.'
            );
          }
          // Prefer an active project to maximize hit-rate on FE guards that
          // check status; fall back to the first project if none are active.
          const firstActive = projects.find((p) => p && p.status === 'active');
          const chosen = firstActive || projects[0];
          const projectId = chosen._id || chosen.id;
          if (!projectId) {
            throw new Error(
              '[cy.login] GET /v1/projects project entry missing _id/id — ' +
              `received: ${JSON.stringify(chosen)}`
            );
          }
          Cypress.env('testProjectId', projectId);
          // eslint-disable-next-line no-console
          console.log(`[cy.login] testProjectId discovered: ${projectId}`);
          cy.log(`testProjectId discovered: ${projectId}`);
        });
      });
    },
    {
      // No custom validate — Cypress restores the captured localStorage on
      // each cy.session() call. If the token expires mid-suite, the next
      // cy.visit() will redirect to /authentication and the failure will be
      // visible. Re-running the suite refreshes the session.
      cacheAcrossSpecs: true,
    }
  );

  // Cypress.env survives across cy.session() cache-hit runs only within the
  // SAME spec file because each spec spawns a fresh Cypress.env(). After
  // cy.session restores from cache, the env may be empty — repopulate it
  // here on every cy.login() call so cy.getTestProjectId() never sees null.
  if (!Cypress.env('testProjectId')) {
    cy.request({
      method: 'POST',
      url: `${apiUrl}/fn-execute/v1/auth/login`,
      body: { email: username, password },
      failOnStatusCode: true,
    }).then((loginResp) => {
      const token = loginResp.body && loginResp.body.token;
      if (!token) {
        throw new Error('[cy.login] env-rehydrate: login response missing token');
      }
      cy.request({
        method: 'GET',
        url: `${apiUrl}/fn-execute/v1/projects`,
        headers: { Authorization: token },
        failOnStatusCode: true,
      }).then((resourceResponse) => {
        const body = resourceResponse.body || [];
        const projects = Array.isArray(body) ? body : (body.data || []);
        if (!projects.length) {
          throw new Error('[cy.login] env-rehydrate: zero projects on user');
        }
        const firstActive = projects.find((p) => p && p.status === 'active');
        const chosen = firstActive || projects[0];
        const projectId = chosen._id || chosen.id;
        Cypress.env('testProjectId', projectId);
        // eslint-disable-next-line no-console
        console.log(`[cy.login] env-rehydrate testProjectId: ${projectId}`);
      });
    });
  }
});

/**
 * Returns the dynamically discovered test project id (set by cy.login()).
 *
 * Why this exists:
 *   Specs used to hardcode '69f515295ac7bd7572f9590c' but that id no longer
 *   belongs to the test user — visits to /project/<that-id>/* redirected to
 *   "/" via RoleBasedGuard's no-access path, cascading failures across every
 *   pages/project/* spec. cy.login() now discovers a real owned project via
 *   GET /v1/projects and parks it on Cypress.env('testProjectId').
 *
 * Usage:
 *   beforeEach(() => {
 *     cy.login();
 *     cy.getTestProjectId().then((id) => {
 *       cy.visit(`/project/${id}/overview`);
 *     });
 *   });
 */
Cypress.Commands.add('getTestProjectId', () => {
  const id = Cypress.env('testProjectId');
  if (!id) {
    throw new Error(
      '[cy.getTestProjectId] testProjectId is unset — cy.login() must run first. ' +
      'Ensure beforeEach calls cy.login() before cy.getTestProjectId().'
    );
  }
  return cy.wrap(id, { log: false });
});

/**
 * Programmatically resolves a fresh auth token via the Spica login endpoint
 * and exposes it under the alias '@authToken' for downstream cy.request()
 * helpers.
 *
 * Why this exists:
 *   cy.login() relies on cy.session() to cache state. With testIsolation
 *   enabled (default in Cypress 12+), each test starts on about:blank.
 *   When the session restores from cache, the captured localStorage is bound
 *   to the captured origin (http://localhost:3000) but cy.window() before a
 *   cy.visit() points at about:blank — whose localStorage is empty. Specs
 *   that read window.localStorage.getItem('token') BEFORE visiting therefore
 *   see null on cache-hit runs (notably any spec that runs after the very
 *   first one in the suite). This is exactly what produced
 *   "resolveFirstOrgId: no organization on this account" in the teams/*
 *   specs while the organizations/* specs — which happen to alphabetically
 *   run first and benefit from the cache-miss path — worked fine.
 *
 * This command bypasses the window/localStorage round-trip entirely by
 * POSTing /fn-execute/v1/auth/login directly. It is intentionally cheap on
 * localhost and runs once per test that needs a token. Combine with
 * cy.login() (still needed so editor pages bootstrap with localStorage
 * populated) — they are complementary.
 *
 * Usage:
 *   beforeEach(() => {
 *     cy.login();
 *     cy.getAuthToken();        // yields token AND aliases as @authToken
 *     cy.get('@authToken').then((token) => { ... });
 *   });
 */
Cypress.Commands.add('getAuthToken', (overrides = {}) => {
  const username = overrides.username || Cypress.env('AUTH_USERNAME');
  const password = overrides.password || Cypress.env('AUTH_PASSWORD');
  const apiUrl = overrides.apiUrl || Cypress.env('API_URL');

  if (!username || !password || !apiUrl) {
    throw new Error(
      '[cy.getAuthToken] Missing required env: AUTH_USERNAME, AUTH_PASSWORD, API_URL.'
    );
  }

  return cy
    .request({
      method: 'POST',
      url: `${apiUrl}/fn-execute/v1/auth/login`,
      body: { email: username, password },
      failOnStatusCode: true,
    })
    .then((response) => {
      expect(response.status, '[cy.getAuthToken] login status').to.eq(200);
      expect(response.body, '[cy.getAuthToken] login body').to.have.property('token');
      return response.body.token;
    })
    .then((token) => cy.wrap(token, { log: false }).as('authToken'));
});
