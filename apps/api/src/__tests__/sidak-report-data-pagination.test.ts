import { describe, it, expect, vi, beforeEach } from "vitest";

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

function makeFakeQueryBuilder(pages: any[][]) {
  const state = {
    rangeFrom: 0,
    rangeTo: Number.MAX_SAFE_INTEGER,
  };
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => {
            const idx = Math.floor(state.rangeFrom / 1000);
            return resolve({ data: pages[idx] ?? [], error: null });
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
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: "2026-05" }, error: null }),
              }),
            }),
          }),
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
      return makeFakeQueryBuilder([page1, page2]);
    },
  },
}));

vi.mock("../services/sidak/agent-directory", () => ({
  getSoftDeletedPesertaIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/sidak/period-indicator", () => ({
  getIndicators: vi.fn().mockResolvedValue([]),
}));

import { getDataReportRows } from "../services/sidak/report-data";

describe("getDataReportRows pagination", () => {
  beforeEach(() => {
    capturedRange = null;
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
});
