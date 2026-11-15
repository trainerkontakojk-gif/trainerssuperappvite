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
  createFakeMicWav,
  SESSION_ID,
  openTelefun,
  startRingingCall,
  prepareAudioCall,
  expectAudioResourcesReleased,
  pcmToneChunks,
  installAudioProbe,
  saveJson,
  decodeWebmMetrics,
  INPUT_RATE_HZ,
  endCall,
  rmsAtPcmFrequency,
  type FallbackInputBlock,
  getAudioPayload,
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
    // "Giliran Anda" may be the initial idle state before any model audio.
    // Wait for every fixture chunk and the output clock to finish its tail.
    await page.waitForFunction((count) => {
      const p = (window as any).__telefunAudioProbe;
      const output = p.contexts.find(
        (item: any) => item.role === "telefun-output",
      );
      const starts = p.sourceStarts.filter(
        (item: any) => item.role === "telefun-output",
      );
      const last = starts.at(-1);
      return (
        starts.length === count &&
        last &&
        output.context.currentTime >= last.when + last.duration
      );
    }, audioResponse.chunks.length);
    const preEnd = await page.evaluate(() => {
      const p = (window as any).__telefunAudioProbe;
      const output = p.contexts.find(
        (item: any) => item.role === "telefun-output",
      );
      return {
        currentTime: output?.context.currentTime,
        starts: p.sourceStarts.filter(
          (item: any) => item.role === "telefun-output",
        ),
      };
    });
    console.log("[missing-stop-pre-end]", JSON.stringify(preEnd));
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
});
