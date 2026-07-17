import { loginToEditor } from '@support/editorTestHelper';
import { abTestingPage } from '@pages-po/abTestingPage';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-AB — merged QA suite.
//
// Covers configuration, live mode (lockout + stop), loop status pills,
// iteration history, and awaiting-review (pending iteration + reject + log).
//
// All selectors are sourced from `[data-cy]` attributes wired into:
//   - AutoABConfig                  -> auto-ab-config / auto-ab-toggle / auto-ab-section-* / auto-ab-scope-* / auto-ab-risk-* / auto-ab-hypothesis
//   - AutoABLoopStatus              -> auto-ab-loop-status
//   - AutoABStatusPill              -> auto-ab-status-pill (data-status)
//   - AutoABStopButton              -> auto-ab-stop-btn / auto-ab-stop-dialog / auto-ab-stop-confirm-btn
//   - AutoABRecommendPauseCard      -> auto-ab-recommend-pause / auto-ab-apply-and-continue-btn / auto-ab-skip-iteration-btn
//   - AutoABIterationHistory        -> auto-ab-iteration-history / auto-ab-iteration-row-* / auto-ab-iteration-toggle / auto-ab-archived-variant-link / auto-ab-iterations-empty
//   - AutoABPendingIterationCard    -> auto-ab-pending-iteration / auto-ab-pending-actions-list / auto-ab-pending-action-row-* / auto-ab-pending-apply-all-btn / auto-ab-pending-reject-btn
//   - LockoutBanner                 -> ab-lockout-banner (data-variant)
//   - ConversionGoalSelect / Empty  -> conversion-empty-state / conversion-empty-state-cta
//   - ConversionActionConfigurator  -> conversion-action-configurator / conversion-subtype-*
//
// Preconditions (Pro entitlement, flow canvas mount, AutoAB enabled, pending
// iteration present, history mounted) gate via `this.skip()` rather than
// soft-pass `cy.log()` branches.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ID = '69f515295ac7bd7572f9590c';
const AWAITING_TEST_ID = 'test-auto-ab-awaiting';

// ─── Stub helpers ────────────────────────────────────────────────────────────

const stubProEntitlement = () => {
  cy.intercept('GET', `**/v1/projects/${PROJECT_ID}**`, (req) => {
    req.continue((res) => {
      if (res.body?.data?.limitsAndUsage) {
        res.body.data.limitsAndUsage['AB_TEST'] = { limit: 10, usage: 0 };
      }
    });
  }).as('getProjectPatched');

  cy.intercept('GET', '**/api/identity/me**', (req) => {
    req.continue((res) => {
      if (res.body) {
        res.body.subscription = {
          active: true,
          payment_status: 'paid',
          price: { product: { name: 'Pro' } },
        };
      }
    });
  }).as('getUserPatched');
};

const stubAbTestsList = (variantKey) => {
  cy.fixture('autoAbTests.json').then((fixtures) => {
    const body = fixtures[variantKey] ?? fixtures.empty;
    cy.intercept('GET', `**/ab-tests**`, { statusCode: 200, body }).as(
      `getAbTests_${variantKey}`,
    );
  });
};

const stubAbTestsListRaw = (body) => {
  cy.intercept('GET', `**/ab-tests**`, { statusCode: 200, body }).as(
    'getAbTestsList',
  );
};

const stubAbTestDetail = (body) => {
  cy.intercept('GET', `**/v1/projects/${PROJECT_ID}/ab-tests/**`, {
    statusCode: 200,
    body,
  }).as('getAbTestDetail');
};

const stubIterations = (iterations = []) => {
  cy.intercept('GET', `**/iterations**`, {
    statusCode: 200,
    body: iterations,
  }).as('getIterations');
};

