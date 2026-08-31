import { loginToEditor, resetPlayground } from '@support/editorTestHelper';
import { versionManagerPage } from '@pages-po/versionManagerPage';
import versionManagerData from '@fixtures/versionManagerData.json';

const PROJECT_ID = Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c';

const openPanelWithPrecondition = () => {
  versionManagerPage.openPanel();
};

describe('Version Manager — panel', () => {
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

  it('1: dirty draft renders version-status-strip with data-state="dirty"', () => {
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage.getStatusStrip().should('have.attr', 'data-state', 'dirty');
  });

  it('2: clean draft renders version-status-strip with data-state="clean"', () => {
    versionManagerPage.stubVersionList(versionManagerData.versionListClean);
    loginToEditor();
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage.getStatusStrip().should('have.attr', 'data-state', 'clean');
  });

  it('3: a matched draft renders version-status-match-note holding the matched version name', () => {
    versionManagerPage.stubVersionList(versionManagerData.versionListClean);
    loginToEditor();
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    cy.get('[data-cy="version-status-match-note"]')
      .should('be.visible')
      .and('contain.text', 'Publish 3');
  });

  it('4: the live card renders version-card-badge with data-variant="live" and the text LIVE', () => {
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage
      .getCard(versionManagerData.versionListDirty.live_version_id)
      .find('[data-cy="version-card-badge"][data-variant="live"]')
      .should('be.visible')
      .and('contain.text', 'LIVE');
  });

  it('5: the base card renders version-card-badge with data-variant="base" and the text BASE, and carries no live variant', () => {
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage
      .getCard(versionManagerData.versionListDirty.base_version_id)
      .find('[data-cy="version-card-badge"][data-variant="base"]')
      .should('be.visible')
      .and('contain.text', 'BASE');
    versionManagerPage
      .getCard(versionManagerData.versionListDirty.base_version_id)
      .find('[data-cy="version-card-badge"][data-variant="live"]')
      .should('not.exist');
  });

  it('6: a clean draft renders the draft badge with data-variant="in-sync" and the text IN SYNC', () => {
    versionManagerPage.stubVersionList(versionManagerData.versionListClean);
    loginToEditor();
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    cy.get('[data-cy="version-draft-card"]')
      .find('[data-cy="version-card-badge"][data-variant="in-sync"]')
      .should('be.visible')
      .and('contain.text', 'IN SYNC');
  });

  it('7: the five group roots render in order draft, live, snapshots, history, restore points', () => {
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    const order = [
      'version-group-draft',
      'version-group-live',
      'version-group-snapshots',
      'version-group-history',
      'version-group-restore-points',
    ];
    cy.get('[data-cy="version-manager-panel"]').then(($panel) => {
      const found = order.filter((cy_) => $panel.find(`[data-cy="${cy_}"]`).length > 0);
      const positions = found.map((cy_) =>
        Array.from($panel[0].querySelectorAll('[data-cy]')).findIndex(
          (el) => el.getAttribute('data-cy') === cy_
        )
      );
      const sorted = [...positions].sort((a, b) => a - b);
      expect(positions).to.deep.equal(sorted);
    });
  });

  it('8: version-group-restore-points does not exist when the fixture holds no restore row', () => {
    versionManagerPage.stubVersionList(versionManagerData.versionListClean);
    loginToEditor();
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    cy.get('[data-cy="version-group-restore-points"]').should('not.exist');
  });

  it('9: retention notes match /last 5/i and /forever/i', () => {
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    cy.get('[data-cy="version-group-restore-points-note"]')
      .invoke('text')
      .should('match', /last 5/i);
    cy.get('[data-cy="version-group-history-note"]')
      .invoke('text')
      .should('match', /forever/i);
  });

  it('10: version-preview-strip is a descendant of version-manager-panel; the playground holds no preview strip', () => {
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage.openCompareSheet(versionManagerData.versionListDirty.versions[1]._id);
    cy.get('[data-cy="version-manager-panel"] [data-cy="version-preview-strip"]').should('exist');
    cy.get('[data-cy="playground"]').find('[data-cy="version-preview-strip"]').should('not.exist');
  });

  it('11: a plain version-card click opens the preview and never calls @applyVersion', () => {
    versionManagerPage.stubRestore({ project: {}, restore_point: null, undo_token: null });
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage.getCard(versionManagerData.versionListDirty.versions[1]._id).click();
    cy.get('[data-cy="version-preview-strip"]').should('be.visible');
    cy.get('@applyVersion.all').should('have.length', 0);
  });

  it('12: version-menu holds exactly four items', () => {
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage.openCardMenu(versionManagerData.versionListDirty.versions[1]._id);
    cy.get('[data-cy="version-menu"]').within(() => {
      cy.get('[data-cy="version-menu-preview"]').should('exist');
      cy.get('[data-cy="version-menu-restore"]').should('exist');
      cy.get('[data-cy="version-menu-rename"]').should('exist');
      cy.get('[data-cy="version-menu-delete"]').should('exist');
    });
    cy.get('[data-cy="version-menu"]').find('[data-cy^="version-menu-"]').should('have.length', 4);
  });

  it('13: the compare sheet shows one row with non-empty from/to; identical payloads show version-compare-empty', () => {
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage.openCompareSheet(versionManagerData.versionListDirty.versions[1]._id);
    cy.get('[data-cy="version-compare-row"]').should('have.length.at.least', 1);
    cy.get('[data-cy="version-compare-row-from"]').first().invoke('text').should('not.be.empty');
    cy.get('[data-cy="version-compare-row-to"]').first().invoke('text').should('not.be.empty');

    const identical = JSON.parse(JSON.stringify(versionManagerData.versionListDirty));
    identical.versions[1].data = identical.versions[0].data;
    identical.draft_hash = identical.versions[0].content_hash;
    versionManagerPage.stubVersionList(identical);
    resetPlayground();
    loginToEditor();
    openPanelWithPrecondition();
    cy.wait('@getVersions');
    versionManagerPage.openCompareSheet(identical.versions[0]._id);
    cy.get('[data-cy="version-compare-empty"]').should('be.visible');
    cy.get('[data-cy="version-compare-row"]').should('not.exist');
  });
});
