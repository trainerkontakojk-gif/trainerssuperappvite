/**
 * KETIK — landing berbasis data, ruang chat, tahap Telaah, dan halaman Riwayat
 * (hermetic). Semua `/api` dimock; mutasi data nyata tetap milik spec backend.
 *
 * Fixture settings memakai `DEFAULT_KETIK_SETTINGS` dari `@trainers/types`,
 * supaya spec gagal ketika UI menyimpang dari kontrak bersama.
 */

import { expect, test } from "@playwright/test";
import { type KetikAppSettings } from "@trainers/types";
import {
  APP_ORIGIN,
  expectHermetic,
  waitForMockedApi,
  type ApiMock,
} from "./helpers/hermeticShell";
import { assertLocalDevOnlyTargetAt as assertLocalDevOnlyTarget } from "./helpers/sidakJadwalShiftingHarness";
import { findLowContrastText, setDocumentTheme } from "./helpers/textContrast";
import { MIN_TEXT_PX, findTextBelowFloor } from "./helpers/typographyFloor";
import {
  PENDING_SESSION,
  FULL_HISTORY,
  FAST_SETTINGS,
  historyPage,
  ketikMocks,
  reviewDetailMock,
  open,
  SETTINGS_FOR_DIALOG,
  SCRIPTED_SCENARIO,
  INACTIVE_SCENARIO,
  openKetikSettings,
} from "./helpers/ketikFlowHarness";

