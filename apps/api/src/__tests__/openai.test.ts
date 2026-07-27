import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ai-usage", () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}));

import { generateOpenAIContent } from "../lib/openai";
import { logAiUsage } from "../lib/ai-usage";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OPENAI_API_KEY;
  vi.restoreAllMocks();
  vi.mocked(logAiUsage).mockClear();
});

describe("direct OpenAI Responses API", () => {
  it("sends instructions/input and extracts text.format JSON plus usage", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: '{"ok":true}',
          usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
        }),
        { status: 200 },
      ),
    );

    const result = await generateOpenAIContent({
      model: "gpt-5.4-mini",
      systemInstruction: "You return JSON.",
      contents: [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "assistant", parts: [{ text: "Hi" }] },
      ],
      responseMimeType: "application/json",
    });

    expect(result).toMatchObject({ success: true, text: '{"ok":true}' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-openai-key",
        }),
        body: expect.stringContaining('"instructions":"You return JSON."'),
      }),
    );
    const body = JSON.parse(
      vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string,
    );
    expect(body.input).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
    expect(body.store).toBe(false);
    expect(body.text.format.type).toBe("json_object");
  });

  it("logs one successful terminal usage row after retries and maps model to assistant", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: "completed",
        output_text: "done",
        usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
      }), { status: 200 }));

    const result = await generateOpenAIContent({
      model: "gpt-5.4-mini",
      contents: [{ role: "model", parts: [{ text: "previous" }] }],
      usageContext: { module: "ketik", action: "chat_response" },
      userId: "user-1",
    });

    expect(result).toMatchObject({ success: true, text: "done" });
    expect(JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string).input)
      .toEqual([{ role: "assistant", content: "previous" }]);
    expect(logAiUsage).toHaveBeenCalledTimes(1);
    expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({
      status: "success",
      tokens: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      requestId: expect.stringMatching(/^openai-/),
    }));
  });

  it.each([
    ["refusal", { status: "completed", output: [{ content: [{ type: "refusal", refusal: "no" }] }] }],
    ["incomplete", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "partial" }],
    ["empty", { status: "completed", output_text: "   " }],
  ])("returns safe failure and logs failed usage for %s responses", async (_label, payload) => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    const result = await generateOpenAIContent({
      model: "gpt-5.4-mini",
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      usageContext: { module: "pdkt", action: "generate_template" },
      userId: "user-1",
    });

    expect(result.success).toBe(false);
    expect(result.text).toBeUndefined();
    expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      tokens: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    }));
  });

  it("logs timeout and safely handles missing key without calling the paid API", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    globalThis.fetch = vi.fn().mockRejectedValue(new DOMException("timeout", "AbortError"));

    const timeout = await generateOpenAIContent({
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      usageContext: { module: "ketik", action: "chat_response" },
      userId: "user-1",
    });
    expect(timeout.success).toBe(false);
    expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({ status: "timeout" }));

    vi.mocked(logAiUsage).mockClear();
    vi.mocked(globalThis.fetch).mockClear();
    delete process.env.OPENAI_API_KEY;
    const missingKey = await generateOpenAIContent({
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      usageContext: { module: "ketik", action: "chat_response" },
      userId: "user-1",
    });
    expect(missingKey.success).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("returns safe failure and logs terminal failure for HTTP, malformed, and exception errors", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const cases = [
      () => new Response(JSON.stringify({ error: { message: "upstream" } }), { status: 500 }),
      () => new Response("not-json", { status: 200 }),
      () => { throw new Error("network"); },
    ];

    for (const createResponse of cases) {
      vi.mocked(logAiUsage).mockClear();
      globalThis.fetch = vi.fn().mockImplementation(async () => createResponse());
      const result = await generateOpenAIContent({
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
        usageContext: { module: "ketik", action: "chat_response" },
        userId: "user-1",
      });
      expect(result.success).toBe(false);
      expect(result.text).toBeUndefined();
      expect(logAiUsage).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    }
  });

  it("rejects unsupported input roles safely", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    globalThis.fetch = vi.fn();
    const result = await generateOpenAIContent({
      contents: [{ role: "system", parts: [{ text: "bad" }] }],
      usageContext: { module: "ketik", action: "chat_response" },
      userId: "user-1",
    });
    expect(result).toMatchObject({ success: false, error: "Format pesan AI tidak didukung." });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("extracts nested output content defensively", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: "output_text", text: "nested" }] }],
        }),
        { status: 200 },
      ),
    );

    await expect(
      generateOpenAIContent({
        model: "gpt-5.4-mini",
        contents: [{ role: "user", parts: [{ text: "Hello" }] }],
      }),
    ).resolves.toMatchObject({ success: true, text: "nested" });
  });
});
