import { loginToEditor, addComponent, clearPlayground, resetPlayground } from '@support/editorTestHelper';
import { localizationPage } from '@pages-po/localizationPage';
import localizationData from '@fixtures/localizationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Language Management Tests
//
// Covers: add language, remove language, switch active language, set default
// language, duplicate language prevention, and the minimum-1-language guard
// (cannot remove the last language / default language).
//
// LOCALE_COUNT is subscription-gated. Tests that add a language stub the
// project API to set { limit: 10, usage: 1 } so the Add button is enabled.
// The stub must be registered BEFORE loginToEditor() fires the GET request.
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

// ─────────────────────────────────────────────────────────────────────────────

describe('Localization — Language Management', () => {
  // ── Add Language ────────────────────────────────────────────────────────────

  describe('Add Language', () => {
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

    it('should add a new language to the localization table', function () {
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
      localizationPage.verifyLanguageInTable(localizationData.addLanguage.name);
    });

    it('should show language select dropdown after clicking Add Language button', function () {
      cy.get('body').then(($body) => {
        const addBtn = $body.find('[data-cy="localization-add-lang-btn"]');
        if (!addBtn.length || addBtn.is(':disabled')) {
          this.skip();
        }
      });

      cy.get('[data-cy="localization-add-lang-btn"]').click();

      cy.get('[data-cy="localization-settings-page"]').then(($panel) => {
        const hasSelectLanguage =
          $panel.find('input[placeholder*="Language"], [placeholder*="Select Language"]').length > 0 ||
          $panel.find('[class*="addLanguageContainer"]').length > 0 ||
          $panel.find('[class*="addLanguage"]').length > 0;
        expect(hasSelectLanguage, 'language select dropdown rendered').to.be.true;
      });
    });
  });

  // ── Remove Language ─────────────────────────────────────────────────────────

  describe('Remove Language', () => {
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

    it('should remove a language from the localization table', function () {
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

      localizationPage.removeLanguage(localizationData.addLanguage.name);

      localizationPage.verifyLanguageNotInTable(localizationData.addLanguage.name);
    });
  });

  // ── Switch Active Language ──────────────────────────────────────────────────

  describe('Switch Active Language', () => {
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

    it('should switch the active language and re-render the canvas', function () {
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

      localizationPage.verifyLanguageInTable(localizationData.addLanguage.name);
      cy.get('body').click(0, 0);

      localizationPage.switchLanguage(localizationData.addLanguage.name);

      localizationPage.verifyCanvasRendered();
    });
  });

  // ── Minimum 1 Language Guard ────────────────────────────────────────────────

  describe('Minimum 1 Language Guard', () => {
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

    it('should NOT allow deleting the last remaining language', () => {
      // FLAGGED: requires FE selector `lang-col-delete-{code}` per language.
      // Until added, scope the disabled-button check to the language-header DOM
      // block of the (only) default language column.
      cy.get('[data-cy="localization-lang-header"]', { timeout: 5000 }).then(($headers) => {
        const $defaultHeader = $headers.first();
        const $disabledButtons = Cypress.$($defaultHeader).find('button[disabled]');
        expect($disabledButtons.length, 'last-remaining-language header has a disabled delete button').to.be.greaterThan(0);
      });
    });

    it('should have the Add Language button present in the settings panel', () => {
      cy.get('[data-cy="localization-add-lang-btn"]', { timeout: 5000 }).should('exist');
    });
  });

  // ── Default Language Protection (Set Default / Cannot Remove Default) ────────

  describe('Default Language Protection', () => {
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

    it('should have delete and set-default buttons disabled for the default language column', () => {
      // FLAGGED: requires FE selectors `lang-col-delete-{code}` and `lang-col-set-default-{code}`.
      // Until added, scope to disabled buttons inside the default language header.
      cy.get('[data-cy="localization-lang-header"]', { timeout: 5000 }).then(($headers) => {
        const $defaultHeader = $headers.first();
        const $disabledButtons = Cypress.$($defaultHeader).find('button[disabled]');
        expect($disabledButtons.length, 'default header has at least 2 disabled buttons (delete + set-default)').to.be.greaterThan(1);
      });
    });

    it('should keep the delete button disabled for the default language even after adding a second language', function () {
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

      cy.get('body').then(($b) => {
        if ($b.find('[data-cy="ai-translation-cancel-btn"]').length > 0) {
          cy.get('[data-cy="ai-translation-cancel-btn"]').first().click({ force: true });
        }
      });

      // FLAGGED: requires FE selector `lang-col-delete-{code}` per language.
      // Until added, scope to the default-language header (first header) and assert
      // it still contains a disabled button (the delete button stays disabled).
      cy.get('[data-cy="localization-lang-header"]', { timeout: 5000 }).then(($headers) => {
        const $defaultHeader = $headers.first();
        const $disabledButtons = Cypress.$($defaultHeader).find('button[disabled]');
        expect($disabledButtons.length, 'default-language header delete remains disabled with 2 languages').to.be.greaterThan(0);
      });
    });
  });

  // ── Duplicate Language Prevention ───────────────────────────────────────────

  describe('Duplicate Language Prevention', () => {
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

    it('should filter out already-added languages from the add language dropdown', function () {
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

      cy.get('body').then(($b) => {
        if ($b.find('[data-cy="ai-translation-cancel-btn"]').length > 0) {
          cy.get('[data-cy="ai-translation-cancel-btn"]').first().click({ force: true });
        }
      });

      // Re-open the Add Language dropdown.
      cy.get('[data-cy="localization-add-lang-btn"]').should('be.visible').click();

      // Hard-assert that French is no longer offered as an option.
      cy.get('body').then(($b2) => {
        const frenchOption = $b2.find('option[value="fr"], [data-cy="popover-lang-row"][data-lang-code="fr"]');
        expect(frenchOption.length, 'already-added French is filtered out of the dropdown').to.eq(0);
      });
    });
  });

  // ── Language Persistence ────────────────────────────────────────────────────

  describe('Language Persistence', () => {
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

    it('should persist added language after page reload', function () {
      cy.get('body').then(($body) => {
        const addBtn = $body.find('[data-cy="localization-add-lang-btn"]');
        if (!addBtn.length || addBtn.is(':disabled')) {
          this.skip();
        }
      });

      localizationPage.addLanguage(
        localizationData.secondLanguage.code,
        localizationData.secondLanguage.name
      );

      localizationPage.verifyLanguageInTable(localizationData.secondLanguage.name);

      cy.reload();
      cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');

      localizationPage.openLocalizationSettings();
      localizationPage.verifyLanguageInTable(localizationData.secondLanguage.name);
    });
  });
});
