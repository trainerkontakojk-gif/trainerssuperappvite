import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIWebRtcSession } from "../routes/telefun/services/openaiWebRtc/openaiWebRtcSession";
import { OpenAIWebRtcRecordingGraph } from "../routes/telefun/services/openaiWebRtc/recording";
import {
  createRetainedObjectUrlOwner,
  revokeObjectUrlOnce,
} from "../routes/telefun/services/openaiWebRtc/cleanup";
import type {
  OpenAIWebRtcDependencies,
  OpenAIWebRtcStreamLike,
} from "../routes/telefun/services/openaiWebRtc/contracts";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

type FakeTrack = {
  enabled: boolean;
  stop: ReturnType<typeof vi.fn>;
};

type FakeStream = {
  getTracks: () => FakeTrack[];
  getAudioTracks: () => FakeTrack[];
  addTrack: (track: FakeTrack) => void;
};

function createTrack(): FakeTrack {
  return { enabled: true, stop: vi.fn() };
}

function createStream(tracks: FakeTrack[]): FakeStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
    addTrack: (track) => tracks.push(track),
  };
}

function createPeer() {
  const channel = {
    label: "oai-events",
    readyState: "connecting",
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null as (() => void) | null,
    close: vi.fn(() => {
      channel.readyState = "closed";
    }),
    send: vi.fn(),
  };
  const peer = {
    addTrack: vi.fn(),
    createDataChannel: vi.fn(() => channel),
    createOffer: vi.fn(async () => ({ type: "offer", sdp: "v=0 offer" })),
    setLocalDescription: vi.fn(async () => undefined),
    setRemoteDescription: vi.fn(async () => undefined),
    close: vi.fn(),
    ontrack: null as
      | ((event: { track: FakeTrack; streams: FakeStream[] }) => void)
      | null,
    onconnectionstatechange: null as (() => void) | null,
    oniceconnectionstatechange: null as (() => void) | null,
    connectionState: "new",
    iceConnectionState: "new",
    channel,
  };
  return peer;
}

class FakeAudioNode {
  public readonly connections: unknown[] = [];
  connect = vi.fn((destination: unknown) => {
    this.connections.push(destination);
  });
  disconnect = vi.fn();
}

class FakeAudioContext {
  public readonly localSource = new FakeAudioNode();
  public readonly remoteSource = new FakeAudioNode();
  public readonly analyser = new FakeAudioNode() as FakeAudioNode & {
    fftSize: number;
    frequencyBinCount: number;
    getByteTimeDomainData: (data: Uint8Array) => void;
  };
  public readonly destinations: Array<{ stream: FakeStream }> = [];
  public readonly close = vi.fn(async () => undefined);
  private sourceCount = 0;

  constructor(private readonly localStream: FakeStream) {
    this.analyser.fftSize = 256;
    this.analyser.frequencyBinCount = 8;
    this.analyser.getByteTimeDomainData = (data) => data.fill(128);
  }

  createMediaStreamSource(stream: FakeStream): FakeAudioNode {
    this.sourceCount += 1;
    const source =
      this.sourceCount === 1 ? this.localSource : this.remoteSource;
    if (this.sourceCount === 1) expect(stream).toBe(this.localStream);
    return source;
  }

  createMediaStreamDestination() {
    const destination = { stream: createStream([]) };
    this.destinations.push(destination);
    return destination;
  }

  createAnalyser() {
    return this.analyser;
  }
}

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  public state: "inactive" | "recording" = "inactive";
  public ondataavailable: ((event: { data: Blob }) => void) | null = null;
  public onstop: (() => void) | null = null;
  public readonly start = vi.fn((_timeslice?: number) => {
    this.state = "recording";
  });
  public stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["chunk"]) });
    this.onstop?.();
  });

  constructor(
    public readonly stream: FakeStream,
    public readonly mimeType = "",
  ) {}
}

