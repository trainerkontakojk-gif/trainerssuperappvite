/**
 * E2E import batch SIDAK dengan kolom tanggal.
 *
 * Berkas `.xlsx` di sini dibuat sungguhan dengan ExcelJS, bukan objek tebakan,
 * supaya parsing header, sel bertanggal Excel, dan pergeseran timezone benar-benar
 * diuji lewat jalur yang sama dengan pengguna.
 *
 * Selalu ada allowlist jaringan fail-closed seperti harness Input Audit; tidak
 * ada request yang sampai ke database nyata.
 */

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  allRows,
  captured,
  expectIsolation,
  FIXTURE,
  lastBatchItems,
  openInputAudit,
  resetStore,
  selectPeriod,
  startAudit,
  type Audit,
} from "./helpers/sidakTemuanDatesHarness";

const HEADERS_LEGACY = [
  "No. Tiket",
  "Parameter / Sub-parameter",
  "Nilai (0-3)",
  "Ketidaksesuaian",
  "Sebaiknya",
];
const HEADER_TGL_LAYANAN = "Tanggal Layanan (YYYY-MM-DD)";
const HEADER_TGL_SAMPEL = "Tanggal Sampel (YYYY-MM-DD)";

type Cell = string | number | Date | null;

/**
 * Bangun workbook "Input Temuan" dengan header yang bisa dipilih bebas, supaya
 * test bisa membuktikan parsing berbasis HEADER (bukan posisi kolom).
 */
