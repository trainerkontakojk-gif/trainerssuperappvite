// Merged dari sidak-dashboard-trends + sidak-dashboard-type-boundary (konsolidasi fragmentasi)
import { describe, expect, it } from "vitest";
import { buildDashboardTrends } from "../services/sidak/dashboard-trends";
import {
  withDashboardAgentMetrics,
  type DashboardAgentGroup,
} from "../services/sidak/dashboard-types";

describe("buildDashboardTrends", () => {
  it("uses compliance rate, not compliance count, for compliance sparkline value", () => {
    const periods = [
      { id: "p1", month: 4, year: 2026 },
      { id: "p2", month: 5, year: 2026 },
    ] as any[];

    const rows = [
      {
        period_id: "p1",
        peserta_id: "a1",
        service_type: "call",
        nilai: 3,
        is_phantom_padding: true,
      },
      {
        period_id: "p1",
        peserta_id: "a2",
        service_type: "call",
        nilai: 3,
        is_phantom_padding: true,
      },
      {
        period_id: "p2",
        peserta_id: "a1",
        service_type: "call",
        nilai: 3,
        is_phantom_padding: true,
      },
      {
        period_id: "p2",
        peserta_id: "a2",
        service_type: "call",
        nilai: 0,
        indicator_id: "critical-1",
      },
      {
        period_id: "p2",
        peserta_id: "a3",
        service_type: "call",
        nilai: 3,
        is_phantom_padding: true,
      },
      {
        period_id: "p2",
        peserta_id: "a4",
        service_type: "call",
        nilai: 3,
        is_phantom_padding: true,
      },
    ] as any[];

    const result = buildDashboardTrends({
      periods,
      rows,
      indicators: [
        { id: "critical-1", name: "Critical", category: "critical" },
      ] as any,
      weightMap: {},
      year: 2026,
      isCountableFinding: (row) =>
        row.is_phantom_padding !== true && Number(row.nilai) < 3,
      calculateScore: (agentRows) =>
        agentRows.some((row) => Number(row.nilai) === 0) ? 90 : 100,
    });

    expect(result.sparklines.compliance).toEqual([
      { label: "Apr 26", value: 100, count: 2, totalAudited: 2 },
      { label: "Mei 26", value: 75, count: 3, totalAudited: 4 },
    ]);
  });
});

describe("SIDAK dashboard type boundary", () => {
  it("derives dashboard agent metrics without mutating the source agent group", () => {
    const agent: DashboardAgentGroup = {
      id: "agent-1",
      nama: "Agent",
      batch_name: "Batch",
      tim: "Team",
      jabatan: "Agent",
      rows: [],
    };

    const enriched = withDashboardAgentMetrics(agent, {
      finalAgentScore: 97,
      agentFindings: 2,
      hasCritical: false,
    });

    expect(enriched).toMatchObject({
      id: "agent-1",
      finalAgentScore: 97,
      agentFindings: 2,
      hasCritical: false,
    });
    expect("finalAgentScore" in agent).toBe(false);
    expect("agentFindings" in agent).toBe(false);
    expect("hasCritical" in agent).toBe(false);
  });
});
