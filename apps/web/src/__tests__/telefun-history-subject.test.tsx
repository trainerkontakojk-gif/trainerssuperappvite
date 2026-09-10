import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  telefunClient: {
    recording: { ":id": { $get: vi.fn() } },
  },
  unwrapResponse: vi.fn(),
}));

vi.mock("../lib/toast", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

import { HistoryModal } from "../routes/telefun/components/HistoryModal";

const unavailableRecord = {
  id: "telefun-history-1",
  date: "2026-09-10T00:00:00.000Z",
  url: "blob:telefun",
  consumerName: "Andi",
  scenarioTitle: "Skenario Telefun",
  duration: 120,
  userEmail: "trainer@example.com",
  simulationSubject: {
    type: "participant" as const,
    participantId: null,
    displayName: "Andi",
    batchName: "Batch 12",
    team: "Tim Alpha",
  },
};

describe("Telefun history subject projection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows the unavailable participant marker in the history card and CSV", async () => {
    let capturedBlob: Blob | undefined;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return "blob:telefun-history";
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );

    render(
      <HistoryModal
        isOpen
        onClose={vi.fn()}
        history={[unavailableRecord]}
        onDeleteSession={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/record peserta tidak lagi tersedia/),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Ekspor riwayat panggilan ke CSV" }),
    );
    expect(capturedBlob).toBeDefined();
    expect(await capturedBlob!.text()).toContain(
      "Andi — Batch 12 — Tim Alpha (record peserta tidak lagi tersedia)",
    );
  });
});
