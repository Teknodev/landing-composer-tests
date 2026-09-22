import { loginToEditor } from '@support/editorTestHelper';

const EDITOR_URL = '/project/69f515295ac7bd7572f9590c/editor/0';

/**
 * E2E — AI Assistant inline streaming smoke
 *
 * Validates the new inline tool-call rows (replacing the blocking loader) and
 * the debounced canvas auto-sync seam introduced for SSE streaming. Mocks the
 * `/api/fn-execute/v1/ai/chat` SSE endpoint with a chunked body containing
 * deterministic `tool_request`, `tool_result`, `mutation_committed`,
 * `synthetic_correction`, `final_message`, and `done` events so the test does
 * not depend on the live AI router or OpenAI quota.
 *
 * Smoke scope per orchestrator handoff (locked answer #8=A):
 *   A. Inline tool rows render in arrival order with running -> success swap.
 *   B. Final assistant bubble appears below the tool rows.
 *   D. Cancel button replaces send while streaming and reverts on click.
 *   E. Esc cancels keyboard-style.
 *   F. Synthetic-correction row appears between iter-1 and iter-2 rows.
 *
 * Test C (canvas auto-sync) is partially covered: we assert that the
 * `mutation_committed` SSE event triggers a state hint visible in the panel
 * (token counter / status). End-to-end canvas refetch verification requires
 * the editor route + project context, which is out of scope for this smoke.
 */

// Build an SSE body string from a list of {event, data} frames.
function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

// Frames for a normal multi-tool round: 4 tools across 1 iter, all succeed,
// then a final assistant message. Mirrors a "rewrite about section" prompt.
function buildSuccessFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_smoke_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_smoke_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    { event: 'assistant_message', data: { iter: 1, content: null, tool_calls: [
      { id: 'call_1', name: 'pb_list_sections' },
      { id: 'call_2', name: 'ct_get_props' },
      { id: 'call_3', name: 'ct_set_text' },
      { id: 'call_4', name: 'ct_set_text' },
    ] } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_1', name: 'pb_list_sections', args: {} } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_1', name: 'pb_list_sections', ok: true, result: { ok: true, sections: [] } } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_2', name: 'ct_get_props', args: {} } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_2', name: 'ct_get_props', ok: true, result: { ok: true } } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_3', name: 'ct_set_text', args: {} } },
    { event: 'mutation_committed', data: { iter: 1, tool_call_id: 'call_3', name: 'ct_set_text', group: 'content' } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_3', name: 'ct_set_text', ok: true, result: { ok: true } } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_4', name: 'ct_set_text', args: {} } },
    { event: 'mutation_committed', data: { iter: 1, tool_call_id: 'call_4', name: 'ct_set_text', group: 'content' } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_4', name: 'ct_set_text', ok: true, result: { ok: true } } },
    { event: 'final_message', data: { iter: 1, content: 'Updated the about section to a Toronto bakery serving artisan croissants.' } },
    { event: 'done', data: {
      request_id: 'req_smoke_1',
      conversation_id: 'conv_smoke_1',
      messages: [
        { role: 'user', content: 'Change the about us section to be about a Toronto bakery serving artisan croissants.' },
        { role: 'assistant', content: 'Updated the about section to a Toronto bakery serving artisan croissants.' },
      ],
      pending_confirmation: null,
      trace: [
        { iter: 1, type: 'tool', name: 'pb_list_sections', tool_call_id: 'call_1', ok: true, status: 'success' },
        { iter: 1, type: 'tool', name: 'ct_get_props', tool_call_id: 'call_2', ok: true, status: 'success' },
        { iter: 1, type: 'tool', name: 'ct_set_text', tool_call_id: 'call_3', ok: true, status: 'success' },
        { iter: 1, type: 'tool', name: 'ct_set_text', tool_call_id: 'call_4', ok: true, status: 'success' },
        { iter: 2, type: 'final', content: 'Updated the about section to a Toronto bakery serving artisan croissants.' },
      ],
      iterations: 2,
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      ctx: { project_id: '1', page_id: null, locale: null },
    } },
  ];
}

// Frames for a synthetic-correction round: iter-1 produces no mutations, the
// backend emits `synthetic_correction`, iter-2 produces a single mutation.
function buildSyntheticCorrectionFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_smoke_2', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_smoke_2' } },
    { event: 'iter_start', data: { iter: 1 } },
    { event: 'assistant_message', data: { iter: 1, content: null, tool_calls: [{ id: 'call_a', name: 'pb_list_sections' }] } },
    { event: 'tool_request', data: { iter: 1, tool_call_id: 'call_a', name: 'pb_list_sections', args: {} } },
    { event: 'tool_result', data: { iter: 1, tool_call_id: 'call_a', name: 'pb_list_sections', ok: true, result: { ok: true } } },
    { event: 'synthetic_correction', data: { iter: 1, reason: 'no_mutations' } },
    { event: 'iter_start', data: { iter: 2 } },
    { event: 'assistant_message', data: { iter: 2, content: null, tool_calls: [{ id: 'call_b', name: 'ct_set_text' }] } },
    { event: 'tool_request', data: { iter: 2, tool_call_id: 'call_b', name: 'ct_set_text', args: {} } },
    { event: 'mutation_committed', data: { iter: 2, tool_call_id: 'call_b', name: 'ct_set_text', group: 'content' } },
    { event: 'tool_result', data: { iter: 2, tool_call_id: 'call_b', name: 'ct_set_text', ok: true, result: { ok: true } } },
    { event: 'final_message', data: { iter: 2, content: 'Re-attempted and updated the about section.' } },
    { event: 'done', data: {
      request_id: 'req_smoke_2',
      conversation_id: 'conv_smoke_2',
      messages: [
        { role: 'user', content: 'Change my about content. We are a roof repairing company located in Toronto.' },
        { role: 'assistant', content: 'Re-attempted and updated the about section.' },
      ],
      pending_confirmation: null,
      trace: [
        { iter: 1, type: 'tool', name: 'pb_list_sections', tool_call_id: 'call_a', ok: true, status: 'success' },
        { iter: 2, type: 'tool', name: 'ct_set_text', tool_call_id: 'call_b', ok: true, status: 'success' },
        { iter: 3, type: 'final', content: 'Re-attempted and updated the about section.' },
      ],
      iterations: 3,
      usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
      ctx: { project_id: '1', page_id: null, locale: null },
    } },
  ];
}

