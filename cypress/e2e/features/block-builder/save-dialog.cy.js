import { loginToEditor } from '@support/editorTestHelper';

const BB_URL = '/project/69f515295ac7bd7572f9590c/blockbuilder?component=TestComponent';

describe('Block Builder - Custom Component Save Dialog', () => {
  beforeEach(() => {
    loginToEditor();

    cy.intercept('GET', '**/v1/projects/*/custom-components*', {
      statusCode: 200,
      body: [
        {
          _id: '123',
          name: 'My Custom Element',
          version: 1,
          category: 'custom',
        },
        {
          _id: '124',
          name: 'My Custom Element',
          version: 2,
          category: 'custom',
        },
      ],
    }).as('getCustomComponents');

    cy.visit(BB_URL);
    cy.get('[data-cy="bb-canvas-area"]', { timeout: 15000 }).should('be.visible');
  });

  it('should enforce strict versioning increments based on prefetched cache', () => {
    cy.get('[data-cy="bb-canvas-area"]').should('be.visible');

    cy.get('[data-cy="bb-save-component"]').click();

    cy.get('[data-cy="save-dialog-title"]').should('be.visible');

    cy.wait('@getCustomComponents');

    cy.get('[data-cy="save-dialog-name-input"]').clear().type('My Custom Element');

    // Version input min attribute must be bumped to 3 (latest in mock is 2)
    cy.get('[data-cy="save-dialog-version-input"]').should('have.attr', 'min', '3');
    cy.get('[data-cy="save-dialog-version-input"]').should('have.value', '3');

    // Deliberately type a lower version then submit — validation error must appear
    // Use {selectall} before typing to reliably replace the number input value
    cy.get('[data-cy="save-dialog-version-input"]').type('{selectall}1');
    cy.get('[data-cy="save-dialog-submit-button"]').click();

    // Text-content assertion for the validation error string was removed per
    // the text-scrub policy. We assert the error selector is visible rather
    // than matching its body text.
    cy.get('[data-cy="save-dialog-error"]').should('be.visible');
  });
});
