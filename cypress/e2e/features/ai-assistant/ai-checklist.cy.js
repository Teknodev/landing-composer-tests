/**
 * E2E - AI Checklist (merged)
 *
 * Merges two prior specs into a single suite:
 *   - ai-checklist-flow.cy.js          (planner-checklist chat architecture)
 *   - ai-checklist-step-verifier.cy.js (per-step mini-loop + DB-checked verifier)
 *
 * Architecture under test:
 *   1. Plan turn: client POSTs /ai/chat with body.architecture='checklist'.
 *      Server runs the planner and STOPS at the approval gate, streaming a
 *      single `pending_checklist` SSE event with the COMPLETE ordered steps[]
 *      and a per-checklist nonce. The frontend renders one ChecklistCard with
 *      Approve / Reject - the WHOLE checklist is one approval decision.
 *   2. Composer stays ENABLED while awaiting approval (typing a new message is
 *      an implicit reject - status goes idle on pending_checklist).
 *   3. Approve: client re-POSTs /ai/chat with body.checklist_approval echoing
 *      checklist_id, nonce, cycle and steps verbatim, decision='approve'.
 *      Steps flip pending -> running -> done; the card reaches "completed";
 *      a final assistant message renders.
 *   4. Re-plan: a failed step triggers a server-side re-plan = a NEW
 *      `pending_checklist` event (is_replan=true, cycle=2).
 *   5. Exhaustion: when the re-plan loop hits its 3-cycle cap the server emits
 *      `checklist_exhausted` + a couldn't-complete final_message.
 *   6. Per-step v2: mini agentic loop (cap MAX_STEP_ITERATIONS=8) with
 *      same-model verifier (phase 26) + one inner retry on verifier
 *      `done:false`. Hard-fail reasons: `step_iterations_exhausted`,
 *      `verification_failed_after_retry:<hint>`.
 *
 * SSE is STUBBED (live LLM output is non-deterministic).
 */

// Test project editor route - same project used by the other AI specs.
const EDITOR_URL = '/project/69f515295ac7bd7572f9590c/editor/0';

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

function replySSE(frames) {
  return {
    statusCode: 200,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
    body: sseBody(frames),
  };
}

// ===========================================================================
// PLAN-FLOW frame builders
// ===========================================================================
const PLAN_STEPS = [
  { id: 'step_0_xk29ab', text: "Add a Team section after the About section", tool_hint: 'pb_add_component' },
  { id: 'step_1_qm83zd', text: "Set the Team section heading to 'Meet the team'", tool_hint: 'pb_update_component_props' },
];

const REPLAN_STEPS = [
  { id: 'step_0_re44aa', text: "Read the Team section prop schema, then set its title prop to 'Meet the team'", tool_hint: 'pb_get_component_schema' },
];

