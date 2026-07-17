// ─────────────────────────────────────────────────────────────────────────────
// Project Cookie Manager — Full-audit spec for landing-composer/src/pages/project/cookie/CookieManager.tsx
//
// Scope: CookieManager left-panel PositionSelector (5 positions),
// device toggle (desktop/mobile), Save button → patchCookiePosition call.
//
// Notes:
//   - No data-cy attributes exist on the CookieManager tree. Followup file at
//     /tmp/agent-handoff/new-tests-fe-followup.json lists the required anchors.
//   - We rely on img[alt="..."] hooks emitted by the positions[] config and on
//     the position class names (top/bottom/right/left/center) on the preview.
// ─────────────────────────────────────────────────────────────────────────────

// Project id is resolved dynamically — the previous hardcoded id no longer
// belongs to the test account.
let PROJECT_ID;
let COOKIE_URL;

const POSITION_ALTS = ['Top Banner', 'Right Floating Box', 'Left Floating Box', 'Center Floating Box', 'Bottom Banner'];

describe('Project Cookie — Page Mount', () => {
  before(() => {
    cy.login();
    cy.getTestProjectId().then((id) => {
      PROJECT_ID = id;
      COOKIE_URL = `/project/${PROJECT_ID}/cookie`;
    });
  });

  beforeEach(() => {
    cy.login();
    cy.visit(COOKIE_URL);
  });

  it('renders the cookie route without redirecting to authentication', () => {
    cy.location('pathname', { timeout: 15000 }).should('include', `/project/${PROJECT_ID}/cookie`);
    cy.location('pathname').should('not.include', '/authentication');
  });

  it('renders five position template thumbnails (one per supported position)', () => {
    POSITION_ALTS.forEach((alt) => {
      cy.get(`img[alt="${alt}"]`, { timeout: 15000 }).should('exist');
    });
  });

  it('exposes a Save button on the left panel', () => {
    cy.contains('button', /^\s*save\s*$/i, { timeout: 15000 })
      .first()
      .should('exist');
  });
});

describe('Project Cookie — Position Selection', () => {
  beforeEach(() => {
    cy.login();
    cy.visit(COOKIE_URL);
  });

  it('updates the selected position when a different position thumbnail is clicked', () => {
    // Click the "Bottom Banner" position.
    cy.get('img[alt="Bottom Banner"]', { timeout: 15000 })
      .parents('[class*="positionBox"], [class*="selected"]')
      .first()
      .click({ force: true });

    // The preview area must contain a child whose class includes "bottom".
    cy.get('[class*="previewArea"]', { timeout: 10000 })
      .parent()
      .find('[class*="bottom"], [class*="Bottom"]')
      .should('exist');
  });

  it('updates the selected position when the Right Floating Box is clicked', () => {
    cy.get('img[alt="Right Floating Box"]', { timeout: 15000 })
      .parents('[class*="positionBox"]')
      .first()
      .click({ force: true });

    cy.get('[class*="previewArea"]', { timeout: 10000 })
      .parent()
      .find('[class*="right"], [class*="Right"]')
      .should('exist');
  });
});

describe('Project Cookie — Device Toggle', () => {
  beforeEach(() => {
    cy.login();
    cy.visit(COOKIE_URL);
  });

  it('toggles the preview device class between desktop and mobile on button click', () => {
    cy.get('[class*="rightPanel"][class*="desktop"], [class*="rightPanel"][class*="mobile"]', { timeout: 15000 })
      .first()
      .invoke('attr', 'class')
      .then((initialClass) => {
        cy.get('[class*="deviceIconBtn"]').first().click({ force: true });

        cy.get('[class*="rightPanel"][class*="desktop"], [class*="rightPanel"][class*="mobile"]')
          .first()
          .invoke('attr', 'class')
          .should('not.eq', initialClass);
      });
  });
});

describe('Project Cookie — Save', () => {
  beforeEach(() => {
    cy.intercept('PATCH', `**/v1/projects/${PROJECT_ID}**`).as('patchProject');
    cy.intercept('PUT', `**/v1/projects/${PROJECT_ID}**`).as('putProject');
    cy.intercept('POST', '**/fn-execute/patchCookiePosition**', { body: { ok: true } }).as(
      'patchCookiePosition'
    );
    cy.login();
    cy.visit(COOKIE_URL);
  });

  it('fires a save request to the cookie-position endpoint when Save is clicked', () => {
    cy.contains('button', /^\s*save\s*$/i, { timeout: 15000 })
      .first()
      .click({ force: true });

    cy.wait('@patchCookiePosition', { timeout: 15000 })
      .its('response.statusCode')
      .should('be.oneOf', [200, 204, 304]);
  });
});
