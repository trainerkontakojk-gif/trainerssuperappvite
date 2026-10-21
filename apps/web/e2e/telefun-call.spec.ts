import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { E2E_SUPABASE_URL } from "./helpers/e2eTargets";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  PENDING_ROW,
  mockRecordingUpload,
  mockTelefunAvatar,
  mockTelefunVoiceServer,
  recordingMock,
  serveRecording,
  telefunMocks,
  type TelefunRow,
} from "./helpers/telefunFixtures";

/**
 * Telefun — layar panggilan (hermetic). Mikrofon memakai perangkat palsu
 * Chromium (opsi peluncuran berlaku untuk seluruh file), dan server suara
 * Gemini Live ditiru lewat `routeWebSocket`. Tidak ada AI sungguhan.
 */

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

async function open(
  page: Page,
  path: string,
  apiMocks: ApiMock[],
  avatarFails = false,
) {
  const audit = await openHermeticShell(page, {
    path,
    apiMocks,
    waitForUrl: /\/telefun/,
    beforeNavigate: (page) => mockTelefunAvatar(page, avatarFails),
  });
  console.log("[audit]", formatAudit(audit));
  return audit;
}

test.describe("Telefun panggilan (hermetic, mikrofon palsu)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  const NEW_ID = "telefun-new-1";
  const newRow: TelefunRow = {
    ...PENDING_ROW,
    id: NEW_ID,
    created_at: new Date().toISOString(),
    scenario_title: "Panggilan Baru",
  };

  function callMocks(settings: unknown = {}): ApiMock[] {
    return [
      ...telefunMocks([], settings),
      {
        method: "POST",
        path: "/api/v1/telefun/sessions",
        body: { success: true, data: { id: NEW_ID, simulationSubject: null } },
      },
      {
        method: "GET",
        path: "/api/v1/ai/usage/summary",
        body: { success: true, data: null },
      },
      {
        method: "PATCH",
        path: `/api/v1/telefun/sessions/${NEW_ID}`,
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
        path: `/api/v1/telefun/remux-recording/${NEW_ID}`,
        body: {
          success: true,
          data: { remuxed: false, recordings: {}, scoringStatus: "pending" },
        },
      },
      {
        method: "POST",
        path: `/api/v1/telefun/score/${NEW_ID}`,
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
        path: `/api/v1/telefun/history/${NEW_ID}`,
        body: { success: true, data: newRow },
      },
      recordingMock(NEW_ID),
    ];
  }

  async function openPicker(page: Page) {
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .click({ timeout: 20000 });
    const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
    await expect(picker).toBeVisible();
    return picker;
  }

  const identitySettings = {
    displayName: "Dian Permana",
    gender: "male",
    phoneNumber: "0823-3456-7890",
    city: "Depok",
    signatureName: "Dian",
    voiceName: "Fenrir",
  };

  async function startFromPicker(page: Page) {
    const picker = await openPicker(page);
    const start = picker.getByRole("button", { name: "Mulai panggilan" });
    await expect(start).toBeEnabled({ timeout: 15000 });
    await start.click();
    return page.getByRole("region", { name: "Panggilan" });
  }

  test("potret, jam panggilan maju tanpa sisa waktu, waveform hidup dan datar saat bisu", async ({
    page,
  }, testInfo) => {
    await page.clock.install();
    await mockTelefunVoiceServer(page, NEW_ID);
    const audit = await open(
      page,
      "/telefun",
      callMocks({ identitySettings, maxCallDuration: 5 }),
    );
    const call = await startFromPicker(page);
    await expect(
      call.getByText(
        "Siapkan salam pembuka. Rekaman dan penilaian mulai saat telepon diangkat.",
      ),
    ).toBeVisible();
    await expect(
      call.getByRole("img", { name: "Foto Dian Permana", exact: true }),
    ).toBeVisible();
    await expect(call.getByRole("status")).toHaveText("Giliran Anda", {
      timeout: 20000,
    });
    const timer = call
      .locator("header")
      .getByText(/Lama panggilan/)
      .locator("..");
    await expect(timer).toBeVisible();
    const before = await timer.textContent();
    await page.clock.fastForward(3_000);
    await expect(timer).not.toHaveText(before!);
    await expect(call).not.toContainText(/Sisa waktu|hitung mundur|countdown/i);
    await expect(call.getByRole("progressbar")).toHaveCount(0);
    const waveform = call.getByTestId("microphone-waveform");
    await expect(waveform).toBeVisible();
    await expect(waveform).toHaveAttribute("aria-hidden", "true");
    await expect(waveform.locator("span")).toHaveCount(28);
    await expect(call.getByText("Suara Anda", { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        waveform
          .locator("span")
          .evaluateAll((bars) =>
            bars.some(
              (bar) => parseFloat((bar as HTMLElement).style.height) > 4,
            ),
          ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("connected-desktop.png"),
    });
    await call.getByRole("button", { name: "Bisukan", exact: true }).click();
    await expect(call.getByText("Mikrofon dibisukan")).toBeVisible();
    await expect
      .poll(() =>
        waveform
          .locator("span")
          .evaluateAll((bars) =>
            bars.every((bar) => (bar as HTMLElement).style.height === "4px"),
          ),
      )
      .toBe(true);
    await call.getByRole("button", { name: "Tahan", exact: true }).click();
    await expect(waveform).toHaveCount(0);
    await call.getByRole("button", { name: "Lanjutkan", exact: true }).click();
    await expect(waveform).toBeVisible();
    expectHermetic(audit);
  });

  test("potret gagal memakai inisial, ponsel 390px tanpa overflow dan reduced motion", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockTelefunVoiceServer(page, NEW_ID);
    const audit = await open(
      page,
      "/telefun",
      callMocks({ identitySettings }),
      true,
    );
    const call = await startFromPicker(page);
    await expect(call.locator('[data-slot="avatar-fallback"]')).toHaveText(
      "DP",
    );
    await expect(call.locator('[data-slot="avatar-fallback"]')).toBeVisible();
    expect(
      await call
        .locator('[data-slot="avatar"]')
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBe(128);
    await expect(
      call.getByRole("img", { name: "Foto Dian Permana" }),
    ).toHaveCount(0);
    await expect(call.getByRole("status")).toHaveText("Giliran Anda", {
      timeout: 20000,
    });
    expect(await call.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await call
        .getByTestId("microphone-waveform")
        .locator("span")
        .evaluateAll((bars) =>
          bars.every(
            (bar) => getComputedStyle(bar).transitionProperty === "none",
          ),
        ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("connected-mobile-reduced-motion.png"),
    });
    expectHermetic(audit);
  });

  for (const failAfterPickup of [false, true]) {
    test(`gagal ${failAfterPickup ? "terminal" : "menghubungkan"}: alert, retry menutup percobaan lama sebelum sesi baru`, async ({
      page,
    }, testInfo) => {
      if (!failAfterPickup)
        await page.setViewportSize({ width: 390, height: 844 });
      const messages: Record<string, unknown>[] = [];
      let releaseSave: () => void = () => {};
      const saveAllowed = new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
      await mockTelefunVoiceServer(page, NEW_ID, messages, {
        failAttempt: 1,
        failAfterPickup,
      });
      const audit = await open(
        page,
        "/telefun",
        callMocks({ identitySettings }),
      );
      let creates = 0;
      const configs: unknown[] = [];
      await page.route("**/api/v1/telefun/sessions", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        creates += 1;
        configs.push(route.request().postDataJSON());
        await route.fulfill({
          json: {
            success: true,
            data: {
              id: creates === 1 ? NEW_ID : "telefun-retry-2",
              simulationSubject: null,
            },
          },
        });
      });
      let failedAttemptSaved = false;
      let failedAttemptSaveRequests = 0;
      await page.route(
        `**/api/v1/telefun/sessions/${NEW_ID}`,
        async (route) => {
          if (route.request().method() !== "PATCH") return route.fallback();
          failedAttemptSaveRequests += 1;
          await saveAllowed;
          failedAttemptSaved = true;
          await route.fulfill({ json: { success: true, data: null } });
        },
      );
      await mockRecordingUpload(page);
      await serveRecording(page);
      const call = await startFromPicker(page);
      const alert = call.getByRole("alert");
      await expect(alert).toContainText("Panggilan belum dapat dimulai", {
        timeout: 20000,
      });
      await expect(alert).toContainText(
        "Sambungan suara tidak berhasil dibuka. Periksa koneksi internet, lalu coba panggil lagi.",
      );
      await expect(alert).not.toContainText("Panggilan belum dapat dimulai.");
      for (const name of ["Tahan", "Bisukan", "Akhiri"])
        await expect(
          call.getByRole("button", { name, exact: true }),
        ).toHaveCount(0);
      const retry = call.getByRole("button", {
        name: "Coba panggil lagi",
        exact: true,
      });
      await expect(retry).toBeVisible();
      await expect(
        call.getByRole("button", { name: "Kembali ke Telefun", exact: true }),
      ).toBeVisible();
      expect(
        await retry.evaluate((el) => (el as HTMLElement).offsetHeight),
      ).toBeGreaterThanOrEqual(44);
      expect(
        await call.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      if (failAfterPickup) {
        await expect(alert).toBeVisible();
        expect(failedAttemptSaveRequests).toBe(0);
        expect(failedAttemptSaved).toBe(false);
        await expect(page).not.toHaveURL(/tahap=telaah/);
      }
      await page.screenshot({ path: testInfo.outputPath("failed.png") });
      await retry.dblclick();
      // Saving a terminal recording is part of cleanup, never a reason to
      // dismiss the alert early or create the next session concurrently.
      if (failAfterPickup) {
        expect(creates).toBe(1);
        await expect.poll(() => failedAttemptSaveRequests).toBe(1);
        expect(creates).toBe(1);
      }
      releaseSave();
      await expect.poll(() => creates).toBe(2);
      expect(configs[1]).toEqual(configs[0]);
      if (failAfterPickup) expect(failedAttemptSaved).toBe(true);
      await expect(call.getByRole("status")).toHaveText("Giliran Anda", {
        timeout: 20000,
      });
      await expect(
        call.getByRole("img", { name: "Foto Dian Permana" }),
      ).toBeVisible();
      // Keep the fresh session ID observable; a remount, not a reused transport.
      expect(
        messages
          .filter((m) => m.type === "authenticate")
          .map((m) => m.sessionId),
      ).toEqual([NEW_ID, "telefun-retry-2"]);
      expect(creates).toBe(2);
      expectHermetic(audit);
    });
  }

  test("gagal: Kembali ke Telefun menutup sesi dan kembali ke landing", async ({
    page,
  }) => {
    await mockTelefunVoiceServer(page, NEW_ID, [], { failAttempt: 1 });
    const audit = await open(page, "/telefun", callMocks());
    const call = await startFromPicker(page);
    await expect(call.getByRole("alert")).toBeVisible({ timeout: 20000 });
    await call
      .getByRole("button", { name: "Kembali ke Telefun", exact: true })
      .click();
    await expect(call).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/tahap=telaah/);
    expectHermetic(audit);
  });

  test("cek mikrofon, layar softphone berlabel Indonesia, akhiri dengan konfirmasi, lalu tahap Telaah", async ({
    page,
  }) => {
    // Soket tiruan wajib dipasang sebelum halaman dimuat.
    const socket = await mockTelefunVoiceServer(page, NEW_ID);
    const consoleTexts: string[] = [];
    page.on("console", (message) => consoleTexts.push(message.text()));
    const audit = await open(page, "/telefun", callMocks());
    const uploads = await mockRecordingUpload(page);
    await serveRecording(page);

    const picker = await openPicker(page);
    await expect(picker.getByText("Suara Anda terdengar")).toBeVisible({
      timeout: 15000,
    });
    const startCall = picker.getByRole("button", { name: "Mulai panggilan" });
    await expect(startCall).toBeEnabled();
    await startCall.click();

    const call = page.getByRole("region", { name: "Panggilan" });
    await expect(call).toBeVisible();
    // Tidak ada label bahasa Inggris dan tidak ada hitung mundur.
    await expect(call.getByText(/Hangup|Mute Microphone|End Call/)).toHaveCount(
      0,
    );
    await expect(call.getByRole("status")).toHaveText("Giliran Anda", {
      timeout: 20000,
    });
    // Konfigurasi panggilan (instruksi skenario, identitas) tidak ditulis ke console.
    expect(
      consoleTexts.filter((text) => text.includes("mounted with config")),
    ).toEqual([]);
    // Nama dan nomor penelepon besar di tengah layar, seperti layar telepon.
    const caller = call.getByRole("group", { name: "Data penelepon" });
    await expect(caller.getByRole("heading", { level: 2 })).not.toBeEmpty();
    await expect(caller.getByText("Nomor telepon")).toHaveClass(/sr-only/);
    const phone = caller.getByText(/^0[\d-]{9,15}$/);
    await expect(phone).toBeVisible();
    expect(
      await phone.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(14);
    for (const name of ["Tahan", "Bisukan", "Akhiri"]) {
      await expect(call.getByRole("button", { name })).toBeVisible();
    }

    // Tahan memunculkan pita hold dengan batasnya.
    await call.getByRole("button", { name: "Tahan" }).click();
    await expect(call.getByText("Panggilan ditahan")).toBeVisible();
    await call.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(call.getByText("Panggilan ditahan")).toHaveCount(0);

    // Bisukan dicatat sebagai interval di metrik sesi.
    const patchBodies: unknown[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "PATCH" &&
        request.url().endsWith(`/api/v1/telefun/sessions/${NEW_ID}`)
      )
        patchBodies.push(request.postDataJSON());
    });
    await call.getByRole("button", { name: "Bisukan" }).click();
    await expect(call.getByText("Mikrofon dibisukan")).toBeVisible();
    await page.waitForTimeout(300);
    await call.getByRole("button", { name: "Bunyikan" }).click();

    // Akhiri meminta konfirmasi aplikasi.
    await call.getByRole("button", { name: "Akhiri" }).click();
    const confirm = page.getByRole("dialog", { name: "Akhiri panggilan?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Lanjutkan panggilan" }).click();
    await expect(confirm).toBeHidden();
    await expect(call.getByRole("status")).toHaveText("Giliran Anda");

    await call.getByRole("button", { name: "Akhiri" }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan" })
      .click();

    await expect(page).toHaveURL(new RegExp(`sesi=${NEW_ID}`), {
      timeout: 30000,
    });
    await expect(page).toHaveURL(/tahap=telaah/);
    await expect(
      page.getByRole("region", { name: "Hasil telaah" }),
    ).toContainText(/Menunggu analisis|Sedang dianalisis/);
    expect(socket).toEqual(
      expect.arrayContaining([
        "authenticate",
        "telefun_session_configure",
        "setup",
        "session_end_request",
      ]),
    );
    expect(uploads.length).toBeGreaterThan(0);
    await waitForMockedApi(audit, [
      "POST /api/v1/telefun/sessions",
      `PATCH /api/v1/telefun/sessions/${NEW_ID}`,
    ]);
    const metrics = patchBodies
      .map(
        (body) =>
          (body as { session_metrics?: { mutes?: unknown } }).session_metrics,
      )
      .find(Boolean);
    expect(metrics?.mutes).toEqual([
      {
        startedAtMs: expect.any(Number),
        endedAtMs: expect.any(Number),
      },
    ]);
    const [mute] = metrics!.mutes as {
      startedAtMs: number;
      endedAtMs: number;
    }[];
    expect(mute.startedAtMs).toBeGreaterThan(0);
    expect(mute.endedAtMs - mute.startedAtMs).toBeGreaterThanOrEqual(300);
    expectHermetic(audit);
  });

  test("pita hold: lama ditahan dibanding batas 1 menit, peringatan, lalu lewat batas", async ({
    page,
  }) => {
    // Jam palsu dipasang sebelum halaman dimuat; waktu tetap berjalan wajar
    // sampai dimajukan, sehingga dering dan jabat tangan tidak terganggu.
    await page.clock.install();
    await mockTelefunVoiceServer(page, NEW_ID);
    const audit = await open(page, "/telefun", callMocks());
    const picker = await openPicker(page);
    const startCall = picker.getByRole("button", { name: "Mulai panggilan" });
    await expect(startCall).toBeEnabled({ timeout: 15000 });
    await startCall.click();

    const call = page.getByRole("region", { name: "Panggilan" });
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 20000,
    });
    await call.getByRole("button", { name: "Tahan" }).click();
    const band = call.getByRole("status", { name: "Hold ke-1" });
    await expect(band).toContainText("Panggilan ditahan");
    await expect(band).toContainText("dari batas 01.00");

    await page.clock.fastForward(52_000);
    await expect(band).toContainText("Segera kembali ke konsumen");

    await page.clock.fastForward(10_000);
    await expect(band).toContainText("Hold melewati batas");
    await expect(band).toContainText("+00.0");
    await expect(band).toContainText("Kembali ke konsumen sekarang");
    const overtime = await band.textContent();
    await page.clock.fastForward(5_000);
    await expect(band).toBeVisible();
    await expect(band).not.toHaveText(overtime!);
    await expect(band).toContainText(/\+00\.0[7-9]/);
    await expect(
      call.getByRole("button", { name: "Lanjutkan", exact: true }),
    ).toBeVisible();
    await expect(
      call.getByRole("button", { name: "Lanjutkan", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");

    await call.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(band).toHaveCount(0);
    expectHermetic(audit);
  });

  test("rekaman memakai bitrate suara (32 kbps), bukan bawaan browser", async ({
    page,
  }) => {
    // Bitrate bawaan Chrome (~128 kbps) membuat rekaman ~4x lebih besar; tiap
    // byte diunggah, diproses ulang, dan diunduh lagi saat penilaian dan Telaah.
    await page.addInitScript(() => {
      const Original = window.MediaRecorder;
      const seen: Array<{ requested?: number; actual: number }> = [];
      (window as unknown as { __recorders: typeof seen }).__recorders = seen;
      class Spy extends Original {
        constructor(stream: MediaStream, options?: MediaRecorderOptions) {
          super(stream, options);
          seen.push({
            requested: options?.audioBitsPerSecond,
            actual: this.audioBitsPerSecond,
          });
        }
      }
      window.MediaRecorder = Spy;
    });
    await mockTelefunVoiceServer(page, NEW_ID);
    const audit = await open(page, "/telefun", callMocks());
    const picker = await openPicker(page);
    const startCall = picker.getByRole("button", { name: "Mulai panggilan" });
    await expect(startCall).toBeEnabled({ timeout: 15000 });
    await startCall.click();
    const call = page.getByRole("region", { name: "Panggilan" });
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 20000,
    });

    const recorders = await page.evaluate(
      () => (window as unknown as { __recorders: unknown[] }).__recorders,
    );
    // Rekaman penuh dan rekaman agen.
    expect(recorders).toEqual([
      { requested: 32000, actual: 32000 },
      { requested: 32000, actual: 32000 },
    ]);
    expectHermetic(audit);
  });

  test("rekaman penuh dan rekaman agen diunggah bersamaan setelah panggilan", async ({
    page,
  }) => {
    await mockTelefunVoiceServer(page, NEW_ID);
    const audit = await open(page, "/telefun", callMocks());
    // Tahan setiap unggahan sampai unggahan kedua datang (maks. 4 detik):
    // unggahan berurutan tidak pernah berjalan bersamaan.
    let inFlight = 0;
    let maxInFlight = 0;
    let release: () => void = () => {};
    const bothArrived = new Promise<void>((resolve) => (release = resolve));
    await page.route(
      `${E2E_SUPABASE_URL}/storage/v1/object/telefun-recordings/**`,
      async (route) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (inFlight === 2) release();
        await Promise.race([
          bothArrived,
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
        const path = new URL(route.request().url()).pathname.replace(
          "/storage/v1/object/telefun-recordings/",
          "",
        );
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ Key: `telefun-recordings/${path}`, Id: path }),
        });
        inFlight -= 1;
      },
    );
    await serveRecording(page);
    const picker = await openPicker(page);
    const startCall = picker.getByRole("button", { name: "Mulai panggilan" });
    await expect(startCall).toBeEnabled({ timeout: 15000 });
    await startCall.click();
    const call = page.getByRole("region", { name: "Panggilan" });
    await expect(call.getByRole("status").first()).toHaveText("Giliran Anda", {
      timeout: 20000,
    });
    await call.getByRole("button", { name: "Akhiri" }).click();
    await page
      .getByRole("dialog", { name: "Akhiri panggilan?" })
      .getByRole("button", { name: "Akhiri panggilan" })
      .click();
    await expect(page).toHaveURL(/tahap=telaah/, { timeout: 30000 });

    expect(maxInFlight).toBe(2);
    expectHermetic(audit);
  });

  test("sambungan disiapkan selama nada dering; suara agen baru dikirim setelah diangkat", async ({
    page,
  }) => {
    const messages: Record<string, unknown>[] = [];
    const socket = await mockTelefunVoiceServer(page, NEW_ID, messages);
    const audit = await open(page, "/telefun", callMocks());
    const picker = await openPicker(page);
    const startCall = picker.getByRole("button", { name: "Mulai panggilan" });
    await expect(startCall).toBeEnabled({ timeout: 15000 });
    await startCall.click();

    const status = page
      .getByRole("region", { name: "Panggilan" })
      .getByRole("status");
    await expect(status).toHaveText("Memanggil…");
    // Jabat tangan selesai saat telepon masih berdering (dering 2,5 detik).
    await expect.poll(() => socket, { timeout: 2000 }).toContain("setup");
    await expect(status).toHaveText("Memanggil…");
    expect(messages.some((message) => "realtimeInput" in message)).toBe(false);

    await expect(status).toHaveText("Giliran Anda", { timeout: 5000 });
    await expect
      .poll(() => messages.some((message) => "realtimeInput" in message))
      .toBe(true);
    expectHermetic(audit);
  });

  test("klik ganda Mulai panggilan hanya membuat satu sesi", async ({
    page,
  }) => {
    await mockTelefunVoiceServer(page, NEW_ID);
    const audit = await open(page, "/telefun", callMocks());
    const picker = await openPicker(page);
    const startCall = picker.getByRole("button", { name: "Mulai panggilan" });
    await expect(startCall).toBeEnabled({ timeout: 15000 });
    await startCall.dblclick();
    await expect(page.getByRole("region", { name: "Panggilan" })).toBeVisible();
    await expect
      .poll(
        () =>
          audit.mockedApi.filter((entry) =>
            entry.startsWith("POST /api/v1/telefun/sessions"),
          ).length,
      )
      .toBe(1);
    expectHermetic(audit);
  });

  test("sesi gagal dibuat: tetap di landing, tidak masuk panggilan", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", [
      ...telefunMocks([]),
      {
        method: "POST",
        path: "/api/v1/telefun/sessions",
        status: 500,
        body: {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "x" },
        },
      },
    ]);
    const picker = await openPicker(page);
    const startCall = picker.getByRole("button", { name: "Mulai panggilan" });
    await expect(startCall).toBeEnabled({ timeout: 15000 });
    await startCall.click();
    await expect(
      page.getByText("Gagal membuat sesi panggilan. Silakan coba lagi."),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Panggilan" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();
    expectHermetic(audit);
  });
});
