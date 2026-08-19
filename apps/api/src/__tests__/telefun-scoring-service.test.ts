import { describe, expect, it, vi, beforeEach } from "vitest";

// Centralized mock store for rows
const mockRows = new Map<string, Record<string, any>>();
const mockRpcs: Array<{ name: string; args: any }> = [];
const mockInCalls: Array<{ field: string; values: unknown[] }> = [];
let mockRpcResult: any = { data: null, error: null };
let mockDownloadResult: any = {
  data: new Blob(["audio"], { type: "audio/webm" }),
  error: null,
};
let mockFetchQueryError: Error | null = null;

function buildChain(rowOrList: any, isList: boolean) {
  const result = isList
    ? {
        data: Array.isArray(rowOrList)
          ? rowOrList
          : rowOrList
            ? [rowOrList]
            : [],
        error: null,
      }
    : { data: rowOrList ?? null, error: null };

  // Build methods that return the chain, the terminal ones return a promise
  const chain: Record<string, any> = {};
  const chaining = ["select", "order", "lte", "not"];
  for (const m of chaining) {
    chain[m] = vi.fn(() => chain);
  }

  // eq and in are either chaining or terminal (for update chains)
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.limit = vi.fn(() =>
    Promise.resolve(
      mockFetchQueryError
        ? { data: null, error: mockFetchQueryError }
        : result,
    ),
  );

  // update returns a sub-chain where eq/in are terminal
  chain.update = vi.fn((_data: any) => {
    const sub: Record<string, any> = {};
    sub.eq = vi.fn(() => Promise.resolve({ error: null }));
    sub.in = vi.fn(() => Promise.resolve({ error: null }));
    return sub;
  });

  return chain;
}

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn((name: string, args: any) => {
      mockRpcs.push({ name, args });
      return Promise.resolve(mockRpcResult);
    }),
    from: vi.fn((_table: string) => {
      // Build different chains for different query patterns
      const allRows = Array.from(mockRows.values());

      // select chain with maybeSingle terminal
      const selectChain = buildChain(null, false);
      selectChain.eq = vi.fn((field: string, value: string) => {
        const row = mockRows.get(value) || null;
        return buildChain(row, false);
      });
      selectChain.in = vi.fn((field: string, values: unknown[]) => {
        mockInCalls.push({ field, values });
        return buildChain(allRows, true);
      });

      // For the or/order/limit pattern used by fetchPendingJobs
      selectChain.or = vi.fn(() => {
        const listChain = buildChain(allRows, true);
        listChain.order = vi.fn(() => listChain);
        return listChain;
      });

      // update chain
      selectChain.update = vi.fn((data: any) => {
        const sub: Record<string, any> = {};
        sub.eq = vi.fn((_f: string, v: string) => {
          // If row exists, update it
          const existing = mockRows.get(v);
          if (existing) {
            mockRows.set(v, { ...existing, ...data });
          }
          return Promise.resolve({ error: null });
        });
        sub.in = vi.fn(() => Promise.resolve({ error: null }));
        return sub;
      });

      return selectChain;
    }),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(() => Promise.resolve(mockDownloadResult)),
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

import {
  claimJob,
  checkCachedAssessment,
  enqueueScoring,
  fetchPendingJobs,
  persistScoringAssessment,
  processScoringJob,
} from "../services/telefun-scoring-service";
import type { VoiceQualityAssessment } from "@trainers/types";

const VALID_ASSESSMENT: VoiceQualityAssessment = {
  overallScore: 8,
  speakingRate: { score: 7, wordsPerMinute: 130, verdict: "Baik", feedback: "Ok" },
  intonation: { score: 8, verdict: "Baik", feedback: "Ok" },
  articulation: { score: 9, verdict: "Baik", feedback: "Ok" },
  fillerWords: { score: 8, count: 0, examples: [], verdict: "Baik", feedback: "Ok" },
  emotionalTone: { score: 7, dominant: "netral", verdict: "Baik", feedback: "Ok" },
  transcript: "Test",
  highlights: [],
  strengths: [],
};

function seedSession(id: string, data: Record<string, any>) {
  mockRows.set(id, { id, user_id: "u1", ...data });
}

