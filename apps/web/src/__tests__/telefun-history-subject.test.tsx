import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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

  it("shows the unavailable participant marker in the history list and CSV", async () => {
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

  it("keeps review primary and secondary actions out of the row surface", () => {
    render(
      <HistoryModal
        isOpen
        onClose={vi.fn()}
        history={[unavailableRecord]}
        onDeleteSession={vi.fn()}
        onClearHistory={vi.fn()}
        onReviewSession={vi.fn()}
      />,
    );

    const reviewButton = screen.getByRole("button", {
      name: "Lihat detail Skenario Telefun",
    });
    expect(reviewButton).toBeDefined();
    expect(reviewButton).toHaveClass("min-h-[44px]");
    const moreButton = screen.getByRole("button", {
      name: "Aksi lainnya untuk Skenario Telefun",
    });
    expect(moreButton).toBeDefined();
    expect(moreButton).toHaveClass("min-h-[44px]");
    expect(screen.queryByRole("button", { name: /Unduh rekaman/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Hapus Skenario Telefun/ }),
    ).toBeNull();
    expect(
      screen.getByText("Target: Andi (record peserta tidak lagi tersedia)"),
    ).toBeDefined();
  });

  it("keeps secondary menu actions at the minimum touch target", () => {
    render(
      <HistoryModal
        isOpen
        onClose={vi.fn()}
        history={[unavailableRecord]}
        onDeleteSession={vi.fn()}
        onClearHistory={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Aksi lainnya untuk Skenario Telefun",
      }),
    );

    expect(screen.getByRole("menu").parentElement).toHaveClass("z-[210]");
    expect(screen.getByRole("menuitem", { name: "Unduh rekaman" })).toHaveClass(
      "min-h-[44px]",
    );
    expect(screen.getByRole("menuitem", { name: "Hapus riwayat" })).toHaveClass(
      "min-h-[44px]",
    );
  });

  it("keeps download and delete available from the secondary menu", async () => {
    const onDeleteSession = vi.fn().mockResolvedValue(undefined);

    render(
      <HistoryModal
        isOpen
        onClose={vi.fn()}
        history={[unavailableRecord]}
        onDeleteSession={onDeleteSession}
        onClearHistory={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Aksi lainnya untuk Skenario Telefun",
      }),
    );
    expect(
      screen.getByRole("menuitem", { name: "Unduh rekaman" }),
    ).toBeDefined();
    fireEvent.click(screen.getByRole("menuitem", { name: "Hapus riwayat" }));

    await waitFor(() => {
      expect(onDeleteSession).toHaveBeenCalledWith("telefun-history-1");
    });
  });
});
