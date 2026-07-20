import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSession } from "../routes/telefun/services/liveSession";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

type MessageHandler = ((event: { data: string | ArrayBuffer }) => void) | null;

interface FakeAudioSource {
  buffer: { duration: number } | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

interface FakeAudioContextInstance {
  currentTime: number;
  destination: Record<string, never>;
  sources: FakeAudioSource[];
  createBuffer: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  binaryType = "";
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: MessageHandler = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  addEventListener(
    type: string,
    handler: (event: { data: string | ArrayBuffer }) => void,
    options?: { once?: boolean },
  ) {
    if (type !== "message") return;
    this.onmessage = options?.once
      ? (event) => {
          this.onmessage = null;
          handler(event);
        }
      : handler;
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  receiveRaw(raw: string) {
    this.onmessage?.({ data: raw });
  }
}

function createOpenAiConfig(): TelefunAppSettings {
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
    sessionId: "session-openai",
    consumerName: "Test",
    consumerGender: "male",
    voiceName: "cedar",
    telefunModelId: "gpt-realtime-2.1-mini",
    telefunTransport: "openai-audio",
    maxCallDuration: 0,
    responsePacingMode: "realistic",
    simulationChallengeTypes: [],
    activeScenario: undefined,
    activeConsumerType: undefined,
    resolvedIdentity: {
      name: "Test",
      gender: "male",
      phone: "08123456789",
      city: "Jakarta",
      voiceName: "cedar",
      signatureName: "",
    },
  } as unknown as TelefunAppSettings;
}

describe("LiveSession OpenAI browser runtime", () => {
  const sockets: FakeWebSocket[] = [];
  const sessions: LiveSession[] = [];
  let requestedAudio: MediaTrackConstraints | boolean | undefined;
  let audioContextSampleRate: number | undefined;
  const audioContexts: FakeAudioContextInstance[] = [];

  beforeEach(() => {
    vi.stubEnv("VITE_TELEFUN_WS_URL", "wss://telefun.test/ws");
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
      currentTime = 10;
      destination = {};
      sources: FakeAudioSource[] = [];
      state = "running";
      close = vi.fn(async () => undefined);
      createBuffer = vi.fn(
        (_channels: number, length: number, sampleRate: number) => ({
          duration: length / sampleRate,
          getChannelData: () => new Float32Array(length),
        }),
      );
      createBufferSource = vi.fn(() => {
        const source: FakeAudioSource = {
          buffer: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null,
        };
        this.sources.push(source);
        return source;
      });

      constructor(options?: AudioContextOptions) {
        audioContextSampleRate = options?.sampleRate;
        audioContexts.push(this);
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal("window", { AudioContext: FakeAudioContext });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => {
          requestedAudio = constraints.audio;
          return { getTracks: () => [] };
        }),
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
    for (const session of sessions) {
      (session as any).clearSetupTimeout();
      (session as any).stopStalledWatchdog();
    }
    sessions.length = 0;
    sockets.length = 0;
    audioContexts.length = 0;
    requestedAudio = undefined;
    audioContextSampleRate = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("authenticates then sends one provider-neutral OpenAI configure envelope at 24 kHz", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    const onError = vi.fn();
    session.onError = onError;

    await session.connect("access-token");

    expect(onError).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(1);
    expect(requestedAudio).toMatchObject({ sampleRate: 24_000 });
    expect(audioContextSampleRate).toBe(24_000);

    const socket = sockets[0];
    socket.open();
    expect(socket.sent.map((raw) => JSON.parse(raw))).toEqual([
      {
        type: "authenticate",
        token: "access-token",
        sessionId: "session-openai",
      },
    ]);

    socket.receive({ type: "auth_ok", sessionId: "session-openai" });

    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      type: "telefun_session_configure",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
      voice: "cedar",
      inputAudio: { format: "pcm16", sampleRate: 24_000 },
      responsePacingMode: "realistic",
    });
  });

  it("treats the OpenAI configured ack as ready without sending Gemini setup", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    const states: string[] = [];
    session.onStateChange = (state) => states.push(state);

    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });

