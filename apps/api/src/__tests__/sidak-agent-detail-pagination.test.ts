import { describe, it, expect, vi } from "vitest";

let totalRowsReturned = 0;

function makePaginatedMock(allRows: any[]) {
  totalRowsReturned = 0;
  return (table: string) => {
    if (table === "profiler_peserta") {
      const q: any = new Proxy({}, {
        get(_t: any, prop: PropertyKey) {
          if (prop === "then") {
            return (resolve: any) => {
              const row = allRows.length > 0 ? allRows[0] : null;
              const peserta = row ? { id: row.peserta_id, nama: "Agent", tim: "T1", batch_name: "B1", jabatan: "agen", foto_url: null, bergabung_date: null } : null;
              return resolve({ data: peserta, error: peserta ? null : new Error("not found") });
            };
          }
          return (..._args: any[]) => q;
        },
      });
      return q;
    }
    if (table === "qa_service_weights") {
      const q: any = new Proxy({}, {
        get(_t: any, prop: PropertyKey) {
          if (prop === "then") return (resolve: any) => resolve({ data: [], error: null });
          return (..._args: any[]) => q;
        },
      });
      return q;
    }
    if (table === "qa_periods") {
      const periods = [
        { id: "2026-01", month: 1, year: 2026, label: "01/2026" },
        { id: "2026-02", month: 2, year: 2026, label: "02/2026" },
        { id: "2026-03", month: 3, year: 2026, label: "03/2026" },
        { id: "2026-04", month: 4, year: 2026, label: "04/2026" },
        { id: "2026-05", month: 5, year: 2026, label: "05/2026" },
        { id: "2026-06", month: 6, year: 2026, label: "06/2026" },
      ];
      const q: any = new Proxy({}, {
        get(_t: any, prop: PropertyKey) {
          if (prop === "then") return (resolve: any) => resolve({ data: periods, error: null });
          return (..._args: any[]) => q;
        },
      });
      return q;
    }
    if (table === "qa_indicators") {
      const q: any = new Proxy({}, {
        get(_t: any, prop: PropertyKey) {
          if (prop === "then") return (resolve: any) => resolve({ data: [{ id: "ind-1", name: "Indicator 1", category: "critical", service_type: "call" }], error: null });
          return (..._args: any[]) => q;
        },
      });
      return q;
    }
    if (table === "qa_temuan") {
      let usedRange = false;
      let capturedFrom = 0;
      let capturedTo = Number.MAX_SAFE_INTEGER;
      const capturedFilters: { column: string; op: string; value: any }[] = [];
      const q: any = new Proxy({}, {
        get(_t: any, prop: PropertyKey) {
          if (prop === "then") {
            return (resolve: any) => {
              let filtered = allRows;
              for (const f of capturedFilters) {
                if (f.op === "eq") filtered = filtered.filter((r: any) => r[f.column] === f.value);
                if (f.op === "in") filtered = filtered.filter((r: any) => f.value.includes(r[f.column]));
                if (f.op === "gte") filtered = filtered.filter((r: any) => r[f.column] >= f.value);
                if (f.op === "lte") filtered = filtered.filter((r: any) => r[f.column] <= f.value);
              }
              if (!usedRange) {
                totalRowsReturned = Math.min(filtered.length, 1000);
                return resolve({ data: filtered.slice(0, 1000), error: null });
              }
              const sliced = filtered.filter((_: any, idx: number) => idx >= capturedFrom && idx <= capturedTo);
              totalRowsReturned += sliced.length;
              return resolve({ data: sliced, error: null });
            };
          }
          if (prop === "range") {
            return (from: number, to: number) => { usedRange = true; capturedFrom = from; capturedTo = to; return q; };
          }
          if (prop === "eq") {
            return (column: string, value: any) => { capturedFilters.push({ column, op: "eq", value }); return q; };
          }
          if (prop === "in") {
            return (column: string, values: any[]) => { capturedFilters.push({ column, op: "in", value: values }); return q; };
          }
          if (prop === "gte") {
            return (column: string, value: any) => { capturedFilters.push({ column, op: "gte", value }); return q; };
          }
          if (prop === "lte") {
            return (column: string, value: any) => { capturedFilters.push({ column, op: "lte", value }); return q; };
          }
          if (prop === "order") return (..._args: any[]) => q;
          if (prop === "select") return (..._args: any[]) => q;
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
  getPeriods: vi.fn().mockResolvedValue([
    { id: "2026-01", month: 1, year: 2026, label: "01/2026" },
    { id: "2026-02", month: 2, year: 2026, label: "02/2026" },
    { id: "2026-03", month: 3, year: 2026, label: "03/2026" },
    { id: "2026-04", month: 4, year: 2026, label: "04/2026" },
    { id: "2026-05", month: 5, year: 2026, label: "05/2026" },
    { id: "2026-06", month: 6, year: 2026, label: "06/2026" },
  ]),
}));

vi.mock("../services/sidak/dashboard-aggregation", () => ({
  getScoreRows: vi.fn((rows: any[]) => rows),
}));

vi.mock("../lib/scoring", () => ({
  calculateQAScoreFromTemuan: vi.fn().mockReturnValue({ finalScore: 80, nonCriticalScore: 40, criticalScore: 40, sessionCount: 1 }),
  DEFAULT_SERVICE_WEIGHTS: { call: { critical_weight: 2, non_critical_weight: 1, scoring_mode: "weighted" } },
  VALID_SERVICE_TYPES: ["call", "chat", "email"],
  isServiceType: vi.fn().mockReturnValue(true),
  resolveServiceTypeFromTeam: vi.fn().mockReturnValue("call"),
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
  mergeServiceWeights: vi.fn((_defaults: any, overrides: any) => overrides ?? {}),
}));

import { getAgentDetail } from "../services/sidak/agent-directory";

describe("getAgentDetail pagination", () => {
  it("fetches all rows across 1000-row boundary", async () => {
    const { supabaseAdmin } = await import("../lib/supabase");
    const allRows = Array.from({ length: 1500 }, (_, i) => ({
      id: `t-${i + 1}`, peserta_id: "agent-1", service_type: "call",
      period_id: "2026-03", tahun: 2026, nilai: 0, indicator_id: "ind-1",
      no_tiket: null, created_at: "2026-03-01", is_phantom_padding: false,
    }));

    vi.mocked(supabaseAdmin.from).mockImplementation(makePaginatedMock(allRows));

    const result = await getAgentDetail("agent-1", 2026, "call");
    expect(totalRowsReturned).toBe(1500);
    expect(result.temuan.length).toBe(1500);
  });
});
