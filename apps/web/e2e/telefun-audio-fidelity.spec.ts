import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  expectHermetic,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  mockRecordingUpload,
  mockTelefunAvatar,
  mockTelefunVoiceServer,
  telefunMocks,
  type CapturedTelefunRecordingUpload,
  type MockTelefunPcmResponse,
} from "./helpers/telefunFixtures";

const AUDIO_RATE_HZ = 24_000;
const INPUT_RATE_HZ = 16_000;
const LOW_TONE_HZ = 1_000;
const HIGH_TONE_HZ = 10_000;
const ALIAS_TONE_HZ = 6_000;
const TAIL_MARKER_HZ = 3_000;
const HIGH_TONE_MIN_CODEC_RETENTION = 0.5;
const MAX_ALIAS_TO_HIGH_TONE_RATIO = 0.5;
const SYNTHETIC_SECONDS = 1.6;
const SYNTHETIC_CHUNK_SECONDS = 0.4;
const SYNTHETIC_BITRATE = 32_000;

const testResultsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results",
);
mkdirSync(testResultsDir, { recursive: true });
const fixtureDir = mkdtempSync(path.join(testResultsDir, "telefun-audio-e2e-"));
const fakeMicWavPath = path.join(fixtureDir, "synthetic-440hz-16khz.wav");

function createFakeMicWav(sampleRate = INPUT_RATE_HZ, seconds = 3): Buffer {
  const samples = sampleRate * seconds;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(
      0.38 * 32767 * Math.sin((2 * Math.PI * 440 * i) / sampleRate),
    );
    wav.writeInt16LE(value, 44 + i * 2);
  }
  return wav;
}

