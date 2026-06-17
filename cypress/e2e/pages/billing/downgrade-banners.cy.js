// ===========================================================================
// COMP-2405 — Billing downgrade banners (FE behavior)
// ===========================================================================
//
// Scope: behavioral proof of the two COMP-2405 banners on /billing:
//   - pending-downgrade banner  (subscription.scheduled_plan_name set)
//   - post-renewal deactivated banner (subscription.deactivated_resources set)
//
// Data-agnostic design (HARD rule): no hardcoded project/identity/bucket/record
// ids. We log in via cy.login() (canonical creds) and mutate the real
// POST **/auth/verify-token bootstrap response in-flight to inject the
// COMP-2405 subscription fields onto user.subscription — preserving the real
// user._id / role_assignment so RoleBasedGuard passes. Banners read from
// user.subscription (UserContext), so this fully controls the rendered state
// on ANY seeded account.
//
// "Keep current plan" -> POST **/subscription/cancel-scheduled is stubbed so we
// never hit live Stripe. "Upgrade to reactivate" -> navigate("/plans").
// ===========================================================================

const API = "**/api/fn-execute";

const pendingItems = null;

const deactivatedSnapshot = {
  deactivated_at: "2026-07-01T00:00:05.000Z",
  items: [
    { key: "max_published_projects", label: "Published projects", current: 3, new_limit: 1, will_deactivate: 2, action_verb: "deactivated" },
  ],
};

/**
 * Mutate the real verify-token response, injecting COMP-2405 subscription
 * fields onto user.subscription. `overrides` is merged onto a baseline active
 * subscription. Preserves the real user identity for guard checks.
 */
function stubSubscription(overrides) {
  cy.intercept("POST", `${API}/auth/verify-token`, (req) => {
    req.continue((res) => {
      const body = res.body || {};
      const user = body.user || body;
      if (user && typeof user === "object") {
        user.email_verified = true;
        user.subscription = Object.assign(
          {
            id: "sub_stub",
            status: "active",
            active: true,
            price: { id: "price_stub", price: 4900, product: { _id: "prod_stub", name: "Business" } },
          },
          overrides
        );
      }
      res.send(body);
    });
  }).as("verifyToken");

  // getSubscription() is called by handleKeepCurrentPlan after cancel — keep it
  // consistent so the refresh doesn't reintroduce the scheduled fields.
  cy.intercept("GET", `${API}/subscription*`, {
    statusCode: 200,
    body: { id: "sub_stub", status: "active", active: true, scheduled_plan_name: null, scheduled_effective_at: null, deactivated_resources: null },
  }).as("getSubscription");
}

describe("COMP-2405 — Billing downgrade banners", () => {
  beforeEach(() => {
    cy.login();
  });

  it("pending-downgrade banner: shows DOWNGRADE SCHEDULED + effective date; Keep current plan calls cancel route", () => {
    stubSubscription({
      scheduled_plan_name: "Starter",
      scheduled_effective_at: "2026-07-01T00:00:00.000Z",
      deactivated_resources: pendingItems,
    });

    cy.intercept("POST", `${API}/subscription/cancel-scheduled`, {
      statusCode: 200,
      body: { message: "Your current plan has been kept.", subscription: { id: "sub_stub", status: "active" } },
    }).as("cancelScheduled");

    cy.visit("/billing");

    // Banner present with the scheduled plan name + verbatim effective date.
    cy.getCy("billing-pending-downgrade-banner", { timeout: 20000 }).should("be.visible");
    cy.getCy("billing-pending-downgrade-banner").should("contain.text", "Starter");
    // Effective date is read verbatim (2026-07-01) and locale-formatted -> year present.
    cy.getCy("billing-pending-downgrade-banner").should("contain.text", "2026");

    // "Keep current plan" action calls the cancel-scheduled route (no live Stripe).
    cy.getCy("billing-pending-downgrade-banner").contains("button", "Keep current plan").should("be.visible").click();
    cy.wait("@cancelScheduled");
  });

  it("deactivated banner: shows ITEMS DEACTIVATED + past-tense impact list; Upgrade to reactivate routes to /plans", () => {
    stubSubscription({
      scheduled_plan_name: null,
      scheduled_effective_at: null,
      deactivated_resources: deactivatedSnapshot,
    });

    cy.visit("/billing");

    // Banner present with the deactivated impact list (pastTense).
    cy.getCy("billing-deactivated-banner", { timeout: 20000 }).should("be.visible");
    cy.getCy("billing-deactivated-banner").find('[data-cy="downgrade-impact-list"]').should("exist");
    cy.getCy("downgrade-impact-row-max_published_projects").should("exist");
    // Past-tense copy: "...deactivated" WITHOUT "will be".
    cy.getCy("downgrade-impact-row-max_published_projects")
      .should("contain.text", "deactivated")
      .and("not.contain.text", "will be");

    // "Upgrade to reactivate" routes to /plans.
    cy.getCy("billing-deactivated-banner").contains("button", "Upgrade to reactivate").should("be.visible").click();
    cy.location("pathname", { timeout: 10000 }).should("eq", "/plans");
  });
});