async function buildXlsx(opts: {
  headers: string[];
  rows: Cell[][];
  sheetName?: string;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName ?? "Input Temuan");
  ws.addRow(opts.headers);
  for (const row of opts.rows) ws.addRow(row);
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function legacyRow(over: Partial<Record<string, Cell>> = {}): Cell[] {
  return [
    over.tiket ?? "TKT-IMP-1",
    over.param ?? FIXTURE.indicators[0]!.name,
    over.nilai ?? 1,
    over.ktdk ?? "Telat respon",
    over.sbknya ?? "Tnale timely",
  ];
}

/** Buka panel import (tombol "Import" di header Input Audit). */
async function openImportPanel(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
}

/** Unggah workbook lewat input file milik panel import. */
async function uploadXlsx(page: import("@playwright/test").Page, buffer: Buffer) {
  await openImportPanel(page);
  await page.getByRole("button", { name: "Upload & Preview" }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "import-sidak.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
}

async function openPage(page: import("@playwright/test").Page): Promise<Audit> {
  const audit = startAudit();
  await openInputAudit(page, audit, {});
  // Panel import baru muncul setelah periode dipilih lewat kontrol `Periode`.
  await selectPeriod(page);
  return audit;
}

test.beforeEach(() => {
  resetStore();
});

test.describe("Import batch dengan kolom tanggal", () => {
  test("template yang diunduh punya tujuh kolom dan tanggal kosong", async ({ page }) => {
    // Unduh + tulis ulang .xlsx di disk; lambat setelah spec lain berjalan.
    test.slow();
    const audit = await openPage(page);
    await openImportPanel(page);

    const downloadPromise = page.waitForEvent("download");
    // "Download Template" muncul dua kali: sebagai tab dan sebagai tombol aksi.
    await page
      .getByRole("button", { name: "Download Template" })
      .last()
      .click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    // Baca ulang file yang benar-benar diunduh user.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path!);
    const ws = wb.getWorksheet("Input Temuan")!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1).map((h) => String(h));
    expect(headers).toEqual([...HEADERS_LEGACY, HEADER_TGL_LAYANAN, HEADER_TGL_SAMPEL]);

    // Baris contoh tidak boleh sudah terisi tanggal.
    const sample = ws.getRow(2);
    expect(sample.getCell(6).value ?? "").toBe("");
    expect(sample.getCell(7).value ?? "").toBe("");

    // Petunjuk opsional ada di workbook, di sheet TERPISAH — bukan sebagai
    // baris data di "Input Temuan" (kalau tidak, template hasil unduhan tidak
    // bisa diunggah kembali; lihat regresi roundtrip di bawah).
    const texts: string[] = [];
    wb.eachSheet((sheet) => {
      sheet.eachRow((r) => {
        r.eachCell((c) => {
          const v = c.value;
          if (typeof v === "string") texts.push(v);
        });
      });
    });
    expect(texts.join(" ")).toMatch(/OPSIONAL/);

    // "Input Temuan" murni baris data: hanya header + baris contoh (2..4).
    const dataRows: number[] = [];
    ws.eachRow((r, n) => {
      if (n === 1) return;
      const values = (r.values as unknown[]).slice(1);
      if (values.some((v) => v !== null && v !== undefined && v !== "")) {
        dataRows.push(n);
      }
    });
    expect(dataRows).toEqual([2, 3, 4]);

    expectIsolation(audit);
  });

  /**
   * REGRESI P2 — template yang diunduh harus bisa diunggah kembali.
   *
   * Bug baseline: petunjuk "OPSIONAL" ditulis sebagai baris data di sheet
   * "Input Temuan" (baris 5). Parser membaca setiap baris tidak kosong sebagai
   * baris data, sehingga template yang baru diunduh menghasilkan baris error
   * "Parameter kosong", tombol import tersembunyi, dan alur kanonik
   * download → isi → upload gagal total.
   */
  test("template yang diunduh bisa langsung diunggah kembali tanpa baris error", async ({ page }) => {
    test.slow();
    const audit = await openPage(page);
    await openImportPanel(page);

    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download Template" })
      .last()
      .click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    // Unggah ULANG file yang benar-benar diunduh (dengan baris contoh + petunjuk).
    const buffer = readFileSync(path!);
    await page.getByRole("button", { name: "Upload & Preview" }).click();
    await page.locator('input[type="file"]').first().setInputFiles({
      name: "roundtrip.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });

    // Tombol import HANYA muncul bila tidak ada baris error. Di baseline, baris
    // petunjuk menghasilkan error "Parameter kosong" sehingga tombol hilang.
    await expect(
      page.getByRole("button", { name: /^Import \d+ Temuan$/ }),
    ).toBeVisible();
    // Dan memang tidak ada baris error dari petunjuk.
    await expect(page.getByText("Parameter kosong")).toHaveCount(0);

    expectIsolation(audit);
  });

  test("tujuh kolom: kedua tanggal terkirim identik ke preview dan simpan", async ({ page }) => {
    const audit = await openPage(page);
    await uploadXlsx(
      page,
      await buildXlsx({
        headers: [...HEADERS_LEGACY, HEADER_TGL_LAYANAN, HEADER_TGL_SAMPEL],
        rows: [
          [...legacyRow(), "2026-01-05", "2026-01-09"],
          [...legacyRow({ tiket: "TKT-IMP-2", param: FIXTURE.indicators[1]!.name }), "", ""],
        ],
      }),
    );

    // Preview harus menampilkan tanggal sebelum disimpan.
    await expect(page.getByText(/Tanggal layanan: 2026-01-05/).first()).toBeVisible();
    await expect(page.getByText(/Tanggal sampel: 2026-01-09/).first()).toBeVisible();
    await expect(page.getByText(/Belum diisi/).first()).toBeVisible();

    await page.getByRole("button", { name: /^Import \d+ Temuan$/ }).click();
    await expect.poll(() => lastBatchItems().length).toBe(2);

    // Preview dan batch harus membawa nilai yang sama.
    const previewItems = captured("preview").at(-1)!.items;
    const batchItems = lastBatchItems();
    expect(previewItems[0].tanggal_layanan).toBe("2026-01-05");
    expect(batchItems[0].tanggal_layanan).toBe("2026-01-05");
    expect(batchItems[0].tanggal_sampel).toBe("2026-01-09");
    // Baris tanpa tanggal harus null, bukan string kosong.
    expect(batchItems[1].tanggal_layanan ?? null).toBeNull();

    expect(allRows().length).toBe(2);
    expectIsolation(audit);
  });

  test("template lima kolom lama tetap diterima dan tanggalnya null", async ({ page }) => {
    const audit = await openPage(page);
    await uploadXlsx(
      page,
      await buildXlsx({
        headers: HEADERS_LEGACY,
        rows: [
          [...legacyRow()],
          [...legacyRow({ tiket: "TKT-LEGACY-2", param: FIXTURE.indicators[2]!.name })],
        ],
      }),
    );

    await page.getByRole("button", { name: /^Import \d+ Temuan$/ }).click();
    await expect.poll(() => lastBatchItems().length).toBe(2);

    for (const item of lastBatchItems()) {
      expect(item.tanggal_layanan ?? null).toBeNull();
      expect(item.tanggal_sampel ?? null).toBeNull();
      // Kolom `Sebaiknya` tidak boleh tertukar jadi tanggal.
      expect(item.ketidaksesuaian).toBe("Telat respon");
    }

    expectIsolation(audit);
  });

  test("hanya satu tanggal per baris boleh diisi", async ({ page }) => {
    const audit = await openPage(page);
    await uploadXlsx(
      page,
      await buildXlsx({
        headers: [...HEADERS_LEGACY, HEADER_TGL_LAYANAN, HEADER_TGL_SAMPEL],
        rows: [
          [...legacyRow(), "2026-01-20", ""],
          [...legacyRow({ tiket: "TKT-IMP-3" }), "", "2026-01-22"],
        ],
      }),
    );

    await page.getByRole("button", { name: /^Import \d+ Temuan$/ }).click();
    await expect.poll(() => lastBatchItems().length).toBe(2);

    const items = lastBatchItems();
    expect(items[0].tanggal_layanan).toBe("2026-01-20");
    expect(items[0].tanggal_sampel ?? null).toBeNull();
    expect(items[1].tanggal_layanan ?? null).toBeNull();
    expect(items[1].tanggal_sampel).toBe("2026-01-22");

    expectIsolation(audit);
  });

  test("sel Excel bertanggal asli tidak bergeser satu hari", async ({ page }) => {
    const audit = await openPage(page);
    await uploadXlsx(
      page,
      await buildXlsx({
        headers: [...HEADERS_LEGACY, HEADER_TGL_LAYANAN, HEADER_TGL_SAMPEL],
        // Objek Date, bukan teks. Default ExcelJS = tengah malam UTC; kalau
        // importer memakai getter lokal, hasilnya bisa mundur satu hari.
        rows: [
          [...legacyRow(), new Date(Date.UTC(2026, 0, 5)), new Date(Date.UTC(2026, 0, 9))],
          [...legacyRow({ tiket: "TKT-EDGE" }), new Date(Date.UTC(2026, 11, 31)), ""],
          [...legacyRow({ tiket: "TKT-LEAP" }), new Date(Date.UTC(2024, 1, 29)), ""],
        ],
      }),
    );

    await page.getByRole("button", { name: /^Import \d+ Temuan$/ }).click();
    await expect.poll(() => lastBatchItems().length).toBe(3);

    const items = lastBatchItems();
    expect(items[0].tanggal_layanan).toBe("2026-01-05");
    expect(items[0].tanggal_sampel).toBe("2026-01-09");
    // Tanggal terakhir bulan dan leap day harus utuh.
    expect(items[1].tanggal_layanan).toBe("2026-12-31");
    expect(items[2].tanggal_layanan).toBe("2024-02-29");

    expectIsolation(audit);
  });

  test("tanggal ambigu atau angka serial memblokir import dengan pesan jelas", async ({ page }) => {
    const audit = await openPage(page);
    await uploadXlsx(
      page,
      await buildXlsx({
        headers: [...HEADERS_LEGACY, HEADER_TGL_LAYANAN, HEADER_TGL_SAMPEL],
        rows: [
          [...legacyRow(), "03/04/2026", ""],
          [...legacyRow({ tiket: "TKT-SERIAL" }), 46037, ""],
          [...legacyRow({ tiket: "TKT-FAKE" }), "2026-02-30", ""],
        ],
      }),
    );

    // Ketiganya harus ditolak; tidak ada import yang berjalan.
    await expect(page.getByText(/tidak valid\. Gunakan YYYY-MM-DD/).first()).toBeVisible();
    await expect(page.getByText(/format tanggal tidak bisa dipastikan/).first()).toBeVisible();

    // Tombol import tidak boleh tersedia selama masih ada error.
    await expect(
      page.getByRole("button", { name: /^Import \d+ Temuan$/ }),
    ).toHaveCount(0);
    expect(allRows().length).toBe(0);

    expectIsolation(audit);
  });

  test("beda tanggal per baris pada tiket yang sama tidak saling menimpa", async ({ page }) => {
    const audit = await openPage(page);
    // Tiket sama, parameter BERBEDA, tanggal BERBEDA. Import harus menyimpan
    // setiap tanggal pada barisnya masing-masing.
    await uploadXlsx(
      page,
      await buildXlsx({
        headers: [...HEADERS_LEGACY, HEADER_TGL_LAYANAN, HEADER_TGL_SAMPEL],
        rows: [
          [...legacyRow({ tiket: "TKT-SAME" }), "2026-04-01", "2026-04-02"],
          [...legacyRow({ tiket: "TKT-SAME", param: FIXTURE.indicators[1]!.name }), "2026-05-03", ""],
        ],
      }),
    );

    await page.getByRole("button", { name: /^Import \d+ Temuan$/ }).click();
    await expect.poll(() => allRows().length).toBe(2);

    const rows = allRows();
    const byIndicator = new Map(rows.map((r) => [r.indicator_id, r]));
    expect(byIndicator.get(FIXTURE.indicators[0]!.id)!.tanggal_layanan).toBe("2026-04-01");
    expect(byIndicator.get(FIXTURE.indicators[0]!.id)!.tanggal_sampel).toBe("2026-04-02");
    expect(byIndicator.get(FIXTURE.indicators[1]!.id)!.tanggal_layanan).toBe("2026-05-03");
    expect(byIndicator.get(FIXTURE.indicators[1]!.id)!.tanggal_sampel).toBeNull();

    expectIsolation(audit);
  });
});