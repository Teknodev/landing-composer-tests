import { loginToEditor, addComponent } from '@support/editorTestHelper';

const FORBIDDEN_ON_STYLE_ONLY = ['pb_add_component', 'pb_delete_component', 'regenerate_section_text'];
const ALLOWED_STYLE_MUTATORS = ['dt_set_property', 'dt_set_theme_color'];

function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

function parseDoneFrame(sseText) {
  const match = sseText.match(/event: done\ndata: ([\s\S]*?)\n\n/);
  if (!match) return null;
  return JSON.parse(match[1]);
}

function buildStyleOnlySuccessFrames({ reqId, convId, toolName, toolCallId }) {
  return [
    { event: 'request_started', data: { request_id: reqId, sse: true } },
    { event: 'conversation', data: { conversation_id: convId } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: toolCallId, name: toolName }],
      },
    },
    {
      event: 'tool_request',
      data: {
        iter: 1, tool_call_id: toolCallId, name: toolName,
        args: { section_name: 'about-1', property: 'background-color', value: 'blue' },
      },
    },
    {
      event: 'mutation_committed',
      data: { iter: 1, tool_call_id: toolCallId, name: toolName, group: 'style' },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: toolCallId, name: toolName, ok: true,
        result: {
          ok: true,
          result: {
            applied: true, index: 0, section_name: 'about-1', element_id: null,
            property: 'background-color', value: 'blue', breakpoint: 'desktop',
            pseudo_state: null, selector: '.ai-mgr-about-1-bg',
          },
        },
      },
    },
    {
      event: 'final_message', data: {
        content: 'Done — I changed the background color of the About 1 section to blue.',
      },
    },
    {
      event: 'done', data: {
        request_id: reqId,
        conversation_id: convId,
        messages: [
          { role: 'user', content: 'Change the background color of the About 1 section to blue.' },
          { role: 'assistant', content: 'Done — I changed the background color of the About 1 section to blue.' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: toolName, tool_call_id: toolCallId, ok: true, status: 'success' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

function buildStyleOnlyFalseSuccessFrames({ reqId, convId, toolCallId }) {
  return [
    { event: 'request_started', data: { request_id: reqId, sse: true } },
    { event: 'conversation', data: { conversation_id: convId } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: toolCallId, name: 'dt_set_property' }],
      },
    },
    {
      event: 'tool_request',
      data: {
        iter: 1, tool_call_id: toolCallId, name: 'dt_set_property',
        args: { section_name: 'about-1', property: 'background-color', value: 'blue' },
      },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: toolCallId, name: 'dt_set_property', ok: false,
        error: 'css_persist_failed',
        result: { ok: false, error: 'css_persist_failed' },
      },
    },
    {
      event: 'final_message', data: {
        content: "I tried to change the background color of the About 1 section, but the update did not apply. Want me to try again?",
      },
    },
    {
      event: 'done', data: {
        request_id: reqId,
        conversation_id: convId,
        messages: [
          { role: 'user', content: 'Change the background color of the About 1 section to blue.' },
          { role: 'assistant', content: "I tried to change the background color of the About 1 section, but the update did not apply. Want me to try again?" },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'dt_set_property', tool_call_id: toolCallId, ok: false, status: 'error' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 90, completion_tokens: 30, total_tokens: 120 },
        ctx: { project_id: '1', page_id: null, locale: null },
      },
    },
  ];
}

