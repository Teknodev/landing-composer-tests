import { loginToEditor, resetPlayground } from '@support/editorTestHelper';
import { versionManagerPage } from '@pages-po/versionManagerPage';
import versionManagerData from '@fixtures/versionManagerData.json';

const PROJECT_ID = Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c';

describe('Version Manager — publish match', () => {
  // Precondition: openPanel() is called below, and the Cypress account needs
  // project:version:get, or right-icon-list.tsx:239 hides the toolbar control.
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
    versionManagerPage.stubPublish(versionManagerData.publishMatched);
    versionManagerPage.stubVersionList(versionManagerData.versionListClean);
    loginToEditor();
  });

  afterEach(() => {
    resetPlayground();
  });

  it('N1: publish-btn is disabled when versionListClean is served', () => {
    cy.wait('@getVersions');
    cy.get('[data-cy="publish-btn"]', { timeout: 15000 }).should('be.disabled');
  });

  it('M1: a hover on the publish-btn parent shows publish-match-tooltip holding the matched name', () => {
    cy.get('[data-cy="publish-btn"]').parent().trigger('mouseover', { force: true });
    cy.get('[data-cy="publish-match-tooltip"], .MuiTooltip-tooltip, [role="tooltip"]', { timeout: 5000 })
      .should('be.visible')
      .invoke('text')
      .should('contain', 'Publish 3');
  });

  it('M2: publish-confirm-title matches /Make "..." live again?/ and publish-confirm-note matches /no new entry is created/i', () => {
    versionManagerPage.stubPublish(versionManagerData.publishMatched);
    cy.get('[data-cy="publish-btn"]').click({ force: true });
    cy.get('[data-cy="publish-confirm-dialog"]').should('be.visible');
    cy.get('[data-cy="publish-confirm-title"]').invoke('text').should('match', /Make "[^"]+" live again\?/);
    cy.get('[data-cy="publish-confirm-note"]').invoke('text').should('match', /no new entry is created/i);
  });

  it('M3: a matched publish returns match.matched true and the version-card count is unchanged', () => {
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    cy.get('[data-cy="version-card"]').its('length').then((before) => {
      versionManagerPage.stubPublish(versionManagerData.publishMatched);
      cy.get('[data-cy="publish-btn"]').click({ force: true });
      cy.get('[data-cy="publish-confirm-submit"]').click();
      cy.wait('@publishProject').its('response.body.match.matched').should('eq', true);
      cy.get('[data-cy="version-card"]').should('have.length', before);
    });
  });

  it('M4: an unmatched publish returns match.matched false and the version-card count grows by one', () => {
    versionManagerPage.stubVersionList(versionManagerData.versionListDirty);
    loginToEditor();
    versionManagerPage.openPanel();
    cy.wait('@getVersions');
    cy.get('[data-cy="version-card"]').its('length').then((before) => {
      const grownList = JSON.parse(JSON.stringify(versionManagerData.versionListDirty));
      grownList.versions.unshift({
        _id: '69f515295ac7bd7572f959a9',
        name: 'Publish 4',
        kind: 'publish',
        is_live: true,
        is_base: false,
        content_hash: 'aa11bb22cc33dd44',
        order: 4,
        owner: { _id: '64aa000000000000000000f1', name: 'Ada' },
        created_at: '2026-08-29T09:14:02.000Z',
        data: '{"sections":[{"id":"s0","title":"Fresh publish"}]}',
      });
      grownList.live_version_id = '69f515295ac7bd7572f959a9';

      versionManagerPage.stubPublish(versionManagerData.publishUnmatched);
      cy.get('[data-cy="publish-btn"]').click({ force: true });
      cy.get('[data-cy="publish-confirm-submit"]').click();
      cy.wait('@publishProject').its('response.body.match.matched').should('eq', false);

      versionManagerPage.stubVersionList(grownList);
      cy.get('[data-cy="version-manager-panel"]').type('{esc}');
      cy.get('[data-cy="version-manager-panel"]').should('not.exist');
      versionManagerPage.openPanel();
      cy.wait('@getVersions');
      cy.get('[data-cy="version-card"]').should('have.length', before + 1);
    });
  });

  it('N2: an unmatched publish response never sets a matched name in the confirm dialog', () => {
    versionManagerPage.stubVersionList(versionManagerData.versionListDirty);
    versionManagerPage.stubPublish(versionManagerData.publishUnmatched);
    loginToEditor();
    cy.get('[data-cy="publish-btn"]').click({ force: true });
    cy.get('[data-cy="publish-confirm-dialog"]').should('be.visible');
    cy.get('[data-cy="publish-confirm-title"]').invoke('text').should('not.match', /live again\?/);
  });
});
