import { loginToEditor } from '@support/editorTestHelper';

/**
 * E2E — AI Tool Router Mutation Flow (regression for bug fix bundle in
 * function 69bd00000000000000000007).
 *
 * Converted to SSE frame format — the AI hook processes only SSE streams.
 */

function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

function buildHappyPathFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_happy_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_happy_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: 'call_regen_1', name: 'regenerate_section_text' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_regen_1', name: 'regenerate_section_text', args: {} },
    },
    {
      event: 'mutation_committed',
      data: { iter: 1, tool_call_id: 'call_regen_1', name: 'regenerate_section_text', group: 'content' },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_regen_1', name: 'regenerate_section_text', ok: true,
        result: { ok: true, result: { applied: 4, paths: ['subtitle', 'sectionTitle', 'items.0.description', 'items.1.description'] } },
      },
    },
    {
      event: 'final_message', data: {
        content: 'Done — I rewrote your About 1 section. Updated subtitle, sectionTitle, and 2 item descriptions.',
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_happy_1',
        conversation_id: 'conv_happy_1',
        messages: [
          { role: 'user', content: 'change about us' },
          { role: 'assistant', content: 'Done — I rewrote your About 1 section. Updated subtitle, sectionTitle, and 2 item descriptions.' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'regenerate_section_text', tool_call_id: 'call_regen_1', ok: true, status: 'success' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 180, completion_tokens: 70, total_tokens: 250 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

function buildHonestFailFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_fail_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_fail_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: 'call_regen_fail', name: 'regenerate_section_text' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_regen_fail', name: 'regenerate_section_text', args: {} },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_regen_fail', name: 'regenerate_section_text', ok: false,
        error: 'no_text_props_found',
        result: { ok: false, error: 'no_text_props_found' },
      },
    },
    {
      event: 'final_message', data: {
        content: "I tried to rewrite that section but it doesn't have any string-typed text props (no_text_props_found). Could you point me at a different section?",
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_fail_1',
        conversation_id: 'conv_fail_1',
        messages: [
          { role: 'user', content: 'rewrite broken-section' },
          { role: 'assistant', content: "I tried to rewrite that section but it doesn't have any string-typed text props (no_text_props_found). Could you point me at a different section?" },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'regenerate_section_text', tool_call_id: 'call_regen_fail', ok: false, status: 'error' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 60, completion_tokens: 30, total_tokens: 90 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

function buildGuardPathFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_guard_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_guard_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'synthetic_correction', data: {
        iter: 1, content: 'Re-attempt: call pb_get_component_tree...',
      },
    },
    { event: 'iter_start', data: { iter: 2 } },
    {
      event: 'assistant_message', data: {
        iter: 2, content: null,
        tool_calls: [{ id: 'call_regen_guard', name: 'regenerate_section_text' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 2, tool_call_id: 'call_regen_guard', name: 'regenerate_section_text', args: {} },
    },
    {
      event: 'mutation_committed',
      data: { iter: 2, tool_call_id: 'call_regen_guard', name: 'regenerate_section_text', group: 'content' },
    },
    {
      event: 'tool_result',
      data: {
        iter: 2, tool_call_id: 'call_regen_guard', name: 'regenerate_section_text', ok: true,
        result: { ok: true, result: { applied: 3, paths: ['subtitle', 'sectionTitle', 'items.0.title'] } },
      },
    },
    {
      event: 'final_message', data: {
        content: 'I rewrote your About section. Updated 3 text props: subtitle, sectionTitle, items[0].title.',
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_guard_1',
        conversation_id: 'conv_guard_1',
        messages: [
          { role: 'user', content: 'needs-guard scenario' },
          { role: 'assistant', content: 'I rewrote your About section. Updated 3 text props: subtitle, sectionTitle, items[0].title.' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'synthetic_correction', content: 'Re-attempt' },
          { iter: 2, type: 'tool', name: 'regenerate_section_text', tool_call_id: 'call_regen_guard', ok: true, status: 'success' },
        ],
        iterations: 3,
        usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

describe('AI Tool Router — mutation flow regression', () => {
  beforeEach(() => {
    loginToEditor();
    cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
    cy.wait(2000);
  });

  it('renders the messages pane and metering after a successful regenerate_section_text mutation', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildHappyPathFrames()) });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');
    cy.get('[data-cy="ai-assistant-composer-input"]').type(
      'Change my about us content. We are a roof repairing company located in Canada / Toronto.'
    );
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.wait('@aiChat');

    cy.get('[data-cy="ai-assistant-messages"]');
    cy.get('[data-cy="ai-assistant-status"]');
    cy.get('[data-cy="ai-assistant-token-count"]');
  });

  it('reports honest failure rather than fabricating success when every mutation fails', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildHonestFailFrames()) });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type(
      'Rewrite the broken-section copy with a fresh tone.'
    );
    cy.get('[data-cy="ai-assistant-send"]').click();
    cy.wait('@aiChat');

    cy.get('[data-cy="ai-assistant-messages"] [data-cy="ai-rewrote-bubble"]').should('not.exist');
    cy.get('[data-cy="ai-assistant-status"]');
  });

  it('renders messages pane, status, and token metering when the server-side synthetic-correction guard recovers a mutation intent', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildGuardPathFrames()) });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type(
      'Update the about section — needs-guard scenario, mutation intent only.'
    );
    cy.get('[data-cy="ai-assistant-send"]').click();
    cy.wait('@aiChat');

    cy.get('[data-cy="ai-assistant-messages"]');
    cy.get('[data-cy="ai-assistant-token-count"]');
    cy.get('[data-cy="ai-assistant-status"]');
  });
});
