import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryModal } from "../routes/pdkt/components/HistoryModal";

describe("PDKT history subject projection", () => {
  it("marks a participant whose live record is no longer available", () => {
    render(
      <HistoryModal
        isOpen
        onClose={vi.fn()}
        onSelectSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onClearHistory={vi.fn()}
        history={[
          {
            id: "pdkt-history-1",
            timestamp: "2026-09-10T00:00:00.000Z",
            config: { scenarios: [], consumerType: {} as any },
            emails: [],
            evaluation: null,
            evaluationStatus: "not_started",
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

    expect(screen.getByText(/Target: Andi/)).toBeDefined();
    expect(
      screen.getByText(/record peserta tidak lagi tersedia/),
    ).toBeDefined();
  });
});
