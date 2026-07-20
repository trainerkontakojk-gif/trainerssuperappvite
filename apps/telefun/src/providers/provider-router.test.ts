import { describe, expect, it, vi } from "vitest";
import type { RealtimeProviderAdapter } from "./RealtimeProviderAdapter.js";
import { createRealtimeProviderAdapter } from "./provider-router.js";
import { parseTelefunSessionConfigure } from "../server-protocol.js";

function validatedConfigure(overrides: Record<string, unknown> = {}) {
  const parsed = parseTelefunSessionConfigure({
    type: "telefun_session_configure",
    modelId: "gemini-3.1-flash-live-preview",
    transport: "gemini-live",
    voice: "Kore",
    instructions: "Roleplay test",
    inputAudio: { format: "pcm16", sampleRate: 16000 },
    responsePacingMode: "realistic",
    ...overrides,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function fakeAdapter(): RealtimeProviderAdapter {
  return {
    connect: vi.fn(),
    handleClientMessage: vi.fn(),
    close: vi.fn(),
    isReady: vi.fn(() => false),
  };
}

describe("Telefun realtime provider router skeleton", () => {
  it("instantiates Gemini through the allowlisted Gemini factory", () => {
    const adapter = fakeAdapter();
    const createGeminiAdapter = vi.fn(() => adapter);

    expect(
      createRealtimeProviderAdapter(validatedConfigure(), {
        createGeminiAdapter,
      }),
    ).toEqual({ ok: true, adapter });
    expect(createGeminiAdapter).toHaveBeenCalledOnce();
    expect(createGeminiAdapter).toHaveBeenCalledWith(validatedConfigure());
  });

  it("returns an explicit disabled error for OpenAI without instantiating Gemini", () => {
    const createGeminiAdapter = vi.fn(() => fakeAdapter());
    const createOpenAIAdapter = vi.fn(() => fakeAdapter());
    const openAiConfigure = validatedConfigure({
      modelId: "gpt-realtime-2.1",
      transport: "openai-audio",
      voice: "marin",
      inputAudio: { format: "pcm16", sampleRate: 24000 },
    });

    expect(
      createRealtimeProviderAdapter(openAiConfigure, {
        createGeminiAdapter,
        createOpenAIAdapter,
        openAIEnabled: false,
        openAIConfigured: true,
      }),
    ).toEqual({ ok: false, reason: "openai_disabled" });
    expect(createGeminiAdapter).not.toHaveBeenCalled();
    expect(createOpenAIAdapter).not.toHaveBeenCalled();
  });

  it("returns not-configured when the flag is enabled but the key is absent", () => {
    const createGeminiAdapter = vi.fn(() => fakeAdapter());
    const createOpenAIAdapter = vi.fn(() => fakeAdapter());
    const openAiConfigure = validatedConfigure({
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
      voice: "cedar",
      inputAudio: { format: "pcm16", sampleRate: 24000 },
    });

    expect(
      createRealtimeProviderAdapter(openAiConfigure, {
        createGeminiAdapter,
        createOpenAIAdapter,
        openAIEnabled: true,
        openAIConfigured: false,
      }),
    ).toEqual({ ok: false, reason: "openai_not_configured" });
    expect(createGeminiAdapter).not.toHaveBeenCalled();
    expect(createOpenAIAdapter).not.toHaveBeenCalled();
  });

  it("instantiates only OpenAI when both flag and key readiness are true", () => {
    const adapter = fakeAdapter();
    const createGeminiAdapter = vi.fn(() => fakeAdapter());
    const createOpenAIAdapter = vi.fn(() => adapter);
    const openAiConfigure = validatedConfigure({
      modelId: "gpt-realtime-2.1",
      transport: "openai-audio",
      voice: "marin",
      inputAudio: { format: "pcm16", sampleRate: 24000 },
    });

    expect(
      createRealtimeProviderAdapter(openAiConfigure, {
        createGeminiAdapter,
        createOpenAIAdapter,
        openAIEnabled: true,
        openAIConfigured: true,
      }),
    ).toEqual({ ok: true, adapter });
    expect(createOpenAIAdapter).toHaveBeenCalledOnce();
    expect(createOpenAIAdapter).toHaveBeenCalledWith(openAiConfigure);
    expect(createGeminiAdapter).not.toHaveBeenCalled();
  });
});
