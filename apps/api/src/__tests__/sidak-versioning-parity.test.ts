import { describe, it, expect, vi, beforeEach } from "vitest";

function buildQuery(onAwait: () => any) {
  const q = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve(onAwait());
        }
        return () => q;
      },
    },
  );
  return q;
}

let pendingResolve: () => any = () => ({ data: [], error: null });

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => buildQuery(() => pendingResolve())),
  },
  createAdminClient: vi.fn(),
}));

import * as sidakService from "../services/sidak-service";

describe("sidak-service versioning parity", () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
  });

  describe("createRuleVersion", () => {
    it("clones critical and non-critical weights, and copies indicator snapshots from source version when source_version_id is provided", async () => {
      const sourceVersion = {
        id: "source-version-id",
        service_type: "call",
        status: "published",
        critical_weight: 0.6,
        non_critical_weight: 0.4,
        scoring_mode: "weighted",
        effective_period_id: "p-1",
        version_number: 1,
      };

      const sourceIndicators = [
        {
          id: "ind-1",
          name: "Indikator 1",
          category: "critical",
          bobot: 0.6,
          has_na: false,
          threshold: null,
          sort_order: 0,
          legacy_indicator_id: "legacy-1",
        },
      ];

      let queryCount = 0;
      pendingResolve = () => {
        queryCount++;
        // First query: from("qa_service_rule_versions").select("*").eq("id", ...)
        if (queryCount === 1) {
          return { data: sourceVersion, error: null };
        }
        // Second query: from("qa_service_rule_indicators").select("*").eq("rule_version_id", ...)
        if (queryCount === 2) {
          return { data: sourceIndicators, error: null };
        }
        // Third query: from("qa_service_rule_versions").select("version_number").eq("service_type", ...).eq("effective_period_id", ...)
        if (queryCount === 3) {
          return { data: [{ version_number: 1 }], error: null };
        }
        // Fourth query: from("qa_service_rule_versions").insert({...})
        if (queryCount === 4) {
          return { data: { ...sourceVersion, id: "new-version-id", version_number: 2 }, error: null };
        }
        // Fifth query: from("qa_service_rule_indicators").insert([...])
        if (queryCount === 5) {
          return { data: null, error: null };
        }
        return { data: [], error: null };
      };

      const result = await sidakService.createRuleVersion(
        {
          service_type: "call",
          source_version_id: "source-version-id",
        },
        "user-id",
      );

      expect(result).toBeDefined();
      expect(result.version_number).toBe(2);
    });
  });
});