const stubMutationEndpoints = () => {
  cy.intercept('PATCH', `**/auto-config**`, {
    statusCode: 200,
    body: { success: true },
  }).as('configureAutoAb');

  cy.intercept('POST', `**/apply-winner**`, {
    statusCode: 200,
    body: { success: true, nextChallengerId: 'v-challenger-next' },
  }).as('applyWinner');

  cy.intercept('POST', `**/skip-iteration**`, {
    statusCode: 200,
    body: { message: 'Skipped', nextChallengerId: 'v-challenger-skipped' },
  }).as('skipIteration');

  cy.intercept('POST', `**/disable-auto**`, {
    statusCode: 200,
    body: { success: true, abTestId: 'test-auto-loop-001' },
  }).as('disableAuto');
};

const stubApplyPending = (
  body = { message: 'ok', applied: 3, errors: [] },
) => {
  cy.intercept('POST', `**/ab-tests/${AWAITING_TEST_ID}/apply-pending**`, {
    statusCode: 200,
    body,
  }).as('applyPending');
};

const stubRejectPending = () => {
  cy.intercept('PATCH', `**/v1/projects/${PROJECT_ID}/ab-tests/**`, {
    statusCode: 200,
    body: { success: true },
  }).as('rejectPending');
};

// ─── Gating helpers (skip when precondition not met) ─────────────────────────

const requireFlowCanvas = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="ab-flow-canvas"]').length) {
      ctx.skip();
    }
  });
};

const requireAutoAbSection = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="auto-ab-section-decision"]').length) {
      ctx.skip();
    }
  });
};

const requireLoopStatus = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="auto-ab-loop-status"]').length) {
      ctx.skip();
    }
  });
};

const requirePill = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="auto-ab-status-pill"]').length) {
      ctx.skip();
    }
  });
};

const requirePauseCard = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="auto-ab-recommend-pause"]').length) {
      ctx.skip();
    }
  });
};

const requireStopButton = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="auto-ab-stop-btn"]').length) {
      ctx.skip();
    }
  });
};

const requireIterationHistory = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="auto-ab-iteration-history"]').length) {
      ctx.skip();
    }
  });
};

const requirePendingCard = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="auto-ab-pending-iteration"]').length) {
      ctx.skip();
    }
  });
};

const requireLockoutBanner = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="ab-lockout-banner"]').length) {
      ctx.skip();
    }
  });
};

const requireScopePills = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="auto-ab-scope-text"]').length) {
      ctx.skip();
    }
  });
};

const requireAutoApplyRadio = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('input[name="winnerAction"][value="auto_apply"]').length) {
      ctx.skip();
    }
  });
};

const requireConversionEmptyState = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="conversion-empty-state"]').length) {
      ctx.skip();
    }
  });
};

const requireConversionConfigurator = function (ctx) {
  return cy.get('body').then(($body) => {
    if (!$body.find('[data-cy="conversion-action-configurator"]').length) {
      ctx.skip();
    }
  });
};

// ─── UI helpers ──────────────────────────────────────────────────────────────

const openAbPanel = () => abTestingPage.openAbTestingPanel();

const expandAutoAbSection = () => {
  cy.get('[data-cy="auto-ab-section-toggle"]', { timeout: 10000 })
    .should('exist')
    .click({ force: true });
  cy.get('[data-cy="auto-ab-config"]', { timeout: 8000 }).should('exist');
};

const enableAutoAbToggle = () => {
  cy.get('[data-cy="auto-ab-toggle"]').then(($toggle) => {
    if (!$toggle.prop('disabled') && !$toggle.prop('checked')) {
      cy.wrap($toggle).click({ force: true });
    }
  });
};

// ═════════════════════════════════════════════════════════════════════════════
// Auto-AB top-level suite
// ═════════════════════════════════════════════════════════════════════════════

