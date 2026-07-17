/**
 * Regression: Localization popover language list must update without a page refresh
 * after add / remove / default-change actions performed via the pencil-icon flow.
 *
 * Bug context (now fixed):
 *   The popover-side <LocalizationProvider> in `right-icon-list.tsx` lives for the
 *   whole editor session, so its `initialLanguages` prop changes when the user adds
 *   or removes languages from <LocalizationSettings>. Before the fix, the provider
 *   captured `initialLanguages` only at mount time via useState(initial...) — so the
 *   popover never reflected newly-added / removed / re-defaulted languages until a
 *   hard refresh.
 *
 *   Fix: three useEffect hooks in `landing-composer/src/contexts/localization.tsx`
 *   sync internal `languages`, `currentLanguage`, `defaultLanguage` whenever the
 *   parent passes new initial* props.
 *
 * Selector gaps (TODO — orchestrator follow-up):
 *   - The LanguageHeader column actions (translate / regenerate / set-default /
 *     delete) in `landing-composer/src/pages/project/localization/components/molecules/LanguageHeader.tsx`
 *     have NO data-cy attributes. The tests below scope by the column header text
 *     ("Turkish") and pick action buttons by their position. Adding data-cy attrs
 *     such as `lang-col-set-default-btn-{code}` and `lang-col-remove-btn-{code}`
 *     would make this spec significantly more robust.
 *   - The popover `.languageSection` rows in `LocalizationManager.tsx` now
 *     expose `[data-cy="popover-lang-row"][data-lang-code="<code>"]`. Tests
 *     address language rows by ISO code rather than visible name (B1).
 */
import { loginToEditor } from '@support/editorTestHelper';
import { localizationPage } from '@pages-po/localizationPage';

const PROJECT_ID = '69f515295ac7bd7572f9590c';
const TEST_LANG_CODE = 'tr';
const TEST_LANG_NAME = 'Turkish';
const DEFAULT_LANG_CODE = 'en';
// Project baseline carries en/tr/ab seeded copy used by sibling specs
// (page-update-language-scoped.cy.js, language-toggle-render.cy.js).
// Cleanup MUST preserve all three so spec ordering doesn't matter.
const BASELINE_LANGS = ['en', 'tr', 'ab'];

// ─── API helper for cleanup (best-effort, never hard-fails) ────────────────

/**
 * Reset project languages via the Spica REST API. Used as both a precondition
 * (reset to ["en"] so the ADD test starts clean) and a teardown (restore to
 * BASELINE_LANGS so sibling specs — page-update-language-scoped,
 * language-toggle-render — find en/tr/ab present). Bypasses the UI to keep
 * cleanup fast.
 *
 * Auth token is read from the editor's localStorage (key: "token") which is
 * already populated by `loginToEditor` via cy.session().
 */
const resetProjectLanguagesViaApi = (langs) => {
  cy.window({ log: false }).then((win) => {
    const token = win.localStorage?.getItem('token');
    if (!token) {
      cy.log('[cleanup] No auth token in localStorage — skipping API reset.');
      return;
    }
    // R6 backend-timeout retry pattern: bump to 60s + retryOnStatusCodeFailure
    // so slow /fn-execute/* roundtrips under CI load don't abort the cleanup.
    cy.request({
      method: 'PATCH',
      url: `http://localhost:4501/api/fn-execute/v1/projects/${PROJECT_ID}/languages`,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: {
        current_language: DEFAULT_LANG_CODE,
        default_language: DEFAULT_LANG_CODE,
        languages: langs,
      },
      failOnStatusCode: false,
      retryOnStatusCodeFailure: true,
      timeout: 60000,
    }).then((res) => {
      // Guard status field — failOnStatusCode:false still yields res, but
      // retryOnStatusCodeFailure can produce a res with no .status on a
      // network error after retries are exhausted.
      const status = res && typeof res.status === 'number' ? res.status : null;
      if (status !== null && status >= 200 && status < 300) {
        cy.log(`[cleanup] Reset project languages to ${JSON.stringify(langs)} OK.`);
      } else {
        cy.log(`[cleanup] Non-2xx status (${status || 'n/a'}) from reset; continuing.`);
      }
    });
  });
};

/**
 * Stub locale limits so the LOCALE_COUNT cap doesn't disable the "+ Add New"
 * button mid-test. Mirrors the helper used in the existing localization spec.
 */
const stubLocalizationLimits = () => {
  cy.intercept('GET', `**/v1/projects/${PROJECT_ID}**`, (req) => {
    req.continue((res) => {
      if (res.body?.data?.limitsAndUsage) {
        res.body.data.limitsAndUsage['LOCALE_COUNT'] = { limit: 99, usage: 0 };
      }
    });
  }).as('getProjectWithLocaleLimit');
};

