import { loginToEditor, resetPlayground } from '@support/editorTestHelper';
import { versionManagerPage } from '@pages-po/versionManagerPage';
import versionManagerData from '@fixtures/versionManagerData.json';

const PROJECT_ID = Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c';

describe('Version Manager — mutations', () => {
  // Precondition: the Cypress account needs project:version:get, or
  // right-icon-list.tsx:239 hides [data-cy="toolbar-icon-versionManager"] entirely.
  before(() => {
    loginToEditor();
    cy.get('body').then(($body) => {
      expect(
        $body.find('[data-cy="toolbar-icon-versionManager"]').length,
        'Precondition failed: the Cypress account needs the project:version:get permission — [data-cy="toolbar-icon-versionManager"] is not rendered'
      ).to.be.greaterThan(0);
    });
  });

  beforeEach(() => {
    versionManagerPage.stubVersionList(versionManagerData.versionListDirty);
    loginToEditor();
  });

  afterEach(() => {
    resetPlayground();
  });

  it('M1: a dirty restore returns restoreWithPoint and restore_point is an object', () => {
    versionManagerPage.stubRestore(versionManagerData.restoreWithPoint);
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    versionManagerPage.openCardMenu(versionManagerData.versionListDirty.versions[1]._id);
    versionManagerPage.chooseMenuItem('restore');
    versionManagerPage.confirmDialog();
    cy.wait('@applyVersion').its('response.body.restore_point').should('be.an', 'object');
  });

  it('M2: a clean restore returns restoreWithoutPoint and restore_point is null', () => {
    versionManagerPage.stubRestore(versionManagerData.restoreWithoutPoint);
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    versionManagerPage.openCardMenu(versionManagerData.versionListDirty.versions[1]._id);
    versionManagerPage.chooseMenuItem('restore');
    versionManagerPage.confirmDialog();
    cy.wait('@applyVersion').its('response.body.restore_point').should('be.null');
  });

  it('M3: version-confirm-facts matches the dirty and clean restore copy', () => {
    versionManagerPage.stubRestore(versionManagerData.restoreWithPoint);
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    versionManagerPage.openCardMenu(versionManagerData.versionListDirty.versions[1]._id);
    versionManagerPage.chooseMenuItem('restore');
    cy.get('[data-cy="version-confirm-facts"]').invoke('text').should('match', /live site will not be affected/i);
    versionManagerPage.cancelDialog();

    versionManagerPage.stubVersionList(versionManagerData.versionListClean);
    versionManagerPage.stubRestore(versionManagerData.restoreWithoutPoint);
    resetPlayground();
    loginToEditor();
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    versionManagerPage.openCardMenu(versionManagerData.versionListClean.versions[1]._id);
    versionManagerPage.chooseMenuItem('restore');
    cy.get('[data-cy="version-confirm-facts"]').invoke('text').should('match', /nothing to save/i);
  });

  it('M4: version-undo-toast is visible together with version-undo-btn after a restore', () => {
    versionManagerPage.stubRestore(versionManagerData.restoreWithPoint);
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    versionManagerPage.openCardMenu(versionManagerData.versionListDirty.versions[1]._id);
    versionManagerPage.chooseMenuItem('restore');
    versionManagerPage.confirmDialog();
    cy.wait('@applyVersion');
    versionManagerPage.getUndoToast().should('be.visible');
    cy.get('[data-cy="version-undo-btn"]').should('be.visible');
  });

  it('M5: clicking version-undo-btn fires a second @applyVersion whose URL ends with the fixture undo_token', () => {
    versionManagerPage.stubRestore(versionManagerData.restoreWithPoint);
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    versionManagerPage.openCardMenu(versionManagerData.versionListDirty.versions[1]._id);
    versionManagerPage.chooseMenuItem('restore');
    versionManagerPage.confirmDialog();
    cy.wait('@applyVersion');
    cy.get('[data-cy="version-undo-btn"]').click();
    cy.wait('@applyVersion').its('request.url').should('include', versionManagerData.restoreWithPoint.undo_token);
  });

  it('N1: a 409 VERSION_NAME_TAKEN rename shows version-rename-error and keeps the earlier card name', () => {
    versionManagerPage.stubRename(409, { message: 'Name already taken', code: 'VERSION_NAME_TAKEN' });
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    const versionId = versionManagerData.versionListDirty.versions[1]._id;
    versionManagerPage.getCard(versionId).find('[data-cy="version-card-name"]').invoke('text').then((originalName) => {
      versionManagerPage.openCardMenu(versionId);
      versionManagerPage.chooseMenuItem('rename');
      versionManagerPage.submitRename('Duplicate name');
      cy.wait('@editVersionInformation');
      cy.get('[data-cy="version-rename-error"]').should('be.visible');
      versionManagerPage.getCard(versionId).find('[data-cy="version-card-name"]').invoke('text').should('eq', originalName);
    });
  });

  it('N2: Escape removes version-rename-input from the DOM and leaves the name unchanged', () => {
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    const versionId = versionManagerData.versionListDirty.versions[1]._id;
    versionManagerPage.getCard(versionId).find('[data-cy="version-card-name"]').invoke('text').then((originalName) => {
      versionManagerPage.openCardMenu(versionId);
      versionManagerPage.chooseMenuItem('rename');
      cy.get('[data-cy="version-rename-input"]').type('{esc}');
      cy.get('[data-cy="version-rename-input"]').should('not.exist');
      versionManagerPage.getCard(versionId).find('[data-cy="version-card-name"]').invoke('text').should('eq', originalName);
    });
  });

  it('N3: version-rename-input holds focus right after the menu choice, with no cy.wait(<number>)', () => {
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    const versionId = versionManagerData.versionListDirty.versions[1]._id;
    versionManagerPage.openCardMenu(versionId);
    versionManagerPage.chooseMenuItem('rename');
    cy.focused().should('have.attr', 'data-cy', 'version-rename-input');
  });

  it('N4: version-menu-delete is disabled on the live card, with a title or tooltip matching /live/i', () => {
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    const liveId = versionManagerData.versionListDirty.live_version_id;
    versionManagerPage.openCardMenu(liveId);
    cy.get('[data-cy="version-menu-delete"]').should('have.attr', 'aria-disabled', 'true');
    cy.get('[data-cy="version-menu-delete"]').parent('span').trigger('mouseover', { force: true });
    cy.get('.MuiTooltip-tooltip, [role="tooltip"]', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('match', /live/i);
  });

  it('M6: version-menu-delete on a snapshot card fires @removeVersion with DELETE and drops the card count by one', () => {
    versionManagerPage.stubDelete(200, { ok: true });
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    cy.get('[data-cy="version-card"]').its('length').then((before) => {
      const snapshotId = versionManagerData.versionListDirty.versions[1]._id;
      versionManagerPage.openCardMenu(snapshotId);
      versionManagerPage.chooseMenuItem('delete');
      versionManagerPage.confirmDialog();
      cy.wait('@removeVersion').its('request.method').should('eq', 'DELETE');
      cy.get('[data-cy="version-card"]').should('have.length', before - 1);
    });
  });

  it('N5: a plain version-card click never fires @removeVersion', () => {
    versionManagerPage.stubDelete(200, { ok: true });
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    versionManagerPage.getCard(versionManagerData.versionListDirty.versions[1]._id).click();
    cy.get('@removeVersion.all').should('have.length', 0);
  });
});
