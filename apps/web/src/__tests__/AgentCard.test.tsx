import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createRouter,
  createRootRoute,
} from "@tanstack/react-router";
import AgentCard from "../components/sidak/AgentCard";
import type { AgentDirectoryEntry } from "@trainers/types";
import type { ReactNode } from "react";

function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({
    component: () => <>{ui}</>,
  });
  const router = createRouter({ routeTree: rootRoute });
  return render(<RouterProvider router={router} />);
}

const mockAgent: AgentDirectoryEntry = {
  id: "agent-1",
  nama: "Adhitya Wisnuwadhana",
  tim: "TELEPON",
  batch: "TIM CALL",
  batch_name: "TIM CALL",
  foto_url: null,
  jabatan: "Agent",
  avgScore: 97.8,
  trend: "down",
  trendValue: 1.5,
  atRisk: false,
  periodMonth: 5, // May
};

describe("AgentCard Component", () => {
  it("renders agent name, team, and score with percentage symbol", async () => {
    renderWithRouter(<AgentCard agent={mockAgent} index={0} />);

    expect(await screen.findByText("Adhitya Wisnuwadhana")).toBeInTheDocument();
    expect(screen.getByText("TELEPON \u00B7 TIM CALL")).toBeInTheDocument();
    expect(screen.getByText("97.8%")).toBeInTheDocument();
  });

  it("displays the audited month name next to the percentage", async () => {
    renderWithRouter(<AgentCard agent={mockAgent} index={0} />);

    expect(await screen.findByText("(Mei)")).toBeInTheDocument();
  });

  it("does not display the month name when periodMonth is null or missing", async () => {
    const noMonthAgent = { ...mockAgent, periodMonth: undefined };
    renderWithRouter(<AgentCard agent={noMonthAgent} index={0} />);

    expect(await screen.findByText("Adhitya Wisnuwadhana")).toBeInTheDocument();
    expect(screen.queryByText("(Mei)")).not.toBeInTheDocument();
  });

  it("renders '--' score when avgScore is null and does not render month name", async () => {
    const noScoreAgent = { ...mockAgent, avgScore: null, periodMonth: 5 };
    renderWithRouter(<AgentCard agent={noScoreAgent} index={0} />);

    expect(await screen.findByText("--")).toBeInTheDocument();
    expect(screen.queryByText("(Mei)")).not.toBeInTheDocument();
  });
});
