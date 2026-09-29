/**
 * Shared helpers for any Cypress test that runs inside the editor/project.
 *
 * Usage:
 *   import { loginToEditor, addComponent, clearPlayground } from '../../support/editorTestHelper';
 *
 *   beforeEach(() => {
 *     loginToEditor();
 *     clearPlayground();
 *     addComponent('hero', 0);
 *     addComponent('team', 0);
 *   });
 */
/** The fixed test project URL — all editor tests share this project. */
export const TEST_PROJECT_URL = '/project/69f515295ac7bd7572f9590c/editor/0';

/**
 * Log in via the centralized cy.login() programmatic command, then navigate
 * straight to the test project editor.
 *
 * Auth credentials are pulled from cypress.config.js env block (AUTH_USERNAME /
 * AUTH_PASSWORD). cy.login() uses cy.session() internally to cache the session
 * across tests and specs.
 */
export const loginToEditor = () => {
  cy.login();

  // Navigate to the test project editor (auth token already in localStorage).
  cy.visit(TEST_PROJECT_URL);

  // Wait for the editor to be fully ready:
  // Either the canvas has components OR the empty-canvas placeholder is shown.
  // Extended timeout (30s) to handle slow loads after block-builder sessions.
  cy.get('[data-component-index], [data-cy="add-component-placeholder"]', { timeout: 30000 })
    .should('exist');
};

/**
 * Add a component to the canvas via the component picker UI.
 *
 * @param {string} category - The component category name (e.g., 'hero', 'team', 'header')
 * @param {number} componentIndex - The 0-based index of the component within the category
 *
 * How it works:
 *   1. Clicks the AddNewComponent placeholder or the add button between sections
 *   2. Clicks the category in the component picker sidebar
 *   3. Clicks the component thumbnail at the given index
 *   4. Waits for the component to render on the canvas
 */
/**
 * Maps short human-readable aliases used in tests to the actual
 * category key strings used in data-cy attributes (from CATEGORIES enum).
 */
const CATEGORY_ALIASES = {
  hero: 'heroSection',
  'hero-section': 'heroSection',
  intro: 'introSection',
  'call-to-action': 'callToAction',
  cta: 'callToAction',
  logo: 'logoClouds',
  gallery: 'imageGallery',
  'top-banner': 'topBanner',
  'coming-soon': 'comingSoon',
  'back-to-top': 'backToTop',
};

export const addComponent = (category, componentIndex = 0) => {
  // Resolve any alias to the actual category key
  const resolvedCategory = CATEGORY_ALIASES[category] || category;

  // Open the component picker — either click the empty-canvas placeholder
  // or click on the canvas to trigger the sidebar
  cy.get('body').then(($body) => {
    if ($body.find('[data-cy="add-component-placeholder"]').length > 0) {
      // Empty canvas — click the "Let's build something!" placeholder
      cy.get('[data-cy="add-component-placeholder"]').click();
    } else {
      // Canvas has components — click outside any component to deselect,
      // then the component picker should be in the left sidebar
      cy.get('body').click(0, 0);
      cy.wait(300);
    }
  });

  // Wait for the component picker sidebar to appear
  cy.get('[data-cy="component-categories"]', { timeout: 5000 }).should('be.visible');

  // Click the target category (scrollIntoView handles overflow-y clipped containers)
  cy.get(`[data-cy="component-category-${resolvedCategory}"]`, { timeout: 10000 })
    .scrollIntoView()
    .should('be.visible')
    .click();

  // Wait for the component thumbnails to appear and click the target one
  cy.get(`[data-cy="component-item-${componentIndex}"]`, { timeout: 5000 })
    .should('be.visible')
    .click();

  // Wait for the component to render on the canvas
  cy.wait(1000);
};

/**
 * Reset the playground to its saved state by reloading the page.
 */
export const resetPlayground = () => {
  cy.reload();
  cy.wait(3000);
};

/**
 * Delete all components from the playground canvas.
 * Recursively clicks each section and deletes it via the action menu.
 */
export const clearPlayground = () => {
  // Wait for the editor canvas to be in a stable state before attempting to clear
  cy.get('[data-component-index], [data-cy="add-component-placeholder"]', { timeout: 15000 })
    .should('exist');

  const deleteNextSection = () => {
    cy.get('body').then(($body) => {
      // Look for rendered component sections
      const sections = $body.find('[data-component-index]');
      if (sections.length === 0) return;

      cy.wrap(sections.first()).click({ force: true });
      cy.wait(300);

      cy.get('[data-cy="action-delete"]', { timeout: 5000 })
        .should('be.visible')
        .click({ force: true });

      cy.wait(500);
      deleteNextSection();
    });
  };

  deleteNextSection();

  // Ensures we do not race with React's render cycle before `addComponent` tries to find this placeholder.
  cy.get('[data-cy="add-component-placeholder"]', { timeout: 10000 }).should('exist');
};
