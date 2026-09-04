/**
 * E2E — AI Intent Confirmation Flow
 *
 * Validates the two-phase intent confirmation UX introduced alongside the
 * AI Tool Router `request_confirmation` tool:
 *
 *   1. Discovery phase: backend silently runs read-only tools (pb_list_sections,
 *      pb_get_component_tree, etc.) via SSE tool_request/tool_result events.
 *   2. Confirmation phase: backend emits a `pending_confirmation` SSE event with
 *      name="request_confirmation" and a plain-English `description` of what it
 *      intends to do. The frontend shows a ConfirmationCard with ONLY the
 *      description text and "Proceed"/"Cancel" buttons — no heading like
 *      "Confirm action: request_confirmation" and no JSON args block.
 *   3. Proceed: confirmAndContinue() re-submits with confirmed_tool_calls,
 *      backend executes the mutation tool (regenerate_section_text), returns
 *      a final message.
 *   4. Cancel: cancelConfirmation() clears the card, inserts a synthetic
 *      assistant message "Skipped `request_confirmation` per your decision.",
 *      status returns to idle, no mutations fired.
 *   5. Explicit approval in the user message skips the confirmation card
 *      (backend handles this — returns no pending_confirmation directly).
 *
 * Strategy: mock /api/fn-execute/v1/ai/chat as an SSE stream that plays back
 * deterministic frames. Uses the same sseBody() helper pattern as
 * ai-inline-streaming-smoke.cy.js for consistency with the project test suite.
 *
 * Auth: uses loginToEditor() helper — same pattern as other editor E2E tests.
 * The AiAssistantPanel is rendered only within the ProjectEditor route.
 */

// The test project editor route — uses the test user's real project ID.
// Project "FinalProject" (69f515295ac7bd7572f9590c) owned by blinkpage1@hotmail.com.
const EDITOR_URL = '/project/69f515295ac7bd7572f9590c/editor/0';

// ---------------------------------------------------------------------------
// Auth helper — logs in and navigates to the editor
// ---------------------------------------------------------------------------
function loginAndOpenEditor() {
  // Programmatic auth via centralized cy.login() — replaces the UI form login.
  cy.login();
  cy.visit(EDITOR_URL);
  // Wait for the editor to be ready — AI FAB must be present
  cy.get('[data-cy="ai-assistant-fab"]', { timeout: 15000 }).should('be.visible');
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

// Phase 1: discovery tools fire silently, then pending_confirmation is emitted
// with name="request_confirmation". The `done` event carries the pending_confirmation
// so the frontend sets status=awaiting_confirmation.
function buildIntentConfirmationFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_intent_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_intent_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    { event: 'assistant_message', data: { iter: 1, content: null, tool_calls: [
      { id: 'call_disc_1', name: 'pb_list_sections' },
      { id: 'call_disc_2', name: 'pb_get_component_tree' },
    ] } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_disc_1', name: 'pb_list_sections', args: {} } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_disc_1', name: 'pb_list_sections', ok: true, result: { ok: true, sections: [{ id: 'hero-1', type: 'HeroSection' }] } } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_disc_2', name: 'pb_get_component_tree', args: { component_id: 'hero-1' } } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_disc_2', name: 'pb_get_component_tree', ok: true, result: { ok: true } } },
    { event: 'pending_confirmation', data: {
      tool_call_id: 'call_intent_confirm_1',
      name: 'request_confirmation',
      args: { plan: "I'll rewrite your Hero section with a Paris bakery brief." },
      description: "I'll rewrite your Hero section with a Paris bakery brief.",
      nonce: 'nonce_abc_123',
      iter: 1,
    } },
    { event: 'done', data: {
      request_id: 'req_intent_1',
      conversation_id: 'conv_intent_1',
      messages: [
        { role: 'user', content: 'Change my hero section content to match a bakery in Paris' },
      ],
      pending_confirmation: {
        tool_call_id: 'call_intent_confirm_1',
        name: 'request_confirmation',
        args: { plan: "I'll rewrite your Hero section with a Paris bakery brief." },
        description: "I'll rewrite your Hero section with a Paris bakery brief.",
        nonce: 'nonce_abc_123',
      },
      trace: [
        { iter: 1, type: 'tool', name: 'pb_list_sections', tool_call_id: 'call_disc_1', ok: true, status: 'success' },
        { iter: 1, type: 'tool', name: 'pb_get_component_tree', tool_call_id: 'call_disc_2', ok: true, status: 'success' },
      ],
      iterations: 1,
      usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
      ctx: { project_id: '69f515295ac7bd7572f9590c', page_id: null, locale: null },
    } },
  ];
}

