import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateOpenRouterContent } from "../lib/openrouter";

describe("generateOpenRouterContent", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the OpenRouter error message for 401 responses", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({ error: { message: "Your API key is invalid." } }),
    } as Response);

    const result = await generateOpenRouterContent({
      contents: [{ role: "user", parts: [{ text: "Halo" }] }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Your API key is invalid.");
  });
});
