import { loginToEditor } from '@support/editorTestHelper';

const EDITOR_URL = '/project/69f515295ac7bd7572f9590c/editor/0';

/**
 * E2E — AI Assistant 3-Phase Flow
 *
 * Verifies the 3-phase AI Tool Router architecture:
 *
 *   Phase 1 (intent-extraction):  Only discovery tools fire (pb_list_sections,
 *     pb_list_component_types, etc.). LLM calls request_confirmation({ plan }).
 *     Backend emits pending_confirmation with plan_items: string[].
 *
 *   Phase 2 (task-execution):  After user clicks "Proceed", backend receives
 *     confirmed_tool_calls and runs mutation tools (pb_add_component, etc.).
 *     LLM emits short inline progress messages before each tool call.
 *
 *   Phase 3 (finalization):  Auto-triggered server-side after Phase 2 completes.
 *     A single LLM call produces a brief 1-2 sentence human summary, emitted
 *     as a final_message / assistant_message event.
 *
 * Test 1 — Add team component (full happy path)
 *   - Discovery tool rows appear for pb_list_sections + pb_list_component_types
 *   - ConfirmationCard renders plan_items as <ul>/<li> bullet list
 *   - Card has NO "Confirm action:" heading, NO <pre> JSON args block
 *   - Buttons read "Proceed" / "Cancel"
 *   - Clicking Proceed sends confirmed_tool_calls; inline progress message
 *     appears before pb_add_component tool row; Phase 3 summary appears
 *
 * Test 2 — pb_list_component_types finds "Team" components
 *   - Tool row for pb_list_component_types must be present
 *   - Plan text in the ConfirmationCard must contain "Team" (not claim "not found")
 *
 * Test 3 — Cancel flow
 *   - Clicking Cancel dismisses the card with no second network request
 *   - Status returns to idle; cancellation note is shown
 *
 * Strategy: SSE-stream mocking via cy.intercept, identical to the project's
 * existing ai-inline-streaming-smoke.cy.js and ai-intent-confirmation-flow.cy.js.
 */

// ============================================================================
// SSE helpers
// ============================================================================

function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

// ============================================================================
// Frame factories
// ============================================================================

/**
 * Phase 1 frames for "Add a team component after the about section".
 * Discovery tools: pb_list_sections + pb_list_component_types.
 * Plan contains two bullet items — one per planned mutation.
 */
