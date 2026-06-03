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

describe("getResolvedInputConfig service and API route", () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
  });

  it("resolves BKO indicators from the effective period rule version", async () => {
    const targetPeriod = { id: "p-apr", month: 4, year: 2026 };
    const mockVersions = [
      {
        id: "v-jan",
        service_type: "bko",
        effective_period_id: "p-jan",
        status: "published",
        critical_weight: 0.0,
        non_critical_weight: 0.0,
        scoring_mode: "no_category",
        version_number: 1,
        qa_periods: { id: "p-jan", month: 1, year: 2026 },
      },
    ];
    const mockRuleIndicators = [
      {
        id: "ri-1",
        rule_version_id: "v-jan",
        service_type: "bko",
        name: "Parameter BKO 1",
        category: "none",
        bobot: 1.0,
        has_na: false,
        threshold: null,
        sort_order: 1,
        legacy_indicator_id: "legacy-bko-1",
      },
    ];

    let queryCount = 0;
    pendingResolve = () => {
      queryCount++;
      // query 1: check draft versions status -> count
      if (queryCount === 1) {
        return { count: 0, error: null };
      }
      // query 2: resolveEffectiveRuleVersionForPeriod -> get target period details
      if (queryCount === 2) {
        return { data: targetPeriod, error: null };
      }
      // query 3: resolveEffectiveRuleVersionForPeriod -> get published versions
      if (queryCount === 3) {
        return { data: mockVersions, error: null };
      }
      // query 4: load rule indicators from public.qa_service_rule_indicators
      if (queryCount === 4) {
        return { data: mockRuleIndicators, error: null };
      }
      return { data: [], error: null };
    };

    const config = await sidakService.getResolvedInputConfig("bko", "p-apr");

    expect(config).toBeDefined();
    expect(config.ruleVersionId).toBe("v-jan");
    expect(config.hasDraftVersion).toBe(false);
    expect(config.weight.scoring_mode).toBe("no_category");
    expect(config.indicators).toHaveLength(1);
    expect(config.indicators[0].id).toBe("legacy-bko-1");
    expect(config.indicators[0].name).toBe("Parameter BKO 1");
    expect(config.indicators[0].category).toBe("none");
  });

  it("falls back to global indicators and DEFAULT_SERVICE_WEIGHTS if no effective period rule version", async () => {
    const targetPeriod = { id: "p-jan", month: 1, year: 2026 };


    let queryCount = 0;
    pendingResolve = () => {
      queryCount++;
      // query 1: draft status -> count
      if (queryCount === 1) {
        return { count: 1, error: null }; // draft exists
      }
      // query 2: resolveEffectiveRuleVersionForPeriod -> target period
      if (queryCount === 2) {
        return { data: targetPeriod, error: null };
      }
      // query 3: resolveEffectiveRuleVersionForPeriod -> versions
      if (queryCount === 3) {
        return { data: [], error: null };
      }
      // query 4: resolve weight db check
      if (queryCount === 4) {
        return { data: null, error: null }; // no weight in db
      }
      return { data: [], error: null };
    };

    const config = await sidakService.getResolvedInputConfig("bko", "p-jan");

    expect(config).toBeDefined();
    expect(config.ruleVersionId).toBeNull();
    expect(config.hasDraftVersion).toBe(true);
    expect(config.indicators).toHaveLength(0); // empty when periodId provided but no rule resolved
    expect(config.weight.scoring_mode).toBe("no_category"); // fallback default weights BKO
  });
});
