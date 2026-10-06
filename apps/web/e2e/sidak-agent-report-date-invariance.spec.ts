/**
 * Regresi invarian ekspor terhadap tanggal bisnis.
 *
 * Kontrak: penambahan `tanggal_layanan`/`tanggal_sampel` per baris temuan TIDAK
 * boleh mengubah isi ekspor Excel. Spec ini memakai alur unduh nyata (menu
 * "Unduh Laporan" → event download → file di disk) dengan fixture agent-1, dan
 * membandingkan isi seluruh sheet sebelum vs sesudah tanggal diisi lewat seam
 * `setExportDates` (default mati, tidak mengubah spec lain).
 *
 * Yang dibandingkan adalah nilai sel per sheet, bukan byte file: workbook .xlsx
 * menyimpan waktu pembuatan di metadata zip/dokumen, jadi byte-nya memang
 * berbeda tiap unduhan walau isinya sama.
 */

import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import {
  assertLocalDevOnlyTarget,
  exportFromMenu,
  openAgentDetail,
  setExportDates,
  startAudit,
} from "./helpers/sidakAgentReportFixture";

async function sheetValues(path: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const book: Record<string, unknown[][]> = {};
  workbook.eachSheet((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push((row.values as unknown[]).slice(1));
    });
    book[sheet.name] = rows;
  });
  return JSON.stringify(book);
}

let withoutDates: string;

test.describe.serial("Ekspor Excel invarian terhadap tanggal", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("baseline: tanpa tanggal", async ({ page }) => {
    setExportDates(false);
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const xlsx = await exportFromMenu(page, "Excel", "tanpa-tanggal");
    withoutDates = await sheetValues(xlsx.path);
    expect(withoutDates.length).toBeGreaterThan(0);
  });

  test("dengan tanggal: isi Excel identik dan tidak memuat tanggal", async ({
    page,
  }) => {
    expect(withoutDates).toBeTruthy();
    setExportDates(true);
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const xlsx = await exportFromMenu(page, "Excel", "dengan-tanggal");
    const withDates = await sheetValues(xlsx.path);

    // Isi identik: tanggal tidak bocor ke format ekspor.
    expect(withDates).toBe(withoutDates);
    // Dan tanggal yang diisi memang tidak muncul sebagai teks.
    expect(withDates).not.toMatch(/2026-0\d-05/);
  });
});
