import { expect, test, type Page } from "@playwright/test";
import { expectHermetic, openHermeticShell } from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  mockTelefunVoiceServer,
  telefunMocks,
} from "./helpers/telefunFixtures";

// Real Chromium fake streams still drive the meter/recorder; only device identity
// and constraints are shimmed. No microphone hardware or provider is contacted.
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

interface MicHarness {
  calls: Array<boolean | MediaTrackConstraints | undefined>;
  enumerations: number;
  devices: string[];
  failCall: boolean;
  failCheck: boolean;
  callStartIndex: number;
}

declare global {
  interface Window {
    telefunMicHarness: MicHarness;
  }
}

const SESSION_ID = "telefun-mic-device-1";
const MISSING_MESSAGE =
  "Mikrofon yang dipilih tidak tersedia. Periksa headset atau pilih mikrofon lain, lalu coba lagi.";

async function open(page: Page, devices = ["laptop-mic", "jabra-mic"]) {
  await page.addInitScript((deviceIds) => {
    const harness: MicHarness = {
      calls: [],
      enumerations: 0,
      devices: deviceIds,
      failCall: false,
      failCheck: false,
      callStartIndex: 0,
    };
    window.telefunMicHarness = harness;
    const media = navigator.mediaDevices;
    const original = media.getUserMedia.bind(media);
    const labels: Record<string, string> = {
      "laptop-mic": "Mikrofon Laptop",
      "jabra-mic": "Jabra Evolve2",
    };
    media.enumerateDevices = async () => {
      harness.enumerations++;
      return harness.devices.map((deviceId) => ({
        deviceId,
        kind: "audioinput" as const,
        groupId: deviceId,
        label: labels[deviceId],
        toJSON: () => ({}),
      }));
    };
    media.getUserMedia = async (constraints) => {
      const audio = constraints?.audio;
      harness.calls.push(audio);
      const exact =
        typeof audio === "object" &&
        typeof audio.deviceId === "object" &&
        !Array.isArray(audio.deviceId)
          ? audio.deviceId.exact
          : undefined;
      const deviceId = typeof exact === "string" ? exact : "laptop-mic";
      // Simulate unplugging during a check or only once the picker has closed.
      if (
        deviceId === "jabra-mic" &&
        (harness.failCheck ||
          (harness.failCall && !document.querySelector('[role="dialog"]')))
      ) {
        throw new DOMException("Headset unplugged", "OverconstrainedError");
      }
      const stream = await original({ audio: true });
      for (const track of stream.getAudioTracks()) {
        const settings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...settings(), deviceId });
        Object.defineProperty(track, "label", { value: labels[deviceId] });
      }
      return stream;
    };
  }, devices);
  const messages: Record<string, unknown>[] = [];
  await mockTelefunVoiceServer(page, SESSION_ID, messages);
  const audit = await openHermeticShell(page, {
    path: "/telefun",
    apiMocks: [
      ...telefunMocks([]),
      {
        method: "POST",
        path: "/api/v1/telefun/sessions",
        body: {
          success: true,
          data: { id: SESSION_ID, simulationSubject: null },
        },
      },
      {
        method: "GET",
        path: "/api/v1/ai/usage/summary",
        body: { success: true, data: null },
      },
    ],
    waitForUrl: /\/telefun/,
    expectedThirdPartyHosts: ["randomuser.me"],
  });
  return { audit, messages };
}

async function openPicker(page: Page) {
  await page.getByRole("button", { name: /^Mulai simulasi/ }).click();
  const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
  await expect(
    picker.getByRole("button", { name: "Mulai panggilan" }),
  ).toBeEnabled();
  return picker;
}

async function selectJabra(page: Page) {
  const picker = await openPicker(page);
  const select = picker.getByRole("combobox", {
    name: "Mikrofon",
    exact: true,
  });
  await expect(select).toHaveValue("laptop-mic");
  await select.selectOption("jabra-mic");
  await expect(select).toHaveValue("jabra-mic");
  await expect(
    picker.getByRole("button", { name: "Mulai panggilan" }),
  ).toBeEnabled();
  return picker;
}

async function startFromPicker(page: Page) {
  await page.evaluate(() => {
    const harness = window.telefunMicHarness;
    harness.callStartIndex = harness.calls.length;
  });
  await page
    .getByRole("dialog", { name: "Siapa yang berlatih?" })
    .getByRole("button", { name: "Mulai panggilan" })
    .click();
}

async function sessionCalls(page: Page) {
  return page.evaluate(() => {
    const harness = window.telefunMicHarness;
    return harness.calls.slice(harness.callStartIndex);
  });
}

async function expectJabraCall(page: Page) {
  const call = page.getByRole("region", { name: "Panggilan" });
  await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
    timeout: 20000,
  });
  const calls = await sessionCalls(page);
  expect(calls.length).toBeGreaterThan(0);
  // StrictMode can remount the session in dev. Every request after confirming
  // must be a session request on Jabra, never the meter's default-device stream.
  for (const constraints of calls) {
    expect(constraints).toMatchObject({
      deviceId: { exact: "jabra-mic" },
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  }
}

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

test("pilihan Jabra diteruskan tepat ke panggilan dan meter sesi", async ({
  page,
}, testInfo) => {
  const { audit } = await open(page);
  const picker = await selectJabra(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const select = picker.getByRole("combobox", {
      name: "Mikrofon",
      exact: true,
    });
    await expect(select).toBeVisible();
    await select.focus();
    const bounds = await select.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`mic-picker-${width}.png`),
    });
  }
  await startFromPicker(page);
  await expectJabraCall(page);
  expectHermetic(audit);
});