describe('AI Assistant — style-only invariant', () => {
  beforeEach(() => {
    loginToEditor();
    cy.get('body').then(($body) => {
      const hasDesc = $body.find('[class*="auto-generate-"][class*="-description"]').length > 0;
      if (!hasDesc) addComponent('intro', 0);
    });
    cy.get('[class*="auto-generate-"][class*="-description"]', { timeout: 15000 }).should('exist');
    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');
  });

  describe('Scenario 1 — style prompt, first attempt', () => {
    it('N1: the trace carries a style mutator and no forbidden add/delete/rewrite tool name', () => {
      const frames = buildStyleOnlySuccessFrames({
        reqId: 'req_style_1', convId: 'conv_style_1',
        toolName: 'dt_set_property', toolCallId: 'call_style_1',
      });
      cy.intercept('POST', '**/api/fn-execute/ai/chat', (req) => {
        req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(frames) });
      }).as('aiChat');

      cy.get('[data-component-index]').its('length').then((before) => {
        cy.get('[data-cy="ai-assistant-composer-input"]').type(
          'Change the background color of the About 1 section to blue.'
        );
        cy.get('[data-cy="ai-assistant-send"]').click();

        cy.wait('@aiChat').then((interception) => {
          const done = parseDoneFrame(interception.response.body);
          expect(done, 'done frame parsed').to.not.be.null;
          const names = done.trace.filter((t) => t.type === 'tool').map((t) => t.name);
          FORBIDDEN_ON_STYLE_ONLY.forEach((forbidden) => {
            expect(names, `trace tool names for attempt 1`).to.not.include(forbidden);
          });
          expect(names.some((n) => ALLOWED_STYLE_MUTATORS.includes(n)), 'a style mutator tool ran').to.be.true;
        });

        cy.get('[data-component-index]').should('have.length', before);
      });
    });
  });

  describe('Scenario 1 — style prompt, repeat attempt', () => {
    it('N2: repeating the same style prompt still carries no forbidden tool name', () => {
      const frames = buildStyleOnlySuccessFrames({
        reqId: 'req_style_2', convId: 'conv_style_2',
        toolName: 'dt_set_property', toolCallId: 'call_style_2',
      });
      cy.intercept('POST', '**/api/fn-execute/ai/chat', (req) => {
        req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(frames) });
      }).as('aiChatRepeat');

      cy.get('[data-component-index]').its('length').then((before) => {
        cy.get('[data-cy="ai-assistant-composer-input"]').type(
          'Change the background color of the About 1 section to blue.'
        );
        cy.get('[data-cy="ai-assistant-send"]').click();

        cy.wait('@aiChatRepeat').then((interception) => {
          const done = parseDoneFrame(interception.response.body);
          const names = done.trace.filter((t) => t.type === 'tool').map((t) => t.name);
          FORBIDDEN_ON_STYLE_ONLY.forEach((forbidden) => {
            expect(names, 'trace tool names for repeat attempt').to.not.include(forbidden);
          });
          expect(names.some((n) => ALLOWED_STYLE_MUTATORS.includes(n)), 'a style mutator tool ran again').to.be.true;
        });

        cy.get('[data-component-index]').should('have.length', before);
      });
    });
  });

  describe('Scenario 2 — false success is never rendered', () => {
    it('N3: a failed mutation result never renders the success-shaped bubble', () => {
      const frames = buildStyleOnlyFalseSuccessFrames({
        reqId: 'req_style_fail', convId: 'conv_style_fail', toolCallId: 'call_style_fail',
      });
      cy.intercept('POST', '**/api/fn-execute/ai/chat', (req) => {
        req.reply({ statusCode: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody(frames) });
      }).as('aiChatFail');
      cy.intercept('GET', '**/api/fn-execute/v1/projects/*').as('projectRefetch');

      cy.get('[data-cy="ai-assistant-composer-input"]').type(
        'Change the background color of the About 1 section to blue.'
      );
      cy.get('[data-cy="ai-assistant-send"]').click();
      cy.wait('@aiChatFail').then((interception) => {
        const done = parseDoneFrame(interception.response.body);
        const names = done.trace.filter((t) => t.type === 'tool').map((t) => t.name);
        expect(names, 'no mutation_committed-carrying tool was consumed as applied').to.not.include('mutation_committed');
      });

      cy.get('[data-cy="ai-assistant-messages"] [data-cy="ai-rewrote-bubble"]').should('not.exist');
      cy.get('[data-cy="ai-undo-toast"]').should('not.exist');
      cy.get('[data-cy="ai-assistant-status"]');

      cy.wait(400);
      cy.get('@projectRefetch.all').should('have.length', 0);
    });
  });
});
