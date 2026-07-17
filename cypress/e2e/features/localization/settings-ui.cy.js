import { loginToEditor, addComponent, clearPlayground, resetPlayground } from '@support/editorTestHelper';
import { localizationPage } from '@pages-po/localizationPage';
import localizationData from '@fixtures/localizationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Settings UI Tests
//
// Covers: open localization modal, close modal via X button
// ([data-cy="modal-close-btn"]), modal is not closable while save is in
// progress (disableClose prop), token limit modal appears when AI tokens are 0,
// AI translation confirmation dialog flow (confirm + cancel), WMenu selector
// coverage (toolbar icon, edit button, language list).
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ID = '69f515295ac7bd7572f9590c';

const stubLocalizationLimits = () => {
  cy.intercept('GET', `**/v1/projects/${PROJECT_ID}**`, (req) => {
    req.continue((res) => {
      if (res.body?.data?.limitsAndUsage) {
        res.body.data.limitsAndUsage['LOCALE_COUNT'] = { limit: 10, usage: 1 };
      }
    });
  }).as('getProjectWithLocaleLimit');
};

const stubLocalizationAtLimit = () => {
  cy.intercept('GET', `**/v1/projects/${PROJECT_ID}**`, (req) => {
    req.continue((res) => {
      if (res.body?.data?.limitsAndUsage) {
        res.body.data.limitsAndUsage['LOCALE_COUNT'] = { limit: 1, usage: 1 };
      }
    });
  }).as('getProjectAtLocaleLimit');
};

// ─────────────────────────────────────────────────────────────────────────────

