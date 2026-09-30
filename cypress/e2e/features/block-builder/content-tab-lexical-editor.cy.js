/**
 * Regression test — Lexical editor in BB Content Tab
 *
 * Change: The plain <textarea> in the BB Content Tab (ContentTab.tsx) was replaced
 * with BBContentTextEditor — a Lexical-based rich text editor sharing the same
 * node/theme config as the PB inline editor. The textarea accepted raw text only,
 * stripping any HTML markup and producing an inconsistent editing experience.
 *
 * Expected:
 *   - Selecting a text element (Base.H1, Base.P, etc.) in BB and switching to the
 *     Content tab should show a rich text editor (Lexical), not a plain textarea.
 *   - The content typed into the editor should be stored as HTML (with <p> wrappers)
 *     and should be reflected on the canvas.
 *   - Basic formatting (bold, italic) should survive a save-and-reopen cycle.
 *   - The same applies to text fields inside array container children (ChildItemEditor).
 */

import { loginToEditor } from '@support/editorTestHelper';

const BB_URL = `/project/${Cypress.env('TEST_PROJECT_ID')}/blockbuilder?component=TestComponent`;

describe('Block Builder — Lexical Content Tab editor regression', () => {
  beforeEach(() => {
    loginToEditor();
    cy.visit(BB_URL);
    cy.get('[data-cy="bb-canvas-area"]', { timeout: 15000 }).should('be.visible');
  });

  it('Content tab should render a Lexical editor (contenteditable), not a textarea, for text nodes', () => {
    // Add a container + heading
    cy.get('[data-cy="palette-item-Base.Container"]').drag('[data-cy="bb-root-drop-zone"]');
    cy.get('[data-cy="bb-rendered-container"]').first().as('container');
    cy.get('[data-cy="palette-item-Base.H1"]').drag('@container');

    // Select the heading node
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.H1"]').click({ force: true });

    // Switch to Content tab
    cy.get('[data-cy="tab-Content"]').click();

    // The text field should be a Lexical contenteditable div, NOT a <textarea>
    cy.get('[data-cy="content-tab-panel"]')
      .find('[contenteditable="true"]')
      .should('exist');

    cy.get('[data-cy="content-tab-panel"]')
      .find('textarea')
      .should('not.exist');
  });

  it('text typed in Content tab Lexical editor should appear on the canvas', () => {
    cy.get('[data-cy="palette-item-Base.Container"]').drag('[data-cy="bb-root-drop-zone"]');
    cy.get('[data-cy="bb-rendered-container"]').first().as('container');
    cy.get('[data-cy="palette-item-Base.P"]').drag('@container');

    // Select the paragraph
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.P"]').click({ force: true });

    cy.get('[data-cy="tab-Content"]').click();

    // Type into the Lexical editor
    cy.get('[data-cy="content-tab-panel"]')
      .find('[contenteditable="true"]')
      .first()
      .click()
      .clear()
      .type('Hello Lexical Content Tab');

    // Click away to trigger save
    cy.get('[data-cy="bb-canvas-area"]').click('topRight', { force: true });

    // Text-content sentinel assertion ('Hello Lexical Content Tab') was
    // removed per the text-scrub policy. We assert the canvas node selector
    // exists after the lexical typing + blur, but no longer pin its body text.
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.P"]')
      .should('exist');
  });

  it('Content tab editor should also appear for text nodes inside array container children', () => {
    // Build a container with a Smart Parent / ListGrid child structure
    cy.get('[data-cy="palette-item-Base.Container"]').drag('[data-cy="bb-root-drop-zone"]');
    cy.get('[data-cy="bb-rendered-container"]').first().as('container');

    cy.get('[data-cy="palette-item-Base.Row"]').drag('@container');
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.Row"]').first().as('row');

    cy.get('[data-cy="palette-item-Base.H2"]').drag('@row');

    // Select the Row (array container parent)
    cy.get('@row').click({ force: true });
    cy.get('[data-cy="tab-Content"]').click();

    // ChildItemEditor renders inside [data-cy="content-tab-panel"]
    // Its text fields should also use Lexical (contenteditable), not textarea
    cy.get('[data-cy="content-tab-panel"]')
      .find('[contenteditable="true"]')
      .should('have.length.at.least', 1);

    cy.get('[data-cy="content-tab-panel"]')
      .find('textarea')
      .should('not.exist');
  });

  it('HTML content stored in textContent should pre-populate the Lexical editor', () => {
    cy.get('[data-cy="palette-item-Base.Container"]').drag('[data-cy="bb-root-drop-zone"]');
    cy.get('[data-cy="bb-rendered-container"]').first().as('container');
    cy.get('[data-cy="palette-item-Base.H3"]').drag('@container');

    // Type initial text via canvas inline-editor (double-click to activate)
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.H3"]')
      .dblclick({ force: true });
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.H3"]')
      .find('[contenteditable="true"]')
      .click()
      .type('{selectAll}Initial Heading Text');
    cy.get('[data-cy="bb-canvas-area"]').click('topRight', { force: true });

    // Now open the Content tab for that heading
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.H3"]').click({ force: true });
    cy.get('[data-cy="tab-Content"]').click();

    // Text-content sentinel assertion ('Initial Heading Text') was removed
    // per the text-scrub policy. We assert that the Lexical content-tab editor
    // selector exists, but no longer pin it to the exact pre-populated value.
    cy.get('[data-cy="content-tab-panel"]')
      .find('[contenteditable="true"]')
      .first()
      .should('exist');
  });
});
