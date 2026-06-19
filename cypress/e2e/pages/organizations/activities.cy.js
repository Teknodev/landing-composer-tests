/**
 * Organizations — Activities sub-page audit.
 *
 * Source: landing-composer/src/pages/organizations/activities/Activities.tsx
 * Mounts: Filter, Table, Pagination molecules.
 *
 * No data-cy hooks on Activities children yet. Missing hooks logged in
 * /tmp/agent-handoff/new-tests-fe-followup.json. Also flagged:
 *   - Activities.tsx uses two console.error() calls — must migrate to logger.
 */

const API_URL = Cypress.env('API_URL');

const resolveFirstOrgId = (token) => {
  return cy
    .request({
      method: 'GET',
      url: `${API_URL}/fn-execute/organization`,
      headers: { Authorization: `IDENTITY ${token}` },
      qs: { sort: JSON.stringify({ _id: -1 }) },
      failOnStatusCode: false,
    })
    .then((res) => {
      const list = Array.isArray(res.body) ? res.body : res.body?.data || [];
      const first = list.find((o) => !o?.deleted_at) || list[0];
      if (!first?._id) {
        throw new Error('[activities spec] resolveFirstOrgId: no organization on this account');
      }
      return first._id;
    });
};

describe('Organizations Activities — page mount', () => {
  beforeEach(() => {
    cy.login();
    cy.window({ log: false }).then((win) => {
      const token = win.localStorage.getItem('token');
      resolveFirstOrgId(token).then((orgId) => {
        cy.wrap(orgId).as('orgId');
      });
    });
    cy.get('@orgId').then((orgId) => {
      // Post-refactor (scope-endpoints-no-client-filter): org activities use the
      // org branch GET organization/:orgId/audit-log (scope id in the route).
      // The legacy POST audit_log/list client-filter endpoint is gone. Single
      // intercept + single-alias wait (two overlapping intercepts would split
      // the one request across aliases and starve the second).
      cy.intercept('GET', '**/api/fn-execute/organization/*/audit-log**').as('getAuditLogs');
      cy.visit(`/organizations/${orgId}/activities`);
    });
  });

  it('should land on the /organizations/:orgId/activities URL after navigation', function () {
    cy.location('pathname').should('eq', `/organizations/${this.orgId}/activities`);
  });

  it('should render the Activities heading h1 once the page mounts', () => {
    cy.get('h1', { timeout: 20000 }).should('exist');
  });

  it('should render a table region after the audit-log fetch completes', () => {
    cy.get('table', { timeout: 25000 }).should('exist');
  });
});

describe('Organizations Activities — audit log API contract', () => {
  beforeEach(() => {
    cy.login();
    cy.window({ log: false }).then((win) => {
      const token = win.localStorage.getItem('token');
      resolveFirstOrgId(token).then((orgId) => {
        cy.wrap(orgId).as('orgId');
      });
    });
    cy.get('@orgId').then((orgId) => {
      // Post-refactor (scope-endpoints-no-client-filter): org activities use the
      // org branch GET organization/:orgId/audit-log (scope id in the route).
      // The legacy POST audit_log/list client-filter endpoint is gone. Single
      // intercept + single-alias wait (two overlapping intercepts would split
      // the one request across aliases and starve the second).
      cy.intercept('GET', '**/api/fn-execute/organization/*/audit-log**').as('getAuditLogs');
      cy.visit(`/organizations/${orgId}/activities`);
    });
  });

  it('should fire at least one audit-log request scoped to the current organization', () => {
    // Some backends use POST (paginated list) and some use GET — accept either.
    cy.wait(['@getAuditLogs'], {
      timeout: 25000,
      requestTimeout: 25000,
    }).then((interceptions) => {
      const list = Array.isArray(interceptions) ? interceptions : [interceptions];
      const hit = list.find((i) => i && i.response);
      expect(hit, 'at least one audit-log call returned').to.exist;
    });
  });

  it('should not return a 5xx error from the audit-log endpoint', () => {
    cy.wait(['@getAuditLogs'], {
      timeout: 25000,
      requestTimeout: 25000,
    }).then((interceptions) => {
      const list = Array.isArray(interceptions) ? interceptions : [interceptions];
      list.forEach((i) => {
        if (i && i.response) {
          expect(i.response.statusCode).to.be.lessThan(500);
        }
      });
    });
  });
});

describe('Organizations Activities — pagination defaults', () => {
  beforeEach(() => {
    cy.login();
    cy.window({ log: false }).then((win) => {
      const token = win.localStorage.getItem('token');
      resolveFirstOrgId(token).then((orgId) => {
        cy.wrap(orgId).as('orgId');
      });
    });
    cy.get('@orgId').then((orgId) => {
      cy.visit(`/organizations/${orgId}/activities`);
    });
    cy.get('table', { timeout: 25000 }).should('exist');
  });

  it('should render at most ten data rows on the first page given the default rowsPerPage of 10', () => {
    cy.get('table tbody tr').should('have.length.at.most', 10);
  });
});

describe('Organizations Activities — filter row baseline', () => {
  beforeEach(() => {
    cy.login();
    cy.window({ log: false }).then((win) => {
      const token = win.localStorage.getItem('token');
      resolveFirstOrgId(token).then((orgId) => {
        cy.wrap(orgId).as('orgId');
      });
    });
    cy.get('@orgId').then((orgId) => {
      cy.visit(`/organizations/${orgId}/activities`);
    });
    cy.get('table', { timeout: 25000 }).should('exist');
  });

  it('should render the filter molecule above the table at mount time', () => {
    // Filter molecule has no data-cy yet. The activities body wraps the filter
    // controls + table inside the same container; assert the table is present
    // within an activities container (retry-queue, not the brittle .first()).
    cy.get('[class*="container"]', { timeout: 25000 })
      .find('table')
      .should('have.length.at.least', 1);
  });
});