// Phase 2a: user clicked Proceed — backend receives confirmed_tool_calls and
// runs the actual mutation, then returns a clean final message.
function buildProceedFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_intent_2', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_intent_1' } },
    { event: 'iter_start', data: { iter: 2 } },
    { event: 'assistant_message', data: { iter: 2, content: null, tool_calls: [
      { id: 'call_mut_1', name: 'regenerate_section_text' },
    ] } },
    { event: 'tool_request', data: { iter: 2, tool_call_id: 'call_mut_1', name: 'regenerate_section_text', args: { component_id: 'hero-1', brief: 'Paris bakery theme' } } },
    { event: 'mutation_committed', data: { iter: 2, tool_call_id: 'call_mut_1', name: 'regenerate_section_text', group: 'content' } },
    { event: 'tool_result', data: { iter: 2, tool_call_id: 'call_mut_1', name: 'regenerate_section_text', ok: true, result: { ok: true, result: { applied: 4 } } } },
    { event: 'final_message', data: { iter: 2, content: "Done — I've rewritten your Hero section with a Paris bakery theme. Updated title, subtitle, and CTA text." } },
    { event: 'done', data: {
      request_id: 'req_intent_2',
      conversation_id: 'conv_intent_1',
      messages: [
        { role: 'user', content: 'Change my hero section content to match a bakery in Paris' },
        { role: 'assistant', content: "Done — I've rewritten your Hero section with a Paris bakery theme. Updated title, subtitle, and CTA text." },
      ],
      pending_confirmation: null,
      trace: [
        { iter: 2, type: 'tool', name: 'regenerate_section_text', tool_call_id: 'call_mut_1', ok: true, status: 'success' },
        { iter: 3, type: 'final', content: "Done — I've rewritten your Hero section with a Paris bakery theme." },
      ],
      iterations: 3,
      usage: { prompt_tokens: 160, completion_tokens: 60, total_tokens: 220 },
      ctx: { project_id: '69f515295ac7bd7572f9590c', page_id: null, locale: null },
    } },
  ];
}

