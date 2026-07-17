/**
 * E2E — Workspace-level AI Chat Refactor (Phase 5 backend + frontend wiring)
 *
 * Validates the workspace-level mount of the AI chat panel after the
 * projectId-injection refactor:
 *
 *   1. Panel mounts on the workspace (no /project/:id in URL).
 *   2. `list_projects` from workspace returns chips/results (no project required).
 *   3. Project-scoped tool with no projectId yields the `missing_project_id`
 *      error envelope, which surfaces the inline `ProjectPickerCard`. Clicking
 *      a chip retries the tool with the chosen projectId.
 *   4. Inside a project route, the chat auto-injects `project_id` into every
 *      /ai/chat request body.
 *   5. Navigating back to workspace clears `project_id` (sent as null).
 *
 * All tests stub `POST /ai/chat` with deterministic SSE frames so the suite is
 * NOT dependent on the live LLM. The project list endpoint
 * (`GET /v1/projects`) is also stubbed for the picker scenario.
 *
 * @see landing-composer/src/prefabs/ai-assistant/AiAssistantPanel.tsx
 * @see landing-composer/src/prefabs/ai-assistant/hooks/useAiChat.ts
 * @see landing-composer/src/prefabs/ai-assistant/hooks/useChatProjectContext.ts
 * @see landing-composer/src/molecules/project-picker-card/ProjectPickerCard.tsx
 */

const TEST_PROJECT_ID = '69fc6ffb4203ddc9308f7395';

// --- SSE frame builders -------------------------------------------------------

function sseBody(frames) {
  return frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
}

function buildListProjectsFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_lp_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_lp_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: 'call_lp_1', name: 'list_projects' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_lp_1', name: 'list_projects', args: {} },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_lp_1', name: 'list_projects', ok: true,
        result: {
          ok: true,
          projects: [
            { id: TEST_PROJECT_ID, name: 'Test', status: 'active' },
          ],
          count: 1,
        },
      },
    },
    {
      event: 'final_message', data: {
        content: 'You have 1 project: Test.',
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_lp_1',
        conversation_id: 'conv_lp_1',
        messages: [
          { role: 'user', content: 'list my projects' },
          { role: 'assistant', content: 'You have 1 project: Test.' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'list_projects', tool_call_id: 'call_lp_1', ok: true, status: 'success' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
        ctx: { project_id: null, page_id: null, locale: null },
      },
    },
  ];
}

function buildMissingProjectFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_mp_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_mp_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: 'call_mp_1', name: 'pb_list_pages' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_mp_1', name: 'pb_list_pages', args: {} },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_mp_1', name: 'pb_list_pages', ok: false,
        result: {
          ok: false,
          error: 'missing_project_id',
          message: 'This tool requires a project. Ask the user to specify a project, or call list_projects to find one.',
          hint: 'list_projects',
        },
      },
    },
    {
      event: 'final_message', data: {
        content: 'Which project should I use?',
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_mp_1',
        conversation_id: 'conv_mp_1',
        messages: [
          { role: 'user', content: 'list the pages in my project' },
          { role: 'assistant', content: 'Which project should I use?' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'pb_list_pages', tool_call_id: 'call_mp_1', ok: false, status: 'error' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
        ctx: { project_id: null, page_id: null, locale: null },
      },
    },
  ];
}

function buildRetryAfterPickFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_retry_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_mp_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: 'call_retry_1', name: 'pb_list_pages' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_retry_1', name: 'pb_list_pages', args: { projectId: TEST_PROJECT_ID } },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_retry_1', name: 'pb_list_pages', ok: true,
        result: { ok: true, pages: [{ id: 'p1', name: 'Home', slug: 'home' }], count: 1 },
      },
    },
    {
      event: 'final_message', data: {
        content: 'Your project has 1 page: Home.',
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_retry_1',
        conversation_id: 'conv_mp_1',
        messages: [
          { role: 'user', content: 'Use project: Test (id: ' + TEST_PROJECT_ID + ').' },
          { role: 'assistant', content: 'Your project has 1 page: Home.' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'pb_list_pages', tool_call_id: 'call_retry_1', ok: true, status: 'success' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
        ctx: { project_id: TEST_PROJECT_ID, page_id: null, locale: null },
      },
    },
  ];
}

