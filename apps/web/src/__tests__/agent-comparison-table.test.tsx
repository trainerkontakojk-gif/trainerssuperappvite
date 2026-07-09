import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AgentComparisonTable from "../components/sidak/AgentComparisonTable";
import type { AgentComparisonTable as AgentComparisonTableData } from "@trainers/types";

const baseTable: AgentComparisonTableData = {
  scope: {
    year: 2026,
    serviceType: "call",
    startMonth: 1,
    endMonth: 5,
    teamLabel: "Tim Siti Nur Anisa",
    serviceLabel: "Call",
  },
  rows: [
    {
      key: "total",
      label: "Total Temuan",
      agentCount: 10,
      teamAverage: 7,
      serviceAverage: 8,
      teamAgentCount: 4,
      serviceAgentCount: 20,
    },
    {
      key: "ind-1",
      label: "Salam Pembuka",
      agentCount: 4,
      teamAverage: 2,
      serviceAverage: 3,
      teamAgentCount: 4,
      serviceAgentCount: 20,
    },
    {
      key: "ind-2",
      label: "Salam Penutup",
      agentCount: 2,
      teamAverage: 1,
      serviceAverage: 1.5,
      teamAgentCount: 4,
      serviceAgentCount: 20,
    },
  ],
};

describe("AgentComparisonTable", () => {
  it("renders the total row and parameter rows with averages and percentage deltas", () => {
    render(<AgentComparisonTable comparisonTable={baseTable} />);

    // Scope line
    expect(
      screen.getByText(/Jan-Mei 2026 • Layanan Call • Tim Siti Nur Anisa • 4 agent tim \/ 20 agent service sama/),
    ).toBeInTheDocument();

    // Column headers
    expect(screen.getByText("Parameter")).toBeInTheDocument();
    expect(screen.getByText("Agent ini")).toBeInTheDocument();
    expect(screen.getByText("Rata-rata tim")).toBeInTheDocument();
    expect(screen.getByText("Rata-rata service sama")).toBeInTheDocument();
    expect(screen.getByText("% vs tim")).toBeInTheDocument();
    expect(screen.getByText("% vs service sama")).toBeInTheDocument();

    // Total row
    expect(screen.getByText("Total Temuan")).toBeInTheDocument();
    expect(screen.getByText("Salam Pembuka")).toBeInTheDocument();
    expect(screen.getByText("Salam Penutup")).toBeInTheDocument();

    // Agent counts
    expect(screen.getByText("10")).toBeInTheDocument(); // total agent
    expect(screen.getByText("4")).toBeInTheDocument(); // salam pembuka agent

    // Deltas: total agent(10) vs teamAvg(7) = +42.9%; vs layananAvg(8) = +25%
    expect(screen.getByText("+42,9%")).toBeInTheDocument();
    expect(screen.getByText("+25%")).toBeInTheDocument();
  });

  it("shows the empty state when there are no comparison rows beyond totals", () => {
    const emptyTable: AgentComparisonTableData = {
      ...baseTable,
      rows: [
        {
          key: "total",
          label: "Total Temuan",
          agentCount: 0,
          teamAverage: 0,
          serviceAverage: 0,
          teamAgentCount: 0,
          serviceAgentCount: 0,
        },
      ],
    };

    render(<AgentComparisonTable comparisonTable={emptyTable} />);
    expect(
      screen.getByText("Belum ada data pembanding untuk range ini"),
    ).toBeInTheDocument();
  });

  it("returns nothing when comparisonTable is undefined", () => {
    const { container } = render(
      <AgentComparisonTable comparisonTable={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
