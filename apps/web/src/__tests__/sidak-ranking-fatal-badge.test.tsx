import { fireEvent, render, screen } from "@testing-library/react";
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
import TopAgentsTable from "../components/sidak/TopAgentsTable";

const mockRankingResponse = {
  rankings: [
    {
      agentId: "agent-normal",
      nama: "Agent Normal",
      batch: "Batch A",
      defects: 3,
      score: 98.5,
      hasCritical: false,
      rankChange: 0,
    },
    {
      agentId: "agent-fatal",
      nama: "Agent Fatal",
      batch: "Batch A",
      defects: 10,
      score: 75.0,
      hasCritical: true,
      rankChange: 1,
    },
  ],
  periods: [{ id: "period-1", month: 5, year: 2026, label: "05/2026" }],
  folders: [{ id: "ALL", name: "Semua Tim" }],
  availableYears: [2025, 2026],
};

describe("Sidak Ranking status clarity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("separates position movement and omits non-actionable fatal labels", () => {
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

    expect(screen.getByText("Perubahan posisi")).toBeInTheDocument();
    const movementLabels = screen.getAllByText("Prioritas naik +1");
    expect(movementLabels).toHaveLength(2);
    expect(movementLabels.filter((element) => element.classList.contains("md:hidden"))).toHaveLength(1);
    expect(movementLabels.filter((element) => !element.classList.contains("md:hidden"))).toHaveLength(1);
    expect(screen.getAllByText("Tetap")).toHaveLength(2);
    expect(screen.queryByText("Fatal")).not.toBeInTheDocument();
  });

  it("exposes filter labels and agent navigation to keyboard users", () => {
    useApiMock.mockReturnValue({
      data: mockRankingResponse,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SidakRankingPage />);

    expect(screen.getByLabelText("Layanan")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agent Normal" })).toBeInTheDocument();
  });

  it("keeps shared business rank for tied defects after presentation sorting", () => {
    useApiMock.mockReturnValue({
      data: {
        ...mockRankingResponse,
        rankings: [
          {
            agentId: "tie-a",
            nama: "Agent Tie A",
            batch: "Batch A",
            defects: 10,
            score: 75,
            hasCritical: false,
          },
          {
            agentId: "tie-b",
            nama: "Agent Tie B",
            batch: "Batch A",
            defects: 10,
            score: 95,
            hasCritical: false,
          },
          {
            agentId: "tie-c",
            nama: "Agent Tie C",
            batch: "Batch A",
            defects: 3,
            score: 99,
            hasCritical: false,
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SidakRankingPage />);

    expect(screen.getByText("Agent Tie A").closest("tr")).toHaveTextContent("1");
    expect(screen.getByText("Agent Tie B").closest("tr")).toHaveTextContent("1");
    expect(screen.getByText("Agent Tie C").closest("tr")).toHaveTextContent("3");

    expect(screen.getByText("Agent Tie A").closest("tr")).toHaveTextContent(
      "Berbagi peringkat 1 dengan Agent Tie B",
    );
    expect(screen.getByText("Agent Tie B").closest("tr")).toHaveTextContent(
      "Berbagi peringkat 1 dengan Agent Tie A",
    );

    fireEvent.click(screen.getByRole("button", { name: /Rata-rata Skor QA/i }));

    expect(screen.getByText("Agent Tie C").closest("tr")).toHaveTextContent("3");
    expect(screen.getByText("Agent Tie B").closest("tr")).toHaveTextContent("1");
  });

  it("preserves the selected service when opening the full ranking", () => {
    render(
      <TopAgentsTable
        serviceType="chat"
        selectedYear={2026}
        agents={[
          {
            agentId: "agent-chat",
            nama: "Agent Chat",
            batch: "Batch Chat",
            tim: "Tim Chat",
            defects: 3,
            score: 92,
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Lihat Semua" })).toHaveAttribute(
      "href",
      "/sidak/ranking?service_type=chat&year=2026",
    );
  });
});