function buildPlanFrames() {
  return [
    { event: 'request_started', data: { request_id: 'vpfwa3', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_checklist_1' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'plan' } },
    { event: 'pending_checklist', data: {
      checklist_id: 'cl_a1b2c3d4ef',
      cycle: 1,
      is_replan: false,
      steps: PLAN_STEPS,
      nonce: '9fk2a0xz7bq1mm44',
    } },
    { event: 'done', data: {
      request_id: 'vpfwa3',
      conversation_id: 'conv_checklist_1',
      architecture: 'checklist',
      checklist_status: 'awaiting_approval',
      pending_checklist: {
        checklist_id: 'cl_a1b2c3d4ef',
        cycle: 1,
        is_replan: false,
        steps: PLAN_STEPS,
        nonce: '9fk2a0xz7bq1mm44',
      },
      messages: [{ role: 'user', content: 'make the hero headline shorter and change the button color to blue' }],
      usage: { prompt_tokens: 90, completion_tokens: 30, total_tokens: 120 },
    } },
  ];
}

function buildHappyExecuteFrames() {
  return [
    { event: 'request_started', data: { request_id: 'vpfwa4', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_checklist_1' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'execute' } },
    { event: 'checklist_execution_started', data: { checklist_id: 'cl_a1b2c3d4ef', total_steps: 2 } },
    { event: 'checklist_step', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_0_xk29ab', from: 'pending', to: 'running' } },
    { event: 'tool_result', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_0_xk29ab', tool_call_id: 'tc_1', name: 'pb_add_component', ok: true, result: { index: 3 } } },
    { event: 'mutation_committed', data: { step_id: 'step_0_xk29ab', name: 'pb_add_component', group: 'pb' } },
    { event: 'checklist_step', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_0_xk29ab', from: 'running', to: 'done' } },
    { event: 'checklist_step', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_1_qm83zd', from: 'pending', to: 'running' } },
    { event: 'tool_result', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_1_qm83zd', tool_call_id: 'tc_2', name: 'pb_update_component_props', ok: true } },
    { event: 'checklist_step', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_1_qm83zd', from: 'running', to: 'done' } },
    { event: 'checklist_execution_finished', data: { checklist_id: 'cl_a1b2c3d4ef', done: 2, failed: 0, total: 2 } },
    { event: 'final_message', data: { content: 'All checklist steps completed.' } },
    { event: 'done', data: {
      request_id: 'vpfwa4',
      conversation_id: 'conv_checklist_1',
      architecture: 'checklist',
      checklist_status: 'completed',
      assistant_content: 'All checklist steps completed.',
      messages: [
        { role: 'user', content: 'make the hero headline shorter and change the button color to blue' },
        { role: 'assistant', content: 'All checklist steps completed.' },
      ],
      usage: { prompt_tokens: 90, completion_tokens: 30, total_tokens: 120 },
    } },
  ];
}

function buildFailureThenReplanFrames() {
  return [
    { event: 'request_started', data: { request_id: 'vpfwa5', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_checklist_1' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'execute' } },
    { event: 'checklist_execution_started', data: { checklist_id: 'cl_a1b2c3d4ef', total_steps: 2 } },
    { event: 'checklist_step', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_0_xk29ab', from: 'pending', to: 'running' } },
    { event: 'checklist_step', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_0_xk29ab', from: 'running', to: 'done' } },
    { event: 'checklist_step', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_1_qm83zd', from: 'pending', to: 'running' } },
    { event: 'tool_result', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_1_qm83zd', tool_call_id: 'tc_2', name: 'pb_update_component_props', ok: false, error: { error: 'prop_not_found' } } },
    { event: 'checklist_step', data: { checklist_id: 'cl_a1b2c3d4ef', step_id: 'step_1_qm83zd', from: 'running', to: 'failed', reason: 'all tool calls failed' } },
    { event: 'checklist_execution_finished', data: { checklist_id: 'cl_a1b2c3d4ef', done: 1, failed: 1, total: 2 } },
    { event: 'pending_checklist', data: {
      checklist_id: 'cl_99ee77zz11',
      cycle: 2,
      is_replan: true,
      replan_of: 'cl_a1b2c3d4ef',
      steps: REPLAN_STEPS,
      nonce: 'kk72bb19xq03ee5a',
    } },
    { event: 'done', data: {
      request_id: 'vpfwa5',
      conversation_id: 'conv_checklist_1',
      architecture: 'checklist',
      checklist_status: 'awaiting_approval',
      pending_checklist: {
        checklist_id: 'cl_99ee77zz11',
        cycle: 2,
        is_replan: true,
        replan_of: 'cl_a1b2c3d4ef',
        steps: REPLAN_STEPS,
        nonce: 'kk72bb19xq03ee5a',
      },
      usage: { prompt_tokens: 95, completion_tokens: 35, total_tokens: 130 },
    } },
  ];
}

function buildExhaustionFrames() {
  return [
    { event: 'request_started', data: { request_id: 'vpfwa6', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_checklist_1' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'execute' } },
    { event: 'checklist_execution_started', data: { checklist_id: 'cl_99ee77zz11', total_steps: 1 } },
    { event: 'checklist_step', data: { checklist_id: 'cl_99ee77zz11', step_id: 'step_0_re44aa', from: 'pending', to: 'running' } },
    { event: 'tool_result', data: { checklist_id: 'cl_99ee77zz11', step_id: 'step_0_re44aa', tool_call_id: 'tc_3', name: 'pb_get_component_schema', ok: false, error: { error: 'schema_unavailable' } } },
    { event: 'checklist_step', data: { checklist_id: 'cl_99ee77zz11', step_id: 'step_0_re44aa', from: 'running', to: 'failed', reason: 'schema unavailable' } },
    { event: 'checklist_execution_finished', data: { checklist_id: 'cl_99ee77zz11', done: 0, failed: 1, total: 1 } },
    { event: 'checklist_exhausted', data: {
      previous_checklist_id: 'cl_99ee77zz11',
      cycles_used: 3,
      unresolved: [
        { text: "Set the Team section heading to 'Meet the team'", reason: 'schema unavailable' },
      ],
    } },
    { event: 'final_message', data: { content: "I couldn't finish part of the plan after 3 attempts. One step is still unresolved." } },
    { event: 'done', data: {
      request_id: 'vpfwa6',
      conversation_id: 'conv_checklist_1',
      architecture: 'checklist',
      checklist_status: 'couldnt_complete',
      assistant_content: "I couldn't finish part of the plan after 3 attempts. One step is still unresolved.",
      unresolved_steps: [
        { text: "Set the Team section heading to 'Meet the team'", reason: 'schema unavailable' },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    } },
  ];
}

// ===========================================================================
// STEP-VERIFIER (v2) frame builders
// ===========================================================================
const PLAN_STEPS_ONE = [
  { id: 'step_0', text: "Change the hero headline to 'Hello'", tool_hint: 'pb_update_component_props' },
];

const REPLAN_STEPS_ONE = [
  { id: 'step_0_re', text: "Re-attempt: read schema then update the hero headline to 'Hello'", tool_hint: 'pb_get_component_schema' },
];

function buildV2PlanFrames(checklistId = 'cl_v2_plan', nonce = 'n_v2_plan_111') {
  return [
    { event: 'request_started', data: { request_id: 'req_v2_plan', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_v2' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'plan' } },
    { event: 'pending_checklist', data: {
      checklist_id: checklistId, cycle: 1, is_replan: false, steps: PLAN_STEPS_ONE, nonce,
    } },
    { event: 'done', data: {
      request_id: 'req_v2_plan',
      conversation_id: 'conv_v2',
      architecture: 'checklist',
      checklist_status: 'awaiting_approval',
      pending_checklist: { checklist_id: checklistId, cycle: 1, is_replan: false, steps: PLAN_STEPS_ONE, nonce },
      messages: [{ role: 'user', content: "change the hero headline to 'Hello'" }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
    } },
  ];
}

function buildExecuteNaturalPass(checklistId = 'cl_v2_plan') {
  return [
    { event: 'request_started', data: { request_id: 'req_v2_exec1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_v2' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'execute' } },
    { event: 'checklist_execution_started', data: { checklist_id: checklistId, total_steps: 1 } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'pending', to: 'running', phase: 'executing' } },
    { event: 'tool_result', data: { checklist_id: checklistId, step_id: 'step_0', tool_call_id: 'tc_1', name: 'pb_update_component_props', ok: true, result: { ok: true } } },
    { event: 'mutation_committed', data: { step_id: 'step_0', name: 'pb_update_component_props', group: 'pb' } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'running', phase: 'verifying' } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'done' } },
    { event: 'checklist_execution_finished', data: { checklist_id: checklistId, done: 1, failed: 0, total: 1 } },
    { event: 'final_message', data: { content: 'All checklist steps completed.' } },
    { event: 'done', data: {
      request_id: 'req_v2_exec1',
      conversation_id: 'conv_v2',
      architecture: 'checklist',
      checklist_status: 'completed',
      assistant_content: 'All checklist steps completed.',
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
    } },
  ];
}

function buildExecuteRetryThenPass(checklistId = 'cl_v2_plan') {
  return [
    { event: 'request_started', data: { request_id: 'req_v2_exec2', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_v2' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'execute' } },
    { event: 'checklist_execution_started', data: { checklist_id: checklistId, total_steps: 1 } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'pending', to: 'running', phase: 'executing' } },
    { event: 'tool_result', data: { checklist_id: checklistId, step_id: 'step_0', tool_call_id: 'tc_a', name: 'pb_update_component_props', ok: true, result: { ok: true } } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'running', phase: 'verifying' } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'running', phase: 'retrying', reason: "Headline still reads 'Welcome', expected 'Hello'" } },
    { event: 'tool_result', data: { checklist_id: checklistId, step_id: 'step_0', tool_call_id: 'tc_b', name: 'pb_get_component_schema', ok: true, result: { ok: true } } },
    { event: 'tool_result', data: { checklist_id: checklistId, step_id: 'step_0', tool_call_id: 'tc_c', name: 'pb_update_component_props', ok: true, result: { ok: true } } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'running', phase: 'verifying' } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'done' } },
    { event: 'checklist_execution_finished', data: { checklist_id: checklistId, done: 1, failed: 0, total: 1 } },
    { event: 'final_message', data: { content: 'All checklist steps completed.' } },
    { event: 'done', data: {
      request_id: 'req_v2_exec2',
      conversation_id: 'conv_v2',
      architecture: 'checklist',
      checklist_status: 'completed',
      assistant_content: 'All checklist steps completed.',
      usage: { prompt_tokens: 60, completion_tokens: 20, total_tokens: 80 },
    } },
  ];
}

function buildExecuteIterationsExhausted(checklistId = 'cl_v2_plan') {
  return [
    { event: 'request_started', data: { request_id: 'req_v2_exec3', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_v2' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'execute' } },
    { event: 'checklist_execution_started', data: { checklist_id: checklistId, total_steps: 1 } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'pending', to: 'running', phase: 'executing' } },
    ...Array.from({ length: 8 }, (_, i) => ({
      event: 'tool_result',
      data: { checklist_id: checklistId, step_id: 'step_0', tool_call_id: `tc_iter_${i + 1}`, name: 'pb_update_component_props', ok: true, result: { ok: true } },
    })),
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'failed', reason: 'step_iterations_exhausted' } },
    { event: 'checklist_execution_finished', data: { checklist_id: checklistId, done: 0, failed: 1, total: 1 } },
    { event: 'pending_checklist', data: {
      checklist_id: 'cl_v2_replan_a',
      cycle: 2,
      is_replan: true,
      replan_of: checklistId,
      steps: REPLAN_STEPS_ONE,
      nonce: 'n_v2_replan_a',
    } },
    { event: 'done', data: {
      request_id: 'req_v2_exec3',
      conversation_id: 'conv_v2',
      architecture: 'checklist',
      checklist_status: 'awaiting_approval',
      pending_checklist: { checklist_id: 'cl_v2_replan_a', cycle: 2, is_replan: true, replan_of: checklistId, steps: REPLAN_STEPS_ONE, nonce: 'n_v2_replan_a' },
      usage: { prompt_tokens: 80, completion_tokens: 25, total_tokens: 105 },
    } },
  ];
}

function buildExecuteVerificationFailedAfterRetry(checklistId = 'cl_v2_plan') {
  return [
    { event: 'request_started', data: { request_id: 'req_v2_exec4', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_v2' } },
    { event: 'loop_start', data: { architecture: 'checklist', mode: 'execute' } },
    { event: 'checklist_execution_started', data: { checklist_id: checklistId, total_steps: 1 } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'pending', to: 'running', phase: 'executing' } },
    { event: 'tool_result', data: { checklist_id: checklistId, step_id: 'step_0', tool_call_id: 'tc_v1', name: 'pb_update_component_props', ok: true, result: { ok: true } } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'running', phase: 'verifying' } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'running', phase: 'retrying', reason: 'Headline still wrong' } },
    { event: 'tool_result', data: { checklist_id: checklistId, step_id: 'step_0', tool_call_id: 'tc_v2', name: 'pb_update_component_props', ok: true, result: { ok: true } } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'running', phase: 'verifying' } },
    { event: 'checklist_step', data: { checklist_id: checklistId, step_id: 'step_0', from: 'running', to: 'failed', reason: 'verification_failed_after_retry: Headline still wrong' } },
    { event: 'checklist_execution_finished', data: { checklist_id: checklistId, done: 0, failed: 1, total: 1 } },
    { event: 'pending_checklist', data: {
      checklist_id: 'cl_v2_replan_b',
      cycle: 2,
      is_replan: true,
      replan_of: checklistId,
      steps: REPLAN_STEPS_ONE,
      nonce: 'n_v2_replan_b',
    } },
    { event: 'done', data: {
      request_id: 'req_v2_exec4',
      conversation_id: 'conv_v2',
      architecture: 'checklist',
      checklist_status: 'awaiting_approval',
      pending_checklist: { checklist_id: 'cl_v2_replan_b', cycle: 2, is_replan: true, replan_of: checklistId, steps: REPLAN_STEPS_ONE, nonce: 'n_v2_replan_b' },
      usage: { prompt_tokens: 90, completion_tokens: 28, total_tokens: 118 },
    } },
  ];
}

// ===========================================================================
// Tests
// ===========================================================================
describe('AI checklist', () => {
  // Shared login + panel open. Setup never asserted in it() bodies.
  beforeEach(() => {
    cy.login();
    cy.visit(EDITOR_URL);
    cy.get('[data-cy="ai-assistant-fab"]', { timeout: 15000 }).should('be.visible').click();
    cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');
  });

  // =========================================================================
  // PLAN FLOW
  // =========================================================================
  describe('plan flow', () => {

    // ---------------------------------------------------------------------
    // Plan render - split per audit (one outcome per it).
    // ---------------------------------------------------------------------
    describe('plan render', () => {
      beforeEach(() => {
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          req.reply(replySSE(buildPlanFrames()));
        }).as('aiPlan');

        cy.get('[data-cy="ai-assistant-composer-input"]').type(
          'make the hero headline shorter and change the button color to blue'
        );
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiPlan');
      });

      it('should send architecture="checklist" without checklist_approval on the plan POST', () => {
        cy.get('@aiPlan').its('request.body').should((body) => {
          expect(body).to.have.property('architecture', 'checklist');
          expect(body).to.not.have.property('checklist_approval');
        });
      });

      it('should render a checklist card in awaiting_approval state with the planned steps and Approve/Reject controls', () => {
        cy.get('[data-cy="ai-checklist-card"]')
          .should('be.visible')
          .and('have.attr', 'data-state', 'awaiting_approval')
          .and('have.attr', 'data-kind', 'plan')
          .and('have.attr', 'data-checklist-id', 'cl_a1b2c3d4ef');

        cy.get('[data-cy="ai-checklist-step"]').should('have.length', 2);
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_0_xk29ab"]')
          .should('have.attr', 'data-status', 'pending');
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_1_qm83zd"]')
          .should('have.attr', 'data-status', 'pending');

        cy.get('[data-cy="ai-checklist-approve"]').should('be.visible');
        cy.get('[data-cy="ai-checklist-reject"]').should('be.visible');
      });

      it('should keep the composer input enabled while awaiting approval', () => {
        cy.get('[data-cy="ai-assistant-composer-input"]').should('not.be.disabled');
      });

      it('should not render a re-plan badge on the initial plan card', () => {
        cy.get('[data-cy="ai-checklist-replan-badge"]').should('not.exist');
      });
    });

    // ---------------------------------------------------------------------
    // Approve happy path
    // ---------------------------------------------------------------------
    describe('approve happy path', () => {
      beforeEach(() => {
        let callCount = 0;
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          callCount += 1;
          if (callCount === 1) req.reply(replySSE(buildPlanFrames()));
          else req.reply(replySSE(buildHappyExecuteFrames()));
        }).as('aiChat');

        cy.get('[data-cy="ai-assistant-composer-input"]').type(
          'make the hero headline shorter and change the button color to blue'
        );
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-card"]').should('have.attr', 'data-state', 'awaiting_approval');
        cy.get('[data-cy="ai-checklist-approve"]').click();
        cy.wait('@aiChat');
      });

      it('should re-POST with checklist_approval echoing checklist_id, nonce, cycle and steps verbatim', () => {
        cy.get('@aiChat.all').then((calls) => {
          const approveCall = calls[1];
          const body = approveCall.request.body;
          expect(body).to.have.property('architecture', 'checklist');
          expect(body).to.have.property('checklist_approval');
          const a = body.checklist_approval;
          expect(a.checklist_id).to.equal('cl_a1b2c3d4ef');
          expect(a.nonce).to.equal('9fk2a0xz7bq1mm44');
          expect(a.cycle).to.equal(1);
          expect(a.decision).to.equal('approve');
          expect(a.steps).to.be.an('array').with.length(2);
          expect(a.steps[0].id).to.equal('step_0_xk29ab');
          expect(a.steps[1].id).to.equal('step_1_qm83zd');
        });
      });

      it('should flip both steps to data-status="done" after execution', () => {
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_0_xk29ab"]', { timeout: 10000 })
          .should('have.attr', 'data-status', 'done');
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_1_qm83zd"]', { timeout: 10000 })
          .should('have.attr', 'data-status', 'done');
      });

      it('should move the checklist card to data-state="completed"', () => {
        cy.get('[data-cy="ai-checklist-card"]', { timeout: 10000 })
          .should('have.attr', 'data-state', 'completed');
      });

      it('should remove Approve and Reject controls once execution begins', () => {
        cy.get('[data-cy="ai-checklist-approve"]').should('not.exist');
        cy.get('[data-cy="ai-checklist-reject"]').should('not.exist');
      });
    });

    // ---------------------------------------------------------------------
    // One failure -> re-plan card
    // ---------------------------------------------------------------------
    describe('one failure triggers re-plan', () => {
      beforeEach(() => {
        let callCount = 0;
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          callCount += 1;
          if (callCount === 1) req.reply(replySSE(buildPlanFrames()));
          else req.reply(replySSE(buildFailureThenReplanFrames()));
        }).as('aiChat');

        cy.get('[data-cy="ai-assistant-composer-input"]').type(
          'make the hero headline shorter and change the button color to blue'
        );
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-card"]').should('have.attr', 'data-state', 'awaiting_approval');
        cy.get('[data-cy="ai-checklist-approve"]').click();
        cy.wait('@aiChat');
      });

      it('should move the first checklist card to data-state="partial" when one step fails', () => {
        cy.get('[data-cy="ai-checklist-card"][data-checklist-id="cl_a1b2c3d4ef"]', { timeout: 10000 })
          .should('have.attr', 'data-state', 'partial');
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_1_qm83zd"]')
          .should('have.attr', 'data-status', 'failed');
      });

      it('should render a second checklist card for the re-plan in awaiting_approval state', () => {
        cy.get('[data-cy="ai-checklist-card"]', { timeout: 10000 }).should('have.length', 2);
        cy.get('[data-cy="ai-checklist-card"][data-checklist-id="cl_99ee77zz11"]')
          .should('be.visible')
          .and('have.attr', 'data-state', 'awaiting_approval')
          .and('have.attr', 'data-kind', 'replan');
      });

      it('should show the re-plan badge and Approve control on the second card', () => {
        cy.get('[data-cy="ai-checklist-card"][data-checklist-id="cl_99ee77zz11"]', { timeout: 10000 })
          .find('[data-cy="ai-checklist-replan-badge"]')
          .should('be.visible');
        cy.get('[data-cy="ai-checklist-card"][data-checklist-id="cl_99ee77zz11"]')
          .find('[data-cy="ai-checklist-approve"]')
          .should('be.visible');
      });
    });

    // ---------------------------------------------------------------------
    // Re-plan cap hit -> exhausted
    // ---------------------------------------------------------------------
    describe('re-plan cap exhausted', () => {
      beforeEach(() => {
        let callCount = 0;
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          callCount += 1;
          if (callCount === 1) req.reply(replySSE(buildPlanFrames()));
          else if (callCount === 2) req.reply(replySSE(buildFailureThenReplanFrames()));
          else req.reply(replySSE(buildExhaustionFrames()));
        }).as('aiChat');

        cy.get('[data-cy="ai-assistant-composer-input"]').type(
          'make the hero headline shorter and change the button color to blue'
        );
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-approve"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-card"][data-checklist-id="cl_99ee77zz11"]', { timeout: 10000 })
          .should('have.attr', 'data-state', 'awaiting_approval');
        cy.get('[data-cy="ai-checklist-card"][data-checklist-id="cl_99ee77zz11"]')
          .find('[data-cy="ai-checklist-approve"]')
          .click();
        cy.wait('@aiChat');
      });

      it('should echo cycle=2 and the re-plan nonce on the second approve POST', () => {
        cy.get('@aiChat.all').then((calls) => {
          const replanApprove = calls[2];
          const body = replanApprove.request.body;
          expect(body.checklist_approval.checklist_id).to.equal('cl_99ee77zz11');
          expect(body.checklist_approval.cycle).to.equal(2);
          expect(body.checklist_approval.nonce).to.equal('kk72bb19xq03ee5a');
        });
      });

      it('should render the exhausted notice when the re-plan cap is hit', () => {
        cy.get('[data-cy="ai-checklist-exhausted"]', { timeout: 10000 }).should('be.visible');
      });
    });

    // ---------------------------------------------------------------------
    // Reject discards the plan
    // ---------------------------------------------------------------------
    describe('reject discards the plan', () => {
      beforeEach(() => {
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          if (req.body && req.body.checklist_approval && req.body.checklist_approval.decision === 'reject') {
            req.reply(replySSE([
              { event: 'request_started', data: { request_id: 'vpfwa7', sse: true } },
              { event: 'loop_start', data: { architecture: 'checklist', mode: 'execute' } },
              { event: 'checklist_rejected', data: { checklist_id: 'cl_a1b2c3d4ef' } },
              { event: 'done', data: { architecture: 'checklist', checklist_status: 'rejected' } },
            ]));
          } else {
            req.reply(replySSE(buildPlanFrames()));
          }
        }).as('aiChat');

        cy.get('[data-cy="ai-assistant-composer-input"]').type(
          'make the hero headline shorter and change the button color to blue'
        );
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-card"]').should('have.attr', 'data-state', 'awaiting_approval');
        cy.get('[data-cy="ai-checklist-reject"]').click();
        cy.wait('@aiChat');
      });

      it('should send decision="reject" in checklist_approval on the reject POST', () => {
        cy.get('@aiChat.all').then((calls) => {
          const rejectCall = calls[1];
          expect(rejectCall.request.body.checklist_approval.decision).to.equal('reject');
        });
      });

      it('should move the checklist card to data-state="rejected"', () => {
        cy.get('[data-cy="ai-checklist-card"]', { timeout: 10000 })
          .should('have.attr', 'data-state', 'rejected');
      });

      it('should leave every step at data-status="pending" with no execution', () => {
        cy.get('[data-cy="ai-checklist-step"]').each(($s) => {
          cy.wrap($s).should('have.attr', 'data-status', 'pending');
        });
      });
    });
  });

  // =========================================================================
  // STEP VERIFIER (v2 per-step mini-loop)
  // =========================================================================
  describe('step verifier', () => {

    // ---------------------------------------------------------------------
    // Natural pass - audit: rename to include "and card completes".
    // ---------------------------------------------------------------------
    describe('natural pass', () => {
      beforeEach(() => {
        let callCount = 0;
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          callCount += 1;
          if (callCount === 1) req.reply(replySSE(buildV2PlanFrames()));
          else req.reply(replySSE(buildExecuteNaturalPass()));
        }).as('aiChat');

        cy.get('[data-cy="ai-assistant-composer-input"]').type("change the hero headline to 'Hello'");
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-card"]').should('have.attr', 'data-state', 'awaiting_approval');
        cy.get('[data-cy="ai-checklist-approve"]').click();
        cy.wait('@aiChat');
      });

      it('should set the step to data-status="done" after a single executing + verifying pass and complete the card', () => {
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_0"]', { timeout: 10000 })
          .should('have.attr', 'data-status', 'done');
        cy.get('[data-cy="ai-checklist-card"]')
          .should('have.attr', 'data-state', 'completed');
      });
    });

    // ---------------------------------------------------------------------
    // Retry-then-pass - audit: weakened description to match the single
    // terminal assertion actually performed (no mid-stream snapshot).
    // ---------------------------------------------------------------------
    describe('retry then pass', () => {
      beforeEach(() => {
        let callCount = 0;
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          callCount += 1;
          if (callCount === 1) req.reply(replySSE(buildV2PlanFrames()));
          else req.reply(replySSE(buildExecuteRetryThenPass()));
        }).as('aiChat');

        cy.get('[data-cy="ai-assistant-composer-input"]').type("change the hero headline to 'Hello'");
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-card"]').should('have.attr', 'data-state', 'awaiting_approval');
        cy.get('[data-cy="ai-checklist-approve"]').click();
        cy.wait('@aiChat');
      });

      it('should set the step to data-status="done" after the second verify pass', () => {
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_0"]', { timeout: 10000 })
          .should('have.attr', 'data-status', 'done');
      });
    });

    // ---------------------------------------------------------------------
    // Iterations exhausted - audit: ADD reason contains assertion; drop the
    // partial-state + replan-card extras (covered by plan-flow describe).
    // ---------------------------------------------------------------------
    describe('iterations exhausted', () => {
      beforeEach(() => {
        let callCount = 0;
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          callCount += 1;
          if (callCount === 1) req.reply(replySSE(buildV2PlanFrames()));
          else req.reply(replySSE(buildExecuteIterationsExhausted()));
        }).as('aiChat');

        cy.get('[data-cy="ai-assistant-composer-input"]').type("change the hero headline to 'Hello'");
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-card"]').should('have.attr', 'data-state', 'awaiting_approval');
        cy.get('[data-cy="ai-checklist-approve"]').click();
        cy.wait('@aiChat');
      });

      it('should set the step to data-status="failed" and surface the reason text "step_iterations_exhausted"', () => {
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_0"]', { timeout: 10000 })
          .should('have.attr', 'data-status', 'failed')
          .invoke('text')
          .should('match', /step_iterations_exhausted/);
      });
    });

    // ---------------------------------------------------------------------
    // Verification failed after retry - audit: ADD reason contains
    // assertion; drop the partial-state + replan-card extras.
    // ---------------------------------------------------------------------
    describe('verification failed after retry', () => {
      beforeEach(() => {
        let callCount = 0;
        cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
          callCount += 1;
          if (callCount === 1) req.reply(replySSE(buildV2PlanFrames()));
          else req.reply(replySSE(buildExecuteVerificationFailedAfterRetry()));
        }).as('aiChat');

        cy.get('[data-cy="ai-assistant-composer-input"]').type("change the hero headline to 'Hello'");
        cy.get('[data-cy="ai-assistant-send"]').click();
        cy.wait('@aiChat');
        cy.get('[data-cy="ai-checklist-card"]').should('have.attr', 'data-state', 'awaiting_approval');
        cy.get('[data-cy="ai-checklist-approve"]').click();
        cy.wait('@aiChat');
      });

      it('should set the step to data-status="failed" and surface the reason text "verification_failed_after_retry"', () => {
        cy.get('[data-cy="ai-checklist-step"][data-step-id="step_0"]', { timeout: 10000 })
          .should('have.attr', 'data-status', 'failed')
          .invoke('text')
          .should('match', /verification_failed_after_retry/);
      });
    });
  });
});
