import { describe, expect, it, vi } from "vitest";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";
import {
  cleanupOpenAIWebRtcSession,
  createTelefunTransport,
  deriveTelefunBrokerHttpBaseUrl,
  mapOpenAIWebRtcSpeakingEvent,
  mapTelefunTransportError,
  OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE,
  OpenAIWebRtcTransport,
  type TelefunWebRtcFactoryEnvironment,
} from "../routes/telefun/services/telefunTransport";

const baseConfig = {
  telefunTransport: "openai-webrtc",
  telefunModelId: "gpt-realtime-2.1",
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
} as unknown as TelefunAppSettings;

describe("Telefun transport error mapping", () => {
  it("uses microphone copy only for a denied or missing microphone", () => {
    expect(
      mapTelefunTransportError({ name: "NotAllowedError" }),
    ).toBe("Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.");
    expect(
      mapTelefunTransportError({ name: "NotFoundError" }),
    ).toBe("Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.");
  });

  it("maps all browser microphone access failures to microphone copy", () => {
    for (const name of ["NotReadableError", "OverconstrainedError"]) {
      expect(mapTelefunTransportError({ name })).toBe(
        "Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.",
      );
    }
    expect(mapTelefunTransportError({ code: "microphone_access_failed" })).toBe(
      "Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.",
    );
  });

  it("maps an unplugged device to microphone copy", () => {
    expect(
      mapTelefunTransportError({ cause: { code: "device_unplugged" } }),
    ).toBe("Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.");
  });

  it("keeps browser and offer failures on the unknown fallback", () => {
    expect(mapTelefunTransportError({ code: "browser_webrtc_unavailable" })).toBe(
      "Panggilan belum dapat dimulai. Silakan coba lagi.",
    );
    expect(mapTelefunTransportError({ code: "webrtc_offer_failed" })).toBe(
      "Panggilan belum dapat dimulai. Silakan coba lagi.",
    );
  });

  it("maps broker fetch failures to network copy", () => {
    expect(mapTelefunTransportError({ code: "broker_network_failed" })).toBe(
      "Koneksi terputus. Sesi ini ditutup; buat sesi baru untuk melanjutkan.",
    );
  });

  it("maps provider failures to safe upstream copy", () => {
    expect(
      mapTelefunTransportError({ code: "provider_error" }),
    ).toBe(OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE);
  });

  it("maps network failures to connection copy", () => {
    const expected =
      "Koneksi terputus. Sesi ini ditutup; buat sesi baru untuk melanjutkan.";
    expect(mapTelefunTransportError({ code: "network_lost" })).toBe(expected);
    expect(mapTelefunTransportError(new Error("Peer connection failed."))).toBe(
      expected,
    );
    expect(mapTelefunTransportError(new Error("Data channel closed."))).toBe(
      expected,
    );
  });

  it("maps connection timeout separately from generic failures", () => {
    expect(
      mapTelefunTransportError({ code: "connection_timeout" }),
    ).toBe(
      "Waktu menghubungkan panggilan habis. Periksa koneksi internet dan coba lagi.",
    );
    expect(
      mapTelefunTransportError(new Error("WebRTC connection timed out.")),
    ).toBe(
      "Waktu menghubungkan panggilan habis. Periksa koneksi internet dan coba lagi.",
    );
  });

  it("maps cleanup finalization failures without blaming the microphone", () => {
    expect(
      mapTelefunTransportError({ code: "cleanup_pending" }),
    ).toBe("Panggilan belum tersimpan. Coba lagi untuk mengakhiri.");
    expect(
      mapTelefunTransportError({ code: "broker_finalization", status: 503 }),
    ).toBe("Panggilan belum tersimpan. Coba lagi untuk mengakhiri.");
    expect(
      mapTelefunTransportError(new Error("OpenAI WebRTC broker delete failed.")),
    ).toBe("Panggilan belum tersimpan. Coba lagi untuk mengakhiri.");
  });

  it("does not let broker network code become provider from its message", () => {
    expect(
      mapTelefunTransportError({
        code: "broker_network_failed",
        message: "OpenAI WebRTC broker request failed.",
      }),
    ).toBe("Koneksi terputus. Sesi ini ditutup; buat sesi baru untuk melanjutkan.");
  });

  it("does not treat a provider or bare 503 as cleanup", () => {
    expect(
      mapTelefunTransportError({ status: 503, code: "provider_error" }),
    ).toBe(OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE);
    expect(mapTelefunTransportError({ status: 503 })).toBe(
      "Panggilan belum dapat dimulai. Silakan coba lagi.",
    );
  });

  it("uses a generic safe fallback for unknown failures", () => {
    expect(mapTelefunTransportError(new Error("secret provider payload"))).toBe(
      "Panggilan belum dapat dimulai. Silakan coba lagi.",
    );
  });
});

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
