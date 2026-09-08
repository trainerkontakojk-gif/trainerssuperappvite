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
let mockDeferredMaybeSingle: Promise<any> | null = null;
let mockDeferredMaybeSingleAt: number | null = null;
let mockMaybeSingleCallCount = 0;
let mockInitialReadStarted = false;
let mockDeferredDownload: Promise<any> | null = null;
let mockDownloadStarted = false;
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
  chain.maybeSingle = vi.fn(() => {
    mockMaybeSingleCallCount += 1;
    if (
      mockDeferredMaybeSingle &&
      (mockDeferredMaybeSingleAt === null ||
        mockMaybeSingleCallCount === mockDeferredMaybeSingleAt)
    ) {
      mockInitialReadStarted = true;
      const pending = mockDeferredMaybeSingle;
      mockDeferredMaybeSingle = null;
      mockDeferredMaybeSingleAt = null;
      return pending;
    }
    return Promise.resolve(result);
  });
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
        download: vi.fn(() => {
          mockDownloadStarted = true;
          return mockDeferredDownload ?? Promise.resolve(mockDownloadResult);
        }),
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
  speakingRate: {
    score: 7,
    wordsPerMinute: 130,
    verdict: "Kecepatan ideal dan stabil, mudah dipahami konsumen",
    feedback:
      "Kecepatan bicara 130 WPM berada di rentang ideal 130-150 sehingga nyaman didengar. Dampaknya konsumen mudah memahami penjelasan tanpa terkesan terburu-buru. Pertahankan tempo dan tambahkan jeda 1 detik antar kalimat untuk memberi ruang konsumen menyerap informasi.",
  },
  intonation: {
    score: 8,
    verdict: "Intonasi variatif dan cukup ekspresif, terdengar profesional",
    feedback:
      "Intonasi cukup variatif dengan penekanan pada frasa kunci seperti salam pembuka dan penawaran solusi. Hal ini membuat percakapan terasa hidup dan profesional. Tingkatkan variasi nada pada bagian penutup agar konsumen merasakan kehangatan hingga akhir percakapan.",
  },
  articulation: {
    score: 9,
    verdict: "Artikulasi sangat jelas dan presisi, mudah dipahami",
    feedback:
      "Artikulasi sangat jelas, pengucapan vokal dan konsonan presisi termasuk istilah teknis. Dampaknya konsumen tidak perlu meminta pengulangan dan merasa yakin. Pertahankan kejelasan dengan membuka mulut lebih lebar saat mengucapkan kata sulit.",
  },
  fillerWords: {
    score: 8,
    count: 0,
    examples: [],
    verdict: "Tanpa filler words, sangat profesional dan lancar",
    feedback:
      "Tidak ada filler words terdeteksi sehingga alur bicara sangat lancar dan profesional. Dampaknya kredibilitas agen terjaga tinggi di mata konsumen. Pertahankan kebiasaan jeda senyap sebagai pengganti filler untuk menjaga kelancaran.",
  },
  emotionalTone: {
    score: 7,
    dominant: "tenang",
    verdict: "Nada tenang dan cukup empatik, masih bisa lebih hangat",
    feedback:
      "Nada dominan tenang dengan empati cukup terasa saat menyampaikan solusi. Hal ini membantu konsumen merasa didengar dan aman. Tambahkan kehangatan pada sapaan awal dan penutup dengan senyum vokal agar empati lebih tulus terasa.",
  },
  transcript:
    "Selamat siang, terima kasih telah menghubungi OJK 157. Perkenalkan saya agen yang bertugas. Bisa saya bantu jelaskan kendala yang dialami terkait layanan?".repeat(2),
  highlights: [
    "Pembukaan dengan sapaan sopan dan perkenalan jelas yang membangun kepercayaan awal konsumen dalam 30 detik pertama percakapan.",
    "Penggalian kebutuhan dengan pertanyaan terbuka yang relevan sehingga konsumen dapat menjelaskan kronologi kendala secara runtut dan lengkap.",
    "Penjelasan solusi langkah demi langkah dengan bahasa sederhana dan konfirmasi pemahaman di setiap tahap sebelum melanjutkan ke informasi berikutnya.",
  ],
  strengths: [
    "Sapaan pembuka yang sopan dan jelas dengan intonasi hangat membangun kesan profesional sejak awal panggilan.",
    "Artikulasi sangat jelas dan tempo ideal membuat seluruh penjelasan mudah dipahami tanpa perlu pengulangan dari konsumen.",
    "Nada tenang dan sabar saat konsumen menyampaikan keberatan sehingga konsumen merasa didengar dan tidak tertekan.",
  ],
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

  it("rejects invalid or sub-floor lease values before the RPC boundary", async () => {
    for (const timeoutSeconds of [Number.NaN, Number.POSITIVE_INFINITY, 120, 180, 299]) {
      await expect(claimJob("session-1", timeoutSeconds)).rejects.toThrow(
        "integer >= 300",
      );
    }
    expect(mockRpcs).toEqual([]);
  });

  it("accepts the shared 300 second lease floor and forwards it unchanged", async () => {
    mockRpcResult = { data: true, error: null };

    await expect(claimJob("session-1", 300)).resolves.toMatchObject({
      claimed: true,
    });
    expect(mockRpcs[0].args.p_claim_timeout_seconds).toBe(300);
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

  it("does not return active transport-only WebRTC lifecycle rows to the polling worker", async () => {
    seedSession("webrtc-not-ready", {
      user_id: "u1",
      scoring_status: "pending",
      telefun_model_id: null,
      telefun_transport: "openai-webrtc",
      status: "active",
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

  it("includes terminal historical OpenAI jobs before the retired WebRTC readiness gate", async () => {
    seedSession("historical-webrtc", {
      user_id: "u1",
      status: "completed",
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
      scoring_status: "pending",
      scoring_next_attempt_at: null,
      scoring_ready_at: null,
      agent_recording_path: null,
    });

    await expect(fetchPendingJobs(5)).resolves.toEqual([
      { sessionId: "historical-webrtc", userId: "u1" },
    ]);
  });

  it("includes a terminal transport-only historical job before the WebRTC readiness gate", async () => {
    seedSession("transport-only-terminal", {
      user_id: "u1",
      status: "completed",
      telefun_model_id: null,
      telefun_transport: "openai-webrtc",
      scoring_status: "pending",
      scoring_next_attempt_at: null,
      scoring_ready_at: null,
      agent_recording_path: null,
    });

    await expect(fetchPendingJobs(5)).resolves.toEqual([
      { sessionId: "transport-only-terminal", userId: "u1" },
    ]);
  });

  it("does not requeue a permanently failed historical OpenAI job", async () => {
    seedSession("historical-failed", {
      user_id: "u1",
      status: "completed",
      telefun_model_id: "gpt-realtime-2.1-mini",
      telefun_transport: "openai-audio",
      scoring_status: "failed",
      scoring_next_attempt_at: null,
      scoring_ready_at: null,
      agent_recording_path: null,
    });

    await expect(fetchPendingJobs(5)).resolves.toEqual([]);
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
    mockDeferredMaybeSingle = null;
    mockDeferredMaybeSingleAt = null;
    mockMaybeSingleCallCount = 0;
    mockInitialReadStarted = false;
    mockDeferredDownload = null;
    mockDownloadStarted = false;
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

    const result = await processScoringJob({
      sessionId: "s1",
      userId: "u1",
      claimTokenHash: "owned-token",
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(mockRpcs.find((rpc) => rpc.name === "complete_telefun_scoring")?.args)
      .toMatchObject({ p_claim_token_hash: "owned-token" });
  });

  it("permanently disables a terminal transport-only WebRTC row even after failed capture", async () => {
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
    const geminiMock = (await import("../lib/gemini")).generateGeminiContent as any;
    geminiMock.mockResolvedValue({
      success: true,
      text: JSON.stringify(VALID_ASSESSMENT),
    });
    mockRpcResult = { data: true, error: null };

    const result = await processScoringJob({
      sessionId: "webrtc-failed",
      userId: "u1",
    });

    expect(result).toEqual({
      success: false,
      status: "failed",
      error: "Penilaian OpenAI Realtime tidak lagi tersedia untuk Telefun.",
    });
    expect(mockRpcs.map((rpc) => rpc.name)).toEqual([
      "fail_telefun_scoring",
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

    const result = await processScoringJob({
      sessionId: "s1",
      userId: "u1",
      claimTokenHash: "owned-token",
    });
    expect(result.status).toBe("rescheduled");
    const rescheduleRpc = mockRpcs.find((r) => r.name === "reschedule_telefun_scoring");
    expect(rescheduleRpc).toBeDefined();
    expect(rescheduleRpc?.args).toMatchObject({ p_claim_token_hash: "owned-token" });
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

    const result = await processScoringJob({
      sessionId: "s1",
      userId: "u1",
      claimTokenHash: "owned-token",
    });
    expect(result.status).toBe("failed");
    const failRpc = mockRpcs.find((r) => r.name === "fail_telefun_scoring");
    expect(failRpc).toBeDefined();
    expect(failRpc?.args).toMatchObject({ p_claim_token_hash: "owned-token" });
  });

  it("keeps the claim token on the exception retry path", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: "u1/s1/agent_only.webm",
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 1,
    });
    const geminiMock = (await import("../lib/gemini"))
      .generateGeminiContent as any;
    geminiMock.mockRejectedValueOnce(new Error("provider network unavailable"));
    mockRpcResult = { data: true, error: null };

    const result = await processScoringJob({
      sessionId: "s1",
      userId: "u1",
      claimTokenHash: "owned-token",
    });

    expect(result.status).toBe("rescheduled");
    const rescheduleRpc = mockRpcs.find((r) => r.name === "reschedule_telefun_scoring");
    expect(rescheduleRpc?.args).toMatchObject({ p_claim_token_hash: "owned-token" });
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

  it("does not admit the provider when abort settles the initial state read", async () => {
    const row = {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: "u1/s1/agent_only.webm",
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 0,
    };
    seedSession("s1", row);
    const geminiMock = (await import("../lib/gemini"))
      .generateGeminiContent as any;
    let resolveInitialRead!: (value: { data: any; error: null }) => void;
    mockDeferredMaybeSingle = new Promise((resolve) => {
      resolveInitialRead = resolve;
    });
    const controller = new AbortController();

    const pending = processScoringJob(
      { sessionId: "s1", userId: "u1" },
      controller.signal,
    );
    await vi.waitFor(() => expect(mockInitialReadStarted).toBe(true));

    controller.abort();
    resolveInitialRead({ data: { id: "s1", ...row }, error: null });

    const result = await pending;
    expect(result).toEqual({
      success: false,
      status: "rescheduled",
      error: "Scoring aborted",
    });
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it("does not admit the provider when abort settles the audio download", async () => {
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
    let resolveDownload!: (value: { data: Blob; error: null }) => void;
    mockDeferredDownload = new Promise((resolve) => {
      resolveDownload = resolve;
    });
    const controller = new AbortController();

    const pending = processScoringJob(
      { sessionId: "s1", userId: "u1" },
      controller.signal,
    );
    await vi.waitFor(() => expect(mockDownloadStarted).toBe(true));

    controller.abort();
    resolveDownload({
      data: new Blob(["audio"], { type: "audio/webm" }),
      error: null,
    });

    const result = await pending;
    expect(result).toEqual({
      success: false,
      status: "rescheduled",
      error: "Scoring aborted",
    });
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

  it("does not persist a failure when abort settles the post-analysis state read", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: "u1/s1/agent_only.webm",
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 1,
    });
    const geminiMock = (await import("../lib/gemini"))
      .generateGeminiContent as any;
    geminiMock.mockResolvedValueOnce({
      success: false,
      error: "Invalid assessment shape from AI",
    });
    let resolveStateRead!: (value: { data: any; error: null }) => void;
    mockDeferredMaybeSingle = new Promise((resolve) => {
      resolveStateRead = resolve;
    });
    mockDeferredMaybeSingleAt = 3;
    const controller = new AbortController();

    const pending = processScoringJob(
      { sessionId: "s1", userId: "u1", claimTokenHash: "owned-token" },
      controller.signal,
    );
    await vi.waitFor(() => expect(mockMaybeSingleCallCount).toBe(3));

    controller.abort();
    resolveStateRead({
      data: { id: "s1", ...mockRows.get("s1") },
      error: null,
    });

    await expect(pending).resolves.toEqual({
      success: false,
      status: "rescheduled",
      error: "Scoring aborted",
    });
    expect(mockRpcs).toEqual([]);
  });

  it("does not persist a retry when abort settles the exception diagnostic read", async () => {
    seedSession("s1", {
      user_id: "u1",
      scenario_title: "Test",
      agent_recording_path: "u1/s1/agent_only.webm",
      voice_assessment: null,
      session_metrics: null,
      scoring_status: "processing",
      scoring_attempt_count: 1,
    });
    const geminiMock = (await import("../lib/gemini"))
      .generateGeminiContent as any;
    geminiMock.mockRejectedValueOnce(new Error("provider network unavailable"));
    let resolveDiagnosticRead!: (value: { data: any; error: null }) => void;
    mockDeferredMaybeSingle = new Promise((resolve) => {
      resolveDiagnosticRead = resolve;
    });
    mockDeferredMaybeSingleAt = 3;
    const controller = new AbortController();

    const pending = processScoringJob(
      { sessionId: "s1", userId: "u1", claimTokenHash: "owned-token" },
      controller.signal,
    );
    await vi.waitFor(() => expect(mockMaybeSingleCallCount).toBe(3));

    controller.abort();
    resolveDiagnosticRead({
      data: { id: "s1", ...mockRows.get("s1") },
      error: null,
    });

    await expect(pending).resolves.toEqual({
      success: false,
      status: "rescheduled",
      error: "Scoring aborted",
    });
    expect(mockRpcs).toEqual([]);
  });
});
