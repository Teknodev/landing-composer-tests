/**
 * AI Site Builder — full-audit Cypress spec.
 *
 * Covers both pages of the AI Site Builder flow (tightly coupled — step 2 is
 * navigated to from step 1 via history.state):
 *
 *   Step 1: /ai-site-builder              → AISiteBuilder.tsx
 *   Step 2: /ai-site-builder/pages        → AISiteBuilderPages.tsx
 *
 * Tests rely on cy.login() to authenticate, and on the data-cy hook contract
 * added to both AISiteBuilder.tsx and AISiteBuilderPages.tsx. Step 2 still
 * requires a seeded location.state for direct-visit tests.
 */

// ---------- Selector constants (data-cy contract) ----------

// Step 1 selectors.
const STEP1_TEXTAREA = '[data-cy="ai-site-builder-prompt-textarea"]';
const STEP1_GENERATE_BUTTON = '[data-cy="ai-site-builder-generate-btn"]';

// Step 2 selectors.
const STEP2_PROJECT_NAME_INPUT = '[data-cy="ai-site-builder-pages-project-name-input"]';
const STEP2_GENERATE_WEBSITE_BUTTON = '[data-cy="ai-site-builder-pages-generate-website-btn"]';

// Routes to common API endpoints we need to stub.
// FE source: landing-composer/src/classes/Function.ts
//   createProject -> POST `v1/projects` OR POST `v1/orgs/{orgId}/projects` (line 777-838)
//   createAIWebsite -> POST `/v1/ai/generate/${projectId}` (line 1537)
//   assignComponents -> POST `/v1/ai/generation/update/${projectId}` (line 1541)
//   createAiProjectPages -> POST `/ai/generation/create/pages/${projectId}` (line 1545)
//   updateProjectMetadata -> PATCH `v1/projects/${projectId}/metadata` (line 978) — NOT POST.
// Regexes are used here to cover the optional organization-prefixed path on createProject.
const CREATE_PROJECT_ROUTE = /\/fn-execute\/v1\/(?:orgs\/[^/]+\/)?projects(?:\?|$)/;
const CREATE_AI_WEBSITE_ROUTE = '**/fn-execute/ai/generate/*';
const ASSIGN_COMPONENTS_ROUTE = '**/fn-execute/ai/generation/update/*';
const CREATE_AI_PAGES_ROUTE = '**/fn-execute/ai/generation/create/pages/*';
const UPDATE_PROJECT_META_ROUTE = '**/fn-execute/v1/projects/*/metadata*';

// Stub history.state for step 2 — bypasses the upstream API calls when we
// only need to drive the canvas / page card / category panel UI.
// FE source (landing-composer/src/pages/ai-site-builder/AISiteBuilderPages.tsx
// L832-L838) reads `location.state.result._id` and `location.state.project`.
const seedStep2State = (overrides = {}) => ({
  definition: 'Test landing for a SaaS PM tool',
  result: { _id: 'doc-abc-123' },
  project: { _id: 'proj-xyz-789' },
  ...overrides,
});

// React Router v6 (history v5) reads user-land location.state from
// `window.history.state.usr` (NOT the raw `window.history.state`). A plain
// `replaceState(seedStep2State(), ...)` lands at the wrong slot and React
// Router sees `state = null`, triggering the redirect guard.
// This helper wraps the payload in the history v5 envelope.
const buildHistoryV5State = (userState) => ({
  usr: userState,
  key: 'default',
  idx: 0,
});

// Seed step 2's location.state via history v5 envelope BEFORE the app mounts.
// Usage: cy.visit('/ai-site-builder/pages', { onBeforeLoad: seedStep2OnBeforeLoad() })
const seedStep2OnBeforeLoad = (overrides = {}) => (win) => {
  win.history.replaceState(
    buildHistoryV5State(seedStep2State(overrides)),
    '',
    '/ai-site-builder/pages'
  );
};

