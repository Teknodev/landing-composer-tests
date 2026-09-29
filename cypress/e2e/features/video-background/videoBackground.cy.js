import { addComponent, clearPlayground, resetPlayground } from '@support/editorTestHelper';

/**
 * Video Background E2E Tests
 *
 * Covers the Video tab in the Background category of the Design tab.
 * Video backgrounds store configuration as CSS custom properties
 * (--bg-video-url, --bg-video-loop, etc.) and inject <video> DOM
 * elements via the applyVideoBackgrounds() layer.
 *
 * Test coverage:
 *   - Setting a video URL and verifying the preview appears
 *   - Removing a video via the remove button
 *   - Verifying playback toggle controls exist
 *   - Verifying state persists after page refresh (hydration)
 */

// ── Helpers ─────────────────────────────────────────────────────

const TEST_VIDEO_URL = 'https://samplelib.com/mp4/sample-5s.mp4';

/**
 * Set the value of a React-controlled input atomically (bypasses
 * character-by-character re-render issues with conditional rendering).
 */
const setReactInputValue = (selector) => {
  cy.get(selector).then(($input) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    nativeInputValueSetter.call($input[0], TEST_VIDEO_URL);
    $input[0].dispatchEvent(new Event('input', { bubbles: true }));
    $input[0].dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const openEditor = () => {
  cy.login();
  cy.request('POST', `${Cypress.env('API_URL')}/fn-execute/v1/auth/login`, {
    email: Cypress.env('AUTH_USERNAME'),
    password: Cypress.env('AUTH_PASSWORD'),
  }).then(({ body }) => {
    cy.getTestProjectId().then((projectId) => {
      cy.visit(`/project/${projectId}/editor/0`, {
        onBeforeLoad: (win) => win.localStorage.setItem('user_onboarding_dismissed', body.user._id),
      });
    });
  });
  cy.get('[data-component-index], [data-cy="add-component-placeholder"]', { timeout: 30000 }).should('exist');
};

const expandBackgroundSection = () => {
  cy.get('[data-cy="category-section-background"]', { timeout: 10000 })
    .scrollIntoView()
    .then(($section) => {
      if (!$section.children().last().is(':visible')) {
        cy.wrap($section.children().first()).click();
      }
    });
  cy.get('[data-cy="video-bg-tab-video"]', { timeout: 5000 }).should('be.visible');
};

const openBackgroundPanel = (treeNodeTitleId) => {
  cy.get('[data-component-index="0"]', { timeout: 10000 }).click({ force: true });
  cy.wait(500);

  cy.get('[data-cy="tab-DESIGN"]', { timeout: 5000 }).should('be.visible').click();
  cy.wait(500);

  cy.get('[data-component-index="0"]').within(() => {
    cy.get('[data-cy="blinkpage-tag"]').first().click({ force: true });
  });
  cy.wait(500);

  if (treeNodeTitleId) {
    cy.get(`[data-cy="${treeNodeTitleId}"]`, { timeout: 10000 }).first().scrollIntoView().click();
    cy.wait(500);
  }

  expandBackgroundSection();
};

/**
 * Click the "Video" tab inside the Background section's SegmentedTab.
 */
const switchToVideoTab = () => {
  // SegmentedTab renders buttons with the option label text.
  // The button may be clipped by an overflow-hidden panel — force click to reach it.
  cy.get('[data-cy="video-bg-tab-video"]').scrollIntoView().click({ force: true });
  cy.wait(300);
};

const setVideoUrl = () => {
  cy.get('[data-cy="video-bg-empty"]', { timeout: 5000 }).scrollIntoView().click({ force: true });
  cy.get('[data-cy="upload-popover-rail-item-link"]', { timeout: 5000 }).click({ force: true });
  cy.get('[data-cy="video-bg-url-input"]').should('be.visible');
  setReactInputValue('[data-cy="video-bg-url-input"]');
  cy.get('[data-cy="video-bg-url-add"]').should('not.be.disabled').click({ force: true });
  cy.get('[data-cy="upload-popover-save"]', { timeout: 5000 }).click({ force: true });
};

// ── Setting Video URL ───────────────────────────────────────────

describe('Video Background - Set & Remove', () => {
  beforeEach(() => {
    openEditor();
    clearPlayground();
    addComponent('hero', 0);
  });

  afterEach(() => {
    resetPlayground();
  });

  it('should show the empty-URL state (panel + input visible, no preview) on the Video tab', () => {
    openBackgroundPanel();
    switchToVideoTab();

    cy.get('[data-cy="video-bg-panel"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-cy="video-bg-empty"]').should('be.visible');
    cy.get('[data-cy="video-bg-preview"]').should('not.exist');
  });

  it('should show the video preview, URL edit field, and playback toggles after entering a URL', () => {
    openBackgroundPanel();
    switchToVideoTab();

    setVideoUrl();

    cy.wait(1000);

    // Preview should appear
    cy.get('[data-cy="video-bg-preview"]', { timeout: 5000 }).should('be.visible');

    // URL edit input should show the URL
    cy.get('[data-cy="video-bg-url-edit"]').should('have.value', TEST_VIDEO_URL);

    // Playback toggles should be visible
    cy.get('[data-cy="video-bg-toggles"]').should('be.visible');
  });

  it('should remove video when clicking the remove button', () => {
    openBackgroundPanel();
    switchToVideoTab();

    setVideoUrl();

    cy.wait(1000);

    // Preview should appear
    cy.get('[data-cy="video-bg-preview"]', { timeout: 5000 }).should('be.visible');

    // Click remove button (hover overlay)
    cy.get('[data-cy="video-bg-remove-btn"]').click({ force: true });
    cy.get('[data-cy="video-bg-preview"]', { timeout: 5000 }).should('not.exist');

    switchToVideoTab();
    cy.get('[data-cy="video-bg-empty"]', { timeout: 5000 }).should('be.visible');
    cy.get('[data-cy="video-bg-preview"]').should('not.exist');
  });
});

describe('Video Background - Base wrapper selected from Design Tree', () => {
  beforeEach(() => {
    openEditor();
    clearPlayground();
    addComponent('intro', 0);
  });

  afterEach(() => {
    resetPlayground();
  });

  it('M1: should inject a background video into Base.MaxContent selected from the Design Tree', () => {
    openBackgroundPanel('tree-node-title-max-content');
    switchToVideoTab();
    setVideoUrl();

    cy.get('[data-cy="video-bg-preview"]', { timeout: 10000 }).should('exist');

    cy.get('[data-component-index="0"] [data-element-category="base.MaxContent"]', { timeout: 10000 })
      .first()
      .find('video[data-bg-video]', { timeout: 10000 })
      .should('exist');
  });
});

// ── State Persistence ───────────────────────────────────────────

describe('Video Background - Persistence', () => {
  beforeEach(() => {
    openEditor();
    clearPlayground();
    addComponent('hero', 0);
  });

  afterEach(() => {
    resetPlayground();
  });

  it('should restore the Video tab panel, preview, and URL value after page refresh', () => {
    openBackgroundPanel();
    switchToVideoTab();

    setVideoUrl();

    cy.wait(1500);

    // Confirm preview is showing
    cy.get('[data-cy="video-bg-preview"]', { timeout: 5000 }).should('be.visible');

    // Reload the page
    cy.reload();
    cy.wait(3000);

    // Re-open the design tab and background
    openBackgroundPanel();

    // The Video tab should auto-select (hydration from saved CSS vars)
    cy.get('[data-cy="video-bg-panel"]', { timeout: 10000 }).should('be.visible');

    // Preview should still be showing
    cy.get('[data-cy="video-bg-preview"]').should('be.visible');

    // URL should be preserved
    cy.get('[data-cy="video-bg-url-edit"]').should('have.value', TEST_VIDEO_URL);
  });
});