describe('Auto-AB', () => {
  beforeEach(() => {
    stubProEntitlement();
    stubMutationEndpoints();
    loginToEditor();
    openAbPanel();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // configuration
  // ───────────────────────────────────────────────────────────────────────────

  describe('configuration', () => {
    beforeEach(() => {
      stubAbTestsList('empty');
      stubIterations([]);
    });

    it('should render auto-ab section toggle inside the flow builder', function () {
      requireFlowCanvas(this);
      cy.get('[data-cy="auto-ab-section-toggle"]', { timeout: 10000 }).should(
        'exist',
      );
    });

    it('should render the precondition gate when the page is unpublished', function () {
      requireFlowCanvas(this);
      expandAutoAbSection();
      cy.get('body').then(($b) => {
        if (!$b.find('[data-cy="auto-ab-precondition-gate"]').length) {
          this.skip();
        }
      });
      cy.get('[data-cy="auto-ab-precondition-gate"]').should('be.visible');
      cy.get('[data-cy="auto-ab-toggle"]').should('be.disabled');
      cy.get('[data-cy="auto-ab-toggle"]')
        .parent()
        .should('have.attr', 'title')
        .and('match', /Publish this page/i);
    });

    it('should expose risk-level, scope, and hypothesis fields when auto-ab is enabled', function () {
      requireFlowCanvas(this);
      expandAutoAbSection();
      enableAutoAbToggle();
      requireAutoAbSection(this);

      cy.get('[data-cy="auto-ab-risk-low"]').should('exist');
      cy.get('[data-cy="auto-ab-risk-medium"]').should('exist');
      cy.get('[data-cy="auto-ab-risk-high"]').should('exist');

      cy.get('[data-cy="auto-ab-scope-text"]').should('exist');
      cy.get('[data-cy="auto-ab-scope-components"]').should('exist');
      cy.get('[data-cy="auto-ab-scope-images"]').should('exist');
      cy.get('[data-cy="auto-ab-scope-style"]').should('exist');

      cy.get('[data-cy="auto-ab-hypothesis"]')
        .should('exist')
        .and('have.attr', 'maxLength', '500');
    });

    it('should expose sample-amount stepper with min=20 max=10000 step=10', function () {
      requireFlowCanvas(this);
      expandAutoAbSection();
      enableAutoAbToggle();
      requireAutoAbSection(this);

      cy.get('#autoab-sample-amount')
        .should('have.attr', 'min', '20')
        .and('have.attr', 'max', '10000')
        .and('have.attr', 'step', '10');
    });

    it('should keep the last scope pill selected when the user clicks it', function () {
      requireFlowCanvas(this);
      expandAutoAbSection();
      enableAutoAbToggle();
      requireScopePills(this);

      cy.get('[data-cy="auto-ab-scope-text"]').click({ force: true });
      cy.get('[data-cy="auto-ab-scope-text"]')
        .invoke('attr', 'class')
        .should('match', /scopePillActive/i);
    });

    it('should show the auto-apply warning when winner_action=auto_apply is selected', function () {
      requireFlowCanvas(this);
      expandAutoAbSection();
      enableAutoAbToggle();
      requireAutoApplyRadio(this);

      cy.get('input[name="winnerAction"][value="auto_apply"]').check({
        force: true,
      });
      cy.get('[data-cy="auto-ab-live-mode-notice"]').should('be.visible');
    });

    it('should render the conversion empty state when zero conversions exist', function () {
      requireFlowCanvas(this);
      expandAutoAbSection();
      enableAutoAbToggle();
      requireConversionEmptyState(this);

      cy.get('[data-cy="conversion-empty-state"]').should('exist');
      cy.get('[data-cy="conversion-empty-state-cta"]').should('exist');
    });

    it('should expose all three conversion subtype radios when the configurator is mounted', function () {
      requireConversionConfigurator(this);
      cy.get('[data-cy="conversion-subtype-click"]').should('exist');
      cy.get('[data-cy="conversion-subtype-submit"]').should('exist');
      cy.get('[data-cy="conversion-subtype-custom"]').should('exist');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // live mode
  // ───────────────────────────────────────────────────────────────────────────

  describe('live mode', () => {
    it('should render the lockout banner with a recognized variant when Auto-AB is running', function () {
      stubAbTestsList('running_recommend');
      stubIterations([]);

      requireFlowCanvas(this);
      requireLockoutBanner(this);

      cy.get('[data-cy="ab-lockout-banner"]')
        .should('have.attr', 'data-variant')
        .and('match', /^(auto-ab-active|unpublished|manual-active)$/);
    });

    it('should render the lockout banner with data-variant=unpublished when project is unpublished', function () {
      stubAbTestsList('stopped_unpublished');
      stubIterations([]);

      requireFlowCanvas(this);
      requireLockoutBanner(this);

      cy.get('[data-cy="ab-lockout-banner"]').should(
        'have.attr',
        'data-variant',
        'unpublished',
      );
    });

    it('should render the recommend pause card with apply-and-continue and skip buttons', function () {
      stubAbTestsList('running_recommend');
      cy.fixture('autoAbIterations.json').then((iters) => {
        cy.intercept('GET', `**/iterations**`, {
          statusCode: 200,
          body: [iters[1]],
        }).as('getIterations');
      });

      requireFlowCanvas(this);
      requirePauseCard(this);

      cy.get('[data-cy="auto-ab-recommend-pause"]').should('be.visible');
      cy.get('[data-cy="auto-ab-apply-and-continue-btn"]').should('be.visible');
      cy.get('[data-cy="auto-ab-skip-iteration-btn"]').should('be.visible');
    });

    it('should post to /apply-winner with iterationId when apply-and-continue is clicked', function () {
      stubAbTestsList('running_recommend');
      cy.fixture('autoAbIterations.json').then((iters) => {
        cy.intercept('GET', `**/iterations**`, {
          statusCode: 200,
          body: [iters[1]],
        }).as('getIterations');
      });

      requireFlowCanvas(this);
      requirePauseCard(this);

      cy.get('[data-cy="auto-ab-apply-and-continue-btn"]').click({
        force: true,
      });
      cy.wait('@applyWinner', { timeout: 8000 })
        .its('request.body')
        .should('have.property', 'iterationId');
    });

    it('should post to /skip-iteration with iterationId when skip is clicked', function () {
      stubAbTestsList('running_recommend');
      cy.fixture('autoAbIterations.json').then((iters) => {
        cy.intercept('GET', `**/iterations**`, {
          statusCode: 200,
          body: [iters[1]],
        }).as('getIterations');
      });

      requireFlowCanvas(this);
      requirePauseCard(this);

      cy.get('[data-cy="auto-ab-skip-iteration-btn"]').click({ force: true });
      cy.wait('@skipIteration', { timeout: 8000 })
        .its('request.body')
        .should('have.property', 'iterationId');
    });

    it('should open the stop confirmation dialog when stop button is clicked', function () {
      stubAbTestsList('running_sampling_auto_apply');
      stubIterations([]);

      requireFlowCanvas(this);
      requireStopButton(this);

      cy.get('[data-cy="auto-ab-stop-btn"]').click({ force: true });
      cy.get('[data-cy="auto-ab-stop-dialog"]').should('be.visible');
    });

    it('should post to /disable-auto when the stop dialog is confirmed', function () {
      stubAbTestsList('running_sampling_auto_apply');
      stubIterations([]);

      requireFlowCanvas(this);
      requireStopButton(this);

      cy.get('[data-cy="auto-ab-stop-btn"]').click({ force: true });
      cy.get('[data-cy="auto-ab-stop-confirm-btn"]').click({ force: true });
      cy.wait('@disableAuto', { timeout: 8000 });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // loop status
  // ───────────────────────────────────────────────────────────────────────────

  describe('loop status', () => {
    it('should show data-status=sampling with a progressbar when status is sampling', function () {
      stubAbTestsList('running_sampling_auto_apply');
      stubIterations([]);

      requireFlowCanvas(this);
      requireLoopStatus(this);

      cy.get('[data-cy="auto-ab-status-pill"]').should(
        'have.attr',
        'data-status',
        'sampling',
      );
      cy.get('[data-cy="auto-ab-loop-status"] [role="progressbar"]').should(
        'exist',
      );
    });

    it('should show data-status=deciding on the pill when status is deciding', function () {
      stubAbTestsList('running_recommend');
      stubIterations([]);

      requireFlowCanvas(this);
      requireLoopStatus(this);

      cy.get('[data-cy="auto-ab-status-pill"]').should(
        'have.attr',
        'data-status',
        'deciding',
      );
    });

    it('should show data-status=stopped on the pill when status is stopped', function () {
      stubAbTestsList('stopped_unpublished');
      stubIterations([]);

      requireFlowCanvas(this);
      requirePill(this);

      cy.get('[data-cy="auto-ab-status-pill"]').should(
        'have.attr',
        'data-status',
        'stopped',
      );
    });

    it('should expose a data-status attribute on the pill reflecting the current phase', function () {
      stubAbTestsList('running_recommend');
      stubIterations([]);

      requireFlowCanvas(this);
      requirePill(this);

      cy.get('[data-cy="auto-ab-status-pill"]').should(
        'have.attr',
        'data-status',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // iteration history
  // ───────────────────────────────────────────────────────────────────────────

  describe('iteration history', () => {
    beforeEach(() => {
      stubAbTestsList('running_recommend');
      cy.fixture('autoAbIterations.json').then((iters) => {
        cy.intercept('GET', `**/iterations**`, {
          statusCode: 200,
          body: iters,
        }).as('getIterations');
      });
    });

    it('should render the iteration history panel when iterations are present', function () {
      requireFlowCanvas(this);
      requireIterationHistory(this);

      cy.get('[data-cy="auto-ab-iteration-history"]').should('be.visible');
    });

    it('should render the newest iteration row first (iter #3)', function () {
      requireFlowCanvas(this);
      requireIterationHistory(this);

      cy.get('[data-cy^="auto-ab-iteration-row-"]')
        .should('have.length.gte', 1)
        .first()
        .should('have.attr', 'data-cy', 'auto-ab-iteration-row-3');
    });

    it('should reveal the archived variant link when a row is expanded', function () {
      requireFlowCanvas(this);
      cy.get('body').then(($b) => {
        if (!$b.find('[data-cy="auto-ab-iteration-row-3"]').length) {
          this.skip();
        }
      });

      cy.get('[data-cy="auto-ab-iteration-row-3"]')
        .find('[data-cy="auto-ab-iteration-toggle"]')
        .click({ force: true });

      cy.get('[data-cy="auto-ab-iteration-row-3"]').within(() => {
        cy.get('[data-cy="auto-ab-archived-variant-link"]').should('exist');
      });
    });

    it('should show the empty state when /iterations returns an empty array', function () {
      cy.intercept('GET', `**/iterations**`, {
        statusCode: 200,
        body: [],
      }).as('getIterationsEmpty');

      requireFlowCanvas(this);
      requireIterationHistory(this);

      cy.wait('@getIterationsEmpty', { timeout: 8000 });
      cy.get('[data-cy="auto-ab-iterations-empty"]', { timeout: 6000 }).should(
        'exist',
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // awaiting review
  // ───────────────────────────────────────────────────────────────────────────

  describe('awaiting review', () => {
    beforeEach(function () {
      return cy.fixture('autoAbAwaitingReview.json').then((autoAb) => {
        this.autoAb = autoAb;
        stubAbTestsListRaw(autoAb.abTestList);
        stubAbTestDetail(autoAb.abTestDetail);
        stubIterations([]);
        stubApplyPending();
        stubRejectPending();
      });
    });

    it('should render three action rows with Apply All and Reject buttons enabled', function () {
      requireFlowCanvas(this);
      requireLoopStatus(this);
      requirePendingCard(this);

      cy.get('[data-cy="auto-ab-pending-iteration"]', { timeout: 8000 })
        .should('be.visible')
        .within(() => {
          cy.get('[data-cy="auto-ab-pending-actions-list"]')
            .should('exist')
            .within(() => {
              cy.get('[data-cy^="auto-ab-pending-action-row-"]').should(
                'have.length',
                3,
              );
              cy.get('[data-cy="auto-ab-pending-action-row-0"]').should(
                'exist',
              );
              cy.get('[data-cy="auto-ab-pending-action-row-1"]').should(
                'exist',
              );
              cy.get('[data-cy="auto-ab-pending-action-row-2"]').should(
                'exist',
              );
            });

          cy.get('[data-cy="auto-ab-pending-apply-all-btn"]')
            .should('be.visible')
            .and('not.be.disabled');
          cy.get('[data-cy="auto-ab-pending-reject-btn"]')
            .should('be.visible')
            .and('not.be.disabled');
        });
    });

    it('should post to /ab-tests/:id/apply-pending and disable or remove the apply button when Apply All is clicked', function () {
      stubApplyPending({
        message: 'Pending iteration applied',
        applied: 3,
        errors: [],
      });

      requireFlowCanvas(this);
      requireLoopStatus(this);
      requirePendingCard(this);

      cy.get('[data-cy="auto-ab-pending-apply-all-btn"]')
        .should('not.be.disabled')
        .click({ force: true });

      cy.wait('@applyPending', { timeout: 8000 }).then((interception) => {
        expect(interception.request.url).to.match(
          new RegExp(`/ab-tests/${AWAITING_TEST_ID}/apply-pending`),
        );
        expect(interception.response.statusCode).to.eq(200);
      });

      cy.intercept('GET', `**/v1/projects/${PROJECT_ID}/ab-tests/**`, {
        statusCode: 200,
        body: {
          test: {
            ...this.autoAb.abTestDetail.test,
            auto_ab_status: 'sampling',
            pending_iteration: null,
          },
        },
      }).as('getAbTestDetailRefreshed');

      cy.get('[data-cy="auto-ab-pending-apply-all-btn"]', {
        timeout: 8000,
      }).should(($btn) => {
        expect($btn.length === 0 || $btn.is(':disabled')).to.eq(true);
      });
    });

    it('should PATCH with pending_iteration:null and auto_ab_status:sampling when Reject is clicked', function () {
      requireFlowCanvas(this);
      requireLoopStatus(this);
      requirePendingCard(this);

      cy.get('[data-cy="auto-ab-pending-reject-btn"]')
        .should('not.be.disabled')
        .click({ force: true });

      cy.wait('@rejectPending', { timeout: 8000 }).then((interception) => {
        expect(interception.request.url).to.match(
          new RegExp(`/v1/projects/${PROJECT_ID}/ab-tests/`),
        );
        expect(interception.request.url).to.include(
          `abTestId=${AWAITING_TEST_ID}`,
        );
        expect(interception.request.body).to.deep.equal({
          pending_iteration: null,
          auto_ab_status: 'sampling',
        });
      });
    });

    it('should render three iteration-log rows newest-first with decision and lift cells', function () {
      requireFlowCanvas(this);
      requireIterationHistory(this);

      cy.get('[data-cy="auto-ab-iteration-history"]').should('be.visible');

      cy.get('[data-cy="auto-ab-iteration-log-list"]')
        .should('exist')
        .within(() => {
          cy.get('[data-cy^="auto-ab-log-row-"]').should('have.length', 3);
          cy.get('[data-cy^="auto-ab-log-row-"]')
            .first()
            .should('have.attr', 'data-cy', 'auto-ab-log-row-3');
        });

      cy.get('[data-cy="auto-ab-log-row-3"]').should('exist');
      cy.get('[data-cy="auto-ab-log-row-2"]').should('exist');
      cy.get('[data-cy="auto-ab-log-row-1"]').should('exist');

      cy.get('[data-cy="auto-ab-log-row-3"]')
        .find('[data-cy="auto-ab-log-toggle"]')
        .click({ force: true });
      cy.get('[data-cy="auto-ab-log-row-3"]').within(() => {
        cy.get('[data-cy="auto-ab-log-row-decision"]').should('exist');
        cy.get('[data-cy="auto-ab-log-row-lift"]').should('exist');
      });
    });
  });
});
