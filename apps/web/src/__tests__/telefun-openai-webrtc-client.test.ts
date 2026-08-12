import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SessionMetrics } from "@trainers/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIWebRtcSession } from "../routes/telefun/services/openaiWebRtc/openaiWebRtcSession";
import {
  createOpenAIWebRtcBrokerCall,
  deleteOpenAIWebRtcBrokerCall,
} from "../routes/telefun/services/openaiWebRtc/brokerApi";
import type {
  OpenAIWebRtcDependencies,
  OpenAIWebRtcEvent,
  OpenAIWebRtcStreamLike,
  OpenAIWebRtcTrackLike,
} from "../routes/telefun/services/openaiWebRtc/contracts";
import {
  buildSafeProviderDiagnostic,
  OpenAIWebRtcTransport,
  type TelefunWebRtcFactoryEnvironment,
} from "../routes/telefun/services/telefunTransport";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

const openAiWebRtcSessionSource = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../routes/telefun/services/openaiWebRtc/openaiWebRtcSession.ts",
  ),
  "utf8",
);

type FakeTrack = {
  kind: "audio";
  enabled: boolean;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

type FakeStream = {
  getTracks: () => FakeTrack[];
  getAudioTracks: () => FakeTrack[];
};

type FakeDataChannel = {
  label: string;
  readyState: "connecting" | "open" | "closing" | "closed";
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  emitMessage: (data: string) => void;
  emitClose: () => void;
};

type FakePeerConnection = {
  addTrack: ReturnType<typeof vi.fn>;
  createDataChannel: ReturnType<typeof vi.fn>;
  createOffer: ReturnType<typeof vi.fn>;
  setLocalDescription: ReturnType<typeof vi.fn>;
  setRemoteDescription: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  ontrack:
    | ((event: { track: FakeTrack; streams: FakeStream[] }) => void)
    | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  connectionState: string;
  iceConnectionState: string;
  emitTrack: (track: FakeTrack, stream?: FakeStream) => void;
  emitConnectionState: (state: string) => void;
  emitIceState: (state: string) => void;
  dataChannel: FakeDataChannel;
};

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

function createTrack(): FakeTrack {
  return {
    kind: "audio",
    enabled: true,
    stop: vi.fn(),
    onended: null,
  };
}

function createStream(tracks: FakeTrack[]): FakeStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  };
}

function createPeerConnection(): FakePeerConnection {
  const dataChannel: FakeDataChannel = {
    label: "oai-events",
    readyState: "connecting",
    onmessage: null,
    onclose: null,
    send: vi.fn(),
    close: vi.fn(() => {
      dataChannel.readyState = "closed";
      dataChannel.onclose?.();
    }),
    emitMessage: (data: string) => {
      dataChannel.onmessage?.({ data });
    },
    emitClose: () => {
      dataChannel.readyState = "closed";
      dataChannel.onclose?.();
    },
  };

  const peer: FakePeerConnection = {
    addTrack: vi.fn(),
    createDataChannel: vi.fn(() => dataChannel),
    createOffer: vi.fn(async () => ({
      type: "offer",
      sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
    })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    close: vi.fn(() => undefined),
    ontrack: null,
    onconnectionstatechange: null,
    oniceconnectionstatechange: null,
    connectionState: "new",
    iceConnectionState: "new",
    emitTrack: (track, stream) => {
      peer.ontrack?.({ track, streams: stream ? [stream] : [] });
    },
    emitConnectionState: (state) => {
      peer.connectionState = state;
      peer.onconnectionstatechange?.();
    },
    emitIceState: (state) => {
      peer.iceConnectionState = state;
      peer.oniceconnectionstatechange?.();
    },
    dataChannel,
  };

  return peer;
}

async function resolveConnection(
  session: OpenAIWebRtcSession,
  peer: FakePeerConnection,
): Promise<void> {
  const connection = session.connect();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  expect(session.state).toBe("connecting");
  peer.emitConnectionState("connected");
  await connection;
}

function createAudioElement() {
  return {
    srcObject: null as FakeStream | null,
    muted: false,
    currentTime: 0,
    paused: true,
    ended: false,
    readyState: 4,
    onplaying: null as (() => void) | null,
    onpause: null as (() => void) | null,
    onended: null as (() => void) | null,
    ontimeupdate: null as (() => void) | null,
    onwaiting: null as (() => void) | null,
    onstalled: null as (() => void) | null,
    play: vi.fn(async () => undefined),
  };
}

function createReceiverSensitiveFetch(response: Response) {
  const receivers: unknown[] = [];
  const fetch = async function (
    this: unknown,
    _input: RequestInfo | URL,
    _init?: RequestInit,
  ): Promise<Response> {
    receivers.push(this);
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Illegal invocation");
    }
    return response;
  } as typeof globalThis.fetch;
  return { fetch, receivers };
}

function createFetch(
  answerSdp = "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
  allowFailedOutcome = false,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (init?.method === "POST") {
      expect(url.toString()).toBe(
        `https://broker.example/base/telefun/realtime/openai/webrtc/sessions/${SESSION_ID}/call`,
      );
      expect(init.headers).toMatchObject({
        Authorization: "Bearer supabase-access-token",
        "Content-Type": "application/sdp",
      });
      expect(init.body).toBe(
        "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
      );
      return new Response(answerSdp, {
        status: 200,
        headers: { "Content-Type": "application/sdp" },
      });
    }

    expect(init?.method).toBe("DELETE");
    expect(init?.body).toBeUndefined();
    expect(init?.signal?.aborted ?? false).toBe(false);
    expect(`${url.origin}${url.pathname}`).toBe(
      `https://broker.example/base/telefun/realtime/openai/webrtc/sessions/${SESSION_ID}/call`,
    );
    if (allowFailedOutcome) {
      expect(url.search).toBe("?outcome=failed");
    }
    return new Response(null, { status: 204 });
  });
}

function createDiagnosticTestSession(
  peer: FakePeerConnection,
  mediaDevices: { getUserMedia: ReturnType<typeof vi.fn> },
  audio: ReturnType<typeof createAudioElement>,
  fetch: OpenAIWebRtcDependencies["fetch"],
): OpenAIWebRtcSession {
  return new OpenAIWebRtcSession(
    {
      sessionId: SESSION_ID,
      accessToken: "supabase-access-token",
      brokerHttpBaseUrl: "https://broker.example/base",
    },
    {
      RTCPeerConnection: class {
        constructor() {
          return peer as unknown as RTCPeerConnection;
        }
      } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
      fetch,
      mediaDevices:
        mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
      audioElement:
        audio as unknown as OpenAIWebRtcDependencies["audioElement"],
    },
  );
}

describe("OpenAI WebRTC broker fetch receiver binding", () => {
  it("creates a broker call without binding fetch to the input object", async () => {
    const { fetch, receivers } = createReceiverSensitiveFetch(
      new Response("v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n", {
        status: 200,
        headers: { "Content-Type": "application/sdp" },
      }),
    );

    await expect(
      createOpenAIWebRtcBrokerCall({
        fetch,
        brokerHttpBaseUrl: "https://broker.example/base",
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        offerSdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
      }),
    ).resolves.toEqual({
      answerSdp: "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
    });
    expect(receivers).toEqual([undefined]);
  });

  it("normalizes LF-only broker answers to one terminal CRLF", async () => {
    const { fetch } = createReceiverSensitiveFetch(
      new Response("v=0\no=- 2 2 IN IP4 127.0.0.1\ns=-\nt=0 0\n", {
        status: 200,
        headers: { "Content-Type": "application/sdp" },
      }),
    );

    await expect(
      createOpenAIWebRtcBrokerCall({
        fetch,
        brokerHttpBaseUrl: "https://broker.example/base",
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        offerSdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
      }),
    ).resolves.toEqual({
      answerSdp: "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
    });
  });

  it("deletes a broker call without binding fetch to the input object", async () => {
    const { fetch, receivers } = createReceiverSensitiveFetch(
      new Response(null, { status: 204 }),
    );

    await expect(
      deleteOpenAIWebRtcBrokerCall({
        fetch,
        brokerHttpBaseUrl: "https://broker.example/base",
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
      }),
    ).resolves.toBeUndefined();
    expect(receivers).toEqual([undefined]);
  });
});

