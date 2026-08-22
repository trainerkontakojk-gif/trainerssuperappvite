import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceQualityAssessment, TelefunTranscriptEntry } from "@trainers/types";
import type {
  KetikMonitoringReview,
  TelefunMonitoringReview,
} from "../lib/api";
import { HistoryTab } from "../routes/monitoring/components/HistoryTab";
import { ReviewDetailModal } from "../routes/monitoring/components/ReviewDetailModal";

const mocks = vi.hoisted(() => ({
  getReview: vi.fn(),
  unwrapResponse: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  aiClient: {
    "monitoring/history/:module/:id/review": { $get: mocks.getReview },
  },
  getErrorMessage: (_error: unknown, fallback: string) => fallback,
  unwrapResponse: mocks.unwrapResponse,
}));

vi.mock("../routes/telefun/components/VoiceRadarChart", () => ({
  VoiceRadarChart: () => <div>Profil diagram</div>,
}));
vi.mock("../routes/telefun/components/CommunicationProfileZoomModal", () => ({
  CommunicationProfileZoomModal: () => null,
}));
vi.mock("../routes/telefun/components/VoiceMetricCards", () => ({
  VoiceMetricCards: () => <div>Metrik suara lengkap</div>,
}));
vi.mock("../routes/telefun/components/TelefunTranscript", () => ({
  TelefunTranscript: () => <div>Transcript lengkap</div>,
}));
vi.mock("../routes/telefun/components/HoldAssessmentCard", () => ({
  HoldAssessmentCard: ({ assessment }: { assessment: { feedback: string } }) => (
    <div>Hold management: {assessment.feedback}</div>
  ),
}));
vi.mock("../lib/voiceAssessmentUtils", () => ({
  validateAssessment: () => ({
    overallScore: 8,
    speakingRate: { wordsPerMinute: 120, score: 8, verdict: "Baik", feedback: "Jelas" },
    intonation: { score: 7, verdict: "Baik", feedback: "Stabil" },
    articulation: { score: 9, verdict: "Baik", feedback: "Jelas" },
    fillerWords: { count: 1, examples: ["eee"], score: 8, verdict: "Baik", feedback: "Sedikit" },
    emotionalTone: { dominant: "Hangat", score: 8, verdict: "Baik", feedback: "Empatik" },
    transcript: "Halo",
    strengths: ["Mendengar aktif"],
    highlights: ["Menenangkan konsumen"],
    holdManagement: { feedback: "Dalam batas waktu" },
  }),
  getCommunicationProfileFromAssessment: () => ({
    overallSummary: "Ringkasan profil",
    improvementPriorities: ["Perjelas penutupan"],
    metrics: [],
  }),
}));

import { KetikReviewPanel } from "../routes/monitoring/components/KetikReviewPanel";
import { PdktEvaluationPanel } from "../routes/monitoring/components/PdktEvaluationPanel";
import { TelefunReviewPanel } from "../routes/monitoring/components/TelefunReviewPanel";
import type { UnifiedHistoryEntry } from "../routes/monitoring/utils/formatting";

const baseEntry = (module: UnifiedHistoryEntry["module"]): UnifiedHistoryEntry => ({
  id: `${module}-1`,
  user_id: "agent-1",
  module,
  scenario_title: "Skenario lengkap",
  created_at: "2026-07-30T09:00:00Z",
  duration_seconds: 0,
  score: 0,
  history: [],
  user_email: "agent@example.com",
  review_status: "completed",
});

const _ketikConsumerNameMustAcceptNull: NonNullable<
  KetikMonitoringReview["session"]
>["consumerName"] = null;

const _telefunAssessmentMustBeComplete: VoiceQualityAssessment & {
  overall_score: number;
  speaking_rate_wpm: number;
  intonation_score: number;
  articulation_score: number;
  filler_words_count: number;
  emotional_tone: string;
  highlights?: string[];
} = {
  overallScore: 0,
  speakingRate: {
    score: 0,
    verdict: "Baik",
    feedback: "",
    wordsPerMinute: 0,
  },
  intonation: { score: 0, verdict: "Baik", feedback: "" },
  articulation: { score: 0, verdict: "Baik", feedback: "" },
  fillerWords: { score: 0, verdict: "Baik", feedback: "", count: 0, examples: [] },
  emotionalTone: { score: 0, verdict: "Baik", feedback: "", dominant: "Netral" },
  transcript: "",
  strengths: [],
  highlights: [],
  holdManagement: {
    status: "not_used",
    score: null,
    verdict: "N/A",
    feedback: "",
    holdCount: 0,
    totalDurationMs: 0,
    longestDurationMs: 0,
    exceededCount: 0,
  },
  communicationProfile: null,
  overall_score: 0,
  speaking_rate_wpm: 0,
  intonation_score: 0,
  articulation_score: 0,
  filler_words_count: 0,
  emotional_tone: "Netral",
};

