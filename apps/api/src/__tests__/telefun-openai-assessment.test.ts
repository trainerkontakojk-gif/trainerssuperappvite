import { afterEach, describe, expect, it, vi } from "vitest";

const DISABLED_REASON =
  "Penilaian OpenAI Realtime tidak lagi tersedia untuk Telefun.";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("requestOpenAITelefunAssessment", () => {
  it("is a permanent local disable and never opens the internal scoring transport", async () => {
    const { requestOpenAITelefunAssessment } =
      await import("../lib/telefun-openai-assessment");
    vi.stubEnv("TELEFUN_INTERNAL_URL", "http://localhost:3002");
    vi.stubEnv("TELEFUN_INTERNAL_TOKEN", "shared-secret");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestOpenAITelefunAssessment({
        sessionId: "s1",
        userId: "u1",
        modelId: "gpt-realtime-2.1",
      }),
    ).rejects.toMatchObject({
      name: "PermanentScoringError",
      code: "TELEFUN_OPENAI_SCORING_DISABLED",
      message: DISABLED_REASON,
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