// ─── Popover helpers ───────────────────────────────────────────────────────

/**
 * Open the localization popover (Globe icon) WITHOUT navigating to the
 * full settings overlay. Tests use this to inspect the popover language
 * list directly.
 */
const openPopover = () => {
  cy.get('[data-cy="toolbar-icon-localization"]', { timeout: 15000 })
    .should('be.visible')
    .click();
  // The WMenu (MUI Menu) portals to body. Wait for the LocalizationManager
  // edit pencil to be present — that proves the popover is mounted.
  cy.get('[data-cy="localization-edit-btn"]', { timeout: 5000 }).should('be.visible');
};

/**
 * Close the popover by pressing Escape. WMenu listens to this on the
 * document. We explicitly wait until the pencil icon is gone to avoid
 * race conditions before re-opening.
 */
const closePopover = () => {
  cy.get('body').type('{esc}');
  cy.get('[data-cy="localization-edit-btn"]').should('not.exist');
};

/**
 * Open the full localization settings overlay (LocalizationSettings page)
 * by clicking the pencil icon inside the popover.
 */
const openSettingsOverlay = () => {
  cy.get('[data-cy="localization-edit-btn"]', { timeout: 5000 })
    .should('be.visible')
    .click({ force: true });
  cy.get('[data-cy="localization-settings-page"]', { timeout: 15000 }).should('be.visible');
};

/**
 * Close the overlay popup via the modal-close-btn (top-right X).
 */
const closeSettingsOverlay = () => {
  cy.get('[data-cy="localization-settings-page"]', { timeout: 5000 }).should('exist');
  cy.get('[data-cy="modal-close-btn"]').first().click({ force: true });
  cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('not.exist');
};

/**
 * Add `tr` (Turkish) via the "+ Add New" flow inside the settings overlay.
 * Dismisses the AI Translation Confirmation modal that pops up after save.
 */
const addTurkishLanguage = () => {
  cy.get('[data-cy="localization-add-lang-btn"]', { timeout: 10000 })
    .should('be.visible')
    .click();

  // The "+ Add New" button is replaced by a Select dropdown with placeholder
  // "Select Language". Type "Turkish" into the search input then click the
  // option in the dropdown.
  cy.get('input[placeholder="Select Language"]', { timeout: 5000 })
    .should('be.visible')
    .clear()
    .type(TEST_LANG_NAME);

  // The dropdown renders matching options. Pick the row by its language code
  // via the data-cy/data-lang-code contract (B1).
  cy.get(`[data-cy="popover-lang-row"][data-lang-code="${TEST_LANG_CODE}"]`, { timeout: 5000 })
    .filter(':visible')
    .first()
    .click({ force: true });

  // The AiTranslationConfirmation modal appears once the language is saved.
  cy.get('[data-cy="ai-translation-confirmation-modal"]', { timeout: 15000 }).should('be.visible');
  cy.get('[data-cy="ai-translation-cancel-btn"]').click({ force: true });
  cy.get('[data-cy="ai-translation-confirmation-modal"]').should('not.exist');

  // Confirm the column header for Turkish is now in the table.
  cy.get('[data-cy="localization-settings-page"]')
    .contains(TEST_LANG_NAME, { timeout: 10000 })
    .should('be.visible');
};

/**
 * Find the LanguageHeader DOM block for `langName` (e.g. "Turkish") inside
 * the open settings overlay. Returns a chained cy.contains selector that the
 * caller can `.parents()` from to find sibling action buttons.
 *
 * The LanguageHeader renders: <Select with langName as text> + .actions
 *   .actions has 4 buttons in order:
 *     [0] Translate  [1] Regenerate  [2] Set Default  [3] Delete
 *
 * We scope by the `selected` displayed text in the column-header Select.
 */
