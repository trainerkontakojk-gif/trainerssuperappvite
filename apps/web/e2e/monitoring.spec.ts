import { expect, test } from "@playwright/test";
import {
  expectHermetic,
  formatAudit,
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";

/**
 * Monitoring — cakupan browser pertama untuk modul ini (plan 026).
 *
 * Sebelum ini Monitoring punya 60 unit test tapi nol E2E. Semua `/api` dimock
 * lewat harness hermetic; lihat `docs/e2e-testing.md`.
 *
 * Yang TIDAK dibuktikan di sini: assertion appearance (class CSS, min-h) dan
 * kontrak di dalam modal detail review (butuh payload assessment berat).
 */

/** Satu baris harga; semua rate numerik diisi supaya render tidak pecah. */
const PRICING_ROW = {
  model_id: "gemini-3.8-flash",
  model_name: "Gemini 3.8 Flash",
  input_price_usd_per_million: 0.3,
  output_price_usd_per_million: 1.2,
  input_text_price_usd_per_million: 0.3,
  cached_input_text_price_usd_per_million: 0.075,
  input_audio_price_usd_per_million: 0,
  cached_input_audio_price_usd_per_million: 0,
  output_text_price_usd_per_million: 1.2,
  output_audio_price_usd_per_million: 0,
};

function monitoringMocks(
  overrides: readonly ApiMock[] = [],
): readonly ApiMock[] {
  // Override diletakkan DULU: harness memakai `.find()`, jadi match pertama menang.
  return [
    ...overrides,
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/history",
      body: { success: true, data: [] },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/aggregation",
      body: { success: true, data: [] },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/pricing",
      body: { success: true, data: [PRICING_ROW] },
    },
    {
      method: "GET",
      path: "/api/v1/ai/monitoring/billing",
      body: { success: true, data: { usd_to_idr_rate: 15000 } },
    },
  ];
}

test.describe("Monitoring (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("hero, tab strip, dan empty state riwayat dirender", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
    });
    console.log("[audit]", formatAudit(audit));

    await expect(
      page.getByRole("heading", { name: "Monitoring AI Usage" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByText(/Pantau dan analisis penggunaan modul AI/),
    ).toBeVisible();

    for (const label of ["Riwayat Simulasi", "Penggunaan Token"]) {
      await expect(page.getByRole("tab", { name: label })).toBeVisible();
    }
    // Riwayat aktif secara default.
    await expect(
      page.getByRole("tab", { name: "Riwayat Simulasi" }),
    ).toHaveAttribute("aria-selected", "true");

    await waitForMockedApi(audit, ["/ai/monitoring/history"]);
    // Riwayat kosong tetap merender KPI card dengan angka nol, bukan layar kosong.
    await expect(page.getByText(/0 sesi KETIK/)).toBeVisible();

    expectHermetic(audit);
  });

  test("tab harga tampil untuk trainer dan tersembunyi untuk leader", async ({
    page,
  }) => {
    const trainerAudit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
    });
    await expect(page.getByRole("tab", { name: "Harga & Kurs" })).toBeVisible({
      timeout: 20000,
    });
    expectHermetic(trainerAudit);

    // Leader boleh membuka /monitoring tetapi tidak boleh menyunting harga.
    const leaderAudit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
      auth: { role: "leader" },
    });
    await expect(
      page.getByRole("heading", { name: "Monitoring AI Usage" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("tab", { name: "Harga & Kurs" })).toHaveCount(
      0,
    );
    expectHermetic(leaderAudit);
  });

  test("tab penggunaan memuat agregasi", async ({ page }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
    });

    await page.getByRole("tab", { name: "Penggunaan Token" }).click();
    await expect(
      page.getByRole("tab", { name: "Penggunaan Token" }),
    ).toHaveAttribute("aria-selected", "true", { timeout: 20000 });

    await waitForMockedApi(audit, ["/ai/monitoring/aggregation"]);
    expectHermetic(audit);
  });

  test("tab harga memuat pricing dan billing lalu merender tabel harga", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks(),
    });

    await page.getByRole("tab", { name: "Harga & Kurs" }).click();
    await expect(
      page.getByRole("tab", { name: "Harga & Kurs" }),
    ).toHaveAttribute("aria-selected", "true", { timeout: 20000 });

    // Buktikan kedua request terjadi sebelum menuntut isinya.
    await waitForMockedApi(audit, [
      "/ai/monitoring/pricing",
      "/ai/monitoring/billing",
    ]);

    await expect(
      page.getByText("Harga per Model (USD / 1M tokens)"),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Kurs USD ke IDR").first()).toBeVisible();
    // Nilai kurs yang benar-benar dimuat. Diperiksa lewat nilai input, bukan
    // teks terformat: `toLocaleString()` mengikuti locale browser (en-US
    // menghasilkan "15,000"), jadi assertion berbasis teks itu rapuh.
    await expect(page.getByLabel("Kurs USD ke IDR")).toHaveValue("15000");

    expectHermetic(audit);
  });

  test("sesi kedaluwarsa dipetakan ke pesan yang manusiawi", async ({
    page,
  }) => {
    const audit = await openHermeticShell(page, {
      path: "/monitoring",
      apiMocks: monitoringMocks([
        {
          method: "GET",
          path: "/api/v1/ai/monitoring/history",
          status: 401,
          body: {
            success: false,
            error: { code: "UNAUTHORIZED", message: "Unauthorized" },
          },
        },
      ]),
    });

    // Temuan: di browser, 401 pada `/api` TIDAK berhenti di pesan inline
    // (`mapError`) — handler sesi global lebih dulu bekerja dan aplikasi
    // kembali ke landing. Jadi yang diuji di sini adalah hasil yang terlihat
    // pengguna, bukan teks internal komponen.
    await expect(
      page.getByRole("heading", { name: "Lima modul. Satu pengalaman." }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("heading", { name: "Monitoring AI Usage" }),
    ).toHaveCount(0);

    expectHermetic(audit);
  });
});
