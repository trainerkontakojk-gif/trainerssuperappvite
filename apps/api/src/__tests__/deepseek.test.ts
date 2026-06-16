import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateDeepSeekContent } from "../lib/deepseek";

describe("generateDeepSeekContent", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("calls the DeepSeek endpoint with the direct model id", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Halo" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }),
      text: async () => JSON.stringify({}),
    } as Response);

    const result = await generateDeepSeekContent({
      model: "deepseek-v4-pro",
      contents: [{ role: "user", parts: [{ text: "Hai" }] }],
    });

    expect(result.success).toBe(true);
    expect(result.text).toBe("Halo");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