writeFileSync(fakeMicWavPath, createFakeMicWav());
test.afterAll(() => rmSync(fixtureDir, { recursive: true, force: true }));

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${fakeMicWavPath}`,
    ],
  },
  permissions: ["microphone"],
});

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

const SESSION_ID = "telefun-audio-fidelity-1";

function callMocks(settings: unknown = {}, sessionId = SESSION_ID): ApiMock[] {
  return [
    ...telefunMocks([], settings),
    {
      method: "POST",
      path: "/api/v1/telefun/sessions",
      body: {
        success: true,
        data: { id: sessionId, simulationSubject: null },
      },
    },
    {
      method: "GET",
      path: "/api/v1/ai/usage/summary",
      body: { success: true, data: null },
    },
    {
      method: "PATCH",
      path: `/api/v1/telefun/sessions/${sessionId}`,
      body: { success: true, data: null },
    },
    {
      method: "POST",
      path: "/api/v1/telefun/finalize-recording",
      body: {
        success: true,
        data: { recordingStatus: "ready", scoringStatus: "pending" },
      },
    },
    {
      method: "POST",
      path: `/api/v1/telefun/remux-recording/${sessionId}`,
      body: {
        success: true,
        data: { remuxed: false, recordings: {}, scoringStatus: "pending" },
      },
    },
    {
      method: "POST",
      path: `/api/v1/telefun/score/${sessionId}`,
      status: 409,
      body: {
        success: false,
        error: {
          code: "CONFLICT",
          message: "Analisis suara sedang dalam antrian.",
          details: { scoringStatus: "pending" },
        },
      },
    },
    {
      method: "GET",
      path: `/api/v1/telefun/recording/${sessionId}`,
      body: { success: true, data: { url: null } },
    },
    {
      method: "GET",
      path: `/api/v1/telefun/history/${sessionId}`,
      body: {
        success: true,
        data: {
          id: sessionId,
          created_at: new Date().toISOString(),
          consumer_name: "Dian Permana",
          consumer_phone: "0823-3456-7890",
          consumer_city: "Depok",
          scenario_title: "Audio sintetis",
          duration_seconds: 2,
          configured_duration: 300,
          recording_path: null,
          agent_recording_path: null,
          scoring_status: "pending",
          messages: [],
        },
      },
    },
  ];
}

async function openTelefun(
  page: Page,
  settings: unknown = {},
  extraSessionIds: string[] = [],
) {
  return openHermeticShell(page, {
    path: "/telefun",
    apiMocks: [
      ...callMocks(settings),
      ...extraSessionIds.flatMap((id) =>
        callMocks(settings, id).filter(
          (mock) => typeof mock.path === "string" && mock.path.includes(id),
        ),
      ),
    ],
    waitForUrl: /\/telefun/,
    beforeNavigate: (target) => mockTelefunAvatar(target),
  });
}

async function startRingingCall(page: Page) {
  await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
  const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
  await expect(picker.getByText("Suara Anda terdengar.")).toBeVisible({
    timeout: 15_000,
  });
  const startButton = picker.getByRole("button", { name: "Mulai panggilan" });
  await expect(startButton).toBeEnabled({ timeout: 15_000 });
  await startButton.click();
  const call = page.getByRole("region", { name: "Panggilan" });
  await expect(call).toBeVisible();
  return call;
}

async function endCall(page: Page, call: Locator) {
  await call.getByRole("button", { name: "Akhiri", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Akhiri panggilan?" })
    .getByRole("button", { name: "Akhiri panggilan", exact: true })
    .click();
  await expect(page).toHaveURL(/tahap=telaah/, { timeout: 30_000 });
}

async function prepareAudioCall(
  page: Page,
  mode: AudioProbeMode,
  audioResponse?: MockTelefunPcmResponse,
  voiceOptions: {
    audioResponseAfterText?: MockTelefunPcmResponse;
    onConnection?: (connectionNumber: number) => void;
    closeAfterFirstInput?: boolean;
    drainAckDelayMs?: number;
    drainUnrelatedMessage?: boolean;
    drainUnrelatedDelayMs?: number;
    suppressDrainAck?: boolean;
  } = {},
  waitForPlaybackBlocked = false,
  waitForAiSpeaking = false,
) {
  await page.addInitScript(installAudioProbe, { mode });
  const clientMessages: Record<string, unknown>[] = [];
  await mockTelefunVoiceServer(page, SESSION_ID, [], {
    audioResponse,
    ...voiceOptions,
    onClientMessage: (message) => clientMessages.push(message),
  });
  const audit = await openTelefun(page, {
    identitySettings: {
      displayName: "Dian Permana",
      gender: "male",
      phoneNumber: "0823-3456-7890",
      city: "Depok",
      signatureName: "Dian",
      voiceName: "Fenrir",
    },
  });
  const uploads: CapturedTelefunRecordingUpload[] = [];
  await mockRecordingUpload(page, uploads);
  const call = await startRingingCall(page);
  if (waitForPlaybackBlocked) {
    await expect(
      page.getByRole("button", { name: "Aktifkan audio" }),
    ).toBeVisible({ timeout: 15_000 });
  } else if (waitForAiSpeaking) {
    await expect(call.getByRole("status").first()).toHaveText(
      "Konsumen berbicara",
      { timeout: 20_000 },
    );
  } else {
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 20_000,
    });
  }
  return { audit, call, clientMessages, uploads };
}

async function measureAudioTaps(
  page: Page,
  tap: "speaker" | "recording",
  frequency: number,
) {
  return page.evaluate(
    async ({ tapKind, frequencyHz }) => {
      const probe = (window as any).__telefunAudioProbe;
      const taps =
        tapKind === "speaker" ? probe.speakerTaps : probe.recordingTaps;
      const peaks = new Map<string, number>();
      const deadline = performance.now() + 700;
      while (performance.now() < deadline) {
        for (const entry of taps) {
          const samples = new Float32Array(entry.analyser.fftSize);
          entry.analyser.getFloatTimeDomainData(samples);
          let real = 0;
          let imaginary = 0;
          for (let index = 0; index < samples.length; index += 1) {
            const phase =
              (2 * Math.PI * frequencyHz * index) / entry.contextRate;
            real += samples[index] * Math.cos(phase);
            imaginary -= samples[index] * Math.sin(phase);
          }
          const rms =
            (Math.hypot(real, imaginary) * Math.SQRT2) / samples.length;
          const role = entry.role ?? "speaker";
          peaks.set(role, Math.max(peaks.get(role) ?? 0, rms));
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return Object.fromEntries(peaks);
    },
    { tapKind: tap, frequencyHz: frequency },
  );
}

async function expectAudioResourcesReleased(
  page: Page,
  requireInputTrack = true,
) {
  await expect
    .poll(
      () =>
        page.evaluate(
          ({ inputRateHz, requireTrack }) => {
            const probe = (window as any).__telefunAudioProbe;
            const contexts = probe.contexts.filter((entry: any) =>
              entry.role.startsWith("telefun-"),
            );
            const tracks = probe.micTracks.filter(
              (entry: any) => entry.requestedSampleRate === inputRateHz,
            );
            const states = contexts.map((entry: any) => ({
              role: entry.role,
              state: entry.context.state,
            }));
            const trackStates = tracks.map((entry: any) => ({
              readyState: entry.track.readyState,
              enabled: entry.track.enabled,
            }));
            return {
              released:
                contexts.length >= 2 &&
                contexts.every(
                  (entry: any) => entry.context.state === "closed",
                ) &&
                (!requireTrack || tracks.length >= 1) &&
                tracks.every(
                  (entry: any) => entry.track.readyState === "ended",
                ),
              contexts: states,
              tracks: trackStates,
            };
          },
          { inputRateHz: INPUT_RATE_HZ, requireTrack: requireInputTrack },
        ),
      { timeout: 5_000 },
    )
    .toMatchObject({ released: true });
}

function pcmToneChunks(seconds = SYNTHETIC_SECONDS): Uint8Array[] {
  const totalSamples = AUDIO_RATE_HZ * seconds;
  const chunkSamples = AUDIO_RATE_HZ * SYNTHETIC_CHUNK_SECONDS;
  const all = Buffer.alloc(totalSamples * 2);
  for (let i = 0; i < totalSamples; i += 1) {
    const time = i / AUDIO_RATE_HZ;
    const sample =
      0.24 * Math.sin(2 * Math.PI * LOW_TONE_HZ * time) +
      0.24 * Math.sin(2 * Math.PI * HIGH_TONE_HZ * time) +
      (time >= seconds - SYNTHETIC_CHUNK_SECONDS
        ? 0.18 * Math.sin(2 * Math.PI * TAIL_MARKER_HZ * time)
        : 0);
    all.writeInt16LE(Math.round(sample * 32767), i * 2);
  }
  const chunks: Uint8Array[] = [];
  for (let start = 0; start < totalSamples; start += chunkSamples) {
    chunks.push(
      new Uint8Array(
        all.subarray(
          start * 2,
          Math.min(totalSamples, start + chunkSamples) * 2,
        ),
      ),
    );
  }
  return chunks;
}

function rmsAtPcmFrequency(
  frames: readonly Buffer[],
  sampleRate: number,
  frequency: number,
): number {
  const bytes = Buffer.concat([...frames]);
  const samples = Math.floor(bytes.length / 2);
  if (samples === 0 || frequency >= sampleRate / 2) return 0;
  let real = 0;
  let imaginary = 0;
  for (let i = 0; i < samples; i += 1) {
    const value = bytes.readInt16LE(i * 2) / 32768;
    const phase = (2 * Math.PI * frequency * i) / sampleRate;
    real += value * Math.cos(phase);
    imaginary += value * Math.sin(phase);
  }
  return (Math.SQRT2 * Math.hypot(real, imaginary)) / samples;
}

type FallbackInputBlock = {
  sequence: number;
  sampleCount: number;
  sampleRate: number;
  playbackTime: number;
  callbackTimeMs: number;
  pcmBase64: string;
};

type AudioProbeMode =
  | "native"
  | "low-native-output"
  | "block-output"
  | "retry-resume-pending"
  | "delayed-resume"
  | "delayed-websocket-onopen"
  | "delayed-agent-stop"
  | "delayed-agent-error"
  | "delayed-full-stop"
  | "missing-agent-stop"
  | "fallback-worklet"
  | "fail-output-context"
  | "startup-abort-reject-first-close"
  | "reject-all-telefun-closes"
  | "reject-first-telefun-close"
  | "hold-first-telefun-close";

type MatchedControlRecorder = {
  recorder: MediaRecorder;
  chunks: Blob[];
  base64: string | null;
};

type ContextSummary = {
  role: string;
  requestedSampleRate: number | null;
  actualSampleRate: number;
  state: string;
};
type SourceConnectionSummary = {
  role: string;
  destination: string;
  contextRate: number;
  bufferRate: number | null;
};
type SourceStartSummary = {
  role: string;
  bufferRate: number | null;
  duration: number;
  when: number | null;
};
type MicSourceSummary = { role: string; streamId: string };
type MicTrackSummary = {
  requestedSampleRate: number | null;
  actualSampleRate: number | null;
  readyState: string;
};

function installDelayedSocketOpenProbe() {
  const probe = (window as any).__telefunAudioProbe;
  const NativeWebSocket = window.WebSocket;
  class DelayedOnOpenWebSocket extends NativeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener(
        "open",
        (event) => {
          // Intercept dispatch itself: overriding the onopen accessor can
          // leave the routed socket's registered listener active.
          event.stopImmediatePropagation();
          probe.nativeSocketOpened = true;
          // Release by test action, so slow UI work cannot authenticate
          // before shutdown and accidentally stop exercising a stale open.
          const handler = this.onopen;
          probe.delayedSocket = this;
          probe.releaseSocketOpen = () => {
            probe.releaseSocketOpen = null;
            if (!handler) return;
            probe.delayedOpenHandlerCalls += 1;
            handler.call(this, event);
          };
        },
        { once: true },
      );
    }
  }
  window.WebSocket = DelayedOnOpenWebSocket;
}

function installAudioProbe({
  mode,
  diagnostic10k = false,
}: {
  mode: string;
  diagnostic10k?: boolean;
}) {
  const probe = {
    mode,
    contexts: [] as Array<{
      context: AudioContext;
      role: string;
      requestedSampleRate: number | null;
      actualSampleRate: number;
    }>,
    sourceConnections: [] as Array<{
      role: string;
      destination: string;
      contextRate: number;
      bufferRate: number | null;
    }>,
    speakerTaps: [] as Array<{
      context: AudioContext;
      contextRate: number;
      analyser: AnalyserNode;
    }>,
    sourceStarts: [] as Array<{
      role: string;
      bufferRate: number | null;
      duration: number;
      when: number | null;
    }>,
    recorderTiming: [] as Array<Record<string, unknown>>,
    sourceTiming: [] as Array<Record<string, unknown>>,
    lateControl: null as MatchedControlRecorder | null,
    lateError: null as string | null,
    lateDone: null as Promise<void> | null,
    stopLateDiagnostic: null as (() => void) | null,
    sourceStops: [] as Array<{ role: string; contextRate: number }>,
    recordingTaps: [] as Array<{
      role: string;
      contextRate: number;
      analyser: AnalyserNode;
    }>,
    micSources: [] as Array<{ role: string; stream: MediaStream }>,
    recorders: [] as Array<{ recorder: MediaRecorder; role: string | null }>,
    matchedControl: null as null | {
      recorder: MediaRecorder;
      chunks: Blob[];
      base64: string | null;
    },
    resumeResolvers: [] as Array<() => void>,
    resumeCalls: 0,
    delayedStopInjected: false,
    delayedStopObservedMs: 0,
    recorderErrorInjected: false,
    missingStopInjected: false,
    nativeSocketOpened: false,
    releaseSocketOpen: null as (() => void) | null,
    delayedSocket: null as WebSocket | null,
    delayedOpenHandlerCalls: 0,
    micTracks: [] as Array<{
      track: MediaStreamTrack;
      requestedSampleRate: number | null;
      actualSampleRate: number | null;
      fromLiveSession: boolean;
    }>,
    resumeFailureInjected: false,
    resumeFailureCount: 0,
    workletFailureInjected: false,
    workletModuleFailures: 0,
    fallbackInputBlocks: [] as FallbackInputBlock[],
    outputContextFailureInjected: false,
    startupFailureInjected: false,
    closeAttempts: [] as Array<{ role: string; attempt: number }>,
    closeRejections: 0,
    allowCloseRetry: false,
    closeReleases: [] as Array<() => void>,
    releasePendingCloses() {
      const releases = probe.closeReleases.splice(0);
      releases.forEach((release) => release());
    },
  };
  (
    window as Window & { __telefunAudioProbe?: typeof probe }
  ).__telefunAudioProbe = probe;

  const OriginalAudioContext = window.AudioContext;
  const outputResumeAttempts = new WeakMap<AudioContext, number>();
  let stateDescriptor: PropertyDescriptor | undefined;
  let statePrototype: object | null = OriginalAudioContext.prototype;
  while (statePrototype && !stateDescriptor) {
    stateDescriptor = Object.getOwnPropertyDescriptor(statePrototype, "state");
    statePrototype = Object.getPrototypeOf(statePrototype);
  }
  let inputSeen = false;
  let outputSeen = false;
  class InstrumentedAudioContext extends OriginalAudioContext {
    constructor(options?: AudioContextOptions) {
      const stack = new Error().stack ?? "";
      const fromLiveSession = /liveSession\.(ts|js)/i.test(stack);
      let role = "other";
      if (fromLiveSession && options?.sampleRate === 16_000) {
        role = "telefun-input";
        inputSeen = true;
      } else if (fromLiveSession && options?.sampleRate === undefined) {
        role = "telefun-output";
        outputSeen = true;
      } else if (options?.sampleRate === 16_000 && !inputSeen) {
        role = "telefun-input";
        inputSeen = true;
      } else if (
        inputSeen &&
        !outputSeen &&
        options?.sampleRate === undefined &&
        !/useMicrophoneActivity|MicCheck/i.test(stack)
      ) {
        role = "telefun-output";
        outputSeen = true;
      }
      const effectiveOptions =
        mode === "low-native-output" && role === "telefun-output"
          ? { sampleRate: 22_050 }
          : options;
      super(effectiveOptions);
      probe.contexts.push({
        context: this,
        role,
        requestedSampleRate: options?.sampleRate ?? null,
        actualSampleRate: this.sampleRate,
      });
      if (
        [
          "reject-all-telefun-closes",
          "reject-first-telefun-close",
          "hold-first-telefun-close",
          "startup-abort-reject-first-close",
        ].includes(mode) &&
        role.startsWith("telefun-")
      ) {
        const nativeClose = this.close.bind(this);
        let closeAttempts = 0;
        this.close = () => {
          closeAttempts += 1;
          probe.closeAttempts.push({ role, attempt: closeAttempts });
          if (
            (mode === "reject-all-telefun-closes" && !probe.allowCloseRetry) ||
            ([
              "reject-first-telefun-close",
              "startup-abort-reject-first-close",
            ].includes(mode) &&
              closeAttempts === 1)
          ) {
            probe.closeRejections += 1;
            return Promise.reject(
              new DOMException("Synthetic first close rejection", "AbortError"),
            );
          }
          if (mode === "hold-first-telefun-close" && closeAttempts === 1) {
            return new Promise<void>((resolve, reject) => {
              probe.closeReleases.push(() => {
                void nativeClose().then(resolve, reject);
              });
            });
          }
          return nativeClose();
        };
      }
      if (mode === "fail-output-context" && role === "telefun-output") {
        probe.outputContextFailureInjected = true;
        void this.close().catch(() => {});
        throw new DOMException(
          "Synthetic native output context creation failure",
          "NotSupportedError",
        );
      }
      if (
        ["block-output", "retry-resume-pending"].includes(mode) &&
        role === "telefun-output"
      ) {
        outputResumeAttempts.set(this, 0);
        if (stateDescriptor?.get) {
          Object.defineProperty(this, "state", {
            configurable: true,
            get: () => {
              const actualState = stateDescriptor!.get!.call(this);
              if (actualState === "closed") return actualState;
              const requiredAttempts = mode === "retry-resume-pending" ? 3 : 2;
              return (outputResumeAttempts.get(this) ?? 0) < requiredAttempts
                ? "suspended"
                : actualState;
            },
          });
        }
        void this.suspend().catch(() => {});
      }
      if (mode === "delayed-resume" && role.startsWith("telefun-")) {
        if (stateDescriptor?.get) {
          Object.defineProperty(this, "state", {
            configurable: true,
            get: () => {
              const actualState = stateDescriptor!.get!.call(this);
              return actualState === "closed" ? "closed" : "suspended";
            },
          });
        }
        void this.suspend().catch(() => {});
      }
      if (mode === "fallback-worklet" && role === "telefun-input") {
        try {
          Object.defineProperty(this.audioWorklet, "addModule", {
            configurable: true,
            value: () => {
              probe.workletFailureInjected = true;
              probe.workletModuleFailures += 1;
              return new Promise<void>(() => {});
            },
          });
        } catch {
          /* E2E observes the input frames to detect an unsupported injection. */
        }
      }
    }
  }
  window.AudioContext = InstrumentedAudioContext;

  const originalResume = OriginalAudioContext.prototype.resume;
  OriginalAudioContext.prototype.resume = function () {
    probe.resumeCalls += 1;
    const entry = probe.contexts.find(({ context }) => context === this);
    if (
      ["block-output", "retry-resume-pending"].includes(mode) &&
      entry?.role === "telefun-output"
    ) {
      const attempts = outputResumeAttempts.get(this) ?? 0;
      outputResumeAttempts.set(this, attempts + 1);
      if (attempts === 0) {
        probe.resumeFailureInjected = true;
        probe.resumeFailureCount += 1;
        return Promise.reject(
          new DOMException(
            "Synthetic autoplay resume denial",
            "NotAllowedError",
          ),
        );
      }
      if (mode === "retry-resume-pending" && attempts > 0) {
        probe.resumeResolvers.push(() => {});
        return new Promise<void>((resolve) => {
          probe.resumeResolvers[probe.resumeResolvers.length - 1] = resolve;
        });
      }
    }
    if (mode === "delayed-resume" && entry?.role?.startsWith("telefun-")) {
      return new Promise<void>((resolve) => {
        probe.resumeResolvers.push(() => {
          void originalResume.call(this).then(resolve, () => resolve());
        });
      });
    }
    return originalResume.call(this);
  };

  if (mode === "fallback-worklet") {
    const createScriptProcessor =
      OriginalAudioContext.prototype.createScriptProcessor;
    OriginalAudioContext.prototype.createScriptProcessor = function (...args) {
      const processor = createScriptProcessor.apply(this, args);
      if (
        probe.contexts.some(
          (entry) => entry.context === this && entry.role === "telefun-input",
        )
      ) {
        // Observe the real buffer during its event lifetime. Do not replace
        // the app handler, input stream, callback timing, or outgoing packets.
        processor.addEventListener("audioprocess", (event) => {
          const samples = event.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(samples.length);
          for (let i = 0; i < samples.length; i += 1) {
            pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
          }
          let binary = "";
          for (const byte of new Uint8Array(pcm.buffer)) {
            binary += String.fromCharCode(byte);
          }
          probe.fallbackInputBlocks.push({
            sequence: probe.fallbackInputBlocks.length,
            sampleCount: samples.length,
            sampleRate: event.inputBuffer.sampleRate,
            playbackTime: event.playbackTime,
            callbackTimeMs: performance.now(),
            pcmBase64: btoa(binary),
          });
        });
      }
      return processor;
    };
  }

  const destinationRoles = new WeakMap<MediaStream, string>();
  const originalCreateMediaStreamSource =
    OriginalAudioContext.prototype.createMediaStreamSource;
  const originalCreateMediaStreamDestination =
    OriginalAudioContext.prototype.createMediaStreamDestination;
  OriginalAudioContext.prototype.createMediaStreamDestination = function () {
    const destination = originalCreateMediaStreamDestination.call(this);
    const entry = probe.contexts.find(({ context }) => context === this);
    const role =
      entry?.role === "telefun-output"
        ? "full_call"
        : entry?.role === "telefun-input"
          ? "agent_only"
          : null;
    if (role) {
      destinationRoles.set(destination.stream, role);
      const source = originalCreateMediaStreamSource.call(
        this,
        destination.stream,
      );
      const analyser = this.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      const silentSink = this.createGain();
      silentSink.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentSink);
      silentSink.connect(this.destination);
      probe.recordingTaps.push({
        role,
        contextRate: this.sampleRate,
        analyser,
      });
    }
    return destination;
  };

  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const fromLiveSession = /liveSession\.(ts|js)/i.test(
      new Error().stack ?? "",
    );
    const audioConstraints = constraints?.audio;
    const requested =
      typeof audioConstraints === "object" && audioConstraints
        ? audioConstraints.sampleRate
        : undefined;
    if (
      mode === "startup-abort-reject-first-close" &&
      requested === 16_000 &&
      probe.contexts.some((entry) => entry.role === "telefun-output") &&
      !probe.startupFailureInjected
    ) {
      probe.startupFailureInjected = true;
      throw new DOMException(
        "Synthetic call microphone startup failure",
        "NotAllowedError",
      );
    }
    const stream = await originalGetUserMedia(constraints);
    for (const track of stream.getAudioTracks()) {
      probe.micTracks.push({
        track,
        requestedSampleRate: typeof requested === "number" ? requested : null,
        actualSampleRate: track.getSettings().sampleRate ?? null,
        fromLiveSession,
      });
    }
    return stream;
  };

  OriginalAudioContext.prototype.createMediaStreamSource = function (stream) {
    const source = originalCreateMediaStreamSource.call(this, stream);
    if (!destinationRoles.has(stream)) {
      const entry = probe.contexts.find(({ context }) => context === this);
      probe.micSources.push({ role: entry?.role ?? "other", stream });
    }
    return source;
  };

  const NativeMediaRecorder = window.MediaRecorder;
  const nativeRecorderStop = NativeMediaRecorder.prototype.stop;
  let fullConfig: {
    stream: MediaStream;
    options: MediaRecorderOptions;
    timeslice?: number;
  } | null = null;
  let finishLate: (() => void) | null = null;
  let lateTimer: ReturnType<typeof setTimeout> | undefined;
  const stampRecorder = (
    role: string,
    recorder: MediaRecorder,
    timeslice?: number,
  ) => {
    if (!diagnostic10k) return;
    probe.recorderTiming.push({
      role,
      phase: "start-call",
      atMs: performance.now(),
      audioTime:
        probe.contexts.find((entry) => entry.role === "telefun-output")?.context
          .currentTime ?? null,
      streamId: recorder.stream.id,
      mimeType: recorder.mimeType,
      bitrate: recorder.audioBitsPerSecond,
      timeslice: timeslice ?? null,
      tracks: recorder.stream
        .getAudioTracks()
        .map((track) => ({ id: track.id, ...track.getSettings() })),
    });
    recorder.addEventListener(
      "start",
      () => {
        probe.recorderTiming.push({
          role,
          phase: "start-event",
          atMs: performance.now(),
          audioTime:
            probe.contexts.find((entry) => entry.role === "telefun-output")
              ?.context.currentTime ?? null,
        });
      },
      { once: true },
    );
  };
  probe.stopLateDiagnostic = () => {
    const recorder = probe.lateControl?.recorder;
    if (!recorder || recorder.state === "inactive") return;
    lateTimer = setTimeout(() => {
      probe.lateError = "late recorder stop timed out";
      finishLate?.();
    }, 5000);
    nativeRecorderStop.call(recorder);
  };
  const startLateDiagnostic = () => {
    if (!diagnostic10k || !fullConfig || probe.lateControl) return;
    const recorder = new NativeMediaRecorder(
      fullConfig.stream,
      fullConfig.options,
    );
    const control: MatchedControlRecorder = {
      recorder,
      chunks: [],
      base64: null,
    };
    probe.lateControl = control;
    probe.lateDone = new Promise<void>((resolve) => {
      finishLate = resolve;
    });
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) control.chunks.push(event.data);
    });
    recorder.addEventListener(
      "error",
      () => {
        probe.lateError = "late recorder error";
        probe.stopLateDiagnostic?.();
        clearTimeout(lateTimer);
        finishLate?.();
      },
      { once: true },
    );
    recorder.addEventListener(
      "stop",
      async () => {
        try {
          const bytes = new Uint8Array(
            await new Blob(control.chunks, {
              type: recorder.mimeType,
            }).arrayBuffer(),
          );
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          control.base64 = btoa(binary);
        } catch (error) {
          probe.lateError = String(error);
        } finally {
          clearTimeout(lateTimer);
          finishLate?.();
        }
      },
      { once: true },
    );
    stampRecorder("late-full-mix", recorder, fullConfig.timeslice);
    recorder.start(fullConfig.timeslice);
  };
  class InstrumentedMediaRecorder extends NativeMediaRecorder {
    private __telefunRole: string | null;
    private __telefunDelayedStop = false;

    constructor(stream: MediaStream, options?: MediaRecorderOptions) {
      super(stream, options);
      this.__telefunRole = destinationRoles.get(stream) ?? null;
      probe.recorders.push({ recorder: this, role: this.__telefunRole });
    }

    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (
        mode === "missing-agent-stop" &&
        this.__telefunRole === "agent_only" &&
        type === "stop"
      ) {
        probe.missingStopInjected = true;
        return;
      }
      return super.addEventListener(type, listener, options);
    }

    start(timeslice?: number) {
      if (
        mode === "delayed-agent-error" &&
        this.__telefunRole === "agent_only"
      ) {
        this.addEventListener("dataavailable", (event) => {
          if (
            probe.recorderErrorInjected ||
            (event as BlobEvent).data.size === 0
          ) {
            return;
          }
          probe.recorderErrorInjected = true;
          setTimeout(() => this.dispatchEvent(new Event("error")), 0);
        });
      }
      if (diagnostic10k && this.__telefunRole === "full_call") {
        fullConfig = {
          stream: this.stream,
          options: {
            mimeType: this.mimeType,
            audioBitsPerSecond: this.audioBitsPerSecond,
          },
          timeslice,
        };
      }
      if (this.__telefunRole === "full_call" && probe.matchedControl === null) {
        const controlRecorder = new NativeMediaRecorder(this.stream, {
          mimeType: this.mimeType,
          audioBitsPerSecond: this.audioBitsPerSecond,
        });
        const chunks: Blob[] = [];
        controlRecorder.addEventListener("dataavailable", (event) => {
          if ((event as BlobEvent).data.size > 0) {
            chunks.push((event as BlobEvent).data);
          }
        });
        const control: MatchedControlRecorder = {
          recorder: controlRecorder,
          chunks,
          base64: null,
        };
        probe.matchedControl = control;
        controlRecorder.addEventListener("stop", async () => {
          const blob = new Blob(chunks, { type: controlRecorder.mimeType });
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (const byte of bytes) binary += String.fromCharCode(byte);
          control.base64 = btoa(binary);
        });
        stampRecorder("matched-full-mix", controlRecorder, timeslice);
        controlRecorder.start(timeslice);
      }
      stampRecorder(this.__telefunRole ?? "other", this, timeslice);
      return super.start(timeslice);
    }

    stop() {
      if (
        (mode === "delayed-agent-stop" || mode === "delayed-agent-error") &&
        this.__telefunRole === "agent_only" &&
        !this.__telefunDelayedStop
      ) {
        this.__telefunDelayedStop = true;
        probe.delayedStopInjected = true;
        const requestedAt = performance.now();
        setTimeout(() => {
          probe.delayedStopObservedMs = performance.now() - requestedAt;
          nativeRecorderStop.call(this);
        }, 750);
        return;
      }
      if (
        mode === "delayed-full-stop" &&
        this.__telefunRole === "full_call" &&
        !this.__telefunDelayedStop
      ) {
        this.__telefunDelayedStop = true;
        probe.delayedStopInjected = true;
        const requestedAt = performance.now();
        setTimeout(() => {
          probe.delayedStopObservedMs = performance.now() - requestedAt;
          probe.stopLateDiagnostic?.();
          const matchedRecorder = probe.matchedControl?.recorder;
          if (matchedRecorder && matchedRecorder.state !== "inactive") {
            nativeRecorderStop.call(matchedRecorder);
          }
          nativeRecorderStop.call(this);
        }, 750);
        return;
      }
      if (this.__telefunRole === "full_call") probe.stopLateDiagnostic?.();
      const matchedRecorder = probe.matchedControl?.recorder;
      if (
        this.__telefunRole === "full_call" &&
        matchedRecorder &&
        matchedRecorder.state !== "inactive"
      ) {
        nativeRecorderStop.call(matchedRecorder);
      }
      return nativeRecorderStop.call(this);
    }
  }
  window.MediaRecorder = InstrumentedMediaRecorder;

  const originalConnect = AudioNode.prototype.connect as any;
  (AudioNode.prototype as any).connect = function (
    this: AudioNode,
    destination: AudioNode | AudioParam,
    ...args: number[]
  ) {
    if (this instanceof AudioBufferSourceNode) {
      const entry = probe.contexts.find(
        ({ context }) => context === this.context,
      );
      if (destination === this.context.destination) {
        probe.sourceConnections.push({
          role: entry?.role ?? "other",
          destination: "speaker",
          contextRate: this.context.sampleRate,
          bufferRate: this.buffer?.sampleRate ?? null,
        });
        if (entry?.role === "telefun-output") {
          let tap = probe.speakerTaps.find(
            (candidate) => candidate.context === this.context,
          );
          if (!tap) {
            const analyser = this.context.createAnalyser();
            analyser.fftSize = 4096;
            analyser.smoothingTimeConstant = 0;
            const silentSink = this.context.createGain();
            silentSink.gain.value = 0;
            // Keep the tap processing zero after a source disconnects. A
            // detached per-source analyser can retain its last nonzero block.
            const silence = this.context.createConstantSource();
            silence.offset.value = 0;
            originalConnect.call(silence, analyser);
            originalConnect.call(analyser, silentSink);
            originalConnect.call(silentSink, this.context.destination);
            silence.start();
            tap = {
              context: entry.context,
              contextRate: this.context.sampleRate,
              analyser,
            };
            probe.speakerTaps.push(tap);
          }
          originalConnect.call(this, tap.analyser);
        }
      }
    }
    return originalConnect.call(this, destination, ...args);
  };

  const originalStart = AudioBufferSourceNode.prototype.start as (
    ...args: any[]
  ) => void;
  (AudioBufferSourceNode.prototype as any).start = function (
    this: AudioScheduledSourceNode,
    when?: number,
    offset?: number,
    duration?: number,
  ) {
    if (!(this instanceof AudioBufferSourceNode)) {
      return originalStart.call(this, when, offset, duration);
    }
    const source = this as AudioBufferSourceNode;
    const entry = probe.contexts.find(
      ({ context }) => context === this.context,
    );
    if (diagnostic10k && entry?.role === "telefun-output") {
      startLateDiagnostic();
      probe.sourceTiming.push({
        atMs: performance.now(),
        audioTime: this.context.currentTime,
        scheduledAudioTime: when ?? this.context.currentTime,
        bufferRate: source.buffer?.sampleRate ?? null,
        channels: source.buffer?.numberOfChannels ?? null,
        duration: source.buffer?.duration ?? null,
      });
    }
    probe.sourceStarts.push({
      role: entry?.role ?? "other",
      bufferRate: source.buffer?.sampleRate ?? null,
      duration: source.buffer?.duration ?? 0,
      when: when ?? null,
    });
    return originalStart.call(this, when, offset, duration);
  };

  const originalStop = AudioBufferSourceNode.prototype.stop as (
    ...args: any[]
  ) => void;
  (AudioBufferSourceNode.prototype as any).stop = function (
    this: AudioScheduledSourceNode,
    when?: number,
  ) {
    const context = this.context;
    const entry = probe.contexts.find(({ context: item }) => item === context);
    if (this instanceof AudioBufferSourceNode) {
      probe.sourceStops.push({
        role: entry?.role ?? "other",
        contextRate: context.sampleRate,
      });
    }
    return originalStop.call(this, when);
  };
}

async function runCodecCalibration(page: Page) {
  await page.goto("about:blank");
  await page.setContent(
    '<button type="button">Start audio calibration</button>',
  );
  await page.getByRole("button", { name: "Start audio calibration" }).click();
  return page.evaluate(
    async ({ seconds, aliasToneHz }) => {
      const sampleRate = 24_000;
      const sampleCount = sampleRate * seconds;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const measure = (
        samples: Float32Array,
        rate: number,
        frequency: number,
      ) => {
        if (frequency >= rate / 2) return null;
        const windowSize = Math.floor(rate * 0.2);
        let best = 0;
        for (
          let start = 0;
          start + windowSize <= samples.length;
          start += Math.floor(windowSize / 2)
        ) {
          let real = 0;
          let imaginary = 0;
          for (let i = 0; i < windowSize; i += 1) {
            const phase = (2 * Math.PI * frequency * i) / rate;
            const value = samples[start + i];
            real += value * Math.cos(phase);
            imaginary += value * Math.sin(phase);
          }
          best = Math.max(
            best,
            (Math.SQRT2 * Math.hypot(real, imaginary)) / windowSize,
          );
        }
        return best;
      };

      const capture = async (contextRate?: number) => {
        const context = new AudioContext(
          contextRate === undefined ? undefined : { sampleRate: contextRate },
        );
        await context.resume();
        const destination = context.createMediaStreamDestination();
        const source = context.createBufferSource();
        const buffer = context.createBuffer(1, sampleCount, sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < sampleCount; i += 1) {
          const time = i / sampleRate;
          channel[i] =
            0.24 * Math.sin(2 * Math.PI * 1_000 * time) +
            0.24 * Math.sin(2 * Math.PI * 10_000 * time);
        }
        source.buffer = buffer;
        source.connect(destination);
        const recorder = new MediaRecorder(destination.stream, {
          mimeType,
          audioBitsPerSecond: 32_000,
        });
        const chunks: Blob[] = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        const stopped = new Promise<void>((resolve, reject) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          recorder.addEventListener(
            "error",
            () => reject(new Error("calibration MediaRecorder failed")),
            { once: true },
          );
        });
        recorder.start();
        source.addEventListener("ended", () => recorder.stop(), { once: true });
        source.start();
        await Promise.race([
          stopped,
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("calibration stop timed out")),
              5_000,
            ),
          ),
        ]);
        const blob = new Blob(chunks, { type: mimeType });
        const encoded = await blob.arrayBuffer();
        const decoded = await context.decodeAudioData(encoded.slice(0));
        const samples = decoded.getChannelData(0);
        const metrics = {
          contextSampleRateHz: context.sampleRate,
          decodedSampleRateHz: decoded.sampleRate,
          requestedBitrate: 32_000,
          actualBitrate: recorder.audioBitsPerSecond,
          mimeType: recorder.mimeType,
          encodedBytes: blob.size,
          durationSeconds: decoded.duration,
          high10kRms: measure(samples, decoded.sampleRate, 10_000),
          alias6kRms: measure(samples, decoded.sampleRate, aliasToneHz),
          low1kRms: measure(samples, decoded.sampleRate, 1_000),
        };
        await context.close();
        return {
          metrics,
          webmBase64: btoa(String.fromCharCode(...new Uint8Array(encoded))),
        };
      };

      const direct = await capture();
      const oldGraph = await capture(16_000);
      return { mimeType, direct, oldGraph };
    },
    { seconds: SYNTHETIC_SECONDS, aliasToneHz: ALIAS_TONE_HZ },
  );
}

async function saveJson(testInfo: TestInfo, name: string, value: unknown) {
  const outputPath = testInfo.outputPath(name);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(value, null, 2));
  return outputPath;
}

async function decodeWebmMetrics(page: Page, body: Buffer) {
  return page.evaluate(
    async ({ base64, aliasToneHz }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(bytes.buffer);
      const samples = decoded.getChannelData(0);
      const measure = (frequency: number) => {
        if (frequency >= decoded.sampleRate / 2) return null;
        const windowSize = Math.floor(decoded.sampleRate * 0.2);
        let best = 0;
        for (
          let start = 0;
          start + windowSize <= samples.length;
          start += Math.floor(windowSize / 2)
        ) {
          let real = 0;
          let imaginary = 0;
          for (let i = 0; i < windowSize; i += 1) {
            const phase = (2 * Math.PI * frequency * i) / decoded.sampleRate;
            const value = samples[start + i];
            real += value * Math.cos(phase);
            imaginary += value * Math.sin(phase);
          }
          best = Math.max(
            best,
            (Math.SQRT2 * Math.hypot(real, imaginary)) / windowSize,
          );
        }
        return best;
      };
      const result = {
        sampleRateHz: decoded.sampleRate,
        durationSeconds: decoded.duration,
        mic440HzRms: measure(440),
        low1kRms: measure(1_000),
        alias6kRms: measure(aliasToneHz),
        tail3kHzRms: measure(3_000),
        high10kRms: measure(10_000),
      };
      await context.close();
      return result;
    },
    { base64: body.toString("base64"), aliasToneHz: ALIAS_TONE_HZ },
  );
}

// Source: https://www.rfc-editor.org/rfc/rfc6716.html (Table 55).
// Guard v2 frozen AFTER offline layout verification, BEFORE v2 acceptance evaluation.
// RFC6716 Table55 band18=[9600,12000) Hz. Reference [4200,4800) avoids
// 1k/3k harmonics (4k/5k boundaries excluded) and alias6k. Compare power
// per Hz so broadband noise cannot exploit the 4:1 bandwidth ratio.
// Frozen source window: central half of the
// 1.6 s source, excluding 0.4 s settling and the final 0.4 s tail marker.
const BAND_GATE = Object.freeze({
  targetHz: [9800, 10200],
  codecHz: [9600, 12000],
  referenceHz: [4200, 4800],
  markerHz: 1000,
  markerBlockSeconds: 0.02,
  markerRms: 0.02,
  markerConsecutiveBlocks: 3,
  plateauStartSeconds: 0.4,
  windowSeconds: 0.2,
  windowCount: 4,
  minimumRetention: 0.5,
  minimumLocalizationPowerRatio: 4,
  noiseFloorRms: 0.000001,
});
function measureSourceAlignedBand(samples: Float32Array, sampleRate: number) {
  const block = Math.round(sampleRate * BAND_GATE.markerBlockSeconds);
  let onsetSample: number | null = null;
  let consecutive = 0;
  for (let start = 0; start + block <= samples.length; start += block) {
    let real = 0,
      imag = 0;
    for (let i = 0; i < block; i++) {
      const phase = (2 * Math.PI * BAND_GATE.markerHz * i) / sampleRate;
      real += samples[start + i] * Math.cos(phase);
      imag += samples[start + i] * Math.sin(phase);
    }
    const rms = (Math.SQRT2 * Math.hypot(real, imag)) / block;
    consecutive = rms >= BAND_GATE.markerRms ? consecutive + 1 : 0;
    if (consecutive === BAND_GATE.markerConsecutiveBlocks) {
      onsetSample = start - (consecutive - 1) * block;
      break;
    }
  }
  const size = Math.round(sampleRate * BAND_GATE.windowSeconds);
  const windows: Array<{
    startSample: number;
    endSample: number;
    startSeconds: number;
    endSeconds: number;
    targetPower: number;
    codecPower: number;
    referencePower: number;
  }> = [];
  if (onsetSample !== null) {
    for (let window = 0; window < BAND_GATE.windowCount; window++) {
      const start =
        onsetSample +
        Math.round(sampleRate * BAND_GATE.plateauStartSeconds) +
        window * size;
      if (start + size > samples.length) break;
      const weighted = new Float64Array(size);
      let sumWeightsSquared = 0;
      for (let i = 0; i < size; i++) {
        const weight = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
        weighted[i] = samples[start + i] * weight;
        sumWeightsSquared += weight * weight;
      }
      const bandPower = (band: readonly number[], halfOpen = false) => {
        if (
          band[1] > sampleRate / 2 ||
          (!halfOpen && band[1] === sampleRate / 2)
        )
          return 0;
        let power = 0;
        for (
          let bin = Math.ceil((band[0] * size) / sampleRate);
          bin <=
          (halfOpen
            ? Math.ceil((band[1] * size) / sampleRate) - 1
            : Math.floor((band[1] * size) / sampleRate));
          bin++
        ) {
          const coefficient = 2 * Math.cos((2 * Math.PI * bin) / size);
          let previous = 0,
            previous2 = 0;
          for (const sample of weighted) {
            const next = sample + coefficient * previous - previous2;
            previous2 = previous;
            previous = next;
          }
          power +=
            (2 *
              Math.max(
                0,
                previous * previous +
                  previous2 * previous2 -
                  coefficient * previous * previous2,
              )) /
            (size * sumWeightsSquared);
        }
        return power;
      };
      windows.push({
        startSample: start,
        endSample: start + size,
        startSeconds: start / sampleRate,
        endSeconds: (start + size) / sampleRate,
        targetPower: bandPower(BAND_GATE.targetHz),
        codecPower: bandPower(BAND_GATE.codecHz, true),
        referencePower: bandPower(BAND_GATE.referenceHz, true),
      });
    }
  }
  const complete = windows.length === BAND_GATE.windowCount;
  const meanPower = (field: "targetPower" | "codecPower" | "referencePower") =>
    complete
      ? windows.reduce((sum, w) => sum + w[field], 0) / BAND_GATE.windowCount
      : 0;
  const targetRms = Math.sqrt(meanPower("targetPower"));
  const codecRms = Math.sqrt(meanPower("codecPower"));
  const referenceRms = Math.sqrt(meanPower("referencePower"));
  const codecWidth = BAND_GATE.codecHz[1] - BAND_GATE.codecHz[0];
  const referenceWidth = BAND_GATE.referenceHz[1] - BAND_GATE.referenceHz[0];
  const localizationPowerRatio =
    (codecRms * codecRms) /
    codecWidth /
    (Math.max(referenceRms * referenceRms, BAND_GATE.noiseFloorRms ** 2) /
      referenceWidth);
  return {
    sampleRate,
    onsetSample,
    onsetSeconds: onsetSample === null ? null : onsetSample / sampleRate,
    complete,
    windows,
    targetRms,
    codecRms,
    referenceRms,
    localizationPowerRatio,
  };
}

async function save10kDiagnostics(
  page: Page,
  body: Buffer,
  label: string,
  testInfo: TestInfo,
) {
  const decoded = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(bytes.buffer);
      const channels = Array.from(
        { length: buffer.numberOfChannels },
        (_, channel) => {
          const raw = new Uint8Array(buffer.getChannelData(channel).buffer);
          let binary = "";
          for (const byte of raw) binary += String.fromCharCode(byte);
          return btoa(binary);
        },
      );
      return {
        sampleRate: buffer.sampleRate,
        duration: buffer.duration,
        channels,
      };
    } finally {
      await context.close();
    }
  }, body.toString("base64"));
  const size = Math.floor(decoded.sampleRate * 0.2);
  const channels = [];
  for (const [channel, base64] of decoded.channels.entries()) {
    const raw = Buffer.from(base64, "base64");
    await writeFile(testInfo.outputPath(`${label}-ch${channel}.f32le`), raw);
    const windows = [];
    for (
      let start = 0;
      start + size <= raw.length / 4;
      start += Math.floor(size / 2)
    ) {
      // Rectangular exact DFT matches the frozen oracle. Independent Hann
      // periodogram integrates 9.8–10.2 kHz, with Parseval power normalization.
      let exactReal = 0,
        exactImag = 0,
        bandPower = 0,
        weightsSquared = 0;
      const samples = new Float64Array(size);
      for (let index = 0; index < size; index += 1) {
        const value = raw.readFloatLE((start + index) * 4);
        const phase = (2 * Math.PI * 10000 * index) / decoded.sampleRate;
        exactReal += value * Math.cos(phase);
        exactImag += value * Math.sin(phase);
        const weight = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / size);
        samples[index] = value * weight;
        weightsSquared += weight * weight;
      }
      let peakFrequencyHz = 0,
        peakPower = 0;
      for (
        let bin = Math.ceil((9800 * size) / decoded.sampleRate);
        bin <= Math.floor((10200 * size) / decoded.sampleRate);
        bin += 1
      ) {
        const frequencyHz = (bin * decoded.sampleRate) / size;
        const omega = (2 * Math.PI * bin) / size;
        const coefficient = 2 * Math.cos(omega);
        let previous = 0,
          previous2 = 0;
        for (const sample of samples) {
          const next = sample + coefficient * previous - previous2;
          previous2 = previous;
          previous = next;
        }
        const power =
          (2 *
            Math.max(
              0,
              previous * previous +
                previous2 * previous2 -
                coefficient * previous * previous2,
            )) /
          (size * weightsSquared);
        bandPower += power;
        if (power > peakPower) {
          peakPower = power;
          peakFrequencyHz = frequencyHz;
        }
      }
      windows.push({
        startSample: start,
        endSample: start + size,
        startSeconds: start / decoded.sampleRate,
        endSeconds: (start + size) / decoded.sampleRate,
        exact10kRms: (Math.SQRT2 * Math.hypot(exactReal, exactImag)) / size,
        band9800to10200Rms: Math.sqrt(bandPower),
        peakFrequencyHz,
      });
    }
    channels.push({
      channel,
      windows,
      maxExact10kRms: Math.max(0, ...windows.map((w) => w.exact10kRms)),
      maxBandRms: Math.max(0, ...windows.map((w) => w.band9800to10200Rms)),
      sourceAlignedBand: measureSourceAlignedBand(
        Float32Array.from({ length: raw.length / 4 }, (_, index) =>
          raw.readFloatLE(index * 4),
        ),
        decoded.sampleRate,
      ),
    });
  }
  return {
    label,
    sampleRate: decoded.sampleRate,
    duration: decoded.duration,
    channelCount: channels.length,
    windowSeconds: 0.2,
    hopSeconds: 0.1,
    bandHz: [9800, 10200],
    channels,
  };
}

function getAudioPayload(message: Record<string, unknown>) {
  const input = message.realtimeInput as
    { audio?: { mimeType?: string; data?: string } } | undefined;
  return input?.audio;
}

test.describe("Telefun audio signal fidelity (synthetic, hermetic)", () => {
  test.afterEach(async ({ page }) => {
    if (page.isClosed()) return;
    await page.evaluate(async () => {
      const probe = (window as any).__telefunAudioProbe;
      probe?.stopLateDiagnostic?.();
      if (probe?.lateDone) await probe.lateDone;
    });
  });
  test("calibrate 32 kbps codec positive control and the old 16 kHz graph negative control", async ({
    page,
  }, testInfo) => {
    const calibration = await runCodecCalibration(page);
    const directBytes = Buffer.from(calibration.direct.webmBase64, "base64");
    const oldGraphBytes = Buffer.from(
      calibration.oldGraph.webmBase64,
      "base64",
    );
    const metrics = {
      label: "synthetic browser calibration; no Gemini/provider response",
      frozenBeforeProductRed: true,
      signal: {
        sourceRateHz: AUDIO_RATE_HZ,
        tonesHz: [LOW_TONE_HZ, HIGH_TONE_HZ, TAIL_MARKER_HZ],
        durationSeconds: SYNTHETIC_SECONDS,
      },
      directCodecControl: calibration.direct.metrics,
      old16kGraphNegativeControl: calibration.oldGraph.metrics,
      acceptance: {
        high10kRmsAtLeastFractionOfDirectCodecControl:
          HIGH_TONE_MIN_CODEC_RETENTION,
        alias6kRmsAtMostFractionOfHigh10kRms: MAX_ALIAS_TO_HIGH_TONE_RATIO,
        bitrate: SYNTHETIC_BITRATE,
      },
    };
    await saveJson(testInfo, "telefun-audio-calibration.json", metrics);
    await writeFile(
      testInfo.outputPath("positive-codec-control.webm"),
      directBytes,
    );
    await writeFile(
      testInfo.outputPath("old-16khz-graph-negative-control.webm"),
      oldGraphBytes,
    );
    console.log("[telefun-audio-calibration]", JSON.stringify(metrics));
    const directBand = await save10kDiagnostics(
      page,
      directBytes,
      "calibration-direct",
      testInfo,
    );
    const negativeBand = await save10kDiagnostics(
      page,
      oldGraphBytes,
      "calibration-old16k",
      testInfo,
    );
    await saveJson(testInfo, "telefun-audio-band-calibration.json", {
      contract: BAND_GATE,
      direct: directBand,
      negative: negativeBand,
    });
    expect(directBand.channelCount).toBeGreaterThan(0);
    expect(negativeBand.channelCount).toBe(directBand.channelCount);
    for (const [channel, direct] of directBand.channels.entries()) {
      expect(
        direct.sourceAlignedBand.complete,
        `invalid direct plateau ch${channel}`,
      ).toBe(true);
      expect(direct.sourceAlignedBand.targetRms).toBeGreaterThan(0);
      expect(
        direct.sourceAlignedBand.localizationPowerRatio,
        `invalid direct localization ch${channel}`,
      ).toBeGreaterThanOrEqual(BAND_GATE.minimumLocalizationPowerRatio);
      const negative = negativeBand.channels[channel]!.sourceAlignedBand;
      expect(negative.complete).toBe(true);
      expect(
        negative.targetRms / direct.sourceAlignedBand.targetRms,
        `old16k must fail band retention ch${channel}`,
      ).toBeLessThan(HIGH_TONE_MIN_CODEC_RETENTION);
      expect(
        negative.localizationPowerRatio,
        `old16k must fail localization ch${channel}`,
      ).toBeLessThan(BAND_GATE.minimumLocalizationPowerRatio);
    }

    expect(
      calibration.direct.metrics.contextSampleRateHz,
    ).toBeGreaterThanOrEqual(24_000);
    expect(calibration.direct.metrics.actualBitrate).toBe(32_000);
    expect(calibration.direct.metrics.mimeType).toContain("audio/webm");
    expect(calibration.direct.metrics.high10kRms).not.toBeNull();
    expect(calibration.direct.metrics.high10kRms!).toBeGreaterThan(0.03);
    expect(calibration.direct.metrics.durationSeconds).toBeGreaterThanOrEqual(
      1.4,
    );
    expect(calibration.oldGraph.metrics.contextSampleRateHz).toBe(16_000);
    expect(calibration.oldGraph.metrics.high10kRms).toBeNull();
    expect(calibration.oldGraph.metrics.alias6kRms).toBeGreaterThan(
      calibration.direct.metrics.high10kRms! * 0.5,
    );
  });

  test("cancelling during audio resume cannot resurrect a WebSocket or microphone", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(installAudioProbe, { mode: "delayed-resume" });
    let connectionCount = 0;
    const received: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, SESSION_ID, received, {
      onConnection: () => {
        connectionCount += 1;
      },
    });
    const audit = await openTelefun(page);
    await mockRecordingUpload(page);
    const call = await startRingingCall(page);
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).__telefunAudioProbe.resumeCalls),
      )
      .toBeGreaterThanOrEqual(2);
    const pendingResumes = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        calls: probe.resumeCalls,
        resolvers: probe.resumeResolvers.length,
      };
    });
    expect(pendingResumes.calls).toBeGreaterThanOrEqual(2);
    expect(pendingResumes.resolvers).toBeGreaterThanOrEqual(2);

    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();
    await expectAudioResourcesReleased(page);
    await page.evaluate(() => {
      (window as any).__telefunAudioProbe.resumeResolvers.forEach(
        (release: () => void) => release(),
      );
    });
    await page.waitForTimeout(1_800);
    expect(connectionCount).toBe(0);
    expect(received).toEqual([]);
    expectHermetic(audit);
  });

  test("stale WebSocket open cannot authenticate after user shutdown", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(installAudioProbe, {
      mode: "delayed-websocket-onopen",
    });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    let connectionCount = 0;
    const received: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, SESSION_ID, received, {
      onConnection: () => {
        connectionCount += 1;
      },
    });
    const audit = await openTelefun(page);
    // Install after navigation, once Playwright has installed its socket mock.
    // Init-script ordering between the two WebSocket wrappers is undefined.
    await page.evaluate(installDelayedSocketOpenProbe);
    await mockRecordingUpload(page);
    const call = await startRingingCall(page);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.nativeSocketOpened,
        ),
      )
      .toBe(true);
    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();
    await expectAudioResourcesReleased(page);
    expect(received.some((message) => message.type === "authenticate")).toBe(
      false,
    );
    await page.evaluate(() =>
      (window as any).__telefunAudioProbe.releaseSocketOpen(),
    );
    const delayedOpen = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        calls: probe.delayedOpenHandlerCalls,
        socketClosed: probe.delayedSocket?.readyState === WebSocket.CLOSED,
        closedContexts: probe.contexts
          .filter((entry: any) => entry.role.startsWith("telefun-"))
          .every((entry: any) => entry.context.state === "closed"),
      };
    });
    expect(connectionCount).toBe(1);
    expect(delayedOpen.calls).toBe(1);
    expect(delayedOpen.socketClosed).toBe(true);
    expect(delayedOpen.closedContexts).toBe(true);
    expect(received.some((message) => message.type === "authenticate")).toBe(
      false,
    );
    expect(pageErrors).toEqual([]);
    expectHermetic(audit);
  });

  test("real call graph preserves 24 kHz PCM above 8 kHz and isolates agent-only capture", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const calibration = await runCodecCalibration(page);
    const positiveControl = calibration.direct.metrics;
    expect(positiveControl.high10kRms).not.toBeNull();
    expect(positiveControl.high10kRms!).toBeGreaterThan(0.03);

    await page.addInitScript(installAudioProbe, {
      mode: "delayed-full-stop",
      diagnostic10k: true,
    });
    const clientMessages: Array<{
      message: Record<string, unknown>;
      atMs: number;
    }> = [];
    const pcmResponse: MockTelefunPcmResponse = {
      sampleRateHz: AUDIO_RATE_HZ,
      chunks: pcmToneChunks(),
      transport: "inline",
      afterFirstInput: true,
    };
    await mockTelefunVoiceServer(page, SESSION_ID, [], {
      audioResponse: pcmResponse,
      onClientMessage: (message) =>
        clientMessages.push({ message, atMs: Date.now() }),
    });
    const audit = await openTelefun(page, {
      identitySettings: {
        displayName: "Dian Permana",
        gender: "male",
        phoneNumber: "0823-3456-7890",
        city: "Depok",
        signatureName: "Dian",
        voiceName: "Fenrir",
      },
    });
    const uploads: CapturedTelefunRecordingUpload[] = [];
    await mockRecordingUpload(page, uploads);
    const call = await startRingingCall(page);
    await expect(call.getByRole("status").first()).toHaveText(
      "Konsumen berbicara",
      { timeout: 20_000 },
    );

    await expect
      .poll(
        () =>
          clientMessages.filter((entry) => getAudioPayload(entry.message))
            .length,
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(3);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).__telefunAudioProbe.sourceStarts.filter(
                (entry: any) => entry.role === "telefun-output",
              ).length,
          ),
        { timeout: 10_000 },
      )
      .toBe(pcmResponse.chunks.length);
    const modelOutput = await page.evaluate<{
      currentTime: number | null;
      contexts: ContextSummary[];
      sourceConnections: SourceConnectionSummary[];
      sourceStarts: SourceStartSummary[];
      micSources: MicSourceSummary[];
      micTracks: MicTrackSummary[];
    }>(() => {
      const probe = (window as any).__telefunAudioProbe;
      const output = [...probe.contexts]
        .reverse()
        .find(
          (entry: any) =>
            entry.role === "telefun-output" && entry.context.state !== "closed",
        );
      return {
        currentTime: output?.context.currentTime ?? null,
        contexts: probe.contexts
          .filter((entry: any) => entry.role.startsWith("telefun-"))
          .map((entry: any) => ({
            role: entry.role,
            requestedSampleRate: entry.requestedSampleRate,
            actualSampleRate: entry.context.sampleRate,
            state: entry.context.state,
          })),
        sourceConnections: probe.sourceConnections,
        sourceStarts: probe.sourceStarts.filter(
          (entry: any) => entry.role === "telefun-output",
        ),
        micSources: probe.micSources.map((entry: any) => ({
          role: entry.role,
          streamId: entry.stream.id,
        })),
        micTracks: probe.micTracks.map((entry: any) => ({
          requestedSampleRate: entry.requestedSampleRate,
          actualSampleRate: entry.actualSampleRate,
          readyState: entry.track.readyState,
        })),
      };
    });
    const playbackDrain = await page.evaluate(
      async ({ aliasToneHz, tailMarkerHz }) => {
        const probe = (window as any).__telefunAudioProbe;
        const output = [...probe.contexts]
          .reverse()
          .find((entry: any) => entry.role === "telefun-output");
        const starts = probe.sourceStarts.filter(
          (entry: any) => entry.role === "telefun-output",
        );
        const queuedPlaybackEndSec = Math.max(
          ...starts.map((entry: any) => entry.when + entry.duration),
        );
        const measureToneRms = (
          samples: Float32Array,
          sampleRate: number,
          frequency: number,
        ) => {
          let real = 0;
          let imaginary = 0;
          for (let index = 0; index < samples.length; index += 1) {
            const phase = (2 * Math.PI * frequency * index) / sampleRate;
            real += samples[index] * Math.cos(phase);
            imaginary -= samples[index] * Math.sin(phase);
          }
          return (Math.hypot(real, imaginary) * Math.SQRT2) / samples.length;
        };
        const deadline = performance.now() + 5_000;
        let high10kRms = 0;
        let alias6kRms = 0;
        let analyzerWindows = 0;
        const preEncoderPeaks = probe.recordingTaps.map((tap: any) => ({
          role: tap.role,
          contextRate: tap.contextRate,
          mic440HzRms: 0,
          low1kHzRms: 0,
          high10kHzRms: 0,
          tail3kHzRms: 0,
        }));
        while (
          output?.context.currentTime < queuedPlaybackEndSec + 0.05 &&
          performance.now() < deadline
        ) {
          for (const tap of probe.speakerTaps) {
            const samples = new Float32Array(tap.analyser.fftSize);
            tap.analyser.getFloatTimeDomainData(samples);
            high10kRms = Math.max(
              high10kRms,
              measureToneRms(samples, tap.contextRate, 10_000),
            );
            alias6kRms = Math.max(
              alias6kRms,
              measureToneRms(samples, tap.contextRate, aliasToneHz),
            );
            analyzerWindows += 1;
          }
          probe.recordingTaps.forEach((tap: any, index: number) => {
            const samples = new Float32Array(tap.analyser.fftSize);
            tap.analyser.getFloatTimeDomainData(samples);
            const measure = (frequency: number) =>
              measureToneRms(samples, tap.contextRate, frequency);
            preEncoderPeaks[index].mic440HzRms = Math.max(
              preEncoderPeaks[index].mic440HzRms,
              measure(440),
            );
            preEncoderPeaks[index].low1kHzRms = Math.max(
              preEncoderPeaks[index].low1kHzRms,
              measure(1_000),
            );
            preEncoderPeaks[index].high10kHzRms = Math.max(
              preEncoderPeaks[index].high10kHzRms,
              measure(10_000),
            );
            preEncoderPeaks[index].tail3kHzRms = Math.max(
              preEncoderPeaks[index].tail3kHzRms,
              measure(tailMarkerHz),
            );
          });
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return {
          queuedPlaybackEndSec,
          observedAudioClockSec: output?.context.currentTime ?? null,
          speakerGraph: {
            contextRate: probe.speakerTaps[0]?.contextRate ?? null,
            high10kRms,
            alias6kRms,
            analyzerWindows,
          },
          preEncoderFullMix: preEncoderPeaks,
        };
      },
      { aliasToneHz: ALIAS_TONE_HZ, tailMarkerHz: TAIL_MARKER_HZ },
    );
    expect(playbackDrain.observedAudioClockSec).toBeGreaterThanOrEqual(
      playbackDrain.queuedPlaybackEndSec,
    );
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 5_000,
    });
    await endCall(page, call);
    await expectAudioResourcesReleased(page);
    await waitForMockedApi(audit, [
      "POST /api/v1/telefun/sessions",
      `PATCH /api/v1/telefun/sessions/${SESSION_ID}`,
    ]);
    const recorderStopEvidence = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        delayedStopInjected: probe.delayedStopInjected,
        delayedStopObservedMs: probe.delayedStopObservedMs,
        recorderStates: probe.recorders.map((entry: any) => ({
          role: entry.role,
          state: entry.recorder.state,
        })),
      };
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.matchedControl?.base64,
        ),
      )
      .not.toBeNull();
    const matchedControlBase64 = await page.evaluate(
      () => (window as any).__telefunAudioProbe.matchedControl?.base64,
    );
    const matchedControlBytes = Buffer.from(matchedControlBase64!, "base64");
    const matchedControl = await decodeWebmMetrics(page, matchedControlBytes);

    const fullUpload = uploads.find((upload) =>
      upload.path.endsWith("full_call.webm"),
    );
    const agentUpload = uploads.find((upload) =>
      upload.path.endsWith("agent_only.webm"),
    );
    expect(fullUpload, "full-call recording body was uploaded").toBeDefined();
    expect(agentUpload, "agent-only recording body was uploaded").toBeDefined();
    await writeFile(
      testInfo.outputPath("predecode-full-call.webm"),
      fullUpload!.body,
    );
    await writeFile(
      testInfo.outputPath("predecode-agent-only.webm"),
      agentUpload!.body,
    );
    await writeFile(
      testInfo.outputPath("matched-full-mix-codec-control.webm"),
      matchedControlBytes,
    );
    console.log(
      "[telefun-audio-predecode]",
      JSON.stringify({
        modelOutput,
        matchedControl,
        uploads: uploads.map((upload) => ({
          path: upload.path,
          contentType: upload.contentType,
          bytes: upload.body.byteLength,
          prefixHex: upload.body.subarray(0, 16).toString("hex"),
        })),
      }),
    );
    await saveJson(testInfo, "telefun-audio-predecode.json", {
      modelOutput,
      matchedControl,
      uploads: uploads.map((upload) => ({
        path: upload.path,
        contentType: upload.contentType,
        bytes: upload.body.byteLength,
        prefixHex: upload.body.subarray(0, 16).toString("hex"),
      })),
    });
    const lateEvidence = await page.evaluate(async () => {
      const probe = (window as any).__telefunAudioProbe;
      if (probe.lateDone) await probe.lateDone;
      return {
        base64: probe.lateControl?.base64 ?? null,
        error: probe.lateError,
        state: probe.lateControl?.recorder.state ?? null,
        recorderTiming: probe.recorderTiming,
        sourceTiming: probe.sourceTiming,
      };
    });
    await saveJson(testInfo, "10khz-timing.json", {
      ...lateEvidence,
      base64: undefined,
    });
    expect(lateEvidence.error).toBeNull();
    expect(lateEvidence.state).toBe("inactive");
    expect(lateEvidence.base64).not.toBeNull();
    const lateBytes = Buffer.from(lateEvidence.base64!, "base64");
    await writeFile(testInfo.outputPath("late-full-mix.webm"), lateBytes);
    const diagnosticRecorders = [];
    for (const [label, bytes] of [
      ["product", fullUpload!.body],
      ["matched", matchedControlBytes],
      ["agent", agentUpload!.body],
      ["late", lateBytes],
      ["direct", Buffer.from(calibration.direct.webmBase64, "base64")],
      ["old16k", Buffer.from(calibration.oldGraph.webmBase64, "base64")],
    ] as const) {
      await writeFile(testInfo.outputPath(`${label}-10khz.webm`), bytes);
      diagnosticRecorders.push(
        await save10kDiagnostics(page, bytes, label, testInfo),
      );
    }
    await saveJson(testInfo, "10khz-diagnostics.json", {
      recorderTiming: lateEvidence.recorderTiming,
      sourceTiming: lateEvidence.sourceTiming,
      recorders: diagnosticRecorders,
    });
    const full = await decodeWebmMetrics(page, fullUpload!.body);
    const agent = await decodeWebmMetrics(page, agentUpload!.body);
    const inputPackets = clientMessages
      .map(({ message, atMs }) => ({ audio: getAudioPayload(message), atMs }))
      .filter(
        (
          entry,
        ): entry is {
          audio: NonNullable<ReturnType<typeof getAudioPayload>>;
          atMs: number;
        } => Boolean(entry.audio?.data),
      );
    const inputFrames = inputPackets.map((entry) =>
      Buffer.from(entry.audio.data!, "base64"),
    );
    const inputSamples = inputFrames.reduce(
      (total, frame) => total + Math.floor(frame.byteLength / 2),
      0,
    );
    const providerDurationSeconds = inputSamples / INPUT_RATE_HZ;
    const providerObservedSeconds =
      inputPackets.length > 0
        ? (inputPackets.at(-1)!.atMs - inputPackets[0].atMs + 256) / 1_000
        : 0;
    const inputRms440Hz = rmsAtPcmFrequency(inputFrames, INPUT_RATE_HZ, 440);
    const captureTypes = uploads.map((upload) => upload.path.split("/").at(-1));
    const micStreamIds = new Set(
      modelOutput.micSources
        .filter((source) => source.role.startsWith("telefun-"))
        .map((source) => source.streamId),
    );
    const speakerPath = modelOutput.sourceConnections.some(
      (connection) =>
        connection.destination === "speaker" &&
        connection.bufferRate === AUDIO_RATE_HZ,
    );
    const outputSpeakerConnections = modelOutput.sourceConnections.filter(
      (connection) =>
        connection.role === "telefun-output" &&
        connection.destination === "speaker" &&
        connection.bufferRate === AUDIO_RATE_HZ,
    );
    const productOutput = [...modelOutput.contexts]
      .reverse()
      .find((context) => context.role === "telefun-output");
    const productBand = diagnosticRecorders.find(
      (recorder) => recorder.label === "product",
    )!;
    const directBand = diagnosticRecorders.find(
      (recorder) => recorder.label === "direct",
    )!;
    const old16kBand = diagnosticRecorders.find(
      (recorder) => recorder.label === "old16k",
    )!;
    const bandChannels = productBand.channels.map((channel, index) => {
      const direct = directBand.channels[index]?.sourceAlignedBand;
      const negative = old16kBand.channels[index]?.sourceAlignedBand;
      const product = channel.sourceAlignedBand;
      const directValid = Boolean(
        direct?.complete &&
        direct.targetRms > 0 &&
        direct.localizationPowerRatio >=
          BAND_GATE.minimumLocalizationPowerRatio,
      );
      return {
        channel: index,
        product,
        direct,
        negative,
        directValid,
        retention: directValid ? product.targetRms / direct!.targetRms : 0,
        negativeRetention:
          directValid && negative
            ? negative.targetRms / direct!.targetRms
            : Number.POSITIVE_INFINITY,
      };
    });
    const bandGate = {
      contract: BAND_GATE,
      channels: bandChannels,
      pass:
        productBand.channelCount > 0 &&
        productBand.channelCount === directBand.channelCount &&
        productBand.channelCount === old16kBand.channelCount &&
        bandChannels.every(
          (channel) =>
            channel.directValid &&
            channel.product.complete &&
            channel.retention >= HIGH_TONE_MIN_CODEC_RETENTION &&
            channel.product.localizationPowerRatio >=
              BAND_GATE.minimumLocalizationPowerRatio &&
            channel.negative?.complete &&
            channel.negativeRetention < HIGH_TONE_MIN_CODEC_RETENTION &&
            channel.negative.localizationPowerRatio <
              BAND_GATE.minimumLocalizationPowerRatio,
        ),
    };
    await saveJson(testInfo, "telefun-audio-band-gate.json", bandGate);
    const recordingHighToneRetention =
      full.high10kRms !== null && positiveControl.high10kRms
        ? full.high10kRms / positiveControl.high10kRms
        : 0;
    const recordingAliasRatio =
      full.high10kRms && full.high10kRms > 0
        ? (full.alias6kRms ?? 0) / full.high10kRms
        : Number.POSITIVE_INFINITY;
    const speakerGraph = playbackDrain.speakerGraph;
    const preEncoderFullMix = playbackDrain.preEncoderFullMix;
    const matchedControlHighToneRetention =
      matchedControl.high10kRms !== null && positiveControl.high10kRms
        ? matchedControl.high10kRms / positiveControl.high10kRms
        : 0;
    const speakerHighToneRetention =
      positiveControl.high10kRms && speakerGraph.high10kRms > 0
        ? speakerGraph.high10kRms / positiveControl.high10kRms
        : 0;
    const speakerAliasRatio =
      speakerGraph.high10kRms > 0
        ? speakerGraph.alias6kRms / speakerGraph.high10kRms
        : Number.POSITIVE_INFINITY;
    const recordingHighFrequencyCriterionMet = bandGate.pass;
    const recordingHighFrequencyStatus = recordingHighFrequencyCriterionMet
      ? "meets source-aligned band-energy and localization criterion on every channel"
      : "invalid direct control or failed source-aligned band-energy criterion";
    const metrics = {
      label:
        "synthetic PCM fixture and fake WAV microphone; no Gemini/provider response",
      input: {
        mimeTypes: [
          ...new Set(inputPackets.map((entry) => entry.audio.mimeType)),
        ],
        frameCount: inputPackets.length,
        sampleCount: inputSamples,
        sampleRateHz: INPUT_RATE_HZ,
        payloadDurationSeconds: providerDurationSeconds,
        observedWallClockSeconds: providerObservedSeconds,
        rms440Hz: inputRms440Hz,
        requestedTrackRatesHz: modelOutput.micTracks.map(
          (track) => track.requestedSampleRate,
        ),
        actualTrackRatesHz: modelOutput.micTracks.map(
          (track) => track.actualSampleRate,
        ),
      },
      output: {
        context: productOutput
          ? {
              requestedSampleRateHz: productOutput.requestedSampleRate,
              actualSampleRateHz: productOutput.actualSampleRate,
              stateAtMeasurement: productOutput.state,
            }
          : null,
        speakerPath,
        sourceCount: outputSpeakerConnections.length,
        sourceBufferRatesHz: outputSpeakerConnections.map(
          (connection) => connection.bufferRate,
        ),
        playbackDrain,
        preEncoderFullMix,
        recorderStopEvidence,
        matchedFullMixCodecControl: {
          ...matchedControl,
          high10kRetentionVsFrozenDirectControl:
            matchedControlHighToneRetention,
        },
        speakerGraph: {
          ...speakerGraph,
          high10kRetentionVsCodecControl: speakerHighToneRetention,
          alias6kTo10kRatio: speakerAliasRatio,
        },
        fullCall: full,
        agentOnly: agent,
        // Exact-frequency projection is a coherence diagnostic, not retention acceptance.
        recordingExact10kRetentionVsCodecControl: recordingHighToneRetention,
        sourceAlignedBandGate: bandGate,
        recordingAlias6kTo10kRatio: recordingAliasRatio,
        recordingHighFrequencyCriterionMet,
        recordingHighFrequencyStatus,
        uploadRequestContentTypes: uploads.map((upload) => upload.contentType),
        uploadFileContentTypes: uploads.map((upload) => upload.fileContentType),
        uploadTypes: captureTypes,
      },
      controls: {
        directCodecHigh10kRms: positiveControl.high10kRms,
        matchedFullMixHigh10kRms: matchedControl.high10kRms,
        matchedFullMixRetentionVsDirectControl: matchedControlHighToneRetention,
        old16kGraphHigh10kRms: calibration.oldGraph.metrics.high10kRms,
      },
    };
    await saveJson(testInfo, "telefun-audio-fidelity-metrics.json", metrics);
    await writeFile(
      testInfo.outputPath("synthetic-full-call.webm"),
      fullUpload!.body,
    );
    await writeFile(
      testInfo.outputPath("synthetic-agent-only.webm"),
      agentUpload!.body,
    );
    await writeFile(
      testInfo.outputPath("synthetic-model-output-24khz.pcm"),
      Buffer.concat(pcmResponse.chunks.map((chunk) => Buffer.from(chunk))),
    );
    await writeFile(
      testInfo.outputPath("synthetic-provider-input-16khz.pcm"),
      Buffer.concat(inputFrames),
    );
    console.log("[telefun-audio-fidelity]", JSON.stringify(metrics));

    expectHermetic(audit);
    expect(inputPackets.length).toBeGreaterThanOrEqual(3);
    expect(
      inputPackets.every(
        (entry) => entry.audio.mimeType === "audio/pcm;rate=16000",
      ),
    ).toBe(true);
    expect(inputSamples).toBeGreaterThanOrEqual(INPUT_RATE_HZ * 0.7);
    expect(
      Math.abs(providerDurationSeconds - providerObservedSeconds),
    ).toBeLessThan(0.4);
    expect(inputRms440Hz).toBeGreaterThan(0.02);
    expect(
      modelOutput.contexts.some(
        (context) =>
          context.role === "telefun-input" &&
          context.actualSampleRate === INPUT_RATE_HZ,
      ),
    ).toBe(true);
    expect(
      modelOutput.micTracks.some(
        (track) => track.requestedSampleRate === INPUT_RATE_HZ,
      ),
    ).toBe(true);
    expect(micStreamIds.size).toBe(1);
    expect(speakerPath).toBe(true);
    const speakerGraphPass =
      productOutput !== undefined &&
      productOutput.actualSampleRate >= 24_000 &&
      speakerGraph.contextRate >= 24_000 &&
      speakerGraph.analyzerWindows > 0 &&
      speakerHighToneRetention >= HIGH_TONE_MIN_CODEC_RETENTION &&
      speakerAliasRatio <= MAX_ALIAS_TO_HIGH_TONE_RATIO;
    expect(
      speakerGraphPass,
      `expected native speaker graph to preserve the 10 kHz PCM tone independently of recordings; observed ${JSON.stringify(
        {
          speakerGraph,
          speakerHighToneRetention,
          speakerAliasRatio,
          productOutput,
        },
      )}`,
    ).toBe(true);
    expect(productOutput?.requestedSampleRate).toBeNull();
    expect(productOutput?.actualSampleRate).toBeGreaterThanOrEqual(24_000);
    expect(outputSpeakerConnections.length).toBeGreaterThanOrEqual(3);
    expect(modelOutput.sourceStarts).toHaveLength(pcmResponse.chunks.length);
    expect(
      modelOutput.sourceStarts.every(
        (source) => source.bufferRate === AUDIO_RATE_HZ,
      ),
    ).toBe(true);
    for (let index = 1; index < modelOutput.sourceStarts.length; index += 1) {
      const previous = modelOutput.sourceStarts[index - 1];
      const current = modelOutput.sourceStarts[index];
      expect(current.when).not.toBeNull();
      expect(previous.when).not.toBeNull();
      expect(
        Math.abs(current.when! - (previous.when! + previous.duration)),
      ).toBeLessThan(0.05);
    }
    expect(
      outputSpeakerConnections.every(
        (connection) => connection.contextRate >= 24_000,
      ),
    ).toBe(true);
    expect(full.durationSeconds).toBeGreaterThanOrEqual(SYNTHETIC_SECONDS);
    expect(agent.durationSeconds).toBeGreaterThanOrEqual(SYNTHETIC_SECONDS);
    expect(full.low1kRms).toBeGreaterThan(0.03);
    expect(agent.low1kRms).toBeLessThan(0.02);
    expect(full.mic440HzRms).toBeGreaterThan(0.02);
    expect(agent.mic440HzRms).toBeGreaterThan(0.02);
    expect(full.tail3kHzRms).toBeGreaterThan(0.02);
    expect(agent.tail3kHzRms).toBeLessThan(0.02);
    expect(full.high10kRms).not.toBeNull();
    expect(speakerGraph.high10kRms).toBeGreaterThan(0);
    expect(speakerHighToneRetention).toBeGreaterThanOrEqual(
      HIGH_TONE_MIN_CODEC_RETENTION,
    );
    expect(speakerAliasRatio).toBeLessThanOrEqual(MAX_ALIAS_TO_HIGH_TONE_RATIO);
    expect(recordingAliasRatio).toBeLessThanOrEqual(
      MAX_ALIAS_TO_HIGH_TONE_RATIO,
    );
    expect(recorderStopEvidence.delayedStopInjected).toBe(true);
    expect(recorderStopEvidence.delayedStopObservedMs).toBeGreaterThanOrEqual(
      700,
    );
    expect(
      recorderStopEvidence.recorderStates.every(
        (entry: { state: string }) => entry.state === "inactive",
      ),
    ).toBe(true);
    expect(
      recordingAliasRatio,
      "full-call recording alias remains an independent recording-quality check",
    ).toBeLessThanOrEqual(MAX_ALIAS_TO_HIGH_TONE_RATIO);
    expect(productBand.channelCount).toBeGreaterThan(0);
    expect(productBand.channelCount).toBe(directBand.channelCount);
    expect(productBand.channelCount).toBe(old16kBand.channelCount);
    for (const channel of bandChannels) {
      expect(
        channel.directValid,
        `INVALID gate: direct control ch${channel.channel}`,
      ).toBe(true);
      expect(
        channel.product.complete,
        `missing fixed source plateau ch${channel.channel}`,
      ).toBe(true);
      expect(
        channel.retention,
        `32 kbps source-aligned 9.8–10.2 kHz retention ch${channel.channel}`,
      ).toBeGreaterThanOrEqual(HIGH_TONE_MIN_CODEC_RETENTION);
      expect(
        channel.product.localizationPowerRatio,
        `codec-band vs silent-reference power/Hz ch${channel.channel}`,
      ).toBeGreaterThanOrEqual(BAND_GATE.minimumLocalizationPowerRatio);
      expect(channel.negative?.complete).toBe(true);
      expect(
        channel.negativeRetention,
        `old16k negative retention ch${channel.channel}`,
      ).toBeLessThan(HIGH_TONE_MIN_CODEC_RETENTION);
      expect(
        channel.negative!.localizationPowerRatio,
        `old16k negative localization ch${channel.channel}`,
      ).toBeLessThan(BAND_GATE.minimumLocalizationPowerRatio);
    }
    expect(captureTypes).toEqual(
      expect.arrayContaining(["full_call.webm", "agent_only.webm"]),
    );
    expect(uploads.every((upload) => upload.body.byteLength > 1_000)).toBe(
      true,
    );
    expect(
      uploads.every((upload) => upload.fileContentType === "audio/webm"),
    ).toBe(true);
    await expect(page).toHaveURL(new RegExp(`sesi=${SESSION_ID}`));
  });

  test("server-close recovery joins delayed recorder shutdown before retry", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(installAudioProbe, {
      mode: "delayed-agent-stop",
    });
    const retrySessionId = `${SESSION_ID}-retry-2`;
    let connectionCount = 0;
    let resourcesReleasedAtRetry: Promise<boolean> | null = null;
    const receivedMessages: Record<string, unknown>[] = [];
    const receivedTypes = await mockTelefunVoiceServer(
      page,
      SESSION_ID,
      receivedMessages,
      {
        closeAfterFirstInput: true,
        onConnection: async (number) => {
          connectionCount = number;
          if (number === 2) {
            resourcesReleasedAtRetry = page.evaluate(() => {
              const probe = (window as any).__telefunAudioProbe;
              const contexts = probe.contexts.filter((entry: any) =>
                entry.role.startsWith("telefun-"),
              );
              const firstContexts = contexts.slice(0, 2);
              const firstTrack = probe.micTracks.find(
                (entry: any) => entry.fromLiveSession,
              )?.track;
              return (
                firstContexts.length === 2 &&
                firstContexts.every(
                  (entry: any) => entry.context.state === "closed",
                ) &&
                firstTrack?.readyState === "ended" &&
                probe.recorders
                  .slice(0, 2)
                  .every((entry: any) => entry.recorder.state === "inactive") &&
                probe.delayedStopObservedMs >= 700
              );
            });
          }
        },
      },
    );
    const audit = await openTelefun(page, {}, [retrySessionId]);
    let createdSessions = 0;
    await page.route("**/api/v1/telefun/sessions", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      createdSessions += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: createdSessions === 1 ? SESSION_ID : retrySessionId,
            simulationSubject: null,
          },
        }),
      });
    });
    await mockRecordingUpload(page);
    await startRingingCall(page);
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.delayedStopInjected,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Coba panggil lagi" }).click();
    await expect.poll(() => connectionCount, { timeout: 15_000 }).toBe(2);
    await expect
      .poll(
        () => receivedTypes.filter((type) => type === "authenticate").length,
      )
      .toBe(2);
    expect(await resourcesReleasedAtRetry).toBe(true);
    const retryCall = page.getByRole("region", { name: "Panggilan" });
    await expect(retryCall.getByRole("status").first()).toHaveText(
      "Giliran Anda",
      {
        timeout: 20_000,
      },
    );
    // Authentication happens during ringing; ending before pickup correctly
    // produces no recording and cannot be expected to navigate to Telaah.
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__telefunAudioProbe.recorders.filter(
              (entry: any) => entry.recorder.state === "recording",
            ).length,
        ),
      )
      .toBe(2);
    await endCall(page, retryCall);
    expect(new URL(page.url()).searchParams.get("sesi")).toBe(retrySessionId);
    await expectAudioResourcesReleased(page);
    expectHermetic(audit);
  });

  test("a delayed AudioContext close keeps disconnect retryable until the existing contexts close", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const { audit, call, uploads } = await prepareAudioCall(
      page,
      "hold-first-telefun-close",
    );
    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();

    const retry = page.getByRole("button", {
      name: "Coba lagi mengakhiri panggilan",
    });
    await expect(call.getByRole("status").first()).toHaveText(
      "Menyimpan rekaman…",
    );
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await expect(retry).toBeEnabled();
    await expect(call.getByRole("alert")).toContainText(
      "Panggilan belum tersimpan. Coba lagi untuk mengakhiri.",
    );
    // Upload/finalize requests proceed while audio release blocks navigation.
    await expect.poll(() => uploads.length).toBe(2);
    expect(
      audit.mockedApi.filter(
        (entry) => entry === "POST /api/v1/telefun/finalize-recording",
      ),
    ).toHaveLength(1);
    const pendingClose = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      const contexts = probe.contexts.filter((entry: any) =>
        entry.role.startsWith("telefun-"),
      );
      return {
        roles: contexts.map((entry: any) => entry.role),
        states: contexts.map((entry: any) => entry.context.state),
        held: probe.closeReleases.length,
        inputTracks: probe.micTracks.filter(
          (entry: any) => entry.requestedSampleRate === 16_000,
        ).length,
      };
    });
    expect(pendingClose.roles).toHaveLength(2);
    expect(pendingClose.held).toBe(2);
    expect(pendingClose.inputTracks).toBeGreaterThanOrEqual(1);
    expect(pendingClose.states).not.toEqual(["closed", "closed"]);
    expect(
      await page.evaluate(() =>
        (window as any).__telefunAudioProbe.micTracks
          .filter((entry: any) => entry.requestedSampleRate === 16_000)
          .every((entry: any) => entry.track.readyState === "ended"),
      ),
    ).toBe(true);
    await expect(page).not.toHaveURL(/tahap=telaah/);

    await page.evaluate(() =>
      (window as any).__telefunAudioProbe.releasePendingCloses(),
    );
    // The save callback already awaits confirmed release. It may navigate as
    // soon as native close settles; a click here races the disappearing phone.
    await expect(page).toHaveURL(/tahap=telaah/, { timeout: 20_000 });
    await expectAudioResourcesReleased(page);
    await expect(retry).toHaveCount(0);
    const attempts = await page.evaluate(
      () => (window as any).__telefunAudioProbe.closeAttempts,
    );
    expect(attempts).toHaveLength(2);
    const afterRetry = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        contexts: probe.contexts.filter((entry: any) =>
          entry.role.startsWith("telefun-"),
        ).length,
        inputTracks: probe.micTracks.filter(
          (entry: any) => entry.requestedSampleRate === 16_000,
        ).length,
      };
    });
    expect(afterRetry).toEqual({
      contexts: 2,
      inputTracks: pendingClose.inputTracks,
    });
    expectHermetic(audit);
  });

  test("startup abort keeps cleanup owned until rejected context closes are retried", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.addInitScript(installAudioProbe, {
      mode: "startup-abort-reject-first-close",
    });
    const received: Record<string, unknown>[] = [];
    await mockTelefunVoiceServer(page, SESSION_ID, received);
    const audit = await openTelefun(page);
    const uploads: CapturedTelefunRecordingUpload[] = [];
    await mockRecordingUpload(page, uploads);
    await startRingingCall(page);
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const probe = (window as any).__telefunAudioProbe;
          return {
            injected: probe.startupFailureInjected,
            rejections: probe.closeRejections,
          };
        }),
      )
      .toEqual({ injected: true, rejections: 2 });
    // Startup-abort uses the same retained disposal owner as end/unmount.
    await expectAudioResourcesReleased(page, false);
    expect(received).toEqual([]);
    expect(uploads).toEqual([]);
    expectHermetic(audit);
  });

  test("unmount retains a cleanup owner and retries rejected AudioContext closes", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const { audit, call } = await prepareAudioCall(
      page,
      "reject-first-telefun-close",
    );
    await page.evaluate(() => {
      history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page).toHaveURL(/\/$/);
    await expect(
      call,
      "route navigation must really unmount the call",
    ).toHaveCount(0);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const probe = (window as any).__telefunAudioProbe;
            const contexts = probe.contexts.filter((entry: any) =>
              entry.role.startsWith("telefun-"),
            );
            const tracks = probe.micTracks.filter(
              (entry: any) => entry.requestedSampleRate === 16_000,
            );
            return (
              contexts.length >= 2 &&
              contexts.every(
                (entry: any) => entry.context.state === "closed",
              ) &&
              tracks.length >= 1 &&
              tracks.every((entry: any) => entry.track.readyState === "ended")
            );
          }),
        { timeout: 25_000 },
      )
      .toBe(true);
    const evidence = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        closeRejections: probe.closeRejections,
        attempts: probe.closeAttempts,
        telefunContexts: probe.contexts.filter((entry: any) =>
          entry.role.startsWith("telefun-"),
        ).length,
      };
    });
    expect(evidence.closeRejections).toBe(2);
    expect(evidence.attempts).toHaveLength(4);
    expect(evidence.telefunContexts).toBe(2);
    expectHermetic(audit);
  });

  test("re-entry joins held cleanup before admitting another call graph or microphone", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    let finalized = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/telefun/finalize-recording"
      )
        finalized += 1;
    });
    const { audit, call, uploads } = await prepareAudioCall(
      page,
      "hold-first-telefun-close",
    );
    await page.evaluate(() => {
      history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(call).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.closeReleases.length,
        ),
      )
      .toBe(2);
    const tracksBefore = await page.evaluate(
      () =>
        (window as any).__telefunAudioProbe.micTracks.filter(
          (entry: any) => entry.fromLiveSession,
        ).length,
    );
    expect(tracksBefore).toBe(1);
    await expect.poll(() => uploads.length).toBe(2);
    await expect(page).toHaveURL(/\/$/);
    await page.evaluate(() => {
      history.pushState({}, "", "/telefun");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const nextCall = await startRingingCall(page);
    // Keep the old close promises held across actual UI re-entry.
    await page.waitForTimeout(500);
    expect(
      await page.evaluate(() => {
        const probe = (window as any).__telefunAudioProbe;
        return {
          contexts: probe.contexts.filter((entry: any) =>
            entry.role.startsWith("telefun-"),
          ).length,
          tracks: probe.micTracks.filter((entry: any) => entry.fromLiveSession)
            .length,
          attempts: probe.closeAttempts.length,
        };
      }),
    ).toEqual({ contexts: 2, tracks: tracksBefore, attempts: 2 });
    await page.evaluate(() =>
      (window as any).__telefunAudioProbe.releasePendingCloses(),
    );
    await expect(nextCall.getByRole("status").first()).toHaveText(
      "Giliran Anda",
      { timeout: 15_000 },
    );
    expect(
      await page.evaluate(
        () =>
          (window as any).__telefunAudioProbe.micTracks.filter(
            (entry: any) => entry.fromLiveSession,
          ).length,
      ),
    ).toBe(2);
    expect(uploads).toHaveLength(2); // joining cleanup cannot finalize/upload again
    expect(finalized).toBe(1);
    const ending = endCall(page, nextCall);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.closeReleases.length,
        ),
      )
      .toBe(2);
    await page.evaluate(() =>
      (window as any).__telefunAudioProbe.releasePendingCloses(),
    );
    await ending;
    await expectAudioResourcesReleased(page);
    await expect.poll(() => uploads.length).toBe(4);
    expect(finalized).toBe(2);
    expect(
      uploads.filter((upload) => upload.path.endsWith("/full_call.webm")),
    ).toHaveLength(2);
    expect(
      uploads.filter((upload) => upload.path.endsWith("/agent_only.webm")),
    ).toHaveLength(2);
    expectHermetic(audit);
  });

  test("re-entry times out explicitly while old AudioContext close is held", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { audit, call, uploads } = await prepareAudioCall(
      page,
      "hold-first-telefun-close",
    );
    await page.evaluate(() => {
      history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(call).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.closeReleases.length,
        ),
      )
      .toBe(2);
    await expect.poll(() => uploads.length).toBe(2);
    await expect(page).toHaveURL(/\/$/);
    await page.evaluate(() => {
      history.pushState({}, "", "/telefun");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await startRingingCall(page);
    await expect(page.getByRole("alert")).toContainText(
      "Panggilan belum tersimpan",
      { timeout: 20_000 },
    );
    expect(
      await page.evaluate(() => {
        const probe = (window as any).__telefunAudioProbe;
        return {
          contexts: probe.contexts.filter((entry: any) =>
            entry.role.startsWith("telefun-"),
          ).length,
          attempts: probe.closeAttempts.length,
          tracks: probe.micTracks.filter((entry: any) => entry.fromLiveSession)
            .length,
          ended: probe.micTracks
            .filter((entry: any) => entry.fromLiveSession)
            .every((entry: any) => entry.track.readyState === "ended"),
        };
      }),
    ).toEqual({ contexts: 2, attempts: 2, tracks: 1, ended: true });
    await expect.poll(() => uploads.length).toBe(2);
    await page.evaluate(() =>
      (window as any).__telefunAudioProbe.releasePendingCloses(),
    );
    await expectAudioResourcesReleased(page);
    expectHermetic(audit);
  });

  test("repeated close rejection exhausts bounded retries and denies re-entry", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const { audit, call, uploads } = await prepareAudioCall(
      page,
      "reject-all-telefun-closes",
    );
    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();
    const retry = page.getByRole("button", {
      name: "Coba lagi mengakhiri panggilan",
    });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.closeAttempts.length,
        ),
      )
      .toBe(6);
    await retry.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.closeAttempts.length,
        ),
      )
      .toBe(12);
    await expect(retry).toBeVisible({ timeout: 15_000 });
    await expect(retry).toBeEnabled();
    expect(
      await page.evaluate(() => {
        const attempts = (window as any).__telefunAudioProbe.closeAttempts;
        return ["telefun-input", "telefun-output"].map((role) =>
          attempts
            .filter((entry: any) => entry.role === role)
            .map((entry: any) => entry.attempt),
        );
      }),
    ).toEqual([
      [1, 2, 3, 4, 5, 6],
      [1, 2, 3, 4, 5, 6],
    ]);
    expect(
      errors.some((message) => message.includes("Audio disposal exhausted")),
    ).toBe(true);
    await page.evaluate(() => {
      history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(call).toHaveCount(0);
    // Unmount joins the rejected shutdown; it must not spend another retry batch.
    expect(
      await page.evaluate(
        () => (window as any).__telefunAudioProbe.closeAttempts.length,
      ),
    ).toBe(12);
    await page.evaluate(() => {
      history.pushState({}, "", "/telefun");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await startRingingCall(page);
    await expect(page.getByRole("alert")).toContainText(
      "Panggilan belum tersimpan",
      { timeout: 20_000 },
    );
    expect(
      await page.evaluate(() => {
        const probe = (window as any).__telefunAudioProbe;
        return {
          contexts: probe.contexts.filter((entry: any) =>
            entry.role.startsWith("telefun-"),
          ).length,
          attempts: probe.closeAttempts.length,
          tracks: probe.micTracks.filter((entry: any) => entry.fromLiveSession)
            .length,
          ended: probe.micTracks
            .filter((entry: any) => entry.fromLiveSession)
            .every((entry: any) => entry.track.readyState === "ended"),
        };
      }),
    ).toEqual({ contexts: 2, attempts: 12, tracks: 1, ended: true });
    await expect.poll(() => uploads.length).toBe(2);
    expectHermetic(audit);
  });

  test("exhausted close recovers on user retry and admits a new call without reload", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    let finalized = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/telefun/finalize-recording"
      )
        finalized += 1;
    });
    const { audit, call, uploads } = await prepareAudioCall(
      page,
      "reject-all-telefun-closes",
    );
    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();
    const retry = page.getByRole("button", {
      name: "Coba lagi mengakhiri panggilan",
    });
    await expect(retry).toBeVisible({ timeout: 20_000 });
    await expect(retry).toBeEnabled();
    await expect(call.getByRole("alert")).toContainText(
      "Panggilan belum tersimpan. Coba lagi untuk mengakhiri.",
    );
    expect(
      await page.evaluate(() => {
        const probe = (window as any).__telefunAudioProbe;
        return ["telefun-input", "telefun-output"].map((role) =>
          probe.closeAttempts
            .filter((entry: any) => entry.role === role)
            .map((entry: any) => entry.attempt),
        );
      }),
    ).toEqual([
      [1, 2, 3],
      [1, 2, 3],
    ]);
    await expect.poll(() => uploads.length).toBe(2);
    expect(finalized).toBe(1);
    await expect(page).not.toHaveURL(/tahap=telaah/);
    expect(
      await page.evaluate(() => {
        const probe = (window as any).__telefunAudioProbe;
        return {
          closed: probe.contexts
            .filter((entry: any) => entry.role.startsWith("telefun-"))
            .every((entry: any) => entry.context.state === "closed"),
          ended: probe.micTracks
            .filter((entry: any) => entry.fromLiveSession)
            .every((entry: any) => entry.track.readyState === "ended"),
        };
      }),
    ).toEqual({ closed: false, ended: true });

    // Change only the injected fault, keeping the document and module owner set.
    await page.evaluate(() => {
      (window as any).__telefunAudioProbe.allowCloseRetry = true;
    });
    await retry.click();
    await expect(page).toHaveURL(/tahap=telaah/, { timeout: 20_000 });
    await expectAudioResourcesReleased(page);
    expect(
      await page.evaluate(() => {
        const probe = (window as any).__telefunAudioProbe;
        return {
          attempts: probe.closeAttempts.length,
          rejections: probe.closeRejections,
          contexts: probe.contexts.filter((entry: any) =>
            entry.role.startsWith("telefun-"),
          ).length,
        };
      }),
    ).toEqual({ attempts: 8, rejections: 6, contexts: 2 });
    expect(uploads).toHaveLength(2);
    expect(finalized).toBe(1);

    await page.evaluate(() => {
      history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(call).toHaveCount(0);
    await page.evaluate(() => {
      history.pushState({}, "", "/telefun");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const nextCall = await startRingingCall(page);
    await expect(nextCall.getByRole("status").first()).toHaveText(
      "Giliran Anda",
      { timeout: 15_000 },
    );
    expect(
      await page.evaluate(
        () =>
          (window as any).__telefunAudioProbe.micTracks.filter(
            (entry: any) => entry.fromLiveSession,
          ).length,
      ),
    ).toBe(2);
    await endCall(page, nextCall);
    await expectAudioResourcesReleased(page);
    await expect.poll(() => uploads.length).toBe(4);
    expect(finalized).toBe(2);
    expectHermetic(audit);
  });

  test("drain acknowledgement ignores unrelated frames and waits for the matching frame", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(installAudioProbe, { mode: "native" });
    let connectionCount = 0;
    await mockTelefunVoiceServer(page, SESSION_ID, [], {
      drainAckDelayMs: 600,
      drainUnrelatedMessage: true,
      drainUnrelatedDelayMs: 100,
      onConnection: () => {
        connectionCount += 1;
      },
    });
    const audit = await openTelefun(page);
    const call = await startRingingCall(page);
    await expect.poll(() => connectionCount).toBe(1);
    await page.waitForTimeout(100);
    const startedAt = Date.now();
    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();
    await page.waitForTimeout(300);
    await expect(call).toBeVisible();
    await expect(call.getByText("Menyimpan rekaman…")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeHidden();
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(500);
    expect(elapsedMs).toBeLessThan(4_500);
    await expectAudioResourcesReleased(page);
    expectHermetic(audit);
  });

  test("missing drain acknowledgement remains bounded and releases browser resources", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.addInitScript(installAudioProbe, { mode: "native" });
    const receivedTypes = await mockTelefunVoiceServer(page, SESSION_ID, [], {
      suppressDrainAck: true,
    });
    const audit = await openTelefun(page);
    await mockRecordingUpload(page);
    const call = await startRingingCall(page);
    await expect.poll(() => receivedTypes.includes("authenticate")).toBe(true);
    await page.waitForTimeout(100);
    const startedAt = Date.now();
    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expectAudioResourcesReleased(page);
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeGreaterThanOrEqual(4_500);
    expect(elapsedMs).toBeLessThan(15_000);
    expectHermetic(audit);
  });

  test("server interruption stops scheduled model audio and is included in session metrics", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const patchBodies: unknown[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PATCH" &&
        request.url().endsWith(`/api/v1/telefun/sessions/${SESSION_ID}`)
      ) {
        patchBodies.push(request.postDataJSON());
      }
    });
    const audioResponse: MockTelefunPcmResponse = {
      sampleRateHz: AUDIO_RATE_HZ,
      chunks: pcmToneChunks(),
      transport: "inline",
      afterFirstInput: true,
      interruptAfterMs: 100,
    };
    const { audit, call, clientMessages } = await prepareAudioCall(
      page,
      "native",
      audioResponse,
    );
    await expect
      .poll(
        () =>
          clientMessages.filter((message) => getAudioPayload(message)?.data)
            .length,
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(3);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).__telefunAudioProbe.sourceStops.filter(
                (entry: any) => entry.role === "telefun-output",
              ).length,
          ),
        { timeout: 5_000 },
      )
      .toBeGreaterThanOrEqual(1);
    const playback = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        starts: probe.sourceStarts.filter(
          (entry: any) => entry.role === "telefun-output",
        ).length,
        stops: probe.sourceStops.filter(
          (entry: any) => entry.role === "telefun-output",
        ).length,
      };
    });
    expect(playback.starts).toBe(audioResponse.chunks.length);
    expect(playback.stops).toBeGreaterThanOrEqual(1);

    await endCall(page, call);
    await expectAudioResourcesReleased(page);
    await waitForMockedApi(audit, [
      "POST /api/v1/telefun/sessions",
      `PATCH /api/v1/telefun/sessions/${SESSION_ID}`,
    ]);
    const metrics = patchBodies
      .map(
        (body) =>
          (body as { session_metrics?: { interruptionCount?: number } })
            .session_metrics,
      )
      .find(Boolean);
    expect(metrics?.interruptionCount).toBe(1);
    expectHermetic(audit);
  });

  test("keeps 24 kHz playback connected at a limited 22.05 kHz native output rate", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const sampleRateDiagnostics: string[] = [];
    page.on("console", (message) => {
      if (!message.text().includes("Audio graph sample rates:")) return;
      const value = message.args()[1];
      if (value)
        void value
          .jsonValue()
          .then((entry: unknown) => sampleRateDiagnostics.push(String(entry)));
    });
    const audioResponse: MockTelefunPcmResponse = {
      sampleRateHz: AUDIO_RATE_HZ,
      chunks: pcmToneChunks(),
      transport: "inline",
      afterFirstInput: true,
    };
    const { audit, call, clientMessages } = await prepareAudioCall(
      page,
      "low-native-output",
      audioResponse,
    );
    await expect
      .poll(
        () =>
          clientMessages.filter((message) => getAudioPayload(message)?.data)
            .length,
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(3);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as any).__telefunAudioProbe.sourceStarts.filter(
                (entry: any) => entry.role === "telefun-output",
              ).length,
          ),
        { timeout: 10_000 },
      )
      .toBe(audioResponse.chunks.length);
    const playback = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      const output = [...probe.contexts]
        .reverse()
        .find(
          (entry: any) =>
            entry.role === "telefun-output" && entry.context.state !== "closed",
        );
      return {
        nativeRate: output?.context.sampleRate ?? null,
        state: output?.context.state ?? null,
        connections: probe.sourceConnections.filter(
          (entry: any) => entry.role === "telefun-output",
        ),
        starts: probe.sourceStarts.filter(
          (entry: any) => entry.role === "telefun-output",
        ),
      };
    });
    expect(playback.nativeRate).toBe(22_050);
    expect(playback.state).toBe("running");
    expect(playback.connections).toHaveLength(audioResponse.chunks.length);
    expect(
      playback.connections.every(
        (entry: any) => entry.bufferRate === AUDIO_RATE_HZ,
      ),
    ).toBe(true);
    expect(playback.starts).toHaveLength(audioResponse.chunks.length);
    await expect
      .poll(() =>
        sampleRateDiagnostics.some((entry) =>
          entry.includes('"outputRateCapability":"native_below_24khz"'),
        ),
      )
      .toBe(true);
    await endCall(page, call);
    await expectAudioResourcesReleased(page);
    await waitForMockedApi(audit, [
      "POST /api/v1/telefun/sessions",
      `PATCH /api/v1/telefun/sessions/${SESSION_ID}`,
    ]);
  });

  test("surfaces user-driven audio retry and proves real output becomes audible", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const audioResponse: MockTelefunPcmResponse = {
      sampleRateHz: AUDIO_RATE_HZ,
      chunks: pcmToneChunks(8),
      transport: "inline",
      afterFirstInput: true,
    };
    const { audit, call } = await prepareAudioCall(
      page,
      "block-output",
      audioResponse,
      {},
      true,
    );
    const retryButton = page.getByRole("button", { name: "Aktifkan audio" });
    await expect(retryButton).toBeVisible({ timeout: 10_000 });
    const injected = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        resumeFailureInjected: probe.resumeFailureInjected,
        resumeFailureCount: probe.resumeFailureCount,
      };
    });
    expect(injected.resumeFailureInjected).toBe(true);
    expect(injected.resumeFailureCount).toBeGreaterThanOrEqual(1);

    await retryButton.click();
    await expect(retryButton).toBeHidden({ timeout: 5_000 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__telefunAudioProbe.sourceStarts.filter(
              (entry: any) => entry.role === "telefun-output",
            ).length,
        ),
      )
      .toBe(audioResponse.chunks.length);
    const outputState = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return [...probe.contexts]
        .reverse()
        .find((entry: any) => entry.role === "telefun-output")?.context.state;
    });
    expect(outputState).toBe("running");
    const speakerPeaks = await measureAudioTaps(page, "speaker", HIGH_TONE_HZ);
    const speakerLevel = Math.max(0, ...Object.values(speakerPeaks));
    expect(
      speakerLevel,
      `expected audible high tone; peaks=${JSON.stringify(speakerPeaks)}, graph=${JSON.stringify(
        await page.evaluate(() => {
          const probe = (window as any).__telefunAudioProbe;
          const output = [...probe.contexts]
            .reverse()
            .find((entry: any) => entry.role === "telefun-output");
          return {
            outputState: output?.context.state,
            currentTime: output?.context.currentTime,
            taps: probe.speakerTaps.length,
            starts: probe.sourceStarts.filter(
              (entry: any) => entry.role === "telefun-output",
            ).length,
          };
        }),
      )}`,
    ).toBeGreaterThan(0.02);
    await expect(call.getByRole("status").first()).toHaveText(
      "Konsumen berbicara",
    );
    await endCall(page, call);
    await expectAudioResourcesReleased(page);
    await waitForMockedApi(audit, [
      "POST /api/v1/telefun/sessions",
      `PATCH /api/v1/telefun/sessions/${SESSION_ID}`,
    ]);
  });

  test("bounds a stalled AudioWorklet load and keeps 16 kHz fallback input packets", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    // Freeze the window before seeing signal strength. Never retry/select
    // packets based on RMS, nor combine phases across independent callbacks.
    const warmupBlocks = 2;
    const measuredBlocks = 8;
    const samplesPerBlock = 4096;
    const requiredBlocks = warmupBlocks + measuredBlocks;
    // AudioProcessingEvent timestamps can jitter by render quanta even when
    // native sequence/sample counts are complete. Permit 8 * 128 = 1024
    // samples (0.064 s), one quarter of a 4096-sample block. A skipped block
    // deviates by about 0.256 s and still fails; sequence +1 and exact packet
    // sample counts remain the primary guards. RMS is unchanged.
    const clockToleranceSamples = 1024;
    const clockToleranceSeconds = clockToleranceSamples / INPUT_RATE_HZ + 1e-6;
    const expectedClockStepSeconds = samplesPerBlock / INPUT_RATE_HZ;
    const { audit, call, clientMessages } = await prepareAudioCall(
      page,
      "fallback-worklet",
    );
    await expect
      .poll(
        () =>
          clientMessages.filter((message) => getAudioPayload(message)?.data)
            .length,
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(requiredBlocks);
    const fallback = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        injected: probe.workletFailureInjected,
        failures: probe.workletModuleFailures,
        contexts: probe.contexts
          .filter((entry: any) => entry.role === "telefun-input")
          .map((entry: any) => entry.actualSampleRate),
        blocks: probe.fallbackInputBlocks as FallbackInputBlock[],
      };
    });
    const inputPackets = clientMessages
      .map((message) => getAudioPayload(message))
      .filter((audio) => audio?.data)
      .slice(0, requiredBlocks);
    // Match every sent packet to its native callback, including warm-up.
    // Sequence + audio-clock deltas independently detect skipped blocks;
    // energy aggregation alone would conceal those discontinuities.
    let previousIndex = -1;
    const packetEvidence = inputPackets.map((audio, packetIndex) => {
      const previousSource = fallback.blocks[previousIndex] ?? null;
      const sourceIndex = fallback.blocks.findIndex(
        (block, index) =>
          index > previousIndex && block.pcmBase64 === audio!.data,
      );
      if (sourceIndex >= 0) previousIndex = sourceIndex;
      const source = fallback.blocks[sourceIndex] ?? null;
      const clockStepSeconds =
        source && previousSource
          ? source.playbackTime - previousSource.playbackTime
          : null;
      const clockDeviationSeconds =
        clockStepSeconds === null
          ? null
          : clockStepSeconds - expectedClockStepSeconds;
      const frame = Buffer.from(audio!.data!, "base64");
      const sampleCount = Math.floor(frame.byteLength / 2);
      let energy = 0;
      for (let i = 0; i < sampleCount; i += 1) {
        energy += (frame.readInt16LE(i * 2) / 32768) ** 2;
      }
      return {
        packetIndex,
        source,
        clockStepSeconds,
        clockDeviationSeconds,
        clockDeviationSamples:
          clockDeviationSeconds === null
            ? null
            : clockDeviationSeconds * INPUT_RATE_HZ,
        sampleCount,
        totalRms: Math.sqrt(energy / sampleCount),
        toneRms: rmsAtPcmFrequency([frame], INPUT_RATE_HZ, 440),
      };
    });
    const measurementWindow = packetEvidence.slice(
      warmupBlocks,
      requiredBlocks,
    );
    const sampleCount = measurementWindow.reduce(
      (total, block) => total + block.sampleCount,
      0,
    );
    const weightedToneRms = Math.sqrt(
      measurementWindow.reduce(
        (total, block) => total + block.sampleCount * block.toneRms ** 2,
        0,
      ) / sampleCount,
    );
    await writeFile(
      testInfo.outputPath("fallback-input-window.pcm"),
      Buffer.concat(
        inputPackets
          .slice(warmupBlocks)
          .map((audio) => Buffer.from(audio!.data!, "base64")),
      ),
    );
    await saveJson(testInfo, "fallback-input-evidence.json", {
      warmupBlocks,
      measuredBlocks,
      samplesPerBlock,
      sampleRate: INPUT_RATE_HZ,
      clockToleranceSamples,
      clockToleranceSeconds,
      expectedClockStepSeconds,
      weightedToneRms,
      sampleCount,
      packetEvidence,
      fallback,
    });
    expect(fallback.injected).toBe(true);
    expect(fallback.failures).toBeGreaterThanOrEqual(1);
    expect(fallback.contexts).toContain(INPUT_RATE_HZ);
    expect(inputPackets).toHaveLength(requiredBlocks);
    expect(
      inputPackets.every((audio) => audio?.mimeType === "audio/pcm;rate=16000"),
    ).toBe(true);
    expect(sampleCount).toBe(measuredBlocks * samplesPerBlock);
    for (const [index, block] of packetEvidence.entries()) {
      expect(block.sampleCount, `packet ${index} sample count`).toBe(
        samplesPerBlock,
      );
      expect(
        block.source,
        `packet ${index} matches a real native input block`,
      ).not.toBeNull();
      expect(block.source!.sampleRate).toBe(INPUT_RATE_HZ);
      expect(block.source!.sampleCount).toBe(samplesPerBlock);
      if (index >= warmupBlocks) {
        expect(
          block.totalRms,
          `measured packet ${index} must not be zero`,
        ).toBeGreaterThan(0);
      }
      if (index >= warmupBlocks) {
        const previous = packetEvidence[index - 1].source!;
        expect(block.source!.sequence, `packet ${index} native sequence`).toBe(
          previous.sequence + 1,
        );
        expect(
          Math.abs(block.clockDeviationSeconds!),
          `packet ${index} audio-clock continuity`,
        ).toBeLessThanOrEqual(clockToleranceSeconds);
      }
    }
    expect(weightedToneRms).toBeGreaterThanOrEqual(0.02);

    await endCall(page, call);
    await expectAudioResourcesReleased(page);
    await waitForMockedApi(audit, [
      "POST /api/v1/telefun/sessions",
      `PATCH /api/v1/telefun/sessions/${SESSION_ID}`,
    ]);
    expectHermetic(audit);
  });

  test("missing agent stop completion preserves the full track and fails closed for scoring", async ({
    page,
  }, testInfo) => {
    test.setTimeout(45_000);
    const finalizeBodies: Array<Record<string, unknown>> = [];
    let scoreRequestCount = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/telefun/finalize-recording")
      ) {
        finalizeBodies.push(request.postDataJSON() as Record<string, unknown>);
      }
      if (
        request.method() === "POST" &&
        request.url().endsWith(`/api/v1/telefun/score/${SESSION_ID}`)
      ) {
        scoreRequestCount += 1;
      }
    });
    const audioResponse: MockTelefunPcmResponse = {
      sampleRateHz: AUDIO_RATE_HZ,
      chunks: pcmToneChunks(),
      transport: "inline",
      afterFirstInput: true,
    };
    const { audit, call, uploads } = await prepareAudioCall(
      page,
      "missing-agent-stop",
      audioResponse,
    );
    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();
    await expect(
      page.getByText("Rekaman tidak lengkap. Panggilan tidak akan dinilai."),
    ).toBeVisible({ timeout: 25_000 });
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();
    await expectAudioResourcesReleased(page);

    const uploadPaths = uploads.map((upload) => upload.path.split("/").at(-1));
    expect(uploadPaths).toContain("full_call.webm");
    expect(uploadPaths).not.toContain("agent_only.webm");
    expect(finalizeBodies).toHaveLength(1);
    expect(finalizeBodies[0]).toMatchObject({
      sessionId: SESSION_ID,
      captureStatus: "failed",
    });
    expect(scoreRequestCount).toBe(0);
    expect(
      await page.evaluate(
        () => (window as any).__telefunAudioProbe.missingStopInjected,
      ),
    ).toBe(true);
    const fullUpload = uploads.find((upload) =>
      upload.path.endsWith("full_call.webm"),
    );
    expect(fullUpload).toBeDefined();
    const full = await decodeWebmMetrics(page, fullUpload!.body);
    expect(full.mic440HzRms).toBeGreaterThan(0.02);
    expect(full.tail3kHzRms).toBeGreaterThan(0.02);
    await writeFile(
      testInfo.outputPath("partial-full-call.webm"),
      fullUpload!.body,
    );
    await saveJson(testInfo, "capture-failure-evidence.json", {
      uploadPaths,
      finalizeBody: finalizeBodies[0],
      scoreRequestCount,
      decodedFullCall: full,
    });
    expectHermetic(audit);
  });

  test("mid-call agent recorder errors preserve the other track and wait for failed-attempt delivery before retry", async ({
    page,
  }) => {
    test.setTimeout(75_000);
    const sessionIds = [SESSION_ID, `${SESSION_ID}-retry`];
    const requestOrder: string[] = [];
    const finalized: Array<Record<string, unknown>> = [];
    const scoreSessionIds: string[] = [];
    let createdSessionCount = 0;
    await page.addInitScript(installAudioProbe, {
      mode: "delayed-agent-error",
    });
    let connectionCount = 0;
    let resourcesReleasedAtRetry: Promise<boolean> | null = null;
    await mockTelefunVoiceServer(page, SESSION_ID, [], {
      onConnection: (number) => {
        connectionCount = number;
        if (number === 2) {
          resourcesReleasedAtRetry = page.evaluate(() => {
            const probe = (window as any).__telefunAudioProbe;
            const contexts = probe.contexts.filter((entry: any) =>
              entry.role.startsWith("telefun-"),
            );
            const firstContexts = contexts.slice(0, 2);
            const firstTrack = probe.micTracks[0]?.track;
            return (
              firstContexts.length === 2 &&
              firstContexts.every(
                (entry: any) => entry.context.state === "closed",
              ) &&
              firstTrack?.readyState === "ended"
            );
          });
        }
      },
    });
    const audit = await openTelefun(page);
    await page.route("**/api/v1/telefun/sessions", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const id = sessionIds[createdSessionCount] ?? `${SESSION_ID}-extra`;
      createdSessionCount += 1;
      requestOrder.push(`session:${id}`);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { id, simulationSubject: null },
        }),
      });
    });
    await page.route("**/api/v1/telefun/sessions/**", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: null }),
      });
    });
    await page.route("**/api/v1/telefun/finalize-recording", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      finalized.push(body);
      requestOrder.push(`finalize:${String(body.sessionId)}`);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            recordingStatus:
              body.captureStatus === "failed" ? "failed" : "uploaded",
            scoringStatus:
              body.captureStatus === "failed" ? "failed" : "pending",
          },
        }),
      });
    });
    await page.route("**/api/v1/telefun/remux-recording/**", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { remuxed: false, recordings: {} },
        }),
      }),
    );
    await page.route("**/api/v1/telefun/score/**", async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
      scoreSessionIds.push(id);
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "SCORING_IN_PROGRESS",
            message: "Scoring is queued.",
            details: { scoringStatus: "pending" },
          },
        }),
      });
    });
    await page.route("**/api/v1/telefun/history/**", async (route) => {
      const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id,
            created_at: new Date().toISOString(),
            consumer_name: "Dian Permana",
            scenario_title: "Audio sintetis",
            duration_seconds: 2,
            scoring_status: "pending",
            messages: [],
          },
        }),
      });
    });
    await page.route("**/api/v1/telefun/recording/**", async (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: { url: null } }),
      }),
    );
    const uploads: CapturedTelefunRecordingUpload[] = [];
    await mockRecordingUpload(page, uploads);
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/telefun/finalize-recording")
      ) {
        const body = request.postDataJSON() as Record<string, unknown>;
        requestOrder.push(`finalize-observed:${String(body.sessionId)}`);
      }
    });

    const firstCall = await startRingingCall(page);
    await expect(firstCall.getByRole("status").first()).toHaveText(
      "Giliran Anda",
      { timeout: 20_000 },
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).__telefunAudioProbe.recorderErrorInjected,
        ),
      )
      .toBe(true);
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect(
      firstCall.getByRole("button", { name: "Coba panggil lagi" }),
    ).toBeVisible();
    await firstCall.getByRole("button", { name: "Coba panggil lagi" }).click();

    await expect.poll(() => createdSessionCount, { timeout: 20_000 }).toBe(2);
    await expect.poll(() => connectionCount, { timeout: 20_000 }).toBe(2);
    expect(await resourcesReleasedAtRetry).toBe(true);
    expect(finalized).toHaveLength(1);
    expect(finalized[0]).toMatchObject({
      sessionId: sessionIds[0],
      captureStatus: "failed",
    });
    expect(
      requestOrder.indexOf(`finalize:${sessionIds[0]}`),
      "failed recording transition completes before the retry session is created",
    ).toBeLessThan(requestOrder.indexOf(`session:${sessionIds[1]}`));
    const firstSessionUploads = uploads.filter((upload) =>
      upload.path.includes(`/${sessionIds[0]}/`),
    );
    expect(
      firstSessionUploads.map((upload) => upload.path.split("/").at(-1)),
    ).toContain("full_call.webm");
    expect(
      firstSessionUploads.map((upload) => upload.path.split("/").at(-1)),
    ).not.toContain("agent_only.webm");
    expect(scoreSessionIds).not.toContain(sessionIds[0]);
    await expect(page).not.toHaveURL(/tahap=telaah/);
    const retryCall = page.getByRole("region", { name: "Panggilan" });
    await expect(retryCall).toBeVisible();
    await expect(retryCall.getByRole("status").first()).toHaveText(
      "Giliran Anda",
      { timeout: 20_000 },
    );
    await expect(
      retryCall.getByRole("button", { name: "Akhiri", exact: true }),
    ).toBeVisible();

    await retryCall
      .getByRole("button", { name: "Akhiri", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();
    await expect.poll(() => finalized.length, { timeout: 30_000 }).toBe(2);
    expect(finalized.map((body) => body.sessionId)).toEqual(sessionIds);
    await expect(page).toHaveURL(
      new RegExp(`sesi=${sessionIds[1]}.*tahap=telaah`),
    );
    expect(scoreSessionIds).toContain(sessionIds[1]);
    await expectAudioResourcesReleased(page);
    expectHermetic(audit);
  });

  test("recording-transition persistence failure is saved locally and skips scoring", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    let finalizeAttempts = 0;
    let scoreRequests = 0;
    let remuxRequests = 0;
    await page.addInitScript(installAudioProbe, { mode: "native" });
    await mockTelefunVoiceServer(page, SESSION_ID);
    const audit = await openTelefun(page);
    await page.route("**/api/v1/telefun/finalize-recording", async (route) => {
      finalizeAttempts += 1;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "RECORDING_STATE_UNAVAILABLE" },
        }),
      });
    });
    await page.route("**/api/v1/telefun/score/**", async (route) => {
      scoreRequests += 1;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: { code: "SCORING_IN_PROGRESS" },
        }),
      });
    });
    await page.route("**/api/v1/telefun/remux-recording/**", async (route) => {
      remuxRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { remuxed: false, recordings: {} },
        }),
      });
    });
    const uploads: CapturedTelefunRecordingUpload[] = [];
    await mockRecordingUpload(page, uploads);

    const call = await startRingingCall(page);
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 20_000,
    });
    await call.getByRole("button", { name: "Akhiri", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan", exact: true })
      .click();

    await expect(
      page.getByText(
        "Panggilan belum tersimpan di server. Periksa riwayat sebelum mencoba ulang.",
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/tahap=telaah/);
    expect(finalizeAttempts).toBe(2);
    expect(uploads.map((upload) => upload.path.split("/").at(-1))).toEqual(
      expect.arrayContaining(["full_call.webm", "agent_only.webm"]),
    );
    expect(remuxRequests).toBe(0);
    expect(scoreRequests).toBe(0);
    expectHermetic(audit);
  });

  test("AI playback stops on hold and resumes after the user returns", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const initialResponse: MockTelefunPcmResponse = {
      sampleRateHz: AUDIO_RATE_HZ,
      chunks: pcmToneChunks(6),
      transport: "inline",
      afterFirstInput: true,
    };
    const followupResponse: MockTelefunPcmResponse = {
      sampleRateHz: AUDIO_RATE_HZ,
      chunks: pcmToneChunks(0.4),
      transport: "inline",
    };
    const { audit, call } = await prepareAudioCall(
      page,
      "native",
      initialResponse,
      { audioResponseAfterText: followupResponse },
      false,
      true,
    );
    const initialStarts = await page.evaluate(
      () =>
        (window as any).__telefunAudioProbe.sourceStarts.filter(
          (entry: any) => entry.role === "telefun-output",
        ).length,
    );
    expect(initialStarts).toBe(initialResponse.chunks.length);
    await call.getByRole("button", { name: "Tahan" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__telefunAudioProbe.sourceStops.filter(
              (entry: any) => entry.role === "telefun-output",
            ).length,
        ),
      )
      .toBeGreaterThan(0);
    // Allow the finite analyser window to drain; keep the actual signal
    // threshold, rather than treating a stop() call as proof of silence.
    await expect
      .poll(async () => {
        const heldSpeaker = await measureAudioTaps(
          page,
          "speaker",
          LOW_TONE_HZ,
        );
        return Math.max(0, ...Object.values(heldSpeaker));
      })
      .toBeLessThan(0.01);

    await call.getByRole("button", { name: "Lanjutkan" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__telefunAudioProbe.sourceStarts.filter(
              (entry: any) => entry.role === "telefun-output",
            ).length,
        ),
      )
      .toBeGreaterThan(initialResponse.chunks.length);
    const resumedSpeaker = await measureAudioTaps(
      page,
      "speaker",
      TAIL_MARKER_HZ,
    );
    expect(Math.max(0, ...Object.values(resumedSpeaker))).toBeGreaterThan(0.02);
    await endCall(page, call);
    await expectAudioResourcesReleased(page);
    expectHermetic(audit);
  });

  test("cleans the prepared input graph when native output context creation fails", async ({
    page,
  }) => {
    await page.addInitScript(installAudioProbe, {
      mode: "fail-output-context",
    });
    const clientMessages: Record<string, unknown>[] = [];
    const received = await mockTelefunVoiceServer(
      page,
      SESSION_ID,
      clientMessages,
    );
    const audit = await openTelefun(page);
    await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
    const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
    await expect(picker.getByText("Suara Anda terdengar.")).toBeVisible({
      timeout: 15_000,
    });
    await picker.getByRole("button", { name: "Mulai panggilan" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    await expectAudioResourcesReleased(page, false);
    const injected = await page.evaluate(
      () => (window as any).__telefunAudioProbe.outputContextFailureInjected,
    );
    expect(injected).toBe(true);
    expect(received).toHaveLength(0);
    expectHermetic(audit);
  });

  test("mute and hold disable capture and restore only the intended microphone state", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { audit, call, clientMessages } = await prepareAudioCall(
      page,
      "native",
    );
    const readMicTrack = () =>
      page.evaluate((inputRateHz) => {
        const tracks = (window as any).__telefunAudioProbe.micTracks.filter(
          (entry: any) =>
            entry.requestedSampleRate === inputRateHz &&
            entry.track.readyState === "live",
        );
        const track = tracks.at(-1)?.track;
        return track
          ? { enabled: track.enabled, readyState: track.readyState }
          : null;
      }, INPUT_RATE_HZ);
    expect((await readMicTrack())?.enabled).toBe(true);
    const initialRecordingMic = await measureAudioTaps(page, "recording", 440);
    expect(initialRecordingMic.full_call).toBeGreaterThan(0.02);
    expect(initialRecordingMic.agent_only).toBeGreaterThan(0.02);
    await call.getByRole("button", { name: "Bisukan" }).click();
    await expect
      .poll(readMicTrack)
      .toMatchObject({ enabled: false, readyState: "live" });
    // Flush frames captured before the track was disabled, then ensure the
    // provider-input count stops changing while mute remains active.
    await page.waitForTimeout(600);
    const settledMutedPackets = clientMessages.filter(
      (message) => getAudioPayload(message)?.data,
    ).length;
    await page.waitForTimeout(300);
    const afterMuteSettles = clientMessages.filter(
      (message) => getAudioPayload(message)?.data,
    ).length;
    expect(afterMuteSettles).toBe(settledMutedPackets);
    const mutedRecordingMic = await measureAudioTaps(page, "recording", 440);
    expect(mutedRecordingMic.full_call).toBeLessThan(0.01);
    expect(mutedRecordingMic.agent_only).toBeLessThan(0.01);

    await call.getByRole("button", { name: "Tahan" }).click();
    await expect
      .poll(readMicTrack)
      .toMatchObject({ enabled: false, readyState: "live" });
    await call.getByRole("button", { name: "Lanjutkan" }).click();
    await expect
      .poll(readMicTrack)
      .toMatchObject({ enabled: false, readyState: "live" });
    const heldRecordingMic = await measureAudioTaps(page, "recording", 440);
    expect(heldRecordingMic.full_call).toBeLessThan(0.01);
    expect(heldRecordingMic.agent_only).toBeLessThan(0.01);
    await call.getByRole("button", { name: "Bunyikan" }).click();
    await expect
      .poll(readMicTrack)
      .toMatchObject({ enabled: true, readyState: "live" });
    const restoredRecordingMic = await measureAudioTaps(page, "recording", 440);
    expect(restoredRecordingMic.full_call).toBeGreaterThan(0.02);
    expect(restoredRecordingMic.agent_only).toBeGreaterThan(0.02);
    await expect
      .poll(
        () =>
          clientMessages.filter((message) => getAudioPayload(message)?.data)
            .length,
      )
      .toBeGreaterThan(afterMuteSettles);

    await endCall(page, call);
    await expectAudioResourcesReleased(page);
    await waitForMockedApi(audit, [
      "POST /api/v1/telefun/sessions",
      `PATCH /api/v1/telefun/sessions/${SESSION_ID}`,
    ]);
  });
});
