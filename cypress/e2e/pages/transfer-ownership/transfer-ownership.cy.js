/**
 * Transfer Ownership page — full-audit E2E spec.
 *
 * Source: landing-composer/src/pages/transfer-ownership/TransferOwnership.tsx
 *
 * Mounted by FOUR routes:
 *   /organizations/:orgId/confirm-transfer?token=...
 *   /organizations/:orgId/accept-transfer?token=...
 *   /projects/:projectId/confirm-transfer?token=...
 *   /projects/:projectId/accept-transfer?token=...
 *
 * The component performs the corresponding transfer call on mount based on
 * URL shape, surfaces a `pending` -> `success`/`error` status message, and
 * then redirects (`/organizations` or `/projects`) after 2 s/3 s.
 *
 * NOTE — selector gap: the rendered status containers (`.loading`,
 * `.success`, `.error`) and their text use no data-cy attributes. We probe
 * via network intercepts + URL-redirect side-effects, which are stable.
 * The selector gap is flagged in /tmp/agent-handoff/new-tests-fe-followup.json.
 *
 * All four routes are nested under <AppInitializer />, so cy.login() is
 * required.
 */

describe('Transfer Ownership — organization confirm route', () => {
  beforeEach(() => {
    // FE source: landing-composer/src/classes/Function.ts:691 confirmOrganizationTransfer
    //   POST `/organization/${orgId}/transfer/confirm`
    // Final URL = `${VITE_API_URL}/fn-execute/organization/<orgId>/transfer/confirm`
    cy.intercept('POST', '**/fn-execute/organization/*/transfer/confirm*', {
      statusCode: 200,
      body: { message: 'Organization transfer confirmation completed successfully' },
    }).as('confirmOrg');
    cy.intercept('GET', '**/organization**', { statusCode: 200, body: [] }).as('listOrgs');
    cy.login();
    cy.visit('/organizations/test-org-id/confirm-transfer?token=fake-token-confirm');
  });

  it('should call the confirmOrganizationTransfer endpoint when the organization confirm-transfer route mounts with a token', () => {
    cy.wait('@confirmOrg', { timeout: 20000 }).its('response.statusCode').should('eq', 200);
  });

  it('should strip the token query parameter from the URL after the organization confirm-transfer call resolves', () => {
    cy.wait('@confirmOrg', { timeout: 20000 });
    cy.url({ timeout: 5000 }).should('not.include', 'token=');
  });

  it('should redirect away from the organization confirm-transfer route after a successful response', () => {
    cy.wait('@confirmOrg', { timeout: 20000 });
    cy.url({ timeout: 10000 }).should('not.include', '/confirm-transfer');
  });
});

describe('Transfer Ownership — organization accept route', () => {
  beforeEach(() => {
    // FE source: landing-composer/src/classes/Function.ts:694 acceptOrganizationTransfer
    //   POST `/organization/${orgId}/transfer/accept`
    // Final URL = `${VITE_API_URL}/fn-execute/organization/<orgId>/transfer/accept`
    cy.intercept('POST', '**/fn-execute/organization/*/transfer/accept*', {
      statusCode: 200,
      body: { message: 'Organization transfer request acceptance completed successfully' },
    }).as('acceptOrg');
    cy.intercept('GET', '**/organization**', { statusCode: 200, body: [] }).as('listOrgsAccept');
    cy.login();
    cy.visit('/organizations/test-org-id/accept-transfer?token=fake-token-accept');
  });

  it('should call the acceptOrganizationTransfer endpoint when the organization accept-transfer route mounts with a token', () => {
    cy.wait('@acceptOrg', { timeout: 20000 }).its('response.statusCode').should('eq', 200);
  });

  it('should strip the token query parameter from the URL after the organization accept-transfer call resolves', () => {
    cy.wait('@acceptOrg', { timeout: 20000 });
    cy.url({ timeout: 5000 }).should('not.include', 'token=');
  });

  it('should redirect away from the organization accept-transfer route after a successful response', () => {
    cy.wait('@acceptOrg', { timeout: 20000 });
    cy.url({ timeout: 10000 }).should('not.include', '/accept-transfer');
  });
});

