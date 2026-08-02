import { describe, expect, it, vi } from "vitest";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";
import {
  cleanupOpenAIWebRtcSession,
  createTelefunTransport,
  deriveTelefunBrokerHttpBaseUrl,
  mapOpenAIWebRtcSpeakingEvent,
  OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE,
  OpenAIWebRtcTransport,
  type TelefunWebRtcFactoryEnvironment,
} from "../routes/telefun/services/telefunTransport";

const baseConfig = {
  telefunTransport: "openai-webrtc",
  telefunModelId: "gpt-realtime-2.1",
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
} as unknown as TelefunAppSettings;

describe("Telefun transport selection", () => {
  it("derives the broker origin from the configured websocket URL", () => {
    expect(deriveTelefunBrokerHttpBaseUrl("wss://telefun.example/ws")).toBe(
      "https://telefun.example",
    );
    expect(
      deriveTelefunBrokerHttpBaseUrl("ws://localhost:3002/ws?token=ignored"),
    ).toBe("http://localhost:3002");
  });

  it("maps current Realtime audio event names while retaining tested legacy aliases", () => {
    expect(mapOpenAIWebRtcSpeakingEvent("response.output_audio.delta")).toBe(
      true,
    );
    expect(mapOpenAIWebRtcSpeakingEvent("response.output_audio.done")).toBe(
      false,
    );
    expect(mapOpenAIWebRtcSpeakingEvent("response.audio.delta")).toBe(true);
    expect(mapOpenAIWebRtcSpeakingEvent("response.audio.done")).toBe(false);
    expect(mapOpenAIWebRtcSpeakingEvent("conversation.item.created")).toBe(
      null,
    );
  });

  it("enters failed cleanup automatically for duplicate provider errors", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(init?.method).toBe("DELETE");
      expect(url.search).toBe("?outcome=failed");
      return new Response(null, { status: 204 });
    });
    const transport = new OpenAIWebRtcTransport(baseConfig, "token", {
      websocketUrl: "wss://telefun.example/ws",
      RTCPeerConnection: class {} as unknown as TelefunWebRtcFactoryEnvironment["RTCPeerConnection"],
      mediaDevices: { getUserMedia: vi.fn() },
      fetch,
      audioElement: { srcObject: null, play: vi.fn() },
    });
    const errors: Error[] = [];
    const providerEvents: unknown[] = [];
    transport.onError = (error) => errors.push(error);
    transport.onProviderEvent = (event) => providerEvents.push(event);
    const providerError = {
      kind: "event" as const,
      type: "error" as const,
      payload: { type: "error", error: { message: "raw provider secret" } },
    };

    (transport as unknown as { handleProviderEvent: (event: unknown) => void }).handleProviderEvent(providerError);
    (transport as unknown as { handleProviderEvent: (event: unknown) => void }).handleProviderEvent(providerError);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await transport.disconnect("user");

    expect(errors[0]?.message).toBe(OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE);
    expect(errors[0]?.message).not.toContain("raw provider secret");
    expect(JSON.stringify(providerEvents)).not.toContain("raw provider secret");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps failed cleanup best-effort when UI observers throw", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      expect(new URL(String(input)).search).toBe("?outcome=failed");
      return new Response(null, { status: 204 });
    });
    const transport = new OpenAIWebRtcTransport(baseConfig, "token", {
      websocketUrl: "wss://telefun.example/ws",
      RTCPeerConnection: class {} as unknown as TelefunWebRtcFactoryEnvironment["RTCPeerConnection"],
      mediaDevices: { getUserMedia: vi.fn() },
      fetch,
      audioElement: { srcObject: null, play: vi.fn() },
    });
    transport.onProviderEvent = () => {
      throw new Error("observer failed");
    };
    transport.onError = () => {
      throw new Error("ui observer failed");
    };

    (transport as unknown as { handleProviderEvent: (event: unknown) => void }).handleProviderEvent({
      kind: "event",
      type: "error",
      payload: { type: "error", error: { message: "raw provider secret" } },
    });

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });

  it("bounds direct setup cleanup and aborts a stalled DELETE", async () => {
    let requestInit: RequestInit | undefined;
    const cleanup = cleanupOpenAIWebRtcSession({
      websocketUrl: "wss://telefun.example/ws",
      sessionId: baseConfig.sessionId!,
      accessToken: "token",
      fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        requestInit = init;
        return await new Promise<Response>(() => {});
      }),
      timeoutMs: 100,
    } as Parameters<typeof cleanupOpenAIWebRtcSession>[0] & {
      timeoutMs: number;
    });

    const outcome = await Promise.race([
      cleanup.then(
        () => "completed" as const,
        () => "rejected" as const,
      ),
      new Promise<"deadline">((resolve) => setTimeout(() => resolve("deadline"), 200)),
    ]);
    expect(outcome).toBe("rejected");
    expect(requestInit?.signal?.aborted).toBe(true);
  });

  it("selects WebRTC before connect without constructing LiveSession", () => {
    const session = createTelefunTransport(baseConfig, {
      accessToken: "token",
      env: {
        websocketUrl: "wss://telefun.example/ws",
        RTCPeerConnection:
          class {} as unknown as TelefunWebRtcFactoryEnvironment["RTCPeerConnection"],
        mediaDevices: { getUserMedia: vi.fn() },
        fetch: vi.fn(),
        audioElement: { srcObject: null, play: vi.fn() },
      },
    });

    expect(session.constructor.name).toContain("OpenAIWebRtc");
    expect(session.connect).toBeTypeOf("function");
  });
});
