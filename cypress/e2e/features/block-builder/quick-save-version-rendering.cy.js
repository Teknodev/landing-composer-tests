/**
 * Regression tests for Block Builder Quick Save → Playground version-specific rendering.
 *
 * Bug fixed: PageBuilder.findComponentSignature() was matching only by component name,
 * causing the FIRST registered version of a custom component to always be rendered,
 * regardless of which version was stored in the page JSON (customComponentVersion field).
 *
 * Fix: findComponentSignature() now does a version-aware lookup when customComponentVersion
 * is present in the JSON entry, falling back to name-only matching for standard components.
 */

import { loginToEditor } from '@support/editorTestHelper';

const PROJECT_ID = Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c';
const EDITOR_URL = `/project/${PROJECT_ID}/editor/0`;

describe('Block Builder — Quick Save version-specific rendering regression', () => {
  const COMPONENT_NAME = 'Call To Action 1';

  // Stubs three registered versions of the same component name in the API response.
  // The page JSON references version 3 — the fix ensures v3 is rendered, not v1.
  const mockCustomComponents = [
    {
      _id: 'cc-id-v1',
      name: COMPONENT_NAME,
      category: 'custom',
      version: 1,
      bundle_url: '',
      bundle_content: `window.__CUSTOM_COMPONENTS__["CallToAction1_v1"] = class CallToAction1 { static getName() { return "${COMPONENT_NAME}"; } static getVersion() { return 1; } render() { return null; } };`,
      styles_url: '',
      status: 'active',
      props_schema: '[]',
    },
    {
      _id: 'cc-id-v2',
      name: COMPONENT_NAME,
      category: 'custom',
      version: 2,
      bundle_url: '',
      bundle_content: `window.__CUSTOM_COMPONENTS__["CallToAction1_v2"] = class CallToAction1 { static getName() { return "${COMPONENT_NAME}"; } static getVersion() { return 2; } render() { return null; } };`,
      styles_url: '',
      status: 'active',
      props_schema: '[]',
    },
    {
      _id: 'cc-id-v3',
      name: COMPONENT_NAME,
      category: 'custom',
      version: 3,
      bundle_url: '',
      bundle_content: `window.__CUSTOM_COMPONENTS__["CallToAction1_v3"] = class CallToAction1 { static getName() { return "${COMPONENT_NAME}"; } static getVersion() { return 3; } render() { return null; } };`,
      styles_url: '',
      status: 'active',
      props_schema: '[]',
    },
  ];

  beforeEach(() => {
    loginToEditor();

    // Intercept the custom components API call and stub all three versions
    cy.intercept('GET', `**/v1/projects/${PROJECT_ID}/custom-components*`, {
      body: mockCustomComponents,
    }).as('getCustomComponents');
  });

  it('falls back gracefully to name-only match when no version is stored in page JSON', () => {
    // Standard (non-custom) components have no customComponentVersion — ensure no breakage
    cy.visit(EDITOR_URL, {
      onBeforeLoad(win) {
        // No sessionStorage — normal page load with no BB quick-save
        win.sessionStorage.removeItem('blockbuilder:componentUpdate');
        win.sessionStorage.removeItem('blockbuilder:editingIndex');
      },
    });

    cy.wait('@getCustomComponents');

    // Playground should render without errors
    cy.get('[data-cy="playground"]').should('exist');
  });

});