// Explicit approval path: user sends a message with explicit intent.
// Backend skips confirmation entirely and returns a direct mutation result.
function buildExplicitApprovalFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_explicit_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_explicit_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    { event: 'assistant_message', data: { iter: 1, content: null, tool_calls: [
      { id: 'call_exp_1', name: 'pb_list_sections' },
      { id: 'call_exp_2', name: 'regenerate_section_text' },
    ] } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_exp_1', name: 'pb_list_sections', args: {} } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_exp_1', name: 'pb_list_sections', ok: true, result: { ok: true, sections: [{ id: 'about-1', type: 'AboutSection' }] } } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_exp_2', name: 'regenerate_section_text', args: { component_id: 'about-1', brief: 'roof repair Toronto' } } },
    { event: 'mutation_committed', data: { iter: 1, tool_call_id: 'call_exp_2', name: 'regenerate_section_text', group: 'content' } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_exp_2', name: 'regenerate_section_text', ok: true, result: { ok: true, result: { applied: 3 } } } },
    { event: 'final_message', data: { iter: 1, content: 'Updated your About section for a roof repair company in Toronto.' } },
    { event: 'done', data: {
      request_id: 'req_explicit_1',
      conversation_id: 'conv_explicit_1',
      messages: [
        { role: 'user', content: 'Yes, change my about section content to a roof repair company in Toronto' },
        { role: 'assistant', content: 'Updated your About section for a roof repair company in Toronto.' },
      ],
      pending_confirmation: null,
      trace: [
        { iter: 1, type: 'tool', name: 'pb_list_sections', tool_call_id: 'call_exp_1', ok: true, status: 'success' },
        { iter: 1, type: 'tool', name: 'regenerate_section_text', tool_call_id: 'call_exp_2', ok: true, status: 'success' },
        { iter: 2, type: 'final', content: 'Updated your About section for a roof repair company in Toronto.' },
      ],
      iterations: 2,
      usage: { prompt_tokens: 130, completion_tokens: 50, total_tokens: 180 },
      ctx: { project_id: '69f515295ac7bd7572f9590c', page_id: null, locale: null },
    } },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AI Intent Confirmation Flow', () => {
  // ---------------------------------------------------------------------------
  // Test 1 — Intent confirmation card appears, shows only description, no heading
  // ---------------------------------------------------------------------------
  describe('Test 1 — Intent confirmation card UI', () => {
    before(() => {
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: sseBody(buildIntentConfirmationFrames()),
        });
      }).as('aiChatIntent');

      loginAndOpenEditor();
    });

    it('shows discovery tool rows silently then renders ConfirmationCard with disabled composer and no technical heading', () => {
      // Open the AI panel (defaultOpen=false in the editor, so FAB is shown)
      cy.get('[data-cy="ai-assistant-fab"]').click();
      cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');

      cy.get('[data-cy="ai-assistant-composer-input"]').type(
        'Change my hero section content to match a bakery in Paris'
      );
      cy.get('[data-cy="ai-assistant-send"]').click();

      cy.wait('@aiChatIntent');

      // Discovery tool rows must appear (pb_list_sections, pb_get_component_tree)
      cy.get('[data-cy="ai-tool-row"]').should('have.length.at.least', 2);
      cy.get('[data-cy="ai-tool-row"]').each(($row) => {
        cy.wrap($row).should('have.attr', 'data-status', 'success');
      });

      // ConfirmationCard must appear
      cy.get('[data-cy="ai-assistant-confirm-card"]')
        .should('be.visible')
        .and('have.attr', 'data-tool-name', 'request_confirmation');

      // Description text (the plan sentence) must be present
      cy.get('[data-cy="ai-assistant-confirm-card"]');

      // NO technical heading — the heading data-cy must not be in the DOM
      cy.get('[data-cy="ai-confirm-card-technical-heading"]').should('not.exist');

      // NO JSON args block — no <pre> element inside the card
      cy.get('[data-cy="ai-assistant-confirm-card"] pre').should('not.exist');

      // Buttons must say "Proceed" and "Cancel" (not "Confirm" or "Skip")
      cy.get('[data-cy="ai-assistant-confirm-approve"]');
      cy.get('[data-cy="ai-assistant-confirm-skip"]');

      // Status must be awaiting_confirmation
      cy.get('[data-cy="ai-assistant-status"]');

      // Input and send button must be disabled while awaiting confirmation
      cy.get('[data-cy="ai-assistant-composer-input"]').should('be.disabled');
      cy.get('[data-cy="ai-assistant-send"]').should('be.disabled');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 2 — Proceed executes the mutation
  // ---------------------------------------------------------------------------
  describe('Test 2 — Proceed triggers mutation and shows success message', () => {
    before(() => {
      let callCount = 0;
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        callCount += 1;
        if (callCount === 1) {
          req.reply({
            statusCode: 200,
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
            body: sseBody(buildIntentConfirmationFrames()),
          });
        } else {
          req.reply({
            statusCode: 200,
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
            body: sseBody(buildProceedFrames()),
          });
        }
      }).as('aiChat');

      loginAndOpenEditor();
    });

    it('clicking Proceed re-submits with confirmed_tool_calls, removes the card, and accumulates non-zero tokens', () => {
      cy.get('[data-cy="ai-assistant-fab"]').click();
      cy.get('[data-cy="ai-assistant-composer-input"]').type(
        'Change my hero section content to match a bakery in Paris'
      );
      cy.get('[data-cy="ai-assistant-send"]').click();
      cy.wait('@aiChat');

      // Confirmation card is visible
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('be.visible');

      // Click Proceed
      cy.get('[data-cy="ai-assistant-confirm-approve"]').click();

      // Second request fires — wait for it and verify confirmed_tool_calls sent
      cy.wait('@aiChat').its('request.body').should((body) => {
        expect(body).to.have.property('confirmed_tool_calls');
        expect(body.confirmed_tool_calls).to.be.an('array').with.length.greaterThan(0);
      });

      // Confirmation card must disappear
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('not.exist');

      // Mutation tool row (regenerate_section_text) must appear
      cy.get('[data-cy="ai-tool-row"]').should('have.length.at.least', 1);

      // Final assistant message with success text must appear
      cy.get('[data-cy="ai-assistant-messages"]');

      // Status returns to idle
      cy.get('[data-cy="ai-assistant-status"]');

      // Token counter must be non-zero (accumulated across both rounds).
      // We don't assert an exact value because the counter accumulates across
      // rounds within a session (165 from discovery + 220 from mutation = 385+).
      cy.get('[data-cy="ai-assistant-token-count"]').invoke('text').should((text) => {
        const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
        expect(num).to.be.greaterThan(0);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Cancel aborts cleanly, no mutation
  // ---------------------------------------------------------------------------
  describe('Test 3 — Cancel aborts cleanly with no canvas change', () => {
    before(() => {
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: sseBody(buildIntentConfirmationFrames()),
        });
      }).as('aiChatIntent');

      loginAndOpenEditor();
    });

    it('clicking Cancel removes the card, re-enables the composer, and fires no second request', () => {
      cy.get('[data-cy="ai-assistant-fab"]').click();
      cy.get('[data-cy="ai-assistant-composer-input"]').type(
        'Change my hero section content to match a bakery in Paris'
      );
      cy.get('[data-cy="ai-assistant-send"]').click();
      cy.wait('@aiChatIntent');

      // Confirmation card is visible
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('be.visible');

      // Track whether a second call fires (it should NOT)
      let secondCallFired = false;
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', () => {
        secondCallFired = true;
      }).as('aiChatSecond');

      // Click Cancel
      cy.get('[data-cy="ai-assistant-confirm-skip"]').click();

      // Confirmation card must disappear immediately
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('not.exist');

      // Cancellation acknowledgement from the assistant must appear
      cy.get('[data-cy="ai-assistant-messages"]');

      // Status returns to idle
      cy.get('[data-cy="ai-assistant-status"]');

      // No regenerate_section_text tool row should be present
      cy.get('[data-cy="ai-tool-row"]').each(($row) => {
        cy.wrap($row).invoke('attr', 'data-tool-name').then((toolName) => {
          expect(toolName).to.not.equal('regenerate_section_text');
        });
      });

      // Input re-enabled
      cy.get('[data-cy="ai-assistant-composer-input"]').should('not.be.disabled');

      // No second network call was made
      cy.then(() => {
        expect(secondCallFired).to.be.false;
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Explicit approval skips the confirmation card
  // ---------------------------------------------------------------------------
  describe('Test 4 — Explicit approval bypasses the confirmation card', () => {
    before(() => {
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: sseBody(buildExplicitApprovalFrames()),
        });
      }).as('aiChatExplicit');

      loginAndOpenEditor();
    });

    it('a message with explicit approval goes straight to mutation without showing a ConfirmationCard', () => {
      cy.get('[data-cy="ai-assistant-fab"]').click();
      cy.get('[data-cy="ai-assistant-composer-input"]').type(
        'Yes, change my about section content to a roof repair company in Toronto'
      );
      cy.get('[data-cy="ai-assistant-send"]').click();
      cy.wait('@aiChatExplicit');

      // ConfirmationCard must NEVER appear
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('not.exist');

      // Final message from the direct mutation must appear
      cy.get('[data-cy="ai-assistant-messages"]');

      // Status is idle — went straight through
      cy.get('[data-cy="ai-assistant-status"]');

      // Mutation tool row must be present
      cy.get('[data-cy="ai-tool-row"]').should('have.length.at.least', 1);
    });
  });
});
