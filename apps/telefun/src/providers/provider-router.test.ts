import { describe, expect, it, vi } from "vitest";
import type { ValidatedTelefunSessionConfigure } from "../server-protocol.js";
import type { RealtimeProviderAdapter } from "./RealtimeProviderAdapter.js";
import { createRealtimeProviderAdapter } from "./provider-router.js";
import { parseTelefunSessionConfigure } from "../server-protocol.js";

function validatedGeminiConfigure(): ValidatedTelefunSessionConfigure {
  const parsed = parseTelefunSessionConfigure({
    type: "telefun_session_configure",
    modelId: "gemini-3.1-flash-live-preview",
    transport: "gemini-live",
    voice: "Kore",
    instructions: "Roleplay test",
    inputAudio: { format: "pcm16", sampleRate: 16_000 },
    responsePacingMode: "realistic",
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

function nonGeminiConfigure(): ValidatedTelefunSessionConfigure {
  const configuration = validatedGeminiConfigure();
  return {
    configure: {
      ...configuration.configure,
      modelId: "gpt-realtime-2.1",
      transport: "openai-audio",
      voice: "marin",
      inputAudio: { format: "pcm16", sampleRate: 24_000 },
    },
    model: {
      ...configuration.model,
      id: "gpt-realtime-2.1",
      provider: "openai",
      realtime: {
        ...configuration.model.realtime,
        transport: "openai-audio",
      },
    },
  } as unknown as ValidatedTelefunSessionConfigure;
}

function fakeAdapter(): RealtimeProviderAdapter {
  return {
    connect: vi.fn(),
    handleClientMessage: vi.fn(),
    close: vi.fn(),
    isReady: vi.fn(() => false),
  };
}

describe("Telefun Gemini-only provider router", () => {
  it("instantiates Gemini through the active Gemini factory", () => {
    const adapter = fakeAdapter();
    const createGeminiAdapter = vi.fn(() => adapter);
    const configuration = validatedGeminiConfigure();

    expect(
      createRealtimeProviderAdapter(configuration, { createGeminiAdapter }),
    ).toEqual({ ok: true, adapter });
    expect(createGeminiAdapter).toHaveBeenCalledOnce();
    expect(createGeminiAdapter).toHaveBeenCalledWith(configuration);
  });

  it("fails closed for a non-Gemini input even when retired OpenAI flags request admission", () => {
    const createGeminiAdapter = vi.fn(() => fakeAdapter());
    const createOpenAIAdapter = vi.fn(() => fakeAdapter());

    expect(
      createRealtimeProviderAdapter(nonGeminiConfigure(), {
        createGeminiAdapter,
        createOpenAIAdapter,
        openAIEnabled: true,
        openAIConfigured: true,
      } as never),
    ).toEqual({ ok: false, reason: "unsupported_provider" });
    expect(createGeminiAdapter).not.toHaveBeenCalled();
    expect(createOpenAIAdapter).not.toHaveBeenCalled();
  });
});
