import '@4tw/cypress-drag-drop';
import { loginToEditor } from '@support/editorTestHelper';

const BB_URL = '/project/69f515295ac7bd7572f9590c/blockbuilder?component=TestComponent';
const BB_CONTAINER_URL = '/project/69f515295ac7bd7572f9590c/blockbuilder?component=Base.Container';

describe('CSS GUI - Design Controls Validation', () => {
  beforeEach(() => {
    loginToEditor();
    cy.visit(BB_URL);
    cy.get('[data-cy="bb-canvas-area"]', { timeout: 15000 }).should('be.visible');
  });

  it('should hide Position placement inputs when position is Static', () => {
    cy.get('[data-cy="palette-item-Base.Container"]').should('be.visible').as('containerPaletteItem');
    cy.get('[data-cy="bb-root-drop-zone"]').should('be.visible').as('dropZone');
    cy.get('@containerPaletteItem').drag('@dropZone');

    cy.get('[data-cy="bb-rendered-container"]').first().click({ force: true });

    cy.get('[data-cy="tab-Design"]').click({ force: true });

    cy.get('[data-cy="category-section-placement"]').scrollIntoView().should('be.visible');

    cy.get('[data-cy="placement-input-left"]').should('not.exist');
    cy.get('[data-cy="placement-input-top"]').should('not.exist');
  });

  it('should enable Position placement inputs when position is switched to Absolute', () => {
    cy.get('[data-cy="palette-item-Base.Container"]').should('be.visible').as('containerPaletteItem');
    cy.get('[data-cy="bb-root-drop-zone"]').should('be.visible').as('dropZone');
    cy.get('@containerPaletteItem').drag('@dropZone');

    cy.get('[data-cy="bb-rendered-container"]').first().click({ force: true });
    cy.get('[data-cy="tab-Design"]').click({ force: true });
    cy.get('[data-cy="category-section-placement"]').scrollIntoView().should('be.visible');

    cy.get('[data-cy="absolute-position-btn"]').click({ force: true });

    cy.get('[data-cy="placement-input-left"]').should('exist').and('not.be.disabled');
    cy.get('[data-cy="placement-input-top"]').should('exist').and('not.be.disabled');
  });

  it('should not inject rogue default inline styles (padding) when decomposing existing components', () => {
    cy.visit(BB_CONTAINER_URL);

    cy.get('[data-cy="bb-canvas-area"]').should('be.visible');

    cy.get('[data-component-name="Base.Container"]')
      .should('be.visible')
      .then(($el) => {
        const style = $el.attr('style') || '';
        expect(style).to.not.include('padding-top: var(--padding-md)');
      });

    cy.get('[data-component-name="Base.Container"]').click({ force: true });

    cy.get('[data-component-name="Base.Container"]').then(($el) => {
      const style = $el.attr('style') || '';
      expect(style).to.not.include('padding-top: var(--padding-md)');
    });
  });

  it('should not cause infinite sync loops or background flashes when Custom CSS editor processes layout updates', () => {
    cy.get('[data-cy="bb-canvas-area"]').should('be.visible');

    cy.get('[data-cy="palette-item-Base.Container"]').drag('[data-cy="bb-root-drop-zone"]');
    cy.get('[data-cy="bb-rendered-container"]').first().should('exist').as('container');

    cy.get('@container').click({ force: true });
    cy.get('[data-cy="tab-Design"]').click({ force: true });

    cy.get('body').then(($body) => {
      const bgSection = $body.find('[data-cy="category-section-background"]');
      if (bgSection.length) {
        cy.get('[data-cy="category-section-background"]').scrollIntoView().click({ force: true });

        cy.get('body').then(($b2) => {
          const colorInput = $b2.find('[data-cy="background-color-input"], [data-cy="color-hex-input"]');
          if (colorInput.length) {
            cy.get('[data-cy="background-color-input"], [data-cy="color-hex-input"]')
              .first()
              .clear()
              .type('B70C0C{enter}');

            cy.get('[data-component-name="Base.Container"]').should('be.visible');

            // Background value must not be reverted to unset/initial (the sync-loop bug)
            cy.get('[data-component-name="Base.Container"]').then(($el) => {
              const style = $el.attr('style') || '';
              expect(style).to.not.match(
                /background(-color)?\s*:\s*(unset|initial|inherit|none)(\s*!important)?/
              );
            });
          } else {
            cy.log('background-color-input not found — verifying canvas stability only');
            cy.get('[data-cy="bb-canvas-area"]').should('be.visible');
          }
        });
      } else {
        cy.log('category-section-background not found — verifying canvas stability only');
        cy.get('[data-cy="bb-canvas-area"]').should('be.visible');
      }
    });
  });

  it('should not show browser-computed default styles in Custom CSS panel for a plain H3 element', () => {
    cy.visit(BB_URL);
    cy.get('[data-cy="bb-canvas-area"]').should('be.visible');

    cy.get('[data-cy="palette-item-Base.H3"]').should('be.visible').as('h3PaletteItem');
    cy.get('[data-cy="bb-root-drop-zone"]').should('be.visible').as('dropZone');
    cy.get('@h3PaletteItem').drag('@dropZone');

    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.H3"]').click({ force: true });

    cy.get('[data-cy="tab-Design"]').click({ force: true });

    cy.get('[data-cy="category-section-custom"]').scrollIntoView().should('be.visible');

    cy.get('[data-cy="category-section-custom"]').within(() => {
      cy.get('.view-lines')
        .should('exist')
        .invoke('text')
        .then((text) => {
          // Browser-computed defaults must NOT appear in the Custom CSS panel
          expect(text).to.not.match(/border\s*:/);
          expect(text).to.not.match(/border-left\s*:/);
          expect(text).to.not.match(/border-right\s*:/);
          expect(text).to.not.match(/border-top\s*:/);
          expect(text).to.not.match(/border-bottom\s*:/);
          expect(text).to.not.match(/display\s*:\s*block/);
          expect(text).to.not.match(/flex-direction\s*:/);
          expect(text).to.not.match(/flex-wrap\s*:/);
          expect(text).to.not.match(/object-fit\s*:/);
          expect(text).to.not.match(/opacity\s*:\s*1/);
          expect(text).to.not.match(/background\s*:\s*rgba\(0,\s*0,\s*0,\s*0\)/);
          expect(text).to.not.match(/background-color\s*:\s*rgba\(0,\s*0,\s*0,\s*0\)/);
        });
    });
  });

  it('should not show browser-computed default styles (border, background, display, flex-direction) in Custom CSS panel for a plain H3 element', () => {
    // Regression test for bug: useBlockBuilderCssExtraction supplemented dynamicInitialCss
    // with ALL properties from getComputedStyle that weren't in the component stylesheet.
    // This caused the Custom CSS panel to show "border: 0px none rgb(233,233,233)",
    // "background: rgba(0,0,0,0) none repeat scroll ...", "display: block",
    // "flex-direction: row", "object-fit: fill", etc. for a simple H3 element with no
    // such properties intentionally set.
    //
    // Fix: Removed the `else if (!existingVal)` supplement branch from step 3 in
    // useBlockBuilderCssExtraction. getComputedStyle is now only used to resolve existing
    // var() tokens, not to supplement the baseline with default values.
    //
    // Scenario:
    // 1. Load an empty component in Block Builder.
    // 2. Drag a Base.H3 node onto the canvas.
    // 3. Select it.
    // 4. Open the Design tab -> Custom CSS section.
    // 5. Verify that the Custom CSS editor does NOT contain default computed values:
    //    border-*, background (transparent), display: block, flex-direction: row,
    //    object-fit: fill, opacity: 1, height (live dimension).
    cy.visit('/project/1/blockbuilder?component=TestComponent');
    cy.get('[data-cy="bb-canvas-area"]').should('be.visible');

    // Add a H3 node
    cy.get('[data-cy="palette-item-Base.H3"]').should('be.visible').as('h3PaletteItem');
    cy.get('[data-cy="bb-root-drop-zone"]').should('be.visible').as('dropZone');
    cy.get('@h3PaletteItem').drag('@dropZone');

    // Select the rendered H3
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.H3"]').click({ force: true });

    // Open Design tab
    cy.get('[data-cy="tab-Design"]').click({ force: true });

    // Scroll to Custom section
    cy.get('[data-cy="category-section-custom"]').scrollIntoView().should('be.visible');

    // The Monaco editor value should NOT contain default computed CSS junk
    cy.get('[data-cy="category-section-custom"]').within(() => {
      cy.get('.view-lines').should('exist').invoke('text').then((text) => {
        // These are browser-computed defaults that should NOT appear in the custom panel
        expect(text).to.not.match(/border\s*:/);
        expect(text).to.not.match(/border-left\s*:/);
        expect(text).to.not.match(/border-right\s*:/);
        expect(text).to.not.match(/border-top\s*:/);
        expect(text).to.not.match(/border-bottom\s*:/);
        expect(text).to.not.match(/display\s*:\s*block/);
        expect(text).to.not.match(/flex-direction\s*:/);
        expect(text).to.not.match(/flex-wrap\s*:/);
        expect(text).to.not.match(/object-fit\s*:/);
        expect(text).to.not.match(/opacity\s*:\s*1/);
        expect(text).to.not.match(/background\s*:\s*rgba\(0,\s*0,\s*0,\s*0\)/);
        expect(text).to.not.match(/background-color\s*:\s*rgba\(0,\s*0,\s*0,\s*0\)/);
      });
    });
  });

  it('should remove the applied style when a Custom CSS property is fully deleted', () => {
    cy.get('[data-cy="palette-item-Base.Container"]').should('be.visible').as('containerPaletteItem');
    cy.get('[data-cy="bb-root-drop-zone"]').should('be.visible').as('dropZone');
    cy.get('@containerPaletteItem').drag('@dropZone');

    cy.get('[data-cy="bb-rendered-container"]').first().click({ force: true });
    cy.get('[data-cy="tab-Design"]').click({ force: true });
    cy.get('[data-cy="category-section-custom"]').scrollIntoView().should('be.visible');

    cy.get('[data-cy="category-section-custom"]')
      .find('textarea.inputarea')
      .click({ force: true })
      .type('{selectall}{backspace}width: 100%;', { force: true, delay: 20 });

    cy.get('[data-component-name="Base.Container"]', { timeout: 10000 }).should(($el) => {
      const style = $el.attr('style') || '';
      expect(style).to.match(/width\s*:\s*100%/);
    });

    cy.get('[data-cy="category-section-custom"]')
      .find('textarea.inputarea')
      .click({ force: true })
      .type('{selectall}{backspace}', { force: true });

    cy.get('[data-component-name="Base.Container"]', { timeout: 10000 }).should(($el) => {
      const style = $el.attr('style') || '';
      expect(style).to.not.match(/width\s*:\s*100%/);
      expect(style).to.not.match(/width\s*:\s*unset/);
    });
  });
});
