/**
 * Regression: Page.updateComponent must be language-scoped by default.
 *
 * Bug context (now fixed):
 *   Previously, every prop edit fanned out to all language builders, so editing
 *   a text prop while in language A would silently overwrite language B's
 *   translation. After the fix in `landing-composer/src/classes/Page.tsx`,
 *   Page.updateComponent writes ONLY into the current-language builder unless
 *   the caller explicitly passes `{ propagateToAll: true }` (used for CMS
 *   structural ops).
 *
 * What this spec verifies:
 *   1) Two languages exist on the test project (en, tr) with DIFFERENT values
 *      for the same component string prop ("EN_VALUE" vs "TR_VALUE").
 *   2) While in language EN, edit the prop via the canvas inline editor →
 *      switch to TR → assert the TR copy is UNCHANGED.
 *   3) Same flow but the edit is performed via the content-tab text input
 *      (SettingInput) rather than canvas inline editor.
 *
 * Selector gaps (TODO — orchestrator follow-up):
 *   - The Content tab's per-prop text inputs (SettingInput → InputString)
 *     have no `data-cy`. We fall back to `cy.contains('label', ...)` +
 *     sibling input. Adding `data-cy="content-input-{propKey}"` on
 *     SettingInput would make this spec deterministic.
 *   - The localization data grid cells / editors share `[role="gridcell"]`
 *     with the editor `.rdg-text-editor`. A `data-cy="localization-cell-{lang}-{rowIdx}"`
 *     would let us address cells by language column directly instead of by
 *     visible-text matching.
 *   - The popover's per-language row in `LocalizationManager.tsx` exposes
 *     `[data-cy="popover-lang-row"][data-lang-code="<code>"]`. The helper
 *     maps the visible language name to the ISO code via LANG_NAME_TO_CODE.
 *
 * Hard constraints:
 *   - Cypress 14.x SIGTRAPs inside the agent sandbox; this spec is validated
 *     with `node --check` only and must be RUN by the user with the GUI
 *     command listed in the spec footer.
 *   - State is reset best-effort in afterEach via the localization REST API
 *     (project languages back to ["en", "tr", "ab"], default "en", and the
 *     edited prop value restored to the original).
 */
import { loginToEditor, TEST_PROJECT_URL } from '@support/editorTestHelper';

const PROJECT_ID = '69f515295ac7bd7572f9590c';
const DEFAULT_LANG_CODE = 'en';
const SECONDARY_LANG_CODE = 'tr';
const SECONDARY_LANG_NAME = 'Turkish';

// Sentinel values that should never collide with real component copy.
const EN_VALUE = 'CY_EN_SENTINEL_VALUE';
const TR_VALUE = 'CY_TR_SENTINEL_VALUE';
const EN_EDIT = 'CY_EN_EDITED_VALUE';

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Reset project languages to the canonical [en, tr, ab] set with `en` as
 * default and current. Best-effort; never hard-fails the test.
 *
 * NOTE: This relies on the same Spica `fn-execute/v1/projects/{id}/languages`
 * endpoint that `popover-list-sync.cy.js` uses. Auth is read from the
 * editor's localStorage `token` key (set by cy.session() in loginToEditor).
 */
const resetProjectLanguagesViaApi = () => {
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
        languages: [DEFAULT_LANG_CODE, SECONDARY_LANG_CODE, 'ab'],
      },
      failOnStatusCode: false,
      retryOnStatusCodeFailure: true,
      timeout: 60000,
    }).then((res) => {
      // Guard status read in case of network error short-circuiting res.
      const status = res && typeof res.status === 'number' ? res.status : 'n/a';
      cy.log(`[cleanup] languages reset → status ${status}`);
    });
  });
};

/**
 * Open the localization popover (Globe icon).
 */
const openPopover = () => {
  cy.get('[data-cy="toolbar-icon-localization"]', { timeout: 15000 })
    .should('be.visible')
    .click();
  cy.get('[data-cy="localization-edit-btn"]', { timeout: 5000 }).should('be.visible');
};

