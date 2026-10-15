import { expect, test, type Page } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import {
  PENDING_ROW,
  mockRecordingUpload,
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

async function open(page: Page, path: string, apiMocks: ApiMock[]) {
  const audit = await openHermeticShell(page, {
    path,
    apiMocks,
    waitForUrl: /\/telefun/,
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

  function callMocks(): ApiMock[] {
    return [
      ...telefunMocks([]),
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

  test("cek mikrofon, layar softphone berlabel Indonesia, akhiri dengan konfirmasi, lalu tahap Telaah", async ({
    page,
  }) => {
    // Soket tiruan wajib dipasang sebelum halaman dimuat.
    const socket = await mockTelefunVoiceServer(page, NEW_ID);
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
    // Nama dan nomor penelepon besar di tengah layar, seperti layar telepon.
    const caller = call.getByRole("group", { name: "Data penelepon" });
    await expect(caller.getByRole("heading", { level: 2 })).not.toBeEmpty();
    await expect(caller.getByText("Nomor telepon")).toBeVisible();
    const phone = caller.getByText(/^0[\d-]{9,15}$/);
    await expect(phone).toBeVisible();
    expect(
      await phone.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(20);
    for (const name of ["Tahan", "Bisukan", "Akhiri"]) {
      await expect(call.getByRole("button", { name })).toBeVisible();
    }

    // Tahan memunculkan pita hold dengan batasnya.
    await call.getByRole("button", { name: "Tahan" }).click();
    await expect(call.getByText("Panggilan ditahan")).toBeVisible();
    await call.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(call.getByText("Panggilan ditahan")).toHaveCount(0);

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

    await call.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(band).toHaveCount(0);
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
