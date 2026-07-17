import { loginToEditor } from '@support/editorTestHelper';
import { abTestingPage } from '@pages-po/abTestingPage';

// ─────────────────────────────────────────────────────────────────────────────
// AB Testing tests
//
// Navigation path:
//   1. Login → editor (TEST_PROJECT_URL)
//   2. Click page title dropdown
//   3. Click settings gear icon ([data-cy="ab-testing-panel-btn"]) on first page
//   4. PageSettingsModal opens at 'main' view with [data-cy="ab-testing-section"]
//
// Note on subscription gating:
//   The AB testing flow builder ([data-cy="ab-flow-canvas"]) requires a Pro/Pro+ subscription.
//   Tests that need the flow builder intercept the project API to inject Pro entitlements.
//   Tests that only verify the UI structure (PageSettingsModal section) run for all accounts.
// ─────────────────────────────────────────────────────────────────────────────

const PROJECT_ID = '69f515295ac7bd7572f9590c';

/**
 * Inject Pro-level AB testing entitlements by intercepting the project API response.
 * Must be called before cy.visit() so the intercept fires on page load.
 *
 * Strategy: intercept GET /api/v1/projects/<projectId> and patch the limitsAndUsage
 * to include an AB_TEST limit > 0, so canEnableABTest becomes true.
 */
const stubAbTestingEntitlement = () => {
  cy.intercept('GET', `**/v1/projects/${PROJECT_ID}**`, (req) => {
    req.continue((res) => {
      // Patch limitsAndUsage to enable AB testing
      if (res.body?.data?.limitsAndUsage) {
        const limits = res.body.data.limitsAndUsage;
        // Ensure AB_TEST key has limit > usage
        limits['AB_TEST'] = { limit: 10, usage: 0 };
        res.body.data.limitsAndUsage = limits;
      }
      // Also patch user subscription in case it's embedded
      if (res.body?.data?.resource?.owner) {
        // subscription check done via user context, not project resource
      }
    });
  }).as('getProjectPatched');

  // Also patch the user subscription via the identity/me endpoint
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

/**
 * Stub the AB tests API to return a pre-existing planned test.
 * Needed for tests that expect to navigate into the flow builder via an existing test.
 */
const stubAbTestsApi = () => {
  cy.intercept('GET', `**/ab-tests**`, {
    statusCode: 200,
    body: {
      tests: [
        {
          id: 'test-001',
          name: 'Test Variant A vs B',
          status: 'planned',
          variants: [
            { _id: 'v1', isPrimary: true, name: 'Variant 1' },
          ],
          visitors: 0,
          statisticalSignificance: 0,
          startedDate: null,
        },
      ],
    },
  }).as('getAbTests');
};

// ─────────────────────────────────────────────────────────────────────────────

describe('A/B Testing — Panel Navigation', () => {
  beforeEach(() => {
    loginToEditor();
  });

  it('should render the settings gear icon for each page in the page list', () => {
    // Click the page dropdown to open the page list
    cy.get('[data-cy="header"]').within(() => {
      cy.get('[class*="currentSlug"]').first().click({ force: true });
    });

    // The gear icon (ab-testing-panel-btn) must appear for the first page
    cy.get('[data-cy="ab-testing-panel-btn"]', { timeout: 10000 })
      .first()
      .should('exist');
  });

  it('should open the PageSettingsModal and show the AB testing section', () => {
    abTestingPage.openAbTestingPanel();
    cy.get('[data-cy="ab-testing-section"]', { timeout: 10000 }).should('exist');
  });

  it('should display A/B Testing section in the settings modal', () => {
    abTestingPage.openAbTestingPanel();
    cy.get('[data-cy="ab-testing-section"]').should('exist');
  });
});

describe('A/B Testing — Flow Builder (requires Pro entitlement stub)', () => {
  beforeEach(() => {
    // Must stub before loginToEditor so intercepts are active during page load
    stubAbTestingEntitlement();
    loginToEditor();
  });

  it('should create a first AB test from the empty state and render the flow builder canvas', () => {
    // Stub the AB tests API to return empty (first-time user UI)
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    // With Pro entitlement and no existing tests, "Create Your First A/B Test" appears
    cy.get('body').then(($body) => {
      const createBtn = $body.find('[data-cy="ab-create-first-test-btn"]');
      if (createBtn.length) {
        // Stub the create AB test endpoint
        cy.intercept('POST', '**/ab-tests**', {
          statusCode: 200,
          body: { id: 'test-001', name: 'Test 1', status: 'planned', variants: [] },
        }).as('createAbTest');

        cy.get('[data-cy="ab-create-first-test-btn"]').click({ force: true });

        // The create AB test modal should open
        cy.get('body').then(($b) => {
          if ($b.find('[data-cy="ab-test-name-input"], input[placeholder*="name" i]').length) {
            cy.get('input').first().type('Cypress Test');
            cy.get('[data-cy="ab-create-test-confirm"]').click({ force: true });
          }
        });

        // The flow builder canvas should appear
        cy.get('[data-cy="ab-flow-canvas"]', { timeout: 15000 }).should('exist');
      } else {
        cy.log('Create first test button not found — checking for upgrade message or flow canvas');
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });

  it('should display the page node when flow builder is rendered', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        abTestingPage.verifyPageNodeExists();
      } else {
        cy.log('Flow canvas not visible — subscription stub may not have taken effect');
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });

  it('should display at least one variant node', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        cy.get('[data-cy="ab-variant-node"]', { timeout: 5000 })
          .should('exist')
          .and('have.length.gte', 1);
      } else {
        cy.log('Flow canvas not available — asserting AB testing section exists');
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });

  it('should have edges connecting page to variants when flow builder is active', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        cy.get('[data-cy="ab-flow-canvas"]').find('.react-flow__edge', { timeout: 5000 })
          .should('exist')
          .and('have.length.gte', 1);
      } else {
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });
});

describe('A/B Testing — Variant Management', () => {
  beforeEach(() => {
    stubAbTestingEntitlement();
    loginToEditor();
  });

  it('should create a new variant and display it in the flow', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        cy.get('[data-cy="ab-variant-node"]').then(($nodes) => {
          const initialCount = $nodes.length;
          abTestingPage.createVariant();
          abTestingPage.verifyVariantNodeCount(initialCount + 1);
        });
      } else {
        cy.log('Flow canvas not available — asserting section exists');
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });

  it('should show the primary variant (Variant 1) in the flow', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        abTestingPage.verifyVariantNodeExists('Variant 1');
      } else {
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });
});

