import { afterEach, describe, expect, it, vi } from "vitest";

const DISABLED_REASON =
  "Penilaian OpenAI Realtime tidak lagi tersedia untuk Telefun.";

const VALID_ASSESSMENT = {
  overallScore: 8,
  speakingRate: {
    score: 7,
    wordsPerMinute: 130,
    verdict: "Baik",
    feedback: "Ok",
  },
  intonation: { score: 8, verdict: "Baik", feedback: "Ok" },
  articulation: { score: 9, verdict: "Baik", feedback: "Ok" },
  fillerWords: {
    score: 8,
    count: 0,
    examples: [],
    verdict: "Baik",
    feedback: "Ok",
  },
  emotionalTone: {
    score: 7,
    dominant: "netral",
    verdict: "Baik",
    feedback: "Ok",
  },
  transcript: "Test",
  highlights: [],
  strengths: [],
};

const mockRows = new Map<string, Record<string, unknown>>();
const mockRpcs: Array<{ name: string; args: unknown }> = [];
const mockUpdates: Array<Record<string, unknown>> = [];
let mockUpdateError: Error | null = null;

function rowFor(id: string) {
  return { data: mockRows.get(id) ?? null, error: null };
}

function buildClient() {
  return {
    rpc: vi.fn(async (name: string, args: unknown) => {
      mockRpcs.push({ name, args });
      return { data: true, error: null };
    }),
    from: vi.fn(() => {
      const chain: Record<string, any> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn((_field: string, id: string) => ({
        maybeSingle: vi.fn(async () => rowFor(id)),
      }));
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        mockUpdates.push(payload);
        return {
          eq: vi.fn(async () => ({ error: mockUpdateError })),
        };
      });
      return chain;
    }),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(async () => ({
          data: new Blob(["audio"], { type: "audio/webm" }),
          error: null,
        })),
      })),
    },
  };
}

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => buildClient()),
}));

const generateGeminiContent = vi.fn();
const requestOpenAITelefunAssessment = vi.fn();

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: (...args: unknown[]) => generateGeminiContent(...args),
}));

