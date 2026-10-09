/**
 * E2E perilaku halaman Periode QA SIDAK (`/sidak/periods`).
 *
 * Hermetic: semua `/api` dijawab harness stateful (`sidakPeriodsHarness.ts`),
 * guard jaringan fail-closed, target dibuktikan dev-server lokal. Tidak ada
 * Supabase/produksi yang disentuh. Kontrak: `plans/markdown/sidak-periods-redesign.md`.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  assertLocalDevOnlyTarget,
  captured,
  capturedParams,
  clearFailures,
  emptyStore,
  expectIsolation,
  failAlways,
  failNext,
  openPeriods,
  resetStore,
  SEED,
  startAudit,
  storedPeriods,
  USED_ID,
  USED_MESSAGE,
  type OpenPeriodsOptions,
} from "./helpers/sidakPeriodsHarness";

test.beforeAll(async () => {
  await assertLocalDevOnlyTarget();
});

test.beforeEach(() => {
  resetStore();
});

const currentYear = new Date().getFullYear();

async function open(page: Page, opts: OpenPeriodsOptions = {}) {
  const audit = startAudit();
  await openPeriods(page, audit, opts);
  await expect(
    page.getByRole("heading", { level: 1, name: "Periode QA" }),
  ).toBeVisible({ timeout: 20000 });
  return audit;
}

const combo = (page: Page, name: string) =>
  page.getByRole("combobox", { name, exact: true });
const addButton = (page: Page) =>
  page.getByRole("button", { name: /^(Tambah periode|Menyimpan…)$/ });

async function pick(page: Page, name: "Bulan" | "Tahun", option: string) {
  await combo(page, name).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("Periode QA (SIDAK)", () => {
  test("a layout: h1, daftar per tahun terbaru dulu, tombol Hapus terlihat tanpa hover", async ({
    page,
  }) => {
    const audit = await open(page);

    await expect(
      page.getByRole("heading", { level: 1, name: "Periode QA" }),
    ).toHaveCount(1);

    // Subjudul tahun: 2026, 2025, 2023 (terbaru dulu).
    const yearHeadings = page.getByRole("heading", { level: 2 });
    await expect(yearHeadings).toHaveText(["2026", "2025", "2023"]);

    // Baris dalam 2026: Oktober lalu Maret (terbaru dulu).
    const rows2026 = page.getByRole("list", { name: "Periode 2026" }).getByRole("listitem");
    await expect(rows2026).toHaveCount(2);
    await expect(rows2026.nth(0)).toContainText("Oktober");
    await expect(rows2026.nth(1)).toContainText("Maret");

    // Tombol hapus langsung terlihat (tanpa hover), punya nama aksesibel.
    for (const label of ["Hapus Oktober 2026", "Hapus Maret 2026", "Hapus Februari 2025", "Hapus Desember 2023"]) {
      const btn = page.getByRole("button", { name: label, exact: true });
      await expect(btn).toBeVisible();
      await expect(btn).toHaveCSS("opacity", "1");
    }

    // Tanpa label uppercase tracking gaya lama.
    expect(
      await page.locator("div.max-w-3xl .uppercase").count(),
      "tidak ada teks uppercase di konten halaman",
    ).toBe(0);
    expectIsolation(audit);
  });

  test("b tambah: pilih Bulan/Tahun menghasilkan tepat satu POST, baris baru, toast sukses", async ({
    page,
  }) => {
    const audit = await open(page);

    await pick(page, "Bulan", "Agustus");
    await pick(page, "Tahun", "2026");
    await expect(addButton(page)).toBeEnabled();
    await addButton(page).click();

    await expect(page.getByText("Periode Agustus 2026 ditambahkan.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Hapus Agustus 2026", exact: true }),
    ).toBeVisible();
    expect(captured("createPeriod")).toEqual([{ month: 8, year: 2026 }]);
    // Urutan terbaru dulu: Oktober, Agustus, Maret.
    const rows = page.getByRole("list", { name: "Periode 2026" }).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("Agustus");
    expectIsolation(audit);
  });

  test("b2 tambah gagal: toast manusiawi, tanpa pesan mentah, tanpa banner menempel", async ({
    page,
  }) => {
    await open(page);
    failNext("createPeriod");
    await pick(page, "Bulan", "Agustus");
    await pick(page, "Tahun", "2026");
    await addButton(page).click();

    await expect(page.getByText("Periode gagal ditambahkan. Coba lagi.")).toBeVisible();
    await expect(page.getByText(/pg 23505|insert failed/)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Hapus Agustus 2026", exact: true }),
    ).toHaveCount(0);
    await expect(addButton(page)).toBeEnabled();
    expect(captured("createPeriod")).toHaveLength(1);
  });

  test("c duplikat: tombol nonaktif + teks 'sudah ada', tanpa POST", async ({ page }) => {
    await open(page);

    await pick(page, "Bulan", "Maret");
    await pick(page, "Tahun", "2026");

    await expect(addButton(page)).toBeDisabled();
    await expect(page.getByText("Periode Maret 2026 sudah ada.")).toBeVisible();
    expect(captured("createPeriod")).toHaveLength(0);

    // Ganti ke kombinasi baru: pesan hilang, tombol aktif lagi.
    await pick(page, "Bulan", "April");
    await expect(page.getByText(/sudah ada\./)).toHaveCount(0);
    await expect(addButton(page)).toBeEnabled();
  });

  test("d hapus: dialog; Batal dan Escape tanpa DELETE + fokus kembali; Hapus = satu DELETE", async ({
    page,
  }) => {
    const audit = await open(page);
    const trigger = page.getByRole("button", { name: "Hapus Januari 2025", exact: true });

    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Hapus periode?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Januari 2025");
    await expect(dialog).toContainText("tidak dapat dibatalkan");
    await expect(dialog).toContainText("sudah punya data temuan");

    // Batal
    await dialog.getByRole("button", { name: "Batal" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(capturedParams("deletePeriod")).toHaveLength(0);

    // Escape
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(capturedParams("deletePeriod")).toHaveLength(0);

    // Hapus
    await trigger.click();
    await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
    await expect(page.getByText("Periode Januari 2025 dihapus.")).toBeVisible();
    await expect(trigger).toHaveCount(0);
    const target = SEED.find((p) => p.month === 1 && p.year === 2025)!;
    expect(capturedParams("deletePeriod")).toEqual([target.id]);
    expect(storedPeriods().some((p) => p.id === target.id)).toBe(false);
    expectIsolation(audit);
  });

  test("e hapus ditolak backend: toast berbahasa Indonesia, baris tetap ada", async ({ page }) => {
    await open(page);
    const row = page.getByRole("button", { name: "Hapus Oktober 2026", exact: true });
    await row.click();
    await page
      .getByRole("dialog", { name: "Hapus periode?" })
      .getByRole("button", { name: "Hapus", exact: true })
      .click();

    await expect(page.getByText(USED_MESSAGE)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toBeVisible();
    expect(capturedParams("deletePeriod")).toEqual([USED_ID]);
    expect(storedPeriods().some((p) => p.id === USED_ID)).toBe(true);
    // Tidak ada banner error menempel di halaman.
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("f rentang tahun: tahun terlama di data - 1 s.d. tahun berjalan + 1", async ({ page }) => {
    await open(page);
    await combo(page, "Tahun").click();
    const options = page.getByRole("option");
    const texts = (await options.allTextContents()).map((t) => t.trim());
    const years = texts.map(Number);
    expect(Math.min(...years)).toBe(Math.min(2023 - 1, currentYear - 1));
    expect(Math.max(...years)).toBe(currentYear + 1);
    expect(texts).toContain("2022");
    expect(texts).toContain(String(currentYear));
    expect(texts).not.toContain("2021");
    await page.keyboard.press("Escape");
  });

  test("h kosong: panel kosong + form tetap terlihat; gagal muat: pesan + Coba lagi", async ({
    page,
  }) => {
    emptyStore();
    await open(page);
    await expect(page.getByText("Belum ada periode")).toBeVisible();
    await expect(combo(page, "Bulan")).toBeVisible();
    await expect(addButton(page)).toBeVisible();
  });

  test("h2 gagal memuat daftar: pesan + Coba lagi memuat ulang", async ({ page }) => {
    failAlways("listPeriods");
    const audit = startAudit();
    await openPeriods(page, audit);
    await expect(
      page.getByRole("heading", { level: 1, name: "Periode QA" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Periode gagal dimuat")).toBeVisible();
    clearFailures();
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(
      page.getByRole("button", { name: "Hapus Oktober 2026", exact: true }),
    ).toBeVisible();
  });

  for (const vp of [
    { name: "390", width: 390, height: 844 },
    { name: "1440", width: 1440, height: 900 },
  ]) {
    test(`g ${vp.name}: tanpa overflow horizontal, kontrol >= 44px`, async ({ page }) => {
      await open(page, { viewport: { width: vp.width, height: vp.height } });

      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(overflow.doc).toBeLessThanOrEqual(0);
      expect(overflow.body).toBeLessThanOrEqual(0);

      const targets = [
        combo(page, "Bulan"),
        combo(page, "Tahun"),
        addButton(page),
        page.getByRole("button", { name: "Hapus Oktober 2026", exact: true }),
        page.getByRole("button", { name: "Hapus Desember 2023", exact: true }),
      ];
      for (const t of targets) {
        const box = await t.boundingBox();
        expect(box, "kontrol punya bounding box").not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(43.5);
        expect(box!.width).toBeGreaterThanOrEqual(43.5);
      }
    });
  }
});
