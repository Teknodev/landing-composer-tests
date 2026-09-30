import { loginToEditor } from '@support/editorTestHelper';

const BB_URL = `/project/${Cypress.env('TEST_PROJECT_ID')}/blockbuilder?component=TestComponent`;

describe('Playground Element Selection Across Tabs', () => {
  beforeEach(() => {
    loginToEditor();
    cy.visit(BB_URL);
    cy.get('[data-cy="bb-canvas-area"]', { timeout: 15000 }).should('be.visible');
  });

  it('should successfully select an element while in the Design tab, verifying the stale closure regression is fixed', () => {
    // 1. Drag a Container to root
    cy.get('[data-cy="bb-canvas-area"]').should('be.visible');
    cy.get('[data-cy="palette-item-Base.Container"]').should('be.visible').as('containerPaletteItem');
    cy.get('[data-cy="bb-root-drop-zone"]').should('be.visible').as('dropZone');
    cy.get('@containerPaletteItem').drag('@dropZone');

    // 2. Wait for it to render
    cy.get('[data-cy="bb-rendered-container"]').first().should('exist').as('containerElement');

    // 3. Click it so it's selected and Settings panel opens
    cy.get('@containerElement').click({ force: true });
    cy.get('[data-cy="tab-Content"]').should('be.visible');

    // 4. Switch to the DESIGN Tab
    cy.get('[data-cy="tab-Design"]').click({ force: true });
    
    // 5. Verify Design Tab is active by checking for a known design category
    cy.get('[data-cy="category-section-layout"]').should('be.visible');

    // 6. Click the Canvas Background (deselect)
    cy.get('[data-cy="bb-canvas-area"]').click('topRight', { force: true });
    
    // 7. Verify Settings panel is closed
    cy.get('[data-cy="category-section-layout"]').should('not.exist');

    // 8. CRITICAL FIX TEST: Click the container again while the UI still remembers the last tab was DESIGN
    // Prior to fix, the MemorizedSection held a stale closure and blocked this selection.
    cy.get('@containerElement').click({ force: true });

    // 9. Verify it successfully selects the element and opens the Settings panel (on Design tab)
    cy.get('[data-cy="category-section-layout"]').should('be.visible');
  });
});