    expect(socket.sent).toHaveLength(2);
    expect(socket.sent.some((raw) => "setup" in JSON.parse(raw))).toBe(false);
    expect((session as any).isSetupComplete).toBe(true);
    expect(states.at(-1)).toBe("ready");
    expect((session as any).setupTimeoutTimer).toBeNull();
  });

  it("sends captured PCM16 as an exact input_audio_buffer.append event", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });

    const frame = new Float32Array([0, 0.5, -0.5, 1, -1]);
    (session as any).handleInputAudioFrame(frame);

    const expectedPcm = new Int16Array([0, 16383, -16383, 32767, -32767]);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      type: "input_audio_buffer.append",
      audio: Buffer.from(expectedPcm.buffer).toString("base64"),
    });
  });

  it("sends time cues through the allowlisted OpenAI text item and response events", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });

    const sentBefore = socket.sent.length;
    session.sendTimeCue(30);

    const events = socket.sent.slice(sentBefore).map((raw) => JSON.parse(raw));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: expect.any(String) }],
      },
    });
    expect(events[1]).toEqual({ type: "response.create" });
    expect(events.some((event) => event.clientContent)).toBe(false);
  });

  it("plays OpenAI audio deltas at 24 kHz and records first audio once", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    const timeline = vi.fn();
    session.onTimelineEvent = timeline;
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};

    const pcm = new Int16Array(240);
    socket.receive({
      type: "response.created",
      response: { id: "response-1", status: "in_progress" },
    });
    const audioEvent = {
      type: "response.output_audio.delta",
      response_id: "response-1",
      item_id: "item-1",
      delta: Buffer.from(pcm.buffer).toString("base64"),
    };
    socket.receive(audioEvent);
    socket.receive(audioEvent);

    const context = audioContexts[0];
    expect(context.createBuffer).toHaveBeenCalledWith(1, 240, 24_000);
    expect(context.sources).toHaveLength(2);
    expect(
      timeline.mock.calls.filter(
        ([event]) => event.event === "first_model_audio_chunk",
      ),
    ).toHaveLength(1);
    expect((session as any).isAiSpeaking).toBe(true);
  });

  it("defers completed response playback completion until all sources drain", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    const speaking = vi.fn();
    session.onAiSpeaking = speaking;
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};

    socket.receive({
      type: "response.output_audio.delta",
      response_id: "response-1",
      item_id: "item-1",
      delta: Buffer.from(new Int16Array(240).buffer).toString("base64"),
    });
    socket.receive({
      type: "response.done",
      response: { id: "response-1", status: "completed" },
    });

    expect((session as any).isAiSpeaking).toBe(true);
    expect((session as any).pendingTurnCompletion).toBe(true);
    audioContexts[0].sources[0].onended?.();
    expect((session as any).isAiSpeaking).toBe(false);
    expect(speaking.mock.calls).toEqual([[true], [false]]);
  });

  it.each(["failed", "incomplete", "cancelled"])(
    "treats a %s response as interrupted rather than successfully completed",
    async (status) => {
      const session = new LiveSession(createOpenAiConfig());
      sessions.push(session);
      await session.connect("access-token");
      const socket = sockets[0];
      socket.open();
      socket.receive({ type: "auth_ok", sessionId: "session-openai" });
      socket.receive({
        type: "telefun_session_configured",
        modelId: "gpt-realtime-2.1-mini",
        transport: "openai-audio",
      });
      (session as any).recordingDestination = {};
      socket.receive({
        type: "response.output_audio.delta",
        response_id: "response-1",
        item_id: "item-1",
        delta: Buffer.from(new Int16Array(240).buffer).toString("base64"),
      });

      socket.receive({
        type: "response.done",
        response: { id: "response-1", status },
      });

      expect((session as any).isAiSpeaking).toBe(false);
      expect((session as any).pendingTurnCompletion).toBe(false);
      expect((session as any).interruptionCount).toBe(1);
    },
  );

  it("cancels and truncates barge-in at the exact played duration without double counting", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    const timeline = vi.fn();
    session.onTimelineEvent = timeline;
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};

    socket.receive({
      type: "response.created",
      response: { id: "response-1", status: "in_progress" },
    });
    const quarterSecond = Buffer.from(new Int16Array(6_000).buffer).toString(
      "base64",
    );
    for (let index = 0; index < 2; index += 1) {
      socket.receive({
        type: "response.output_audio.delta",
        response_id: "response-1",
        item_id: "item-1",
        delta: quarterSecond,
      });
    }
    audioContexts[0].currentTime = 10.125;

    socket.receive({
      type: "input_audio_buffer.speech_started",
      audio_start_ms: 500,
      item_id: "user-item-1",
    });
    socket.receive({
      type: "input_audio_buffer.speech_started",
      audio_start_ms: 510,
      item_id: "user-item-1",
    });
    socket.receive({ type: "response.cancelled", response_id: "response-1" });

    expect(
      audioContexts[0].sources.every(
        (source) => source.stop.mock.calls.length === 1,
      ),
    ).toBe(true);
    const sent = socket.sent.map((raw) => JSON.parse(raw));
    expect(
      sent.filter((event) => event.type === "response.cancel").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      sent.filter((event) => event.type === "conversation.item.truncate"),
    ).toEqual([
      {
        type: "conversation.item.truncate",
        item_id: "item-1",
        content_index: 0,
        audio_end_ms: 125,
      },
    ]);
    expect((session as any).interruptionCount).toBe(1);
    expect(
      timeline.mock.calls.filter(
        ([event]) => event.event === "interrupted_received",
      ),
    ).toHaveLength(1);
  });

  it("ignores stale response.done from an older response while a newer response is active", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};

    for (const suffix of ["a", "b"]) {
      socket.receive({
        type: "response.created",
        response: { id: `response-${suffix}`, status: "in_progress" },
      });
      socket.receive({
        type: "response.output_audio.delta",
        response_id: `response-${suffix}`,
        item_id: `item-${suffix}`,
        delta: Buffer.from(new Int16Array(240).buffer).toString("base64"),
      });
    }

    socket.receive({
      type: "response.done",
      response: { id: "response-a", status: "completed" },
    });

    expect((session as any).pendingTurnCompletion).toBe(false);
    expect((session as any).isAiSpeaking).toBe(true);
    expect(
      audioContexts[0].sources.every(
        (source) => !source.stop.mock.calls.length,
      ),
    ).toBe(true);
  });

  it("ignores stale response.cancelled from an older response without mutating the active response", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};

    for (const suffix of ["a", "b"]) {
      socket.receive({
        type: "response.created",
        response: { id: `response-${suffix}`, status: "in_progress" },
      });
      socket.receive({
        type: "response.output_audio.delta",
        response_id: `response-${suffix}`,
        item_id: `item-${suffix}`,
        delta: Buffer.from(new Int16Array(240).buffer).toString("base64"),
      });
    }
    const sentBefore = socket.sent.length;

    socket.receive({ type: "response.cancelled", response_id: "response-a" });

    expect(socket.sent).toHaveLength(sentBefore);
    expect((session as any).isAiSpeaking).toBe(true);
    expect((session as any).interruptionCount).toBe(0);
    expect(
      audioContexts[0].sources.every(
        (source) => !source.stop.mock.calls.length,
      ),
    ).toBe(true);
  });

  it("deduplicates terminal events after response.done has already completed the active response", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};
    socket.receive({
      type: "response.created",
      response: { id: "response-1", status: "in_progress" },
    });
    socket.receive({
      type: "response.output_audio.delta",
      response_id: "response-1",
      item_id: "item-1",
      delta: Buffer.from(new Int16Array(240).buffer).toString("base64"),
    });
    socket.receive({
      type: "response.done",
      response: { id: "response-1", status: "completed" },
    });

    socket.receive({ type: "response.cancelled", response_id: "response-1" });

    expect((session as any).pendingTurnCompletion).toBe(true);
    expect((session as any).isAiSpeaking).toBe(true);
    expect((session as any).interruptionCount).toBe(0);
    expect(audioContexts[0].sources[0].stop).not.toHaveBeenCalled();
  });

  it("truncates the currently audible item instead of a later queued item", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};

    const quarterSecond = Buffer.from(new Int16Array(6_000).buffer).toString(
      "base64",
    );
    for (const suffix of ["a", "b"]) {
      socket.receive({
        type: "response.created",
        response: { id: `response-${suffix}`, status: "in_progress" },
      });
      socket.receive({
        type: "response.output_audio.delta",
        response_id: `response-${suffix}`,
        item_id: `item-${suffix}`,
        delta: quarterSecond,
      });
    }
    audioContexts[0].currentTime = 10.125;

    socket.receive({
      type: "input_audio_buffer.speech_started",
      audio_start_ms: 500,
      item_id: "user-item-1",
    });

    const truncates = socket.sent
      .map((raw) => JSON.parse(raw))
      .filter((event) => event.type === "conversation.item.truncate");
    expect(truncates).toEqual([
      {
        type: "conversation.item.truncate",
        item_id: "item-a",
        content_index: 0,
        audio_end_ms: 125,
      },
    ]);
  });

  it("sums only played item segments and excludes scheduling gaps from audio_end_ms", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};
    socket.receive({
      type: "response.created",
      response: { id: "response-1", status: "in_progress" },
    });

    const quarterSecond = Buffer.from(new Int16Array(6_000).buffer).toString(
      "base64",
    );
    socket.receive({
      type: "response.output_audio.delta",
      response_id: "response-1",
      item_id: "item-1",
      delta: quarterSecond,
    });
    (session as any).nextStartTime = 11;
    socket.receive({
      type: "response.output_audio.delta",
      response_id: "response-1",
      item_id: "item-1",
      delta: quarterSecond,
    });
    audioContexts[0].currentTime = 11.125;

    socket.receive({
      type: "input_audio_buffer.speech_started",
      audio_start_ms: 500,
      item_id: "user-item-1",
    });

    const truncate = socket.sent
      .map((raw) => JSON.parse(raw))
      .find((event) => event.type === "conversation.item.truncate");
    expect(truncate).toMatchObject({
      item_id: "item-1",
      audio_end_ms: 375,
    });
  });

  it("clamps truncation progress to the scheduled playback interval", () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    const mutableContextClock = {
      currentTime: 12,
    };
    Object.assign(session as any, {
      audioContext: mutableContextClock as unknown as AudioContext,
      openAiPlaybackSegments: [
        {
          responseId: "response-1",
          itemId: "item-1",
          start: 10,
          end: 10.5,
          source: {},
        },
      ],
    });

    expect((session as any).getOpenAiPlayedAudioEndMs()).toBe(500);
    mutableContextClock.currentTime = 9;
    expect((session as any).getOpenAiPlayedAudioEndMs()).toBe(0);
  });

  it("clears OpenAI playback on hold and disconnect without sending Gemini data events", async () => {
    vi.useFakeTimers();
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    vi.spyOn(session as any, "stopRecordingOnce").mockImplementation(
      () => undefined,
    );
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });
    (session as any).recordingDestination = {};
    socket.receive({
      type: "response.output_audio.delta",
      response_id: "response-1",
      item_id: "item-1",
      delta: Buffer.from(new Int16Array(240).buffer).toString("base64"),
    });

    session.setHold(true);
    expect(audioContexts[0].sources[0].stop).toHaveBeenCalledTimes(1);
    expect((session as any).openAiPlaybackSegments).toEqual([]);
    session.setHold(false);

    const sentBeforeDisconnect = socket.sent.length;
    const disconnect = session.disconnect("user");
    const disconnectEvents = socket.sent
      .slice(sentBeforeDisconnect)
      .map((raw) => JSON.parse(raw));
    expect(disconnectEvents).toEqual([
      { type: "session_end_request", reason: "user" },
    ]);
    socket.receive({
      type: "session_end_complete",
      outcome: "turn_complete",
    });
    await disconnect;
    expect((session as any).openAiPlaybackSegments).toEqual([]);
    vi.useRealTimers();
  });

  it("ignores malformed, unknown, transcript, and function events without executing or mutating playback", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });

    const sentBefore = socket.sent.length;
    socket.receiveRaw("not-json");
    socket.receive({ type: "future.event", raw_prompt: "must stay ignored" });
    socket.receive({
      type: "response.output_audio_transcript.delta",
      response_id: "response-1",
      item_id: "item-1",
      delta: "Halo",
    });
    socket.receive({
      type: "response.function_call_arguments.done",
      call_id: "call-1",
      name: "dangerous_tool",
      arguments: '{"command":"do not execute"}',
    });

    expect(socket.sent).toHaveLength(sentBefore);
    expect((session as any).activeSources.size).toBe(0);
    expect((session as any).interruptionCount).toBe(0);
    expect((session as any).isAiSpeaking).toBe(false);
  });

  it("reports the sanitized provider error copy without changing playback", async () => {
    const session = new LiveSession(createOpenAiConfig());
    sessions.push(session);
    const onError = vi.fn();
    session.onError = onError;
    await session.connect("access-token");
    const socket = sockets[0];
    socket.open();
    socket.receive({ type: "auth_ok", sessionId: "session-openai" });
    socket.receive({
      type: "telefun_session_configured",
      modelId: "gpt-realtime-2.1-mini",
      transport: "openai-audio",
    });

    socket.receive({
      type: "error",
      error: {
        type: "invalid_request_error",
        code: "invalid_event",
        message: "Permintaan realtime ditolak.",
      },
    });

    expect(onError).toHaveBeenCalledWith(
      new Error("Permintaan realtime ditolak."),
    );
    expect((session as any).activeSources.size).toBe(0);
  });
});
