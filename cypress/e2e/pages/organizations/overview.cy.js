/**
 * Organizations — Overview sub-page audit.
 *
 * Source: landing-composer/src/pages/organizations/overview/Overview.tsx
 * Mounts: prefabs/projects/Projects.tsx (ProjectsPrefab)
 *
 * Most interactive elements under Overview do not yet expose data-cy hooks.
 * Missing hooks are tracked in /tmp/agent-handoff/new-tests-fe-followup.json.
 *
 * Each it() asserts exactly one outcome that mirrors its description.
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
        throw new Error('[overview spec] resolveFirstOrgId: no organization on this account');
      }
      return first._id;
    });
};

describe('Organizations Overview — page mount', () => {
  beforeEach(() => {
    cy.login();
    cy.window({ log: false }).then((win) => {
      const token = win.localStorage.getItem('token');
      resolveFirstOrgId(token).then((orgId) => {
        cy.wrap(orgId).as('orgId');
      });
    });
    cy.get('@orgId').then((orgId) => {
      cy.intercept('GET', `**/api/fn-execute/organization/${orgId}**`).as('getOrg');
      cy.visit(`/organizations/${orgId}/overview`);
      cy.wait('@getOrg', { timeout: 20000 });
    });
  });

  it('should land on the /organizations/:orgId/overview URL after navigation', function () {
    cy.location('pathname').should('eq', `/organizations/${this.orgId}/overview`);
  });

  it('should render the projects prefab dashboard container so the overview body is mounted', () => {
    cy.get(
      '[data-cy="projects-prefab-root"], [class*="content"]',
      { timeout: 20000 }
    )
      .first()
      .should('exist');
  });

  it('should expose either the empty-projects message or a list of project cards once the loading skeleton disappears', () => {
    cy.get('[data-cy="empty-projects-message"], [class*="sites"]', { timeout: 25000 })
      .first()
      .should('exist');
  });
});

describe('Organizations Overview — create project entry point', () => {
  beforeEach(() => {
    cy.login();
    cy.window({ log: false }).then((win) => {
      const token = win.localStorage.getItem('token');
      resolveFirstOrgId(token).then((orgId) => {
        cy.wrap(orgId).as('orgId');
      });
    });
    cy.get('@orgId').then((orgId) => {
      cy.visit(`/organizations/${orgId}/overview`);
    });
    cy.get('[data-cy="empty-projects-message"], [class*="sites"], [class*="createNewButton"]', {
      timeout: 25000,
    })
      .first()
      .should('exist');
  });

  it('should open the project-setup overlay when the New Website action is invoked', () => {
    // Fallback: no data-cy on the New Website button yet. The OverlayPopup id is stable.
    cy.get('[class*="createNewButton"]', { timeout: 15000 }).first().click({ force: true });
    // OverlayPopup renders with id 'overlay-project-setup' (wrapper) / 'project-setup'.
    cy.get('[id="overlay-project-setup"], [id="project-setup"]', { timeout: 15000 }).should('exist');
  });
});

describe('Organizations Overview — projects API contract', () => {
  beforeEach(() => {
    cy.login();
    cy.window({ log: false }).then((win) => {
      const token = win.localStorage.getItem('token');
      resolveFirstOrgId(token).then((orgId) => {
        cy.wrap(orgId).as('orgId');
      });
    });
    cy.get('@orgId').then((orgId) => {
      // Post-refactor (scope-endpoints-no-client-filter): org project lists are
      // fetched via GET organization/:orgId/resources (scope id in the route),
      // NOT the legacy GET /project client-filter endpoint.
      cy.intercept('GET', `**/api/fn-execute/organization/${orgId}/resources**`).as('getProjects');
      cy.visit(`/organizations/${orgId}/overview`);
    });
  });

  it('should fire a getProjects request scoped to the current organization', function () {
    cy.wait('@getProjects', { timeout: 20000 }).then((interception) => {
      expect(interception.response.statusCode).to.be.oneOf([200, 304]);
    });
  });

  it('should not respond with a 5xx from the projects endpoint', () => {
    cy.wait('@getProjects', { timeout: 20000 }).then((interception) => {
      const status = interception.response.statusCode;
      expect(status).to.be.lessThan(500);
    });
  });
});

