import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock("../lib/ai-models", () => ({
  AI_MODELS: [],
  DEFAULT_AI_MODEL_ID: "gemini-test",
  getGeminiClient: () => ({ models: { generateContent } }),
  getProviderFromModelId: () => "gemini",
}));

vi.mock("../lib/ai-usage", () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

import { generateGeminiContent } from "../lib/gemini";

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.useFakeTimers();
  generateContent.mockReset();
  generateContent.mockResolvedValue({ text: "ok" });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Gemini sampling parameter compatibility", () => {
  const contents = [{ role: "user", parts: [{ text: "Hello" }] }];

  it("omits temperature from the main request even when explicitly supplied", async () => {
    const result = await generateGeminiContent({ contents, temperature: 0.3 });

    expect(result).toMatchObject({ success: true, text: "ok" });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config).not.toHaveProperty(
      "temperature",
    );
  });

  it("omits temperature from the developer-instruction retry request", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    generateContent.mockRejectedValueOnce(
      new Error("Developer instruction is not enabled"),
    );

    const result = await generateGeminiContent({
      contents,
      systemInstruction: "Return a short answer.",
      temperature: 0.3,
    });

    expect(result).toMatchObject({ success: true, text: "ok" });
    expect(generateContent).toHaveBeenCalledTimes(2);
    const retry = generateContent.mock.calls[1][0];
    expect(retry.config).not.toHaveProperty("systemInstruction");
    expect(retry.contents[0].parts[0].text).toContain("Return a short answer.");
    expect(retry.config).not.toHaveProperty("temperature");
  });

  it("does not send a default temperature when the option is omitted", async () => {
    const result = await generateGeminiContent({ contents });

    expect(result).toMatchObject({ success: true, text: "ok" });
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config).not.toHaveProperty(
      "temperature",
    );
  });
});