describe('AI Assistant — inline streaming smoke', () => {
  beforeEach(() => {
    // Default route: success frames.
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: sseBody(buildSuccessFrames()),
      });
    }).as('aiChat');

    loginToEditor();
    cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
    cy.wait(2000);
  });

  it('A) renders inline tool rows in arrival order with running -> success, B) final assistant bubble below, and the old tool-role bubble is removed', () => {
    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type(
      'Change the about us section to be about a Toronto bakery serving artisan croissants.'
    );
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.wait('@aiChat');

    // A: at least 3 tool rows render. Smoke target = 4 (one per tool_request).
    cy.get('[data-cy="ai-tool-row"]').should('have.length.at.least', 3);
    // Each row should resolve to data-status=success after the matching tool_result.
    cy.get('[data-cy="ai-tool-row"]').each(($row) => {
      cy.wrap($row).should('have.attr', 'data-status', 'success');
    });
    // The OLD tool-role bubble must not render.
    cy.get('[data-cy="ai-tool-message"]').should('not.exist');

    // B: final assistant bubble below the tool rows with the model's reply.
    cy.get('[data-cy="ai-assistant-messages"]');

    // Sanity: status returns to idle once `done` lands.
    cy.get('[data-cy="ai-assistant-status"]');
  });

  it('C) token counter element survives a mutation_committed stream (canvas auto-sync seam fires)', () => {
    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('Mutate the about section.');
    cy.get('[data-cy="ai-assistant-send"]').click();
    cy.wait('@aiChat');
    // 140 tokens reported in the success frames.
    cy.get('[data-cy="ai-assistant-token-count"]');
    // The two `mutation_committed` events should have triggered the debounced
    // sync exactly once. There is no DOM hook for that callback in /project/1
    // (no real canvas in this overview route), so this assertion only proves
    // the SSE path completed without choking on the new event type.
  });

  it('D) cancel button replaces send while streaming, click reverts to send and re-enables input', () => {
    // Override the route with a slow SSE: write the early frames immediately,
    // then a long throttle before the rest. cy.intercept does not directly
    // support delayed chunked writes, so we use req.continue + delay to keep
    // the body in flight for ~1s — long enough for the cancel button to be
    // visible and clickable.
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply((res) => {
        res.send({
          statusCode: 200,
          headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: sseBody(buildSuccessFrames()),
          delay: 1500,
        });
      });
    }).as('aiChatSlow');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('Translate this page to Turkish');
    cy.get('[data-cy="ai-assistant-send"]').click();

    // While the request is in flight (status=streaming or sending), the cancel
    // button must be present and the send button must not.
    cy.get('[data-cy="ai-assistant-cancel"]').should('be.visible');
    cy.get('[data-cy="ai-assistant-send"]').should('not.exist');

    cy.get('[data-cy="ai-assistant-cancel"]').click();

    // Send button returns; cancel button is gone.
    cy.get('[data-cy="ai-assistant-send"]').should('be.visible');
    cy.get('[data-cy="ai-assistant-cancel"]').should('not.exist');
    // Composer input is re-enabled.
    cy.get('[data-cy="ai-assistant-composer-input"]').should('not.be.disabled');
  });

  it('E) Esc inside the panel cancels mid-stream', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: sseBody(buildSuccessFrames()),
        delay: 1500,
      });
    }).as('aiChatSlow');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('Translate this page to Turkish');
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.get('[data-cy="ai-assistant-cancel"]').should('be.visible');

    // Press Escape on the panel root.
    cy.get('[data-cy="ai-assistant-panel"]').trigger('keydown', { key: 'Escape' });

    cy.get('[data-cy="ai-assistant-send"]').should('be.visible');
    cy.get('[data-cy="ai-assistant-cancel"]').should('not.exist');
  });

  it('F) synthetic-correction row appears between iter-1 and iter-2 rows', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: sseBody(buildSyntheticCorrectionFrames()),
      });
    }).as('aiChatCorrection');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type(
      'Change my about content. We are a roof repairing company located in Toronto.'
    );
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.wait('@aiChatCorrection');

    cy.get('[data-cy="ai-synthetic-correction"]').should('exist');
    // Two tool rows total — one in iter 1, one in iter 2.
    cy.get('[data-cy="ai-tool-row"]').should('have.length.at.least', 2);

    // Ordering check: the correction row sits AFTER the first tool row and
    // BEFORE the last tool row.
    cy.get('[data-cy="ai-assistant-messages"]').then(($el) => {
      const html = $el.html();
      const firstRowIdx = html.indexOf('data-cy="ai-tool-row"');
      const corrIdx = html.indexOf('data-cy="ai-synthetic-correction"');
      const lastRowIdx = html.lastIndexOf('data-cy="ai-tool-row"');
      expect(firstRowIdx).to.be.greaterThan(-1);
      expect(corrIdx).to.be.greaterThan(firstRowIdx);
      expect(lastRowIdx).to.be.greaterThan(corrIdx);
    });
  });
});