describe("OpenAI WebRTC recording graph", () => {
  it("revokes transferred object URL ownership exactly once", () => {
    const revoke = vi.fn();
    revokeObjectUrlOnce("blob:owned", revoke);
    revokeObjectUrlOnce(null, revoke);
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:owned");
  });

  it("prevents a late callback from reclaiming a URL abandoned by parent navigation", () => {
    const revoke = vi.fn();
    const owner = createRetainedObjectUrlOwner(revoke);

    expect(owner.retain("blob:late-review")).toBe(true);
    owner.releaseIfNotTransferredToReview();

    expect(revoke).toHaveBeenCalledOnce();
    expect(owner.retain("blob:late-review")).toBe(false);
    expect(owner.transferToReview("blob:late-review")).toBe(false);
    owner.release();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it("hands an abandoned synchronous owner back to the session without double revoke", () => {
    const revoke = vi.fn();
    const owner = createRetainedObjectUrlOwner(revoke);

    expect(owner.retain("blob:missing-session")).toBe(true);
    owner.returnToSession("blob:missing-session");
    expect(revoke).not.toHaveBeenCalled();

    revokeObjectUrlOnce("blob:missing-session", revoke);
    expect(owner.retain("blob:missing-session")).toBe(false);
    owner.release();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it.each([
    { hasOwner: false, expectedRevokes: 1 },
    { hasOwner: true, expectedRevokes: 0 },
  ])(
    "requires a page owner before accepting object URL transfer",
    async ({ hasOwner, expectedRevokes }) => {
      const revoke = vi.fn();
      const graph = {
        stop: vi.fn(async () => ({
          fullBlob: new Blob(["full"]),
          agentBlob: null,
          recordingError: null,
        })),
        createFullObjectUrl: vi.fn(() => "blob:owned"),
        revokeObjectUrl: revoke,
        getVolumeSamples: vi.fn(() => []),
      };
      const session = new OpenAIWebRtcSession(
        {
          sessionId: SESSION_ID,
          accessToken: "token",
          brokerHttpBaseUrl: "https://broker.example",
        },
        {
          RTCPeerConnection:
            class {} as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
          fetch: vi.fn(),
          mediaDevices: { getUserMedia: vi.fn() },
          audioElement: { srcObject: null, play: vi.fn() },
          createObjectURL: vi.fn(() => "blob:owned"),
          isObjectUrlRetained: hasOwner ? () => true : undefined,
          onRecordingComplete: vi.fn(async () => ({ retainObjectUrl: true })),
        },
      );
      Object.assign(session, {
        recordingGraph: graph,
        sessionStartTime: Date.now(),
      });

      await (
        session as unknown as { finalizeRecording: () => Promise<void> }
      ).finalizeRecording();

      expect(revoke).toHaveBeenCalledTimes(expectedRevokes);
    },
  );

  it("builds final metrics after recorder stop flushes the last volume samples", async () => {
    let volumeSamples: number[] = [];
    const graph = {
      stop: vi.fn(async () => {
        volumeSamples = [42];
        return {
          fullBlob: null,
          agentBlob: null,
          recordingError: null,
        };
      }),
      createFullObjectUrl: vi.fn(() => null),
      revokeObjectUrl: vi.fn(),
      getVolumeSamples: vi.fn(() => volumeSamples),
    };
    const onRecordingComplete = vi.fn<
      NonNullable<OpenAIWebRtcDependencies["onRecordingComplete"]>
    >(async () => undefined);
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "token",
        brokerHttpBaseUrl: "https://broker.example",
      },
      {
        RTCPeerConnection:
          class {} as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch: vi.fn(),
        mediaDevices: { getUserMedia: vi.fn() },
        audioElement: { srcObject: null, play: vi.fn() },
        onRecordingComplete,
      },
    );
    Object.assign(session, { recordingGraph: graph });

    await (
      session as unknown as { finalizeRecording: () => Promise<void> }
    ).finalizeRecording();

    expect(graph.stop).toHaveBeenCalledOnce();
    expect(onRecordingComplete.mock.calls[0][3]).toMatchObject({
      volumeSamples: [42],
    });
  });

  it("does not revoke before a slow recording callback can publish its fallback owner", async () => {
    vi.useFakeTimers();
    let resolveCallback!: () => void;
    const callbackDone = new Promise<void>((resolve) => {
      resolveCallback = resolve;
    });
    const revoke = vi.fn();
    const graph = {
      stop: vi.fn(async () => ({
        fullBlob: new Blob(["full"]),
        agentBlob: null,
        recordingError: null,
      })),
      createFullObjectUrl: vi.fn(() => "blob:slow"),
      revokeObjectUrl: revoke,
      getVolumeSamples: vi.fn(() => []),
    };
    let ownerPublished = false;
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "token",
        brokerHttpBaseUrl: "https://broker.example",
      },
      {
        RTCPeerConnection:
          class {} as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch: vi.fn(),
        mediaDevices: { getUserMedia: vi.fn() },
        audioElement: { srcObject: null, play: vi.fn() },
        isObjectUrlRetained: () => ownerPublished,
        onRecordingComplete: async () => {
          await callbackDone;
          ownerPublished = true;
          return { retainObjectUrl: true };
        },
      },
    );
    Object.assign(session, {
      recordingGraph: graph,
      sessionStartTime: Date.now(),
    });

    const finalizing = (
      session as unknown as { finalizeRecording: () => Promise<void> }
    ).finalizeRecording();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(revoke).not.toHaveBeenCalled();

    resolveCallback();
    await finalizing;
    await Promise.resolve();
    expect(revoke).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("releases a timeout-abandoned page owner exactly once after late callback settlement", async () => {
    vi.useFakeTimers();
    let resolveCallback!: (value: { retainObjectUrl: true }) => void;
    const callbackPromise = new Promise<{ retainObjectUrl: true }>(
      (resolve) => {
        resolveCallback = resolve;
      },
    );
    const revoke = vi.fn();
    const graph = {
      stop: vi.fn(async () => ({
        fullBlob: new Blob(["full"]),
        agentBlob: null,
        recordingError: null,
      })),
      createFullObjectUrl: vi.fn(() => "blob:never-settling"),
      revokeObjectUrl: revoke,
      getVolumeSamples: vi.fn(() => []),
    };
    const owner = createRetainedObjectUrlOwner(revoke);
    owner.retain("blob:never-settling");
    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "token",
        brokerHttpBaseUrl: "https://broker.example",
      },
      {
        RTCPeerConnection:
          class {} as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch: vi.fn(),
        mediaDevices: { getUserMedia: vi.fn() },
        audioElement: { srcObject: null, play: vi.fn() },
        isObjectUrlRetained: (url) => owner.isRetained(url),
        onRecordingComplete: vi.fn(async (url) => {
          const result = await callbackPromise;
          owner.retain(url);
          if (url) owner.transferToReview(url);
          return result;
        }),
      },
    );
    Object.assign(session, {
      recordingGraph: graph,
      sessionStartTime: Date.now(),
    });

    const finalizing = (
      session as unknown as { finalizeRecording: () => Promise<void> }
    ).finalizeRecording();
    await vi.advanceTimersByTimeAsync(10_000);
    await finalizing;
    expect(revoke).not.toHaveBeenCalled();

    // Parent navigation abandons the retained URL while the callback is still pending.
    owner.releaseIfNotTransferredToReview();
    resolveCallback({ retainObjectUrl: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(revoke).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("falls back across supported MIME and no-options MediaRecorder variants", async () => {
    const localStream = createStream([createTrack()]);
    const audioContext = new FakeAudioContext(localStream);
    const constructorOptions: Array<{ mimeType: string } | undefined> = [];
    const recorders: FakeMediaRecorder[] = [];
    const graph = new OpenAIWebRtcRecordingGraph({
      audioContextFactory: () => audioContext,
      mediaRecorderIsTypeSupported: (mimeType: string) =>
        mimeType === "audio/mp4",
      mediaRecorderFactory: (
        stream: OpenAIWebRtcStreamLike,
        options?: { mimeType: string },
      ) => {
        constructorOptions.push(options);
        if (options) throw new TypeError("options are unsupported");
        const recorder = new FakeMediaRecorder(
          stream as unknown as FakeStream,
          "audio/ogg",
        );
        recorders.push(recorder);
        return recorder;
      },
    } as unknown as OpenAIWebRtcDependencies);

    await expect(
      graph.start(localStream as unknown as OpenAIWebRtcStreamLike),
    ).resolves.toBe(true);
    expect(constructorOptions).toEqual([
      { mimeType: "audio/mp4" },
      undefined,
      { mimeType: "audio/mp4" },
      undefined,
    ]);
    expect(recorders).toHaveLength(2);
    const result = await graph.stop();
    expect(result.fullBlob?.type).toBe("audio/ogg");
    expect(result.agentBlob?.type).toBe("audio/ogg");
    await graph.dispose();
  });

  it("resumes a suspended recording context before starting recorders", async () => {
    const localTrack = createTrack();
    const localStream = createStream([localTrack]);
    const audioContext = new FakeAudioContext(
      localStream,
    ) as FakeAudioContext & {
      state: string;
      resume: ReturnType<typeof vi.fn>;
    };
    audioContext.state = "suspended";
    audioContext.resume = vi.fn(async () => {
      audioContext.state = "running";
    });
    const recorders: FakeMediaRecorder[] = [];

    const graph = new OpenAIWebRtcRecordingGraph({
      audioContextFactory: () => audioContext,
      mediaRecorderIsTypeSupported: () => true,
      mediaRecorderFactory: (stream: OpenAIWebRtcStreamLike) => {
        const recorder = new FakeMediaRecorder(stream as unknown as FakeStream);
        recorders.push(recorder);
        return recorder;
      },
    } as unknown as OpenAIWebRtcDependencies);

    await expect(
      graph.start(localStream as unknown as OpenAIWebRtcStreamLike),
    ).resolves.toBe(true);
    expect(audioContext.resume).toHaveBeenCalledOnce();
    expect(recorders).toHaveLength(2);
    expect(
      recorders.every(
        (recorder) =>
          recorder.start.mock.invocationCallOrder[0]! >
          audioContext.resume.mock.invocationCallOrder[0]!,
      ),
    ).toBe(true);
    await graph.dispose();
  });

  it("marks capture failed when recording context resume is rejected", async () => {
    const localStream = createStream([createTrack()]);
    const audioContext = new FakeAudioContext(
      localStream,
    ) as FakeAudioContext & {
      state: string;
      resume: ReturnType<typeof vi.fn>;
    };
    audioContext.state = "suspended";
    audioContext.resume = vi.fn(async () => {
      throw new Error("resume denied");
    });
    const graph = new OpenAIWebRtcRecordingGraph({
      audioContextFactory: () => audioContext,
      mediaRecorderIsTypeSupported: () => true,
      mediaRecorderFactory: vi.fn(),
    } as unknown as OpenAIWebRtcDependencies);

    await expect(
      graph.start(localStream as unknown as OpenAIWebRtcStreamLike),
    ).resolves.toBe(false);
    const result = await graph.stop();
    expect(result.recordingError).toEqual(new Error("resume denied"));
    await graph.dispose();
  });

  it("stops a recorder that started before its paired recorder fails", async () => {
    const localStream = createStream([createTrack()]);
    const audioContext = new FakeAudioContext(localStream);
    const recorders = [
      new FakeMediaRecorder(createStream([])),
      new FakeMediaRecorder(createStream([])),
    ];
    recorders[1]!.start.mockImplementation(() => {
      throw new Error("agent recorder start failed");
    });
    let recorderIndex = 0;
    const graph = new OpenAIWebRtcRecordingGraph({
      audioContextFactory: () => audioContext,
      mediaRecorderIsTypeSupported: () => true,
      mediaRecorderFactory: () => recorders[recorderIndex++]!,
    } as unknown as OpenAIWebRtcDependencies);

    await expect(
      graph.start(localStream as unknown as OpenAIWebRtcStreamLike),
    ).resolves.toBe(false);
    expect(recorders[0]!.stop).toHaveBeenCalledOnce();
    expect(recorders[0]!.state).toBe("inactive");

    const result = await graph.stop();
    expect(result.recordingError).toEqual(
      new Error("agent recorder start failed"),
    );
    await graph.dispose();
  });

  it("stops active recorders again before disposing a timed-out graph", async () => {
    vi.useFakeTimers();
    try {
      const localStream = createStream([createTrack()]);
      const recorder = {
        state: "recording",
        ondataavailable: null,
        onstop: null,
        start: vi.fn(),
        stop: vi.fn(),
      } as unknown as FakeMediaRecorder;
      const graph = new OpenAIWebRtcRecordingGraph({
        audioContextFactory: () => new FakeAudioContext(localStream),
        mediaRecorderIsTypeSupported: () => true,
        mediaRecorderFactory: vi.fn(() => recorder),
      } as unknown as OpenAIWebRtcDependencies);

      await expect(
        graph.start(localStream as unknown as OpenAIWebRtcStreamLike),
      ).resolves.toBe(true);
      const stopping = graph.stop();
      await vi.advanceTimersByTimeAsync(5_000);
      await stopping;
      const stopsBeforeDispose = recorder.stop.mock.calls.length;
      await graph.dispose();

      expect(stopsBeforeDispose).toBeGreaterThanOrEqual(2);
      expect(recorder.stop).toHaveBeenCalledAfter(recorder.start as never);
    } finally {
      vi.useRealTimers();
    }
  });

  it("mixes remote audio into full-call only and awaits recording after broker DELETE", async () => {
    const order: string[] = [];
    const localTrack = createTrack();
    const remoteTrack = createTrack();
    const localStream = createStream([localTrack]);
    const remoteStream = createStream([remoteTrack]);
    const peer = createPeer();
    const getUserMedia = vi.fn(async () => localStream);
    const audioContext = new FakeAudioContext(localStream);
    const recorders: FakeMediaRecorder[] = [];
    let resolveRecording!: () => void;
    const recordingReady = new Promise<void>((resolve) => {
      resolveRecording = resolve;
    });
    const recording = {
      current: null as {
        url: string | null;
        full: Blob | null;
        agent: Blob | null;
      } | null,
    };

    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response("v=0 answer", {
            status: 201,
            headers: { "content-type": "application/sdp" },
          });
        }
        order.push("delete");
        return new Response(null, { status: 204 });
      },
    );

    const session = new OpenAIWebRtcSession(
      {
        sessionId: SESSION_ID,
        accessToken: "token",
        brokerHttpBaseUrl: "https://broker.example",
      },
      {
        RTCPeerConnection: class {
          constructor() {
            return peer as unknown as RTCPeerConnection;
          }
        } as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices: {
          getUserMedia,
        } as unknown as OpenAIWebRtcDependencies["mediaDevices"],
        audioElement: {
          srcObject: null,
          play: vi.fn(async () => {
            throw new Error("autoplay blocked");
          }),
        },
        audioContextFactory: () =>
          audioContext as unknown as ReturnType<
            NonNullable<OpenAIWebRtcDependencies["audioContextFactory"]>
          >,
        mediaRecorderFactory: (stream) => {
          const recorder = new FakeMediaRecorder(
            stream as unknown as FakeStream,
          );
          const originalStop = recorder.stop;
          recorder.stop = vi.fn(() => {
            order.push("recorder-stop");
            originalStop();
          });
          recorders.push(recorder);
          return recorder;
        },
        createObjectURL: vi.fn(() => "blob:full-call"),
        revokeObjectURL: vi.fn(() => order.push("revoke")),
        onRecordingComplete: async (url, fullBlob, agentBlob) => {
          order.push("recording-callback");
          recording.current = { url, full: fullBlob, agent: agentBlob };
          await recordingReady;
        },
      },
    );

    const connection = session.connect();
    await Promise.resolve();
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    await connection;

    peer.ontrack?.({ track: remoteTrack, streams: [remoteStream] });
    const ending = session.end();
    await Promise.resolve();
    expect(audioContext.close).not.toHaveBeenCalled();
    resolveRecording();
    await ending;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(peer.addTrack).toHaveBeenCalledWith(localTrack, localStream);
    expect(recorders).toHaveLength(2);
    expect(recorders.map((recorder) => recorder.stream)).toEqual([
      audioContext.destinations[0].stream,
      audioContext.destinations[1].stream,
    ]);
    expect(audioContext.localSource.connect).toHaveBeenCalledWith(
      audioContext.destinations[0],
    );
    expect(audioContext.localSource.connect).toHaveBeenCalledWith(
      audioContext.destinations[1],
    );
    expect(audioContext.remoteSource.connect).toHaveBeenCalledWith(
      audioContext.destinations[0],
    );
    expect(audioContext.remoteSource.connect).not.toHaveBeenCalledWith(
      audioContext.destinations[1],
    );
    expect(order.indexOf("delete")).toBeLessThan(
      order.indexOf("recorder-stop"),
    );
    expect(order.indexOf("recorder-stop")).toBeLessThan(
      order.indexOf("recording-callback"),
    );
    expect(recording.current?.url).toBe("blob:full-call");
    expect(recording.current?.full).toBeInstanceOf(Blob);
    expect(recording.current?.agent).toBeInstanceOf(Blob);
    expect(order.indexOf("recording-callback")).toBeLessThan(
      order.indexOf("revoke"),
    );
    expect(audioContext.close).toHaveBeenCalledOnce();
  });
});
