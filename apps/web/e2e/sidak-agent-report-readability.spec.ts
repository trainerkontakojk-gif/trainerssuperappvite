/**
 * SIDAK agent report — keterbacaan laporan unduhan (Excel, HTML, PDF).
 *
 * Plan: `plans/markdown/sidak-agent-report-readability.md`.
 *
 * Kontrak yang dibuktikan di sini, semuanya dari file yang benar-benar diunduh
 * lewat menu "Unduh Laporan" (bukan pemanggilan generator):
 *   1. Menu menawarkan Excel (.xlsx), HTML Interaktif, HTML Statis, dan PDF.
 *      CSV dan Markdown sudah digantikan Excel.
 *   2. Excel adalah workbook asli: sheet bernama, header tebal + beku, angka
 *      tersimpan sebagai angka, label manusiawi, tidak ada sel formula walau
 *      teks temuan diawali pemicu formula, dan sesi tanpa temuan tidak jadi
 *      baris.
 *   3. HTML dan PDF dibuka dengan "Kesimpulan Utama" yang deterministik, memakai
 *      label manusiawi (bukan `01/2026`, `CALL`, `non_critical`), tidak mengulang
 *      cakupan di setiap seksi, dan tidak memuat jargon teknis.
 *   4. Tabel perbandingan: temuan lebih sedikit dari rata-rata tim = baik
 *      (hijau), bukan buruk.
 *   5. Grafik skor punya garis target 95 dan sumbu yang tidak dimulai dari 0;
 *      grafik spaghetti per parameter diganti tabel.
 *   6. Detail temuan dikelompokkan per parameter dan nomor tiket tetap ada.
 *   7. PDF: header kolom rata kanan sejajar dengan nilainya, dan judul
 *      "Akar Masalah" tercetak.
 *
 * Isolasi sama dengan spec unduhan lain (`helpers/sidakAgentReportFixture.ts`):
 * preflight target lokal, mock API/auth fail-closed, dan dokumen offline dibaca
 * dengan guard egress.
 */

import { expect, test } from "@playwright/test";
import { inflateSync } from "node:zlib";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import {
  AGENT_NAME,
  CLEAN_SESSION_TICKET,
  FORMULA_SAMPLES,
  INDICATOR_NAME,
  LONG_TEXT_AGENT_ID,
  LONG_TEXT_AGENT_NAME,
  MULTILINE_FINDING_LINES,
  REAL_TICKET,
  YEAR,
  assertLocalDevOnlyTarget,
  drainAudits,
  exportFromMenu,
  formatAudit,
  openAgentDetail,
  readReportOffline,
  startAudit,
} from "./helpers/sidakAgentReportFixture";

/** Token mentah yang tidak boleh lagi muncul di laporan manusiawi. */
const RAW_TOKENS = [
  "01/2026",
  "02/2026",
  "non_critical",
  "Layanan CALL",
  "Score Deduction",
  "NC Score",
  "CR Score",
  "backend",
  "clean session",
  "Grafik menampilkan",
];

const XLSX_SHEETS = [
  "Ringkasan",
  "Skor Bulanan",
  "Temuan",
  "Tiket",
  "Akar Masalah",
  "Tren Temuan",
  "Perbandingan",
];

async function loadWorkbook(path: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

function sheetRows(sheet: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    rows.push(values.slice(1));
  });
  return rows;
}

function allCells(workbook: ExcelJS.Workbook): ExcelJS.Cell[] {
  const cells: ExcelJS.Cell[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => cells.push(cell));
    });
  });
  return cells;
}

// ── PDF: run teks dengan posisi ────────────────────────────────────────────

type PdfRun = {
  font: string;
  size: number;
  x: number;
  y: number;
  text: string;
};

function unescapePdfString(value: string): string {
  return value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, code: string) => {
    if (/^[0-7]+$/.test(code)) return String.fromCharCode(parseInt(code, 8));
    const map: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
    };
    return map[code] ?? code;
  });
}

