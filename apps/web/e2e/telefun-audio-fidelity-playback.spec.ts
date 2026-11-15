import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt } from "./helpers/sidakJadwalShiftingHarness";
import { measureRenderedFrequency } from "./helpers/telefunAudioRender";
import {
  mockRecordingUpload,
  mockTelefunVoiceServer,
  type MockTelefunPcmResponse,
} from "./helpers/telefunFixtures";
import {
  AUDIO_RATE_HZ,
  LOW_TONE_HZ,
  HIGH_TONE_HZ,
  TAIL_MARKER_HZ,
  HIGH_TONE_MIN_CODEC_RETENTION,
  MAX_ALIAS_TO_HIGH_TONE_RATIO,
  SYNTHETIC_SECONDS,
  SYNTHETIC_BITRATE,
  createFakeMicWav,
  SESSION_ID,
  openTelefun,
  startRingingCall,
  endCall,
  prepareAudioCall,
  measureAudioTaps,
  expectAudioResourcesReleased,
  pcmToneChunks,
  installAudioProbe,
  runCodecCalibration,
  saveJson,
  BAND_GATE,
  save10kDiagnostics,
  getAudioPayload,
  PLAYBACK_LEAD_SECONDS,
  RENDER_SILENCE_LIMIT_SECONDS,
  classifyJitterStimulus,
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
  test("consecutive completed turns preserve ordered rendered audio during initial lead", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    await page.addInitScript(installAudioProbe, { mode: "stream-jitter" });
    const chunks = [500, 1000].map((frequency) => {
      const bytes = Buffer.alloc(AUDIO_RATE_HZ * 0.12 * 2);
      for (let i = 0; i < bytes.length / 2; i += 1) {
        bytes.writeInt16LE(
          Math.round(
            0.24 *
              32767 *
              Math.sin((2 * Math.PI * frequency * i) / AUDIO_RATE_HZ),
          ),
          i * 2,
        );
      }
      return bytes;
    });
    await mockTelefunVoiceServer(page, SESSION_ID, [], {
      audioResponse: {
        sampleRateHz: AUDIO_RATE_HZ,
        chunks,
        transport: "inline",
        afterFirstInput: true,
        completeEachChunk: true,
      },
      beforeAudioResponse: () =>
        page.evaluate(async () => {
          await (window as any).__telefunAudioProbe.renderReady;
        }),
    });
    const audit = await openTelefun(page);
    await page.evaluate(() =>
      (window as any).__telefunAudioProbe.installPcmIngress(),
    );
    await mockRecordingUpload(page);
    const call = await startRingingCall(page);
    await page.waitForFunction(() => {
      const p = (window as any).__telefunAudioProbe;
      const output = p.contexts.find(
        (item: any) => item.role === "telefun-output",
      );
      const starts = p.sourceStarts.filter(
        (item: any) => item.role === "telefun-output",
      );
      return (
        starts.length === 2 &&
        output.context.currentTime > starts[1].when + starts[1].duration + 0.15
      );
    });
    const captured = await page.evaluate(() => {
      const p = (window as any).__telefunAudioProbe;
      return {
        samples: p.renderedSamples as number[],
        frames: p.renderFrames as number[],
        rate: p.renderSampleRate as number,
        starts: p.sourceStarts.filter(
          (item: any) => item.role === "telefun-output",
        ),
        arrivals: p.sourceTiming,
        stops: p.sourceStops,
      };
    });
    // Measure the central 80 ms of each scheduled source on the render thread.
    const tone = (start: number, frequency: number) =>
      measureRenderedFrequency(captured, frequency, start + 0.02, start + 0.1);
    const measurements = captured.starts.map((s: { when: number }) => [
      tone(s.when, 500),
      tone(s.when, 1000),
    ]);
    await saveJson(testInfo, "consecutive-turn-render.json", {
      ...captured,
      samples: undefined,
      measurements,
    });
    console.log(
      "[consecutive-turn-render]",
      JSON.stringify({
        starts: captured.starts,
        arrivals: captured.arrivals,
        stops: captured.stops,
        measurements,
      }),
    );
    expectHermetic(audit);
    expect(captured.arrivals[1].receivedAtAudioTime).toBeLessThan(
      captured.starts[0].when,
    );
    expect(measurements[0][0].count).toBeGreaterThan(captured.rate * 0.079);
    expect(measurements[1][1].count).toBeGreaterThan(captured.rate * 0.079);
    expect(
      measurements[0][0].rms,
      "first completed turn must render",
    ).toBeGreaterThan(0.1);
    expect(measurements[0][1].rms).toBeLessThan(0.02);
    expect(
      measurements[1][1].rms,
      "second completed turn must render after first",
    ).toBeGreaterThan(0.1);
    expect(measurements[1][0].rms).toBeLessThan(0.02);
    await endCall(page, call);
  });

  test("live playback preserves rendered continuity across modest PCM delivery jitter", async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
    const frontLoadedControl =
      process.env.E2E_JITTER_STIMULUS === "front-loaded";
    await page.addInitScript(installAudioProbe, { mode: "stream-jitter" });
    const samplesPerChunk = Math.round(AUDIO_RATE_HZ * 0.08);
    const chunks = Array.from({ length: 4 }, (_, chunkIndex) => {
      const bytes = Buffer.alloc(samplesPerChunk * 2);
      for (let i = 0; i < samplesPerChunk; i += 1) {
        const phase =
          (2 * Math.PI * 500 * (chunkIndex * samplesPerChunk + i)) /
          AUDIO_RATE_HZ;
        bytes.writeInt16LE(Math.round(0.24 * 32767 * Math.sin(phase)), i * 2);
      }
      return bytes;
    });
    await mockTelefunVoiceServer(page, SESSION_ID, [], {
      audioResponse: {
        sampleRateHz: AUDIO_RATE_HZ,
        chunks,
        transport: "inline",
        afterFirstInput: true,
        chunkIntervalMs: frontLoadedControl ? 0 : 100,
      },
      beforeAudioResponse: () =>
        page.evaluate(async () => {
          await (window as any).__telefunAudioProbe.renderReady;
        }),
    });
    const audit = await openTelefun(page);
    // Playwright socket mocking may replace WebSocket after init scripts.
    // Normal mode is read-only ingress observation. The negative control holds
    // receiver delivery locally; it does not claim to reproduce network jitter.
    await page.evaluate(
      (hold) => (window as any).__telefunAudioProbe.installPcmIngress(hold),
      frontLoadedControl,
    );
    await mockRecordingUpload(page);
    const call = await startRingingCall(page);
    // startRingingCall returns while ringing; only evaluate playback readiness
    // after the user-facing connection transition has actually completed.
    await expect(call.getByText("Tersambung", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as any).__telefunAudioProbe.sourceStarts.filter(
              (item: any) => item.role === "telefun-output",
            ).length,
        ),
      )
      .toBe(chunks.length);
    await page.waitForFunction(() => {
      const probe = (window as any).__telefunAudioProbe;
      const output = probe.contexts.find(
        (item: any) => item.role === "telefun-output",
      );
      const starts = probe.sourceStarts.filter(
        (item: any) => item.role === "telefun-output",
      );
      const last = starts.at(-1);
      return (
        last && output.context.currentTime > last.when + last.duration + 0.15
      );
    });
    const captured = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        sampleRate: probe.renderSampleRate as number,
        samples: probe.renderedSamples as number[],
        frames: probe.renderFrames as number[],
        arrivals: probe.sourceTiming,
        ingress: probe.pcmIngress,
        speakerConnections: probe.sourceConnections.filter(
          (item: any) =>
            item.role === "telefun-output" && item.destination === "speaker",
        ),
        starts: probe.sourceStarts.filter(
          (item: any) => item.role === "telefun-output",
        ) as Array<{ when: number; duration: number }>,
      };
    });
    const first = captured.samples.findIndex(
      (value) => Math.abs(value) > 0.001,
    );
    const last = captured.samples.findLastIndex(
      (value) => Math.abs(value) > 0.001,
    );
    let silentRun = 0;
    let maxSilentRun = 0;
    let peak = 0;
    for (let i = first; i <= last && first >= 0; i += 1) {
      const absolute = Math.abs(captured.samples[i]);
      peak = Math.max(peak, absolute);
      silentRun = absolute < 0.001 ? silentRun + 1 : 0;
      maxSilentRun = Math.max(maxSilentRun, silentRun);
    }
    const scheduleGaps = captured.starts
      .slice(1)
      .map(
        (item, index) =>
          item.when -
          (captured.starts[index].when + captured.starts[index].duration),
      );
    const metrics = {
      label: frontLoadedControl
        ? "synthetic front-loaded non-discriminating control; no provider call"
        : "synthetic 500 Hz phase-continuous PCM, 80 ms chunks spaced 100 ms; no provider call",
      renderedSampleRate: captured.sampleRate,
      renderedSamples: captured.samples.length,
      firstSignalSample: first,
      lastSignalSample: last,
      peak,
      scheduleGapsSeconds: scheduleGaps,
      arrivals: captured.arrivals,
      ingress: captured.ingress,
      stimulus: classifyJitterStimulus(captured.ingress, captured.sampleRate),
      maxRenderedSilenceSeconds: maxSilentRun / captured.sampleRate,
      observerMissingBlocks: captured.frames
        .slice(1)
        .filter((frame, index) => frame - captured.frames[index] !== 128)
        .length,
      observerMissingSignalBlocks: captured.frames
        .slice(Math.floor(first / 128) + 1, Math.floor(last / 128) + 1)
        .filter(
          (frame, index) =>
            frame - captured.frames[Math.floor(first / 128) + index] !== 128,
        ).length,
    };
    await saveJson(testInfo, "live-playback-jitter.json", metrics);
    await writeFile(
      testInfo.outputPath("rendered-speaker.f32"),
      Buffer.from(new Float32Array(captured.samples).buffer),
    );
    await writeFile(
      testInfo.outputPath("source-24khz.pcm"),
      Buffer.concat(chunks),
    );
    console.log("[telefun-playback-jitter]", JSON.stringify(metrics));
    expectHermetic(audit);
    expect(captured.arrivals).toHaveLength(4);
    expect(captured.speakerConnections).toHaveLength(4);
    for (const arrival of captured.arrivals) {
      expect(arrival.sampleRate).toBe(24_000);
      expect(arrival.duration).toBeCloseTo(0.08, 5);
    }
    if (frontLoadedControl) {
      expect(
        metrics.stimulus.maximumLatenessSeconds,
        "INVALID-CONTROL: every chunk must arrive before the zero-lead queue drains",
      ).toBe(0);
      expect(
        captured.ingress[3].audioTime - captured.ingress[2].audioTime - 0.08,
        "INVALID-CONTROL: adjacent-arrival oracle must report a false hole",
      ).toBeGreaterThan(RENDER_SILENCE_LIMIT_SECONDS);
    }
    expect(
      metrics.stimulus.classification,
      `${metrics.stimulus.classification}: ${JSON.stringify(metrics.stimulus)}`,
    ).toBe(frontLoadedControl ? "INVALID-STIMULUS" : "VALID");
    const quantumSeconds = 128 / captured.sampleRate;
    for (let index = 0; index < captured.ingress.length; index += 1) {
      expect(
        captured.arrivals[index].receivedAtAudioTime,
        "scheduler observation follows actual browser PCM ingress",
      ).toBeGreaterThanOrEqual(captured.ingress[index].audioTime);
    }
    // Scheduler reads currentTime between ingress and source.start observation.
    // Use that measured interval, not equality across different clock reads.
    expect(
      captured.starts[0].when,
      "PRODUCT FAILURE: initial playback lead missing",
    ).toBeGreaterThanOrEqual(
      captured.ingress[0].audioTime + PLAYBACK_LEAD_SECONDS - quantumSeconds,
    );
    expect(
      captured.starts[0].when,
      "PRODUCT FAILURE: unexplained initial playback delay",
    ).toBeLessThanOrEqual(
      captured.arrivals[0].receivedAtAudioTime +
        PLAYBACK_LEAD_SECONDS +
        quantumSeconds,
    );
    expect(
      first,
      "parallel audio-thread render contains the injected tone",
    ).toBeGreaterThanOrEqual(0);
    expect(captured.sampleRate).toBeGreaterThanOrEqual(24_000);
    expect(peak).toBeGreaterThan(0.2);
    expect(peak).toBeLessThan(0.3);
    expect(
      metrics.observerMissingSignalBlocks,
      "audio-thread observer cannot drop render quanta inside the utterance",
    ).toBe(0);
    expect(
      Math.abs((last - first + 1) / captured.sampleRate - 0.32),
      "complete utterance captured by the audio thread",
    ).toBeLessThan(0.004);
    expect(
      metrics.maxRenderedSilenceSeconds,
      "short transport jitter must not create audible holes inside the utterance",
    ).toBeLessThan(0.006);
    expect(
      Math.max(...scheduleGaps.map(Math.abs)),
      "scheduled PCM chunks stay adjacent",
    ).toBeLessThan(0.001);
    await endCall(page, call);
  });

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
      "stream-jitter",
      initialResponse,
      {
        audioResponseAfterText: followupResponse,
        beforeAudioResponse: () =>
          page.evaluate(async () => {
            await (window as any).__telefunAudioProbe.renderReady;
          }),
      },
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
    // Source.start() schedules playback; a main-thread analyser can miss the
    // entire 400 ms response under load. Inspect its audio-thread render instead.
    await page.waitForFunction((initialCount) => {
      const probe = (window as any).__telefunAudioProbe;
      const starts = probe.sourceStarts.filter(
        (entry: any) => entry.role === "telefun-output",
      );
      const last = starts.at(-1);
      const lastFrame = probe.renderFrames.at(-1);
      return (
        starts.length > initialCount &&
        last &&
        typeof lastFrame === "number" &&
        lastFrame + 128 >= (last.when + last.duration) * probe.renderSampleRate
      );
    }, initialResponse.chunks.length);
    const resumed = await page.evaluate(() => {
      const probe = (window as any).__telefunAudioProbe;
      return {
        rate: probe.renderSampleRate as number,
        frames: probe.renderFrames as number[],
        samples: probe.renderedSamples as number[],
        lastStart: probe.sourceStarts
          .filter((entry: any) => entry.role === "telefun-output")
          .at(-1) as { when: number; duration: number },
        speakerConnections: probe.sourceConnections.filter(
          (entry: any) =>
            entry.role === "telefun-output" && entry.destination === "speaker",
        ).length as number,
      };
    });
    expect(resumed.speakerConnections).toBeGreaterThan(initialStarts);
    const signal = measureRenderedFrequency(
      resumed,
      TAIL_MARKER_HZ,
      resumed.lastStart.when + 0.1,
      resumed.lastStart.when + 0.3,
    );
    expect(
      signal.count,
      "complete post-hold observation window",
    ).toBeGreaterThan(resumed.rate * 0.195);
    expect(signal.rms).toBeGreaterThan(0.02);
    await endCall(page, call);
    await expectAudioResourcesReleased(page);
    expectHermetic(audit);
  });
});
