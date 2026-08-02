import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSession } from "../routes/telefun/services/liveSession";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

type MessageHandler = ((event: { data: string }) => void) | null;

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "";
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: MessageHandler = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  addEventListener(
    type: string,
    handler: (event: { data: string }) => void,
    options?: { once?: boolean },
  ) {
    if (type === "message") {
      this.onmessage = options?.once
        ? (event) => {
            this.onmessage = null;
            handler(event);
          }
        : handler;
    }
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

function createMockConfig(): TelefunAppSettings {
  return {
    scenarios: [
      { id: "scenario-1", title: "Skenario", instruction: "Roleplay" },
    ],
    consumerTypes: [
      {
        id: "consumer-1",
        name: "Nasabah Ramah",
        description: "Nasabah kooperatif.",
        difficulty: "Mudah",
      },
    ],
    identitySettings: undefined,
    sessionId: "session-1",
    consumerName: "Test",
    consumerGender: "male",
    voiceName: "Kore",
    telefunModelId: "gemini-3.1-flash-live-preview",
    telefunTransport: "gemini-live",
    maxCallDuration: 0,
    responsePacingMode: "realistic",
    simulationChallengeTypes: [],
    activeScenario: undefined,
    activeConsumerType: undefined,
    resolvedIdentity: undefined,
  } as unknown as TelefunAppSettings;
}

describe("LiveSession first-message authentication", () => {
  const sockets: FakeWebSocket[] = [];
  let session: LiveSession | null = null;

  beforeEach(() => {
    vi.stubEnv(
      "VITE_TELEFUN_WS_URL",
      "wss://telefun.test?token=legacy-leak&sessionId=legacy-session",
    );
    vi.stubGlobal(
      "WebSocket",
      class extends FakeWebSocket {
        static readonly OPEN = FakeWebSocket.OPEN;
        static readonly CONNECTING = FakeWebSocket.CONNECTING;
        static readonly CLOSED = FakeWebSocket.CLOSED;

        constructor(url: string) {
          super(url);
          sockets.push(this);
        }
      },
    );
    class FakeAudioContext {
      state = "running";
      close = vi.fn(async () => undefined);
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
      },
    });
    vi.spyOn(LiveSession.prototype as any, "setupRecorders").mockImplementation(
      () => undefined,
    );
    vi.spyOn(
      LiveSession.prototype as any,
      "setupInputProcessing",
    ).mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (session) {
      (
        session as unknown as { stopStalledWatchdog: () => void }
      ).stopStalledWatchdog();
    }
    session = null;
    sockets.length = 0;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("sends authenticate, configure, then Gemini setup in deterministic order", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const config = createMockConfig();
    const onSessionCreated = vi.fn();
    session = new LiveSession(config);
    session.onSessionCreated = onSessionCreated;

    await session.connect("test-access-token");

    const socket = sockets[0];
    expect(socket).toBeDefined();
    expect(new URL(socket.url).search).toBe("");
    expect(JSON.stringify(consoleLog.mock.calls)).not.toContain("legacy-leak");

    socket.open();
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: "authenticate",
      token: "test-access-token",
      sessionId: "session-1",
    });

    socket.receive({ type: "auth_ok", sessionId: "session-1" });

    expect(
      (session as unknown as { hasAuthenticated: boolean }).hasAuthenticated,
    ).toBe(true);
    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
    expect(socket.sent).toHaveLength(2);
    const configureMessage = JSON.parse(socket.sent[1]);
    expect(configureMessage).toMatchObject({
      type: "telefun_session_configure",
      modelId: "gemini-3.1-flash-live-preview",
      transport: "gemini-live",
      voice: expect.any(String),
      instructions: expect.any(String),
      inputAudio: { format: "pcm16", sampleRate: 16_000 },
      responsePacingMode: "realistic",
    });
    expect(configureMessage).not.toHaveProperty("setup");

    socket.receive({
      type: "telefun_session_configured",
      modelId: "gemini-3.1-flash-live-preview",
      transport: "gemini-live",
    });

    expect(socket.sent).toHaveLength(3);
    const setupMessage = JSON.parse(socket.sent[2]);
    expect(setupMessage.setup).toBeDefined();
    expect(
      setupMessage.setup.generationConfig.speechConfig.voiceConfig
        .prebuiltVoiceConfig.voiceName,
    ).toBe(configureMessage.voice);
    expect(onSessionCreated).toHaveBeenCalledWith("session-1");
  });

  it("does not open Gemini setup when the auth response is invalid or missing", async () => {
    session = new LiveSession(createMockConfig());
    await session.connect("test-access-token");

    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "unauthorized" });
    expect(socket.sent).toHaveLength(1);

    socket.receive({ type: "auth_ok" });
    expect(socket.sent).toHaveLength(1);
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("clears auth timers and audio resources when the proxy rejects authentication", async () => {
    vi.useFakeTimers();
    session = new LiveSession(createMockConfig());
    const cleanupAudio = vi
      .spyOn(session as any, "cleanupAudio")
      .mockImplementation(() => undefined);
    const onError = vi.fn();
    session.onError = onError;

    await session.connect("test-access-token");
    const socket = sockets[0];
    socket.open();

    expect((session as any).setupTimeoutTimer).not.toBeNull();
    expect((session as any).stalledWatchdogTimer).not.toBeNull();

    socket.close(4001, "Unauthorized");

    expect((session as any).setupTimeoutTimer).toBeNull();
    expect((session as any).stalledWatchdogTimer).toBeNull();
    expect(cleanupAudio).toHaveBeenCalledTimes(1);

    const errorCountAfterClose = onError.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(onError).toHaveBeenCalledTimes(errorCountAfterClose);
  });

  it("publishes the exact legacy capture stream and clears it during cleanup", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    const onLocalStream = vi.fn();
    session = new LiveSession(createMockConfig());
    session.onLocalStream = onLocalStream;

    await session.connect("test-access-token");

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(onLocalStream).toHaveBeenLastCalledWith(stream);

    vi.useFakeTimers();
    const disconnect = session.disconnect("cleanup");
    await vi.advanceTimersByTimeAsync(500);
    await disconnect;
    expect(onLocalStream).toHaveBeenLastCalledWith(null);
  });

  it("rejects openai-webrtc before microphone or legacy WebSocket setup", async () => {
    const config = {
      ...createMockConfig(),
      telefunTransport: "openai-webrtc",
    } as unknown as TelefunAppSettings;
    const onError = vi.fn();
    session = new LiveSession(config);
    session.onError = onError;

    await expect(session.connect("test-access-token")).rejects.toThrow(
      /OpenAIWebRtcSession/,
    );

    expect(onError).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("does not send configure when auth_ok arrives after disconnect begins", async () => {
    session = new LiveSession(createMockConfig());
    await session.connect("test-access-token");
    const socket = sockets[0];
    socket.open();
    (session as unknown as { intentionalClose: boolean }).intentionalClose =
      true;

    socket.receive({ type: "auth_ok", sessionId: "session-1" });

    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]).type).toBe("authenticate");
  });

  it("does not send Gemini setup when configured ack arrives after disconnect begins", async () => {
    session = new LiveSession(createMockConfig());
    await session.connect("test-access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-1" });
    expect(socket.sent).toHaveLength(2);

    (session as unknown as { intentionalClose: boolean }).intentionalClose =
      true;
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gemini-3.1-flash-live-preview",
      transport: "gemini-live",
    });

    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[1]).type).toBe("telefun_session_configure");
  });
});
