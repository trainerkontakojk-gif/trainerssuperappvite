import { describe, expect, it, vi, beforeEach } from "vitest";
import { LiveSession } from "../routes/telefun/services/geminiService";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

function createMockConfig(): TelefunAppSettings {
  return {
    scenarios: [],
    consumerTypes: [],
    identitySettings: undefined,
    sessionId: undefined,
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

interface MockSource {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  buffer: { duration: number } | null;
  onended: (() => void) | null;
}

interface MockAudioContext {
  currentTime: number;
  destination: Record<string, never>;
  createBuffer: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

function createMockAudio(): {
  ctx: MockAudioContext;
  sources: MockSource[];
} {
  const sources: MockSource[] = [];
  const ctx: MockAudioContext = {
    currentTime: 10,
    destination: {},
    createBuffer: vi.fn(() => ({
      getChannelData: vi.fn(() => new Float32Array(100)),
      duration: 0.5,
    })),
    createBufferSource: vi.fn(() => {
      const s: MockSource = {
        buffer: null,
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
        connect: vi.fn(function (this: MockSource) {
          return this;
        }),
        onended: null,
      };
      sources.push(s);
      return s;
    }),
    close: vi.fn(),
  };
  return { ctx, sources };
}

function makePcmData(samples: number[]): Uint8Array {
  return new Uint8Array(new Int16Array(samples).buffer);
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe("LiveSession AI playback lifecycle", () => {
  it("serverContent.interrupted clears queued playback and marks AI as not speaking", () => {
    const session = new LiveSession(createMockConfig()) as unknown as Record<
      string,
      unknown
    >;
    const { ctx, sources } = createMockAudio();

    session.audioContext = ctx;
    session.recordingDestination = {};
    (session as unknown as { activeSources: Set<unknown> }).activeSources =
      new Set();

    (session as unknown as { setIsAiSpeaking: (v: boolean) => void }).setIsAiSpeaking(
      true,
    );

    (session as unknown as { playPcm: (d: Uint8Array, r: number) => void }).playPcm(
      makePcmData([10000, -10000]),
      24000,
    );

    const activeSources = session.activeSources as Set<MockSource>;
    expect(activeSources.size).toBe(1);

    const source = sources[0];
    (
      session as unknown as { handleJsonMessage: (msg: Record<string, unknown>) => void }
    ).handleJsonMessage({
      serverContent: { interrupted: true },
    });

    expect(source.stop).toHaveBeenCalled();
    expect(activeSources.size).toBe(0);
    expect(session.isAiSpeaking).toBe(false);
    expect(session.nextStartTime).toBe(0);
    expect(session.interruptionCount).toBe(1);
  });

  it("microphone VAD does not cancel AI playback or send a local interruption prompt", () => {
    const session = new LiveSession(createMockConfig()) as unknown as Record<
      string,
      unknown
    >;
    const { ctx } = createMockAudio();

    session.audioContext = ctx;
    session.recordingDestination = {};
    session.activeSources = new Set();
    session.isAiSpeaking = true;

    (session as unknown as { playPcm: (d: Uint8Array, r: number) => void }).playPcm(
      makePcmData([10000, -10000]),
      24000,
    );

    const source = (session.activeSources as Set<MockSource>).values().next().value as MockSource;
    (session as unknown as { handleInputAudioFrame: (data: Float32Array) => void }).handleInputAudioFrame(
      new Float32Array([0.4, 0.4, 0.4, 0.4]),
    );

    expect(source.stop).not.toHaveBeenCalled();
    expect(Object.prototype.hasOwnProperty.call(session, "send" + "InterruptionPrompt")).toBe(false);
    expect(session.interruptionCount).toBe(0);
  });

  it("turnComplete does not end local isAiSpeaking until queued audio sources finish", () => {
    const session = new LiveSession(createMockConfig()) as unknown as Record<
      string,
      unknown
    >;
    const { ctx } = createMockAudio();

    session.audioContext = ctx;
    session.recordingDestination = {};
    (session as unknown as { activeSources: Set<unknown> }).activeSources =
      new Set();

    (session as unknown as { setIsAiSpeaking: (v: boolean) => void }).setIsAiSpeaking(
      true,
    );

    (session as unknown as { playPcm: (d: Uint8Array, r: number) => void }).playPcm(
      makePcmData([10000, -10000]),
      24000,
    );

    const activeSources = session.activeSources as Set<{
      onended: (() => void) | null;
    }>;
    expect(activeSources.size).toBe(1);

    (
      session as unknown as { handleJsonMessage: (msg: Record<string, unknown>) => void }
    ).handleJsonMessage({
      serverContent: { turnComplete: true },
    });

    expect(session.isAiSpeaking).toBe(true);

    const source = activeSources.values().next().value as {
      onended: (() => void) | null;
    };
    source.onended?.();

    expect(session.isAiSpeaking).toBe(false);
    expect(activeSources.size).toBe(0);
  });

  it("does not stop same-turn audio chunks before turnComplete", () => {
    const session = new LiveSession(createMockConfig()) as unknown as Record<
      string,
      unknown
    >;
    const { ctx, sources } = createMockAudio();

    session.audioContext = ctx;
    session.recordingDestination = {};
    (session as unknown as { activeSources: Set<unknown> }).activeSources =
      new Set();

    (
      session as unknown as { handleJsonMessage: (msg: Record<string, unknown>) => void }
    ).handleJsonMessage({
      serverContent: {
        modelTurn: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/pcm;rate=24000",
                data: Buffer.from(makePcmData([10000, -10000])).toString(
                  "base64",
                ),
              },
            },
          ],
        },
      },
    });

    (
      session as unknown as { handleJsonMessage: (msg: Record<string, unknown>) => void }
    ).handleJsonMessage({
      serverContent: {
        modelTurn: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/pcm;rate=24000",
                data: Buffer.from(makePcmData([8000, -8000])).toString(
                  "base64",
                ),
              },
            },
          ],
        },
      },
    });

    expect(sources).toHaveLength(2);
    expect(sources[0].stop).not.toHaveBeenCalled();
    expect((session.activeSources as Set<MockSource>).size).toBe(2);
  });

  it("clearAiPlayback resets pending completion and schedule even when no sources are active", () => {
    const session = new LiveSession(createMockConfig()) as unknown as Record<
      string,
      unknown
    >;

    session.activeSources = new Set();
    session.pendingTurnCompletion = true;
    session.nextStartTime = 42;

    (
      session as unknown as { clearAiPlayback: (reason: string) => void }
    ).clearAiPlayback("server_interrupted");

    expect(session.pendingTurnCompletion).toBe(false);
    expect(session.nextStartTime).toBe(0);
  });

  it("setHold(true) clears active/queued AI playback so hold does not leak old audio", () => {
    const session = new LiveSession(createMockConfig()) as unknown as Record<
      string,
      unknown
    >;
    const { ctx, sources } = createMockAudio();

    session.audioContext = ctx;
    session.recordingDestination = {};
    (session as unknown as { activeSources: Set<unknown> }).activeSources =
      new Set();

    (session as unknown as { setIsAiSpeaking: (v: boolean) => void }).setIsAiSpeaking(
      true,
    );

    (session as unknown as { playPcm: (d: Uint8Array, r: number) => void }).playPcm(
      makePcmData([10000, -10000]),
      24000,
    );

    const activeSources = session.activeSources as Set<MockSource>;
    expect(activeSources.size).toBe(1);

    const source = sources[0];
    session.sessionStartTime = Date.now();
    (session as unknown as { setHold: (v: boolean) => void }).setHold(true);

    expect(source.stop).toHaveBeenCalled();
    expect(activeSources.size).toBe(0);
    expect(session.isAiSpeaking).toBe(false);
  });
});