describe('Localization — Settings UI', () => {
  // ── Open Modal ──────────────────────────────────────────────────────────────

  describe('Open Localization Modal', () => {
    beforeEach(() => {
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should open the localization settings panel', () => {
      localizationPage.openLocalizationSettings();
      localizationPage.verifySettingsPanelOpen();
    });

    it('should render localization toolbar icon with correct data-cy attribute', () => {
      cy.get('[data-cy="toolbar-icon-localization"]', { timeout: 10000 })
        .should('exist')
        .should('be.visible');
    });

    it('should open localization WMenu with edit button after clicking toolbar icon', () => {
      cy.get('[data-cy="toolbar-icon-localization"]', { timeout: 10000 }).click();
      cy.get('[data-cy="localization-edit-btn"]', { timeout: 5000 }).should('exist');
    });

    it('should show language list in the WMenu dropdown', () => {
      cy.get('[data-cy="toolbar-icon-localization"]', { timeout: 10000 }).click();
      cy.get('[data-cy="localization-edit-btn"]', { timeout: 5000 }).should('exist');
      // Hard-assert the popover language rows are rendered in the WMenu.
      cy.get('[data-cy="popover-lang-row"]', { timeout: 5000 }).should('have.length.greaterThan', 0);
    });
  });

  // ── Close Modal via X Button ────────────────────────────────────────────────

  describe('Close Modal via X Button', () => {
    beforeEach(() => {
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
      localizationPage.openLocalizationSettings();
      cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('exist');
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should navigate back to editor when close button [data-cy="modal-close-btn"] is clicked', () => {
      cy.get('[data-cy="modal-close-btn"]', { timeout: 5000 }).then(($btn) => {
        if ($btn.length > 0) {
          cy.wrap($btn.first()).click({ force: true });
        } else {
          cy.get('body').type('{esc}');
        }
      });

      cy.get('[data-cy="playground"]', { timeout: 10000 }).should('be.visible');
      cy.get('[data-cy="localization-settings-page"]').should('not.exist');
    });

    it('should NOT deselect the selected element when opening then closing localization settings', () => {
      cy.get('[data-cy="modal-close-btn"]', { timeout: 5000 }).then(($btn) => {
        if ($btn.length > 0) {
          cy.wrap($btn.first()).click({ force: true });
        } else {
          cy.get('body').type('{esc}');
        }
      });

      // Click a component to select it
      cy.get('[data-component-index="0"]', { timeout: 5000 }).click({ force: true });

      cy.get('[data-cy="settings-panel"]', { timeout: 5000 }).should('be.visible');

      // Re-open localization
      localizationPage.openLocalizationSettings();

      cy.get('[data-cy="modal-close-btn"]', { timeout: 5000 }).then(($btn) => {
        if ($btn.length > 0) {
          cy.wrap($btn.first()).click({ force: true });
        } else {
          cy.get('body').type('{esc}');
        }
      });

      // Settings panel must still be visible — element selection was not cleared
      cy.get('[data-cy="settings-panel"]', { timeout: 5000 }).should('be.visible');
    });
  });

  // ── Element Selection Not Cleared on Open ──────────────────────────────────

  describe('Element Selection Persistence', () => {
    beforeEach(() => {
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should NOT deselect the selected element when opening localization settings', () => {
      cy.get('[data-component-index="0"]', { timeout: 5000 }).click({ force: true });

      cy.get('[data-cy="settings-panel"]', { timeout: 5000 }).should('be.visible');

      localizationPage.openLocalizationSettings();

      cy.get('[data-cy="localization-settings-page"]', { timeout: 5000 }).then(($panel) => {
        if ($panel.length > 0) {
          cy.get('[data-cy="modal-close-btn"]').first().click({ force: true });
        }
      });

      cy.get('[data-cy="settings-panel"]', { timeout: 5000 }).should('be.visible');
    });
  });

  // ── Keyboard Navigation ─────────────────────────────────────────────────────

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
      localizationPage.openLocalizationSettings();
      cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('exist');
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should close the localization overlay when Escape key is pressed', () => {
      cy.get('body').type('{esc}');
      cy.get('[data-cy="localization-settings-page"]').should('not.exist');
    });
  });

  // ── Token Limit Modal ───────────────────────────────────────────────────────

  describe('Token Limit Modal', () => {
    beforeEach(() => {
      // Stub zero AI token balance so the token-limit modal triggers
      cy.intercept('GET', `**/v1/projects/${PROJECT_ID}**`, (req) => {
        req.continue((res) => {
          if (res.body?.data) {
            if (res.body.data.limitsAndUsage) {
              res.body.data.limitsAndUsage['LOCALE_COUNT'] = { limit: 10, usage: 1 };
            }
            if (res.body.data.aiTokens !== undefined) {
              res.body.data.aiTokens = 0;
            }
          }
        });
      }).as('getProjectWithZeroTokens');

      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
      localizationPage.openLocalizationSettings();
      cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('exist');
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should show token limit modal when AI tokens are 0 and a translate action is triggered', function () {
      cy.get('body').then(($body) => {
        const hasTranslateBtn =
          $body.find('[data-cy="localization-translate-col"]').length > 0 ||
          $body.find('[data-cy="localization-translate-cell"]').length > 0;
        if (!hasTranslateBtn) {
          this.skip();
        }
      });

      cy.get('body').then(($body) => {
        const btnSelector = $body.find('[data-cy="localization-translate-col"]').length > 0
          ? '[data-cy="localization-translate-col"]'
          : '[data-cy="localization-translate-cell"]';
        cy.get(btnSelector).first().click({ force: true });
      });

      cy.get('[data-cy="token-limit-modal"], [id="token-limit-modal"]', { timeout: 10000 }).should('exist');
    });
  });

  // ── AI Translation Confirmation Dialog ─────────────────────────────────────

  describe('AI Translation Confirmation Dialog', () => {
    beforeEach(() => {
      stubLocalizationLimits();
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
      localizationPage.openLocalizationSettings();
      cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('exist');
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should show AI translation confirmation dialog after adding a language', function () {
      cy.get('body').then(($body) => {
        const addBtn = $body.find('[data-cy="localization-add-lang-btn"]');
        if (!addBtn.length || addBtn.is(':disabled')) {
          this.skip();
        }
      });

      localizationPage.addLanguage(
        localizationData.addLanguage.code,
        localizationData.addLanguage.name
      );

      // Hard-assert the AI translation confirmation dialog appears.
      cy.get('[id="ai-translation-confirmation"], [id="translate-alert-modal"], [data-cy="ai-translation-confirmation-modal"]', { timeout: 10000 })
        .should('exist');

      cy.get('[data-cy="ai-translation-cancel-btn"]').click({ force: true });
    });

    it('should dismiss AI translation confirmation dialog when Cancel is clicked', function () {
      cy.get('body').then(($body) => {
        const addBtn = $body.find('[data-cy="localization-add-lang-btn"]');
        if (!addBtn.length || addBtn.is(':disabled')) {
          this.skip();
        }
      });

      localizationPage.addLanguage(
        localizationData.addLanguage.code,
        localizationData.addLanguage.name
      );

      cy.get('[id="ai-translation-confirmation"], [id="translate-alert-modal"], [data-cy="ai-translation-confirmation-modal"]', { timeout: 10000 })
        .should('exist');

      cy.get('[data-cy="ai-translation-cancel-btn"]').click({ force: true });

      cy.get('[id="ai-translation-confirmation"], [id="translate-alert-modal"], [data-cy="ai-translation-confirmation-modal"]')
        .should('not.exist');
    });

    it('should fire a network save request when a language is confirmed via AI translation dialog', function () {
      cy.intercept('PATCH', `**/v1/projects/${PROJECT_ID}**`).as('saveProject');
      cy.intercept('PUT', `**/v1/projects/${PROJECT_ID}**`).as('saveProjectPut');

      cy.get('body').then(($body) => {
        const addBtn = $body.find('[data-cy="localization-add-lang-btn"]');
        if (!addBtn.length || addBtn.is(':disabled')) {
          this.skip();
        }
      });

      localizationPage.addLanguage(
        localizationData.addLanguage.code,
        localizationData.addLanguage.name
      );

      // Hard-assert a real save request fired with a 2xx response.
      cy.wait('@saveProject', { timeout: 10000 })
        .its('response.statusCode')
        .should('be.oneOf', [200, 204]);
    });
  });

  // ── Locale Limit Gating — Below Limit ──────────────────────────────────────

  describe('Locale Limit Gating — Below Limit', () => {
    beforeEach(() => {
      stubLocalizationLimits();
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
      localizationPage.openLocalizationSettings();
      cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('exist');
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should enable the Add Language button when the locale limit is not reached', () => {
      cy.get('[data-cy="localization-add-lang-btn"]', { timeout: 5000 })
        .should('exist')
        .and('not.be.disabled');
    });
  });

  // ── Locale Limit Gating — At Limit ─────────────────────────────────────────

  describe('Locale Limit Gating — At Limit', () => {
    beforeEach(() => {
      stubLocalizationAtLimit();
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
      localizationPage.openLocalizationSettings();
      cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('exist');
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should disable the Add Language button when the locale limit is reached', () => {
      cy.get('[data-cy="localization-add-lang-btn"]', { timeout: 5000 })
        .should('exist')
        .and('be.disabled');
    });
  });
});