const _telefunTranscriptMustBeCanonical: TelefunTranscriptEntry[] =
  [] as TelefunMonitoringReview["transcript"];

describe("monitoring completeness regressions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.unwrapResponse.mockImplementation(async (value: unknown) => value);
  });

  it("renders real Telefun metrics, including zero, without fabricated metrics", () => {
    const entry: UnifiedHistoryEntry = {
      ...baseEntry("telefun"),
      telefun_assessment: _telefunAssessmentMustBeComplete,
    };
    render(<HistoryTab historyData={[entry]} loading={false} onViewDetail={vi.fn()} />);

    expect(screen.getByText("WPM")).toBeInTheDocument();
    expect(screen.getByText("Intonasi")).toBeInTheDocument();
    expect(screen.getByText("Artikulasi")).toBeInTheDocument();
    expect(screen.getByText("Filler")).toBeInTheDocument();
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText("Kepatuhan")).not.toBeInTheDocument();
    expect(screen.queryByText("Empati")).not.toBeInTheDocument();
    expect(screen.queryByText("Kejelasan")).not.toBeInTheDocument();
    expect(screen.queryByText("Solusi")).not.toBeInTheDocument();
  });

  it("renders the current PDKT session shape without dereferencing absent fields", async () => {
    mocks.getReview.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      module: "pdkt",
      review_status: "completed",
      session: null,
      emails: [{ type: "received", subject: "Bantuan", body: "Mohon bantuan" }],
      evaluation_error: null,
      time_taken: 0,
      evaluation: {
        score: 0,
        feedback: "Perlu perbaikan",
        typos: [],
        clarityIssues: [],
        contentGaps: [],
        scoreBreakdown: {
          recipientDirectionScore: 0,
          normativeResponseScore: 0,
          clarityScore: 0,
          typoScore: 0,
          templateComplianceScore: 0,
        },
      },
    });

    render(<PdktEvaluationPanel entryId="pdkt-1" />);

    await waitFor(() => expect(screen.getByText("Bantuan")).toBeInTheDocument());
    // Consumer metadata is rendered once by the modal header
    // (ReviewDetailModal), so the panel must not render a duplicate card.
    expect(screen.queryByText("Nama konsumen")).not.toBeInTheDocument();
    expect(screen.getByText("Arah Penerima")).toBeInTheDocument();
    expect(screen.queryByText("Lampiran")).not.toBeInTheDocument();
  });

  it("renders KETIK review content and no longer duplicates the consumer card inside the panel", async () => {
    mocks.getReview.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      module: "ketik",
      review_status: "completed",
      session: null,
      scores: { final: 0, empathy: 0, probing: 0, typo: 0, compliance: 0 },
      review: {
        id: "review-1",
        sessionId: "ketik-1",
        aiSummary: "Ringkasan lengkap",
        strengths: ["Sabar"],
        weaknesses: ["Perlu probing"],
        coachingFocus: ["Tanyakan kebutuhan"],
        createdAt: "2026-07-30T08:00:00Z",
      },
      typos: [],
    });

    render(<KetikReviewPanel entryId="ketik-1" />);

    await waitFor(() => expect(screen.getByText(/Ringkasan lengkap/)).toBeInTheDocument());
    // Consumer metadata is rendered once by the modal header
    // (ReviewDetailModal), so the panel must not render a duplicate card.
    expect(screen.queryByText("Nama konsumen")).not.toBeInTheDocument();
  });

  it("does not render a duplicate consumer card inside the panel when the name is null", async () => {
    mocks.getReview.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      module: "ketik",
      review_status: "completed",
      session: {
        consumerName: null,
        consumerPhone: "0812",
        consumerCity: "Bandung",
        simulationDuration: 0,
        messages: [],
      },
      scores: { final: 0, empathy: 0, probing: 0, typo: 0, compliance: 0 },
      review: {
        id: "review-1",
        sessionId: "ketik-1",
        aiSummary: "Ringkasan lengkap",
        strengths: ["Sabar"],
        weaknesses: ["Perlu probing"],
        coachingFocus: ["Tanyakan kebutuhan"],
        createdAt: "2026-07-30T08:00:00Z",
      },
      typos: [],
    });

    render(<KetikReviewPanel entryId="ketik-1" />);

    await waitFor(() => expect(screen.getByText(/Ringkasan lengkap/)).toBeInTheDocument());
    // Consumer card is rendered once by the modal header, not by the panel.
    expect(screen.queryByText("Nama konsumen")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("shows a restrained legacy notice for Telefun rows without fabricating assessment data", async () => {
    mocks.getReview.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      module: "telefun",
      review_status: "completed",
      telefun_legacy: true,
      score: 0,
      recording_path: null,
      agent_recording_path: null,
      recording_url: null,
      scenario_title: "Skenario Telefun",
      duration_seconds: 0,
      voice_assessment: null,
      transcript: [],
      ai_summary: null,
      strengths: null,
      weaknesses: null,
      coaching_focus: null,
      consumer_name: "Nina",
      consumer_phone: null,
      consumer_city: null,
      consumer_gender: null,
      persona_config: null,
      coaching_recommendations: [],
      coaching_generated_at: null,
    });

    render(<TelefunReviewPanel entryId="telefun-1" />);

    await waitFor(() => expect(screen.getByText(/Riwayat Telefun lama/i)).toBeInTheDocument());
    expect(screen.getByText(/Penilaian dan coaching mungkin tidak tersedia/i)).toBeInTheDocument();
    expect(screen.queryByText("Profil diagram")).not.toBeInTheDocument();
  });


  it("shows an explicit unavailable state when canonical coaching recommendations are empty", async () => {
    mocks.getReview.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      module: "telefun",
      review_status: "completed",
      score: 0,
      recording_path: null,
      agent_recording_path: null,
      recording_url: null,
      scenario_title: "Skenario Telefun",
      duration_seconds: 0,
      voice_assessment: {},
      transcript: [],
      ai_summary: null,
      strengths: null,
      weaknesses: null,
      coaching_focus: null,
      consumer_name: "Nina",
      consumer_phone: null,
      consumer_city: null,
      consumer_gender: null,
      persona_config: null,
      coaching_recommendations: [],
      coaching_generated_at: null,
    });

    render(<TelefunReviewPanel entryId="telefun-1" />);

    await waitFor(() => expect(screen.getByText("Rekomendasi Coaching")).toBeInTheDocument());
    expect(screen.getByText("Rekomendasi coaching belum tersedia.")).toBeInTheDocument();
  });

  it("focuses the close control, closes on Escape, and restores prior focus when the modal unmounts", async () => {
    const user = userEvent.setup();
    mocks.getReview.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      module: "telefun",
      review_status: "completed",
      score: 0,
      recording_path: null,
      agent_recording_path: null,
      recording_url: null,
      scenario_title: "Skenario Telefun",
      duration_seconds: 0,
      voice_assessment: null,
      transcript: [],
      ai_summary: null,
      strengths: null,
      weaknesses: null,
      coaching_focus: null,
      consumer_name: "Nina",
      consumer_phone: null,
      consumer_city: null,
      consumer_gender: null,
      persona_config: null,
      coaching_recommendations: [],
      coaching_generated_at: null,
    });

    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Pemicu luar
          </button>
          {open && (
            <ReviewDetailModal
              entry={{
                ...baseEntry("telefun"),
                id: "telefun-modal",
                scenario_title: "Skenario Telefun",
                history: [],
              }}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      );
    }

    render(<Harness />);

    const outerTrigger = screen.getByRole("button", { name: "Pemicu luar" });
    outerTrigger.focus();
    await user.click(outerTrigger);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Tutup detail monitoring" })[0]).toHaveFocus();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(outerTrigger).toHaveFocus();
  });

  it("keeps tab focus trapped inside the modal", async () => {
    const user = userEvent.setup();
    mocks.getReview.mockResolvedValue({});
    mocks.unwrapResponse.mockResolvedValue({
      module: "telefun",
      review_status: "completed",
      score: 0,
      recording_path: null,
      agent_recording_path: null,
      recording_url: null,
      scenario_title: "Skenario Telefun",
      duration_seconds: 0,
      voice_assessment: null,
      transcript: [],
      ai_summary: null,
      strengths: null,
      weaknesses: null,
      coaching_focus: null,
      consumer_name: "Nina",
      consumer_phone: null,
      consumer_city: null,
      consumer_gender: null,
      persona_config: null,
      coaching_recommendations: [],
      coaching_generated_at: null,
    });

    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Pemicu luar
          </button>
          {open && (
            <ReviewDetailModal
              entry={{
                ...baseEntry("telefun"),
                id: "telefun-modal",
                scenario_title: "Skenario Telefun",
                history: [],
              }}
              onClose={() => setOpen(false)}
            />
          )}
        </div>
      );
    }

    render(<Harness />);

    const outerTrigger = screen.getByRole("button", { name: "Pemicu luar" });
    await user.click(outerTrigger);

    const closeButtons = await waitFor(() =>
      screen.getAllByRole("button", { name: "Tutup detail monitoring" }),
    );

    expect(closeButtons[0]).toHaveFocus();
    await user.tab();
    expect(closeButtons[1]).toHaveFocus();
    await user.tab();
    expect(closeButtons[0]).toHaveFocus();
    await user.tab({ shift: true });
    expect(closeButtons[1]).toHaveFocus();
    expect(outerTrigger).not.toHaveFocus();
  });
});