describe("OpenAIWebRtcSession", () => {
  let peer: FakePeerConnection;
  let localTrack: FakeTrack;
  let remoteTrack: FakeTrack;
  let localStream: FakeStream;
  let remoteStream: FakeStream;
  let audio: ReturnType<typeof createAudioElement>;
  let mediaDevices: { getUserMedia: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    localTrack = createTrack();
    remoteTrack = createTrack();
    localStream = createStream([localTrack]);
    remoteStream = createStream([remoteTrack]);
    audio = createAudioElement();
    peer = createPeerConnection();
    mediaDevices = {
      getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => {
        expect(constraints).toEqual({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });
        return localStream;
      }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function createSession(
    overrides: Partial<OpenAIWebRtcDependencies> = {},
  ): OpenAIWebRtcSession {
    return new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch: createFetch(),
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        ...overrides,
      },
    );
  }

  async function connectRemoteSession(
    session: OpenAIWebRtcSession,
  ): Promise<void> {
    await resolveConnection(session, peer);
    peer.dataChannel.readyState = "open";
    peer.emitTrack(remoteTrack, remoteStream);
    await Promise.resolve();
    audio.paused = false;
  }

  function createTransport(
    fetch: OpenAIWebRtcDependencies["fetch"],
  ): OpenAIWebRtcTransport {
    return new OpenAIWebRtcTransport(
      {
        telefunTransport: "openai-webrtc",
        telefunModelId: "gpt-realtime-2.1",
        sessionId: SESSION_ID,
        consumerTypes: [],
      } as unknown as TelefunAppSettings,
      "supabase-access-token",
      {
        websocketUrl: "wss://broker.example/base/ws",
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as TelefunWebRtcFactoryEnvironment["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );
  }

  function emitRemoteOutput(
    responseId: string,
    itemId: string,
    started = true,
  ): void {
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: responseId, status: "in_progress" },
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.output_item.added",
        response_id: responseId,
        item: { id: itemId, type: "message", role: "assistant" },
      }),
    );
    if (started) {
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "output_audio_buffer.started",
          response_id: responseId,
        }),
      );
    }
  }

  it("exposes one local stream and applies mute, hold, and narrow controls", async () => {
    const fetch = createFetch();
    const localStreams: unknown[] = [];
    const session = createSession({
      fetch,
      onLocalStream: (stream) => localStreams.push(stream),
    });

    await resolveConnection(session, peer);
    expect(localStreams).toEqual([localStream]);
    session.setMute(true);
    expect(localTrack.enabled).toBe(false);
    session.setHold(true);
    expect(localTrack.enabled).toBe(false);
    expect(audio.muted).toBe(true);
    session.setHold(false);
    expect(audio.muted).toBe(false);
    expect(
      session.sendControlEvent({
        type: "response.cancel",
        response_id: "response-1",
      }),
    ).toBe(false);
    peer.dataChannel.readyState = "open";
    expect(
      session.sendControlEvent({
        type: "response.cancel",
        response_id: "response-1",
      }),
    ).toBe(true);
    expect(JSON.parse(peer.dataChannel.send.mock.calls[0][0])).toMatchObject({
      type: "response.cancel",
      response_id: "response-1",
      event_id: expect.any(String),
    });

    await session.end();
    expect(localStreams.at(-1)).toBeNull();
  });

  it("interrupts only the audible active remote response using media progress", async () => {
    const fetch = createFetch();
    const session = createSession({ fetch });

    await connectRemoteSession(session);
    audio.currentTime = 0;
    emitRemoteOutput("response-1", "item-1");

    audio.currentTime = 1.25;
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "input_audio_buffer.speech_started",
        audio_start_ms: 500,
        item_id: "input-1",
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "input_audio_buffer.speech_started",
        audio_start_ms: 510,
        item_id: "input-1",
      }),
    );

    const controls = peer.dataChannel.send.mock.calls.map(([raw]) =>
      JSON.parse(raw),
    );
    expect(controls).toHaveLength(3);
    expect(controls[0]).toMatchObject({
      type: "response.cancel",
      response_id: "response-1",
      event_id: expect.any(String),
    });
    expect(controls[1]).toMatchObject({
      type: "output_audio_buffer.clear",
      event_id: expect.any(String),
    });
    expect(controls[2]).toMatchObject({
      type: "conversation.item.truncate",
      item_id: "item-1",
      content_index: 0,
      audio_end_ms: expect.any(Number),
      event_id: expect.any(String),
    });
    expect(controls[2].audio_end_ms).toBeGreaterThanOrEqual(1_200);
    expect(controls[2].audio_end_ms).toBeLessThanOrEqual(1_250);

    await session.end();
  });

  it("does not interrupt before the active WebRTC output buffer is audible", async () => {
    const session = createSession();

    await connectRemoteSession(session);
    audio.currentTime = 1;
    emitRemoteOutput("response-1", "item-1", false);
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "input_audio_buffer.speech_started",
        audio_start_ms: 100,
      }),
    );

    expect(peer.dataChannel.send).not.toHaveBeenCalled();
    await session.end();
  });

  it("clears and truncates completed audible output without cancelling a finished response", async () => {
    const session = createSession();

    await connectRemoteSession(session);
    audio.currentTime = 0;
    emitRemoteOutput("response-1", "item-1");
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.done",
        response: { id: "response-1", status: "completed" },
      }),
    );

    audio.currentTime = 0.75;
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "input_audio_buffer.speech_started",
        audio_start_ms: 100,
      }),
    );

    const controls = peer.dataChannel.send.mock.calls.map(([raw]) =>
      JSON.parse(raw),
    );
    expect(controls.map((event) => event.type)).toEqual([
      "output_audio_buffer.clear",
      "conversation.item.truncate",
    ]);
    expect(controls[1]).toMatchObject({
      item_id: "item-1",
      audio_end_ms: 750,
    });
    await session.end();
  });

  it("does not count paused remote-media time toward truncation", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const session = createSession();

    await connectRemoteSession(session);
    emitRemoteOutput("response-1", "item-1");

    now.mockReturnValue(2_000);
    audio.currentTime = 1;
    audio.paused = true;
    audio.onpause?.();
    now.mockReturnValue(6_000);
    audio.paused = false;
    audio.onplaying?.();
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "input_audio_buffer.speech_started",
        audio_start_ms: 100,
      }),
    );

    const truncate = peer.dataChannel.send.mock.calls
      .map(([raw]) => JSON.parse(raw))
      .find((event) => event.type === "conversation.item.truncate");
    expect(truncate?.audio_end_ms).toBeLessThanOrEqual(1_200);
    await session.end();
    now.mockRestore();
  });

  it("does not count held and muted remote-media time toward truncation", async () => {
    const session = createSession();

    await connectRemoteSession(session);
    audio.currentTime = 0;
    emitRemoteOutput("response-1", "item-1");

    audio.currentTime = 1;
    session.setHold(true);
    audio.currentTime = 5;
    peer.dataChannel.emitMessage(
      JSON.stringify({ type: "input_audio_buffer.speech_started" }),
    );
    expect(peer.dataChannel.send).not.toHaveBeenCalled();

    session.setHold(false);
    await Promise.resolve();
    audio.paused = false;
    audio.currentTime = 5.5;
    peer.dataChannel.emitMessage(
      JSON.stringify({ type: "input_audio_buffer.speech_started" }),
    );

    const truncate = peer.dataChannel.send.mock.calls
      .map(([raw]) => JSON.parse(raw))
      .find((event) => event.type === "conversation.item.truncate");
    expect(truncate?.audio_end_ms).toBe(1_500);
    await session.end();
  });

  it("ignores stale response and item events after a newer response is active", async () => {
    const session = createSession();

    await connectRemoteSession(session);
    emitRemoteOutput("response-old", "item-old", false);
    emitRemoteOutput("response-new", "item-new");
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.output_item.added",
        response_id: "response-new",
        item: { id: "item-late", type: "message", role: "assistant" },
      }),
    );

    // A late duplicate from the older response must not retarget the active call.
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-old", status: "in_progress" },
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "output_audio_buffer.started",
        response_id: "response-old",
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.done",
        response: { id: "response-old", status: "completed" },
      }),
    );
    audio.currentTime = 1;
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "input_audio_buffer.speech_started",
        audio_start_ms: 100,
      }),
    );

    const controls = peer.dataChannel.send.mock.calls.map(([raw]) =>
      JSON.parse(raw),
    );
    expect(controls[0]).toMatchObject({
      type: "response.cancel",
      response_id: "response-new",
    });
    expect(controls[1]).toMatchObject({
      type: "output_audio_buffer.clear",
    });
    expect(controls[2]).toMatchObject({
      type: "conversation.item.truncate",
      item_id: "item-new",
    });
    expect(controls).toHaveLength(3);
    await session.end();
  });

  it("ignores a duplicate output start after the response buffer was cleared", async () => {
    const playbackChanges: boolean[] = [];
    const session = createSession({
      onRemotePlaybackChange: (audible) => playbackChanges.push(audible),
    });

    await connectRemoteSession(session);
    audio.currentTime = 0;
    emitRemoteOutput("response-1", "item-1");
    expect(playbackChanges).toEqual([true]);

    audio.currentTime = 0.5;
    peer.dataChannel.emitMessage(
      JSON.stringify({ type: "input_audio_buffer.speech_started" }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "output_audio_buffer.cleared",
        response_id: "response-1",
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "output_audio_buffer.started",
        response_id: "response-1",
      }),
    );

    expect(playbackChanges).toEqual([true, false]);
    await session.end();
  });

  it("preserves hold metrics and records server-VAD speech segments", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const metrics: unknown[] = [];
    const session = createSession({
      onRecordingComplete: (_url, _full, _agent, sessionMetrics) => {
        metrics.push(sessionMetrics);
      },
    });

    await resolveConnection(session, peer);
    session.setHold(true);
    now.mockReturnValue(11_000);
    session.setHold(false);

    now.mockReturnValue(12_000);
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "input_audio_buffer.speech_started",
        audio_start_ms: 0,
      }),
    );
    now.mockReturnValue(13_500);
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "input_audio_buffer.speech_stopped",
        audio_end_ms: 1_500,
      }),
    );

    await session.end();

    const captured = metrics[0] as {
      hold?: { count: number; totalDurationMs: number };
      speechSegments?: Array<{ durationMs: number }>;
      totalSpeakingMs?: number;
    };
    expect(captured.hold).toMatchObject({ count: 1 });
    expect(captured.hold?.totalDurationMs).toBeGreaterThanOrEqual(10_000);
    expect(captured.speechSegments).toEqual([
      expect.objectContaining({ durationMs: 1_500 }),
    ]);
    expect(captured.totalSpeakingMs).toBe(1_500);
    now.mockRestore();
  });

  it("closes open server-VAD speech and hold intervals at finalization", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const metrics: SessionMetrics[] = [];
    const session = createSession({
      onRecordingComplete: (_url, _full, _agent, sessionMetrics) => {
        metrics.push(sessionMetrics);
      },
    });

    await resolveConnection(session, peer);
    now.mockReturnValue(1_500);
    session.setHold(true);
    now.mockReturnValue(2_000);
    peer.dataChannel.emitMessage(
      JSON.stringify({ type: "input_audio_buffer.speech_started" }),
    );
    now.mockReturnValue(5_000);
    await session.end();

    expect(metrics[0]).toMatchObject({
      sessionDurationMs: 4_000,
      totalSpeakingMs: 3_000,
      totalSilenceMs: 1_000,
      speechSegments: [{ startMs: 1_000, endMs: 4_000, durationMs: 3_000 }],
      hold: { count: 1, totalDurationMs: 3_500 },
    });
    now.mockRestore();
  });

  it("keeps speaking state tied to audible playback after response.done", async () => {
    const fetch = createFetch();
    const transport = new OpenAIWebRtcTransport(
      {
        telefunTransport: "openai-webrtc",
        telefunModelId: "gpt-realtime-2.1",
        sessionId: SESSION_ID,
        consumerTypes: [],
      } as unknown as TelefunAppSettings,
      "supabase-access-token",
      {
        websocketUrl: "wss://broker.example/base/ws",
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as TelefunWebRtcFactoryEnvironment["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );
    const speaking: boolean[] = [];
    transport.onAiSpeaking = (value) => speaking.push(value);

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";
    peer.emitTrack(remoteTrack, remoteStream);
    await Promise.resolve();
    audio.paused = false;
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-1", status: "in_progress" },
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.output_item.added",
        response_id: "response-1",
        item: { id: "item-1", type: "message", role: "assistant" },
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "output_audio_buffer.started",
        response_id: "response-1",
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.done",
        response: { id: "response-1", status: "completed" },
      }),
    );

    expect(speaking.at(-1)).toBe(true);
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "output_audio_buffer.stopped",
        response_id: "response-1",
      }),
    );
    expect(speaking.at(-1)).toBe(false);
    await transport.disconnect("user");
  });

  it("keeps a rapid interruption-control race recoverable and correlated", async () => {
    const fetch = createFetch();
    const transport = new OpenAIWebRtcTransport(
      {
        telefunTransport: "openai-webrtc",
        telefunModelId: "gpt-realtime-2.1",
        sessionId: SESSION_ID,
        consumerTypes: [],
      } as unknown as TelefunAppSettings,
      "supabase-access-token",
      {
        websocketUrl: "wss://broker.example/base/ws",
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as TelefunWebRtcFactoryEnvironment["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );
    const errors: Error[] = [];
    const providerEvents: OpenAIWebRtcEvent[] = [];
    transport.onError = (error) => errors.push(error);
    transport.onProviderEvent = (event) => providerEvents.push(event);

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";
    peer.emitTrack(remoteTrack, remoteStream);
    await Promise.resolve();
    audio.paused = false;
    audio.currentTime = 0;
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-1", status: "in_progress" },
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.output_item.added",
        response_id: "response-1",
        item: { id: "item-1", type: "message", role: "assistant" },
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "output_audio_buffer.started",
        response_id: "response-1",
      }),
    );
    audio.currentTime = 0.5;
    peer.dataChannel.emitMessage(
      JSON.stringify({ type: "input_audio_buffer.speech_started" }),
    );
    const cancel = peer.dataChannel.send.mock.calls
      .map(([raw]) => JSON.parse(raw))
      .find((event) => event.type === "response.cancel");

    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          code: "response_cancel_not_active",
          event_id: cancel.event_id,
          message: "Response is no longer active.",
        },
      }),
    );
    await Promise.resolve();

    expect(errors).toEqual([]);
    expect(providerEvents.at(-1)).toMatchObject({
      kind: "event",
      type: "error",
      payload: {
        error: { code: "interruption_control_rejected" },
      },
    });
    expect(
      fetch.mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(0);
    await transport.disconnect("user");
  });

  it("recovers only the exact correlated truncate race and settles its state", async () => {
    const session = createSession();
    await resolveConnection(session, peer);
    peer.dataChannel.readyState = "open";

    expect(
      session.sendControlEvent({
        type: "conversation.item.truncate",
        item_id: "item-1",
        content_index: 0,
        audio_end_ms: 500,
      }),
    ).toBe(true);
    const truncate = peer.dataChannel.send.mock.calls
      .map(([raw]) => JSON.parse(raw))
      .find((event) => event.type === "conversation.item.truncate");
    const error: OpenAIWebRtcEvent = {
      kind: "event",
      type: "error",
      payload: {
        type: "error",
        error: {
          type: "invalid_request_error",
          code: "item_truncate_invalid_item_id",
          event_id: truncate.event_id,
        },
      },
    };

    expect(session.isRecoverableControlError(error)).toBe(true);
    expect(session.isRecoverableControlError(error)).toBe(false);
    await session.end();
  });

  it("fails closed for a correlated server error instead of recovering it", async () => {
    const fetch = createFetch();
    const transport = createTransport(fetch);
    const errors: Error[] = [];
    transport.onError = (error) => errors.push(error);

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";

    expect(
      transport.sendControlEvent({
        type: "response.cancel",
        response_id: "response-1",
      }),
    ).toBe(true);
    const cancel = peer.dataChannel.send.mock.calls
      .map(([raw]) => JSON.parse(raw))
      .find((event) => event.type === "response.cancel");

    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "error",
        error: {
          type: "server_error",
          code: "provider_failure",
          event_id: cancel.event_id,
        },
      }),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(errors).toContainEqual(
      expect.objectContaining({ code: "provider_error" }),
    );
    expect(
      fetch.mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toHaveLength(1);
  });

  it("sends WebRTC time cues as a system control item and response", async () => {
    const fetch = createFetch();
    const transport = new OpenAIWebRtcTransport(
      {
        telefunTransport: "openai-webrtc",
        telefunModelId: "gpt-realtime-2.1",
        sessionId: SESSION_ID,
        consumerTypes: [
          {
            id: "ramah",
            name: "Ramah",
            description: "Kooperatif",
            difficulty: "Mudah",
          },
        ],
        activeConsumerType: {
          id: "ramah",
          name: "Ramah",
          description: "Kooperatif",
          difficulty: "Mudah",
        },
      } as unknown as TelefunAppSettings,
      "supabase-access-token",
      {
        websocketUrl: "wss://broker.example/base/ws",
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as TelefunWebRtcFactoryEnvironment["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";

    try {
      transport.sendTimeCue(20);

      const events = peer.dataChannel.send.mock.calls.map(([raw]) =>
        JSON.parse(raw),
      );
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "system",
          content: [
            {
              type: "input_text",
              text: expect.stringContaining("[TELEFUN_CONTROL:TIME_CUE]"),
            },
          ],
        },
      });
      expect(events[1]).toMatchObject({
        type: "response.create",
        response: {
          metadata: {
            telefun_response_create: expect.stringMatching(
              /^telefun-response-create-/,
            ),
          },
        },
      });
    } finally {
      await transport.disconnect("user");
    }
  });

  it("defers and coalesces time-cue responses until the active response is done", async () => {
    const transport = createTransport(createFetch());

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-active", status: "in_progress" },
      }),
    );

    try {
      transport.sendTimeCue(30);
      transport.sendTimeCue(20);

      expect(
        peer.dataChannel.send.mock.calls.map(([raw]) => JSON.parse(raw).type),
      ).toEqual(["conversation.item.create", "conversation.item.create"]);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-active", status: "completed" },
        }),
      );

      expect(
        peer.dataChannel.send.mock.calls.map(([raw]) => JSON.parse(raw).type),
      ).toEqual([
        "conversation.item.create",
        "conversation.item.create",
        "response.create",
      ]);
    } finally {
      await transport.disconnect("user");
    }
  });

  it("coalesces pending creates to the latest complete client event", async () => {
    const transport = createTransport(createFetch());

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-active", status: "in_progress" },
      }),
    );

    try {
      expect(
        transport.sendControlEvent({
          type: "response.create",
          event_id: "cue-old",
        }),
      ).toBe(true);
      expect(
        transport.sendControlEvent({
          type: "response.create",
          event_id: "cue-latest",
        }),
      ).toBe(true);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-active", status: "completed" },
        }),
      );

      const responseCreates = peer.dataChannel.send.mock.calls
        .map(([raw]) => JSON.parse(raw))
        .filter((event) => event.type === "response.create");
      expect(responseCreates).toHaveLength(1);
      expect(responseCreates[0]).toMatchObject({
        event_id: "cue-latest",
        response: {
          metadata: {
            telefun_response_create: expect.stringMatching(
              /^telefun-response-create-/,
            ),
          },
        },
      });
    } finally {
      await transport.disconnect("user");
    }
  });

  it("flushes a pending create when the active response is cancelled", async () => {
    const transport = createTransport(createFetch());

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-active", status: "in_progress" },
      }),
    );

    try {
      expect(
        transport.sendControlEvent({
          type: "response.create",
          event_id: "cue-after-cancel",
        }),
      ).toBe(true);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.cancelled",
          response_id: "response-active",
        }),
      );

      const responseCreates = peer.dataChannel.send.mock.calls
        .map(([raw]) => JSON.parse(raw))
        .filter((event) => event.type === "response.create");
      expect(responseCreates).toHaveLength(1);
      expect(responseCreates[0]).toMatchObject({
        event_id: "cue-after-cancel",
      });
    } finally {
      await transport.disconnect("user");
    }
  });

  it("notifies observers before applying response lifecycle transitions", async () => {
    const transport = createTransport(createFetch());
    let createAcceptedDuringObserver: boolean | undefined;
    let responseCreatesSeenDuringObserver: number | undefined;
    transport.onProviderEvent = (event) => {
      if (event.kind !== "event" || event.type !== "response.done") return;
      createAcceptedDuringObserver = transport.sendControlEvent({
        type: "response.create",
        event_id: "observer-cue",
      });
      responseCreatesSeenDuringObserver = peer.dataChannel.send.mock.calls
        .map(([raw]) => JSON.parse(raw))
        .filter((sentEvent) => sentEvent.type === "response.create").length;
    };

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-active", status: "in_progress" },
      }),
    );

    try {
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-active", status: "completed" },
        }),
      );

      expect(createAcceptedDuringObserver).toBe(true);
      expect(responseCreatesSeenDuringObserver).toBe(0);
      const responseCreates = peer.dataChannel.send.mock.calls
        .map(([raw]) => JSON.parse(raw))
        .filter((event) => event.type === "response.create");
      expect(responseCreates).toHaveLength(1);
      expect(responseCreates[0]).toMatchObject({ event_id: "observer-cue" });
    } finally {
      await transport.disconnect("user");
    }
  });

  it("waits for the marked manual response terminal before flushing another create", async () => {
    const transport = createTransport(createFetch());

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";

    try {
      transport.sendTimeCue(30);
      const sentEvents = () =>
        peer.dataChannel.send.mock.calls.map(([raw]) => JSON.parse(raw));
      const firstResponseCreate = sentEvents().find(
        (event) => event.type === "response.create",
      );
      const manualMarker =
        firstResponseCreate.response.metadata.telefun_response_create;

      expect(
        transport.sendControlEvent({
          type: "response.create",
          event_id: "cue-2",
        }),
      ).toBe(true);
      expect(
        sentEvents().filter((event) => event.type === "response.create"),
      ).toHaveLength(1);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.created",
          response: { id: "response-unrelated", status: "in_progress" },
        }),
      );
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-unrelated", status: "completed" },
        }),
      );

      expect(
        sentEvents().filter((event) => event.type === "response.create"),
      ).toHaveLength(1);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.created",
          response: {
            id: "response-manual",
            status: "in_progress",
            metadata: { telefun_response_create: manualMarker },
          },
        }),
      );
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-manual", status: "completed" },
        }),
      );

      const responseCreates = sentEvents().filter(
        (event) => event.type === "response.create",
      );
      expect(responseCreates).toHaveLength(2);
      expect(responseCreates[1]).toMatchObject({ event_id: "cue-2" });
    } finally {
      await transport.disconnect("user");
    }
  });

  it("ignores stale and duplicate terminal events while coalescing creates", async () => {
    const transport = createTransport(createFetch());

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-active", status: "in_progress" },
      }),
    );

    try {
      expect(
        transport.sendControlEvent({
          type: "response.create",
          event_id: "cue-1",
        }),
      ).toBe(true);
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-active", status: "completed" },
        }),
      );

      const sentEvents = () =>
        peer.dataChannel.send.mock.calls.map(([raw]) => JSON.parse(raw));
      const firstResponseCreate = sentEvents().find(
        (event) => event.type === "response.create",
      );
      const manualMarker =
        firstResponseCreate.response.metadata.telefun_response_create;
      expect(firstResponseCreate).toMatchObject({ event_id: "cue-1" });

      expect(
        transport.sendControlEvent({
          type: "response.create",
          event_id: "cue-2",
        }),
      ).toBe(true);
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-active", status: "completed" },
        }),
      );
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-unknown", status: "completed" },
        }),
      );

      expect(
        sentEvents().filter((event) => event.type === "response.create"),
      ).toHaveLength(1);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.created",
          response: {
            id: "response-manual-1",
            status: "in_progress",
            metadata: { telefun_response_create: manualMarker },
          },
        }),
      );
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-manual-1", status: "completed" },
        }),
      );
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-manual-1", status: "completed" },
        }),
      );

      const responseCreates = sentEvents().filter(
        (event) => event.type === "response.create",
      );
      expect(responseCreates).toHaveLength(2);
      expect(responseCreates[1]).toMatchObject({ event_id: "cue-2" });
    } finally {
      await transport.disconnect("user");
    }
  });

  it("defers a time-cue response across an automatic VAD turn", async () => {
    const transport = createTransport(createFetch());

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";

    try {
      peer.dataChannel.emitMessage(
        JSON.stringify({ type: "input_audio_buffer.speech_started" }),
      );
      transport.sendTimeCue(20);
      peer.dataChannel.emitMessage(
        JSON.stringify({ type: "input_audio_buffer.speech_stopped" }),
      );

      expect(
        peer.dataChannel.send.mock.calls.map(([raw]) => JSON.parse(raw).type),
      ).toEqual(["conversation.item.create"]);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.created",
          response: {
            id: "response-vad",
            status: "in_progress",
            metadata: null,
          },
        }),
      );
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-vad", status: "completed" },
        }),
      );

      expect(
        peer.dataChannel.send.mock.calls.map(([raw]) => JSON.parse(raw).type),
      ).toEqual(["conversation.item.create", "response.create"]);
    } finally {
      await transport.disconnect("user");
    }
  });

  it("keeps manual and server-VAD response barriers independent", async () => {
    const transport = createTransport(createFetch());

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";

    try {
      transport.sendTimeCue(30);
      const sentEvents = () =>
        peer.dataChannel.send.mock.calls.map(([raw]) => JSON.parse(raw));
      const firstResponseCreate = sentEvents().find(
        (event) => event.type === "response.create",
      );
      const manualMarker =
        firstResponseCreate?.response?.metadata?.telefun_response_create ??
        "manual-response-marker";

      peer.dataChannel.emitMessage(
        JSON.stringify({ type: "input_audio_buffer.speech_started" }),
      );
      transport.sendTimeCue(20);

      expect(sentEvents().map((event) => event.type)).toEqual([
        "conversation.item.create",
        "response.create",
        "conversation.item.create",
      ]);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.created",
          response: {
            id: "response-manual",
            status: "in_progress",
            metadata: { telefun_response_create: manualMarker },
          },
        }),
      );
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-manual", status: "completed" },
        }),
      );

      expect(
        sentEvents().filter((event) => event.type === "response.create"),
      ).toHaveLength(1);

      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.created",
          response: { id: "response-vad", status: "in_progress" },
        }),
      );
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.done",
          response: { id: "response-vad", status: "completed" },
        }),
      );

      expect(
        sentEvents().filter((event) => event.type === "response.create"),
      ).toHaveLength(2);
    } finally {
      await transport.disconnect("user");
    }
  });

  it("does not flush a pending create when shutdown starts", async () => {
    const transport = createTransport(createFetch());

    const connecting = transport.connect("supabase-access-token");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    peer.emitConnectionState("connected");
    await connecting;
    peer.dataChannel.readyState = "open";
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-active", status: "in_progress" },
      }),
    );

    expect(
      transport.sendControlEvent({
        type: "response.create",
        event_id: "cue-pending",
      }),
    ).toBe(true);
    expect(
      peer.dataChannel.send.mock.calls.filter(
        ([raw]) => JSON.parse(raw).type === "response.create",
      ),
    ).toHaveLength(0);

    const ending = transport.disconnect("user");
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.done",
        response: { id: "response-active", status: "completed" },
      }),
    );

    expect(
      peer.dataChannel.send.mock.calls.filter(
        ([raw]) => JSON.parse(raw).type === "response.create",
      ),
    ).toHaveLength(0);
    await ending;
  });

  it("reports blocked autoplay once and retries playback after a user gesture", async () => {
    const fetch = createFetch();
    audio.play
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockResolvedValueOnce(undefined);
    const onPlaybackBlocked = vi.fn();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        onPlaybackBlocked,
      },
    );

    await resolveConnection(session, peer);
    peer.emitTrack(remoteTrack, remoteStream);
    await Promise.resolve();
    expect(onPlaybackBlocked).toHaveBeenCalledTimes(1);
    peer.dataChannel.readyState = "open";
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.created",
        response: { id: "response-1", status: "in_progress" },
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "response.output_item.added",
        response_id: "response-1",
        item: { id: "item-1", type: "message", role: "assistant" },
      }),
    );
    peer.dataChannel.emitMessage(
      JSON.stringify({
        type: "output_audio_buffer.started",
        response_id: "response-1",
      }),
    );
    audio.currentTime = 1;
    peer.dataChannel.emitMessage(
      JSON.stringify({ type: "input_audio_buffer.speech_started" }),
    );
    expect(peer.dataChannel.send).not.toHaveBeenCalled();

    await expect(session.retryPlayback()).resolves.toBe(true);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(onPlaybackBlocked).toHaveBeenCalledTimes(1);
    await session.end();
  });

  it("sends authenticated failed cleanup when microphone access is denied before POST", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(init?.method).toBe("DELETE");
        expect(url.search).toBe("?outcome=failed");
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer supabase-access-token",
        });
        return new Response(null, { status: 204 });
      },
    );
    mediaDevices.getUserMedia = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await expect(session.connect()).rejects.toThrow("NotAllowedError");
    expect(fetch).toHaveBeenCalledOnce();
    expect(session.state).toBe("failed");
  });

  it("tags microphone acquisition failures and logs the pre-ending stage", async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      },
    );
    const mediaError = new Error("Microphone access failed.");
    mediaError.name = "NotReadableError";
    mediaDevices.getUserMedia = vi.fn(async () => {
      throw mediaError;
    });
    const errors: Error[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        onError: (error) => errors.push(error),
      },
    );

    await expect(session.connect()).rejects.toThrow(
      "Microphone access failed.",
    );

    expect(errors[0]).toMatchObject({
      code: "microphone_access_failed",
      cause: mediaError,
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "get_user_media",
        name: "NotReadableError",
        code: "microphone_access_failed",
        message: "Microphone access failed.",
      }),
    );
  });

  it("tags broker fetch failures as network errors while preserving the cause", async () => {
    const networkError = new TypeError("Failed to fetch");
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") throw networkError;
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      },
    );
    const errors: Error[] = [];
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        onError: (error) => errors.push(error),
      },
    );

    await expect(session.connect()).rejects.toThrow("Failed to fetch");

    expect(errors[0]).toMatchObject({
      code: "broker_network_failed",
      cause: networkError,
    });
  });

  it("tags offer creation failures with the offer category", async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      },
    );
    const offerError = new Error("createOffer failed");
    peer.createOffer.mockRejectedValueOnce(offerError);
    const errors: Error[] = [];
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        onError: (error) => errors.push(error),
      },
    );

    await expect(session.connect()).rejects.toThrow("createOffer failed");
    expect(errors[0]).toMatchObject({
      code: "webrtc_offer_failed",
      cause: offerError,
    });
  });

  it("logs broker request and response stages without request payloads", async () => {
    const fetch = createFetch();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await resolveConnection(session, peer);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "broker_request_started" }),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "broker_response" }),
    );
    expect(warn.mock.calls.flat().join(" ")).not.toContain(
      "supabase-access-token",
    );
    expect(warn.mock.calls.flat().join(" ")).not.toContain("v=0");
    await session.end();
  });

  it("redacts raw SDP from set-remote-description diagnostics", async () => {
    const fetch = createFetch(undefined, true);
    const remoteDescriptionError = new Error("a=ice-pwd:ICE_SECRET_SENTINEL");
    remoteDescriptionError.name = "OperationError";
    peer.setRemoteDescription = vi.fn(async () => {
      throw remoteDescriptionError;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await expect(session.connect()).rejects.toThrow(remoteDescriptionError);

    const serializedWarnings = JSON.stringify(warn.mock.calls);
    expect(serializedWarnings).toContain("set_remote_description");
    expect(serializedWarnings).toContain("OperationError");
    expect(serializedWarnings).toContain("session_description_parse_failed");
    expect(serializedWarnings).not.toContain("ICE_SECRET_SENTINEL");
    expect(serializedWarnings).not.toContain("a=ice-pwd");
    expect(serializedWarnings).not.toContain(
      "Failed to set remote SessionDescription",
    );
    expect(serializedWarnings).not.toContain("Invalid SDP line.");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.state).toBe("failed");
  });

  it.each([
    "SDP:DIAGNOSTIC_SENTINEL",
    "SessionDescription:DIAGNOSTIC_SENTINEL",
    "setLocalDescription:DIAGNOSTIC_SENTINEL",
    "setRemoteDescription:DIAGNOSTIC_SENTINEL",
    "ice-pwd:ICE_PWD_SENTINEL",
    "ice-ufrag:ICE_UFRAG_SENTINEL",
    "candidate:CANDIDATE_SENTINEL",
    "fingerprint:FINGERPRINT_SENTINEL",
    "v=LINE_SENTINEL",
    "o=LINE_SENTINEL",
    "s=LINE_SENTINEL",
    "t=LINE_SENTINEL",
    "c=LINE_SENTINEL",
    "m=LINE_SENTINEL",
    "a=LINE_SENTINEL",
  ])(
    "redacts raw session-description indicator %s without failure wording",
    async (message) => {
      const fetch = createFetch(undefined, true);
      const remoteDescriptionError = new Error(message);
      remoteDescriptionError.name = "OperationError";
      peer.setRemoteDescription = vi.fn(async () => {
        throw remoteDescriptionError;
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const session = createDiagnosticTestSession(
        peer,
        mediaDevices,
        audio,
        fetch,
      );

      await expect(session.connect()).rejects.toThrow(remoteDescriptionError);

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: "set_remote_description",
          name: "OperationError",
          message: "session_description_parse_failed",
        }),
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain(message);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(session.state).toBe("failed");
    },
  );

  it("truncates non-SDP connect diagnostics to 200 characters", async () => {
    const message = `ordinary-connect-diagnostic-${"x".repeat(240)}`;
    const fetch = createFetch(undefined, true);
    const remoteDescriptionError = new Error(message);
    remoteDescriptionError.name = "OperationError";
    peer.setRemoteDescription = vi.fn(async () => {
      throw remoteDescriptionError;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const session = createDiagnosticTestSession(
      peer,
      mediaDevices,
      audio,
      fetch,
    );

    await expect(session.connect()).rejects.toThrow(remoteDescriptionError);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "set_remote_description",
        message: message.slice(0, 200),
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(message);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.state).toBe("failed");
  });

  it("cleans up a broker binding when POST returns a non-2xx response", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (init?.method === "POST") {
          return new Response(null, { status: 502 });
        }
        expect(init?.method).toBe("DELETE");
        expect(url.search).toBe("?outcome=failed");
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer supabase-access-token",
        });
        return new Response(null, { status: 204 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await expect(session.connect()).rejects.toThrow(/broker request failed/i);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.state).toBe("failed");
  });

  it("cleans up after a broker POST rejects after the request starts", async () => {
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (init?.method === "POST") {
          expect(url.pathname).toContain(`/sessions/${SESSION_ID}/call`);
          throw new Error("Broker request aborted.");
        }
        expect(init?.method).toBe("DELETE");
        expect(url.search).toBe("?outcome=failed");
        return new Response(null, { status: 204 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await expect(session.connect()).rejects.toThrow(/aborted/i);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.state).toBe("failed");
  });

  it("cleans up after a broker POST is aborted after the request starts", async () => {
    let postSignal: AbortSignal | undefined;
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (init?.method === "POST") {
          postSignal = init.signal ?? undefined;
          return new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new Error("Broker request aborted."));
            });
          });
        }
        expect(init?.method).toBe("DELETE");
        expect(url.search).toBe("?outcome=failed");
        return new Response(null, { status: 204 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const ending = session.end();

    await ending;
    await expect(connection).rejects.toThrow(/aborted/i);
    expect(postSignal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.state).toBe("ended");
  });

  it("brokers raw SDP, wires local/remote media, and parses safe data-channel events", async () => {
    const fetch = createFetch();
    const states: string[] = [];
    const events: unknown[] = [];
    const errors: Error[] = [];
    const updateSession = vi.fn();
    const appendTranscript = vi.fn();
    const observeUsage = vi.fn();
    const finalizeSession = vi.fn();

    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        onStateChange: (state) => states.push(state),
        onEvent: (event) => events.push(event),
        onError: (error) => errors.push(error),
      },
    );

    const connection = session.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(session.state).toBe("connecting");
    expect(peer.connectionState).toBe("new");
    let settled = false;
    void connection.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    peer.emitConnectionState("connected");
    await connection;

    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(peer.createDataChannel).toHaveBeenCalledWith("oai-events");
    expect(peer.addTrack).toHaveBeenCalledWith(localTrack, localStream);
    expect(peer.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(states).toEqual([
      "acquiring_media",
      "creating_offer",
      "brokering_sdp",
      "connecting",
      "connected",
    ]);
    expect(errors).toHaveLength(0);

    peer.emitTrack(remoteTrack, remoteStream);
    expect(audio.srcObject).toBe(remoteStream);
    expect(audio.play).toHaveBeenCalledTimes(1);

    peer.dataChannel.emitMessage(
      JSON.stringify({ type: "response.done", response: { id: "resp-1" } }),
    );
    peer.dataChannel.emitMessage("not-json");

    expect(events).toEqual([
      {
        kind: "event",
        type: "response.done",
        payload: { type: "response.done", response: { id: "resp-1" } },
      },
      { kind: "invalid", reason: "malformed_json" },
    ]);
    // Browser lifecycle observers may react locally; persistence remains sideband-owned.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(updateSession).not.toHaveBeenCalled();
    expect(appendTranscript).not.toHaveBeenCalled();
    expect(observeUsage).not.toHaveBeenCalled();
    expect(finalizeSession).not.toHaveBeenCalled();
    expect(openAiWebRtcSessionSource).not.toMatch(
      /TranscriptCollector|observeOpenAIUsage|updateSession|flushOpenAIRealtimeUsage|recordFailedOpenAIRealtimeUsage/,
    );
  });

  it("sends DELETE at most once on end and performs deterministic cleanup", async () => {
    const fetch = createFetch();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await resolveConnection(session, peer);
    peer.emitTrack(remoteTrack, remoteStream);

    const first = session.end();
    const second = session.end();
    expect(second).toBe(first);
    await first;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(peer.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
    expect(remoteTrack.stop).toHaveBeenCalledTimes(1);
    expect(audio.srcObject).toBeNull();
    expect(session.state).toBe("ended");
  });

  it("retries a failed failure-cleanup DELETE and terminalizes only after success", async () => {
    const deleteResponses = [
      new Response(null, { status: 500 }),
      new Response(null, { status: 204 }),
    ];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (init?.method === "POST") {
          return new Response(
            "v=0\\r\\no=- 2 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\n",
            {
              status: 200,
              headers: { "Content-Type": "application/sdp" },
            },
          );
        }
        expect(init?.method).toBe("DELETE");
        expect(url.search).toBe("?outcome=failed");
        return deleteResponses.shift() ?? new Response(null, { status: 500 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await resolveConnection(session, peer);
    const firstFailure = session.end("failed");
    await expect(firstFailure).rejects.toThrow();
    expect(session.state).toBe("ending");
    expect(fetch).toHaveBeenCalledTimes(2);

    await session.cleanup();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(session.state).toBe("failed");
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("does not treat a broker DELETE 404 as successful cleanup", async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            "v=0\\r\\no=- 2 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\n",
            { status: 200, headers: { "Content-Type": "application/sdp" } },
          );
        }
        return new Response(null, { status: 404 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await resolveConnection(session, peer);
    await expect(session.end()).rejects.toThrow(/delete failed/i);
    expect(session.state).toBe("ending");
    expect(peer.close).not.toHaveBeenCalled();
    expect(localTrack.stop).not.toHaveBeenCalled();
  });

  it("retries a timed-out DELETE with a bounded second attempt", async () => {
    vi.useFakeTimers();
    let deleteAttempts = 0;
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (init?.method === "POST") {
          return new Response(
            "v=0\\r\\no=- 2 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\n",
            {
              status: 200,
              headers: { "Content-Type": "application/sdp" },
            },
          );
        }
        expect(init?.method).toBe("DELETE");
        expect(url.search).toBe("?outcome=failed");
        deleteAttempts += 1;
        if (deleteAttempts === 1) {
          return new Promise<Response>(() => {});
        }
        return new Response(null, { status: 204 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
        deleteTimeoutMs: 10,
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.state).toBe("connecting");
    peer.emitConnectionState("connected");
    await connection;
    const firstFailure = session.end("failed");
    await vi.advanceTimersByTimeAsync(10);
    await expect(firstFailure).rejects.toThrow(/timed out/i);
    expect(session.state).toBe("ending");

    await session.cleanup();

    expect(deleteAttempts).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(session.state).toBe("failed");
  });

  it.each(["connectionState", "iceState", "dataChannel"] as const)(
    "fails closed and cleans up when %s breaks",
    async (mode) => {
      const fetch = createFetch();
      const states: string[] = [];
      const session = new OpenAIWebRtcSession(
        {
          sessionId: SESSION_ID,
          accessToken: "supabase-access-token",
          brokerHttpBaseUrl: "https://broker.example/base",
          connectTimeoutMs: 1000,
        },
        {
          RTCPeerConnection: class {
            constructor() {
              return peer as unknown as RTCPeerConnection;
            }
          } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
          fetch,
          mediaDevices:
            mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
          audioElement:
            audio as unknown as OpenAIWebRtcDependencies["audioElement"],
          onStateChange: (state) => states.push(state),
        },
      );

      await resolveConnection(session, peer);
      peer.emitTrack(remoteTrack, remoteStream);

      if (mode === "connectionState") {
        peer.emitConnectionState("failed");
      } else if (mode === "iceState") {
        peer.emitIceState("failed");
      } else {
        peer.dataChannel.emitClose();
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(states.at(-1)).toBe("failed");
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(peer.close).toHaveBeenCalledTimes(1);
      expect(peer.dataChannel.close).toHaveBeenCalledTimes(
        mode === "dataChannel" ? 0 : 1,
      );
      expect(audio.srcObject).toBeNull();
    },
  );

  it("rejects invalid access tokens, UUIDs, and broker URLs before any provider work", async () => {
    const fetch = createFetch();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: "not-a-uuid",
        accessToken: " ",
        brokerHttpBaseUrl: "https://api.openai.com",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await expect(session.connect()).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("rejects and cleans up when peer connectivity times out", async () => {
    const fetch = createFetch();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
        connectTimeoutMs: 10,
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await expect(connection).rejects.toThrow(/timed out/i);
    expect(session.state).toBe("failed");
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetch.mock.calls[1][0])).search).toBe(
      "?outcome=failed",
    );
  });

  it("constructs a stream for a stream-less remote track and cleans it up", async () => {
    const fetch = createFetch();
    const fallbackStream = createStream([remoteTrack]);
    const mediaStreamFactory = vi.fn(
      (_tracks: OpenAIWebRtcTrackLike[]) =>
        fallbackStream as unknown as OpenAIWebRtcStreamLike,
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        mediaStreamFactory,
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await resolveConnection(session, peer);
    peer.emitTrack(remoteTrack);

    expect(mediaStreamFactory).toHaveBeenCalledWith([remoteTrack]);
    expect(audio.srcObject).toBe(fallbackStream);
    await session.end();
    expect(remoteTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("uses network_lost outcome for browser failure cleanup but plain DELETE for user end", async () => {
    const fetch = createFetch();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await resolveConnection(session, peer);
    peer.emitConnectionState("failed");
    await session.end();
    expect(new URL(String(fetch.mock.calls[1][0])).search).toBe(
      "?outcome=network_lost",
    );

    peer = createPeerConnection();
    const userEndFetch = createFetch();
    const userSession = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch: userEndFetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await resolveConnection(userSession, peer);
    await userSession.end();
    expect(new URL(String(userEndFetch.mock.calls[1][0])).search).toBe("");
  });

  it("classifies a microphone track ending as device unplug recovery", async () => {
    const fetch = createFetch();
    const onRecoveryRequired = vi.fn();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        onRecoveryRequired,
      },
    );

    await resolveConnection(session, peer);
    localTrack.onended?.();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(new URL(String(fetch.mock.calls[1]?.[0])).search).toBe(
      "?outcome=network_lost",
    );
    expect(onRecoveryRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "device_unplugged",
        outcome: "network_lost",
        requiresNewSessionBoundary: true,
      }),
    );
    expect(session.state).toBe("failed");
  });

  it("isolates throwing callbacks and settles after a hanging DELETE", async () => {
    const deleteStarted = vi.fn();
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
            {
              status: 200,
              headers: { "Content-Type": "application/sdp" },
            },
          );
        }
        deleteStarted();
        return new Promise<Response>(() => {});
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
        deleteTimeoutMs: 10,
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        onStateChange: () => {
          throw new Error("state callback failed");
        },
        onEvent: () => {
          throw new Error("event callback failed");
        },
        onError: () => {
          throw new Error("error callback failed");
        },
      },
    );

    await resolveConnection(session, peer);
    peer.dataChannel.emitMessage(JSON.stringify({ type: "response.done" }));
    peer.emitConnectionState("failed");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await expect(session.end()).rejects.toThrow(/timed out/i);

    expect(deleteStarted).toHaveBeenCalledTimes(1);
    // A retryable broker failure must not silently complete or tear down the
    // recording graph before durable terminalization succeeds.
    expect(peer.close).not.toHaveBeenCalled();
    expect(localTrack.stop).not.toHaveBeenCalled();
    expect(audio.srcObject).toBeNull();
  });

  it("ends authoritatively during pending microphone acquisition", async () => {
    const fetch = createFetch();
    let resolveMedia!: (stream: FakeStream) => void;
    mediaDevices.getUserMedia = vi.fn(
      () =>
        new Promise<FakeStream>((resolve) => {
          resolveMedia = resolve;
        }),
    );
    const SessionPeer = vi.fn();
    const PeerConstructor = class {
      constructor() {
        SessionPeer();
        return peer as unknown as RTCPeerConnection;
      }
    } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"];
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: PeerConstructor,
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await Promise.resolve();
    await session.end();
    resolveMedia(localStream);

    await expect(connection).rejects.toThrow(/shut down/i);
    expect(SessionPeer).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(new URL(String(fetch.mock.calls[0][0])).search).toBe(
      "?outcome=failed",
    );
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
    expect(session.state).toBe("ended");
  });

  it("ends authoritatively during pending offer creation", async () => {
    const fetch = createFetch();
    let resolveOffer!: (offer: RTCSessionDescriptionInit) => void;
    peer.createOffer.mockImplementation(
      () =>
        new Promise<RTCSessionDescriptionInit>((resolve) => {
          resolveOffer = resolve;
        }),
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await Promise.resolve();
    await Promise.resolve();
    expect(session.state).toBe("creating_offer");
    await session.end();
    resolveOffer({
      type: "offer",
      sdp: "v=0\\r\\no=- 1 1 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\n",
    });

    await expect(connection).rejects.toThrow(/shut down/i);
    expect(fetch).toHaveBeenCalledOnce();
    expect(new URL(String(fetch.mock.calls[0][0])).search).toBe(
      "?outcome=failed",
    );
    expect(peer.setLocalDescription).not.toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("cancels while waiting for peer connection without late state use", async () => {
    const fetch = createFetch(undefined, true);
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(session.state).toBe("connecting");
    expect(fetch).toHaveBeenCalledTimes(1);

    await session.end();
    await expect(connection).rejects.toThrow(/session ended/i);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetch.mock.calls[1][0])).search).toBe(
      "?outcome=failed",
    );

    peer.emitConnectionState("connected");
    expect(session.state).toBe("ended");
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("cancels during setRemoteDescription and performs one failed cleanup", async () => {
    const fetch = createFetch(undefined, true);
    let resolveRemoteDescription!: () => void;
    peer.setRemoteDescription.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRemoteDescription = resolve;
        }),
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(peer.setRemoteDescription).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    await session.end();
    resolveRemoteDescription();
    await expect(connection).rejects.toThrow(/shut down/i);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetch.mock.calls[1][0])).search).toBe(
      "?outcome=failed",
    );
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
    expect(session.state).toBe("ended");
  });

  it("cancels during setLocalDescription without late broker use", async () => {
    const fetch = createFetch();
    let resolveLocalDescription!: () => void;
    peer.setLocalDescription.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLocalDescription = resolve;
        }),
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(peer.setLocalDescription).toHaveBeenCalledTimes(1);

    await session.end();
    resolveLocalDescription();
    await expect(connection).rejects.toThrow(/shut down/i);

    expect(fetch).toHaveBeenCalledOnce();
    expect(new URL(String(fetch.mock.calls[0][0])).search).toBe(
      "?outcome=failed",
    );
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
    expect(session.state).toBe("ended");
  });

  it("cancels a pending broker POST and cleans up once when its response is late", async () => {
    let resolvePost!: (response: Response) => void;
    let postInit: RequestInit | undefined;
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (init?.method === "POST") {
          postInit = init;
          expect(url.toString()).toContain(`/sessions/${SESSION_ID}/call`);
          expect(init.headers).toMatchObject({
            Authorization: "Bearer supabase-access-token",
            "Content-Type": "application/sdp",
          });
          expect(init.body).toBe(
            "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n",
          );
          return new Promise<Response>((resolve) => {
            resolvePost = resolve;
          });
        }
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    const connection = session.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
    await session.end();
    expect(session.state).toBe("ended");
    expect(postInit?.signal?.aborted).toBe(true);

    resolvePost(
      new Response(
        "v=0\\r\\no=- 2 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\n",
        {
          status: 200,
          headers: { "Content-Type": "application/sdp" },
        },
      ),
    );
    await expect(connection).rejects.toThrow(/shut down/i);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetch.mock.calls[1][0])).search).toBe(
      "?outcome=failed",
    );
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(localTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("does not re-run recording finalization when a late POST response arrives", async () => {
    let resolvePost!: (response: Response) => void;
    const onRecordingComplete = vi.fn(async () => undefined);
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Promise<Response>((resolve) => {
            resolvePost = resolve;
          });
        }
        return new Response(null, { status: 204 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        onRecordingComplete,
      },
    );

    const connecting = session.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await session.end();
    expect(onRecordingComplete).toHaveBeenCalledOnce();
    expect(session.state).toBe("ended");

    resolvePost(
      new Response(
        "v=0\\r\\no=- 2 2 IN IP4 127.0.0.1\\r\\ns=-\\r\\nt=0 0\\r\\n",
        {
          status: 200,
          headers: { "Content-Type": "application/sdp" },
        },
      ),
    );
    await expect(connecting).rejects.toThrow(/shut down/i);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(onRecordingComplete).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.state).toBe("ended");
  });

  it("retries a failed broker POST cleanup on explicit cleanup", async () => {
    const deleteResponses = [
      new Response(null, { status: 500 }),
      new Response(null, { status: 204 }),
    ];
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(null, { status: 502 });
        }
        expect(init?.method).toBe("DELETE");
        const url = new URL(String(input));
        expect(url.search).toBe("?outcome=failed");
        return deleteResponses.shift() ?? new Response(null, { status: 500 });
      },
    );
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await expect(session.connect()).rejects.toThrow(/delete failed/i);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(session.state).toBe("ending");

    await session.cleanup();

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(session.state).toBe("failed");
  });

  it("rejects broker base URL credentials before any provider work", async () => {
    const fetch = createFetch();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://user:password@broker.example/base",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await expect(session.connect()).rejects.toThrow(/credentials/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("rejects a direct OpenAI broker base URL even with valid credentials", async () => {
    const fetch = createFetch();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "supabase-access-token",
        brokerHttpBaseUrl: "https://api.openai.com",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices:
          mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement:
          audio as unknown as OpenAIWebRtcDependencies["audioElement"],
      },
    );

    await expect(session.connect()).rejects.toThrow(/OpenAI/);
    expect(fetch).not.toHaveBeenCalled();
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  describe("OpenAI WebRTC termination source observability", () => {
    type TerminationCase = {
      name: string;
      expected: string;
      connectFirst: boolean;
      trigger: (
        session: OpenAIWebRtcSession,
        peer: FakePeerConnection,
        localTrack: FakeTrack,
      ) => void | Promise<void>;
    };

    const terminationCases: TerminationCase[] = [
      {
        name: "user end",
        expected: "user",
        connectFirst: true,
        trigger: (session) => session.end(),
      },
      {
        name: "timeout end",
        expected: "timeout",
        connectFirst: true,
        trigger: (session) => session.end(undefined, "timeout"),
      },
      {
        name: "cleanup unmount",
        expected: "unmount",
        connectFirst: true,
        trigger: (session) => session.cleanup(),
      },
      {
        name: "provider error",
        expected: "provider_error",
        connectFirst: true,
        trigger: (session) => session.end("failed", "provider_error"),
      },
      {
        name: "peer connection state",
        expected: "peer_state",
        connectFirst: true,
        trigger: (_session, connection) => {
          connection.emitConnectionState("failed");
        },
      },
      {
        name: "ice connection state",
        expected: "ice_state",
        connectFirst: true,
        trigger: (_session, connection) => {
          connection.emitIceState("failed");
        },
      },
      {
        name: "data channel close",
        expected: "data_channel_close",
        connectFirst: true,
        trigger: (_session, connection) => {
          connection.dataChannel.emitClose();
        },
      },
      {
        name: "microphone ended",
        expected: "microphone_ended",
        connectFirst: true,
        trigger: (_session, _connection, track) => {
          track.onended?.();
        },
      },
      {
        name: "connect timeout",
        expected: "connect_timeout",
        connectFirst: false,
        trigger: () => undefined,
      },
      {
        name: "connect failure",
        expected: "connect_failure",
        connectFirst: false,
        trigger: () => undefined,
      },
    ];

    it.each(terminationCases)(
      "logs $expected once before the broker DELETE ($name)",
      async ({ connectFirst, expected, trigger }) => {
        const fetch =
          expected === "connect_failure"
            ? vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                if (init?.method === "POST") {
                  throw new TypeError("Failed to fetch");
                }
                expect(init?.method).toBe("DELETE");
                return new Response(null, { status: 204 });
              })
            : createFetch();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const session = new OpenAIWebRtcSession(
          {
            sessionId: SESSION_ID,
            accessToken: "supabase-access-token",
            brokerHttpBaseUrl: "https://broker.example/base",
            connectTimeoutMs: expected === "connect_timeout" ? 10 : 1000,
          },
          {
            RTCPeerConnection: class {
              constructor() {
                return peer as unknown as RTCPeerConnection;
              }
            } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
            fetch,
            mediaDevices:
              mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
            audioElement:
              audio as unknown as OpenAIWebRtcDependencies["audioElement"],
          },
        );

        if (connectFirst) {
          await resolveConnection(session, peer);
        } else {
          const connection = session.connect();
          if (expected === "connect_timeout") {
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            const settled = expect(connection).rejects.toThrow(/timed out/i);
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
            await settled;
          } else {
            await expect(connection).rejects.toThrow(/failed to fetch/i);
          }
        }
        await trigger(session, peer, localTrack);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));

        const terminationCalls = warn.mock.calls.filter(
          (call) => call[0] === "[Telefun] OpenAI WebRTC termination",
        );
        expect(terminationCalls).toHaveLength(1);
        expect(terminationCalls[0][1]).toMatchObject({
          terminationSource: expected,
          hasConnected: connectFirst,
        });
        const terminationOrder =
          warn.mock.invocationCallOrder[
            warn.mock.calls.indexOf(terminationCalls[0])
          ];
        const deleteCallIndex = fetch.mock.calls.findIndex(
          (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
        );
        expect(deleteCallIndex).toBeGreaterThanOrEqual(0);
        expect(terminationOrder).toBeLessThan(
          fetch.mock.invocationCallOrder[deleteCallIndex],
        );
      },
    );

    it("captures the truthful pre-terminal state and stage for a connected call", async () => {
      const fetch = createFetch();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const session = new OpenAIWebRtcSession(
        {
          sessionId: SESSION_ID,
          accessToken: "supabase-access-token",
          brokerHttpBaseUrl: "https://broker.example/base",
        },
        {
          RTCPeerConnection: class {
            constructor() {
              return peer as unknown as RTCPeerConnection;
            }
          } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
          fetch,
          mediaDevices:
            mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
          audioElement:
            audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        },
      );

      await resolveConnection(session, peer);
      await session.end();

      const terminationCalls = warn.mock.calls.filter(
        (call) => call[0] === "[Telefun] OpenAI WebRTC termination",
      );
      expect(terminationCalls).toHaveLength(1);
      expect(terminationCalls[0][1]).toMatchObject({
        terminationSource: "user",
        state: "connected",
        stage: "connected",
        hasConnected: true,
      });
    });

    it("persists the pre-terminal connect stage while connecting", async () => {
      const fetch = createFetch();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const session = new OpenAIWebRtcSession(
        {
          sessionId: SESSION_ID,
          accessToken: "supabase-access-token",
          brokerHttpBaseUrl: "https://broker.example/base",
        },
        {
          RTCPeerConnection: class {
            constructor() {
              return peer as unknown as RTCPeerConnection;
            }
          } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
          fetch,
          mediaDevices:
            mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
          audioElement:
            audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        },
      );

      const connection = session.connect();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(session.state).toBe("connecting");
      // The session is suspended while waiting for the remote peer.
      await session.end();
      await connection.catch(() => undefined);

      const terminationCalls = warn.mock.calls.filter(
        (call) => call[0] === "[Telefun] OpenAI WebRTC termination",
      );
      expect(terminationCalls).toHaveLength(1);
      expect(terminationCalls[0][1]).toMatchObject({
        terminationSource: "user",
        state: "connecting",
        stage: "wait_for_peer",
        hasConnected: false,
      });
    });

    it("does not let a throwing termination logger block broker DELETE or final cleanup", async () => {
      const fetch = createFetch();
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {
        throw new Error("logging backend unavailable");
      });
      const session = new OpenAIWebRtcSession(
        {
          sessionId: SESSION_ID,
          accessToken: "supabase-access-token",
          brokerHttpBaseUrl: "https://broker.example/base",
        },
        {
          RTCPeerConnection: class {
            constructor() {
              return peer as unknown as RTCPeerConnection;
            }
          } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
          fetch,
          mediaDevices:
            mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
          audioElement:
            audio as unknown as OpenAIWebRtcDependencies["audioElement"],
        },
      );

      await resolveConnection(session, peer);
      await expect(session.end()).resolves.toBeUndefined();

      expect(session.state).toBe("ended");
      expect(
        fetch.mock.calls.some(
          (call) => (call[1] as RequestInit | undefined)?.method === "DELETE",
        ),
      ).toBe(true);
      expect(warn).toHaveBeenCalled();
    });
  });

  describe("OpenAI WebRTC provider error observability", () => {
    function createProviderEventHandler(fetch: ReturnType<typeof vi.fn>): {
      handleProviderEvent: (event: OpenAIWebRtcEvent) => void;
    } {
      const transport = new OpenAIWebRtcTransport(
        { sessionId: SESSION_ID } as unknown as TelefunAppSettings,
        "supabase-access-token",
        {
          websocketUrl: "wss://broker.example/base/ws",
          RTCPeerConnection: class {
            constructor() {
              return peer as unknown as RTCPeerConnection;
            }
          } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
          fetch,
          mediaDevices:
            mediaDevices as unknown as OpenAIWebRtcDependencies["mediaDevices"],
          audioElement:
            audio as unknown as OpenAIWebRtcDependencies["audioElement"],
          mediaRecorderIsTypeSupported: vi.fn(() => false),
          createObjectURL: vi.fn(),
          revokeObjectURL: vi.fn(),
        } as unknown as TelefunWebRtcFactoryEnvironment,
      );
      return transport as unknown as {
        handleProviderEvent: (event: OpenAIWebRtcEvent) => void;
      };
    }

    it("logs a bounded, redacted provider diagnostic and never the raw event", async () => {
      const fetch = vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) => {
          expect(init?.method).toBe("DELETE");
          return new Response(null, { status: 204 });
        },
      );
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const handler = createProviderEventHandler(fetch);

      const accessToken = "sk-secret-token-12345";
      const sdp = "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n";
      const prompt = "system: never leak this prompt";
      const longMessage = "upstream failure ".repeat(30);
      handler.handleProviderEvent({
        kind: "event",
        type: "error",
        payload: {
          type: "error",
          error: {
            code: "server_error",
            message: longMessage,
          },
          response: { output: [{ content: [{ text: prompt }] }] },
          sdp,
          access_token: accessToken,
        },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const diagnosticCalls = warn.mock.calls.filter(
        (call) => call[0] === "[Telefun] OpenAI WebRTC provider error",
      );
      expect(diagnosticCalls).toHaveLength(1);
      const diagnostic = diagnosticCalls[0][1] as Record<string, unknown>;
      expect(Object.keys(diagnostic).sort()).toEqual([
        "code",
        "message",
        "type",
      ]);
      expect(diagnostic).toMatchObject({
        type: "error",
        code: "server_error",
      });
      expect(typeof diagnostic.message).toBe("string");
      expect((diagnostic.message as string).length).toBeLessThanOrEqual(200);
      expect(diagnostic.message).toBe(longMessage.slice(0, 200));

      const serialized = JSON.stringify(diagnosticCalls[0]);
      expect(serialized).not.toContain(accessToken);
      expect(serialized).not.toContain("v=0");
      expect(serialized).not.toContain("never leak this prompt");
      expect(serialized).not.toContain(longMessage);
    });

    it("keeps the diagnostic empty or type-only for malformed provider events", () => {
      expect(
        buildSafeProviderDiagnostic({
          kind: "invalid",
          reason: "malformed_json",
        }),
      ).toEqual({});
      expect(
        buildSafeProviderDiagnostic({
          kind: "event",
          type: "error",
          payload: { type: "error", error: "not an object" },
        }),
      ).toEqual({ type: "error" });
    });
  });
});
