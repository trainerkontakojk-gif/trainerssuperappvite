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

function mockFetchOnce(impl: any) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => impl),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.stubEnv("TELEFUN_INTERNAL_URL", "");
  vi.stubEnv("TELEFUN_INTERNAL_TOKEN", "");
});

describe("requestOpenAITelefunAssessment", () => {
  it("throws PermanentScoringError when internal config is missing", async () => {
    const { requestOpenAITelefunAssessment } =
      await import("../lib/telefun-openai-assessment");
    vi.stubEnv("TELEFUN_INTERNAL_URL", "");
    vi.stubEnv("TELEFUN_INTERNAL_TOKEN", "");
    await expect(
      requestOpenAITelefunAssessment({
        sessionId: "s1",
        userId: "u1",
        modelId: "gpt-realtime-2.1",
      }),
    ).rejects.toMatchObject({ name: "PermanentScoringError" });
  });

  it("posts to the internal scoring endpoint with the shared token", async () => {
    const { requestOpenAITelefunAssessment } =
      await import("../lib/telefun-openai-assessment");
    vi.stubEnv("TELEFUN_INTERNAL_URL", "http://localhost:3002");
    vi.stubEnv("TELEFUN_INTERNAL_TOKEN", "shared-secret");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ assessment: VALID_ASSESSMENT }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestOpenAITelefunAssessment({
      sessionId: "s1",
      userId: "u1",
      modelId: "gpt-realtime-2.1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3002/internal/telefun/scoring",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer shared-secret",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          sessionId: "s1",
          userId: "u1",
          modelId: "gpt-realtime-2.1",
        }),
      }),
    );
    expect(result.overallScore).toBe(8);
  });

  it("maps 401 and 422 to a permanent error", async () => {
    const { requestOpenAITelefunAssessment } =
      await import("../lib/telefun-openai-assessment");
    vi.stubEnv("TELEFUN_INTERNAL_URL", "http://localhost:3002");
    vi.stubEnv("TELEFUN_INTERNAL_TOKEN", "shared-secret");
    for (const status of [401, 422]) {
      mockFetchOnce({
        ok: false,
        status,
        json: async () => ({ error: "bad" }),
      });
      await expect(
        requestOpenAITelefunAssessment({
          sessionId: "s1",
          userId: "u1",
          modelId: "gpt-realtime-2.1",
        }),
      ).rejects.toMatchObject({ name: "PermanentScoringError" });
    }
  });

  it("maps 429/503/504/network to a transient error", async () => {
    const { requestOpenAITelefunAssessment } =
      await import("../lib/telefun-openai-assessment");
    vi.stubEnv("TELEFUN_INTERNAL_URL", "http://localhost:3002");
    vi.stubEnv("TELEFUN_INTERNAL_TOKEN", "shared-secret");
    for (const status of [429, 500, 503, 504]) {
      mockFetchOnce({
        ok: false,
        status,
        json: async () => ({ error: "retry" }),
      });
      await expect(
        requestOpenAITelefunAssessment({
          sessionId: "s1",
          userId: "u1",
          modelId: "gpt-realtime-2.1",
        }),
      ).rejects.toMatchObject({ name: "TransientScoringError" });
    }
    // network failure
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    await expect(
      requestOpenAITelefunAssessment({
        sessionId: "s1",
        userId: "u1",
        modelId: "gpt-realtime-2.1",
      }),
    ).rejects.toMatchObject({ name: "TransientScoringError" });
  });

  it("treats a malformed successful payload as a permanent error", async () => {
    const { requestOpenAITelefunAssessment } =
      await import("../lib/telefun-openai-assessment");
    vi.stubEnv("TELEFUN_INTERNAL_URL", "http://localhost:3002");
    vi.stubEnv("TELEFUN_INTERNAL_TOKEN", "shared-secret");
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ assessment: { not: "valid" } }),
    });
    await expect(
      requestOpenAITelefunAssessment({
        sessionId: "s1",
        userId: "u1",
        modelId: "gpt-realtime-2.1",
      }),
    ).rejects.toMatchObject({ name: "PermanentScoringError" });
  });
});
