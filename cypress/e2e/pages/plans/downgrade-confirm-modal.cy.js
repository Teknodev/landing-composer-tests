// ===========================================================================
// COMP-2405 — Subscription limit enforcement + graceful downgrade (FE behavior)
// ===========================================================================
//
// Scope: behavioral proof of the DowngradeConfirmModal flow on the /plans page.
//
// Data-agnostic design (HARD rule): this spec hardcodes NO project/identity/
// bucket/record ids. It logs in via cy.login() (canonical creds) and STUBS the
// data feeds the plans page bootstraps from so the rendered state is fully
// deterministic regardless of what the seeded account actually owns:
//   - POST **/auth/verify-token  -> real response mutated in-flight to mark the
//                                   user as a paying subscriber on a HIGH-priced
//                                   plan + email_verified, preserving the real
//                                   user._id so the SPA's RoleBasedGuard passes.
//   - GET  **/price              -> two synthetic plans (one == current price,
//                                   one CHEAPER -> renders a "Downgrade" CTA).
//   - GET  **/payment-method     -> one payment method so the add-payment gate
//                                   is satisfied.
//   - POST **/subscription/downgrade-impact -> the §5 mock variants.
//
// The modal is the real organism under test (organisms/downgrade-confirm-modal).
// We never hit a live Stripe/backend — every mutating route is stubbed.
//
// Flow to reach the modal (verified against pages/plans/plans.tsx +
// organisms/plans-section/plans-section.tsx):
//   click cheaper plan's [data-cy="plan-cta"] (text "Downgrade")
//     -> PlansSection local "Downgrade Subscription" AlertModal
//     -> click "Confirm Downgrade"
//     -> onSelect(product,{immediate:true}) -> plans.tsx handleSelectClick
//     -> getPlanActionText === "Downgrade" -> opens <DowngradeConfirmModal/>
// ===========================================================================

const API = "**/api/fn-execute";

// ---- Synthetic plan catalog (data-agnostic — no real ids) ------------------
const CURRENT_PRICE = 4900; // current subscription price (high)
const LOWER_PRICE = 1900; // downgrade target price (cheaper)

const CURRENT_PRICE_ID = "price_current_stub";
const LOWER_PRICE_ID = "price_lower_stub";

const stubPrices = [
  {
    _id: CURRENT_PRICE_ID,
    id: CURRENT_PRICE_ID,
    price: CURRENT_PRICE,
    interval: "year",
    currency: "usd",
    product: {
      _id: "prod_current_stub",
      name: "Business",
      tag: "subs",
      features: ["Everything in Pro"],
      plan_details: JSON.stringify({
        website_count: "10",
        team_member_count: "10",
        storage: "50 GB",
        order: 3,
        is_highlighted: false,
      }),
    },
  },
  {
    _id: LOWER_PRICE_ID,
    id: LOWER_PRICE_ID,
    price: LOWER_PRICE,
    interval: "year",
    currency: "usd",
    product: {
      _id: "prod_lower_stub",
      name: "Starter",
      tag: "subs",
      features: ["Core features"],
      plan_details: JSON.stringify({
        website_count: "1",
        team_member_count: "1",
        storage: "1 GB",
        order: 1,
        is_highlighted: false,
      }),
    },
  },
];

const impactWithOverage = {
  effective_at: "2026-07-01T00:00:00.000Z",
  has_overage: true,
  total_deactivations: 4,
  will_exceed: [
    { key: "storage_size", label: "Storage size", current: 5368709120, new_limit: 1073741824, will_deactivate: 4294967296, unit: "GB", action_verb: "removed" },
    { key: "max_published_projects", label: "Published projects", current: 3, new_limit: 1, will_deactivate: 2, action_verb: "deactivated" },
    { key: "team_member", label: "Team members", current: 4, new_limit: 1, will_deactivate: 2, action_verb: "removed" },
  ],
};

const impactNoOverage = {
  effective_at: "2026-07-01T00:00:00.000Z",
  has_overage: false,
  total_deactivations: 0,
  will_exceed: [],
};

/**
 * Mutate the real verify-token response so the logged-in user looks like a
 * paying subscriber on the HIGH-priced plan with a verified email. Preserves
 * the real user._id / role_assignment so guards still pass.
 */
function stubBootstrap() {
  cy.intercept("POST", `${API}/auth/verify-token`, (req) => {
    req.continue((res) => {
      const body = res.body || {};
      const user = body.user || body;
      if (user && typeof user === "object") {
        user.email_verified = true;
        user.subscription = {
          id: "sub_stub",
          status: "active",
          active: true,
          price: { id: CURRENT_PRICE_ID, price: CURRENT_PRICE, product: stubPrices[0].product },
        };
      }
      res.send(body);
    });
  }).as("verifyToken");

  cy.intercept("GET", `${API}/price*`, { statusCode: 200, body: stubPrices }).as("getPrices");

  cy.intercept("GET", `${API}/payment-method*`, {
    statusCode: 200,
    body: [{ _id: "pm_stub", id: "pm_stub", card: { brand: "visa", last4: "4242" }, is_default: true }],
  }).as("getPaymentMethods");
}

/** Drives the UI from the plans grid into the DowngradeConfirmModal. */
function openDowngradeModal() {
  // 1. Click the cheaper plan's CTA (renders as "Downgrade").
  cy.contains('[data-cy="plan-cta"]', "Downgrade", { timeout: 20000 })
    .should("be.visible")
    .click();

  // 2. PlansSection's intermediate "Downgrade Subscription" AlertModal -> confirm.
  cy.contains("button", "Confirm Downgrade", { timeout: 10000 }).should("be.visible").click();

  // 3. DowngradeConfirmModal (the organism under test) is now mounted.
  cy.getCy("downgrade-confirm-modal", { timeout: 10000 }).should("exist");
}

