import { describe, it, expect } from "vitest";
import { OWNER_ONLY_TABLES } from "./fixtures/rls-config";
import { evaluateRLSPolicy } from "./helpers/rls-policy-evaluator";

describe("Owner-Only Access Pattern", () => {
  const ownerOnlyTableNames = [
    "profiles",
    "ketik_history",
    "ketik_session_reviews",
    "ketik_typo_findings",
    "ketik_review_jobs",
    "pdkt_history",
    "pdkt_mailbox_items",
    "telefun_history",
    "telefun_coaching_summary",
    "telefun_replay_annotations",
    "user_settings",
    "report_archives",
  ];

  it("contains all expected owner-only tables", () => {
    const actualNames = OWNER_ONLY_TABLES.map((t) => t.table);
    for (const name of ownerOnlyTableNames) {
      expect(actualNames).toContain(name);
    }
  });

  it("owner-only tables have ownership field defined", () => {
    for (const config of OWNER_ONLY_TABLES) {
      for (const policy of config.policies) {
        // Every owner-only policy should reference an ownership field
        expect(policy.ownershipField || policy.requiresJoin).toBeTruthy();
      }
    }
  });

  it("positive case: owner can access their own data", () => {
    for (const config of OWNER_ONLY_TABLES) {
      for (const policy of config.policies) {
        for (const role of policy.allowedRoles) {
          const result = evaluateRLSPolicy(
            config,
            policy.operation,
            role,
            true,
          );
          expect(result.allowed).toBe(true);
        }
      }
    }
  });

  it("negative case: anon cannot access owner-only tables", () => {
    for (const config of OWNER_ONLY_TABLES) {
      for (const policy of config.policies) {
        const result = evaluateRLSPolicy(
          config,
          policy.operation,
          "anon",
          false,
        );
        expect(result.allowed).toBe(false);
      }
    }
  });

  it("negative case: non-owner authenticated user cannot access others data (except admin on profiles)", () => {
    const tablesWithoutAdminOverride = OWNER_ONLY_TABLES.filter(
      (t) => t.table !== "profiles",
    );
    for (const config of tablesWithoutAdminOverride) {
      for (const policy of config.policies) {
        // A non-owner user should be denied
        const result = evaluateRLSPolicy(
          config,
          policy.operation,
          "user",
          false,
        );
        expect(result.allowed).toBe(false);
      }
    }
  });
});