test("pilihan Jabra diingat setelah reload dan dipakai lagi", async ({
  page,
}) => {
  // Three calls and four page loads; a cold dev server needs more than 30 s.
  test.setTimeout(120_000);
  const { audit } = await open(page);
  await selectJabra(page);
  await startFromPicker(page);
  await expectJabraCall(page);
  await page.reload();
  const reopened = await openPicker(page);
  await expect(
    reopened.getByRole("combobox", { name: "Mikrofon", exact: true }),
  ).toHaveValue("jabra-mic");
  await startFromPicker(page);
  await expectJabraCall(page);

  // On a later dialog open the remembered headset is gone: visibly check the
  // browser default, and only then pass its actual id into the next call.
  await page.reload();
  await page.evaluate(() => {
    window.telefunMicHarness.devices = ["laptop-mic"];
  });
  const fallback = await openPicker(page);
  await expect(
    fallback.getByText("Mikrofon Laptop", { exact: true }),
  ).toBeVisible();
  await expect(
    fallback.getByRole("combobox", { name: "Mikrofon", exact: true }),
  ).toHaveCount(0);
  await startFromPicker(page);
  await expect(
    page.getByRole("region", { name: "Panggilan" }).getByRole("status").first(),
  ).toHaveText("Giliran Anda", { timeout: 20000 });
  for (const constraints of await sessionCalls(page)) {
    expect(constraints).toMatchObject({ deviceId: { exact: "laptop-mic" } });
  }

  // The fallback is not a choice: once the headset is back, it is still the
  // remembered microphone.
  await page.reload();
  const pluggedBack = await openPicker(page);
  await expect(
    pluggedBack.getByRole("combobox", { name: "Mikrofon", exact: true }),
  ).toHaveValue("jabra-mic");
  expectHermetic(audit);
});

test("perangkat exact hilang saat mulai gagal jelas tanpa fallback", async ({
  page,
}) => {
  const { audit, messages } = await open(page);
  await selectJabra(page);
  await page.evaluate(() => {
    window.telefunMicHarness.failCall = true;
  });
  await startFromPicker(page);
  await expect(page.getByText(MISSING_MESSAGE)).toBeVisible({ timeout: 20000 });
  const call = page.getByRole("region", { name: "Panggilan" });
  await expect(call.getByRole("alert")).toContainText(MISSING_MESSAGE);
  await expect(call.getByRole("status")).toHaveCount(0);
  await expect(call.getByTestId("microphone-waveform")).toHaveCount(0);
  await expect(
    call.getByRole("button", { name: "Kembali ke Telefun" }),
  ).toBeVisible();
  const calls = await sessionCalls(page);
  expect(calls.length).toBeGreaterThan(0);
  for (const constraints of calls) {
    expect(constraints).toMatchObject({ deviceId: { exact: "jabra-mic" } });
  }
  expect(messages).toEqual([]);
  expectHermetic(audit);
});

test("headset hilang saat cek memberi pesan perangkat bukan penolakan izin", async ({
  page,
}) => {
  const { audit } = await open(page);
  const picker = await openPicker(page);
  await page.evaluate(() => {
    window.telefunMicHarness.failCheck = true;
  });
  await picker
    .getByRole("combobox", { name: "Mikrofon", exact: true })
    .selectOption("jabra-mic");
  await expect(picker.getByRole("alert")).toContainText(
    "Mikrofon tidak tersedia",
  );
  await expect(
    picker.getByRole("button", { name: "Mulai panggilan" }),
  ).toBeDisabled();
  await picker.getByRole("button", { name: "Coba lagi" }).click();
  await expect(
    picker.getByRole("combobox", { name: "Mikrofon", exact: true }),
  ).toHaveValue("laptop-mic");
  await expect(
    picker.getByRole("button", { name: "Mulai panggilan" }),
  ).toBeEnabled();
  expectHermetic(audit);
});

test("satu perangkat dienumerasi tanpa select dan tetap menunjukkan mikrofon aktual", async ({
  page,
}) => {
  const { audit } = await open(page, ["laptop-mic"]);
  const picker = await openPicker(page);
  await expect
    .poll(() => page.evaluate(() => window.telefunMicHarness.enumerations))
    .toBeGreaterThan(0);
  await expect(
    picker.getByRole("combobox", { name: "Mikrofon", exact: true }),
  ).toHaveCount(0);
  await expect(
    picker.getByText("Mikrofon Laptop", { exact: true }),
  ).toBeVisible();
  expectHermetic(audit);
});

test("devicechange memperbarui pilihan saat headset dipasang", async ({
  page,
}) => {
  const { audit } = await open(page, ["laptop-mic"]);
  await page.evaluate(() => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const checkStorage = (key: string) => {
      if (key === "telefun.microphoneDeviceId") {
        throw new DOMException("Storage disabled", "SecurityError");
      }
    };
    Storage.prototype.getItem = function (key) {
      checkStorage(key);
      return getItem.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      checkStorage(key);
      return setItem.call(this, key, value);
    };
  });
  const picker = await openPicker(page);
  await page.evaluate(() => {
    window.telefunMicHarness.devices.push("jabra-mic");
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  });
  const select = picker.getByRole("combobox", {
    name: "Mikrofon",
    exact: true,
  });
  await expect(select).toHaveValue("laptop-mic");
  await select.selectOption("jabra-mic");
  await expect(select).toHaveValue("jabra-mic");
  await expect(
    picker.getByRole("button", { name: "Mulai panggilan" }),
  ).toBeEnabled();
  await startFromPicker(page);
  await expectJabraCall(page);
  expectHermetic(audit);
});
