import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockStorageDownload = vi.fn();

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({
        download: mockStorageDownload,
      })),
    },
  })),
}));

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn(),
}));

vi.mock("../lib/telefun-hold-assessment", () => ({
  normalizeTelefunHoldMetrics: vi.fn(() => ({
    count: 0,
    totalDurationMs: 0,
    longestDurationMs: 0,
    exceededCount: 0,
    intervals: [],
  })),
  evaluateTelefunHoldAssessment: vi.fn(() => ({
    status: "not_used" as const,
    score: 10,
    verdict: "Sempurna",
    feedback: "Hold tidak digunakan.",
    holdCount: 0,
    totalDurationMs: 0,
    longestDurationMs: 0,
    exceededCount: 0,
  })),
  applyHoldAssessmentToOverallScore: vi.fn((score: number) => score),
}));

import { processNextBatch } from "../workers/telefun-scoring-worker";
import * as scoringService from "../services/telefun-scoring-service";

describe("Telefun scoring worker integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("claims and processes pending jobs from fetchPendingJobs", async () => {
    // Mock fetchPendingJobs to return one job
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([{ sessionId: "s1", userId: "u1" }]);

    // Mock claimJob to succeed
    const claimSpy = vi.spyOn(scoringService, "claimJob");
    claimSpy.mockResolvedValue({ claimed: true });

    // Mock checkCachedAssessment to return null (no cache)
    const cacheSpy = vi.spyOn(scoringService, "checkCachedAssessment");
    cacheSpy.mockResolvedValue(null);

    // Mock processScoringJob to succeed
    const processSpy = vi.spyOn(scoringService, "processScoringJob");
    processSpy.mockResolvedValue({ success: true, status: "completed" });

    const stats = await processNextBatch();

    expect(stats.processed).toBe(1);
    expect(stats.completed).toBe(1);
    expect(claimSpy).toHaveBeenCalledWith("s1");
    expect(processSpy).toHaveBeenCalledWith({ sessionId: "s1", userId: "u1" });
  });

  it("skips jobs that are already completed (claim returns false)", async () => {
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([{ sessionId: "s1", userId: "u1" }]);

    const claimSpy = vi.spyOn(scoringService, "claimJob");
    claimSpy.mockResolvedValue({
      claimed: false,
      session: { scoring_status: "completed" },
    });

    const processSpy = vi.spyOn(scoringService, "processScoringJob");
    processSpy.mockResolvedValue({ success: true, status: "completed" });

    const stats = await processNextBatch();

    expect(stats.completed).toBe(1);
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("skips jobs already claimed by another worker", async () => {
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([{ sessionId: "s1", userId: "u1" }]);

    const claimSpy = vi.spyOn(scoringService, "claimJob");
    claimSpy.mockResolvedValue({
      claimed: false,
      session: { scoring_status: "processing" },
    });

    const processSpy = vi.spyOn(scoringService, "processScoringJob");

    const stats = await processNextBatch();

    expect(stats.processed).toBe(0);
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("uses cached assessment when available (no AI call)", async () => {
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([{ sessionId: "s1", userId: "u1" }]);

    const claimSpy = vi.spyOn(scoringService, "claimJob");
    claimSpy.mockResolvedValue({ claimed: true });

    const cacheSpy = vi.spyOn(scoringService, "checkCachedAssessment");
    cacheSpy.mockResolvedValue({
      overallScore: 8,
      speakingRate: { score: 7, wordsPerMinute: 130, verdict: "Baik", feedback: "Ok" },
      intonation: { score: 8, verdict: "Baik", feedback: "Ok" },
      articulation: { score: 9, verdict: "Baik", feedback: "Ok" },
      fillerWords: { score: 8, count: 0, examples: [], verdict: "Baik", feedback: "Ok" },
      emotionalTone: { score: 7, dominant: "netral", verdict: "Baik", feedback: "Ok" },
      transcript: "Test",
      highlights: [],
      strengths: [],
    } as any);

    const processSpy = vi.spyOn(scoringService, "processScoringJob");

    const stats = await processNextBatch();

    expect(stats.completed).toBe(1);
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("handles duplicate enqueue gracefully", async () => {
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([
      { sessionId: "s1", userId: "u1" },
      { sessionId: "s1", userId: "u1" }, // Duplicate
    ]);

    const claimSpy = vi.spyOn(scoringService, "claimJob");
    claimSpy
      .mockResolvedValueOnce({ claimed: true })
      .mockResolvedValueOnce({
        claimed: false,
        session: { scoring_status: "processing" },
      });

    const cacheSpy = vi.spyOn(scoringService, "checkCachedAssessment");
    cacheSpy.mockResolvedValue(null);

    const processSpy = vi.spyOn(scoringService, "processScoringJob");
    processSpy.mockResolvedValue({ success: true, status: "completed" });

    const stats = await processNextBatch();

    expect(stats.processed).toBe(1);
    expect(stats.completed).toBe(1);
    expect(claimSpy).toHaveBeenCalledTimes(2);
    expect(processSpy).toHaveBeenCalledTimes(1);
  });

  it("recovers stale leases (stale processing jobs)", async () => {
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([{ sessionId: "s1", userId: "u1" }]);

    const claimSpy = vi.spyOn(scoringService, "claimJob");
    // First attempt claims successfully (stale processing gets reclaimed)
    claimSpy.mockResolvedValue({ claimed: true });

    const cacheSpy = vi.spyOn(scoringService, "checkCachedAssessment");
    cacheSpy.mockResolvedValue(null);

    const processSpy = vi.spyOn(scoringService, "processScoringJob");
    processSpy.mockResolvedValue({ success: true, status: "completed" });

    const stats = await processNextBatch();

    expect(stats.processed).toBe(1);
    expect(stats.completed).toBe(1);
  });

  it("stops admission when the abort signal fires between jobs (no new claim, no new AI call)", async () => {
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([
      { sessionId: "s1", userId: "u1" },
      { sessionId: "s2", userId: "u1" },
    ]);

    const claimSpy = vi.spyOn(scoringService, "claimJob");
    claimSpy.mockResolvedValue({ claimed: true });

    const cacheSpy = vi.spyOn(scoringService, "checkCachedAssessment");
    cacheSpy.mockResolvedValue(null);

    const processSpy = vi.spyOn(scoringService, "processScoringJob");
    const controller = new AbortController();
    processSpy.mockImplementation(async () => {
      // The shutdown signal arrives while the first job is being processed.
      controller.abort();
      return { success: true, status: "completed" };
    });

    const stats = await processNextBatch(undefined, { signal: controller.signal });

    expect(stats.processed).toBe(1);
    expect(processSpy).toHaveBeenCalledTimes(1);
    // Job 2 is never claimed: admission stopped after the signal.
    expect(claimSpy).toHaveBeenCalledTimes(1);
  });

  it("claims nothing when the signal is already aborted before the batch starts", async () => {
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([{ sessionId: "s1", userId: "u1" }]);
    const claimSpy = vi.spyOn(scoringService, "claimJob");
    const processSpy = vi.spyOn(scoringService, "processScoringJob");

    const controller = new AbortController();
    controller.abort();
    const stats = await processNextBatch(undefined, { signal: controller.signal });

    expect(stats.processed).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(claimSpy).not.toHaveBeenCalled();
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("does not trigger a second AI call when a reclaimed job already has a valid assessment (post-shutdown release path)", async () => {
    // A worker released this claim during shutdown and exited; the next batch
    // (same or new worker process) re-fetches and re-claims the row. The
    // cached-assessment guard must prevent a second AI call for the completed row.
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([{ sessionId: "s1", userId: "u1" }]);

    const claimSpy = vi.spyOn(scoringService, "claimJob");
    claimSpy.mockResolvedValue({ claimed: true });

    const cacheSpy = vi.spyOn(scoringService, "checkCachedAssessment");
    cacheSpy.mockResolvedValue({
      overallScore: 8,
      speakingRate: { score: 7, wordsPerMinute: 130, verdict: "Baik", feedback: "Ok" },
      intonation: { score: 8, verdict: "Baik", feedback: "Ok" },
      articulation: { score: 9, verdict: "Baik", feedback: "Ok" },
      fillerWords: { score: 8, count: 0, examples: [], verdict: "Baik", feedback: "Ok" },
      emotionalTone: { score: 7, dominant: "netral", verdict: "Baik", feedback: "Ok" },
      transcript: "Test",
      highlights: [],
      strengths: [],
    } as any);

    const processSpy = vi.spyOn(scoringService, "processScoringJob");

    const stats = await processNextBatch();

    expect(stats.completed).toBe(1);
    expect(processSpy).not.toHaveBeenCalled();
  });

  it("processes rescheduled jobs with backoff", async () => {
    const fetchSpy = vi.spyOn(scoringService, "fetchPendingJobs");
    fetchSpy.mockResolvedValue([{ sessionId: "s1", userId: "u1" }]);

    const claimSpy = vi.spyOn(scoringService, "claimJob");
    claimSpy.mockResolvedValue({ claimed: true });

    const cacheSpy = vi.spyOn(scoringService, "checkCachedAssessment");
    cacheSpy.mockResolvedValue(null);

    const processSpy = vi.spyOn(scoringService, "processScoringJob");
    processSpy.mockResolvedValue({
      success: false,
      status: "rescheduled",
      error: "timeout",
    });

    const stats = await processNextBatch();

    expect(stats.processed).toBe(1);
    expect(stats.rescheduled).toBe(1);
    expect(stats.completed).toBe(0);
  });
});
