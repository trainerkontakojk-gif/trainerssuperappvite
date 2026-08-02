import { afterEach, describe, expect, it, vi } from "vitest";

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

const OPEN_SESSION = {
  user_id: "u1",
  scenario_title: "Test",
  agent_recording_path: "u1/s1/agent_only.webm",
  voice_assessment: null,
  session_metrics: null,
  scoring_status: "processing",
  scoring_attempt_count: 0,
};

const mockRows = new Map<string, Record<string, any>>();
const mockRpcs: Array<{ name: string; args: any }> = [];
let mockRpcResult: any = { data: null, error: null };

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
  const chain: Record<string, any> = {};
  const chaining = ["select", "order", "lte", "not"];
  for (const m of chaining) chain[m] = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.in = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.limit = vi.fn(() => Promise.resolve(result));
  chain.update = vi.fn((_data: any) => {
    const sub: Record<string, any> = {};
    sub.eq = vi.fn((_f: string, v: string) => {
      const existing = mockRows.get(v);
      if (existing) mockRows.set(v, { ...existing, ..._data });
      return Promise.resolve({ error: null });
    });
    sub.in = vi.fn(() => Promise.resolve({ error: null }));
    return sub;
  });
  return chain;
}

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn((name: string, args: any) => {
      mockRpcs.push({ name, args });
      return Promise.resolve(
        name === "complete_telefun_scoring"
          ? { data: true, error: null }
          : mockRpcResult,
      );
    }),
    from: vi.fn(() => {
      const allRows = Array.from(mockRows.values());
      const selectChain = buildChain(null, false);
      selectChain.eq = vi.fn((_field: string, value: string) =>
        buildChain(mockRows.get(value) || null, false),
      );
      selectChain.in = vi.fn(() => buildChain(allRows, true));
      selectChain.or = vi.fn(() => {
        const listChain = buildChain(allRows, true);
        listChain.order = vi.fn(() => listChain);
        return listChain;
      });
      selectChain.update = vi.fn((data: any) => {
        const sub: Record<string, any> = {};
        sub.eq = vi.fn((_f: string, v: string) => {
          const existing = mockRows.get(v);
          if (existing) mockRows.set(v, { ...existing, ...data });
          return Promise.resolve({ error: null });
        });
        sub.in = vi.fn(() => Promise.resolve({ error: null }));
        return sub;
      });
      return selectChain;
    }),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn(() =>
          Promise.resolve({
            data: new Blob(["audio"], { type: "audio/webm" }),
            error: null,
          }),
        ),
      })),
    },
  })),
}));

const generateGeminiContent = vi.fn();
const requestOpenAITelefunAssessment = vi.fn();
requestOpenAITelefunAssessment.mockResolvedValue(VALID_ASSESSMENT);

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: (...args: any[]) => generateGeminiContent(...args),
}));

vi.mock("../lib/telefun-openai-assessment", () => ({
  requestOpenAITelefunAssessment: (...args: any[]) =>
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

const { processScoringJob } =
  await import("../services/telefun-scoring-service");

function seedSession(id: string, data: Record<string, any>) {
  mockRows.set(id, { id, user_id: "u1", ...data });
}

afterEach(() => {
  vi.clearAllMocks();
  mockRows.clear();
  mockRpcs.length = 0;
  mockRpcResult = { data: null, error: null };
  requestOpenAITelefunAssessment.mockResolvedValue(VALID_ASSESSMENT);
});

describe("processScoringJob provider routing", () => {
  it.each(["gpt-realtime-2.1", "gpt-realtime-2.1-mini"])(
    "routes %s to the exact OpenAI evaluator without Gemini fallback",
    async (modelId) => {
      seedSession("s1", { telefun_model_id: modelId, ...OPEN_SESSION });
      await processScoringJob({ sessionId: "s1", userId: "u1" });
      expect(requestOpenAITelefunAssessment).toHaveBeenCalledWith({
        sessionId: "s1",
        userId: "u1",
        modelId,
      });
      expect(generateGeminiContent).not.toHaveBeenCalled();
    },
  );

  it("uses Gemini 3.5 Flash for Gemini sessions", async () => {
    seedSession("s1", {
      telefun_model_id: "gemini-3.1-flash-live-preview",
      ...OPEN_SESSION,
    });
    generateGeminiContent.mockResolvedValue({
      success: true,
      text: JSON.stringify(VALID_ASSESSMENT),
    });
    await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(generateGeminiContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.5-flash" }),
    );
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
  });

  it("routes null/legacy model id to Gemini", async () => {
    seedSession("s1", { telefun_model_id: null, ...OPEN_SESSION });
    generateGeminiContent.mockResolvedValue({
      success: true,
      text: JSON.stringify(VALID_ASSESSMENT),
    });
    await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(generateGeminiContent).toHaveBeenCalled();
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
  });

  it("bypasses OpenAI client when a cached assessment exists", async () => {
    seedSession("s1", {
      telefun_model_id: "gpt-realtime-2.1",
      ...OPEN_SESSION,
      scoring_status: "completed",
      score: 8,
      voice_assessment: VALID_ASSESSMENT,
    });
    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(result).toMatchObject({ success: true, status: "completed" });
    expect(requestOpenAITelefunAssessment).not.toHaveBeenCalled();
  });

  it("preserves transient OpenAI failures for queue retry without Gemini fallback", async () => {
    const { TransientScoringError } =
      await import("../lib/telefun-scoring-errors");
    seedSession("s1", {
      telefun_model_id: "gpt-realtime-2.1",
      ...OPEN_SESSION,
      scoring_attempt_count: 1,
    });
    requestOpenAITelefunAssessment.mockRejectedValue(
      new TransientScoringError(
        "Internal service unavailable",
        "INTERNAL_TRANSIENT",
      ),
    );
    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(result.status).toBe("rescheduled");
    expect(
      mockRpcs.some((rpc) => rpc.name === "reschedule_telefun_scoring"),
    ).toBe(true);
    expect(generateGeminiContent).not.toHaveBeenCalled();
  });

  it("fails permanently for rejected OpenAI requests without Gemini fallback", async () => {
    const { PermanentScoringError } =
      await import("../lib/telefun-scoring-errors");
    seedSession("s1", {
      telefun_model_id: "gpt-realtime-2.1-mini",
      ...OPEN_SESSION,
    });
    requestOpenAITelefunAssessment.mockRejectedValue(
      new PermanentScoringError(
        "Internal request rejected",
        "INTERNAL_PERMANENT",
      ),
    );
    const result = await processScoringJob({ sessionId: "s1", userId: "u1" });
    expect(result.status).toBe("failed");
    expect(mockRpcs.some((rpc) => rpc.name === "fail_telefun_scoring")).toBe(
      true,
    );
    expect(generateGeminiContent).not.toHaveBeenCalled();
  });
});