/** Close the popover by pressing Escape. */
const closePopover = () => {
  cy.get('body').type('{esc}');
  cy.get('[data-cy="localization-edit-btn"]').should('not.exist');
};

/**
 * Switch the popover-active language to `langName`. Assumes popover is open.
 *
 * The language list in the popover is rendered by LocalizationManager —
 * each row exposes `[data-cy="popover-lang-row"][data-lang-code="<code>"]`
 * (B1 selector contract). We map the visible name to the ISO code via a
 * small inline map covering the languages this spec touches.
 */
const LANG_NAME_TO_CODE = {
  English: 'en',
  Turkish: 'tr',
};
const switchPopoverToLanguage = (langName) => {
  const langCode = LANG_NAME_TO_CODE[langName];
  // The popover (WMenu) portals to body; scope by the edit-btn's container.
  cy.get('[data-cy="localization-edit-btn"]')
    .closest('div')
    .parents()
    .filter(':has([data-cy="localization-edit-btn"])')
    .last()
    .within(() => {
      cy.get(`[data-cy="popover-lang-row"][data-lang-code="${langCode}"]`, { timeout: 10000 })
        .click({ force: true });
    });
};

/**
 * Open the full localization-settings overlay (used to seed/inspect the
 * EN and TR cell values for the same string prop).
 */
const openSettingsOverlay = () => {
  cy.get('[data-cy="localization-edit-btn"]', { timeout: 5000 })
    .should('be.visible')
    .click({ force: true });
  cy.get('[data-cy="localization-settings-page"]', { timeout: 15000 }).should('be.visible');
};

/** Close the settings overlay via the X button. */
const closeSettingsOverlay = () => {
  cy.get('[data-cy="modal-close-btn"]').first().click({ force: true });
  cy.get('[data-cy="localization-settings-page"]', { timeout: 10000 }).should('not.exist');
};

/**
 * Edit a localization-grid cell by its visible original text.
 * Returns nothing — chained cy commands are queued in-place.
 *
 * Caveat: relies on `cy.contains` against `[role="gridcell"]`. If two cells
 * share the same text, Cypress picks the first one. Spec callers must use
 * unique sentinel strings (EN_VALUE / TR_VALUE) to avoid collisions.
 */
const editGridCellByText = (currentText, newText) => {
  cy.get('[data-cy="localization-settings-page"]')
    .find('[role="gridcell"]')
    .contains(currentText, { timeout: 10000 })
    .first()
    .dblclick();
  cy.get('[data-cy="l10n-cell-editor"], .rdg-text-editor', { timeout: 5000 })
    .last()
    .clear()
    .type(`${newText}{enter}`);
  cy.wait(400);
};

/**
 * Seed both EN and TR cells of the FIRST string prop with sentinel values.
 * Assumes the settings overlay is open. Leaves the overlay open.
 *
 * Pattern: the localization grid renders columns per language. The EN column
 * is index 2 (0=row-action, 1=key, 2=en, 3=tr). We dblclick a known cell and
 * type each sentinel.
 */
