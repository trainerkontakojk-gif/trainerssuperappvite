import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveSession } from "../routes/telefun/services/liveSession";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";

function createMockConfig(): TelefunAppSettings {
  return {
    scenarios: [{ id: "scenario-1", title: "Skenario", instruction: "Roleplay" }],
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

function createFakeTrack(initialEnabled = true) {
  return { enabled: initialEnabled, kind: "audio" as const, label: "mic" } as unknown as MediaStreamTrack;
}

function createFakeStream(tracks: MediaStreamTrack[]) {
  return {
    getAudioTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSED = 3;
  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "";
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
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
  addEventListener() {}
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

describe("LiveSession mute recording capture regression", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_TELEFUN_WS_URL", "wss://telefun.test/ws");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("disables each microphone audio track when muted so agent recording cannot capture speech", () => {
    const session = new LiveSession(createMockConfig());
    const trackA = createFakeTrack(true);
    const trackB = createFakeTrack(true);
    const stream = createFakeStream([trackA, trackB]);
    (session as unknown as { stream: MediaStream }).stream = stream;

    session.setMute(true);

    expect(trackA.enabled).toBe(false);
    expect(trackB.enabled).toBe(false);
    expect((session as unknown as { isMuted: boolean }).isMuted).toBe(true);
  });

  it("re-enables each microphone audio track when unmuted to restore capture", () => {
    const session = new LiveSession(createMockConfig());
    const trackA = createFakeTrack(false);
    const trackB = createFakeTrack(false);
    const stream = createFakeStream([trackA, trackB]);
    (session as unknown as { stream: MediaStream }).stream = stream;
    (session as unknown as { isMuted: boolean }).isMuted = true;
    trackA.enabled = false;
    trackB.enabled = false;

    session.setMute(false);

    expect(trackA.enabled).toBe(true);
    expect(trackB.enabled).toBe(true);
    expect((session as unknown as { isMuted: boolean }).isMuted).toBe(false);
  });

  it("does not throw when stream is not yet available and still updates mute flag", () => {
    const session = new LiveSession(createMockConfig());
    (session as unknown as { stream: MediaStream | null }).stream = null;

    expect(() => session.setMute(true)).not.toThrow();
    expect((session as unknown as { isMuted: boolean }).isMuted).toBe(true);

    expect(() => session.setMute(false)).not.toThrow();
    expect((session as unknown as { isMuted: boolean }).isMuted).toBe(false);
  });

  it("applies pre-stream mute to newly acquired track before recorder graph attaches (race regression)", async () => {
    // Minimal fakes following telefun-live-session-auth.test.ts patterns — no real browser/provider calls
    vi.stubGlobal(
      "WebSocket",
      class extends FakeWebSocket {
        static readonly OPEN = FakeWebSocket.OPEN;
        static readonly CONNECTING = FakeWebSocket.CONNECTING;
        static readonly CLOSED = FakeWebSocket.CLOSED;
        constructor(url: string) {
          super(url);
        }
      },
    );
    class FakeAudioContext {
      state = "running";
      close = vi.fn(async () => undefined);
    }
    vi.stubGlobal("AudioContext", FakeAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal("window", { AudioContext: FakeAudioContext } as unknown as Window & typeof globalThis);

    const track = createFakeTrack(true);
    const fakeStream = createFakeStream([track]);

    let resolveStream!: (s: MediaStream) => void;
    const deferredStream = new Promise<MediaStream>((resolve) => {
      resolveStream = resolve;
    });
    const getUserMedia = vi.fn().mockReturnValue(deferredStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    let recorderSeenEnabled: boolean | null = null;
    let inputSeenEnabled: boolean | null = null;
    const recorderSpy = vi
      .spyOn(LiveSession.prototype as unknown as { setupRecorders: () => void }, "setupRecorders")
      .mockImplementation(function (this: unknown) {
        recorderSeenEnabled = track.enabled;
      });
    const inputSpy = vi
      .spyOn(LiveSession.prototype as unknown as { setupInputProcessing: () => Promise<void> }, "setupInputProcessing")
      .mockImplementation(async function (this: unknown) {
        inputSeenEnabled = track.enabled;
      });

    const session = new LiveSession(createMockConfig());
    // Mute before stream exists — reachable race while getUserMedia is pending
    session.setMute(true);
    expect((session as unknown as { isMuted: boolean }).isMuted).toBe(true);

    const connectPromise = session.connect("test-access-token");

    // Resolve deferred getUserMedia — stream arrives enabled, must be synchronized to muted
    resolveStream(fakeStream as unknown as MediaStream);
    await connectPromise;

    // Newly acquired track must be disabled before recorder/input graph captures it
    expect(track.enabled).toBe(false);
    expect(recorderSeenEnabled).toBe(false);
    expect(inputSeenEnabled).toBe(false);

    // Cleanup timers/watchdog to avoid leaks
    (session as unknown as { stopStalledWatchdog: () => void }).stopStalledWatchdog();
    (session as unknown as { clearSetupTimeout: () => void }).clearSetupTimeout();
    // Prevent disconnect side-effects
    recorderSpy.mockRestore();
    inputSpy.mockRestore();
  });
});
