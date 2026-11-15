import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt } from "./helpers/sidakJadwalShiftingHarness";
import {
  mockRecordingUpload,
  mockTelefunVoiceServer,
  type CapturedTelefunRecordingUpload,
  type MockTelefunPcmResponse,
} from "./helpers/telefunFixtures";
import {
  AUDIO_RATE_HZ,
  INPUT_RATE_HZ,
  ALIAS_TONE_HZ,
  TAIL_MARKER_HZ,
  HIGH_TONE_MIN_CODEC_RETENTION,
  MAX_ALIAS_TO_HIGH_TONE_RATIO,
  SYNTHETIC_SECONDS,
  createFakeMicWav,
  SESSION_ID,
  openTelefun,
  startRingingCall,
  endCall,
  expectAudioResourcesReleased,
  pcmToneChunks,
  rmsAtPcmFrequency,
  type ContextSummary,
  type SourceConnectionSummary,
  type SourceStartSummary,
  type MicSourceSummary,
  type MicTrackSummary,
  installAudioProbe,
  runCodecCalibration,
  saveJson,
  decodeWebmMetrics,
  BAND_GATE,
  save10kDiagnostics,
  getAudioPayload,
  INPUT_FAULT_STALL_MS,
  RECEIPT_OBSERVER_LAG_MS,
  type InputFaultMode,
  type InputClockEvidence,
  evaluateInputClock,
  assertInputFaultRealized,
} from "./helpers/telefunAudioFidelityHarness";

const testResultsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../test-results",
);

mkdirSync(testResultsDir, { recursive: true });

const fixtureDir = mkdtempSync(path.join(testResultsDir, "telefun-audio-e2e-"));

const fakeMicWavPath = path.join(fixtureDir, "synthetic-440hz-16khz.wav");

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
  await assertLocalDevOnlyTargetAt(
    process.env.E2E_APP_ORIGIN ?? "http://localhost:3005",
  );
});

