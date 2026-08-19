import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRecording: vi.fn(),
  unwrapResponse: vi.fn(),
  useApi: vi.fn(),
}));

vi.mock("../hooks/useApi", () => ({
  useApi: (path: string | null) => {
    mocks.useApi(path);
    return {
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

vi.mock("../lib/api", () => ({
  telefunClient: {
    recording: { ":id": { $get: mocks.getRecording } },
    annotations: {
      ":id": { $post: vi.fn() },
      ":annotationId": { $delete: vi.fn() },
    },
  },
  unwrapResponse: mocks.unwrapResponse,
}));

import { ReviewModal } from "../routes/telefun/components/ReviewModal";

const baseRecord = {
  id: "session-1",
  date: "2026-06-22T00:00:00.000Z",
  url: "blob:stale-local",
  consumerName: "Konsumen",
  scenarioTitle: "Skenario",
  duration: 120,
};

describe("ReviewModal recording source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRecording.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      url: "https://storage.example/signed.webm",
    });
  });

  it("prefers a persistent signed URL over a stale blob URL", async () => {
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{
          ...baseRecord,
          recordingPath: "user/session/full_call.seekable.webm",
        }}
      />,
    );

    await waitFor(() => expect(mocks.getRecording).toHaveBeenCalledTimes(1));
  });

  it("keeps the local blob fallback when no persistent path exists", async () => {
    render(<ReviewModal isOpen onClose={vi.fn()} record={baseRecord} />);

    await waitFor(() => expect(mocks.getRecording).not.toHaveBeenCalled());
  });

  it("renders projected feedback for a terminal OpenAI WebRTC history record", () => {
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{
          ...baseRecord,
          telefunTransport: "openai-webrtc",
          feedback: "Tempo stabil.\n\nArtikulasi jelas.",
        }}
      />,
    );

    expect(screen.getByText("Feedback")).toBeDefined();
    expect(screen.getByText(/Tempo stabil/)).toBeDefined();
  });

  it("loads replay data only after the replay tab is opened", async () => {
    render(<ReviewModal isOpen onClose={vi.fn()} record={baseRecord} />);

    expect(mocks.useApi).toHaveBeenCalledWith(null);
    expect(mocks.useApi).not.toHaveBeenCalledWith(
      "/telefun/coaching-summary/session-1",
    );
    expect(mocks.useApi).not.toHaveBeenCalledWith(
      "/telefun/annotations/session-1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Anotasi Replay" }));

    await waitFor(() => {
      expect(mocks.useApi).toHaveBeenCalledWith(
        "/telefun/coaching-summary/session-1",
      );
      expect(mocks.useApi).toHaveBeenCalledWith(
        "/telefun/annotations/session-1",
      );
    });
  });

  it("shows truthful waiting text instead of a fabricated score for a pending session", () => {
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{ ...baseRecord, scoringStatus: "pending" }}
      />,
    );

    expect(screen.getByText("Menunggu analisis")).toBeDefined();
    expect(screen.queryByText("0/10")).toBeNull();
  });

  it("shows processing text for a session being analyzed", () => {
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{ ...baseRecord, scoringStatus: "processing" }}
      />,
    );

    expect(screen.getByText("Sedang dianalisis")).toBeDefined();
    expect(screen.queryByText("0/10")).toBeNull();
  });

  it("shows a scheduled retry for a retryable failure instead of claiming final failure", () => {
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{
          ...baseRecord,
          scoringStatus: "failed",
          scoringRetryable: true,
        }}
      />,
    );

    expect(
      screen.getByText("Analisis gagal, akan dicoba lagi otomatis"),
    ).toBeDefined();
  });

  it("shows final failure text for a permanent failure", () => {
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{
          ...baseRecord,
          scoringStatus: "failed",
          scoringRetryable: false,
        }}
      />,
    );

    expect(screen.getByText("Analisis gagal, coba lagi")).toBeDefined();
    expect(screen.queryByText("0/10")).toBeNull();
  });

  it("renders the score only when the session is actually scored", () => {
    const first = render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{ ...baseRecord, scoringStatus: "completed", score: 8 }}
      />,
    );
    expect(screen.getByText("8/10")).toBeDefined();
    first.unmount();

    render(
      <ReviewModal isOpen onClose={vi.fn()} record={{ ...baseRecord, score: 8 }} />,
    );
    expect(screen.getByText("8/10")).toBeDefined();
  });

  it("requests one authoritative refresh when an unscored session opens", () => {
    const onRequestScoringRefresh = vi.fn();
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{ ...baseRecord, scoringStatus: "pending" }}
        onRequestScoringRefresh={onRequestScoringRefresh}
      />,
    );

    expect(onRequestScoringRefresh).toHaveBeenCalledTimes(1);
    expect(onRequestScoringRefresh).toHaveBeenCalledWith("session-1");
  });

  it("does not request a refresh for an already scored session", () => {
    const onRequestScoringRefresh = vi.fn();
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{ ...baseRecord, scoringStatus: "completed", score: 8 }}
        onRequestScoringRefresh={onRequestScoringRefresh}
      />,
    );

    expect(onRequestScoringRefresh).not.toHaveBeenCalled();
  });

  it("shows the truthful waiting state in the assessment tab for a pending session", async () => {
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{ ...baseRecord, scoringStatus: "pending" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Kualitas Suara Agen" }));
    expect(await screen.findByText("Menunggu Antrian Analisis")).toBeDefined();
    expect(screen.queryByText("0/10")).toBeNull();
  });

  it("shows the failure state with a retry action in the assessment tab for a failed session", async () => {
    render(
      <ReviewModal
        isOpen
        onClose={vi.fn()}
        record={{
          ...baseRecord,
          scoringStatus: "failed",
          scoringRetryable: false,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Kualitas Suara Agen" }));
    expect(await screen.findByText("Analisis Gagal")).toBeDefined();
    expect(screen.getByRole("button", { name: "Coba Lagi" })).toBeDefined();
  });
});