/**
 * Run teks jsPDF (`/Fn size Tf … x y Td (teks) Tj`) dari semua content stream.
 * Font standar jsPDF: F1 = Helvetica, F2 = Helvetica-Bold.
 */
function readPdfRuns(bytes: Buffer): PdfRun[] {
  const raw = bytes.toString("latin1");
  const runs: PdfRun[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
  let stream: RegExpExecArray | null;
  while ((stream = streamPattern.exec(raw))) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(stream[1], "latin1")).toString(
        "latin1",
      );
    } catch {
      continue;
    }
    const runPattern =
      /\/(F\d+) ([\d.]+) Tf[\s\S]*?(-?[\d.]+) (-?[\d.]+) Td\s*\(((?:\\.|[^\\)])*)\) Tj/g;
    let run: RegExpExecArray | null;
    while ((run = runPattern.exec(content))) {
      runs.push({
        font: run[1],
        size: Number(run[2]),
        x: Number(run[3]),
        y: Number(run[4]),
        text: unescapePdfString(run[5]),
      });
    }
  }
  return runs;
}

const measureDoc = new jsPDF({ unit: "pt", format: "a4" });
function textWidthPt(text: string, bold: boolean, size: number): number {
  measureDoc.setFont("helvetica", bold ? "bold" : "normal");
  measureDoc.setFontSize(size);
  return measureDoc.getTextWidth(text);
}

function runRight(run: PdfRun): number {
  return run.x + textWidthPt(run.text, run.font === "F2", run.size);
}