describe('Transfer Ownership — project confirm route', () => {
  beforeEach(() => {
    // FE source: landing-composer/src/classes/Function.ts:702 confirmResourceTransfer
    //   POST `/v1/projects/${projectId}/transfer/confirm`
    // Final URL = `${VITE_API_URL}/fn-execute/v1/projects/<projectId>/transfer/confirm`
    cy.intercept('POST', '**/fn-execute/v1/projects/*/transfer/confirm*', {
      statusCode: 200,
      body: { message: 'Resource transfer request confirmation completed successfully' },
    }).as('confirmRes');
    cy.login();
    cy.visit('/projects/test-resource-id/confirm-transfer?token=fake-token-res-confirm');
  });

  it('should call the confirmResourceTransfer endpoint when the project confirm-transfer route mounts with a token', () => {
    cy.wait('@confirmRes', { timeout: 20000 }).its('response.statusCode').should('eq', 200);
  });

  it('should strip the token query parameter from the URL after the project confirm-transfer call resolves', () => {
    cy.wait('@confirmRes', { timeout: 20000 });
    cy.url({ timeout: 5000 }).should('not.include', 'token=');
  });

  it('should redirect away from the project confirm-transfer route after a successful response', () => {
    cy.wait('@confirmRes', { timeout: 20000 });
    cy.url({ timeout: 10000 }).should('not.include', '/confirm-transfer');
  });
});

describe('Transfer Ownership — project accept route', () => {
  beforeEach(() => {
    // FE source: landing-composer/src/classes/Function.ts:706 acceptResourceTransfer
    //   POST `/v1/projects/${projectId}/transfer/accept`
    // Final URL = `${VITE_API_URL}/fn-execute/v1/projects/<projectId>/transfer/accept`
    cy.intercept('POST', '**/fn-execute/v1/projects/*/transfer/accept*', {
      statusCode: 200,
      body: { message: 'Resource transfer request acceptance completed successfully' },
    }).as('acceptRes');
    cy.login();
    cy.visit('/projects/test-resource-id/accept-transfer?token=fake-token-res-accept');
  });

  it('should call the acceptResourceTransfer endpoint when the project accept-transfer route mounts with a token', () => {
    cy.wait('@acceptRes', { timeout: 20000 }).its('response.statusCode').should('eq', 200);
  });

  it('should strip the token query parameter from the URL after the project accept-transfer call resolves', () => {
    cy.wait('@acceptRes', { timeout: 20000 });
    cy.url({ timeout: 5000 }).should('not.include', 'token=');
  });

  it('should redirect away from the project accept-transfer route after a successful response', () => {
    cy.wait('@acceptRes', { timeout: 20000 });
    cy.url({ timeout: 10000 }).should('not.include', '/accept-transfer');
  });
});

describe('Transfer Ownership — token-less mount is a no-op', () => {
  beforeEach(() => {
    // Final URL = `${VITE_API_URL}/fn-execute/organization/<orgId>/transfer/confirm`
    cy.intercept('POST', '**/fn-execute/organization/*/transfer/confirm*').as('confirmOrgNoToken');
    cy.login();
    cy.visit('/organizations/test-org-id/confirm-transfer');
  });

  it('should not call confirmOrganizationTransfer when the organization confirm-transfer route mounts without a token query parameter', () => {
    // The component's performTransferAction returns early when token is null.
    // Give the page a beat to attempt any call, then assert none was made.
    cy.wait(1500);
    cy.get('@confirmOrgNoToken.all').should('have.length', 0);
  });
});

describe('Transfer Ownership — error response surfaces and redirects', () => {
  beforeEach(() => {
    // Final URL = `${VITE_API_URL}/fn-execute/organization/<orgId>/transfer/accept`
    cy.intercept('POST', '**/fn-execute/organization/*/transfer/accept*', {
      statusCode: 400,
      body: { message: 'Invalid transfer token' },
    }).as('acceptOrgErr');
    cy.login();
    cy.visit('/organizations/test-org-id/accept-transfer?token=expired-token');
  });

  it('should call the acceptOrganizationTransfer endpoint even when the backend will respond with an error', () => {
    cy.wait('@acceptOrgErr', { timeout: 20000 }).its('response.statusCode').should('eq', 400);
  });

  it('should strip the token query parameter from the URL after an error response on the organization accept-transfer route', () => {
    cy.wait('@acceptOrgErr', { timeout: 20000 });
    cy.url({ timeout: 5000 }).should('not.include', 'token=');
  });

  it('should redirect away from the organization accept-transfer route after an error response', () => {
    cy.wait('@acceptOrgErr', { timeout: 20000 });
    cy.url({ timeout: 10000 }).should('not.include', '/accept-transfer');
  });
});
