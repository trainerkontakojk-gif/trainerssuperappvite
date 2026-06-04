import { describe, expect, it } from "vitest";
import {
  withDashboardAgentMetrics,
  type DashboardAgentGroup,
} from "../services/sidak/dashboard-types";

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