vi.mock("../lib/telefun-openai-assessment", () => ({
  TELEFUN_OPENAI_SCORING_DISABLED_REASON:
    "Penilaian OpenAI Realtime tidak lagi tersedia untuk Telefun.",
  requestOpenAITelefunAssessment: (...args: unknown[]) =>
    requestOpenAITelefunAssessment(...args),
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

const { analyzeVoiceQuality } = await import("../lib/telefun-analysis");
const { processScoringJob } =
  await import("../services/telefun-scoring-service");

function seedSession(id: string, row: Record<string, unknown>) {
  mockRows.set(id, {
    id,
    user_id: "u1",
    scenario_title: "Test",
    session_metrics: null,
    scoring_attempt_count: 0,
    ...row,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  mockRows.clear();
  mockRpcs.length = 0;
  mockUpdates.length = 0;
  mockUpdateError = null;
});

describe("processScoringJob OpenAI retirement routing", () => {
  it.each([
    ["gpt-realtime-2.1", "openai-webrtc"],
    ["gpt-realtime-2.1-mini", "openai-audio"],
  ])(
    "permanently suppresses uncached historical %s without any provider call",
    async (modelId, transport) => {
      seedSession("s1", {
        status: "completed",
        telefun_model_id: modelId,
        telefun_transport: transport,
        recording_status: "ready",
        recording_error: null,
        scoring_ready_at: "2026-08-14T09:00:00.000Z",
        agent_recording_path: "u1/s1/agent_only.seekable.webm",
        scoring_status: "processing",
        voice_assessment: null,
      });

      const result = await processScoringJob({ sessionId: "s1", userId: "u1" });

      expect(result).toEqual({
        success: false,
        status: "failed",
        error: DISABLED_REASON,
      });
      expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
      expect(generateGeminiContent).not.toHaveBeenCalled();
      expect(mockRpcs.map((call) => call.name)).toContain(
        "fail_telefun_scoring",
      );
      expect(mockRpcs.map((call) => call.name)).not.toContain(
        "reschedule_telefun_scoring",
      );
      expect(mockUpdates).toEqual([]);
    },
  );

  it("returns a transport-only cached historical assessment without completing or rescheduling it", async () => {
    seedSession("transport-cached", {
      status: "completed",
      telefun_model_id: null,
      telefun_transport: "openai-webrtc",
      scoring_status: "completed",
      score: 8,
      voice_assessment: VALID_ASSESSMENT,
    });

    await expect(
      processScoringJob({ sessionId: "transport-cached", userId: "u1" }),
    ).resolves.toEqual({ success: true, status: "completed" });

    expect(mockRpcs).toEqual([]);
    expect(mockUpdates).toEqual([]);
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
    expect(generateGeminiContent).not.toHaveBeenCalled();
  });

  it("permanently suppresses a terminal transport-only row before the WebRTC artifact gate", async () => {
    seedSession("transport-terminal", {
      status: "completed",
      telefun_model_id: null,
      telefun_transport: "openai-webrtc",
      recording_status: "pending",
      recording_error: null,
      scoring_ready_at: null,
      agent_recording_path: null,
      scoring_status: "processing",
      voice_assessment: null,
    });

    await expect(
      processScoringJob({ sessionId: "transport-terminal", userId: "u1" }),
    ).resolves.toEqual({
      success: false,
      status: "failed",
      error: DISABLED_REASON,
    });

    expect(mockRpcs.map((call) => call.name)).toEqual([
      "fail_telefun_scoring",
    ]);
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
    expect(generateGeminiContent).not.toHaveBeenCalled();
  });

  it("keeps an active transport-only WebRTC lifecycle row out of scoring", async () => {
    seedSession("transport-active", {
      status: "active",
      telefun_model_id: null,
      telefun_transport: "openai-webrtc",
      recording_status: "pending",
      recording_error: null,
      scoring_ready_at: null,
      agent_recording_path: null,
      scoring_status: "processing",
      voice_assessment: null,
    });

    await expect(
      processScoringJob({ sessionId: "transport-active", userId: "u1" }),
    ).resolves.toEqual({
      success: false,
      status: "failed",
      error: "SCORING_NOT_READY",
    });

    expect(mockRpcs).toEqual([]);
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
    expect(generateGeminiContent).not.toHaveBeenCalled();
  });

  it("does not reschedule retired scoring after fail persistence succeeds and retry cleanup is unavailable", async () => {
    mockUpdateError = new Error("obsolete retry-clear update failed");
    seedSession("retired-no-resurrection", {
      status: "completed",
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-audio",
      scoring_status: "processing",
      voice_assessment: null,
    });

    await expect(
      processScoringJob({ sessionId: "retired-no-resurrection", userId: "u1" }),
    ).resolves.toEqual({
      success: false,
      status: "failed",
      error: DISABLED_REASON,
    });

    expect(mockRpcs.map((call) => call.name)).toEqual([
      "fail_telefun_scoring",
    ]);
    expect(mockUpdates).toEqual([]);
  });

  it("rejects a direct uncached historical analysis before storage or either provider", async () => {
    seedSession("s1", {
      status: "completed",
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
      recording_status: "ready",
      recording_error: null,
      scoring_ready_at: "2026-08-14T09:00:00.000Z",
      agent_recording_path: "u1/s1/agent_only.seekable.webm",
      scoring_status: "processing",
      voice_assessment: null,
    });

    await expect(analyzeVoiceQuality("s1", "u1")).resolves.toEqual({
      success: false,
      error: DISABLED_REASON,
    });
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
    expect(generateGeminiContent).not.toHaveBeenCalled();
  });

  it("leaves a valid cached historical assessment untouched", async () => {
    seedSession("s1", {
      status: "completed",
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
      scoring_status: "completed",
      voice_assessment: VALID_ASSESSMENT,
    });

    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });

    expect(result).toEqual({ success: true, status: "completed" });
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
    expect(generateGeminiContent).not.toHaveBeenCalled();
    expect(mockRpcs).toEqual([]);
    expect(mockUpdates).toEqual([]);
  });

  it("keeps Gemini scoring on the Gemini assessment path", async () => {
    seedSession("s1", {
      status: "completed",
      telefun_model_id: "gemini-3.1-flash-live-preview",
      telefun_transport: "gemini-live",
      agent_recording_path: "u1/s1/agent_only.webm",
      scoring_status: "processing",
      voice_assessment: null,
    });
    generateGeminiContent.mockResolvedValue({
      success: true,
      text: JSON.stringify(VALID_ASSESSMENT),
    });

    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });

    expect(result).toMatchObject({ success: true, status: "completed" });
    expect(generateGeminiContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.7-flash" }),
    );
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
  });
});
