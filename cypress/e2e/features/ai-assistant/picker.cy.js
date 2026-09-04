/**
 * E2E — AI element picker (merged spec)
 *
 * Merges the previous picker.* specs into one suite:
 *   - click                     (chip capture + selected_elements payload)
 *   - duplicate                 (duplicate-click guard keeps chip count at 1)
 *   - enterMode                 (toggling pick mode + side effects)
 *   - escapeAndOutsideClick     (implicit exits preserve chips)
 *   - hoverOutline              (hover outline + label atoms)
 *   - removeChip                (✕ removes chip, empty submit omits selected_elements)
 *   - requestElementSelection   (backend-requested selection card flow)
 *
 * Scope-audit corrections applied (.audit/test-scope-audit.md):
 *   - picker.click Test 1     → renamed to "should add a chip to the tray when a
 *                                description element is clicked" (drops the
 *                                empty within() kind/preview block).
 *   - picker.click Test 2     → dropped the kind === 'text' assertion (out of
 *                                scope vs. the test name).
 *   - picker.enterMode Test 1 → added a real composer-class assertion
 *                                ([class*="composerPicking"]) so "dims composer"
 *                                in the name is actually verified.
 *   - picker.hoverOutline     → dropped the regex tag-text assertion (out of
 *                                scope vs. the test name).
 *   - picker.requestElementSelection Test 2 → dropped the body ai-picker-active
 *                                              setup-verification (out of scope).
 *   - picker.requestElementSelection Test 3 → added a no-second-call tracker so
 *                                              "without sending a follow-up turn"
 *                                              is actually verified.
 *
 * Shared setup lives in a single top-level beforeEach. Per-sub-feature SSE
 * intercepts are installed inside their nested describe's beforeEach because
 * the chat-stream frames differ across flows (idle vs completion vs
 * request_element_selection).
 */

import { loginToEditor, addComponent } from '@support/editorTestHelper';

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

const idleFrames = [
  { event: 'request_started', data: { request_id: 'r_idle', sse: true } },
  { event: 'conversation', data: { conversation_id: 'c_idle' } },
  {
    event: 'done',
    data: {
      request_id: 'r_idle',
      conversation_id: 'c_idle',
      messages: [],
      pending_confirmation: null,
      trace: [],
      iterations: 0,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      ctx: { project_id: '1', page_id: null, locale: null },
    },
  },
];

const completionFrames = [
  { event: 'request_started', data: { request_id: 'r_done', sse: true } },
  { event: 'conversation', data: { conversation_id: 'c_done' } },
  { event: 'iter_start', data: { iter: 1 } },
  { event: 'final_message', data: { content: 'Got it.' } },
  {
    event: 'done',
    data: {
      request_id: 'r_done',
      conversation_id: 'c_done',
      messages: [
        { role: 'user', content: 'change this to red' },
        { role: 'assistant', content: 'Got it.' },
      ],
      pending_confirmation: null,
      trace: [],
      iterations: 1,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      ctx: { project_id: '1', page_id: null, locale: null },
    },
  },
];

