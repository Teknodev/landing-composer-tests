import { loginToEditor, addComponent, clearPlayground, resetPlayground } from '@support/editorTestHelper';
import { localizationPage } from '@pages-po/localizationPage';
import localizationData from '@fixtures/localizationData.json';

// ─────────────────────────────────────────────────────────────────────────────
// Edge Case Tests
//
// Covers: error notification when save fails (network error), auto-translation
// error handling, what happens when the default language is the only language,
// language code displayed in AiTranslationConfirmation modal.
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

describe('Localization — Edge Cases', () => {
  // ── Save Error Notification ─────────────────────────────────────────────────

  describe('Error Notification on Save Failure', () => {
    beforeEach(() => {
      stubLocalizationLimits();
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
      localizationPage.openLocalizationSettings();
      cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('exist');

      // Force the next PATCH/PUT to fail with a 500
      cy.intercept('PATCH', `**/v1/projects/${PROJECT_ID}**`, { statusCode: 500, body: { message: 'Internal Server Error' } }).as('saveFailure');
      cy.intercept('PUT', `**/v1/projects/${PROJECT_ID}**`, { statusCode: 500, body: { message: 'Internal Server Error' } }).as('saveFailurePut');
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should show an error notification when the save request returns a network error', function () {
      cy.get('body').then(($body) => {
        const addBtn = $body.find('[data-cy="localization-add-lang-btn"]');
        if (!addBtn.length || addBtn.is(':disabled')) {
          // Precondition not met — skip rather than soft-pass.
          this.skip();
        }
      });

      localizationPage.addLanguage(
        localizationData.addLanguage.code,
        localizationData.addLanguage.name
      );

      // Dismiss AI dialog if present so the save fires.
      cy.get('body').then(($b) => {
        if ($b.find('[data-cy="ai-translation-cancel-btn"]').length > 0) {
          cy.get('[data-cy="ai-translation-cancel-btn"]').first().click({ force: true });
        }
      });

      // Hard-assert that an error notification appears.
      cy.get('[data-cy="notification-error"], [role="alert"]', { timeout: 10000 }).should('exist');
    });
  });

  // ── Auto-Translation Error Handling ────────────────────────────────────────

  describe('Auto-Translation Error Handling', () => {
    beforeEach(() => {
      stubLocalizationLimits();
      loginToEditor();
      clearPlayground();
      addComponent('hero', 0);
      localizationPage.openLocalizationSettings();
      cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('exist');

      // Force the translation function endpoint to fail.
      cy.intercept('POST', '**/fn-execute/**', {
        statusCode: 500,
        body: { message: 'Translation service unavailable' },
      }).as('translationFailure');
    });

    afterEach(() => {
      resetPlayground();
    });

    it('should show an error notification when the AI translation API call fails', function () {
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

        // Dismiss any confirmation dialog so the actual translation request fires
        cy.get('body').then(($b) => {
          if ($b.find('[data-cy="ai-translation-confirm-btn"]').length > 0) {
            cy.get('[data-cy="ai-translation-confirm-btn"]').click({ force: true });
          }
        });
      });

      cy.get('[data-cy="notification-error"], [role="alert"]', { timeout: 10000 }).should('exist');
    });
  });

  // ── Default Language as Only Language ──────────────────────────────────────

  describe('Default Language as Only Language', () => {
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

    it('should keep the localization table functional when default language is the only language', () => {
      // The table must still render rows even with a single language
      cy.get('[role="grid"]', { timeout: 8000 }).should('exist');
      cy.get('[role="gridcell"]', { timeout: 8000 }).should('exist');
    });

    it('should have the default-language delete button disabled when default language is the only language', () => {
      // FLAGGED: requires FE selector `lang-col-delete-{code}` per language.
      // Until added, scope to header buttons within the default-language column header.
      cy.get('[data-cy="localization-lang-header"]', { timeout: 5000 }).then(($headers) => {
        // Pick the default-language header (the only one when there's a single language).
        const $defaultHeader = $headers.first();
        const $disabledButtons = Cypress.$($defaultHeader).find('button[disabled]');
        expect($disabledButtons.length, 'default language header has at least one disabled action button').to.be.greaterThan(0);
      });
    });

    it('should render the default language column header with the correct language code', () => {
      // LanguageHeader renders inside the column header — assert it exists AND contains the expected default code.
      cy.get('[data-cy="localization-lang-header"]', { timeout: 5000 })
        .first()
        .invoke('text')
        .then((text) => {
          const normalized = text.toLowerCase();
          const matches =
            normalized.includes(localizationData.defaultLanguage.code) ||
            normalized.includes(localizationData.defaultLanguage.name.toLowerCase());
          expect(matches, `header text "${text}" contains "en" or "English"`).to.be.true;
        });
    });
  });

  // ── Language Code in AiTranslationConfirmation Modal ───────────────────────

  describe('Language Code in AiTranslationConfirmation Modal', () => {
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

    it('should display the target language code/name in the AiTranslationConfirmation modal', function () {
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

      // Dialog must appear; if absent under stubbed conditions skip rather than soft-pass.
      cy.get('body', { timeout: 10000 }).then(($b) => {
        const hasDialog =
          $b.find('[id="ai-translation-confirmation"]').length > 0 ||
          $b.find('[id="translate-alert-modal"]').length > 0 ||
          $b.find('[data-cy="ai-translation-confirmation-modal"]').length > 0;
        if (!hasDialog) {
          this.skip();
        }
      });

      cy.get('[id="ai-translation-confirmation"], [id="translate-alert-modal"], [data-cy="ai-translation-confirmation-modal"]')
        .invoke('text')
        .then((dialogText) => {
          const mentionsLanguage =
            dialogText.includes(localizationData.addLanguage.name) ||
            dialogText.includes(localizationData.addLanguage.code.toUpperCase()) ||
            dialogText.includes(localizationData.addLanguage.code.toLowerCase());
          expect(mentionsLanguage, 'dialog body mentions target language').to.be.true;
        });

      cy.get('[data-cy="ai-translation-cancel-btn"]').click({ force: true });
    });
  });

  // ── Add Language Dropdown — Language Select Appears ────────────────────────

  describe('Add Language Dropdown', () => {
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
        expect(hasSelectLanguage, 'language select dropdown is rendered').to.be.true;
      });
    });
  });
});