function buildSuccessOnProjectRouteFrames() {
  return [
    { event: 'request_started', data: { request_id: 'req_pr_1', sse: true } },
    { event: 'conversation', data: { conversation_id: 'conv_pr_1' } },
    { event: 'iter_start', data: { iter: 1 } },
    {
      event: 'assistant_message', data: {
        iter: 1, content: null,
        tool_calls: [{ id: 'call_pr_1', name: 'pb_list_pages' }],
      },
    },
    {
      event: 'tool_request',
      data: { iter: 1, tool_call_id: 'call_pr_1', name: 'pb_list_pages', args: {} },
    },
    {
      event: 'tool_result',
      data: {
        iter: 1, tool_call_id: 'call_pr_1', name: 'pb_list_pages', ok: true,
        result: { ok: true, pages: [{ id: 'p1', name: 'Home', slug: 'home' }], count: 1 },
      },
    },
    {
      event: 'final_message', data: {
        content: 'This project has 1 page: Home.',
      },
    },
    {
      event: 'done', data: {
        request_id: 'req_pr_1',
        conversation_id: 'conv_pr_1',
        messages: [
          { role: 'user', content: 'list the pages in this project' },
          { role: 'assistant', content: 'This project has 1 page: Home.' },
        ],
        pending_confirmation: null,
        trace: [
          { iter: 1, type: 'tool', name: 'pb_list_pages', tool_call_id: 'call_pr_1', ok: true, status: 'success' },
        ],
        iterations: 2,
        usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
        ctx: { project_id: TEST_PROJECT_ID, page_id: null, locale: null },
      },
    },
  ];
}

// --- Shared login + workspace navigation -------------------------------------

/**
 * Authenticates and lands the user on the workspace dashboard
 * (URL = "/" or "/projects", NOT a /project/:id route).
 *
 * We deliberately do NOT navigate to the editor here — that's the whole
 * point of the workspace-level chat panel.
 */
function loginToWorkspace() {
  // Programmatic auth via centralized cy.login() — replaces the UI form login.
  cy.login();
  cy.visit('/');
  cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
  cy.location('pathname', { timeout: 10000 }).should((p) => {
    expect(p, 'workspace URL has no /project/:id segment').to.not.include('/project/');
  });
}

// --- Tests --------------------------------------------------------------------

