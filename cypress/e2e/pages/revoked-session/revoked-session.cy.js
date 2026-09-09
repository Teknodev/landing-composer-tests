const VERIFY_TOKEN_API = '**/fn-execute/v1/auth/verify-token*';

const PROJECTS_API = '**/fn-execute/v1/projects*';

describe('Revoked Session — Forced Logout', () => {
  beforeEach(() => {
    cy.login();
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
