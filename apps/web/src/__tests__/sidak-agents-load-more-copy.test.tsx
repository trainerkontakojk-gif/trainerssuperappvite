import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useApiMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useApi", () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock("../components/sidak/AgentCard", () => ({
  default: ({ agent }: { agent: { id: string; nama: string } }) => (
    <div data-testid={`agent-card-${agent.id}`}>{agent.nama}</div>
  ),
}));

import SidakAgentsPage from "../routes/sidak/agents";

function makeAgents(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `agent-${index + 1}`,
    nama: `Agent ${index + 1}`,
    tim: "Tim Call",
    batch: "Batch A",
    batch_name: "Batch A",
    foto_url: null,
    jabatan: null,
    avgScore: 92,
    trend: "same" as const,
    trendValue: null,
    atRisk: false,
  }));
}

describe("Sidak agents load-more copy", () => {
  beforeEach(() => {
    useApiMock.mockReturnValue({
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the actual remaining batch count instead of a fixed 24", () => {
    useApiMock.mockReturnValue({
      data: {
        agents: makeAgents(30),
        batches: ["Batch A"],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SidakAgentsPage />);

    expect(
      screen.getByRole("button", { name: "Muat 6 Agent Lagi" }),
    ).toBeInTheDocument();
  });

  it("hides the load-more button when all agents are already visible", () => {
    useApiMock.mockReturnValue({
      data: {
        agents: makeAgents(24),
        batches: ["Batch A"],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<SidakAgentsPage />);

    expect(
      screen.queryByRole("button", { name: /Muat \d+ Agent Lagi/ }),
    ).not.toBeInTheDocument();
  });
});