test.describe("Telefun audio signal fidelity (synthetic, hermetic)", () => {
  test.afterEach(async ({ page }) => {
    if (page.isClosed()) return;
    await page.evaluate(async () => {
      const probe = (window as any).__telefunAudioProbe;
      probe?.stopLateDiagnostic?.();
      if (probe?.lateDone) await probe.lateDone;
    });
  });

  test("real call graph preserves 24 kHz PCM above 8 kHz and isolates agent-only capture", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const clientMessages: Array<{
      message: Record<string, unknown>;
      atMs: number;
      arrivedMs: number;
      observerDelayed: boolean;
    }> = [];
    const inputFault = (process.env.E2E_INPUT_FAULT ??
      "none") as InputFaultMode;
    if (
      ![
        "none",
        "receipt-lag",
        "drop-send",
        "stall-send",
        "stall-before-callback",
      ].includes(inputFault)
    ) {
      throw new Error(`Unknown E2E_INPUT_FAULT: ${inputFault}`);
    }
    const receiptWaiters: Array<Promise<void>> = [];
    let audioReceiptCount = 0;
    const diagnosticSession =
      process.env.E2E_INPUT_DIAGNOSTIC === "1"
        ? await page.context().newCDPSession(page)
        : null;
    let profilingInput = false;
    await page.addInitScript(
      ({ fault, stallMs }) => {
        const evidence: any = {
          frames: [],
          sends: [],
          errors: [],
          longTasks: [],
          milestones: [],
        };
        (window as any).__inputClockEvidence = evidence;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (evidence.longTasks.length < 512)
              evidence.longTasks.push({
                startMs: entry.startTime,
                durationMs: entry.duration,
              });
          }
        });
        observer.observe({ type: "longtask", buffered: true });
        document.addEventListener(
          "click",
          () => {
            evidence.milestones.push({
              phase: "ui-click",
              atMs: performance.now(),
            });
          },
          true,
        );
        const NativeNode = window.AudioWorkletNode;
        window.AudioWorkletNode = class extends NativeNode {
          constructor(
            context: BaseAudioContext,
            name: string,
            options?: AudioWorkletNodeOptions,
          ) {
            super(context, name, options);
            if (name !== "telefun-audio-input-processor") return;
            let pending: any = null;
            this.port.addEventListener("message", (event) => {
              if (event.data?.diagnosticInputFrame) {
                pending = event.data;
                event.stopImmediatePropagation();
              } else if (event.data instanceof Float32Array) {
                const bytes = new Uint8Array(
                  event.data.buffer,
                  event.data.byteOffset,
                  event.data.byteLength,
                );
                let binary = "";
                for (const byte of bytes) binary += String.fromCharCode(byte);
                evidence.frames.push({
                  ...pending,
                  receivedMs: performance.now(),
                  wallMs: Date.now(),
                  rawFloatBase64: btoa(binary),
                });
                pending = null;
              }
            });
            const proto = window.WebSocket.prototype;
            const originalSend = proto.send;
            proto.send = function (data) {
              if (typeof data === "string") {
                try {
                  const audio = JSON.parse(data).realtimeInput?.audio;
                  if (audio?.data) {
                    const ordinal = evidence.sends.length;
                    if (fault === "stall-send" && ordinal === 2) {
                      const startMs = performance.now();
                      while (performance.now() - startMs < stallMs) {
                        /* controlled main-thread stall */
                      }
                      evidence.sendStall = {
                        startMs,
                        endMs: performance.now(),
                        ordinal,
                      };
                      evidence.faultInjected = fault;
                    }
                    evidence.sends.push({
                      atMs: performance.now(),
                      wallMs: Date.now(),
                      frameIndex: evidence.frames.length - 1,
                      audio,
                    });
                    if (fault === "drop-send" && ordinal === 2) {
                      evidence.dropOrdinal = ordinal;
                      evidence.faultInjected = fault;
                      return;
                    }
                    if (fault === "stall-before-callback" && ordinal === 2) {
                      setTimeout(() => {
                        const startMs = performance.now();
                        while (performance.now() - startMs < stallMs) {
                          /* source Worklet continues on its own thread */
                        }
                        evidence.preCallbackStall = {
                          startMs,
                          endMs: performance.now(),
                          ordinal,
                        };
                        evidence.faultInjected = fault;
                      }, 32);
                    }
                  }
                } catch (error) {
                  evidence.errors.push(String(error));
                }
              }
              return originalSend.call(this, data);
            };
          }
        } as typeof AudioWorkletNode;
      },
      { fault: inputFault, stallMs: INPUT_FAULT_STALL_MS },
    );
    try {
      const calibration = await runCodecCalibration(page);
      const positiveControl = calibration.direct.metrics;
      expect(positiveControl.high10kRms).not.toBeNull();
      expect(positiveControl.high10kRms!).toBeGreaterThan(0.03);

      await page.addInitScript(installAudioProbe, {
        mode: "delayed-full-stop",
        diagnostic10k: true,
      });
      const pcmResponse: MockTelefunPcmResponse = {
        sampleRateHz: AUDIO_RATE_HZ,
        chunks: pcmToneChunks(),
        transport: "inline",
        afterFirstInput: true,
      };
      await mockTelefunVoiceServer(page, SESSION_ID, [], {
        audioResponse: pcmResponse,
        onClientMessage: (message) => {
          const arrivedMs = performance.now();
          const observerDelayed =
            Boolean(getAudioPayload(message)) &&
            audioReceiptCount++ > 0 &&
            inputFault === "receipt-lag";
          const observe = () =>
            clientMessages.push({
              message,
              arrivedMs,
              atMs: performance.now(),
              observerDelayed,
            });
          if (observerDelayed) {
            receiptWaiters.push(
              new Promise<void>((resolve) => {
                const observeAfterDeadline = () => {
                  const remaining =
                    RECEIPT_OBSERVER_LAG_MS - (performance.now() - arrivedMs);
                  if (remaining > 0) {
                    setTimeout(observeAfterDeadline, Math.ceil(remaining));
                    return;
                  }
                  observe();
                  resolve();
                };
                setTimeout(observeAfterDeadline, RECEIPT_OBSERVER_LAG_MS);
              }),
            );
          } else observe();
        },
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
      if (diagnosticSession) {
        await diagnosticSession.send("Profiler.enable");
        await diagnosticSession.send("Profiler.start");
        profilingInput = true;
      }
      const call = await startRingingCall(page);
      await expect(call.getByRole("status").first()).toHaveText(
        "Konsumen berbicara",
        { timeout: 20_000 },
      );

      await expect
        .poll(
          () =>
            page.evaluate(
              () => (window as any).__inputClockEvidence.sends.length,
            ),
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
              entry.role === "telefun-output" &&
              entry.context.state !== "closed",
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
          const drainStartedMs = performance.now();
          const deadline = drainStartedMs + 5_000;
          const iterationTiming: Array<{
            startMs: number;
            endMs: number;
            durationMs: number;
          }> = [];
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
            const iterationStartMs = performance.now();
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
            const iterationEndMs = performance.now();
            iterationTiming.push({
              startMs: iterationStartMs,
              endMs: iterationEndMs,
              durationMs: iterationEndMs - iterationStartMs,
            });
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          return {
            drainStartedMs,
            drainEndedMs: performance.now(),
            iterationTiming,
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
      await expect(call.getByRole("status").first()).toHaveText(
        "Giliran Anda",
        {
          timeout: 5_000,
        },
      );
      if (
        inputFault === "stall-send" ||
        inputFault === "stall-before-callback"
      ) {
        // The perturbation must finish with a subsequent evaluated source send.
        await page.waitForFunction(() => {
          const e = (window as any).__inputClockEvidence;
          const stall = e.sendStall ?? e.preCallbackStall;
          return (
            stall &&
            e.sends.filter((send: any) => send.atMs >= stall.endMs).length >= 2
          );
        });
      }
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
      if (diagnosticSession && profilingInput) {
        const profile = await diagnosticSession.send("Profiler.stop");
        profilingInput = false;
        await saveJson(testInfo, "input-cpu-profile.json", profile);
      }
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
      expect(
        agentUpload,
        "agent-only recording body was uploaded",
      ).toBeDefined();
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
      await Promise.all(receiptWaiters);
      const inputPackets = clientMessages
        .map(({ message, atMs, arrivedMs, observerDelayed }) => ({
          audio: getAudioPayload(message),
          atMs,
          arrivedMs,
          observerDelayed,
        }))
        .filter(
          (
            entry,
          ): entry is {
            audio: NonNullable<ReturnType<typeof getAudioPayload>>;
            atMs: number;
            arrivedMs: number;
            observerDelayed: boolean;
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
      const browserInputEvidence = await page.evaluate<InputClockEvidence>(
        () => (window as any).__inputClockEvidence,
      );
      const inputClock = evaluateInputClock(browserInputEvidence, inputPackets);
      await saveJson(testInfo, "input-clock-integrity.json", {
        ...inputClock,
        receiptObserverDurationSeconds: providerObservedSeconds,
        receiptObserverErrorSeconds:
          providerObservedSeconds - providerDurationSeconds,
        fault: inputFault,
        evidence: browserInputEvidence,
        receipts: inputPackets,
        playbackDrainTiming: playbackDrain.iterationTiming,
      });
      const realizedControl = assertInputFaultRealized(
        inputFault,
        browserInputEvidence,
        inputPackets,
      );
      const expectedRules: Record<InputFaultMode, string[]> = {
        none: [],
        "receipt-lag": [],
        "drop-send": ["receipt-count"],
        "stall-send": ["offset-spread"],
        "stall-before-callback": ["offset-spread"],
      };
      const actualRules = [
        ...new Set(inputClock.violations.map((item) => item.rule)),
      ].sort();
      await saveJson(testInfo, "input-control-verdict.json", {
        realizedControl,
        actualRules,
        expectedRules: expectedRules[inputFault],
        offsetSpreadSeconds: inputClock.offsetSpreadSeconds,
      });
      console.log(
        "[input-clock-control]",
        JSON.stringify({
          inputFault,
          realizedControl,
          actualRules,
          offsetSpreadSeconds: inputClock.offsetSpreadSeconds,
        }),
      );
      expect(
        actualRules,
        `unexpected input integrity violation(s): ${JSON.stringify(inputClock.violations)}`,
      ).toEqual(expectedRules[inputFault]);
      const captureTypes = uploads.map((upload) =>
        upload.path.split("/").at(-1),
      );
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
          uploadRequestContentTypes: uploads.map(
            (upload) => upload.contentType,
          ),
          uploadFileContentTypes: uploads.map(
            (upload) => upload.fileContentType,
          ),
          uploadTypes: captureTypes,
        },
        controls: {
          directCodecHigh10kRms: positiveControl.high10kRms,
          matchedFullMixHigh10kRms: matchedControl.high10kRms,
          matchedFullMixRetentionVsDirectControl:
            matchedControlHighToneRetention,
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
      // Node receipt callback time includes Playwright/observer scheduling.
      // The unchanged 0.4 s limits are enforced above against the independent
      // Worklet clock and actual browser sends, with exact end-to-end payloads.
      // Keep receipt span as diagnostic rather than confusing it with sample rate.
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
      expect(speakerAliasRatio).toBeLessThanOrEqual(
        MAX_ALIAS_TO_HIGH_TONE_RATIO,
      );
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
    } finally {
      if (diagnosticSession) {
        if (profilingInput) {
          const profile = await diagnosticSession
            .send("Profiler.stop")
            .catch(() => null);
          if (profile)
            await saveJson(testInfo, "input-cpu-profile.json", profile);
        }
        await diagnosticSession.detach();
      }
      const browser = await page
        .evaluate(() => (window as any).__inputClockEvidence ?? null)
        .catch(() => null);
      await saveJson(testInfo, "input-clock-evidence.json", {
        browser,
        receipts: clientMessages,
      });
    }
  });
});