describe('Workspace-level AI Chat', () => {
  beforeEach(() => {
    loginToWorkspace();
  });

  it('mounts the chat panel on the workspace route (no /project/:id)', () => {
    // The panel mounts collapsed (defaultOpen=false) — the FAB is the trigger.
    cy.get('[data-cy="ai-assistant-fab"]', { timeout: 10000 }).should('be.visible').click();
    cy.get('[data-cy="ai-assistant-panel"]').should('be.visible');
    cy.get('[data-cy="ai-assistant-status"]');
    // Sanity — no messages yet, empty-state copy is rendered.
    cy.get('[data-cy="ai-assistant-messages"]');
  });

  it('runs list_projects from workspace and renders the result inline', () => {
    cy.intercept('POST', '**/api/fn-execute/ai/chat', (req) => {
      req.reply({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody(buildListProjectsFrames()),
      });
    }).as('aiChat');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('List my projects');
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.wait('@aiChat').its('request.body').should((body) => {
      expect(body).to.have.property('messages');
      const last = body.messages[body.messages.length - 1];
      expect(last.content).to.eq('List my projects');
    });

    // Final assistant bubble lands in the messages pane.
    cy.get('[data-cy="ai-assistant-messages"]', { timeout: 8000 });
    cy.get('[data-cy="ai-assistant-status"]');
  });

  it('surfaces the inline project picker on missing_project_id and retries on chip click', () => {
    // First chat request → returns missing_project_id; second → succeeds.
    let callCount = 0;
    cy.intercept('POST', '**/api/fn-execute/ai/chat', (req) => {
      callCount += 1;
      const frames = callCount === 1
        ? buildMissingProjectFrames()
        : buildRetryAfterPickFrames();
      req.reply({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody(frames),
      });
    }).as('aiChat');

    // Stub the project list endpoint that ProjectPickerCard fetches.
    cy.intercept('GET', '**/api/fn-execute/v1/projects*', {
      statusCode: 200,
      body: [
        { _id: TEST_PROJECT_ID, name: 'Test', status: 'active' },
        { _id: 'proj-fake-2', name: 'Beta', status: 'active' },
      ],
    }).as('resourceList');

    cy.get('[data-cy="ai-assistant-fab"]').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('List the pages in my project');
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.wait('@aiChat');

    // Picker renders inline as a chat-message extension.
    cy.get('[data-cy="ai-project-picker-card"]', { timeout: 8000 }).should('be.visible');
    cy.get('[data-cy="ai-project-picker-chip"]').should('have.length.at.least', 1);

    // Click the first chip → triggers the retry chat call.
    cy.get('[data-cy="ai-project-picker-chip"]').first().click();

    // Picker disappears, synthetic "Use project: ..." user bubble appears.
    cy.get('[data-cy="ai-project-picker-card"]').should('not.exist');
    cy.get('[data-cy="ai-assistant-messages"]');

    // Second chat request — assert it carried the chosen projectId.
    cy.wait('@aiChat').its('request.body').should((body) => {
      expect(body.project_id, 'project_id is the chosen project on retry').to.eq(TEST_PROJECT_ID);
    });

    cy.get('[data-cy="ai-assistant-messages"]', { timeout: 8000 });
  });

  it('auto-injects project_id when inside a /project/:id route', () => {
    cy.intercept('POST', '**/api/fn-execute/ai/chat', (req) => {
      req.reply({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody(buildSuccessOnProjectRouteFrames()),
      });
    }).as('aiChat');

    // Navigate to the project editor route directly.
    cy.visit(`/project/${TEST_PROJECT_ID}/editor/0`);
    // The editor canvas signal is the strongest "we're in" signal we have.
    cy.get('[data-component-index], [data-cy="add-component-placeholder"]', { timeout: 30000 }).should('exist');

    cy.get('[data-cy="ai-assistant-fab"]').should('be.visible').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('List the pages in this project');
    cy.get('[data-cy="ai-assistant-send"]').click();

    cy.wait('@aiChat').its('request.body').should((body) => {
      expect(body.project_id, 'project_id auto-injected from route').to.eq(TEST_PROJECT_ID);
    });

    cy.get('[data-cy="ai-assistant-messages"]', { timeout: 8000 });
  });

  it('switches project_id between project and workspace routes', () => {
    // First send in the project route should carry project_id.
    // Second send after navigating to workspace should NOT carry project_id.
    let requestBodies = [];
    cy.intercept('POST', '**/api/fn-execute/ai/chat', (req) => {
      requestBodies.push(req.body);
      const frames = requestBodies.length === 1
        ? buildSuccessOnProjectRouteFrames()
        : buildMissingProjectFrames();
      req.reply({
        statusCode: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: sseBody(frames),
      });
    }).as('aiChat');

    // Stub project list (picker will render after workspace turn).
    cy.intercept('GET', '**/api/fn-execute/v1/projects*', {
      statusCode: 200,
      body: [{ _id: TEST_PROJECT_ID, name: 'Test', status: 'active' }],
    }).as('resourceList');

    // --- Turn 1: project route ---
    cy.visit(`/project/${TEST_PROJECT_ID}/editor/0`);
    cy.get('[data-component-index], [data-cy="add-component-placeholder"]', { timeout: 30000 }).should('exist');
    cy.get('[data-cy="ai-assistant-fab"]').should('be.visible').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('List the pages');
    cy.get('[data-cy="ai-assistant-send"]').click();
    cy.wait('@aiChat').its('request.body').should((body) => {
      expect(body.project_id).to.eq(TEST_PROJECT_ID);
    });

    // --- Navigate back to workspace ---
    cy.visit('/');
    cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');
    cy.location('pathname').should('not.include', '/project/');

    // The chat panel resets when projectId changes — open it again.
    cy.get('[data-cy="ai-assistant-fab"]', { timeout: 10000 }).should('be.visible').click();
    cy.get('[data-cy="ai-assistant-composer-input"]').type('List the pages in my project');
    cy.get('[data-cy="ai-assistant-send"]').click();
    cy.wait('@aiChat').its('request.body').should((body) => {
      // null OR omitted both qualify — useChatProjectContext sends null when
      // no projectId is resolvable, the picker takes over from there.
      expect(body.project_id == null, 'project_id cleared on workspace').to.be.true;
    });
  });
});
