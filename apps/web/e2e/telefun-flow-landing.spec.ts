/**
 * Telefun — landing berbasis data, layar panggilan, dan tahap Telaah
 * (hermetic). Semua `/api` dimock; server suara Gemini Live ditiru lewat
 * `routeWebSocket`, dan mikrofon memakai perangkat palsu Chromium.
 */

import { expect, test } from "@playwright/test";
import {
  APP_ORIGIN,
  expectHermetic,
  openHermeticShell,
  practiceQuotaMock,
  waitForMockedApi,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import { FULL_HISTORY, telefunMocks } from "./helpers/telefunFixtures";
import { open } from "./helpers/telefunFlowHarness";

test.describe("Telefun landing (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("hero memberi satu aksi utama, menu kecil, dan demo yang bisa dijeda", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY));

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Dengarkan konsumennya\.\s*Jawab dengan suara yang tenang\./,
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();

    const menu = page.getByRole("navigation", { name: "Menu Telefun" });
    for (const label of ["Riwayat", "Pemakaian AI", "Pengaturan"]) {
      await expect(
        menu.getByRole("button", { name: new RegExp(`^${label}`) }),
        `menu "${label}" tidak tampil`,
      ).toBeVisible();
    }

    const pause = page.getByRole("button", { name: "Jeda animasi" });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(
      page.getByRole("button", { name: "Putar animasi" }),
    ).toBeVisible();

    await waitForMockedApi(audit, ["/telefun/settings", "/telefun/sessions"]);
    expectHermetic(audit);
  });

  test("agen membuka Telefun dari menu tanpa jendela Akses Terbatas; tombol mulai mengikuti jatah harian", async ({
    page,
  }) => {
    const closed = await openHermeticShell(page, {
      path: "/telefun",
      auth: { role: "agent" },
      waitForUrl: /\/telefun/,
      apiMocks: [
        practiceQuotaMock({ telefun: { limit: 0, used: 0 } }),
        ...telefunMocks(FULL_HISTORY),
      ],
    });
    await expect(
      page.getByRole("heading", { level: 1, name: /Dengarkan konsumennya/ }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Hanya dapat diakses/)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: /^Telefun/i }).first(),
    ).toBeVisible();
    const start = page.getByRole("button", { name: /^Mulai simulasi/ });
    const reason =
      "Telefun belum dibuka untuk akunmu. Trainer bisa membukanya dari halaman Pengguna.";
    await expect(page.getByText(reason)).toBeVisible();
    await expect(start).toBeDisabled();
    await expect(start).toHaveAccessibleDescription(reason);
    expectHermetic(closed);

    const allowed = await openHermeticShell(page, {
      path: "/telefun",
      auth: { role: "agent" },
      waitForUrl: /\/telefun/,
      apiMocks: [
        practiceQuotaMock({ telefun: { limit: 2, used: 1 } }),
        ...telefunMocks(FULL_HISTORY),
      ],
    });
    await expect(
      page.getByText(
        "Sisa hari ini 1 dari 2 panggilan. Dihitung lagi besok pukul 00.00 WIB.",
      ),
    ).toBeVisible({ timeout: 20000 });
    await expect(start).toBeEnabled();
    expectHermetic(allowed);
  });

  test("panggilan bulan ini dihitung server (tidak terpotong 50), panggilan lokal tidak dihitung ganda", async ({
    page,
  }) => {
    // Panggilan yang belum tersinkron: barisnya sudah dibuat server saat
    // panggilan dimulai, jadi sudah termasuk dalam hitungan server.
    await page.addInitScript(
      (record) => {
        try {
          if (!sessionStorage.getItem("e2e-seeded")) {
            sessionStorage.setItem("e2e-seeded", "1");
            localStorage.setItem("telefun_history", JSON.stringify([record]));
          }
        } catch {
          // about:blank tidak punya penyimpanan.
        }
      },
      {
        id: "telefun-local-only-month",
        date: new Date().toISOString(),
        url: "",
        consumerName: "Sari Wulandari",
        scenarioTitle: "Panggilan Offline",
        duration: 95,
        syncStatus: "unsynced",
      },
    );
    const audit = await open(
      page,
      "/telefun",
      telefunMocks(FULL_HISTORY, {}, 73),
    );
    const progress = page.getByTestId("telefun-progress-summary");
    await expect(progress).toContainText("73 panggilan bulan ini", {
      timeout: 20000,
    });
    expectHermetic(audit);
  });

  test("hitungan bulan ini gagal dimuat: tampil tanda kosong, bukan angka karangan", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", [
      {
        method: "GET",
        path: "/api/v1/telefun/sessions/month-count",
        status: 500,
        body: {
          success: false,
          error: { code: "DATABASE_ERROR", message: "Gagal." },
        },
      },
      ...telefunMocks(FULL_HISTORY),
    ]);
    const progress = page.getByTestId("telefun-progress-summary");
    await expect(progress).toContainText("rata-rata skor", { timeout: 20000 });
    await expect(progress).toContainText("– panggilan bulan ini");
    expectHermetic(audit);
  });

  test("bagian data dihitung dari riwayat: progres, tindak lanjut, fokus, hasil terbaru", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY));

    const progress = page.getByTestId("telefun-progress-summary");
    await expect(progress).toContainText("7,4", { timeout: 20000 });
    await expect(progress).toContainText(
      "rata-rata skor dari 2 panggilan terakhir",
    );
    await expect(progress).toContainText("panggilan bulan ini");
    await expect(progress).toContainText("1 sedang dianalisis");

    const followUp = page.getByRole("region", { name: "Perlu tindak lanjut" });
    await expect(followUp.getByText("Pinjol Ilegal")).toBeVisible();
    await expect(followUp.getByText(/Analisis gagal/)).toBeVisible();
    await expect(followUp.getByText("Restrukturisasi Kredit")).toBeVisible();
    await expect(followUp.getByText(/Rekaman tidak tersimpan/)).toBeVisible();

    const focus = page.getByRole("region", { name: "Fokus berikutnya" });
    await expect(focus).toContainText("Filler");
    await expect(focus).not.toContainText("Kata pengisi");
    await expect(focus).toContainText("5,8");

    const recent = page.getByRole("region", { name: "Hasil telaah terbaru" });
    const firstRow = recent.getByRole("row").nth(1);
    await expect(firstRow).toContainText("Klaim Asuransi Ditolak");
    await expect(firstRow).toContainText("Filler");
    await expect(firstRow).toContainText("7,6");

    await recent
      .getByRole("button", { name: "Klaim Asuransi Ditolak" })
      .click();
    await expect(page).toHaveURL(/sesi=telefun-reviewed-1/);
    await expect(page).toHaveURL(/tahap=telaah/);
    expectHermetic(audit);
  });

  test("pengguna baru melihat ajakan, bukan angka kosong", async ({ page }) => {
    const audit = await open(page, "/telefun", telefunMocks([]));
    await expect(
      page.getByRole("heading", { name: "Belum ada latihan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("telefun-progress-summary")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("riwayat yang gagal dimuat bisa dicoba lagi", async ({ page }) => {
    const audit = await open(page, "/telefun", [
      telefunMocks([])[0],
      telefunMocks([])[1],
      {
        method: "GET",
        path: "/api/v1/telefun/sessions",
        status: 500,
        body: {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "x" },
        },
      },
    ]);
    await expect(
      page
        .getByRole("region", { name: "Hasil telaah terbaru" })
        .getByRole("alert"),
    ).toContainText("Riwayat belum bisa dimuat", { timeout: 20000 });
    await expect(
      page.getByRole("button", { name: "Coba lagi" }).first(),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("tombol Mulai simulasi dan aksen Telefun memenuhi kontras WCAG di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY));
    const start = page.getByRole("button", { name: /^Mulai simulasi/ });
    await expect(start).toBeVisible({ timeout: 20000 });
    await waitForMockedApi(audit, ["/telefun/settings", "/telefun/sessions"]);

    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const buttons = await findLowContrastText(start.locator("../.."), {
        selector: "button",
      });
      expect(buttons, `${theme}: ${buttons.join("\n")}`).toEqual([]);
      const main = page.locator("main").first();
      const accent = await findLowContrastText(main, {
        selector:
          '.text-module-telefun:not(h1 *):not([data-testid="telefun-stage-demo"] *)',
      });
      expect(accent, `${theme}: ${accent.join("\n")}`).toEqual([]);
      const hero = await findLowContrastText(main, {
        selector: "h1 .text-module-telefun",
        minRatio: 3,
      });
      expect(hero, `${theme}: ${hero.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test(`teks landing Telefun minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await open(page, "/telefun", telefunMocks(FULL_HISTORY));
    await expect(page.getByTestId("telefun-progress-summary")).toBeVisible({
      timeout: 20000,
    });
    // Demo panggilan (aria-hidden) meniru layar pada skala kecil.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="telefun-stage-demo"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

test.describe("Telefun cek mikrofon ditolak (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("izin mikrofon ditolak: penjelasan, Coba lagi, dan Mulai panggilan nonaktif", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: () =>
          Promise.reject(new DOMException("denied", "NotAllowedError")),
      });
    });
    const audit = await open(page, "/telefun", telefunMocks([]));
    await page
      .getByRole("button", { name: /^Mulai simulasi/ })
      .click({ timeout: 20000 });
    const picker = page.getByRole("dialog", { name: "Siapa yang berlatih?" });
    await expect(picker.getByText("Mikrofon belum diizinkan")).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Coba lagi" }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Mulai panggilan" }),
    ).toBeDisabled();
    expectHermetic(audit);
  });
});