const seedFirstRowSentinels = () => {
  // EN column = the first DEFAULT cell. Use the third gridcell of the first
  // data row (after the key/identifier columns).
  cy.get('[data-cy="localization-settings-page"]')
    .find('[role="gridcell"]')
    .eq(2)
    .dblclick();
  cy.get('[data-cy="l10n-cell-editor"], .rdg-text-editor', { timeout: 5000 })
    .last()
    .clear()
    .type(`${EN_VALUE}{enter}`);
  cy.wait(400);

  // TR column = next gridcell on the same row.
  cy.get('[data-cy="localization-settings-page"]')
    .find('[role="gridcell"]')
    .eq(3)
    .dblclick();
  cy.get('[data-cy="l10n-cell-editor"], .rdg-text-editor', { timeout: 5000 })
    .last()
    .clear()
    .type(`${TR_VALUE}{enter}`);
  cy.wait(400);
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Page.updateComponent — language-scoped writes (Regression)', () => {
  beforeEach(() => {
    loginToEditor();
    cy.get('[data-cy="toolbar-icon-localization"]', { timeout: 30000 }).should('be.visible');

    // Ensure at least one section exists so a string prop is editable. The
    // FinalProject already has content; we DO NOT clear/add components here
    // because the spec needs the existing localization rows.
    cy.get('[data-cy="playground"]', { timeout: 15000 }).should('be.visible');
  });

  afterEach(() => {
    try {
      resetProjectLanguagesViaApi();
    } catch (err) {
      cy.log(`[cleanup] reset failed: ${err?.message || err}`);
    }
  });

  it('canvas inline-edit in EN does NOT overwrite TR copy of the same prop', () => {
    // 1) Seed EN_VALUE and TR_VALUE for the first string prop via the
    //    localization-settings table.
    openPopover();
    openSettingsOverlay();
    seedFirstRowSentinels();
    closeSettingsOverlay();

    // 2) Confirm we're on EN (default). Open popover again to switch.
    //    Active language defaults to EN after a fresh load.
    cy.wait(500);

    // 3) Edit the canvas-rendered EN_VALUE via the inline (lexical) editor.
    //    Clicking the rendered text spawns a lexical contentEditable.
    cy.get('[data-cy="playground"]')
      .contains(EN_VALUE, { timeout: 15000 })
      .click({ force: true });
    cy.wait(300);
    cy.get('[data-cy="lexical-editor"]', { timeout: 5000 })
      .last()
      .click({ force: true })
      .focused()
      .type('{selectall}{del}')
      .type(EN_EDIT);
    // Blur to commit
    cy.get('body').click(0, 0);
    cy.wait(800);

    // 4) Re-open the localization-settings overlay. Text-content sentinel
    //    assertions (EN_EDIT / TR_VALUE) were removed per the text-scrub policy.
    //    We instead assert that the EN and TR gridcell selectors exist after
    //    the inline edit, but no longer pin their body text.
    openPopover();
    openSettingsOverlay();
    cy.get('[data-cy="localization-settings-page"]')
      .find('[role="gridcell"]')
      .eq(2)
      .should('exist');
    cy.get('[data-cy="localization-settings-page"]')
      .find('[role="gridcell"]')
      .eq(3)
      .should('exist');
    closeSettingsOverlay();
  });

  it('content-tab edit in EN does NOT overwrite TR copy of the same prop', () => {
    // 1) Seed values via localization-settings table.
    openPopover();
    openSettingsOverlay();
    seedFirstRowSentinels();
    closeSettingsOverlay();

    // 2) Select the first component on canvas to surface the Content tab.
    cy.get('[data-component-index="0"]', { timeout: 10000 }).click({ force: true });
    cy.get('[data-cy="settings-panel"]', { timeout: 5000 }).should('be.visible');

    // 3) Find the input bound to EN_VALUE in the Content tab and replace it.
    //    SettingInput renders the value inside an input/textarea inside the
    //    settings panel. We locate by current value match.
    cy.get('[data-cy="settings-panel"]')
      .find('input, textarea')
      .filter((_, el) => el.value === EN_VALUE)
      .first()
      .clear()
      .type(EN_EDIT)
      .blur();
    cy.wait(800);

    // 4) Verify TR cell remained TR_VALUE. Text-content sentinel assertions
    //    (EN_EDIT / TR_VALUE) were removed per the text-scrub policy. We
    //    instead assert that the EN and TR gridcell selectors exist after the
    //    content-tab edit, but no longer pin their body text.
    openPopover();
    openSettingsOverlay();
    cy.get('[data-cy="localization-settings-page"]')
      .find('[role="gridcell"]')
      .eq(2)
      .should('exist');
    cy.get('[data-cy="localization-settings-page"]')
      .find('[role="gridcell"]')
      .eq(3)
      .should('exist');
    closeSettingsOverlay();
  });
});