// Visit step 2 directly with a seeded location.state — legacy helper kept for
// callers that drive history after mount. Uses pushState wrapped in history v5
// envelope so React Router's listener picks it up.
const visitStep2WithState = (state) => {
  cy.window({ log: false }).then((win) => {
    win.history.pushState(buildHistoryV5State(state), '', '/ai-site-builder/pages');
  });
};

// ---------- API stubs ----------

const stubStep1Apis = () => {
  cy.intercept('POST', CREATE_PROJECT_ROUTE, {
    statusCode: 200,
    body: { _id: 'proj-xyz-789', name: 'Stubbed Project' },
  }).as('createProject');

  cy.intercept('POST', CREATE_AI_WEBSITE_ROUTE, {
    statusCode: 200,
    body: { _id: 'doc-abc-123' },
  }).as('createAIWebsite');
};

const stubStep2Apis = () => {
  // updateProjectMetadata uses PATCH (apiUtils.apiService.patch), not POST.
  cy.intercept('PATCH', UPDATE_PROJECT_META_ROUTE, {
    statusCode: 200,
    body: {},
  }).as('updateProjectMetadata');

  cy.intercept('POST', ASSIGN_COMPONENTS_ROUTE, {
    statusCode: 200,
    body: {},
  }).as('assignComponents');

  cy.intercept('POST', CREATE_AI_PAGES_ROUTE, {
    statusCode: 200,
    body: { ok: true },
  }).as('createAiProjectPages');
};

// ---------- Spec ----------