const findLangHeaderActions = (langName) =>
  cy
    .get('[data-cy="localization-settings-page"]')
    .contains('div', langName, { timeout: 10000 })
    // climb to the LanguageHeader root (the cell that contains both Select
    // and the .actions div).
    .parentsUntil('[data-cy="localization-settings-page"]')
    .filter(':has(button)')
    .first();

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Localization Popover - Live Sync (Regression)', () => {
  beforeEach(() => {
    stubLocalizationLimits();
    loginToEditor();
    // Wait for the toolbar to be ready before each test.
    cy.get('[data-cy="toolbar-icon-localization"]', { timeout: 30000 }).should('be.visible');
    // Precondition: ADD test needs TR absent. Reset languages to ["en"] only.
    try {
      resetProjectLanguagesViaApi([DEFAULT_LANG_CODE]);
    } catch (err) {
      cy.log(`[precondition] Reset failed: ${err?.message || err}`);
    }
  });

  afterEach(() => {
    // Restore the project's baseline language set so sibling localization
    // specs (page-update-language-scoped, language-toggle-render) start with
    // en/tr/ab present. Never let cleanup mask the real test failure.
    try {
      resetProjectLanguagesViaApi(BASELINE_LANGS);
    } catch (err) {
      cy.log(`[cleanup] Reset failed: ${err?.message || err}`);
    }
  });

  it('reflects an ADDED language in the popover list without a page refresh', () => {
    // Sanity: popover starts with only English.
    openPopover();
    cy.get(`[data-cy="popover-lang-row"][data-lang-code="${TEST_LANG_CODE}"]`).should('not.exist');

    // Open the settings overlay via the pencil icon.
    openSettingsOverlay();

    // Add Turkish; AI Translation modal is auto-cancelled inside the helper.
    addTurkishLanguage();

    // Close the overlay — back to the editor with no refresh.
    closeSettingsOverlay();

    // Re-open the popover and assert Turkish is now listed.
    openPopover();
    cy.get(`[data-cy="popover-lang-row"][data-lang-code="${TEST_LANG_CODE}"]`, { timeout: 10000 }).should('be.visible');

    closePopover();
  });

  it('reflects a REMOVED language in the popover list without a page refresh', () => {
    // First add Turkish so we can later remove it (the default lang cannot
    // be removed; Turkish becomes the only non-default removable lang).
    openPopover();
    openSettingsOverlay();
    addTurkishLanguage();

    // Find the Delete button on the Turkish column header.
    // .actions order: Translate, Regenerate, Set Default, Delete (index 3).
    findLangHeaderActions(TEST_LANG_NAME)
      .find('button')
      .then(($btns) => {
        // Some buttons may be wrapped in <Select>'s control; the four header
        // action buttons live in `.actions` and trail the Select. Take the
        // last 4 buttons under the language header — that's
        // [translate, regenerate, set-default, delete].
        const actionBtns = $btns.slice(-4);
        // Click the delete (last) button.
        cy.wrap(actionBtns.last()).click({ force: true });
      });

    // Confirm Turkish column is gone from the settings table.
    cy.get('[data-cy="localization-settings-page"]')
      .contains(TEST_LANG_NAME)
      .should('not.exist');

    closeSettingsOverlay();

    // Re-open the popover and assert Turkish is gone from the list.
    openPopover();
    cy.get(`[data-cy="popover-lang-row"][data-lang-code="${TEST_LANG_CODE}"]`).should('not.exist');
    // Sanity: English (default) still visible.
    cy.get(`[data-cy="popover-lang-row"][data-lang-code="${DEFAULT_LANG_CODE}"]`).should('be.visible');

    closePopover();
  });

  it('reflects a DEFAULT-LANGUAGE change in the popover list without a page refresh', () => {
    openPopover();
    openSettingsOverlay();
    addTurkishLanguage();

    // Click "Set Default" (index 2 of the trailing 4 action buttons) on the
    // Turkish column header.
    findLangHeaderActions(TEST_LANG_NAME)
      .find('button')
      .then(($btns) => {
        const actionBtns = $btns.slice(-4);
        // Set Default is the 3rd of 4 action buttons.
        cy.wrap(actionBtns.eq(2)).click({ force: true });
      });

    // After save the success toast may appear; we don't depend on it.
    // Allow the network round-trip for setDefaultLanguage to settle.
    cy.wait(1500);

    closeSettingsOverlay();

    // Re-open the popover; Turkish must still be listed (proves the list
    // sync wasn't broken by the default change).
    openPopover();
    cy.get(`[data-cy="popover-lang-row"][data-lang-code="${TEST_LANG_CODE}"]`, { timeout: 10000 }).should('be.visible');

    // FLAGGED: requires FE selector
    //   [data-cy="popover-lang-default-icon"][data-lang-code="<code>"]
    // on the TickCircle button rendered for the default language row.
    //
    // Strong assertion contract (once FE adds the selector):
    //   - Turkish row shows the default-icon → present.
    //   - English row no longer shows the default-icon → absent.
    cy.get(`[data-cy="popover-lang-default-icon"][data-lang-code="${TEST_LANG_CODE}"]`, { timeout: 10000 })
      .should('be.visible');
    cy.get(`[data-cy="popover-lang-default-icon"][data-lang-code="${DEFAULT_LANG_CODE}"]`)
      .should('not.exist');

    closePopover();
  });
});
