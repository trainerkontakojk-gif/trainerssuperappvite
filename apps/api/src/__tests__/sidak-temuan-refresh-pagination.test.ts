import { beforeEach, describe, it, expect, vi } from "vitest";

let totalRowsReturned = 0;
let serviceWeightsError: { message: string } | null = null;

function makePaginatedMock(allRows: any[]) {
  totalRowsReturned = 0;
  return (table: string) => {
    if (table === "qa_service_weights") {
      const q: any = new Proxy({}, {
        get(_t: any, prop: PropertyKey) {
          if (prop === "then") {
            return (resolve: any) =>
              resolve({ data: [], error: serviceWeightsError });
          }
          return (..._args: any[]) => q;
        },
      });
      return q;
    }
    if (table === "qa_temuan") {
      let usedRange = false;
      let capturedFrom = 0;
      let capturedTo = Number.MAX_SAFE_INTEGER;
      const q: any = new Proxy({}, {
        get(_t: any, prop: PropertyKey) {
          if (prop === "then") {
            return (resolve: any) => {
              if (!usedRange) {
                // Simulate Supabase 1000-row auto-truncation
                totalRowsReturned = Math.min(allRows.length, 1000);
                return resolve({ data: allRows.slice(0, 1000), error: null });
              }
              const filtered = allRows.filter((_, idx) => idx >= capturedFrom && idx <= capturedTo);
              totalRowsReturned += filtered.length;
              return resolve({ data: filtered, error: null });
            };
          }
          if (prop === "range") {
            return (from: number, to: number) => { usedRange = true; capturedFrom = from; capturedTo = to; return q; };
          }
          return (..._args: any[]) => q;
        },
      });
      return q;
    }
    const q: any = new Proxy({}, {
      get(_t: any, prop: PropertyKey) {
        if (prop === "then") return (resolve: any) => resolve({ data: [], error: null });
        return (..._args: any[]) => q;
      },
    });
    return q;
  };
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock("../services/sidak/period-indicator", () => ({
  getIndicators: vi.fn().mockResolvedValue([
    { id: "ind-1", name: "Indicator 1", category: "critical", service_type: "call" },
  ]),
}));

vi.mock("../services/sidak/dashboard-aggregation", () => ({
  getScoreRows: vi.fn((rows: any[]) => rows),
}));

vi.mock("../lib/scoring", () => ({
  calculateQAScoreFromTemuan: vi.fn().mockReturnValue(80),
  DEFAULT_SERVICE_WEIGHTS: { call: { critical_weight: 2, non_critical_weight: 1, scoring_mode: "weighted" } },
  isServiceType: vi.fn().mockReturnValue(true),
}));

vi.mock("../services/sidak/rule-version-resolver", () => ({
  resolveEffectiveRuleVersionForPeriod: vi.fn().mockResolvedValue({ version: 1 }),
}));

vi.mock("../services/sidak/period-scoring-context", () => ({
  loadPeriodScoringContext: vi.fn().mockResolvedValue({
    weight: { critical_weight: 2, non_critical_weight: 1, scoring_mode: "weighted" },
    indicators: [{ id: "ind-1", name: "Indicator 1", category: "critical", service_type: "call" }],
  }),
  normalizePeriodScoringRows: vi.fn((_rows: any[]) => _rows.map((r: any) => ({ ...r, indicator_category: "critical", weight: 2 }))),
}));

import { refreshDashboardSummary } from "../services/sidak/temuan-service";

describe("refreshDashboardSummary pagination", () => {
  beforeEach(() => {
    serviceWeightsError = null;
  });

  it("fetches all rows when >1000 (no truncation)", async () => {
    const { supabaseAdmin } = await import("../lib/supabase");
    const allRows = Array.from({ length: 1100 }, (_, i) => ({
      id: `t-${i + 1}`, period_id: "p1", peserta_id: `a-${(i % 10) + 1}`,
      service_type: "call", nilai: 0, indicator_id: "ind-1",
      profiler_peserta: { id: `a-${(i % 10) + 1}`, nama: `Agent ${(i % 10) + 1}`, batch_name: "B1", tim: "T1", jabatan: "agen" },
    }));

    vi.mocked(supabaseAdmin.from).mockImplementation(makePaginatedMock(allRows));

    await refreshDashboardSummary("p1", "call");

    // Without fix: 1000 rows returned (truncated). With fix: all 1100 rows across pages.
    expect(totalRowsReturned).toBe(1100);
  });

  it("throws when service weights cannot be loaded", async () => {
    const { supabaseAdmin } = await import("../lib/supabase");
    vi.mocked(supabaseAdmin.from).mockImplementation(makePaginatedMock([]));
    serviceWeightsError = { message: "weights unavailable" };

    await expect(refreshDashboardSummary("p1", "call")).rejects.toThrow(
      "weights unavailable",
    );
  });
});
