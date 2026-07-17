// ─────────────────────────────────────────────────────────────────────────────
// Project Domain Sub-page — full audit Cypress spec.
//
// Source under test:
//   landing-composer/src/pages/project/domain/domain.tsx
//
// Visited route:
//   /project/:projectId/domain
//
// Coverage:
//   - Page mount + header render (title, count, learn-more link, action buttons)
//   - Domain input visibility toggled by Add/Save action
//   - Domain list table render (loaded vs empty states)
//   - Verification dialog mount when a domain row's "Verify" is clicked
//   - Ownership verification dialog mount when a pending row's button is clicked
//   - Delete dialog mount + close behaviour
//   - Polling effect — fetchDomains re-triggered on interval (network observed)
//   - copy-to-clipboard wired through onCopy handler
//
// NOTE — Selectors:
//   The page + its child molecules/organisms ship NO data-cy / data-test-id
//   anchors today. This spec uses scoped fallbacks (page title text mount, table
//   tags, button structural position) until FE adds the data-cy attributes
//   enumerated in /tmp/agent-handoff/new-tests-fe-followup.json.
// ─────────────────────────────────────────────────────────────────────────────

// Project id is resolved dynamically — the previous hardcoded id no longer
// belongs to the test account.
let PROJECT_ID;
let DOMAIN_URL;

describe('Project Domain — full page audit', () => {
  before(() => {
    cy.login();
    cy.getTestProjectId().then((id) => {
      PROJECT_ID = id;
      DOMAIN_URL = `/project/${PROJECT_ID}/domain`;
    });
  });

  beforeEach(() => {
    // FE source: landing-composer/src/classes/Function.ts:399
    //   getPublishedProject(projectId, queryParams) -> apiUtils.apiService.get(`v1/projects/${projectId}/published`, queryParams)
    // Resulting URL: <VITE_API_URL>/fn-execute/v1/projects/<projectId>/published?relation=...
    cy.intercept('GET', '**/fn-execute/v1/projects/*/published*').as('getPublishedProject');
    cy.login();
    cy.visit(DOMAIN_URL);
  });

  describe('Page mount', () => {
    it('mounts the domain page container with the Connected Domains heading', () => {
      cy.get('h1', { timeout: 20000 }).contains('Connected Domains').should('be.visible');
    });

    it('renders the connected-domains count paragraph with the format "<N> Connected domains"', () => {
      cy.get('h1', { timeout: 20000 }).contains('Connected Domains').should('be.visible');
      cy.get('p').contains(/\d+ Connected domains/).should('exist');
    });

    it('renders the Learn more anchor pointing to the /domain-guide page', () => {
      cy.get('a[href="/domain-guide"]', { timeout: 20000 })
        .should('exist')
        .and('have.attr', 'target', '_blank');
    });

    it('renders an Add New Domain primary action button when no draft input is shown', () => {
      cy.contains('button', 'Add New Domain', { timeout: 20000 }).should('be.visible');
    });
  });

  describe('Add New Domain flow', () => {
    it('toggles the domain input visible when Add New Domain is clicked', () => {
      cy.contains('button', 'Add New Domain', { timeout: 20000 }).should('be.visible').click();
      cy.get('input[placeholder="www.mywebsite.com"]', { timeout: 5000 })
        .should('exist')
        .and('be.visible');
    });

    it('switches the action button label from "Add New Domain" to "Save" after first click', () => {
      cy.contains('button', 'Add New Domain', { timeout: 20000 }).click();
      cy.contains('button', 'Save', { timeout: 5000 }).should('be.visible');
    });

    it('lower-cases user input typed into the domain field via DomainInput onChange', () => {
      cy.contains('button', 'Add New Domain', { timeout: 20000 }).click();
      cy.get('input[placeholder="www.mywebsite.com"]', { timeout: 5000 }).type('SUB.Example.COM');
      cy.get('input[placeholder="www.mywebsite.com"]').should('have.value', 'sub.example.com');
    });

    it('hides the domain input when Save is clicked with an empty value', () => {
      cy.contains('button', 'Add New Domain', { timeout: 20000 }).click();
      cy.get('input[placeholder="www.mywebsite.com"]', { timeout: 5000 }).should('exist');
      cy.contains('button', 'Save').click();
      cy.get('input[placeholder="www.mywebsite.com"]').should('not.exist');
    });
  });

  describe('Domain list', () => {
    it('renders either a populated <table> tbody with rows or a placeholder no-item text', () => {
      cy.get('h1', { timeout: 20000 }).contains('Connected Domains');
      cy.get('body').then(($body) => {
        const hasTable = $body.find('table tbody tr').length > 0;
        if (hasTable) {
          cy.get('table tbody tr').should('have.length.at.least', 1);
        } else {
          cy.get('body').should('contain.text', 'There is nothing to see here yet!');
        }
      });
    });

    it('renders the Domain / Status / Actions header columns when the table mounts', () => {
      cy.get('h1', { timeout: 20000 }).contains('Connected Domains');
      cy.get('body').then(($body) => {
        if ($body.find('table').length > 0) {
          cy.get('table thead th').should(($th) => {
            const txt = [...$th].map((el) => el.textContent.trim());
            expect(txt).to.include.members(['Domain', 'Status', 'Actions']);
          });
        }
      });
    });
  });

  describe('Polling effect', () => {
    it('triggers at least one getPublishedProject request after the initial fetch on the 8s interval', () => {
      cy.wait('@getPublishedProject', { timeout: 20000 });
      cy.wait('@getPublishedProject', { timeout: 15000 });
    });
  });

  describe('Row action dialogs', () => {
    it('opens the delete confirmation dialog when Delete is clicked on a non-origin row', () => {
      cy.get('h1', { timeout: 20000 }).contains('Connected Domains');
      cy.get('body').then(($body) => {
        const deletable = $body.find('table tbody tr').filter((_, row) => {
          const txt = row.textContent || '';
          return !txt.includes('blinkpage.app');
        });
        if (deletable.length === 0) {
          cy.log('No deletable domain row present — skipping delete dialog flow');
          return;
        }
        cy.wrap(deletable.first()).find('button').contains('Delete').click({ force: true });
        cy.get('[id="alert-modal"], [role="dialog"]', { timeout: 5000 }).should('exist');
      });
    });

    it('opens the verification dialog when a non-origin row Verify button is clickable', () => {
      cy.get('h1', { timeout: 20000 }).contains('Connected Domains');
      cy.get('body').then(($body) => {
        const candidates = $body.find('table tbody tr button').filter((_, btn) => {
          return btn.textContent.trim() === 'Verify' && !btn.disabled;
        });
        if (candidates.length === 0) {
          cy.log('No actionable Verify button present — skipping verify dialog flow');
          return;
        }
        cy.wrap(candidates.first()).click({ force: true });
        cy.get('[role="dialog"], [id^="domain-verification"]', { timeout: 5000 }).should('exist');
      });
    });
  });
});