describe("claimJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.clear();
    mockRpcs.length = 0;
    mockInCalls.length = 0;
    mockRpcResult = { data: null, error: null };
  });

  it("returns claimed=true when RPC returns true", async () => {
    mockRpcResult = { data: true, error: null };
    const result = await claimJob("session-1");
    expect(result.claimed).toBe(true);
  });

  it("returns claimed=false with session data when not claimed", async () => {
    mockRpcResult = { data: false, error: null };
    seedSession("session-1", { scoring_status: "completed", score: 8 });

    const result = await claimJob("session-1");
    expect(result.claimed).toBe(false);
    expect(result.session?.scoring_status).toBe("completed");
  });

  it("returns claimed=false on RPC error", async () => {
    mockRpcResult = { data: null, error: new Error("DB error") };
    const result = await claimJob("session-1");
    expect(result.claimed).toBe(false);
  });
});

describe("checkCachedAssessment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.clear();
  });

  it("returns null when session not found", async () => {
    const result = await checkCachedAssessment("session-1");
    expect(result).toBeNull();
  });

  it("returns null when not completed", async () => {
    seedSession("session-1", { scoring_status: "pending" });
    const result = await checkCachedAssessment("session-1");
    expect(result).toBeNull();
  });

  it("returns parsed assessment when completed with valid data", async () => {
    seedSession("session-1", {
      scoring_status: "completed",
      score: 8,
      voice_assessment: VALID_ASSESSMENT,
    });

    const result = await checkCachedAssessment("session-1");
    expect(result).not.toBeNull();
    expect(result?.overallScore).toBe(8);
  });
});

describe("enqueueScoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpcs.length = 0;
    mockRpcResult = { data: null, error: null };
  });

  it("returns true on successful enqueue", async () => {
    mockRpcResult = { data: true, error: null };
    const result = await enqueueScoring("session-1");
    expect(result).toBe(true);
    expect(mockRpcs[0].name).toBe("enqueue_telefun_scoring");
  });

  it("returns false on error", async () => {
    mockRpcResult = { data: null, error: new Error("DB error") };
    const result = await enqueueScoring("session-1");
    expect(result).toBe(false);
  });
});

describe("fetchPendingJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.clear();
    mockInCalls.length = 0;
    mockFetchQueryError = null;
  });

  it("returns jobs from pending/failed sessions due for retry", async () => {
    seedSession("s1", { user_id: "u1", scoring_status: "pending", scoring_next_attempt_at: null });
    seedSession("s2", { user_id: "u2", scoring_status: "failed", scoring_next_attempt_at: "2026-01-01T00:00:00Z" });

    const result = await fetchPendingJobs(5);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ sessionId: "s1", userId: "u1" });
    expect(result[1]).toEqual({ sessionId: "s2", userId: "u2" });
  });

  it("includes processing sessions so stale leases can be reclaimed", async () => {
    seedSession("stale", {
      user_id: "u1",
      scoring_status: "processing",
      scoring_claimed_at: "2026-06-11T00:00:00.000Z",
    });

    await fetchPendingJobs(5);

    expect(mockInCalls).toContainEqual({
      field: "scoring_status",
      values: ["pending", "failed", "processing"],
    });
  });

  it("does not return not-ready WebRTC rows to the polling worker", async () => {
    seedSession("webrtc-not-ready", {
      user_id: "u1",
      scoring_status: "pending",
      telefun_transport: "openai-webrtc",
      status: "completed",
      scoring_ready_at: null,
      agent_recording_path: null,
    });
    seedSession("webrtc-ready", {
      user_id: "u2",
      scoring_status: "pending",
      telefun_transport: "openai-webrtc",
      status: "completed",
      scoring_ready_at: "2026-06-11T00:00:00.000Z",
      agent_recording_path: "u2/webrtc-ready/agent_only.seekable.webm",
    });

    const result = await fetchPendingJobs(5);

    expect(result).toEqual([
      { sessionId: "webrtc-ready", userId: "u2" },
    ]);
  });

  it("returns empty array when no jobs", async () => {
    const result = await fetchPendingJobs(5);
    expect(result).toEqual([]);
  });

  it("throws on DB error instead of masking it as an empty queue", async () => {
    mockFetchQueryError = new Error("Queue query failed");

    await expect(fetchPendingJobs(5)).rejects.toThrow("Queue query failed");
  });
});

