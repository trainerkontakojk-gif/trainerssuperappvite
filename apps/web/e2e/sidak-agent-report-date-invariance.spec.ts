/**
 * Regresi invarian ekspor terhadap tanggal bisnis.
 *
 * Kontrak: penambahan `tanggal_layanan`/`tanggal_sampel` per baris temuan TIDAK
 * boleh mengubah isi ekspor CSV/Markdown yang sudah terkunci. Spec ini memakai
 * alur unduh nyata (menu "Unduh Laporan" → event download → file di disk) dengan
 * fixture agent-1, dan membandingkan byte teks sebelum vs sesudah tanggal diisi
 * lewat seam `setExportDates` (default mati, tidak mengubah spec lain).
 *
 * Tidak ada normalisasi timestamp: generator CSV/MD tidak menulis timestamp, dan
 * nama file tidak berubah karena tanggal. Jadi perbandingan harus eksak.
 */

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  assertLocalDevOnlyTarget,
  exportFromMenu,
  openAgentDetail,
  setExportDates,
  startAudit,
} from "./helpers/sidakAgentReportFixture";

type Captured = { csv: string; md: string };

let withoutDates: Captured;
let withDates: Captured;

test.describe.serial("Ekspor CSV/MD invarian terhadap tanggal", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test("baseline: tanpa tanggal", async ({ page }) => {
    setExportDates(false);
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const csv = await exportFromMenu(page, "CSV", "tanpa-tanggal");
    const md = await exportFromMenu(page, "Markdown", "tanpa-tanggal");
    withoutDates = {
      csv: readFileSync(csv.path, "utf8").replace(/^\uFEFF/, ""),
      md: readFileSync(md.path, "utf8").replace(/^\uFEFF/, ""),
    };
    expect(withoutDates.csv.length).toBeGreaterThan(0);
    expect(withoutDates.md.length).toBeGreaterThan(0);
  });

  test("dengan tanggal: isi CSV/MD identik dan tidak memuat tanggal", async ({ page }) => {
    expect(withoutDates).toBeTruthy();
    setExportDates(true);
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const csv = await exportFromMenu(page, "CSV", "dengan-tanggal");
    const md = await exportFromMenu(page, "Markdown", "dengan-tanggal");
    withDates = {
      csv: readFileSync(csv.path, "utf8").replace(/^\uFEFF/, ""),
      md: readFileSync(md.path, "utf8").replace(/^\uFEFF/, ""),
    };

    // Byte-identik: tanggal tidak bocor ke format ekspor yang terkunci.
    expect(withDates.csv).toBe(withoutDates.csv);
    expect(withDates.md).toBe(withoutDates.md);
    // Dan tanggal yang diisi memang tidak muncul sebagai teks.
    expect(withDates.csv).not.toMatch(/2026-0\d-05/);
    expect(withDates.md).not.toMatch(/2026-0\d-05/);
  });
});