describe("COMP-2405 — DowngradeConfirmModal (plans page)", () => {
  beforeEach(() => {
    cy.login();
    stubBootstrap();
  });

  it("downgrade-with-overage-warning: shows skeleton then impact list (one row per will_exceed item), confirm proceeds", () => {
    // Delay the preview so the loading/skeleton state is observable.
    cy.intercept("POST", `${API}/subscription/downgrade-impact`, (req) => {
      req.reply({ statusCode: 200, body: impactWithOverage, delay: 600 });
    }).as("previewImpact");

    // Stub the confirm path so "Downgrade anyway" doesn't hit live Stripe.
    cy.intercept("POST", `${API}/subscription`, {
      statusCode: 200,
      body: { message: "Scheduled", schedule: { id: "sched_stub" }, subscription: { id: "sub_stub", status: "active" }, downgrade_impact: impactWithOverage },
    }).as("subscribe");

    cy.visit("/plans");
    openDowngradeModal();

    // Loading -> skeleton visible while preview in flight.
    cy.getCy("downgrade-confirm-modal").contains("Reviewing your downgrade").should("be.visible");

    cy.wait("@previewImpact");

    // Resolves to overage state -> impact list with one row per will_exceed item.
    cy.getCy("downgrade-impact-list").should("be.visible");
    cy.getCy("downgrade-impact-list").find('[data-cy^="downgrade-impact-row-"]').should("have.length", impactWithOverage.will_exceed.length);
    cy.getCy("downgrade-impact-row-storage_size").should("exist");
    cy.getCy("downgrade-impact-row-max_published_projects").should("exist").and("contain.text", "will be deactivated");
    cy.getCy("downgrade-impact-row-team_member").should("exist");

    // Confirm proceeds (calls subscribe).
    cy.getCy("downgrade-confirm-submit").should("be.visible").click();
    cy.wait("@subscribe");
  });

  it("downgrade-no-overage: shows simple confirm copy and NO impact list", () => {
    cy.intercept("POST", `${API}/subscription/downgrade-impact`, { statusCode: 200, body: impactNoOverage }).as("previewImpact");

    cy.visit("/plans");
    openDowngradeModal();

    cy.wait("@previewImpact");

    // Clean state: simple confirm copy, NO impact list.
    cy.getCy("downgrade-confirm-modal").should("contain.text", "Your plan will change to");
    cy.getCy("downgrade-confirm-submit").should("be.visible").and("contain.text", "Confirm downgrade");
    cy.getCy("downgrade-impact-list").should("not.exist");
  });

  it("preview error (5xx): inline AlertBox + Retry visible and Confirm disabled", () => {
    cy.intercept("POST", `${API}/subscription/downgrade-impact`, { statusCode: 500, body: { message: "boom" } }).as("previewImpactErr");

    cy.visit("/plans");
    openDowngradeModal();

    cy.wait("@previewImpactErr");

    // Error state: inline AlertBox (variant=error) + Retry; Confirm button absent (disableConfirm).
    cy.getCy("downgrade-confirm-retry").should("be.visible");
    cy.getCy("downgrade-confirm-retry").contains("button", "Retry").should("be.visible");
    cy.getCy("downgrade-confirm-submit").should("not.exist");

    // Retry re-fires the preview; switch to a clean response to prove recovery.
    cy.intercept("POST", `${API}/subscription/downgrade-impact`, { statusCode: 200, body: impactNoOverage }).as("previewRetry");
    cy.getCy("downgrade-confirm-retry").contains("button", "Retry").click();
    cy.wait("@previewRetry");
    cy.getCy("downgrade-confirm-submit").should("be.visible");
  });

  it("upgrade-immediate (regression): selecting an Upgrade plan does NOT open the downgrade modal", () => {
    // Spy on the preview route — it must NEVER be called for an upgrade.
    cy.intercept("POST", `${API}/subscription/downgrade-impact`, cy.spy().as("previewSpy"));

    // Re-stub bootstrap so the user is on the CHEAP plan -> the expensive plan
    // now renders an "Upgrade" CTA. (Override the beforeEach bootstrap.)
    cy.intercept("POST", `${API}/auth/verify-token`, (req) => {
      req.continue((res) => {
        const body = res.body || {};
        const user = body.user || body;
        if (user && typeof user === "object") {
          user.email_verified = true;
          user.subscription = {
            id: "sub_stub",
            status: "active",
            active: true,
            price: { id: LOWER_PRICE_ID, price: LOWER_PRICE, product: stubPrices[1].product },
          };
        }
        res.send(body);
      });
    }).as("verifyTokenUpgrade");

    cy.visit("/plans");

    // Click the expensive plan's CTA (renders "Upgrade").
    cy.contains('[data-cy="plan-cta"]', "Upgrade", { timeout: 20000 }).should("be.visible").click();

    // PlansSection opens its generic "Upgrade Subscription" AlertModal, NOT the
    // downgrade modal. Assert the downgrade modal is absent and preview never ran.
    cy.contains("Upgrade Subscription", { timeout: 10000 }).should("be.visible");
    cy.getCy("downgrade-confirm-modal").should("not.exist");
    cy.get("@previewSpy").should("not.have.been.called");
  });
});
