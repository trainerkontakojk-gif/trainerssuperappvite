import { describe, it, expect, vi, beforeEach } from "vitest";

const defaultPeriods = [
  { id: "2026-01", month: 1, year: 2026 },
  { id: "2026-02", month: 2, year: 2026 },
  { id: "2026-03", month: 3, year: 2026 },
  { id: "2026-04", month: 4, year: 2026 },
  { id: "2026-05", month: 5, year: 2026 },
  { id: "2026-06", month: 6, year: 2026 },
];

const page1 = Array.from({ length: 1000 }, (_, i) => ({
  id: `temuan-${i + 1}`,
  peserta_id: `p${i + 1}`,
  service_type: "call",
  period_id: "2026-05",
  tahun: 2026,
  nilai: 1,
  indicator_id: 1,
  created_at: "2026-05-01",
  profiler_peserta: { id: `p${i + 1}`, nama: `A${i + 1}`, batch_name: "B1", tim: "T1", jabatan: "agen" },
  qa_indicators: { id: 1, name: "I1", category: "critical" },
  qa_periods: { id: "2026-05", month: 5, year: 2026 },
}));
const page2 = Array.from({ length: 101 }, (_, i) => ({
  ...page1[i],
  id: `temuan-${1001 + i}`,
}));

let capturedRange: { from: number; to: number } | null = null;
let temuanRows: any[] = [...page1, ...page2];
let qaPeriods: Array<{ id: string; month: number; year: number }> = defaultPeriods;

function makePeriodQueryBuilder() {
  const filters: Array<{ column: string; value: any }> = [];
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => {
            let rows = [...qaPeriods];
            for (const filter of filters) {
              rows = rows.filter((row) => (row as any)[filter.column] === filter.value);
            }
            return resolve({ data: rows, error: null });
          };
        }
        if (prop === "single" || prop === "maybeSingle") {
          return () => {
            let rows = [...qaPeriods];
            for (const filter of filters) {
              rows = rows.filter((row) => (row as any)[filter.column] === filter.value);
            }
            return Promise.resolve({ data: rows[0] ?? null, error: null });
          };
        }
        if (prop === "eq") {
          return (column: string, value: any) => {
            filters.push({ column, value });
            return q;
          };
        }
        return (..._args: any[]) => q;
      },
    },
  );
  return q;
}

function makeFakeTemuanQueryBuilder(rows: any[]) {
  const state = {
    rangeFrom: 0,
    rangeTo: Number.MAX_SAFE_INTEGER,
    filters: [] as Array<{ column: string; op: string; value: any }>,
  };
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => {
            let filtered = rows;
            for (const filter of state.filters) {
              if (filter.op === "eq") {
                filtered = filtered.filter((row) => row[filter.column] === filter.value);
              }
              if (filter.op === "in") {
                filtered = filtered.filter((row) => filter.value.includes(row[filter.column]));
              }
              if (filter.op === "gte") {
                filtered = filtered.filter((row) => row[filter.column] >= filter.value);
              }
              if (filter.op === "lte") {
                filtered = filtered.filter((row) => row[filter.column] <= filter.value);
              }
            }
            const data = filtered.slice(state.rangeFrom, state.rangeTo + 1);
            return resolve({ data, error: null });
          };
        }
        if (prop === "range") {
          return (from: number, to: number) => {
            capturedRange = { from, to };
            state.rangeFrom = from;
            state.rangeTo = to;
            return q;
          };
        }
        if (prop === "eq") {
          return (column: string, value: any) => {
            state.filters.push({ column, op: "eq", value });
            return q;
          };
        }
        if (prop === "in") {
          return (column: string, value: any[]) => {
            state.filters.push({ column, op: "in", value });
            return q;
          };
        }
        if (prop === "gte") {
          return (column: string, value: any) => {
            state.filters.push({ column, op: "gte", value });
            return q;
          };
        }
        if (prop === "lte") {
          return (column: string, value: any) => {
            state.filters.push({ column, op: "lte", value });
            return q;
          };
        }
        return (..._args: any[]) => q;
      },
    },
  );
  return q;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "qa_periods") {
        return {
          select: () => makePeriodQueryBuilder(),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            is: () => ({
              then: (resolve: any) => resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "profiler_peserta") {
        return {
          select: () => ({
            in: () => ({
              then: (resolve: any) => resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table !== "qa_temuan") throw new Error(`unexpected table: ${table}`);
      return makeFakeTemuanQueryBuilder(temuanRows);
    },
  },
}));

vi.mock("../services/sidak/agent-directory", () => ({
  getSoftDeletedPesertaIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/sidak/period-indicator", () => ({
  getIndicators: vi.fn().mockResolvedValue([]),
  getPeriods: vi.fn(async () => qaPeriods),
}));

import { getDataReportRows } from "../services/sidak/report-data";

describe("getDataReportRows pagination", () => {
  beforeEach(() => {
    capturedRange = null;
    temuanRows = [...page1, ...page2];
    qaPeriods = [...defaultPeriods];
  });

  it("returns all rows across multiple pages (>1000)", async () => {
    const rows = await getDataReportRows({
      serviceType: "call",
      year: 2026,
    });
    expect(rows.length).toBe(1101);
  });

  it("uses range() for pagination", async () => {
    await getDataReportRows({ serviceType: "call", year: 2026 });
    expect(capturedRange).not.toBeNull();
    expect(capturedRange!.from).toBeGreaterThanOrEqual(0);
  });

  it("returns empty rows for an explicit empty agent scope", async () => {
    const rows = await getDataReportRows({
      serviceType: "call",
      year: 2026,
      agent_ids: [],
    });

    expect(rows).toEqual([]);
    expect(capturedRange).toBeNull();
  });

  it("filters month range by selected period IDs instead of UUID lexicographic order", async () => {
    qaPeriods = [
      { id: "ff000000-0000-0000-0000-000000000001", month: 1, year: 2026 },
      { id: "ee000000-0000-0000-0000-000000000002", month: 2, year: 2026 },
      { id: "dd000000-0000-0000-0000-000000000003", month: 3, year: 2026 },
      { id: "cc000000-0000-0000-0000-000000000004", month: 4, year: 2026 },
      { id: "bb000000-0000-0000-0000-000000000005", month: 5, year: 2026 },
      { id: "11000000-0000-0000-0000-000000000006", month: 6, year: 2026 },
    ];

    temuanRows = qaPeriods.map((period, index) => ({
      id: `uuid-row-${index + 1}`,
      peserta_id: `agent-${index + 1}`,
      service_type: "call",
      period_id: period.id,
      tahun: 2026,
      nilai: 1,
      indicator_id: 1,
      created_at: `2026-${String(index + 1).padStart(2, "0")}-01`,
      profiler_peserta: {
        id: `agent-${index + 1}`,
        nama: `Agent ${index + 1}`,
        batch_name: "B1",
        tim: "T1",
        jabatan: "agen",
      },
      qa_indicators: { id: 1, name: "I1", category: "critical" },
      qa_periods: { id: period.id, month: period.month, year: period.year },
    }));

    const rows = await getDataReportRows({
      serviceType: "call",
      year: 2026,
      startMonth: 1,
      endMonth: 6,
    });

    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.qa_periods.month)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
