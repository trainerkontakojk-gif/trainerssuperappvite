import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const getList = vi.hoisted(() => vi.fn());
const getDetail = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  sidakClient: {
    "agents/:id/simulations": { $get: getList },
    "agents/:id/simulations/:module/:historyId": { $get: getDetail },
  },
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  unwrapResponse: async (response: unknown) => response,
}));

vi.mock("../routes/monitoring/components/ReviewDetailModal", () => ({
  ReviewDetailModal: (props: any) => (
    <div data-testid="sidak-review-modal">
      {props.reviewLoading ? "detail-loading" : props.reviewData?.module ?? "detail-ready"}
    </div>
  ),
}));

import SidakSimulationHistory from "../components/sidak/SidakSimulationHistory";

const agentId = "123e4567-e89b-12d3-a456-426614174000";
const baseItem = {
  id: "123e4567-e89b-12d3-a456-426614174001",
  module: "ketik" as const,
  scenarioTitle: "Chat Tagihan",
  occurredAt: "2026-09-10T10:00:00.000Z",
  durationSeconds: 0,
  score: 0,
  scoreScale: 100 as const,
  reviewStatus: "completed" as const,
  simulationSubject: {
    type: "participant" as const,
    participantId: agentId,
    displayName: "Andi",
    batchName: "Batch 1",
    team: "Tim A",
  },
  actor: { userId: "actor-1", email: "trainer@example.com", role: "trainer" },
};

describe("SidakSimulationHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getList.mockResolvedValue({ items: [baseItem], nextCursor: null });
    getDetail.mockResolvedValue({ module: "ketik" });
  });

  it("shows zero as a score, keeps the filter independent, and opens SIDAK detail", async () => {
    render(<SidakSimulationHistory agentId={agentId} />);

    expect(await screen.findByText("0 / 100")).toBeTruthy();
    expect(getList).toHaveBeenCalledWith(expect.objectContaining({
      param: { id: agentId },
      query: { module: "all" },
      signal: expect.any(AbortSignal),
    }));

    fireEvent.click(screen.getByRole("tab", { name: "KETIK" }));
    await waitFor(() => {
      expect(getList).toHaveBeenLastCalledWith(expect.objectContaining({
        param: { id: agentId },
        query: { module: "ketik" },
        signal: expect.any(AbortSignal),
      }));
    });

    fireEvent.click(screen.getByRole("button", { name: /Buka detail KETIK/ }));
    await waitFor(() => expect(getDetail).toHaveBeenCalled());
    expect(await screen.findByTestId("sidak-review-modal")).toHaveTextContent(
      "ketik",
    );
  });

  it("does not render a late response for the previous agent", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    let resolveSecond: ((value: unknown) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    getList
      .mockImplementationOnce(
        (args: { signal?: AbortSignal }) => new Promise((resolve) => {
          firstSignal = args.signal;
          resolveFirst = resolve;
        }),
      )
      .mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const { rerender } = render(<SidakSimulationHistory agentId={agentId} />);
    const nextAgentId = "123e4567-e89b-12d3-a456-426614174002";
    rerender(<SidakSimulationHistory agentId={nextAgentId} />);

    expect(firstSignal?.aborted).toBe(true);
    resolveFirst?.({ items: [{ ...baseItem, scenarioTitle: "Agent lama" }], nextCursor: null });
    resolveSecond?.({ items: [{ ...baseItem, scenarioTitle: "Agent baru" }], nextCursor: null });

    expect(await screen.findByText("Agent baru")).toBeTruthy();
    expect(screen.queryByText("Agent lama")).toBeNull();
  });
});
