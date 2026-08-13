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
});