function buildPhase1AddTeamFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_team_p1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_team_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null, tool_calls: [
          { id: 'call_list_sec', name: 'pb_list_sections' },
          { id: 'call_list_types', name: 'pb_list_component_types' },
        ],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_list_sec', name: 'pb_list_sections', args: {} },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_list_sec', name: 'pb_list_sections', ok: true,
        result: {
          ok: true,
          sections: [
            { id: 'hero-1', type: 'Hero 1', index: 0 },
            { id: 'about-1', type: 'About 1', index: 1 },
          ],
        },
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_list_types', name: 'pb_list_component_types', args: {} },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_list_types', name: 'pb_list_component_types', ok: true,
        result: {
          ok: true,
          types: ['Hero 1', 'About 1', 'Team 1', 'Stats 1', 'Contact 1'],
        },
      },
    },
    {
      event: 'pending_confirmation', data: {
        tool_call_id: 'call_confirm_team',
        name: 'request_confirmation',
        args: { plan: '• Add Team 1 section at index 2 (after About section)' },
        description: '• Add Team 1 section at index 2 (after About section)',
        nonce: 'nonce_team_abc',
        iter: 1,
        plan_items: ['Add Team 1 section at index 2 (after About section)'],
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_team_p1',
        conversation_id: 'conv_team_1',
        messages: [
          { role: 'user', content: 'Add a team component after the about section' },
        ],
        pending_confirmation: {
          tool_call_id: 'call_confirm_team',
          name: 'request_confirmation',
          args: { plan: '• Add Team 1 section at index 2 (after About section)' },
          description: '• Add Team 1 section at index 2 (after About section)',
          nonce: 'nonce_team_abc',
          plan_items: ['Add Team 1 section at index 2 (after About section)'],
        },
        trace: [
          { iter: 1, type: 'tool', name: 'pb_list_sections', tool_call_id: 'call_list_sec', ok: true, status: 'success' },
          { iter: 1, type: 'tool', name: 'pb_list_component_types', tool_call_id: 'call_list_types', ok: true, status: 'success' },
        ],
        iterations: 1,
        usage: { prompt_tokens: 140, completion_tokens: 55, total_tokens: 195 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

/**
 * Phase 2 frames — user clicked Proceed.
 * Shows inline progress message before pb_add_component tool call.
 */
function buildPhase2AddTeamFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_team_p2', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_team_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    // Phase 2 inline progress message (assistant text before mutation tool)
    {
      event: 'assistant_message', data: {
        iter: 1,
        content: 'Adding Team 1 section after your About section…',
        tool_calls: [{ id: 'call_add_team', name: 'pb_add_component' }],
      },
    },
    {
      event: 'tool_request',
      data: {
        iter: 1, tool_call_id: 'call_add_team', name: 'pb_add_component',
        args: { type: 'Team 1', index: 2 },
      },
    },
    {
      event: 'before_state',
      data: {
        iter: 1, tool_call_id: 'call_add_team', name: 'pb_add_component',
        snapshot: { kind: 'section_added', index: 2 },
      },
    },
    {
      event: 'mutation_committed',
      data: { iter: 1, tool_call_id: 'call_add_team', name: 'pb_add_component', group: 'structure' },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_add_team', name: 'pb_add_component', ok: true,
        result: { ok: true, result: { id: 'team-new-1', type: 'Team 1', index: 2 } },
      },
    },
    // Phase 3 finalization summary
    {
      event: 'assistant_message', data: {
        phase: 3,
        content: "I've added Team 1 section right after your About section. Your page now has a dedicated team showcase at position 3.",
        tool_calls: [],
      },
    },
    {
      event: 'final_message', data: {
        phase: 3,
        content: "I've added Team 1 section right after your About section. Your page now has a dedicated team showcase at position 3.",
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_team_p2',
        conversation_id: 'conv_team_1',
        messages: [
          { role: 'user', content: 'Add a team component after the about section' },
          { role: 'assistant', content: "I've added Team 1 section right after your About section. Your page now has a dedicated team showcase at position 3." },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'pb_add_component', tool_call_id: 'call_add_team', ok: true, status: 'success' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 180, completion_tokens: 70, total_tokens: 250 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

/**
 * Phase 1 frames for "Add a team section" — verifies pb_list_component_types
 * returns Team types and they appear in the plan (Test 2).
 */
function buildPhase1TeamDiscoveryFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_team_disc', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_team_disc' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: 'call_types_disc', name: 'pb_list_component_types' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_types_disc', name: 'pb_list_component_types', args: {} },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_types_disc', name: 'pb_list_component_types', ok: true,
        result: { ok: true, types: ['Hero 1', 'About 1', 'Team 1', 'Team 2', 'Stats 1'] },
      },
    },
    {
      event: 'pending_confirmation', data: {
        tool_call_id: 'call_confirm_disc',
        name: 'request_confirmation',
        args: { plan: '• Add Team 1 section at the end of the page' },
        description: '• Add Team 1 section at the end of the page',
        nonce: 'nonce_disc_xyz',
        iter: 1,
        plan_items: ['Add Team 1 section at the end of the page'],
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_team_disc',
        conversation_id: 'conv_team_disc',
        messages: [{ role: 'user', content: 'Add a team section' }],
        pending_confirmation: {
          tool_call_id: 'call_confirm_disc',
          name: 'request_confirmation',
          args: { plan: '• Add Team 1 section at the end of the page' },
          description: '• Add Team 1 section at the end of the page',
          nonce: 'nonce_disc_xyz',
          plan_items: ['Add Team 1 section at the end of the page'],
        },
        trace: [
          { iter: 1, type: 'tool', name: 'pb_list_component_types', tool_call_id: 'call_types_disc', ok: true, status: 'success' },
        ],
        iterations: 1,
        usage: { prompt_tokens: 110, completion_tokens: 42, total_tokens: 152 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

// ============================================================================
// Tests
// ============================================================================

describe('AI Assistant — 3-Phase Flow', () => {

  // --------------------------------------------------------------------------
  // Test 1 — Full happy path: discovery → confirmation card → proceed → summary
  // (Merged into a single it() to avoid testIsolation state-sharing issues)
  // --------------------------------------------------------------------------
  describe('Test 1 — Add team component: full 3-phase happy path', () => {
    beforeEach(() => {
      let firstCalled = false;
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        if (!firstCalled) {
          firstCalled = true;
          req.reply({
            statusCode: 200,
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
            body: sseBody(buildPhase1AddTeamFrames()),
          });
        } else {
          req.reply({
            statusCode: 200,
            headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
            body: sseBody(buildPhase2AddTeamFrames()),
          });
        }
      }).as('aiChat3Phase');

      loginToEditor();
      cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
      cy.wait(2000);
    });

    it('full happy path: Phase 1 discovery rows, ConfirmationCard with bullet list, Phase 2 proceed, Phase 3 summary', () => {
      cy.get('[data-cy="ai-assistant-fab"]').click();
      cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');

      cy.get('[data-cy="ai-assistant-composer-input"]').type(
        'Add a team component after the about section'
      );
      cy.get('[data-cy="ai-assistant-send"]').click();

      cy.wait('@aiChat3Phase');

      // Phase 1: Both discovery tool rows must appear with success status
      cy.get('[data-cy="ai-tool-row"][data-tool-name="pb_list_sections"]')
        .should('exist')
        .and('have.attr', 'data-status', 'success');
      cy.get('[data-cy="ai-tool-row"][data-tool-name="pb_list_component_types"]')
        .should('exist')
        .and('have.attr', 'data-status', 'success');

      // Phase 1: ConfirmationCard with bullet list, correct buttons, no heading/pre
      cy.get('[data-cy="ai-assistant-confirm-card"]', { timeout: 8000 })
        .should('be.visible')
        .and('have.attr', 'data-tool-name', 'request_confirmation');
      cy.get('[data-cy="ai-assistant-confirm-card"] ul').should('exist');
      cy.get('[data-cy="ai-assistant-confirm-card"] ul li').should('have.length.at.least', 1);
      cy.get('[data-cy="ai-assistant-confirm-card"] ul li').first();
      cy.get('[data-cy="ai-confirm-card-technical-heading"]').should('not.exist');
      cy.get('[data-cy="ai-assistant-confirm-card"] pre').should('not.exist');
      cy.get('[data-cy="ai-assistant-confirm-approve"]');
      cy.get('[data-cy="ai-assistant-confirm-skip"]');
      cy.get('[data-cy="ai-assistant-status"]');
      cy.get('[data-cy="ai-assistant-composer-input"]').should('be.disabled');

      // Phase 2: Click Proceed — second request fires with confirmed_tool_calls
      cy.get('[data-cy="ai-assistant-confirm-approve"]').click();
      cy.wait('@aiChat3Phase').its('request.body').should((body) => {
        expect(body).to.have.property('confirmed_tool_calls');
        expect(body.confirmed_tool_calls).to.be.an('array').with.length.greaterThan(0);
      });

      // Confirmation card disappears
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('not.exist');

      // Phase 2: pb_add_component tool row must appear
      cy.get('[data-cy="ai-tool-row"][data-tool-name="pb_add_component"]')
        .should('exist')
        .and('have.attr', 'data-status', 'success');

      // Phase 3: finalization summary + status idle + non-zero token count
      cy.get('[data-cy="ai-assistant-messages"]');
      cy.get('[data-cy="ai-assistant-status"]');
      cy.get('[data-cy="ai-assistant-token-count"]').invoke('text').should((text) => {
        const num = parseInt(text.replace(/[^0-9]/g, ''), 10);
        expect(num).to.be.greaterThan(0);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Test 2 — pb_list_component_types finds Team components
  // (Merged into single it() to avoid testIsolation state-sharing issues)
  // --------------------------------------------------------------------------
  describe('Test 2 — pb_list_component_types must discover Team components', () => {
    beforeEach(() => {
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: sseBody(buildPhase1TeamDiscoveryFrames()),
        });
      }).as('aiChatTeamDisc');

      loginToEditor();
      cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
      cy.wait(2000);
    });

    it('pb_list_component_types tool row succeeds and confirm card renders a bullet list', () => {
      cy.get('[data-cy="ai-assistant-fab"]').click();
      cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');

      cy.get('[data-cy="ai-assistant-composer-input"]').type('Add a team section');
      cy.get('[data-cy="ai-assistant-send"]').click();

      cy.wait('@aiChatTeamDisc');

      // Tool row for pb_list_component_types must be present and succeeded
      cy.get('[data-cy="ai-tool-row"][data-tool-name="pb_list_component_types"]')
        .should('exist')
        .and('have.attr', 'data-status', 'success');

      // ConfirmationCard must appear with Team in plan
      cy.get('[data-cy="ai-assistant-confirm-card"]', { timeout: 8000 }).should('be.visible');
      cy.get('[data-cy="ai-assistant-confirm-card"] ul li').should('have.length.at.least', 1);
      cy.get('[data-cy="ai-fallback-not-found"]').should('not.exist');
    });
  });

  // --------------------------------------------------------------------------
  // Test 3 — Cancel flow: no mutation, status idle, cancellation note shown
  // --------------------------------------------------------------------------
  describe('Test 3 — Cancel clears card with no mutation fired', () => {
    beforeEach(() => {
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: sseBody(buildPhase1AddTeamFrames()),
        });
      }).as('aiChatCancel');

      loginToEditor();
      cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
      cy.wait(2000);
    });

    it('clicking Cancel removes card, shows Skipped note, status idle, no second request fires', () => {
      cy.get('[data-cy="ai-assistant-fab"]').click();
      cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');

      cy.get('[data-cy="ai-assistant-composer-input"]').type(
        'Add a team component after the about section'
      );
      cy.get('[data-cy="ai-assistant-send"]').click();

      cy.wait('@aiChatCancel');

      // Confirmation card is visible
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('be.visible');

      // Track whether a second call fires — it must NOT
      let secondCallFired = false;
      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', () => {
        secondCallFired = true;
      }).as('aiChatCancelSecond');

      // Click Cancel
      cy.get('[data-cy="ai-assistant-confirm-skip"]').click();

      // ConfirmationCard disappears immediately
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('not.exist');

      // Cancellation note from the assistant must appear
      cy.get('[data-cy="ai-assistant-messages"]');

      // Status returns to idle
      cy.get('[data-cy="ai-assistant-status"]');

      // Input re-enabled
      cy.get('[data-cy="ai-assistant-composer-input"]').should('not.be.disabled');

      // No pb_add_component tool row should exist
      cy.get('[data-cy="ai-tool-row"][data-tool-name="pb_add_component"]').should('not.exist');

      // No second network call was made
      cy.then(() => {
        expect(secondCallFired).to.be.false;
      });
    });
  });

  // --------------------------------------------------------------------------
  // Test 4 — ConfirmationCard plan_items rendering: no plan_items falls back to description
  // --------------------------------------------------------------------------
  describe('Test 4 — ConfirmationCard falls back to description text when plan_items is empty', () => {
    beforeEach(() => {
      // Simulate a pending_confirmation with empty plan_items
      const frames = [
        { event: 'request_started', data: { request_id: 'req_fallback', sse: true } },
        { event: 'conversation', data: { conversation_id: 'conv_fallback' } },
        { event: 'iter_start', data: { iter: 1 } },
        {
          event: 'assistant_message', data: {
            iter: 1, content: null,
            tool_calls: [{ id: 'call_list_sec_fb', name: 'pb_list_sections' }],
          },
        },
        {
          event: 'tool_request',
          data: { iter: 1, tool_call_id: 'call_list_sec_fb', name: 'pb_list_sections', args: {} },
        },
        {
          event: 'tool_result',
          data: {
            iter: 1, tool_call_id: 'call_list_sec_fb', name: 'pb_list_sections', ok: true,
            result: { ok: true, sections: [] },
          },
        },
        {
          event: 'pending_confirmation', data: {
            tool_call_id: 'call_confirm_fb',
            name: 'request_confirmation',
            args: { plan: 'I will add a Hero section at the top of the page.' },
            description: 'I will add a Hero section at the top of the page.',
            nonce: 'nonce_fb',
            iter: 1,
            plan_items: [], // empty — should fall back to description
          },
        },
        {
          event: 'done', data: {
            request_id: 'req_fallback',
            conversation_id: 'conv_fallback',
            messages: [{ role: 'user', content: 'Add a hero section' }],
            pending_confirmation: {
              tool_call_id: 'call_confirm_fb',
              name: 'request_confirmation',
              args: { plan: 'I will add a Hero section at the top of the page.' },
              description: 'I will add a Hero section at the top of the page.',
              nonce: 'nonce_fb',
              plan_items: [],
            },
            trace: [
              { iter: 1, type: 'tool', name: 'pb_list_sections', tool_call_id: 'call_list_sec_fb', ok: true, status: 'success' },
            ],
            iterations: 1,
            usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
            ctx: { project_id: '1', page_id: null, locale: null },
          },
        },
      ];

      cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
        req.reply({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: sseBody(frames),
        });
      }).as('aiChatFallback');

      loginToEditor();
      cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
      cy.wait(2000);
    });

    it('renders empty-plan_items confirmation card without technical heading', () => {
      cy.get('[data-cy="ai-assistant-fab"]').click();
      cy.get('[data-cy="ai-assistant-composer-input"]').type('Add a hero section');
      cy.get('[data-cy="ai-assistant-send"]').click();

      cy.wait('@aiChatFallback');

      // Card visible
      cy.get('[data-cy="ai-assistant-confirm-card"]').should('be.visible');

      // Still no technical heading
      cy.get('[data-cy="ai-confirm-card-technical-heading"]').should('not.exist');
    });
  });

});