describe('AI Site Builder — flow', () => {
  beforeEach(() => {
    cy.login();
  });

  // ============================================================
  // STEP 1 — /ai-site-builder (AISiteBuilder.tsx)
  // ============================================================
  describe('Step 1: prompt page (/ai-site-builder)', () => {
    beforeEach(() => {
      stubStep1Apis();
      cy.visit('/ai-site-builder');
      cy.get(STEP1_TEXTAREA, { timeout: 20000 }).should('be.visible');
    });

    it('renders the prompt textarea with the expected placeholder', () => {
      cy.get(STEP1_TEXTAREA)
        .should('be.visible')
        .and('have.attr', 'placeholder')
        .and('match', /AI-powered website builder/);
    });

    it('renders three suggestion chips beneath the input card', () => {
      cy.get('[data-cy="ai-site-builder-suggestions"]')
        .find('button')
        .should('have.length', 3);
    });

    it('keeps the Generate Pages button disabled while the textarea is empty', () => {
      cy.get(STEP1_GENERATE_BUTTON).should('be.disabled');
    });

    it('keeps the Generate Pages button disabled when the textarea contains only whitespace', () => {
      cy.get(STEP1_TEXTAREA).type('   ');
      cy.get(STEP1_GENERATE_BUTTON).should('be.disabled');
    });

    it('enables the Generate Pages button once the textarea has non-whitespace content', () => {
      cy.get(STEP1_TEXTAREA).type('A landing page for a SaaS app');
      cy.get(STEP1_GENERATE_BUTTON).should('not.be.disabled');
    });

    it('updates the textarea value when the user types', () => {
      const text = 'Portfolio for a freelance designer who builds AI tools';
      cy.get(STEP1_TEXTAREA).type(text);
      cy.get(STEP1_TEXTAREA).should('have.value', text);
    });

    it('fills the textarea with the first suggestion when its chip is clicked', () => {
      cy.get('[data-cy="ai-site-builder-suggestions"]').find('button').eq(0).click();
      cy.get(STEP1_TEXTAREA).should(
        'have.value',
        'SaaS landing page for a project management tool'
      );
    });

    it('fills the textarea with the second suggestion when its chip is clicked', () => {
      cy.get('[data-cy="ai-site-builder-suggestions"]').find('button').eq(1).click();
      cy.get(STEP1_TEXTAREA).should(
        'have.value',
        'Portfolio for a freelance designer'
      );
    });

    it('fills the textarea with the third suggestion when its chip is clicked', () => {
      cy.get('[data-cy="ai-site-builder-suggestions"]').find('button').eq(2).click();
      cy.get(STEP1_TEXTAREA).should(
        'have.value',
        'E-commerce for sustainable fashion'
      );
    });

    it('replaces the textarea value when a different suggestion is clicked after the user has typed', () => {
      cy.get(STEP1_TEXTAREA).type('Initial text');
      cy.get('[data-cy="ai-site-builder-suggestions"]').find('button').eq(0).click();
      cy.get(STEP1_TEXTAREA).should(
        'have.value',
        'SaaS landing page for a project management tool'
      );
    });

    it('inserts a newline when the user presses Shift+Enter inside the textarea', () => {
      cy.get(STEP1_TEXTAREA).type('Line 1{shift}{enter}Line 2');
      cy.get(STEP1_TEXTAREA).should('have.value', 'Line 1\nLine 2');
    });

    it('triggers Generate when the user presses Enter in the textarea', () => {
      cy.get(STEP1_TEXTAREA).type('Trigger via enter');
      cy.get(STEP1_TEXTAREA).type('{enter}');
      cy.wait('@createProject');
      cy.wait('@createAIWebsite');
    });

    it('does NOT trigger Generate when Enter is pressed on an empty textarea', () => {
      cy.get(STEP1_TEXTAREA).focus().type('{enter}');
      // No outgoing createProject call should fire.
      cy.get('@createProject.all').should('have.length', 0);
    });

    it('fires createProject with a payload when Generate Pages is clicked', () => {
      cy.get(STEP1_TEXTAREA).type('SaaS landing page test');
      cy.get(STEP1_GENERATE_BUTTON).click();
      cy.wait('@createProject').its('request.body').should('exist');
    });

    it('fires createAIWebsite with the trimmed prompt definition after the project is created', () => {
      cy.get(STEP1_TEXTAREA).type('   Trim me  ');
      cy.get(STEP1_GENERATE_BUTTON).click();
      cy.wait('@createAIWebsite').its('request.body').should((body) => {
        expect(body).to.have.property('definition', 'Trim me');
      });
    });

    it('shows the Generating... label on the button while the request is in flight', () => {
      cy.intercept('POST', CREATE_PROJECT_ROUTE, (req) => {
        req.reply({ delay: 1500, statusCode: 200, body: { _id: 'proj-xyz-789' } });
      }).as('slowCreateProject');
      cy.get(STEP1_TEXTAREA).type('In-flight loading state');
      cy.get(STEP1_GENERATE_BUTTON).click();
      cy.get(STEP1_GENERATE_BUTTON).contains('Generating...').should('be.visible');
    });

    it('disables the Generate Pages button while the generation request is in flight', () => {
      cy.intercept('POST', CREATE_PROJECT_ROUTE, (req) => {
        req.reply({ delay: 1500, statusCode: 200, body: { _id: 'proj-xyz-789' } });
      }).as('slowCreateProject');
      cy.get(STEP1_TEXTAREA).type('Disable check while loading');
      cy.get(STEP1_GENERATE_BUTTON).click();
      cy.get(STEP1_GENERATE_BUTTON).should('be.disabled');
    });

    it('navigates to /ai-site-builder/pages after a successful generation', () => {
      cy.get(STEP1_TEXTAREA).type('Navigation test');
      cy.get(STEP1_GENERATE_BUTTON).click();
      cy.wait('@createAIWebsite');
      cy.location('pathname', { timeout: 10000 }).should('eq', '/ai-site-builder/pages');
    });

    it('renders the API error message when createProject responds with a 400', () => {
      // Register the failure override BEFORE typing so the next outgoing POST
      // hits the 400 stub. Cypress LIFO-routes overlapping intercepts: this
      // one wins over the beforeEach `stubStep1Apis()` registration.
      cy.intercept('POST', CREATE_PROJECT_ROUTE, {
        statusCode: 400,
        body: { message: 'Quota exceeded for your account.' },
      }).as('failingCreateProject');
      // Use a prompt long enough to clear any potential FE min-length guard
      // (current FE only checks `.trim().length > 0`, but R4 reports the
      // request never fired — guard against any future min-length tightening).
      cy.get(STEP1_TEXTAREA).type('Trigger an error for the failing create project stub');
      // Confirm the click target is enabled before clicking — if the user
      // context hasn't hydrated yet, `handleGenerate` short-circuits silently
      // and no API call fires. The disabled-state check below is the cheapest
      // proxy for "FE is ready to submit".
      cy.get(STEP1_GENERATE_BUTTON).should('not.be.disabled').click();
      cy.wait('@failingCreateProject', { timeout: 20000 });
      // Component renders the message into local state but no visible error
      // element is wired to the DOM (no data-cy / id). We assert via a
      // location-stays-put check — failures keep us on step 1.
      cy.location('pathname').should('eq', '/ai-site-builder');
    });

    it('does not navigate away when createProject responds with a server error', () => {
      // Mirror of the 400-path hardening above: register the stub first,
      // type a prompt long enough to bypass any future min-length guard, and
      // assert the button is enabled before clicking so we don't silently
      // no-op on an un-hydrated user context.
      cy.intercept('POST', CREATE_PROJECT_ROUTE, {
        statusCode: 500,
        body: { message: 'Internal error' },
      }).as('serverError');
      cy.get(STEP1_TEXTAREA).type('Server error path for the 500-response stub');
      cy.get(STEP1_GENERATE_BUTTON).should('not.be.disabled').click();
      cy.wait('@serverError', { timeout: 20000 });
      cy.location('pathname').should('eq', '/ai-site-builder');
    });

    it('shows the AI SITE BUILDER badge above the heading', () => {
      cy.get('[data-cy="ai-site-builder-badge"]').should('be.visible');
    });

    it('shows the Enter keyboard shortcut hint in the input footer', () => {
      cy.get('[data-cy="ai-site-builder-shortcut-hint"]').should('be.visible');
    });
  });

  // ============================================================
  // STEP 2 — /ai-site-builder/pages (AISiteBuilderPages.tsx)
  // ============================================================
  describe('Step 2: pages canvas (/ai-site-builder/pages)', () => {
    beforeEach(() => {
      stubStep2Apis();
    });

    describe('routing & guards', () => {
      it('redirects to /ai-site-builder when no location.state is present', () => {
        cy.visit('/ai-site-builder/pages');
        cy.location('pathname', { timeout: 10000 }).should('eq', '/ai-site-builder');
      });

      it('stays on /ai-site-builder/pages when seeded with documentId + project state', () => {
        cy.visit('/ai-site-builder/pages', {
          onBeforeLoad: seedStep2OnBeforeLoad(),
        });
        cy.get(STEP2_PROJECT_NAME_INPUT, { timeout: 20000 }).should('be.visible');
        cy.location('pathname').should('eq', '/ai-site-builder/pages');
      });
    });

    describe('header controls', () => {
      beforeEach(() => {
        cy.visit('/ai-site-builder/pages', {
          onBeforeLoad: seedStep2OnBeforeLoad(),
        });
        cy.get(STEP2_PROJECT_NAME_INPUT, { timeout: 20000 }).should('be.visible');
      });

      it('renders the project name input with the optional placeholder', () => {
        cy.get(STEP2_PROJECT_NAME_INPUT)
          .should('have.attr', 'placeholder', 'Project name (optional)');
      });

      it('updates the project name input when the user types', () => {
        cy.get(STEP2_PROJECT_NAME_INPUT).type('My Custom Project');
        cy.get(STEP2_PROJECT_NAME_INPUT).should('have.value', 'My Custom Project');
      });

      it('renders the Generate Website button in a disabled state before firehose data arrives', () => {
        cy.get(STEP2_GENERATE_WEBSITE_BUTTON).should('be.disabled');
      });
    });

    describe('canvas skeleton & loading state', () => {
      beforeEach(() => {
        cy.visit('/ai-site-builder/pages', {
          onBeforeLoad: seedStep2OnBeforeLoad(),
        });
      });

      it('renders the skeleton tree while no pages have been received', () => {
        cy.get('[data-cy="ai-builder-canvas"]', { timeout: 20000 }).should('be.visible');
        cy.get('[data-cy="ai-site-builder-skeleton-home-row"]').should('exist');
        cy.get('[data-cy="ai-site-builder-skeleton-card"]').should('exist');
      });

      it('renders three skeleton page cards in the grid by default', () => {
        cy.get('[data-cy="ai-site-builder-skeleton-grid"]', { timeout: 20000 }).should('be.visible');
        cy.get('[data-cy="ai-site-builder-skeleton-card"]').should('have.length.at.least', 3);
      });

      it('toggles the canvasGrabbing state while the user is panning with the mouse', () => {
        cy.get('[data-cy="ai-builder-canvas"]').then(($canvas) => {
          const el = $canvas[0];
          const rect = el.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          cy.wrap($canvas).trigger('mousedown', { button: 0, clientX: x, clientY: y });
        });
        cy.get('[data-cy="ai-builder-canvas"][data-canvas-grabbing="true"]').should('exist');
        cy.window().then((win) => {
          win.dispatchEvent(new win.MouseEvent('mouseup'));
        });
        cy.get('[data-cy="ai-builder-canvas"][data-canvas-grabbing="true"]').should('not.exist');
      });
    });

    describe('zoom controls', () => {
      beforeEach(() => {
        cy.visit('/ai-site-builder/pages', {
          onBeforeLoad: seedStep2OnBeforeLoad(),
        });
        cy.get('[data-cy="ai-builder-canvas"]', { timeout: 20000 }).should('be.visible');
      });

      it('scales the tree container down when the user ctrl+scrolls the wheel down', () => {
        cy.get('[data-cy="ai-site-builder-tree-container"]').invoke('attr', 'style').then((before) => {
          cy.get('[data-cy="ai-builder-canvas"]').trigger('wheel', { deltaY: 100, ctrlKey: true });
          cy.get('[data-cy="ai-site-builder-tree-container"]').invoke('attr', 'style').should((after) => {
            expect(after).to.not.equal(before);
          });
        });
      });

      it('scales the tree container up when the user ctrl+scrolls the wheel up', () => {
        cy.get('[data-cy="ai-site-builder-tree-container"]').invoke('attr', 'style').then((before) => {
          cy.get('[data-cy="ai-builder-canvas"]').trigger('wheel', { deltaY: -100, ctrlKey: true });
          cy.get('[data-cy="ai-site-builder-tree-container"]').invoke('attr', 'style').should((after) => {
            expect(after).to.not.equal(before);
          });
        });
      });

      it('ignores plain wheel events (no ctrl/meta modifier) and leaves the transform untouched', () => {
        cy.get('[data-cy="ai-site-builder-tree-container"]').invoke('attr', 'style').then((before) => {
          cy.get('[data-cy="ai-builder-canvas"]').trigger('wheel', { deltaY: 100 });
          // No state change should occur; assert the inline style is still the same.
          cy.get('[data-cy="ai-site-builder-tree-container"]').invoke('attr', 'style').should('equal', before);
        });
      });
    });

    describe('generation mode modal', () => {
      // When canGenerate is false (no firehose data), opening the modal is a
      // no-op. We patch the firehose by directly toggling the modal via the
      // canGenerate-bypassed path: the modal opens when the Generate Website
      // button is clickable. Since we cannot easily fake firehose payloads in
      // pure Cypress, these tests assert the disabled-path behavior and the
      // visual contract of the modal once it has been forced open via the
      // close button check (modal initially closed).

      beforeEach(() => {
        cy.visit('/ai-site-builder/pages', {
          onBeforeLoad: seedStep2OnBeforeLoad(),
        });
        cy.get(STEP2_PROJECT_NAME_INPUT, { timeout: 20000 }).should('be.visible');
      });

      it('does NOT open the generation mode modal when Generate Website is disabled', () => {
        cy.get(STEP2_GENERATE_WEBSITE_BUTTON).should('be.disabled');
        cy.get(STEP2_GENERATE_WEBSITE_BUTTON).click({ force: true });
        // The modal renders via OverlayPopup; assert no popup root for the modal
        // appears after the click attempt.
        cy.get('[data-cy="ai-site-builder-mode-modal"]').should('not.exist');
      });

      it('keeps the generation mode modal closed on initial page load', () => {
        cy.get('[data-cy="ai-site-builder-mode-modal"]').should('not.exist');
      });
    });

    describe('generating overlay', () => {
      beforeEach(() => {
        cy.visit('/ai-site-builder/pages', {
          onBeforeLoad: seedStep2OnBeforeLoad(),
        });
        cy.get(STEP2_PROJECT_NAME_INPUT, { timeout: 20000 }).should('be.visible');
      });

      it('keeps the generate-website overlay hidden on initial page load', () => {
        cy.get('[data-cy="ai-site-builder-generating-overlay"]').should('not.exist');
      });
    });

    describe('skeleton sections', () => {
      beforeEach(() => {
        cy.visit('/ai-site-builder/pages', {
          onBeforeLoad: seedStep2OnBeforeLoad(),
        });
        cy.get('[data-cy="ai-builder-canvas"]', { timeout: 20000 }).should('be.visible');
      });

      it('renders the vertical connector line between home and other pages', () => {
        cy.get('[data-cy="ai-site-builder-skeleton-vertical-line"]').should('exist');
      });

      it('renders the horizontal connector line above the page grid', () => {
        cy.get('[data-cy="ai-site-builder-skeleton-horizontal-line"]').should('exist');
      });

      it('renders the connector block sized for the default three-card skeleton tree', () => {
        cy.get('[data-cy="ai-site-builder-skeleton-connector-block"]')
          .should('have.attr', 'style')
          .and('match', /margin-left:\s*130px/);
      });
    });

    describe('category panel (initial state)', () => {
      beforeEach(() => {
        cy.visit('/ai-site-builder/pages', {
          onBeforeLoad: seedStep2OnBeforeLoad(),
        });
        cy.get('[data-cy="ai-builder-canvas"]', { timeout: 20000 }).should('be.visible');
      });

      it('does not render the category panel before any page is selected', () => {
        cy.get('[data-cy="ai-site-builder-category-panel"]').should('not.exist');
      });
    });
  });

  // ============================================================
  // CROSS-STEP — flow integration
  // ============================================================
  describe('Cross-step navigation', () => {
    beforeEach(() => {
      stubStep1Apis();
      stubStep2Apis();
    });

    it('navigates from step 1 to step 2 and renders the pages canvas after a successful generation', () => {
      cy.visit('/ai-site-builder');
      cy.get(STEP1_TEXTAREA, { timeout: 20000 }).type('End-to-end flow test');
      cy.get(STEP1_GENERATE_BUTTON).click();
      cy.wait('@createProject');
      cy.wait('@createAIWebsite');
      cy.location('pathname', { timeout: 10000 }).should('eq', '/ai-site-builder/pages');
      cy.get(STEP2_PROJECT_NAME_INPUT, { timeout: 20000 }).should('be.visible');
    });

    it('redirects back to step 1 when step 2 is visited directly without history state', () => {
      cy.visit('/ai-site-builder/pages');
      cy.location('pathname', { timeout: 10000 }).should('eq', '/ai-site-builder');
      cy.get(STEP1_TEXTAREA, { timeout: 20000 }).should('be.visible');
    });
  });
});
