import { describe, expect, it } from "vitest";
import { buildDashboardTrends } from "../services/sidak/dashboard-trends";

describe("buildDashboardTrends", () => {
  it("uses compliance rate, not compliance count, for compliance sparkline value", () => {
    const periods = [
      { id: "p1", month: 4, year: 2026 },
      { id: "p2", month: 5, year: 2026 },
    ] as any[];

    const rows = [
      { period_id: "p1", peserta_id: "a1", service_type: "call", nilai: 3, is_phantom_padding: true },
      { period_id: "p1", peserta_id: "a2", service_type: "call", nilai: 3, is_phantom_padding: true },
      { period_id: "p2", peserta_id: "a1", service_type: "call", nilai: 3, is_phantom_padding: true },
      { period_id: "p2", peserta_id: "a2", service_type: "call", nilai: 0, indicator_id: "critical-1" },
      { period_id: "p2", peserta_id: "a3", service_type: "call", nilai: 3, is_phantom_padding: true },
      { period_id: "p2", peserta_id: "a4", service_type: "call", nilai: 3, is_phantom_padding: true },
    ] as any[];

    const result = buildDashboardTrends({
      periods,
      rows,
      indicators: [{ id: "critical-1", name: "Critical", category: "critical" }] as any,
      weightMap: {},
      year: 2026,
      isCountableFinding: (row) => row.is_phantom_padding !== true && Number(row.nilai) < 3,
      calculateScore: (agentRows) => (agentRows.some((row) => Number(row.nilai) === 0) ? 90 : 100),
    });

    expect(result.sparklines.compliance).toEqual([
      { label: "Apr 26", value: 100, count: 2, totalAudited: 2 },
      { label: "Mei 26", value: 75, count: 3, totalAudited: 4 },
    ]);
  });
});
