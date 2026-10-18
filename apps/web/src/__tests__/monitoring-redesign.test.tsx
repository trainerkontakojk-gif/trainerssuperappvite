import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { parseVoiceQualityAssessment } from "@trainers/types";
import { PdktEvaluationPanel } from "../routes/monitoring/components/PdktEvaluationPanel";

const mockPdktReviewResponse = vi.hoisted(() => vi.fn());

vi.mock("../lib/api", () => ({
  aiClient: {
    "monitoring/history/:module/:id/review": {
      $get: mockPdktReviewResponse,
    },
    "monitoring/history/:module/:id": {
      $delete: vi.fn(),
    },
  },
  getErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
  unwrapResponse: async (response: unknown) => response,
}));

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

const telefunAssessment = parseVoiceQualityAssessment({
  overallScore: 7.5,
  speakingRate: {
    score: 7.5,
    wordsPerMinute: 142,
    verdict: "Baik",
    feedback: "Artikulasi jelas",
  },
  intonation: { score: 7, verdict: "Baik", feedback: "Stabil" },
  articulation: { score: 8, verdict: "Baik", feedback: "Artikulasi jelas" },
  fillerWords: {
    score: 8,
    count: 3,
    examples: [],
    verdict: "Baik",
    feedback: "Sedikit",
  },
  emotionalTone: {
    score: 8,
    dominant: "Empati",
    verdict: "Baik",
    feedback: "Empatik",
  },
  transcript: "",
  strengths: ["Artikulasi jelas"],
  highlights: ["De-eskalasi berhasil"],
});

if (!telefunAssessment) {
  throw new Error("Invalid canonical Telefun assessment fixture");
}

describe("PdktEvaluationPanel — score breakdown", () => {
  beforeEach(() => {
    mockPdktReviewResponse.mockReset();
  });

  it("renders optional expected-answer alignment to reviewers", async () => {
    mockPdktReviewResponse.mockResolvedValueOnce({
      module: "pdkt",
      review_status: "completed",
      evaluation_error: null,
      time_taken: 90,
      emails: [],
      evaluation: {
        score: 88,
        feedback: "Arah penerima sudah tepat.",
        typos: [],
        clarityIssues: [],
        contentGaps: [],
        expectedAnswerAlignment: {
          category: "Sesuai",
          reason: "Inti tindakan dan informasi yang diminta sudah disampaikan.",
        },
      },
    });

    render(<PdktEvaluationPanel entryId="pdkt-1" />);

    expect(await screen.findByText("Sesuai")).toBeTruthy();
    expect(
      screen.getByText("Inti tindakan dan informasi yang diminta sudah disampaikan."),
    ).toBeTruthy();
  });

  it("renders PDKT score breakdown when available", async () => {
    mockPdktReviewResponse.mockResolvedValueOnce({
      module: "pdkt",
      review_status: "completed",
      evaluation_error: null,
      time_taken: 90,
      emails: [],
      evaluation: {
        score: 88,
        feedback: "Arah penerima sudah tepat.",
        typos: [],
        clarityIssues: [],
        contentGaps: [],
        scoreBreakdown: {
          recipientDirectionScore: 92,
          normativeResponseScore: 87,
          clarityScore: 90,
          typoScore: 100,
          templateComplianceScore: 70,
        },
      },
    });

    render(<PdktEvaluationPanel entryId="pdkt-1" />);

    await waitFor(() => {
      expect(screen.getByText("Arah Penerima")).toBeTruthy();
    });
    expect(screen.getByText("Kualitas OJK")).toBeTruthy();
    expect(screen.getByText("Template")).toBeTruthy();
    expect(screen.getByText("92")).toBeTruthy();
  });
});

// ─── HistoryTab KPI Tests ──────────────────────────────────────────────────────