test.describe("Telefun Pengaturan (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("kategori berlabel jelas, sakelar skenario, perubahan ditandai, tutup memakai konfirmasi aplikasi", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", [
      ...telefunMocks([]),
      {
        method: "PUT",
        path: "/api/v1/telefun/settings",
        body: { success: true, data: null },
      },
    ]);
    let nativeDialog = false;
    page.on("dialog", (dialog) => {
      nativeDialog = true;
      void dialog.dismiss();
    });

    await page
      .getByRole("navigation", { name: "Menu Telefun" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Pengaturan Telefun" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText("Berlaku untuk panggilan yang Anda mulai berikutnya."),
    ).toBeVisible();

    const tabs = dialog.getByRole("tablist", { name: "Bagian pengaturan" });
    for (const label of [
      /^Skenario\s*\d+\/\d+/,
      /^Karakter konsumen/,
      /^Identitas konsumen/,
      /^Sesi & AI/,
    ]) {
      await expect(tabs.getByRole("tab", { name: label })).toBeVisible();
    }

    // Baru dibuka tanpa perubahan: tidak ada penanda palsu.
    await expect(dialog.getByText("Belum disimpan")).toHaveCount(0);

    const firstSwitch = dialog.getByRole("switch").first();
    const before = await firstSwitch.getAttribute("aria-checked");
    await firstSwitch.click();
    await expect(firstSwitch).not.toHaveAttribute("aria-checked", before ?? "");
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();

    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    const confirm = page.getByRole("dialog", {
      name: "Tutup tanpa menyimpan?",
    });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Lanjut mengubah" }).click();

    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(dialog).toBeHidden();
    await waitForMockedApi(audit, ["PUT /api/v1/telefun/settings"]);
    expect(nativeDialog).toBe(false);
    expectHermetic(audit);
  });

  test("karakter konsumen terakhir tidak bisa dihapus", async ({ page }) => {
    const audit = await open(
      page,
      "/telefun",
      telefunMocks([], {
        consumerTypes: [
          {
            id: "only-consumer",
            name: "Pak Budi",
            gender: "random",
            description: "Konsumen sabar yang ingin penjelasan rinci.",
            difficulty: "Medium",
          },
        ],
      }),
    );
    await page
      .getByRole("navigation", { name: "Menu Telefun" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Pengaturan Telefun" });
    await dialog.getByRole("tab", { name: /^Karakter konsumen/ }).click();
    // Tanpa karakter, panggilan berikutnya tidak punya persona konsumen.
    await expect(
      dialog.getByRole("button", { name: "Hapus Pak Budi" }),
    ).toBeDisabled();
    await expect(
      dialog.getByText("Minimal satu karakter konsumen harus ada."),
    ).toBeVisible();
    expectHermetic(audit);
  });

  test("isi tiap kategori mengikuti KETIK: judul, filter, baris karakter, grup radio, tanpa tantangan", async ({
    page,
  }) => {
    const audit = await open(page, "/telefun", telefunMocks([]));
    await page
      .getByRole("navigation", { name: "Menu Telefun" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Pengaturan Telefun" });
    await expect(dialog).toBeVisible();

    // Skenario: judul, filter kategori, dan editor dengan sakelar Ikuti skrip.
    await expect(
      dialog.getByRole("heading", { name: "Skenario", exact: true }),
    ).toBeVisible();
    const filter = dialog.getByRole("group", { name: "Filter kategori" });
    await filter.getByRole("button", { name: "Pinjol", exact: true }).click();
    await expect(
      filter.getByRole("button", { name: "Pinjol", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    const rows = dialog.getByRole("list").first().getByRole("listitem");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(rows.nth(index)).toContainText("Pinjol");
    }
    await filter.getByRole("button", { name: "Semua", exact: true }).click();

    await dialog.getByRole("button", { name: "Skenario baru" }).click();
    await expect(
      dialog.getByRole("heading", { name: "Skenario baru", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("switch", { name: "Ikuti skrip" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      dialog.getByRole("button", { name: "Terapkan" }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Kembali ke daftar" }).click();

    // Karakter konsumen: baris pilihan, kesulitan dalam bahasa Indonesia.
    await dialog.getByRole("tab", { name: /^Karakter konsumen/ }).click();
    await expect(
      dialog.getByRole("heading", { name: "Karakter konsumen", exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Pakai karakter Marah & Emosional" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "Pakai karakter Acak" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      dialog.getByRole("listitem").filter({ hasText: "Marah & Emosional" }),
    ).toContainText("Sulit");
    await expect(
      dialog.getByRole("button", { name: "Karakter baru" }),
    ).toBeVisible();

    // Identitas konsumen: judul yang sama dengan nama kategori.
    await dialog.getByRole("tab", { name: /^Identitas konsumen/ }).click();
    await expect(
      dialog.getByRole("heading", { name: "Identitas konsumen", exact: true }),
    ).toBeVisible();

    // Sesi & AI: durasi, tempo, model sebagai grup radio; tantangan percakapan sudah dihapus.
    await dialog.getByRole("tab", { name: /^Sesi & AI/ }).click();
    await expect(
      dialog.getByRole("heading", { name: "Sesi & AI", exact: true }),
    ).toBeVisible();
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Durasi panggilan" })
        .getByRole("radio", { name: "5 menit", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Tempo bicara konsumen" })
        .getByRole("radio", { name: /^Natural/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Model AI" })
        .getByRole("radio", { checked: true }),
    ).toHaveCount(1);

    await expect(dialog.getByText("Tantangan percakapan")).toHaveCount(0);
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);

    const offenders = await findTextBelowFloor(dialog);
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("Gemini 3.0 Flash Live yang sudah pensiun tidak ditawarkan, pilihan tersimpannya kembali ke 3.8", async ({
    page,
  }) => {
    const audit = await open(
      page,
      "/telefun",
      telefunMocks([], {
        telefunModelId: "gemini-3.0-flash-live-preview",
        telefunTransport: "gemini-live",
      }),
    );
    await page
      .getByRole("navigation", { name: "Menu Telefun" })
      .getByRole("button", { name: /^Pengaturan/ })
      .click({ timeout: 20000 });
    const dialog = page.getByRole("dialog", { name: "Pengaturan Telefun" });
    await dialog.getByRole("tab", { name: /^Sesi & AI/ }).click();

    const models = dialog.getByRole("radiogroup", { name: "Model AI" });
    await expect(models.getByRole("radio")).toHaveCount(2);
    await expect(
      models.getByRole("radio", { name: /^Gemini 3\.8 Live/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      models.getByRole("radio", { name: /^Gemini 3\.1 Flash Live/ }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(dialog.getByText(/Gemini 3\.0/)).toHaveCount(0);
    await expect(
      dialog.getByRole("status").filter({
        hasText: "Pilihan model lama telah dikembalikan ke Gemini.",
      }),
    ).toBeVisible();
    expectHermetic(audit);
  });
});