test.describe("KETIK landing (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  for (const backup of [false, true]) {
    test(`settings failure blocks simulation and retries without silent defaults (backup=${backup})`, async ({
      page,
    }) => {
      if (backup) {
        await page.addInitScript((settings) => {
          localStorage.setItem(
            "ketik_settings_backup:user-1",
            JSON.stringify({
              userId: "user-1",
              version: "2026-10-14T05:00:00.000Z",
              settings,
            }),
          );
        }, FAST_SETTINGS);
      }
      const settingsMock: ApiMock = {
        method: "GET",
        path: "/api/v1/ketik/settings",
        status: 500,
        body: {
          success: false,
          error: {
            code: "SETTINGS_LOAD_FAILED",
            message: "Pengaturan belum bisa dimuat. Coba lagi.",
          },
        },
      };
      const audit = await open(page, "/ketik", [
        settingsMock,
        ...ketikMocks([]),
      ]);
      const start = page.getByRole("button", { name: /^Mulai simulasi/ });
      const settings = page
        .getByRole("navigation", { name: "Menu KETIK" })
        .getByRole("button", { name: "Pengaturan", exact: true });
      await expect(page.getByRole("alert")).toContainText(
        "Pengaturan belum bisa dimuat.",
        { timeout: 20000 },
      );
      await expect(start).toBeDisabled();
      await expect(settings).toBeDisabled();
      if (!backup) {
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 });
          const alert = page.getByRole("alert");
          const bounds = await alert.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
          const retry = page.getByRole("button", {
            name: "Coba muat pengaturan",
          });
          expect(
            await retry.evaluate(
              (element) => (element as HTMLElement).offsetHeight,
            ),
          ).toBeGreaterThanOrEqual(44);
          await page.screenshot({
            path: test.info().outputPath(`settings-error-${width}.png`),
          });
        }
      }
      const initialRequests = audit.mockedApi.filter((path) =>
        path.endsWith("/ketik/settings"),
      ).length;
      await page.getByRole("button", { name: "Coba muat pengaturan" }).click();
      await expect
        .poll(
          () =>
            audit.mockedApi.filter((path) => path.endsWith("/ketik/settings"))
              .length,
        )
        .toBe(initialRequests + 1);
      await expect(start).toBeDisabled();
      settingsMock.status = 200;
      settingsMock.body = { success: true, data: FAST_SETTINGS };
      settingsMock.headers = {
        "x-settings-version": "2026-10-15T05:00:00.000Z",
      };
      await page.getByRole("button", { name: "Coba muat pengaturan" }).click();
      await expect(start).toBeEnabled();
      await expect(settings).toBeEnabled();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: /pesan/i })).toHaveCount(
        0,
      );
      await waitForMockedApi(audit, ["/ketik/settings", "/ketik/history"]);
      expectHermetic(audit);
    });
  }

  test("hero memberi satu aksi utama, menu kecil, dan demo yang bisa dijeda", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik", ketikMocks(FULL_HISTORY));

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /Pahami konsumennya\.\s*Balas chat dengan tepat\./,
      }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Kelas Etika & Trik Komunikasi/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Mulai simulasi/ }),
    ).toBeVisible();

    const menu = page.getByRole("navigation", { name: "Menu KETIK" });
    for (const label of ["Riwayat", "Pemakaian AI", "Pengaturan"]) {
      await expect(
        menu.getByRole("button", { name: new RegExp(`^${label}`) }),
        `menu "${label}" tidak tampil`,
      ).toBeVisible();
    }

    // Demo berjalan sendiri dan punya tombol jeda (WCAG 2.2.2).
    const pause = page.getByRole("button", { name: "Jeda animasi" });
    await expect(pause).toBeVisible();
    await pause.click();
    await expect(
      page.getByRole("button", { name: "Putar animasi" }),
    ).toBeVisible();

    await waitForMockedApi(audit, ["/ketik/settings", "/ketik/history"]);
    expectHermetic(audit);
  });

  test("bagian data dihitung dari riwayat: progres, tindak lanjut, fokus, hasil terbaru", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik", [
      ...ketikMocks(FULL_HISTORY),
      reviewDetailMock,
    ]);

    const progress = page.getByTestId("ketik-progress-summary");
    // 4 sesi dalam 3 hari terakhir: semuanya masuk bulan ini kecuali bila
    // hari ini tanggal 1-2; hitungan bulan diuji lewat angka rata-rata saja.
    await expect(progress).toContainText("79", { timeout: 20000 });
    await expect(progress).toContainText("rata-rata skor dari 2 sesi terakhir");
    await expect(progress).toContainText("sesi bulan ini");

    const followUp = page.getByRole("region", { name: "Perlu tindak lanjut" });
    await expect(followUp.getByText("Klaim Asuransi Ditolak")).toBeVisible();
    await expect(followUp.getByText(/Telaah gagal/)).toBeVisible();
    await expect(followUp.getByText("Pengecekan SLIK")).toBeVisible();
    await expect(followUp.getByText(/Belum ditelaah/)).toBeVisible();

    const focus = page.getByRole("region", { name: "Fokus berikutnya" });
    await expect(focus).toContainText("Probing");
    await expect(focus).toContainText("67");

    const recent = page.getByRole("region", { name: "Hasil telaah terbaru" });
    const firstRow = recent.getByRole("row").nth(1);
    await expect(firstRow).toContainText("Tagihan Kartu Kredit");
    await expect(firstRow).toContainText("Probing");
    await expect(firstRow).toContainText("82");

    // Baris membuka tahap Telaah lewat URL.
    await recent.getByRole("button", { name: "Tagihan Kartu Kredit" }).click();
    await expect(page).toHaveURL(/sesi=ketik-reviewed-1/);
    await expect(page).toHaveURL(/tahap=telaah/);
    expectHermetic(audit);
  });

  test("pengguna baru melihat ajakan, bukan angka kosong", async ({ page }) => {
    const audit = await open(page, "/ketik", ketikMocks([]));
    await expect(
      page.getByRole("heading", { name: "Belum ada latihan" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("ketik-progress-summary")).toHaveCount(0);
    expectHermetic(audit);
  });

  test("riwayat yang gagal dimuat bisa dicoba lagi", async ({ page }) => {
    const audit = await open(page, "/ketik", [
      ketikMocks([])[0],
      {
        method: "GET",
        path: "/api/v1/ketik/history/summary",
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

  test("tombol Mulai simulasi dan aksen KETIK memenuhi kontras WCAG di tema terang dan gelap", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik", ketikMocks(FULL_HISTORY));
    const start = page.getByRole("button", { name: /^Mulai simulasi/ });
    await expect(start).toBeVisible({ timeout: 20000 });
    await waitForMockedApi(audit, ["/ketik/settings", "/ketik/history"]);

    for (const theme of ["light", "dark"] as const) {
      await setDocumentTheme(page, theme);
      const buttons = await findLowContrastText(start.locator("../.."), {
        selector: "button",
      });
      expect(buttons, `${theme}: ${buttons.join("\n")}`).toEqual([]);
      const main = page.locator("main").first();
      const accent = await findLowContrastText(main, {
        selector: ".text-module-ketik:not(h1 *)",
      });
      expect(accent, `${theme}: ${accent.join("\n")}`).toEqual([]);
      // Aksen judul hero adalah teks besar (≥18px tebal): batas WCAG 3:1.
      const hero = await findLowContrastText(main, {
        selector: "h1 .text-module-ketik",
        minRatio: 3,
      });
      expect(hero, `${theme}: ${hero.join("\n")}`).toEqual([]);
    }
    expectHermetic(audit);
  });

  test(`teks landing KETIK minimal ${MIN_TEXT_PX}px`, async ({ page }) => {
    const audit = await open(page, "/ketik", ketikMocks(FULL_HISTORY));
    await expect(page.getByTestId("ketik-progress-summary")).toBeVisible({
      timeout: 20000,
    });

    // Demo chat (aria-hidden) meniru layar chat pada skala kecil.
    const offenders = await findTextBelowFloor(page.locator("main").first(), {
      exclude: '[data-testid="ketik-stage-demo"]',
    });
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

test.describe("KETIK Riwayat (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("halaman Riwayat berupa tabel dengan filter status dan penanda peserta", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik/history", ketikMocks(FULL_HISTORY));
    await expect(
      page.getByRole("heading", { level: 1, name: "Riwayat latihan" }),
    ).toBeVisible({ timeout: 20000 });

    const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
    await expect(table.getByRole("row")).toHaveCount(5);
    await expect(table).toContainText("data peserta sudah dihapus");

    await page.getByRole("button", { name: /^Gagal/ }).click();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("Klaim Asuransi Ditolak");

    await page.getByRole("button", { name: /^Semua/ }).click();
    await page.getByRole("searchbox", { name: "Cari sesi" }).fill("slik");
    await expect(table.getByRole("row")).toHaveCount(2);

    await waitForMockedApi(audit, ["/ketik/history"]);
    expectHermetic(audit);
  });

  test("hapus sesi memakai dialog konfirmasi aplikasi", async ({ page }) => {
    const audit = await open(page, "/ketik/history", [
      ...ketikMocks(FULL_HISTORY),
      {
        method: "DELETE",
        path: `/api/v1/ketik/history/${PENDING_SESSION.id}`,
        body: { success: true, message: "ok" },
      },
    ]);
    let nativeDialog = false;
    page.on("dialog", (dialog) => {
      nativeDialog = true;
      void dialog.dismiss();
    });

    const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
    await table
      .getByRole("button", { name: "Hapus sesi Pengecekan SLIK" })
      .click({ timeout: 20000 });
    const confirm = page.getByRole("dialog", { name: "Hapus sesi ini?" });
    await page.route("**/api/v1/ketik/history?*", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: historyPage(
            FULL_HISTORY.filter((s) => s.id !== PENDING_SESSION.id),
            FULL_HISTORY.filter((s) => s.id !== PENDING_SESSION.id),
          ),
        },
      }),
    );
    await confirm.getByRole("button", { name: "Hapus sesi" }).click();
    await expect(table).not.toContainText("Pengecekan SLIK");
    expect(nativeDialog).toBe(false);
    expectHermetic(audit);
  });

  test("replay sesi adalah dialog modal: berlabel, Escape menutup, fokus kembali", async ({
    page,
  }) => {
    const audit = await open(page, "/ketik/history", ketikMocks(FULL_HISTORY));
    const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
    const replayTrigger = table.getByRole("button", {
      name: "Putar ulang Pinjol Ilegal",
    });
    await replayTrigger.click({ timeout: 20000 });

    const replay = page.getByRole("dialog", { name: "Pinjol Ilegal" });
    await expect(replay).toBeVisible();
    await expect(replay).toHaveAttribute("aria-modal", "true");
    await expect
      .poll(() => replay.evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);

    await expect(replay.getByText("1 / 2")).toBeVisible();
    await replay.getByTitle("Next").click();
    await expect(replay.getByText("2 / 2")).toBeVisible();
    await expect(replay.getByText("Mohon maaf, saya bantu cek.")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(replay).toBeHidden();
    await expect(replayTrigger).toBeFocused();

    await replayTrigger.click();
    await replay.getByRole("button", { name: "Tutup replay" }).click();
    await expect(replay).toBeHidden();
    expectHermetic(audit);
  });

  test(`teks Riwayat dan replay KETIK minimal ${MIN_TEXT_PX}px`, async ({
    page,
  }) => {
    const audit = await open(page, "/ketik/history", ketikMocks(FULL_HISTORY));
    const table = page.getByRole("table", { name: "Daftar sesi KETIK" });
    await expect(table).toBeVisible({ timeout: 20000 });
    const offenders = (
      await findTextBelowFloor(page.locator("main").first())
    ).map((o) => `[riwayat] ${o}`);
    await table
      .getByRole("button", { name: "Putar ulang Tagihan Kartu Kredit" })
      .click();
    const replay = page.getByRole("dialog", { name: "Tagihan Kartu Kredit" });
    await expect(replay.getByText("Tagihan saya dobel.").first()).toBeVisible();
    offenders.push(
      ...(await findTextBelowFloor(replay)).map((o) => `[replay] ${o}`),
    );
    const unique = [...new Set(offenders)];
    expect(unique, unique.join("\n")).toEqual([]);
    expectHermetic(audit);
  });
});

test.describe("KETIK Pengaturan (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("kategori berlabel jelas, daftar skenario bisa dicari dan disaring", async ({
    page,
  }) => {
    const { audit, dialog } = await openKetikSettings(page);
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });

    await expect(
      dialog.getByText("Berlaku untuk sesi yang Anda mulai berikutnya."),
    ).toBeVisible();
    await expect(
      dialog.getByRole("tab", { name: /^Skenario\s*5\/6$/ }),
    ).toBeVisible();
    for (const tab of [
      /^Karakter konsumen/,
      /^Identitas konsumen/,
      /^Template cepat/,
      /^Sesi & AI/,
    ]) {
      await expect(dialog.getByRole("tab", { name: tab })).toBeVisible();
    }

    const scriptedRow = dialog
      .getByRole("listitem")
      .filter({ hasText: SCRIPTED_SCENARIO.title });
    await expect(scriptedRow).toContainText(SCRIPTED_SCENARIO.category);
    await expect(scriptedRow).toContainText("Ikuti skrip");
    const inactiveRow = dialog
      .getByRole("listitem")
      .filter({ hasText: INACTIVE_SCENARIO.title });
    await expect(inactiveRow).toContainText("Bebas");
    await expect(
      inactiveRow.getByRole("switch", {
        name: `Aktifkan ${INACTIVE_SCENARIO.title}`,
      }),
    ).toHaveAttribute("aria-checked", "false");

    await dialog
      .getByRole("group", { name: "Filter kategori" })
      .getByRole("button", { name: INACTIVE_SCENARIO.category })
      .click();
    await expect(scriptedRow).toHaveCount(0);
    await expect(inactiveRow).toBeVisible();
    await dialog
      .getByRole("group", { name: "Filter kategori" })
      .getByRole("button", { name: "Semua" })
      .click();
    await dialog
      .getByRole("searchbox", { name: "Cari skenario" })
      .fill("zzz-tidak-ada");
    await expect(
      dialog.getByText("Tidak ada skenario yang cocok"),
    ).toBeVisible();
    await dialog.getByRole("searchbox", { name: "Cari skenario" }).fill("");

    // Hapus skenario lewat dialog aplikasi.
    await scriptedRow
      .getByRole("button", { name: `Hapus ${SCRIPTED_SCENARIO.title}` })
      .click();
    const confirmDelete = page.getByRole("dialog", {
      name: "Hapus skenario ini?",
    });
    await expect(confirmDelete).toBeVisible();
    await confirmDelete.getByRole("button", { name: "Batal" }).click();
    await expect(scriptedRow).toBeVisible();

    // Karakter konsumen: baris dengan pilihan "Acak".
    await dialog.getByRole("tab", { name: /^Karakter konsumen/ }).click();
    await expect(
      dialog.getByRole("button", { name: "Pakai karakter Acak" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      dialog.getByRole("button", { name: "Karakter baru" }),
    ).toBeVisible();

    // Template cepat: baris kata kunci, standar dari admin tidak bisa diubah agen.
    await dialog.getByRole("tab", { name: /^Template cepat/ }).click();
    await expect(dialog.getByText("/selesai")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Template pribadi baru" }),
    ).toBeVisible();

    // Sesi & AI: durasi dan tempo sebagai pilihan radio; durasi tidak tampil ke peserta.
    await dialog.getByRole("tab", { name: /^Sesi & AI/ }).click();
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Durasi sesi" })
        .getByRole("radio", { name: "5 menit", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      dialog.getByText(/Peserta tidak melihat durasi/),
    ).toBeVisible();
    await expect(
      dialog
        .getByRole("radiogroup", { name: "Tempo balasan konsumen" })
        .getByRole("radio", { name: /^Realistis/ }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      dialog.getByRole("radiogroup", { name: "Model AI" }),
    ).toBeVisible();

    const offenders = await findTextBelowFloor(dialog);
    expect(offenders, offenders.join("\n")).toEqual([]);
    expectHermetic(audit);
  });

  test("perubahan ditandai, tutup meminta konfirmasi aplikasi, Simpan mengirim pengaturan", async ({
    page,
  }) => {
    const { audit, dialog } = await openKetikSettings(page);
    page.on("dialog", () => {
      throw new Error("window.confirm tidak boleh dipakai");
    });

    await expect(dialog.getByText("Belum disimpan")).toHaveCount(0);
    const row = dialog
      .getByRole("listitem")
      .filter({ hasText: SCRIPTED_SCENARIO.title });
    await row
      .getByRole("switch", { name: `Nonaktifkan ${SCRIPTED_SCENARIO.title}` })
      .click();
    await expect(dialog.getByText("Belum disimpan")).toBeVisible();
    await expect(
      dialog.getByRole("tab", { name: /^Skenario\s*4\/6$/ }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
    const discard = page.getByRole("dialog", {
      name: "Tutup tanpa menyimpan?",
    });
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Lanjut mengubah" }).click();
    await expect(discard).toHaveCount(0);

    // Pulihkan bawaan juga memakai dialog aplikasi.
    await dialog.getByRole("button", { name: "Pulihkan bawaan" }).click();
    const reset = page.getByRole("dialog", {
      name: "Pulihkan pengaturan bawaan?",
    });
    await expect(reset).toBeVisible();
    await reset.getByRole("button", { name: "Batal" }).click();
    await expect(reset).toHaveCount(0);

    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        new URL(request.url()).pathname === "/api/v1/ketik/settings",
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    const saved = (await saveRequest).postDataJSON() as KetikAppSettings;
    expect(
      saved.scenarios.find((item) => item.id === SCRIPTED_SCENARIO.id)
        ?.isActive,
    ).toBe(false);
    await expect(
      page.getByRole("dialog", { name: "Pengaturan KETIK" }),
    ).toHaveCount(0);
    expectHermetic(audit);
  });
});

test.describe("KETIK pilihan model AI (hermetic)", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget(APP_ORIGIN);
  });

  test("hanya Gemini 4 Hydrogen, 3.8 Flash, dan 3.5 Flash Lite; model lama tersimpan pindah ke bawaan", async ({
    page,
  }) => {
    const { audit, dialog } = await openKetikSettings(page, {
      ...SETTINGS_FOR_DIALOG,
      selectedModel: "gpt-5.4-mini",
    });
    await dialog.getByRole("tab", { name: /^Sesi & AI/ }).click();
    const models = dialog
      .getByRole("radiogroup", { name: "Model AI" })
      .getByRole("radio");
    await expect(models).toHaveCount(3);
    const hydrogen = models.filter({ hasText: "Gemini 4 Hydrogen" });
    const flash = models.filter({ hasText: "Gemini 3.8 Flash" });
    const lite = models.filter({ hasText: "Gemini 3.5 Flash Lite" });
    await expect(hydrogen).toHaveAttribute("aria-checked", "false");
    await expect(flash).toHaveAttribute("aria-checked", "true");
    await expect(lite).toHaveAttribute("aria-checked", "false");

    await lite.click();
    const saveRequest = page.waitForRequest(
      (request) =>
        request.method() === "PUT" &&
        new URL(request.url()).pathname === "/api/v1/ketik/settings",
    );
    await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
    const saved = (await saveRequest).postDataJSON() as KetikAppSettings;
    expect(saved.selectedModel).toBe("gemini-3.5-flash-lite");
    expectHermetic(audit);
  });
});

test("KETIK agent without assignment cannot start but can edit personal settings", async ({
  page,
}) => {
  await assertLocalDevOnlyTarget(APP_ORIGIN);
  const audit = await open(
    page,
    "/ketik",
    [
      {
        method: "GET",
        path: "/api/v1/ketik/assignments/self",
        body: {
          success: true,
          data: { assignment: null, recipientSettingsVersion: "absent" },
        },
      },
      ...ketikMocks([]),
    ],
    "agent",
  );
  await expect(
    page.getByRole("button", { name: /^Mulai simulasi/ }),
  ).toBeDisabled();
  await expect(page.getByText(/Belum ada penugasan/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pengaturan", exact: true }),
  ).toBeEnabled();
  expectHermetic(audit);
});