test.describe("SIDAK agent report: keterbacaan laporan unduhan", () => {
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.afterEach(() => {
    for (const audit of drainAudits()) console.log(formatAudit(audit));
  });

  test("Menu Unduh Laporan menawarkan Excel, HTML Interaktif, HTML Statis, dan PDF — tanpa CSV/Markdown", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    await page.getByRole("button", { name: "Unduh Laporan" }).click();
    const items = page.getByRole("menuitem");
    await expect(items).toHaveCount(4);
    const labels = (await items.allInnerTexts()).map((text) =>
      text.split("\n")[0].trim(),
    );
    expect(labels).toEqual([
      "Excel (.xlsx)",
      "HTML Interaktif",
      "HTML Statis",
      "PDF",
    ]);
  });

  test("Excel: workbook asli dengan sheet bernama, header beku, angka sebagai angka, dan label manusiawi", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    const file = await exportFromMenu(page, "Excel", "xlsx");

    expect(file.filename).toBe(`Laporan_Audit_${AGENT_NAME}_${YEAR}.xlsx`);
    // Zip magic `PK\x03\x04`, tanpa BOM teks.
    expect(file.bytes.subarray(0, 4).toString("latin1")).toBe("PK\u0003\u0004");

    const workbook = await loadWorkbook(file.path);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(XLSX_SHEETS);

    const summary = sheetRows(workbook.getWorksheet("Ringkasan")!);
    const summaryText = summary.flat().map(String).join("\n");
    expect(summaryText).toContain(AGENT_NAME);
    expect(summaryText).toContain("Call");
    expect(summaryText).toContain("Kesimpulan Utama");
    expect(summaryText).toContain("di bawah target 95");

    const monthly = workbook.getWorksheet("Skor Bulanan")!;
    const monthlyRows = sheetRows(monthly);
    expect(monthlyRows[0]).toEqual([
      "Bulan",
      "Skor Final",
      "Skor Non-Critical",
      "Skor Critical",
      "Sesi",
      "Temuan",
      "Status",
    ]);
    expect(monthlyRows[1].slice(0, 6)).toEqual([
      "Januari 2026",
      82,
      84,
      80,
      1,
      0,
    ]);
    expect(monthly.getRow(1).font?.bold).toBe(true);
    expect(monthly.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });

    const findings = sheetRows(workbook.getWorksheet("Temuan")!);
    expect(findings[0]).toEqual([
      "Bulan",
      "No Tiket",
      "Parameter",
      "Kategori",
      "Nilai",
      "Keterangan Nilai",
      "Ketidaksesuaian",
      "Sebaiknya",
    ]);
    const realRow = findings.find((row) => row[1] === REAL_TICKET);
    expect(realRow).toBeDefined();
    expect(realRow?.slice(0, 6)).toEqual([
      "Februari 2026",
      REAL_TICKET,
      INDICATOR_NAME,
      "Critical",
      1,
      "Tidak Sesuai",
    ]);

    const everything = allCells(workbook)
      .map((cell) => String(cell.value ?? ""))
      .join("\n");
    expect(everything).not.toContain(CLEAN_SESSION_TICKET);
    for (const token of ["01/2026", "non_critical", "Score Deduction"]) {
      expect(everything, `token mentah ${token}`).not.toContain(token);
    }
  });

  test("Excel: teks temuan berawalan pemicu formula tetap sel teks, tidak pernah formula", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit, {
      id: LONG_TEXT_AGENT_ID,
      name: LONG_TEXT_AGENT_NAME,
    });
    const file = await exportFromMenu(page, "Excel", "xlsx-formula");
    const workbook = await loadWorkbook(file.path);

    const cells = allCells(workbook);
    const formulas = cells.filter(
      (cell) => cell.type === ExcelJS.ValueType.Formula,
    );
    expect(
      formulas.map((cell) => cell.address),
      "sel formula",
    ).toEqual([]);
    for (const sample of FORMULA_SAMPLES) {
      const match = cells.find((cell) => cell.value === sample.value);
      expect(match, `sampel ${sample.value} hilang`).toBeDefined();
      expect(match?.type).toBe(ExcelJS.ValueType.String);
    }
  });

  test("HTML Statis: kesimpulan di awal, label manusiawi, cakupan tidak berulang, dan warna perbandingan benar", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    const file = await exportFromMenu(page, "HTML Statis", "html-readability");
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const report = await readReportOffline(context, file);
      const doc = report.page;

      // Kesimpulan adalah seksi PERTAMA setelah identitas.
      const firstHeading = doc.locator("h2").first();
      await expect(firstHeading).toHaveText("Kesimpulan Utama");
      const highlights = doc.locator("[data-report-highlights] li");
      expect(await highlights.count()).toBeGreaterThanOrEqual(3);
      const highlightText = (await highlights.allInnerTexts()).join("\n");
      expect(highlightText).toContain("Februari 2026");
      expect(highlightText).toContain("di bawah target 95");
      expect(highlightText).toContain("Fokus coaching");

      const text = report.state.text;
      for (const token of RAW_TOKENS) {
        expect(text, `token mentah "${token}"`).not.toContain(token);
      }
      expect(text).toContain("Layanan Call");
      expect(text).toContain("Januari 2026");

      // Cakupan dinyatakan sekali di header; seksi hanya menulis cakupan yang
      // berbeda (tiket, akar masalah, perbandingan).
      expect(await doc.locator(".section-scope").count()).toBeLessThanOrEqual(
        3,
      );

      // Agen 1 temuan vs rata-rata tim 2 → lebih baik → hijau (ok), bukan merah.
      const totalRow = doc
        .locator("table", {
          has: doc.locator("caption", { hasText: "Perbandingan" }),
        })
        .locator("tr", { hasText: "Total Temuan" });
      await expect(totalRow.locator("td.tone-ok").first()).toBeVisible();
      await expect(totalRow.locator("td.tone-bad")).toHaveCount(0);

      // Grafik skor: garis target, dan tidak ada lagi tabel data per grafik.
      expect(await doc.locator("[data-target-line]").count()).toBe(3);
      expect(text).not.toContain("Data skor —");

      // Tren per parameter adalah tabel, bukan grafik spaghetti.
      await expect(
        doc.locator("caption", { hasText: "Temuan per Parameter" }),
      ).toHaveCount(1);
      expect(await doc.locator('[data-chart-figure="parameter"]').count()).toBe(
        0,
      );

      // Temuan dikelompokkan per parameter; nomor tiket tetap ada.
      const group = doc.locator(`[data-finding-group="${INDICATOR_NAME}"]`);
      await expect(group).toHaveCount(1);
      await expect(group).toContainText(REAL_TICKET);
      expect(text).not.toContain(CLEAN_SESSION_TICKET);
    } finally {
      await context.close();
    }
  });

  test("PDF: kesimpulan, label manusiawi, judul Akar Masalah, dan header kolom sejajar dengan nilainya", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);
    const file = await exportFromMenu(page, "PDF", "pdf-readability");
    const runs = readPdfRuns(file.bytes);
    const text = runs.map((run) => run.text).join("\n");

    expect(text).toContain("Kesimpulan Utama");
    expect(text).toContain("di bawah target 95");
    expect(text).toContain("Fokus coaching");
    expect(text).toContain("Layanan Call");
    expect(text).toContain("poin");
    for (const token of RAW_TOKENS) {
      expect(text, `token mentah "${token}"`).not.toContain(token);
    }

    const rootCauseHeading = runs.find(
      (run) =>
        run.text === "Akar Masalah" && run.font === "F2" && run.size >= 10,
    );
    expect(rootCauseHeading, "judul seksi Akar Masalah").toBeDefined();

    // Header "Skor Final" (bold 7pt) dan nilai Januari "82" (8pt) adalah kolom
    // rata kanan yang sama: tepi kanannya harus sejajar.
    const header = runs.find(
      (run) => run.text === "Skor Final" && run.font === "F2" && run.size === 7,
    );
    expect(header, "header Skor Final").toBeDefined();
    const value = runs
      .filter((run) => run.text === "82" && run.size === 8 && run.y < header!.y)
      .sort((a, b) => b.y - a.y)[0];
    expect(value, "nilai 82 di bawah header").toBeDefined();
    expect(
      Math.abs(runRight(header!) - runRight(value!)),
      "tepi kanan header vs nilai (pt)",
    ).toBeLessThan(1.5);
  });

  test("Catatan temuan multi-baris tetap terbaca: tanpa penanda [U+000A] di PDF, baris baru dipertahankan di PDF/HTML/Excel", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit, {
      id: LONG_TEXT_AGENT_ID,
      name: LONG_TEXT_AGENT_NAME,
    });
    const [firstLine, secondBlock] = MULTILINE_FINDING_LINES;
    const [secondLine, thirdLine] = secondBlock.split("\n");

    // PDF: Enter/tab adalah spasi putih, bukan karakter tak-tercetak.
    const pdf = await exportFromMenu(page, "PDF", "multibaris-pdf");
    const runs = readPdfRuns(pdf.bytes);
    const text = runs.map((run) => run.text).join("\n");
    for (const marker of ["[U+000A]", "[U+000D]", "[U+0009]"]) {
      expect(text, `penanda ${marker} tercetak di PDF`).not.toContain(marker);
    }
    // Baris baru dari data menjadi baris baru di PDF, dan tab jadi spasi.
    const lines = runs.map((run) => run.text);
    expect(lines).toContain(`Ketidaksesuaian: ${firstLine}`);
    expect(lines).toContain(secondLine);
    expect(lines).toContain(thirdLine.replace("\t", " "));

    // HTML: baris baru tampil sebagai baris baru.
    const html = await exportFromMenu(page, "HTML Statis", "multibaris-html");
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    try {
      const report = await readReportOffline(context, html);
      const cell = report.page.locator("dd", { hasText: firstLine });
      await expect(cell).toHaveCount(1);
      const rendered = await cell.innerText();
      expect(rendered).toContain(`${firstLine}\n${secondLine}`);
    } finally {
      await context.close();
    }

    // Excel: teks asli tersimpan utuh, termasuk pemisah barisnya.
    const xlsx = await exportFromMenu(page, "Excel", "multibaris-xlsx");
    const workbook = await loadWorkbook(xlsx.path);
    // Format XML xlsx menyimpan pemisah baris sebagai `\n`; isi barisnya utuh.
    const original = MULTILINE_FINDING_LINES.join("\n");
    expect(
      allCells(workbook).some((cell) => cell.value === original),
      "catatan multi-baris tidak tersimpan utuh di Excel",
    ).toBe(true);
  });
});
