import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryModal } from "../routes/ketik/components/HistoryModal";

describe("KETIK history subject projection", () => {
  it("shows the target and unavailable participant marker on a history card", () => {
    render(
      <HistoryModal
        isOpen
        onClose={vi.fn()}
        onClear={vi.fn()}
        onDelete={vi.fn()}
        onReview={vi.fn()}
        history={[
          {
            id: "ketik-history-1",
            date: "2026-09-10T00:00:00.000Z",
            scenarioTitle: "Skenario Chat",
            consumerName: "Andi",
            messages: [],
            simulationSubject: {
              type: "participant",
              participantId: null,
              displayName: "Andi",
              batchName: "Batch 12",
              team: "Tim Alpha",
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/Target: Peserta: Andi/)).toBeDefined();
    expect(
      screen.getByText(/record peserta tidak lagi tersedia/),
    ).toBeDefined();
  });
});
