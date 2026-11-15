import { expect, test } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectHermetic, waitForMockedApi } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt } from "./helpers/sidakJadwalShiftingHarness";
import {
  mockRecordingUpload,
  mockTelefunVoiceServer,
  type CapturedTelefunRecordingUpload,
} from "./helpers/telefunFixtures";
import {
  INPUT_RATE_HZ,
  createFakeMicWav,
  SESSION_ID,
  openTelefun,
  startRingingCall,
  endCall,
  prepareAudioCall,
  measureAudioTaps,
  expectAudioResourcesReleased,
  installDelayedSocketOpenProbe,
  installAudioProbe,
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
