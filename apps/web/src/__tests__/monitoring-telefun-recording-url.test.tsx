import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getReview: vi.fn(),
  unwrapResponse: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  aiClient: {
    "monitoring/history/:module/:id/review": {
      $get: mocks.getReview,
    },
  },
  getErrorMessage: (_err: unknown, fallback: string) => fallback,
  unwrapResponse: mocks.unwrapResponse,
}));

vi.mock("../routes/telefun/components/VoiceRadarChart", () => ({
  VoiceRadarChart: () => <div data-testid="voice-radar-chart" />,
}));

vi.mock("../routes/telefun/components/CommunicationProfileZoomModal", () => ({
  CommunicationProfileZoomModal: () => null,
}));

vi.mock("../routes/telefun/components/VoiceMetricCards", () => ({
  VoiceMetricCards: () => <div data-testid="voice-metric-cards" />,
}));

vi.mock("../routes/telefun/components/TelefunTranscript", () => ({
  TelefunTranscript: () => <div data-testid="telefun-transcript" />,
}));

import { TelefunReviewPanel } from "../routes/monitoring/components/TelefunReviewPanel";

describe("TelefunReviewPanel recording URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getReview.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      module: "telefun",
      review_status: "completed",
      score: 7,
      recording_path: "owner/session/full_call.webm",
      recording_url: "https://storage.example/signed-full-call.webm",
      scenario_title: "Skenario Telefun",
      duration_seconds: 61,
      voice_assessment: null,
      transcript: [],
      ai_summary: null,
      strengths: null,
      weaknesses: null,
      coaching_focus: null,
    });
  });

  it("uses the signed recording URL instead of the private storage path", async () => {
    render(<TelefunReviewPanel entryId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText("Skenario Telefun")).toBeInTheDocument();
    });

    const audio = document.querySelector("audio");
    expect(audio).not.toBeNull();
    expect(audio?.getAttribute("src")).toBe(
      "https://storage.example/signed-full-call.webm",
    );
  });
});
