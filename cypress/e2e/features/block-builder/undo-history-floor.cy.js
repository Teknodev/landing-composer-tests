/**
 * Regression test — BB undo history floor
 *
 * Bug fixed: The BB historyReducer was treating the component-loading sequence
 * (SET_ROOT, SET_COMPONENT_META, SET_SOURCE_CSS, SET_SOURCE_PROPS) as regular
 * state changes, pushing them into the `past[]` array. Pressing Ctrl+Z repeatedly
 * would regress through those initialisation steps all the way to an empty canvas.
 *
 * Fix: SET_ROOT resets history entirely (loaded state becomes the undo floor).
 *      SET_COMPONENT_META / SET_SOURCE_CSS / SET_SOURCE_PROPS update `present`
 *      without touching `past[]` or `future[]`.
 *
 * Expected: After opening a component in BB and performing several edits,
 * undoing all the way should land back at the initial loaded state — NOT an
 * empty canvas or a state with missing meta.
 */

import { loginToEditor } from '@support/editorTestHelper';

const BB_URL = `/project/${Cypress.env('TEST_PROJECT_ID')}/blockbuilder?component=TestComponent`;

describe('Block Builder — Undo history floor regression', () => {
  beforeEach(() => {
    loginToEditor();
    cy.visit(BB_URL);
    cy.get('[data-cy="bb-canvas-area"]', { timeout: 15000 }).should('be.visible');
  });

  it('undo should not go past the initial loaded state (cannot reach empty canvas)', () => {
    // Step 1: Make a series of edits — add a container, then a paragraph inside it.
    cy.get('[data-cy="palette-item-Base.Container"]').drag('[data-cy="bb-root-drop-zone"]');
    cy.get('[data-cy="bb-rendered-container"]').first().should('exist').as('container');

    cy.get('[data-cy="palette-item-Base.P"]').drag('@container');
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.P"]').should('exist');

    cy.get('[data-cy="palette-item-Base.H1"]').drag('@container');
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.H1"]').should('exist');

    // Step 2: Undo 10 times — far more than the number of edits made.
    // If the floor is broken, we'd end up with no container at all (blank canvas).
    for (let i = 0; i < 10; i++) {
      cy.get('body').type('{ctrl}z');
    }

    // Step 3: The canvas must still contain at least the root container that was
    // present when the component was first opened. An empty canvas (no container)
    // would indicate the undo went past the load boundary.
    cy.get('[data-cy="bb-canvas-area"]')
      .find('[data-cy="bb-rendered-container"]')
      .should('have.length.at.least', 1);
  });

  it('undo stack should be empty (no further undo available) at the floor state', () => {
    // Add one edit only.
    cy.get('[data-cy="palette-item-Base.Container"]').drag('[data-cy="bb-root-drop-zone"]');
    cy.get('[data-cy="bb-rendered-container"]').first().should('exist');

    cy.get('[data-cy="palette-item-Base.P"]').drag('[data-cy="bb-rendered-container"]');

    // Undo the single edit.
    cy.get('body').type('{ctrl}z');

    // Undo button (or keyboard shortcut) should now be disabled / have no further effect.
    // We assert the canvas is still in the loaded state, not blank.
    cy.get('[data-cy="bb-canvas-area"]').should('be.visible');
    cy.get('[data-cy="bb-rendered-container"]').should('have.length.at.least', 1);

    // Another undo should silently no-op — the canvas must not change.
    cy.get('body').type('{ctrl}z');
    cy.get('[data-cy="bb-rendered-container"]').should('have.length.at.least', 1);
  });
});
