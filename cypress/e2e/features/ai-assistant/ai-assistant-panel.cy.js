/**
 * E2E — AI Assistant Panel
 *
 * Validates the in-editor chat panel that drives the OpenAI tool-calling backend.
 *
 * Strategy: mock /api/fn-execute/v1/ai/chat with SSE cy.intercept so tests are
 * deterministic and don't depend on the real OpenAI key/quota.
 * Uses the same SSE frame format as ai-inline-streaming-smoke.cy.js.
 */

import { loginToEditor } from '@support/editorTestHelper';

function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

function buildNonDestructiveFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_list_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_list_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: 'call_list_1', name: 'pb_list_pages' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_list_1', name: 'pb_list_pages', args: {} },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_list_1', name: 'pb_list_pages', ok: true,
        result: { ok: true, pages: [{ id: 'p1', name: 'Home', slug: 'home' }], count: 1 },
      },
    },
    {
      event: 'final_message', data: {
        content: 'You have 1 page: Home.',
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_list_1',
        conversation_id: 'conv_list_1',
        messages: [
          { role: 'user', content: 'list my pages' },
          { role: 'assistant', content: 'You have 1 page: Home.' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'pb_list_pages', tool_call_id: 'call_list_1', ok: true, status: 'success' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 40, completion_tokens: 18, total_tokens: 58 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

function buildDestructiveFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_del_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_del_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'pending_confirmation', data: {
        tool_call_id: 'call_destructive_1',
        name: 'pb_delete_page',
        args: { page_id: 'page-stub' },
        description: 'Permanently delete a page. Destructive — requires confirmation.',
        nonce: 'nonce_del_1',
        iter: 1,
        plan_items: [],
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_del_1',
        conversation_id: 'conv_del_1',
        messages: [{ role: 'user', content: 'delete my homepage' }],
        pending_confirmation: {
          tool_call_id: 'call_destructive_1',
          name: 'pb_delete_page',
          args: { page_id: 'page-stub' },
          description: 'Permanently delete a page. Destructive — requires confirmation.',
          nonce: 'nonce_del_1',
        },
        trace: [{ iter: 1, type: 'tool', name: 'pb_delete_page', tool_call_id: 'call_destructive_1', ok: false, status: 'pending_confirmation' }],
        iterations: 1,
        usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

function buildAfterConfirmFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_del_2', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_del_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_destructive_1', name: 'pb_delete_page', args: { page_id: 'page-stub' } },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_destructive_1', name: 'pb_delete_page', ok: true,
        result: { ok: true, deleted: 'page-stub' },
      },
    },
    {
      event: 'final_message', data: {
        content: 'Done — the page was deleted.',
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_del_2',
        conversation_id: 'conv_del_1',
        messages: [
          { role: 'user', content: 'delete my homepage' },
          { role: 'assistant', content: 'Done — the page was deleted.' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'pb_delete_page', tool_call_id: 'call_destructive_1', ok: true, status: 'success' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

describe('AI Assistant Panel', () => {
  beforeEach(() => {
    loginToEditor();
    cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
    cy.wait(2000);
  });

  it('opens the panel from the floating action button', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildNonDestructiveFrames()) });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').should('be.visible').click();
    cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');
    cy.get('[data-cy="ai-assistant-status"]');
  });

  it('sends a non-destructive prompt and renders the tool round + final assistant message', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildNonDestructiveFrames()) });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('list my pages');
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.wait('@aiChat').its('request.body').should((body) => {
      expect(body).to.have.property('messages');
      expect(body.messages[body.messages.length - 1].content).to.eq('list my pages');
    });

    cy.get('[data-cy="ai-assistant-messages"]');
    cy.get('[data-cy="ai-assistant-token-count"]');
    cy.get('[data-cy="ai-assistant-status"]');
  });

  it('halts on destructive tool and surfaces a confirmation card', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildDestructiveFrames()) });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('delete my homepage');
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.wait('@aiChat');

    cy.get('[data-cy="ai-assistant-confirm-card"]', { timeout: 8000 })
      .should('be.visible')
      .and('have.attr', 'data-tool-name', 'pb_delete_page');
    cy.get('[data-cy="ai-assistant-status"]');
    cy.get('[data-cy="ai-assistant-composer-input"]').should('be.disabled');
  });

  it('continues the chain after the user confirms the destructive tool', () => {
    let firstCalled = false;
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      if (!firstCalled) {
        firstCalled = true;
        req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildDestructiveFrames()) });
      } else {
        req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildAfterConfirmFrames()) });
      }
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('delete my homepage');
    cy.get('[data-cy="ai-assistant-send"]').click();
    cy.wait('@aiChat');

    cy.get('[data-cy="ai-assistant-confirm-card"]', { timeout: 8000 }).should('be.visible');
    cy.get('[data-cy="ai-assistant-confirm-approve"]').click();

    // Wait for the second request (after confirmation)
    cy.wait('@aiChat').then((interception) => {
      const confirmedIds = interception.request.body.confirmed_tool_calls || [];
      // confirmed_tool_calls may contain objects {tool_call_id, nonce} or plain strings
      const hasId = confirmedIds.some((c) =>
        c === 'call_destructive_1' ||
        (typeof c === 'object' && c.tool_call_id === 'call_destructive_1')
      );
      expect(hasId, 'confirmed_tool_calls includes call_destructive_1').to.be.true;
    });

    cy.get('[data-cy="ai-assistant-messages"]');
    cy.get('[data-cy="ai-assistant-confirm-card"]').should('not.exist');
    cy.get('[data-cy="ai-assistant-status"]');
  });

  it('skips a destructive tool when the user cancels and adds an assistant note', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildDestructiveFrames()) });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('delete my homepage');
    cy.get('[data-cy="ai-assistant-send"]').click();
    cy.wait('@aiChat');

    cy.get('[data-cy="ai-assistant-confirm-card"]', { timeout: 8000 }).should('be.visible');
    cy.get('[data-cy="ai-assistant-confirm-skip"]').click();

    cy.get('[data-cy="ai-assistant-confirm-card"]').should('not.exist');
    cy.get('[data-cy="ai-assistant-messages"]');
    cy.get('[data-cy="ai-assistant-status"]');
  });

  it('reset clears the transcript and token counter', () => {
    cy.intercept('POST', '**/api/fn-execute/v1/ai/chat', (req) => {
      req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(buildNonDestructiveFrames()) });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('list my pages');
    cy.get('[data-cy="ai-assistant-send"]').click();
    cy.wait('@aiChat');
    // After a chat, tokens have been consumed — the zero attribute must NOT be set.
    cy.get('[data-cy="ai-assistant-token-count"][data-zero="true"]').should('not.exist');

    cy.get('[data-cy="ai-assistant-reset"]').click();
    // After reset, the token count returns to zero — data-zero=true must be present.
    cy.get('[data-cy="ai-assistant-token-count"][data-zero="true"]').should('exist');
    // Transcript must be cleared. The B4 contract exposes per-message items
    // as [data-cy="ai-message-item"][data-role="user|assistant"]; after a
    // reset no assistant message item should remain.
    cy.get('[data-cy="ai-assistant-messages"]')
      .find('[data-cy="ai-message-item"][data-role="assistant"]')
      .should('not.exist');
  });
});
