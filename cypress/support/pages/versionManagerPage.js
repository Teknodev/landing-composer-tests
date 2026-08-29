export const versionManagerPage = {
  stubVersionList(payload) {
    cy.intercept(
      'GET',
      `**/v1/projects/${Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c'}/versions`,
      { statusCode: 200, body: payload }
    ).as('getVersions');
  },

  stubPublish(payload) {
    cy.intercept(
      'POST',
      `**/v1/projects/${Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c'}/publish`,
      { statusCode: 200, body: payload }
    ).as('publishProject');
  },

  stubRestore(payload) {
    cy.intercept(
      'POST',
      `**/v1/projects/${Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c'}/versions/*`,
      { statusCode: 200, body: payload }
    ).as('applyVersion');
  },

  stubRename(statusCode, body) {
    cy.intercept(
      'PATCH',
      `**/v1/projects/${Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c'}/versions/*/edit`,
      { statusCode, body }
    ).as('editVersionInformation');
  },

  stubDelete(statusCode, body) {
    cy.intercept(
      'DELETE',
      `**/v1/projects/${Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c'}/versions/*`,
      { statusCode, body }
    ).as('removeVersion');
  },

  openPanel() {
    cy.get('[data-cy="toolbar-icon-versionManager"]', { timeout: 10000 })
      .should('be.visible')
      .click();
    cy.get('[data-cy="version-manager-panel"]', { timeout: 10000 }).should('exist');
  },

  getStatusStrip() {
    return cy.get('[data-cy="version-status-strip"]');
  },

  getCard(versionId) {
    return cy.get(`[data-cy="version-card"][data-version-id="${versionId}"]`);
  },

  openCardMenu(versionId) {
    this.getCard(versionId)
      .find('[data-cy="version-card-menu-btn"]')
      .click();
    cy.get('[data-cy="version-menu"]', { timeout: 10000 }).should('be.visible');
  },

  chooseMenuItem(name) {
    const map = {
      preview: 'version-menu-preview',
      restore: 'version-menu-restore',
      rename: 'version-menu-rename',
      delete: 'version-menu-delete',
    };
    cy.get(`[data-cy="${map[name]}"]`).click();
  },

  submitRename(text) {
    cy.get('[data-cy="version-rename-input"]').clear().type(`${text}{enter}`);
  },

  confirmDialog() {
    cy.get('[data-cy="version-confirm-accept"]').click();
  },

  cancelDialog() {
    cy.get('[data-cy="version-confirm-cancel"]').click();
  },

  getUndoToast() {
    return cy.get('[data-cy="version-undo-toast"]');
  },

  openCompareSheet(versionId) {
    this.getCard(versionId)
      .find('[data-cy="version-card-preview-btn"]')
      .click();
    cy.get('[data-cy="version-compare-sheet"]', { timeout: 10000 }).should('be.visible');
  },
};
