// Shared by the telefun-audio-fidelity-*.spec.ts files.
import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openHermeticShell, type ApiMock } from "./hermeticShell";
import {
  mockRecordingUpload,
  mockTelefunAvatar,
  mockTelefunVoiceServer,
  telefunMocks,
  type CapturedTelefunRecordingUpload,
  type MockTelefunPcmResponse,
} from "./telefunFixtures";

export const AUDIO_RATE_HZ = 24_000;

export const INPUT_RATE_HZ = 16_000;

export const LOW_TONE_HZ = 1_000;

export const HIGH_TONE_HZ = 10_000;

export const ALIAS_TONE_HZ = 6_000;

export const TAIL_MARKER_HZ = 3_000;

export const HIGH_TONE_MIN_CODEC_RETENTION = 0.5;

export const MAX_ALIAS_TO_HIGH_TONE_RATIO = 0.5;

export const SYNTHETIC_SECONDS = 1.6;

export const SYNTHETIC_CHUNK_SECONDS = 0.4;

export const SYNTHETIC_BITRATE = 32_000;

export function createFakeMicWav(
  sampleRate = INPUT_RATE_HZ,
  seconds = 3,
): Buffer {
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

export const SESSION_ID = "telefun-audio-fidelity-1";

export function callMocks(
  settings: Record<string, unknown> = {},
  sessionId = SESSION_ID,
): ApiMock[] {
  return [
    ...telefunMocks([], {
      // Fidelity probes count model PCM; nonverbal assets have their own E2E.
      preferredConsumerTypeId: "ramah",
      ...settings,
    }),
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

export async function openTelefun(
  page: Page,
  settings: Record<string, unknown> = {},
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

export async function startRingingCall(page: Page) {
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

export async function endCall(page: Page, call: Locator) {
  await call.getByRole("button", { name: "Akhiri", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Akhiri panggilan?" })
    .getByRole("button", { name: "Akhiri panggilan", exact: true })
    .click();
  await expect(page).toHaveURL(/tahap=telaah/, { timeout: 30_000 });
}

export async function prepareAudioCall(
  page: Page,
  mode: AudioProbeMode,
  audioResponse?: MockTelefunPcmResponse,
  voiceOptions: {
    audioResponseAfterText?: MockTelefunPcmResponse;
    beforeAudioResponse?: () => Promise<void>;
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

export async function measureAudioTaps(
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

export async function expectAudioResourcesReleased(
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

export function pcmToneChunks(seconds = SYNTHETIC_SECONDS): Uint8Array[] {
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

export function rmsAtPcmFrequency(
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

export type FallbackInputBlock = {
  sequence: number;
  sampleCount: number;
  sampleRate: number;
  playbackTime: number;
  callbackTimeMs: number;
  pcmBase64: string;
};

export type AudioProbeMode =
  | "native"
  | "stream-jitter"
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

export type MatchedControlRecorder = {
  recorder: MediaRecorder;
  chunks: Blob[];
  base64: string | null;
};

export type ContextSummary = {
  role: string;
  requestedSampleRate: number | null;
  actualSampleRate: number;
  state: string;
};

export type SourceConnectionSummary = {
  role: string;
  destination: string;
  contextRate: number;
  bufferRate: number | null;
};

export type SourceStartSummary = {
  role: string;
  bufferRate: number | null;
  duration: number;
  when: number | null;
};

export type MicSourceSummary = { role: string; streamId: string };

export type MicTrackSummary = {
  requestedSampleRate: number | null;
  actualSampleRate: number | null;
  readyState: string;
};

export function installDelayedSocketOpenProbe() {
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

export function installAudioProbe({
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
    pcmIngress: [] as Array<{
      audioTime: number;
      duration: number;
      sampleRate: number;
      contextState: string;
    }>,
    installPcmIngress: null as null | ((holdFourth?: boolean) => void),
    renderedSamples: [] as number[],
    renderProcessor: null as AudioWorkletNode | null,
    renderReady: Promise.resolve(),
    renderFrames: [] as number[],
    renderSampleRate: 0,
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

  if (mode === "stream-jitter")
    probe.installPcmIngress = (holdFourth = false) => {
      const NativeSocket = window.WebSocket;
      window.WebSocket = class extends NativeSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          const deferred: string[] = [];
          let holding = false;
          let released = false;
          // Registered in the constructor, before the product onmessage handler.
          this.addEventListener("message", (event) => {
            if (typeof event.data !== "string") return;
            if (holding && !released) {
              deferred.push(event.data);
              event.stopImmediatePropagation();
              return;
            }
            let message;
            try {
              message = JSON.parse(event.data);
            } catch {
              return;
            }
            for (const part of message.serverContent?.modelTurn?.parts ?? []) {
              const inline = part.inlineData;
              if (
                !inline?.mimeType?.startsWith("audio/pcm") ||
                typeof inline.data !== "string"
              )
                continue;
              const context = probe.contexts.find(
                (item) => item.role === "telefun-output",
              )?.context;
              const audioTime = context?.currentTime ?? Number.NaN;
              if (holdFourth && !released && probe.pcmIngress.length === 3) {
                // Controlled receiver delivery only: keep packet and completion
                // order, then observe ingress immediately before product dispatch.
                // No CDP/Node round-trip occurs at this audio-clock deadline.
                holding = true;
                deferred.push(event.data);
                event.stopImmediatePropagation();
                const deadline = audioTime + 0.16;
                const flush = () => {
                  if (
                    context?.state === "running" &&
                    context.currentTime < deadline
                  ) {
                    setTimeout(flush, 2);
                    return;
                  }
                  released = true;
                  for (const data of deferred.splice(0))
                    this.dispatchEvent(new MessageEvent("message", { data }));
                };
                setTimeout(flush, 2);
                return;
              }
              const sampleRate = Number(
                /rate=(\d+)/.exec(inline.mimeType)?.[1],
              );
              probe.pcmIngress.push({
                audioTime,
                sampleRate,
                duration: atob(inline.data).length / 2 / sampleRate,
                contextState: context?.state ?? "missing",
              });
            }
          });
        }
      } as typeof WebSocket;
    };
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
      if ((window as any).__inputClockEvidence && role === "telefun-input") {
        const worklet = this.audioWorklet;
        const addModule = worklet.addModule.bind(worklet);
        worklet.addModule = async (url, options) => {
          if (url !== "/audio-input-processor.js")
            return addModule(url, options);
          const source = await (await fetch(url)).text();
          const marker = "this.port.postMessage(this.frame);";
          if (source.split(marker).length !== 2)
            throw new Error("unexpected worklet source");
          const instrumented = source.replace(
            marker,
            `this.port.postMessage({diagnosticInputFrame: true, endFrame: currentFrame + sourceOffset, audioTime: currentTime, sampleRate}); ${marker}`,
          );
          const blobUrl = URL.createObjectURL(
            new Blob([instrumented], { type: "application/javascript" }),
          );
          try {
            await addModule(blobUrl, options);
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        };
      }
      probe.contexts.push({
        context: this,
        role,
        requestedSampleRate: options?.sampleRate ?? null,
        actualSampleRate: this.sampleRate,
      });
      if (mode === "stream-jitter" && role === "telefun-output") {
        const moduleUrl = URL.createObjectURL(
          new Blob(
            [
              `
          class PlaybackRenderProbe extends AudioWorkletProcessor {
            constructor() {
              super();
              this.samples = new Float32Array(2048);
              this.frames = [];
              this.offset = 0;
            }
            process(inputs, outputs) {
              const size = outputs[0][0].length;
              const samples = inputs[0]?.[0] ?? new Float32Array(size);
              this.samples.set(samples, this.offset);
              this.frames.push(currentFrame);
              this.offset += size;
              if (this.offset === this.samples.length) {
                this.port.postMessage({ frames: this.frames, samples: this.samples });
                this.samples = new Float32Array(2048);
                this.frames = [];
                this.offset = 0;
              }
              return true;
            }
          }
          registerProcessor("playback-render-probe", PlaybackRenderProbe);
        `,
            ],
            { type: "application/javascript" },
          ),
        );
        probe.renderReady = this.audioWorklet
          .addModule(moduleUrl)
          .then(() => {
            const processor = new AudioWorkletNode(
              this,
              "playback-render-probe",
            );
            const sink = this.createGain();
            sink.gain.value = 0;
            processor.port.onmessage = ({ data }) => {
              probe.renderFrames.push(...data.frames);
              probe.renderedSamples.push(...data.samples);
            };
            processor.connect(sink);
            sink.connect(this.destination);
            probe.renderProcessor = processor;
            probe.renderSampleRate = this.sampleRate;
          })
          .finally(() => URL.revokeObjectURL(moduleUrl));
      }
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
    if (mode === "stream-jitter" && entry?.role === "telefun-output") {
      if (!probe.renderProcessor) throw new Error("render observer not ready");
      originalConnect.call(source, probe.renderProcessor);
      probe.sourceTiming.push({
        receivedAtAudioTime: this.context.currentTime,
        scheduledAudioTime: when,
        duration: source.buffer?.duration,
        sampleRate: source.buffer?.sampleRate,
      });
    }
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

export async function runCodecCalibration(page: Page) {
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

export async function saveJson(
  testInfo: TestInfo,
  name: string,
  value: unknown,
) {
  const outputPath = testInfo.outputPath(name);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(value, null, 2));
  return outputPath;
}

export async function decodeWebmMetrics(page: Page, body: Buffer) {
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
export const BAND_GATE = Object.freeze({
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

export function measureSourceAlignedBand(
  samples: Float32Array,
  sampleRate: number,
) {
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

export async function save10kDiagnostics(
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

export function getAudioPayload(message: Record<string, unknown>) {
  const input = message.realtimeInput as
    { audio?: { mimeType?: string; data?: string } } | undefined;
  return input?.audio;
}

export const INPUT_FRAME_SAMPLES = 4096;

export const INPUT_DRIFT_LIMIT_SECONDS = 0.4;

// Tolerance + one frame + 200 ms margin, rounded up to 100 ms.
export const INPUT_FAULT_STALL_MS =
  Math.ceil(
    (INPUT_DRIFT_LIMIT_SECONDS + INPUT_FRAME_SAMPLES / INPUT_RATE_HZ + 0.2) *
      10,
  ) * 100;

export const RECEIPT_OBSERVER_LAG_MS = 600;

export const PLAYBACK_LEAD_SECONDS = 0.24;

export const RENDER_SILENCE_LIMIT_SECONDS = 0.006;

export type InputFaultMode =
  "none" | "receipt-lag" | "drop-send" | "stall-send" | "stall-before-callback";

export interface InputReceipt {
  audio: { mimeType?: string; data?: string };
  atMs: number;
  arrivedMs: number;
  observerDelayed: boolean;
}

export interface InputClockEvidence {
  faultInjected?: string;
  dropOrdinal?: number;
  sendStall?: { startMs: number; endMs: number; ordinal: number };
  preCallbackStall?: { startMs: number; endMs: number; ordinal: number };
  errors?: string[];
  frames: Array<{
    endFrame: number;
    sampleRate: number;
    receivedMs: number;
    rawFloatBase64: string;
  }>;
  sends: Array<{
    atMs: number;
    frameIndex: number;
    audio: { mimeType?: string; data?: string };
  }>;
}

export function evaluateInputClock(
  evidence: InputClockEvidence,
  receipts: InputReceipt[],
) {
  const violations: Array<{
    rule: string;
    index?: number;
    value: unknown;
    limit?: number;
  }> = [];
  const reject = (
    rule: string,
    value: unknown,
    index?: number,
    limit?: number,
  ) => violations.push({ rule, index, value, limit });
  if (evidence.errors?.length) reject("probe-errors", evidence.errors);
  if (!evidence.frames.length || evidence.sends.length < 3)
    reject("missing-clock-evidence", {
      frames: evidence.frames.length,
      sends: evidence.sends.length,
    });
  if (receipts.length !== evidence.sends.length)
    reject("receipt-count", {
      sends: evidence.sends.length,
      receipts: receipts.length,
    });

  // Receipts must be an exact ordered subsequence. A deliberate lost packet
  // produces receipt-count, not cascading false payload mismatches afterwards.
  let receiptCursor = 0;
  for (const [index, receipt] of receipts.entries()) {
    const match = evidence.sends.findIndex(
      (send, ordinal) =>
        ordinal >= receiptCursor &&
        send.audio.mimeType === receipt.audio.mimeType &&
        send.audio.data === receipt.audio.data,
    );
    if (match < 0) reject("receipt-payload-order", index, index);
    else receiptCursor = match + 1;
  }
  let previousIndex = -1;
  let previousEndFrame = -1;
  const offsets: number[] = [];
  const processingDelays: number[] = [];
  const actualSendGaps: number[] = [];
  for (const [index, send] of evidence.sends.entries()) {
    if (send.audio.mimeType !== "audio/pcm;rate=16000")
      reject("mime-type", send.audio.mimeType, index);
    const frame = evidence.frames[send.frameIndex];
    if (
      !Number.isInteger(send.frameIndex) ||
      send.frameIndex < 0 ||
      !frame ||
      frame.sampleRate !== INPUT_RATE_HZ ||
      !Number.isInteger(frame.endFrame) ||
      !Number.isFinite(frame.receivedMs) ||
      !Number.isFinite(send.atMs)
    ) {
      reject("source-clock-metadata", send.frameIndex, index);
      continue;
    }
    const raw = Buffer.from(frame.rawFloatBase64, "base64");
    if (raw.length !== INPUT_FRAME_SAMPLES * 4)
      reject("source-frame-size", raw.length, index);
    else {
      const converted = Buffer.alloc(INPUT_FRAME_SAMPLES * 2);
      for (let sample = 0; sample < INPUT_FRAME_SAMPLES; sample += 1) {
        const value = raw.readFloatLE(sample * 4);
        if (!Number.isFinite(value))
          reject("source-nonfinite-sample", sample, index);
        converted.writeInt16LE(
          Math.trunc(Math.max(-1, Math.min(1, value)) * 32767),
          sample * 2,
        );
      }
      if (
        typeof send.audio.data !== "string" ||
        !Buffer.from(send.audio.data, "base64").equals(converted)
      )
        reject("source-payload", send.frameIndex, index);
    }
    if (index > 0) {
      if (send.frameIndex !== previousIndex + 1)
        reject("source-index-order", send.frameIndex, index);
      if (frame.endFrame - previousEndFrame !== INPUT_FRAME_SAMPLES)
        reject(
          "source-frame-continuity",
          frame.endFrame - previousEndFrame,
          index,
        );
      const gap = (send.atMs - evidence.sends[index - 1].atMs) / 1000;
      actualSendGaps.push(gap);
      if (gap < 0) reject("send-time-order", gap, index);
    }
    previousIndex = send.frameIndex;
    previousEndFrame = frame.endFrame;
    offsets.push(send.atMs / 1000 - frame.endFrame / INPUT_RATE_HZ);
    const processingDelay = (send.atMs - frame.receivedMs) / 1000;
    processingDelays.push(processingDelay);
    if (processingDelay < 0)
      reject("callback-time-order", processingDelay, index);
  }
  const offsetSpreadSeconds = offsets.length
    ? Math.max(...offsets) - Math.min(...offsets)
    : Number.POSITIVE_INFINITY;
  if (
    !Number.isFinite(offsetSpreadSeconds) ||
    offsetSpreadSeconds >= INPUT_DRIFT_LIMIT_SECONDS
  )
    reject(
      "offset-spread",
      offsetSpreadSeconds,
      undefined,
      INPUT_DRIFT_LIMIT_SECONDS,
    );
  const first = evidence.sends[0];
  const last = evidence.sends.at(-1);
  const firstFrame = first && evidence.frames[first.frameIndex];
  const lastFrame = last && evidence.frames[last.frameIndex];
  const sourceDurationSeconds =
    firstFrame && lastFrame
      ? (lastFrame.endFrame - firstFrame.endFrame + INPUT_FRAME_SAMPLES) /
        INPUT_RATE_HZ
      : 0;
  const payloadDurationSeconds =
    receipts.reduce(
      (sum, receipt) =>
        sum + Buffer.from(receipt.audio.data ?? "", "base64").length / 2,
      0,
    ) / INPUT_RATE_HZ;
  const browserSendDurationSeconds =
    first && last
      ? (last.atMs - first.atMs) / 1000 + INPUT_FRAME_SAMPLES / INPUT_RATE_HZ
      : 0;
  return {
    violations,
    sourceDurationSeconds,
    payloadDurationSeconds,
    browserSendDurationSeconds,
    offsetSpreadSeconds,
    offsetsSeconds: offsets,
    maxProcessingDelaySeconds: Math.max(0, ...processingDelays),
    maxActualSendGapSeconds: Math.max(0, ...actualSendGaps),
  };
}

export function assertInputFaultRealized(
  mode: InputFaultMode,
  evidence: InputClockEvidence,
  receipts: InputReceipt[],
) {
  const invalid = `INVALID-CONTROL ${mode}`;
  if (mode === "none") {
    expect(evidence.faultInjected, invalid).toBeUndefined();
    expect(
      receipts.every((item) => !item.observerDelayed),
      invalid,
    ).toBe(true);
    return { mode, realized: false };
  }
  if (mode === "receipt-lag") {
    expect(receipts.length, invalid).toBe(evidence.sends.length);
    expect(receipts.length, invalid).toBeGreaterThanOrEqual(3);
    expect(receipts[0].observerDelayed, invalid).toBe(false);
    const delayed = receipts.filter((item) => item.observerDelayed);
    expect(delayed.length, invalid).toBe(evidence.sends.length - 1);
    for (const receipt of delayed)
      expect(receipt.atMs - receipt.arrivedMs, invalid).toBeGreaterThanOrEqual(
        RECEIPT_OBSERVER_LAG_MS,
      );
    return { mode, realized: true, delayedReceipts: delayed.length };
  }
  expect(evidence.faultInjected, invalid).toBe(mode);
  if (mode === "drop-send") {
    expect(evidence.dropOrdinal, invalid).toBe(2);
    expect(receipts.length, invalid).toBe(evidence.sends.length - 1);
    return { mode, realized: true, ordinal: evidence.dropOrdinal };
  }
  const stall =
    mode === "stall-send" ? evidence.sendStall : evidence.preCallbackStall;
  expect(stall, invalid).toBeDefined();
  expect(stall!.ordinal, invalid).toBe(2);
  expect(stall!.endMs - stall!.startMs, invalid).toBeGreaterThanOrEqual(
    INPUT_FAULT_STALL_MS,
  );
  const recoveryIndex = evidence.sends.findIndex(
    (send) => send.atMs >= stall!.endMs,
  );
  expect(recoveryIndex, invalid).toBeGreaterThanOrEqual(
    mode === "stall-send" ? 2 : 3,
  );
  expect(recoveryIndex, invalid).toBeLessThanOrEqual(evidence.sends.length - 2);
  expect(evidence.sends[recoveryIndex - 1].atMs, invalid).toBeLessThanOrEqual(
    stall!.startMs,
  );
  const before = evidence.sends
    .slice(0, recoveryIndex)
    .map(
      (send) =>
        send.atMs / 1000 -
        evidence.frames[send.frameIndex].endFrame / INPUT_RATE_HZ,
    )
    .sort((a, b) => a - b);
  expect(Math.max(...before) - Math.min(...before), invalid).toBeLessThan(
    INPUT_DRIFT_LIMIT_SECONDS,
  );
  const baseline = before[Math.floor(before.length / 2)];
  const recoveryFrame =
    evidence.frames[evidence.sends[recoveryIndex].frameIndex];
  const predictedDelaySeconds =
    stall!.endMs / 1000 - (recoveryFrame.endFrame / INPUT_RATE_HZ + baseline);
  expect(predictedDelaySeconds, invalid).toBeGreaterThanOrEqual(
    INPUT_DRIFT_LIMIT_SECONDS,
  );
  return { mode, realized: true, stall, recoveryIndex, predictedDelaySeconds };
}

export function classifyJitterStimulus(
  arrivals: Array<{
    audioTime: number;
    duration: number;
    sampleRate: number;
    contextState: string;
  }>,
  renderRate: number,
) {
  if (
    arrivals.length !== 4 ||
    renderRate < AUDIO_RATE_HZ ||
    arrivals.some(
      (item) =>
        !Number.isFinite(item.audioTime) ||
        item.contextState !== "running" ||
        item.sampleRate !== AUDIO_RATE_HZ ||
        Math.abs(item.duration - 0.08) > 1e-5,
    )
  )
    return {
      classification: "INVALID-STIMULUS",
      reason: "count/rate/duration/clock",
      latenessSeconds: [],
      zeroLeadGapsSeconds: [],
    };
  let duration = 0;
  const latenessSeconds = arrivals.map((item) => {
    const late = item.audioTime - arrivals[0].audioTime - duration;
    duration += item.duration;
    return late;
  });
  // A fast earlier chunk can leave queued audio. Compare ingress with the
  // simulated queue end, not just the preceding packet's arrival + duration.
  let zeroLeadEnd = arrivals[0].audioTime + arrivals[0].duration;
  const zeroLeadGapsSeconds = arrivals.slice(1).map((item) => {
    const gap = item.audioTime - zeroLeadEnd;
    zeroLeadEnd = Math.max(item.audioTime, zeroLeadEnd) + item.duration;
    return gap;
  });
  const maximumLatenessSeconds = Math.max(...latenessSeconds);
  const maxAllowedLatenessSeconds = PLAYBACK_LEAD_SECONDS - 128 / renderRate;
  const classification =
    Math.max(...zeroLeadGapsSeconds) <= RENDER_SILENCE_LIMIT_SECONDS
      ? "INVALID-STIMULUS"
      : maximumLatenessSeconds > maxAllowedLatenessSeconds
        ? "OUT-OF-CONTRACT"
        : "VALID";
  return {
    classification,
    latenessSeconds,
    zeroLeadGapsSeconds,
    maximumLatenessSeconds,
    maxAllowedLatenessSeconds,
  };
}