describe("processScoringJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRows.clear();
    mockRpcs.length = 0;
    mockRpcResult = { data: null, error: null };
    mockDownloadResult = {
      data: new Blob(["audio"], { type: "audio/webm" }),
      error: null,
    };
  });

  it("returns completed when analysis succeeds", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: "u1/s1/agent_only.webm",
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 0,
    });

    const geminiMock = (await import("../lib/gemini")).generateGeminiContent as any;
    geminiMock.mockResolvedValue({
      success: true,
      text: JSON.stringify(VALID_ASSESSMENT),
    });
    mockRpcResult = { data: true, error: null };

    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
  });

  it("does not re-enqueue a WebRTC job after a failed-capture completion race", async () => {
    seedSession("webrtc-failed", {
      user_id: "u1",
      status: "completed",
      telefun_transport: "openai-webrtc",
      recording_status: "failed",
      recording_error: "Recording capture failed",
      scoring_ready_at: "2026-08-01T00:00:00.000Z",
      agent_recording_path: "u1/webrtc-failed/agent_only.seekable.webm",
      scoring_status: "processing",
      scoring_attempt_count: 1,
      voice_assessment: null,
      session_metrics: null,
    });
    mockRpcResult = { data: false, error: null };
    const geminiMock = (await import("../lib/gemini")).generateGeminiContent as any;
    geminiMock.mockResolvedValue({
      success: true,
      text: JSON.stringify(VALID_ASSESSMENT),
    });

    const result = await processScoringJob({
      sessionId: "webrtc-failed",
      userId: "u1",
    });

    expect(result).toEqual({
      success: false,
      status: "failed",
      error: "SCORING_NOT_READY",
    });
    expect(mockRpcs.map((rpc) => rpc.name)).toEqual([
      "complete_telefun_scoring",
    ]);
  });

  it("reads the complete RPC state with the full readiness snapshot", async () => {
    seedSession("s1", {
      user_id: "u1",
      telefun_transport: "openai-webrtc",
      status: "completed",
      recording_status: "failed",
      recording_error: "Recording capture failed",
      scoring_ready_at: null,
      agent_recording_path: null,
      scoring_status: "processing",
    });
    mockRpcResult = { data: false, error: null };

    await expect(persistScoringAssessment("s1", VALID_ASSESSMENT)).rejects.toThrow(
      "SCORING_NOT_READY",
    );
  });

  it("reschedules transient failures", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: "u1/s1/agent_only.webm",
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 1,
    });

    // Fail download transiently
    mockDownloadResult = {
      data: null,
      error: new Error("Failed to download audio: network error"),
    };

    mockRpcResult = { data: true, error: null };

    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(result.status).toBe("rescheduled");
    const rescheduleRpc = mockRpcs.find((r) => r.name === "reschedule_telefun_scoring");
    expect(rescheduleRpc).toBeDefined();
  });

  it("fails permanently on permanent error", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: null, // No audio = permanent
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 1,
    });

    mockRpcResult = { data: true, error: null };

    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(result.status).toBe("failed");
    const failRpc = mockRpcs.find((r) => r.name === "fail_telefun_scoring");
    expect(failRpc).toBeDefined();
  });

  it("fails permanently after max attempts exceeded", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: null,
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 3, // Max
    });

    mockRpcResult = { data: true, error: null };

    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Max attempts");
  });

  it("does not start analysis when the signal is already aborted", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: "u1/s1/agent_only.webm",
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 0,
    });
    const geminiMock = (await import("../lib/gemini"))
      .generateGeminiContent as any;
    const controller = new AbortController();
    controller.abort();

    const result = await processScoringJob(
      { sessionId: "s1", userId: "u1" },
      controller.signal,
    );

    expect(result.status).toBe("rescheduled");
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it("does not persist a late provider result once the signal aborts mid-analysis", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: "u1/s1/agent_only.webm",
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 0,
    });
    const geminiMock = (await import("../lib/gemini"))
      .generateGeminiContent as any;
    let resolveGemini!: (value: unknown) => void;
    const geminiDeferred = new Promise((done) => {
      resolveGemini = done;
    });
    geminiMock.mockReturnValueOnce(geminiDeferred);
    mockRpcResult = { data: true, error: null };
    const controller = new AbortController();

    const pending = processScoringJob(
      { sessionId: "s1", userId: "u1" },
      controller.signal,
    );
    await vi.waitFor(() => expect(geminiMock).toHaveBeenCalledTimes(1));

    controller.abort();
    resolveGemini({ success: true, text: JSON.stringify(VALID_ASSESSMENT) });

    const result = await pending;
    expect(result.status).toBe("rescheduled");
    expect(mockRpcs.map((rpc) => rpc.name)).not.toContain(
      "complete_telefun_scoring",
    );
  });
});
