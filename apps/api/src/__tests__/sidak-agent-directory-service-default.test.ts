import { describe, expect, it, vi } from "vitest";

const { periods, rowsByTable } = vi.hoisted(() => ({
  periods: [
    { id: "p-may", month: 5, year: 2026, label: "05/2026" },
    { id: "p-jun", month: 6, year: 2026, label: "06/2026" },
  ],
  rowsByTable: {
    profiler_peserta: [
      {
        id: "agent-telepon",
        nama: "Agent Telepon",
        tim: "Telepon",
        batch_name: "Team A",
        foto_url: null,
        jabatan: "cca",
      },
    ],
    qa_temuan: [
      {
        id: "call-jun",
        peserta_id: "agent-telepon",
        period_id: "p-jun",
        service_type: "call",
        indicator_id: "call-ind",
        nilai: 2,
        no_tiket: "CALL-JUN",
        tahun: 2026,
        created_at: "2026-06-10T00:00:00.000Z",
        is_phantom_padding: false,
      },
      {
        id: "email-jun",
        peserta_id: "agent-telepon",
        period_id: "p-jun",
        service_type: "email",
        indicator_id: "email-ind",
        nilai: 3,
        no_tiket: "EMAIL-JUN",
        tahun: 2026,
        created_at: "2026-06-11T00:00:00.000Z",
        is_phantom_padding: false,
      },
      {
        id: "call-may",
        peserta_id: "agent-telepon",
        period_id: "p-may",
        service_type: "call",
        indicator_id: "call-ind",
        nilai: 1,
        no_tiket: "CALL-MAY",
        tahun: 2026,
        created_at: "2026-05-10T00:00:00.000Z",
        is_phantom_padding: false,
      },
    ],
  } as Record<string, any[]>,
}));

function buildQuery(table: string) {
  const filters: { column: string; values: any[] }[] = [];
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => {
            let rows = rowsByTable[table] ?? [];
            for (const filter of filters) {
              rows = rows.filter((row) => filter.values.includes(row[filter.column]));
            }
            resolve({ data: rows, error: null });
          };
        }
        if (prop === "eq") {
          return (column: string, value: any) => {
            filters.push({ column, values: [value] });
            return q;
          };
        }
        if (prop === "in") {
          return (column: string, values: any[]) => {
            filters.push({ column, values });
            return q;
          };
        }
        return () => q;
      },
    },
  );
  return q;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => buildQuery(table)),
  },
  createAdminClient: vi.fn(),
}));

vi.mock("../services/sidak/period-indicator", () => ({
  getIndicators: vi.fn(async (serviceType: string) => [
    {
      id: `${serviceType}-ind`,
      name: `${serviceType} indicator`,
      category: "critical",
      bobot: 10,
      service_type: serviceType,
    },
  ]),
  getPeriods: vi.fn().mockResolvedValue(periods),
}));

vi.mock("../lib/scoring", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/scoring")>();
  return {
    ...actual,
    calculateQAScoreFromTemuan: vi.fn((_indicators, temuan) => {
      const first = temuan[0];
      if (first?.service_type === "email") {
        return { finalScore: 100, sessionCount: 1 };
      }
      if (first?.period_id === "p-jun") {
        return { finalScore: 98.67, sessionCount: 1 };
      }
      return { finalScore: 97.03, sessionCount: 1 };
    }),
  };
});

import { getAgentDirectorySummary } from "../services/sidak/agent-directory";

describe("getAgentDirectorySummary service default", () => {
  it("uses the agent primary service when multiple services exist in the same latest month", async () => {
    const result = await getAgentDirectorySummary(2026);

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]).toMatchObject({
      id: "agent-telepon",
      avgScore: 98.67,
      periodMonth: 6,
      trend: "up",
      trendValue: 1.64,
    });
  });

  it("still honors an explicit allowed service scope", async () => {
    const result = await getAgentDirectorySummary(
      2026,
      undefined,
      undefined,
      ["email"],
    );

    expect(result.agents[0]).toMatchObject({
      id: "agent-telepon",
      avgScore: 100,
      periodMonth: 6,
      trend: "none",
      trendValue: null,
    });
  });
});
