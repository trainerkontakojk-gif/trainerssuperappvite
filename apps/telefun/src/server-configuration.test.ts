import { afterEach, describe, expect, it, vi } from "vitest";
import { TELEFUN_CONFIGURATION_CLOSE_CODE } from "@trainers/types";
import type { RealtimeProviderAdapter } from "./providers/RealtimeProviderAdapter.js";
import type { RealtimeProviderRouterResult } from "./providers/provider-router.js";
import {
  TELEFUN_CONFIGURATION_TIMEOUT_MS,
  TELEFUN_MAX_BROWSER_FRAME_BYTES,
  TELEFUN_WEBSOCKET_SERVER_OPTIONS,
  TelefunProviderConfigurationGate,
} from "./server-configuration.js";

function validGeminiConfigure() {
  return {
    type: "telefun_session_configure",
    modelId: "gemini-3.1-flash-live-preview",
    transport: "gemini-live",
    voice: "Kore",
    instructions: "Roleplay test",
    inputAudio: { format: "pcm16", sampleRate: 16_000 },
    responsePacingMode: "realistic",
  };
}

function fakeAdapter(): RealtimeProviderAdapter {
  return {
    connect: vi.fn(),
    handleClientMessage: vi.fn(),
    close: vi.fn(),
    isReady: vi.fn(() => false),
  };
}

function createHarness(
  routeResult: RealtimeProviderRouterResult = {
    ok: true,
    adapter: fakeAdapter(),
  },
) {
  const createAdapter = vi.fn(() => routeResult);
  const onConfigured = vi.fn();
  const onClose = vi.fn();
  const gate = new TelefunProviderConfigurationGate({
    createAdapter,
    onConfigured,
    onClose,
  });
  return { gate, createAdapter, onConfigured, onClose, routeResult };
}

describe("Telefun provider configuration gate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not create an adapter before a valid configure message arrives", () => {
    const { gate, createAdapter } = createHarness();

    gate.start();

    expect(createAdapter).not.toHaveBeenCalled();
    gate.dispose();
  });

  it("creates and connects exactly one adapter for a valid Gemini configure", () => {
    const adapter = fakeAdapter();
    const { gate, createAdapter, onConfigured } = createHarness({
      ok: true,
      adapter,
    });
    gate.start();

    expect(gate.handleMessage(validGeminiConfigure())).toBe(true);

    expect(createAdapter).toHaveBeenCalledOnce();
    expect(adapter.connect).toHaveBeenCalledOnce();
    expect(onConfigured).toHaveBeenCalledOnce();
    expect(onConfigured.mock.calls[0]?.[0].configure.modelId).toBe(
      "gemini-3.1-flash-live-preview",
    );
    expect(onConfigured.mock.calls[0]?.[1]).toBe(adapter);
    expect(gate.isConfigured()).toBe(true);
  });

  it.each([
    ["provider payload", { realtimeInput: { audio: { data: "AA==" } } }],
    ["unknown model", { ...validGeminiConfigure(), modelId: "unknown" }],
    [
      "mismatched transport",
      { ...validGeminiConfigure(), transport: "openai-audio" },
    ],
  ])(
    "rejects %s before configuration without creating an adapter",
    (_label, message) => {
      const { gate, createAdapter, onClose } = createHarness();
      gate.start();

      expect(gate.handleMessage(message)).toBe(true);

      expect(createAdapter).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledWith(
        TELEFUN_CONFIGURATION_CLOSE_CODE,
        expect.stringMatching(/^Telefun configuration rejected:/),
      );
    },
  );

  it("rejects duplicate configure without creating another adapter", () => {
    const { gate, createAdapter, onClose } = createHarness();
    gate.start();
    gate.handleMessage(validGeminiConfigure());

    expect(gate.handleMessage(validGeminiConfigure())).toBe(true);

    expect(createAdapter).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(
      TELEFUN_CONFIGURATION_CLOSE_CODE,
      "Telefun configuration rejected: duplicate_configuration",
    );
  });

  it("times out waiting for configure without creating an adapter", async () => {
    vi.useFakeTimers();
    const { gate, createAdapter, onClose } = createHarness();
    gate.start();

    await vi.advanceTimersByTimeAsync(TELEFUN_CONFIGURATION_TIMEOUT_MS);

    expect(createAdapter).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(
      TELEFUN_CONFIGURATION_CLOSE_CODE,
      "Telefun configuration rejected: configuration_timeout",
    );
  });

  it("rejects a historical GPT configure at 4002 before adapter construction", () => {
    const { gate, createAdapter, onClose } = createHarness();
    gate.start();

    gate.handleMessage({
      ...validGeminiConfigure(),
      modelId: "gpt-realtime-2.1",
      transport: "openai-audio",
      voice: "marin",
      inputAudio: { format: "pcm16", sampleRate: 24_000 },
    });

    expect(createAdapter).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(
      TELEFUN_CONFIGURATION_CLOSE_CODE,
      "Telefun configuration rejected: unknown_model",
    );
    expect(gate.isConfigured()).toBe(false);
  });

  it("publishes a bounded WebSocket maxPayload option used by the server", () => {
    expect(TELEFUN_MAX_BROWSER_FRAME_BYTES).toBe(1_048_576);
    expect(TELEFUN_WEBSOCKET_SERVER_OPTIONS).toEqual({
      maxPayload: TELEFUN_MAX_BROWSER_FRAME_BYTES,
    });
  });

  it("closes a pending adapter when connect rejects", async () => {
    const adapter = fakeAdapter();
    vi.mocked(adapter.connect).mockRejectedValue(new Error("connect failed"));
    const { gate, onConfigured, onClose } = createHarness({
      ok: true,
      adapter,
    });
    gate.start();

    gate.handleMessage(validGeminiConfigure());
    await Promise.resolve();

    expect(adapter.close).toHaveBeenCalledWith(
      1011,
      "Realtime provider connection failed",
    );
    expect(onConfigured).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(
      1011,
      "Realtime provider connection failed",
    );
  });

  it("closes a pending adapter on dispose and ignores its late resolve", async () => {
    let resolveConnect!: () => void;
    const adapter = fakeAdapter();
    vi.mocked(adapter.connect).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveConnect = resolve;
      }),
    );
    const { gate, onConfigured } = createHarness({ ok: true, adapter });
    gate.start();
    gate.handleMessage(validGeminiConfigure());

    gate.dispose();
    resolveConnect();
    await Promise.resolve();

    expect(adapter.close).toHaveBeenCalledWith(
      1000,
      "Telefun configuration gate disposed",
    );
    expect(onConfigured).not.toHaveBeenCalled();
    expect(gate.isConfigured()).toBe(false);
  });

  it("closes malformed pre-configuration frames through the stable 4002 path", () => {
    const { gate, createAdapter, onClose } = createHarness();
    gate.start();

    gate.rejectClientMessage("invalid_envelope");

    expect(createAdapter).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledWith(
      TELEFUN_CONFIGURATION_CLOSE_CODE,
      "Telefun configuration rejected: invalid_envelope",
    );
  });
});