const requestElementSelectionFrames = [
  { event: 'request_started', data: { request_id: 'req_res_1', sse: true } },
  { event: 'conversation', data: { conversation_id: 'conv_res_1' } },
  { event: 'iter_start', data: { iter: 1 } },
  {
    event: 'request_element_selection',
    data: {
      description: 'Pick the heading you want to restyle.',
      min_count: 1,
      max_count: 3,
      iter: 1,
    },
  },
  {
    event: 'done',
    data: {
      request_id: 'req_res_1',
      conversation_id: 'conv_res_1',
      messages: [{ role: 'user', content: 'pick something for me' }],
      pending_confirmation: null,
      trace: [],
      iterations: 1,
      usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
      ctx: { project_id: '1', page_id: null, locale: null },
    },
  },
];

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Trigger a mousemove (to populate the picker's lastResolvedRef) and then a
 * click at the same coords. Both must be synthesized at real screen coords —
 * the picker's capture-phase listeners run off clientX/clientY.
 */
function pickAt($el) {
  const rect = $el[0].getBoundingClientRect();
  const clientX = rect.left + Math.min(20, rect.width / 2);
  const clientY = rect.top + Math.min(10, rect.height / 2);
  cy.wrap($el).trigger('mousemove', { clientX, clientY, force: true, bubbles: true });
  cy.wait(60);
  cy.wrap($el).trigger('click', { clientX, clientY, force: true, bubbles: true });
}

/**
 * Pick the first auto-generate-tagged element inside the first canvas section.
 * Used by tests that just need ANY element to land in the chip tray.
 */
function pickFirstAutoGenElement() {
  cy.get('[data-component-index]', { timeout: 10000 })
    .first()
    .find('[class*="auto-generate-"]')
    .first()
    .then(pickAt);
}

// ===========================================================================
// AI element picker
// ===========================================================================

describe('AI element picker', () => {
  beforeEach(() => {
    // Default SSE intercept — quiet "done"-only stream. Individual sub-features
    // override this in their own beforeEach when they need richer frames.
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody(idleFrames),
      });
    }).as('aiChat');

    // Auth + editor visit — cy.login() runs programmatically (no UI login),
    // loginToEditor() handles cy.visit() of the test project and waits for
    // the canvas/empty-placeholder to be ready.
    loginToEditor();

    // Ensure the canvas has at least one section. We use `intro` because its
    // template renders an auto-generate-tagged `description` element, which is
    // the stable target the click + payload tests need.
    cy.get('body').then(($body) => {
      const hasDesc = $body.find('[class*="auto-generate-"][class*="-description"]').length > 0;
      if (!hasDesc) {
        addComponent('intro', 0);
      }
    });
    cy.get('[class*="auto-generate-"][class*="-description"]', { timeout: 15000 }).should('exist');

    // Open the AI panel — every picker test runs against the open panel.
    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');
  });

  // -------------------------------------------------------------------------
  // click — chip capture + payload shape
  // -------------------------------------------------------------------------
  describe('click', () => {
    beforeEach(() => {
      // Override default intercept with completion frames so that the
      // payload-shape test can actually submit a turn.
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream' },
          body: sseBody(completionFrames),
        });
      }).as('aiChat');
    });

    it('should add a chip to the tray when a description element is clicked', () => {
      cy.get('[data-cy="ai-pick-button"]').click();

      cy.get('[class*="auto-generate-"][class*="-description"]', { timeout: 10000 })
        .first()
        .then(pickAt);

      cy.get('[data-cy="ai-element-chip"]', { timeout: 4000 }).should('have.length.at.least', 1);
    });

    it('should post selected_elements with sectionName="description" and an elementId ending in -description-<n> when the prompt is sent', () => {
      cy.get('[data-cy="ai-pick-button"]').click();

      cy.get('[class*="auto-generate-"][class*="-description"]', { timeout: 10000 })
        .first()
        .then(pickAt);

      cy.get('[data-cy="ai-element-chip"]').should('have.length.at.least', 1);

      cy.get('[data-cy="ai-assistant-composer-input"]').type('change this to red');
      cy.get('[data-cy="ai-assistant-send"]').click();

      cy.wait('@aiChat').its('request.body').should((body) => {
        expect(body, 'request body').to.have.property('selected_elements');
        expect(body.selected_elements).to.be.an('array').and.have.length.at.least(1);
        const first = body.selected_elements[0];
        expect(first.sectionName, 'sectionName').to.eq('description');
        // elementId comes from the auto-generate-tagged ancestor, which ends
        // in `-description-<n>` (NOT the runtime-id child like
        // ...-description-982693166-ksxs4g).
        expect(first.elementId, 'elementId').to.match(/-description-\d+$/);
      });
    });
  });

  // -------------------------------------------------------------------------
  // duplicate — same element clicked twice does not double-add
  // -------------------------------------------------------------------------
  describe('duplicate', () => {
    it('should keep chip count at 1 when the same element is clicked twice', () => {
      cy.get('[data-cy="ai-pick-button"]').click();

      cy.get('[data-component-index]', { timeout: 10000 })
        .first()
        .find('[class*="auto-generate-"]')
        .first()
        .as('target');

      cy.get('@target').then(pickAt);
      cy.get('[data-cy="ai-element-chip"]', { timeout: 4000 }).should('have.length', 1);

      // Re-enter picker if it auto-exited, then click the SAME element.
      cy.get('[data-cy="ai-pick-button"]').then(($btn) => {
        if ($btn.attr('aria-pressed') !== 'true') cy.wrap($btn).click();
      });
      cy.get('@target').then(pickAt);

      // Still exactly one chip — duplicate was rejected.
      cy.get('[data-cy="ai-element-chip"]').should('have.length', 1);
    });
  });

  // -------------------------------------------------------------------------
  // enterMode — toggling pick mode (split per side effect)
  // -------------------------------------------------------------------------
  describe('enterMode', () => {
    it('should add ai-picker-active to body when the pick button is clicked', () => {
      cy.get('body').should('not.have.class', 'ai-picker-active');
      cy.get('[data-cy="ai-pick-button"]').should('be.visible').click();
      cy.get('body').should('have.class', 'ai-picker-active');
    });

    it('should render the pick-mode badge when the pick button is clicked', () => {
      cy.get('[data-cy="ai-pick-mode-badge"]').should('not.exist');
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('[data-cy="ai-pick-mode-badge"]').should('be.visible');
    });

    it('should dim the composer with a composerPicking class when pick mode is active', () => {
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('[data-cy="ai-assistant-panel"]')
        .find('[class*="composerPicking"]', { timeout: 4000 })
        .should('exist');
    });

    it('should set aria-pressed=true on the pick button when pick mode is active', () => {
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('[data-cy="ai-pick-button"]').should('have.attr', 'aria-pressed', 'true');
    });

    it('should remove ai-picker-active from body when the pick button is clicked a second time', () => {
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('body').should('have.class', 'ai-picker-active');
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('body').should('not.have.class', 'ai-picker-active');
    });

    it('should remove the pick-mode badge when the pick button is clicked a second time', () => {
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('[data-cy="ai-pick-mode-badge"]').should('be.visible');
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('[data-cy="ai-pick-mode-badge"]').should('not.exist');
    });

    it('should set aria-pressed=false on the pick button when the pick button is clicked a second time', () => {
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('[data-cy="ai-pick-button"]').should('have.attr', 'aria-pressed', 'false');
    });
  });

  // -------------------------------------------------------------------------
  // escapeAndOutsideClick — implicit exits preserve chips
  // -------------------------------------------------------------------------
  describe('escapeAndOutsideClick', () => {
    it('should exit pick mode and retain existing chips when Escape is pressed', () => {
      cy.get('[data-cy="ai-pick-button"]').click();
      pickFirstAutoGenElement();
      cy.get('[data-cy="ai-element-chip"]', { timeout: 4000 }).should('have.length.at.least', 1);

      // Re-enter pick mode if the click auto-exited, then press Escape.
      cy.get('[data-cy="ai-pick-button"]').then(($btn) => {
        if ($btn.attr('aria-pressed') !== 'true') cy.wrap($btn).click();
      });
      cy.get('body').should('have.class', 'ai-picker-active');

      cy.get('body').trigger('keydown', { key: 'Escape', force: true });
      cy.get('body').should('not.have.class', 'ai-picker-active');
      cy.get('[data-cy="ai-element-chip"]').should('have.length.at.least', 1);
    });

    it('should exit pick mode and retain existing chips when an outside click lands off the canvas', () => {
      cy.get('[data-cy="ai-pick-button"]').click();
      pickFirstAutoGenElement();
      cy.get('[data-cy="ai-element-chip"]', { timeout: 4000 }).should('have.length.at.least', 1);

      cy.get('[data-cy="ai-pick-button"]').then(($btn) => {
        if ($btn.attr('aria-pressed') !== 'true') cy.wrap($btn).click();
      });
      cy.get('body').should('have.class', 'ai-picker-active');

      // Click body at coords FAR from the canvas + panel (top-left corner).
      cy.get('body').click(2, 2, { force: true });
      cy.get('body').should('not.have.class', 'ai-picker-active');
      cy.get('[data-cy="ai-element-chip"]').should('have.length.at.least', 1);
    });
  });

  // -------------------------------------------------------------------------
  // hoverOutline — hover renders portaled outline + label atoms
  // -------------------------------------------------------------------------
  describe('hoverOutline', () => {
    beforeEach(() => {
      // Pick mode must already be active for the hover atoms to render.
      cy.get('[data-cy="ai-pick-button"]').click();
      cy.get('body').should('have.class', 'ai-picker-active');
    });

    it('should render the hover outline atom when a canvas text element is hovered', () => {
      cy.get('[data-component-index]')
        .first()
        .find('h1, h2, h3, p')
        .first()
        .then(($el) => {
          const rect = $el[0].getBoundingClientRect();
          cy.wrap($el).trigger('mousemove', {
            clientX: rect.left + 5,
            clientY: rect.top + 5,
            force: true,
            bubbles: true,
          });
        });

      cy.get('[class*="hoverOutline"]', { timeout: 4000 }).should('exist');
    });

    it('should render the hover label atom when a canvas text element is hovered', () => {
      cy.get('[data-component-index]')
        .first()
        .find('h1, h2, h3, p')
        .first()
        .then(($el) => {
          const rect = $el[0].getBoundingClientRect();
          cy.wrap($el).trigger('mousemove', {
            clientX: rect.left + 5,
            clientY: rect.top + 5,
            force: true,
            bubbles: true,
          });
        });

      cy.get('[class*="hoverLabel"]', { timeout: 4000 }).should('exist');
    });
  });

  // -------------------------------------------------------------------------
  // removeChip — ✕ removes chip + empty submit omits selected_elements
  // -------------------------------------------------------------------------
  describe('removeChip', () => {
    beforeEach(() => {
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream' },
          body: sseBody(completionFrames),
        });
      }).as('aiChat');
    });

    it('should remove the chip from the tray when the chip Remove button is clicked', () => {
      cy.get('[data-cy="ai-pick-button"]').click();
      pickFirstAutoGenElement();

      cy.get('[data-cy="ai-element-chip"]').should('have.length.at.least', 1);
      cy.get('[data-cy="ai-element-chip"]').first().find('button[aria-label="Remove"]').click();
      cy.get('[data-cy="ai-element-chip"]').should('have.length', 0);
    });

    it('should omit selected_elements from the request body when the prompt is sent without any chips', () => {
      cy.get('[data-cy="ai-assistant-composer-input"]').type('hello');
      cy.get('[data-cy="ai-assistant-send"]').click();

      cy.wait('@aiChat').its('request.body').should((body) => {
        // The hook only spreads `selected_elements` when there's at least one
        // pick — accept both an absent key and an empty array.
        const sel = body.selected_elements;
        const isAbsent = sel === undefined;
        const isEmptyArray = Array.isArray(sel) && sel.length === 0;
        expect(isAbsent || isEmptyArray, 'selected_elements omitted or empty').to.be.true;
      });
    });
  });

  // -------------------------------------------------------------------------
  // requestElementSelection — backend-requested selection card
  // -------------------------------------------------------------------------
  describe('requestElementSelection', () => {
    beforeEach(() => {
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream' },
          body: sseBody(requestElementSelectionFrames),
        });
      }).as('aiChat');
    });

    it('should render the selection card with a disabled Continue button when no picks have landed', () => {
      cy.get('[data-cy="ai-assistant-composer-input"]').type('pick something for me');
      cy.get('[data-cy="ai-assistant-send"]').click();
      cy.wait('@aiChat');

      cy.get('[data-cy="ai-request-element-selection-card"]', { timeout: 6000 })
        .should('be.visible')
        .within(() => {
          cy.get('[data-cy="ai-request-element-selection-pick"]').should('be.visible');
          cy.get('[data-cy="ai-request-element-selection-cancel"]').should('be.visible');
          cy.get('[data-cy="ai-request-element-selection-continue"]')
            .should('be.visible')
            .and('be.disabled');
        });
    });

    it('should enable the Continue button after min_count picks have landed', () => {
      cy.get('[data-cy="ai-assistant-composer-input"]').type('pick something for me');
      cy.get('[data-cy="ai-assistant-send"]').click();
      cy.wait('@aiChat');

      cy.get('[data-cy="ai-request-element-selection-card"]', { timeout: 6000 }).should('be.visible');

      // Enter pick mode through the card flow + pick one element (min_count=1).
      cy.get('[data-cy="ai-request-element-selection-pick"]').click();
      pickFirstAutoGenElement();

      cy.get('[data-cy="ai-request-element-selection-continue"]', { timeout: 4000 })
        .should('not.be.disabled');
    });

    it('should dismiss the selection card and fire no follow-up turn when Cancel is clicked', () => {
      cy.get('[data-cy="ai-assistant-composer-input"]').type('pick something for me');
      cy.get('[data-cy="ai-assistant-send"]').click();
      cy.wait('@aiChat');

      cy.get('[data-cy="ai-request-element-selection-card"]', { timeout: 6000 }).should('be.visible');

      // Tracker — if Cancel triggers ANY second POST to /ai/chat, this flips.
      let secondCallFired = false;
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', () => {
        secondCallFired = true;
      }).as('aiChatSecond');

      cy.get('[data-cy="ai-request-element-selection-cancel"]').click();
      cy.get('[data-cy="ai-request-element-selection-card"]').should('not.exist');

      cy.then(() => {
        expect(secondCallFired, 'no second chat request fired after Cancel').to.be.false;
      });
    });
  });
});
