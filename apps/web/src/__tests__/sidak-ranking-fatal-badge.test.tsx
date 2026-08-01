import { render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import React from "react";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import SidakRankingPage from "../routes/sidak/ranking";

const mockRankingResponse = {
  rankings: [
    {
      agentId: "agent-normal",
      nama: "Agent Normal",
      batch: "Batch A",
      defects: 3,
      score: 98.5,
      hasCritical: false,
    },
    {
      agentId: "agent-fatal",
      nama: "Agent Fatal",
      batch: "Batch A",
      defects: 10,
      score: 75.0,
      hasCritical: true,
    },
  ],
  periods: [{ id: "period-1", month: 5, year: 2026, label: "05/2026" }],
  folders: [{ id: "ALL", name: "Semua Tim" }],
  availableYears: [2025, 2026],
};

describe("Sidak Ranking Fatal Parity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders the rankings table and conditionally displays the Fatal badge", () => {
    useApiMock.mockReturnValue({
      data: mockRankingResponse,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SidakRankingPage />);

    // Check table headers and agent names
    expect(screen.getByText("Agent Normal")).toBeInTheDocument();
    expect(screen.getByText("Agent Fatal")).toBeInTheDocument();

    // Check scores
    expect(screen.getByText("98.5%")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();

    // "Fatal" badge should be present for agent-fatal but NOT for agent-normal
    const fatalBadges = screen.getAllByText("Fatal");
    expect(fatalBadges).toHaveLength(1);

    // Verify that the Fatal badge is closer to Agent Fatal
    const agentFatalRow = screen.getByText("Agent Fatal").closest("tr");
    expect(agentFatalRow).toHaveTextContent("Fatal");

    const agentNormalRow = screen.getByText("Agent Normal").closest("tr");
    expect(agentNormalRow).not.toHaveTextContent("Fatal");
  });
});
