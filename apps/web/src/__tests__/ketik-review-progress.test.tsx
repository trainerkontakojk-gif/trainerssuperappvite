import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionReviewModal } from "../routes/ketik/components/SessionReviewModal";
import type {
  KetikSessionHistoryItem,
  KetikSessionReview,
  KetikTypoFinding,
} from "@trainers/types";

const mockSession: KetikSessionHistoryItem = {
  id: "sess1",
  date: new Date().toISOString(),
  scenarioTitle: "Test Scenario",
  consumerName: "Test Consumer",
  messages: [],
  reviewStatus: "pending",
};

const mockReview: KetikSessionReview = {
  id: "r1",
  sessionId: "sess1",
  aiSummary: "Good performance overall.",
  strengths: ["Good empathy"],
  weaknesses: ["Needs more probing"],
  coachingFocus: ["Practice probing techniques"],
  createdAt: new Date().toISOString(),
};

const mockTypos: KetikTypoFinding[] = [
  {
    id: "t1",
    sessionId: "sess1",
    messageId: "m1",
    originalWord: "recieve",
    correctedWord: "receive",
    severity: "minor",
  },
];

function renderModal(
  overrides: {
    session?: KetikSessionHistoryItem;
    review?: KetikSessionReview;
    typos?: KetikTypoFinding[];
    progress?: { status: string; percent: number; etaSeconds: number };
    canStartReview?: boolean;
  } = {},
) {
  const p = overrides.progress || { status: "idle", percent: 0, etaSeconds: 0 };
  return render(
    <SessionReviewModal
      isOpen={true}
      onClose={vi.fn()}
      session={overrides.session || mockSession}
      review={overrides.review}
      typos={overrides.typos || []}
      onReplay={vi.fn()}
      onStartReview={vi.fn()}
      progress={p as any}
      canStartReview={overrides.canStartReview ?? true}
    />,
  );
}

describe("SessionReviewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Progress Bar Visibility", () => {
    it("shows progress bar when processing", () => {
      renderModal({
        progress: { status: "processing", percent: 45, etaSeconds: 20 },
      });

      expect(screen.getByText("45%")).toBeDefined();
      expect(screen.getByText("Estimasi: ~20 detik lagi")).toBeDefined();
    });

    it("shows 'Memulai analisis...' with 0% when starting", () => {
      renderModal({
        progress: { status: "starting", percent: 0, etaSeconds: 35 },
      });

      expect(screen.getByText("0%")).toBeDefined();
      expect(screen.getByText("Memulai analisis...")).toBeDefined();
    });

    it("shows delayed message when progress status is delayed", () => {
      renderModal({
        progress: { status: "delayed", percent: 92, etaSeconds: 60 },
      });

      expect(
        screen.getByText(/Proses ini memakan waktu lebih lama dari biasanya/),
      ).toBeDefined();
    });

    it("shows 'Memuat hasil...' when loading-result", () => {
      renderModal({
        progress: { status: "loading-result", percent: 92, etaSeconds: 3 },
      });

      expect(screen.getByText("Memuat hasil...")).toBeDefined();
    });

    it("does not show progress bar when idle", () => {
      renderModal({
        progress: { status: "idle", percent: 0, etaSeconds: 0 },
      });

      expect(screen.queryByText("0%")).toBeNull();
    });
  });

  describe("Score Display", () => {
    it("displays non-zero scores when session has scores", () => {
      const sessionWithScores: KetikSessionHistoryItem = {
        ...mockSession,
        finalScore: 85,
        empathyScore: 80,
        probingScore: 75,
        resolutionScore: 78,
        typoScore: 90,
        complianceScore: 85,
        reviewStatus: "completed",
      };

      renderModal({
        session: sessionWithScores,
        review: mockReview,
        typos: mockTypos,
      });

      expect(screen.getByText("80")).toBeDefined();
      expect(screen.getByText("75")).toBeDefined();
      expect(screen.getByText("78")).toBeDefined();
      expect(screen.getAllByText("Resolusi").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("90")).toBeDefined();
      expect(screen.getAllByText("85").length).toBe(2); // compliance card + final score
    });

    it("displays 0 when session has no scores", () => {
      renderModal({
        review: mockReview,
        typos: mockTypos,
      });

      expect(
        screen.getAllByText("Empati & Komunikasi").length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.queryAllByText("Resolusi")).toHaveLength(0);
      expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(4);
    });

    it("displays final score banner with correct value", () => {
      const sessionWithScores: KetikSessionHistoryItem = {
        ...mockSession,
        finalScore: 85,
        empathyScore: 80,
        probingScore: 75,
        resolutionScore: 78,
        typoScore: 90,
        complianceScore: 85,
        reviewStatus: "completed",
      };

      renderModal({
        session: sessionWithScores,
        review: mockReview,
      });

      const scoreElements = screen.getAllByText("85");
      expect(scoreElements.length).toBe(2); // compliance card + final score
      expect(screen.getByText("Skor Akhir")).toBeDefined();
    });
  });

  describe("Status Text Transitions", () => {
    it("shows 'Memulai analisis...' when starting", () => {
      renderModal({
        progress: { status: "starting", percent: 0, etaSeconds: 35 },
      });
      expect(screen.getByText("Memulai analisis...")).toBeDefined();
    });

    it("shows 'Menganalisis pesan...' when percent < 30", () => {
      renderModal({
        progress: { status: "processing", percent: 15, etaSeconds: 25 },
      });
      expect(screen.getByText("Menganalisis pesan...")).toBeDefined();
    });

    it("shows 'Menilai performa...' when percent 30-60", () => {
      renderModal({
        progress: { status: "processing", percent: 45, etaSeconds: 15 },
      });
      expect(screen.getByText("Menilai performa...")).toBeDefined();
    });

    it("shows 'Menyusun ringkasan...' when percent >= 60", () => {
      renderModal({
        progress: { status: "processing", percent: 65, etaSeconds: 10 },
      });
      expect(screen.getByText("Menyusun ringkasan...")).toBeDefined();
    });

    it("shows 'Sedikit lagi...' when delayed", () => {
      renderModal({
        progress: { status: "delayed", percent: 92, etaSeconds: 60 },
      });
      expect(screen.getByText("Sedikit lagi...")).toBeDefined();
    });
  });

  describe("Action Button", () => {
    it("shows 'Mulai Analisis' when idle", () => {
      renderModal();
      expect(screen.getByText("Mulai Analisis")).toBeDefined();
    });

    it("shows 'Jalankan Ulang Analisis' when reviewStatus is failed", () => {
      const failedSession = { ...mockSession, reviewStatus: "failed" as const };
      renderModal({ session: failedSession });
      expect(screen.getByText("Jalankan Ulang Analisis")).toBeDefined();
    });

    it("shows 'Tidak Memiliki Akses' when canStartReview is false", () => {
      renderModal({ canStartReview: false });
      expect(screen.getByText("Tidak Memiliki Akses")).toBeDefined();
    });

    it("disables button when processing", () => {
      renderModal({
        progress: { status: "processing", percent: 50, etaSeconds: 15 },
      });
      const buttons = screen.getAllByRole("button");
      const processingBtn = buttons.find((b) =>
        b.textContent?.includes("Menilai performa"),
      );
      expect(processingBtn).toBeDefined();
      expect(processingBtn!.hasAttribute("disabled")).toBe(true);
    });
  });
});
