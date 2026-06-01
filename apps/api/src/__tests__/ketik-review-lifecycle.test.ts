import { describe, expect, it } from "vitest";
import { resolveKetikReviewState } from "../services/ketik/review-state";

describe("resolveKetikReviewState", () => {
  it("keeps pending history non-terminal when no review job exists", () => {
    const decision = resolveKetikReviewState({
      historyStatus: "pending",
      job: null,
      hasReviewRow: null,
      nowMs: Date.parse("2026-06-01T00:00:00Z"),
    });

    expect(decision).toMatchObject({
      status: "pending",
      resultReady: false,
      shouldMarkHistoryFailed: false,
      shouldMarkJobFailed: false,
    });
    expect(decision.errorMessage).toBeUndefined();
  });

  it("keeps processing history non-terminal when polling races before job row is visible", () => {
    const decision = resolveKetikReviewState({
      historyStatus: "processing",
      job: null,
      hasReviewRow: null,
      nowMs: Date.parse("2026-06-01T00:00:00Z"),
    });

    expect(decision.status).toBe("processing");
    expect(decision.shouldMarkHistoryFailed).toBe(false);
    expect(decision.errorMessage).toBeUndefined();
  });

  it("still fails completed history when the review row is missing", () => {
    const decision = resolveKetikReviewState({
      historyStatus: "completed",
      job: { status: "completed" },
      hasReviewRow: false,
      nowMs: Date.parse("2026-06-01T00:00:00Z"),
    });

    expect(decision).toMatchObject({
      status: "failed",
      resultReady: false,
      shouldMarkHistoryFailed: true,
      shouldMarkJobFailed: true,
      errorMessage: "Hasil analisis tidak ditemukan. Silakan jalankan ulang.",
    });
  });
});
