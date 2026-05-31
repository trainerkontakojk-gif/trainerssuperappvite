import { describe, it, expect } from "vitest";
import { MIXED_ACCESS_TABLES } from "./fixtures/rls-config";
import { evaluateRLSPolicy } from "./helpers/rls-policy-evaluator";

describe("Mixed Access Pattern", () => {
  it("leader_access_requests: leader can view own, admin/trainer can manage all", () => {
    const config = MIXED_ACCESS_TABLES.find(
      (t) => t.table === "leader_access_requests",
    )!;

    // Admin can select
    const adminResult = evaluateRLSPolicy(config, "SELECT", "admin", false);
    expect(adminResult.allowed).toBe(true);

    // Trainer can select
    const trainerResult = evaluateRLSPolicy(
      config,
      "SELECT",
      "trainer",
      false,
    );
    expect(trainerResult.allowed).toBe(true);

    // Leader can select (own)
    const leaderResult = evaluateRLSPolicy(config, "SELECT", "leader", true);
    expect(leaderResult.allowed).toBe(true);

    // Anon cannot select
    const anonResult = evaluateRLSPolicy(config, "SELECT", "anon", false);
    expect(anonResult.allowed).toBe(false);
  });

  it("ai_pricing_settings: authenticated can read, anon denied", () => {
    const config = MIXED_ACCESS_TABLES.find(
      (t) => t.table === "ai_pricing_settings",
    )!;

    const authResult = evaluateRLSPolicy(
      config,
      "SELECT",
      "authenticated",
      false,
    );
    expect(authResult.allowed).toBe(true);

    const anonResult = evaluateRLSPolicy(config, "SELECT", "anon", false);
    expect(anonResult.allowed).toBe(false);
  });

  it("ai_billing_settings: authenticated can read, anon denied", () => {
    const config = MIXED_ACCESS_TABLES.find(
      (t) => t.table === "ai_billing_settings",
    )!;

    const authResult = evaluateRLSPolicy(
      config,
      "SELECT",
      "authenticated",
      false,
    );
    expect(authResult.allowed).toBe(true);

    const anonResult = evaluateRLSPolicy(config, "SELECT", "anon", false);
    expect(anonResult.allowed).toBe(false);
  });
});
