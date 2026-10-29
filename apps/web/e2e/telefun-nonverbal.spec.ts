import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  openHermeticShell,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  mockTelefunAvatar,
  mockTelefunVoiceServer,
  telefunMocks,
} from "./helpers/telefunFixtures";

const SESSION_ID = "telefun-nonverbal-1";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  },
  permissions: ["microphone"],
});

function callMocks(settings: unknown = {}) {
  return [
    ...telefunMocks([], settings),
    {
      method: "POST" as const,
      path: "/api/v1/telefun/sessions",
      body: {
        success: true,
        data: { id: SESSION_ID, simulationSubject: null },
      },
    },
    {
      method: "GET" as const,
      path: "/api/v1/ai/usage/summary",
      body: { success: true, data: null },
    },
  ];
}

async function openTelefun(page: Page, settings: unknown = {}) {
  return openHermeticShell(page, {
    path: "/telefun",
    apiMocks: callMocks(settings),
    waitForUrl: /\/telefun/,
    beforeNavigate: (target) => mockTelefunAvatar(target),
  });
}

async function startCall(page: Page) {
  await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
  const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
  const start = picker.getByRole("button", { name: "Mulai panggilan" });
  await expect(start).toBeEnabled({ timeout: 15000 });
  await start.click();
  return page.getByRole("region", { name: "Panggilan" });
}

function installPlaybackProbe() {
  const destinations: MediaStreamAudioDestinationNode[] = [];
  const sources: Array<{
    duration: number;
    samples: number;
    sampleRate: number;
    recordingDestinations: number[];
  }> = [];
  const destinationIndexes = new WeakMap<AudioNode, number>();
  const sourceDestinations = new WeakMap<AudioBufferSourceNode, number[]>();
  (window as any).__telefunPlaybackProbe = { destinations, sources };

  const originalCreateDestination =
    AudioContext.prototype.createMediaStreamDestination;
  AudioContext.prototype.createMediaStreamDestination = function () {
    const destination = originalCreateDestination.call(this);
    destinationIndexes.set(destination, destinations.length);
    destinations.push(destination);
    return destination;
  };

  const originalConnect = AudioBufferSourceNode.prototype.connect;
  (AudioBufferSourceNode.prototype as any).connect = function (
    destination: AudioNode,
    ...args: unknown[]
  ) {
    const index = destinationIndexes.get(destination);
    if (index !== undefined) {
      const connected = sourceDestinations.get(this) ?? [];
      connected.push(index);
      sourceDestinations.set(this, connected);
    }
    return (originalConnect as any).call(this, destination, ...args);
  };

  const originalStart = AudioBufferSourceNode.prototype.start;
  (AudioBufferSourceNode.prototype as any).start = function (
    ...args: unknown[]
  ) {
    sources.push({
      duration: this.buffer?.duration ?? 0,
      samples: this.buffer?.length ?? 0,
      sampleRate: this.buffer?.sampleRate ?? 0,
      recordingDestinations: [...(sourceDestinations.get(this) ?? [])],
    });
    return (originalStart as any).apply(this, args);
  };
}

function mockPcmResponse() {
  return {
    sampleRateHz: 24000,
    chunks: [new Uint8Array(4800 * 2)],
    transport: "inline" as const,
    afterFirstInput: true,
  };
}

const angryFemaleSettings = {
  preferredConsumerTypeId: "marah",
  identitySettings: {
    displayName: "Sari Wulandari",
    gender: "female",
    phoneNumber: "0812-1111-2222",
    city: "Jakarta",
    signatureName: "",
    voiceName: "",
  },
};

test.describe("Telefun klip nonverbal (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("klip marah dijadwalkan sebelum audio konsumen dan masuk rekaman penuh", async ({
    page,
  }) => {
    await page.addInitScript(installPlaybackProbe);
    await mockTelefunVoiceServer(page, SESSION_ID, [], {
      audioResponse: mockPcmResponse(),
    });
    const audit = await openTelefun(page, angryFemaleSettings);
    const clipRequest = page.waitForRequest(
      /\/telefun\/nonverbal\/kore\/exhale-1\.wav$/,
    );
    await startCall(page);
    await clipRequest;
    await page.waitForFunction(() => {
      const sources = (window as any).__telefunPlaybackProbe?.sources ?? [];
      return sources.length >= 2;
    });

    const sources = await page.evaluate(
      () => (window as any).__telefunPlaybackProbe.sources,
    );
    expect(sources[0].duration).toBeGreaterThan(sources[1].duration + 0.3);
    expect(sources[0].recordingDestinations).toContain(0);
    expect(sources[0].recordingDestinations).not.toContain(1);
    expectHermetic(audit);
  });

  test("audio konsumen yang tiba saat hold tidak menjadwalkan klip", async ({
    page,
  }) => {
    await page.addInitScript(installPlaybackProbe);
    let releaseResponse: () => void = () => {};
    let notifyPaused: () => void = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const responsePaused = new Promise<void>((resolve) => {
      notifyPaused = resolve;
    });
    await mockTelefunVoiceServer(page, SESSION_ID, [], {
      audioResponse: mockPcmResponse(),
      beforeAudioResponse: async () => {
        notifyPaused();
        await responseGate;
      },
    });
    const audit = await openTelefun(page, angryFemaleSettings);
    const clipRequest = page.waitForRequest(
      /\/telefun\/nonverbal\/kore\/exhale-1\.wav$/,
    );
    const call = await startCall(page);
    await responsePaused;
    await clipRequest;
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda");
    await call.getByRole("button", { name: "Tahan", exact: true }).click();
    await expect(call.getByText("Panggilan ditahan")).toBeVisible();
    releaseResponse();
    await page.waitForTimeout(100);

    const sources = await page.evaluate(
      () => (window as any).__telefunPlaybackProbe.sources,
    );
    expect(sources).toEqual([]);
    expectHermetic(audit);
  });

  test("klip gagal dimuat: audio konsumen tetap berjalan tanpa dialog error", async ({
    page,
  }) => {
    await page.addInitScript(installPlaybackProbe);
    await mockTelefunVoiceServer(page, SESSION_ID, [], {
      audioResponse: mockPcmResponse(),
    });
    const audit = await openTelefun(page, angryFemaleSettings);
    let failedClipRequests = 0;
    await page.route("**/telefun/nonverbal/**", async (route) => {
      failedClipRequests += 1;
      await route.fulfill({ status: 404, body: "missing" });
    });
    const call = await startCall(page);
    await expect.poll(() => failedClipRequests).toBeGreaterThan(0);
    await page.waitForFunction(() => {
      const sources = (window as any).__telefunPlaybackProbe?.sources ?? [];
      return sources.some((source: { duration: number }) => source.duration > 0);
    });
    await expect(call.getByRole("alert")).toHaveCount(0);

    const sources = await page.evaluate(
      () => (window as any).__telefunPlaybackProbe.sources,
    );
    expect(sources).toHaveLength(1);
    expect(sources[0].duration).toBeLessThan(0.3);
    expectHermetic(audit);
  });

  test("tipe ramah tidak memuat klip nonverbal", async ({ page }) => {
    await mockTelefunVoiceServer(page, SESSION_ID);
    const audit = await openTelefun(page, { preferredConsumerTypeId: "ramah" });
    let clipRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/telefun/nonverbal/")) clipRequests += 1;
    });
    const call = await startCall(page);
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 20000,
    });
    await page.waitForTimeout(100);

    expect(clipRequests).toBe(0);
    expectHermetic(audit);
  });
});