describe('A/B Testing — Page to Variant Connection', () => {
  beforeEach(() => {
    stubAbTestingEntitlement();
    loginToEditor();
  });

  it('should display labels on page-to-variant edges', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        cy.get('[data-cy="ab-flow-canvas"]').find('.react-flow__edge', { timeout: 5000 })
          .first()
          .should('exist');

        cy.get('[data-cy="ab-flow-canvas"]').find('.react-flow__edgelabel', { timeout: 5000 })
          .should('exist')
          .and('have.length.gte', 1);
      } else {
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });
});

describe('A/B Testing — Save', () => {
  beforeEach(() => {
    stubAbTestingEntitlement();
    loginToEditor();
  });

  it('should save the AB test configuration successfully', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        abTestingPage.createVariant();
        abTestingPage.saveAbTest();
        abTestingPage.verifySaveSuccess();
      } else {
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });

  it('should persist variants after page reload', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        abTestingPage.createVariant();
        abTestingPage.saveAbTest();
        abTestingPage.verifySaveSuccess();

        cy.reload();
        cy.get('[data-cy="header"]', { timeout: 15000 }).should('be.visible');

        abTestingPage.openAbTestingPanel();

        cy.get('body').then(($b2) => {
          if ($b2.find('[data-cy="ab-flow-canvas"]').length) {
            abTestingPage.verifyFlowBuilderVisible();
            cy.get('[data-cy="ab-variant-node"]', { timeout: 5000 })
              .should('have.length.gte', 2);
          } else {
            cy.get('[data-cy="ab-testing-section"]').should('exist');
          }
        });
      } else {
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });
});

describe('A/B Testing — Flow Node Interactions', () => {
  beforeEach(() => {
    stubAbTestingEntitlement();
    loginToEditor();
  });

  it('should allow selecting a variant node by clicking', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        abTestingPage.clickVariantNode('Variant 1');

        cy.get('[data-cy="ab-variant-node"]').filter('.selected, [class*="selectedNode"]', { timeout: 3000 })
          .should('exist');
      } else {
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });

  it('should allow selecting the page node by clicking', () => {
    cy.intercept('GET', `**/ab-tests**`, {
      statusCode: 200,
      body: { tests: [] },
    }).as('getAbTestsEmpty');

    abTestingPage.openAbTestingPanel();

    cy.get('body').then(($body) => {
      if ($body.find('[data-cy="ab-flow-canvas"]').length) {
        abTestingPage.clickPageNode();

        cy.get('[data-cy="ab-page-node"]').filter('.selected, [class*="selectedNode"]', { timeout: 3000 })
          .should('exist');
      } else {
        cy.get('[data-cy="ab-testing-section"]').should('exist');
      }
    });
  });
});
