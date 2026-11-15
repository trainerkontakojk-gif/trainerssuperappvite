// Shared by the sidak-agent-report-download-*.spec.ts files.
import { printedIncludes, readPdfPages } from "./pdfReadback";
import { expect, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import path from "node:path";
import { REPORT_FACTS, type ExportedFile } from "./sidakAgentReportFixture";

/**
 * FASE 1 — E2E unduHAN NYATA laporan agen `/sidak/agents/:id`.
 *
 * Plan: `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md` Fase 1.
 *
 * Kontrak yang dibuktikan di sini (semuanya lewat UI nyata + file yang benar-benar
 * diunduh browser, BUKAN panggilan `generateHTML`/`generateMD`/`generateCSV`
 * langsung dan BUKAN `page.setContent`):
 *   1. Menu "Unduh Laporan" di `AgentProfileBar` benar-benar menghasilkan file:
 *      klik menu → `handleExport` → Blob → anchor `download` → event download
 *      Playwright → `download.saveAs` → isi file dibaca dari disk.
 *   2. Nama file dan ekstensi per format benar:
 *      `Laporan_Audit_<nama>_<tahun>.{csv,md,statis.html,interaktif.html}`.
 *   3. Setiap file ber-BOM UTF-8 (`EF BB BF`) supaya Excel/MD/HTML opening
 *      character aman di spreadsheet.
 *   4. Isi file sesuai kontrak format (section/heading, baris bulanan, temuan,
 *      tiket, akar masalah, tren, benchmark) dan teks BERBAHAYA dari fixture
 *      (`<script>`, koma, kutip) tetap ter-escape — CSV mengutip dan menggandakan
 *      kutip, HTML meng-escape markup.
 *   5. Scope/context laporan berasal dari state UI yang sedang aktif (tahun,
 *      layanan, dan label cakupan benchmark), bukan angka karangan.
 *   6. **Sesi tanpa temuan (clean session) tidak diekspor di format mana pun**
 *      (keputusan Fajar). `phantomSessions` hanya boleh muncul sebagai angka
 *      agregat sesi, tidak sebagai daftar sesi/tiket.
 *   7. HTML yang diunduh self-contained: tidak ada resource `http(s)` eksternal
 *      yang wajib diambil untuk render.
 *
 * FASE 4 menambah kontrak PDF (plan yang sama, Fase 4):
 *   8. Menu "Unduh Laporan" menawarkan lima format termasuk PDF, dan unduhan
 *      PDF adalah file PDF sungguhan: magic `%PDF-`, tanpa BOM UTF-8, Blob
 *      bertipe `application/pdf` dan tidak nol byte, nama file dari state UI.
 *   9. PDF adalah dokumen A4 ber-paginasi dengan teks yang bisa diekstrak
 *      (bukan gambar halaman penuh): identitas di halaman pertama, temuan +
 *      colophon di halaman terakhir, tabel bulanan/tiket/tren/benchmark ikut,
 *      tiap seksi menyatakan cakupannya sendiri, dan tiap halaman memakai
 *      footer "Halaman X dari N".
 *  10. Isi panjang (ribuan karakter + token tanpa spasi selebar kolom) tetap
 *      utuh dari halaman awal sampai halaman terakhir: tidak ada karakter yang
 *      dipotong atau hilang di batas kolom/batas halaman.
 *  11. Kegagalan async pembuatan PDF (impor modul/generator yang melempar
 *      error) terlihat lewat toast live region yang sama dan tidak menghasilkan
 *      file apa pun.
 *
 * FASE 2 menambah kontrak cakupan dan kegagalan ekspor (plan yang sama, Fase 2):
 *   9. CSV/MD menyatakan cakupan sendiri per seksi (tahun, layanan, bulan
 *      terpilih, rentang tren, cakupan benchmark) di batas non-tabel, TANPA
 *      mengubah skema enam seksi maupun baris data yang sudah ada.
 *  10. Angka agregat `Sesi` diteruskan apa adanya dan tidak pernah dihitung
 *      ulang dari baris yang diekspor; sesi bersih tetap tidak jadi baris.
 *  11. Nama agen dengan karakter berbahaya disanitasi untuk nama file saja;
 *      isi laporan tetap memakai nama itu apa adanya.
 *  12. Kegagalan ekspor menampilkan error yang terlihat dan diumumkan lewat
 *      live region, dan tidak menghasilkan file unduhan apa pun.
 *
 * Opsi PDF tidak disentuh di Fase 2 (belum ada implementasi PDF waktu itu);
 * Fase 4 kini mengimplementasikannya dan membuktikannya lewat file
 * yang benar-benar diunduh browser.
 *
 * Isolasi (WAJIB — jangan dihapus, jangan longgarkan; pola dari
 * `sidak-reports-data-*.spec.ts`):
 *   1. Semua respons API dimock; tidak ada proses backend yang dijalankan E2E.
 *   2. `assertLocalDevOnlyTarget` (preflight, SEBELUM test pertama) membuktikan
 *      listener `localhost:3005` adalah dev-server Vite repo ini dan proxy
 *      `/api`-nya hanya menunjuk ke loopback.
 *   3. `installNetworkGuard` adalah allowlist fail-closed: hanya endpoint yang
 *      PERSIS dimock, auth/profile Supabase yang PERSIS dimock, dan document/
 *      modul/HMR dev-server lokal pada origin app (tanpa `/api`). Sisanya
 *      di-`abort`, termasuk `/api/*` yang tidak dimock dan host apa pun di luar
 *      loopback — sehingga project Supabase yang dibaca `vite.config.ts`
 *      (`envDir` = repo root) tidak pernah tersentuh.
 *   4. Bukti isolasi diuji oleh dua test "Guard ..." di
 *      `sidak-agent-report-download-excel-guard.spec.ts`, bukan hanya
 *      diklaim: salah satu memakai listener loopback standing-in dan membuktikan
 *      tidak ada byte yang sampai ke socket.
 */

/** BOM UTF-8 = EF BB BF; spreadsheet/MD/HTML butuh ini agar karakter awal aman. */
export function expectUtf8Bom(file: ExportedFile) {
  expect(
    [...file.bytes.subarray(0, 3)],
    `${file.filename} harus ber-BOM UTF-8 (EF BB BF), byte pertama: ${file.bytes
      .subarray(0, 6)
      .toString("hex")}`,
  ).toEqual([0xef, 0xbb, 0xbf]);
}

/**
 * Isi workbook Excel yang diunduh: nama sheet → baris (nilai sel apa adanya,
 * tanpa kolom indeks 0 milik exceljs). Dibaca dari file di disk, bukan dari
 * generator.
 */
export async function workbookRows(
  file: ExportedFile,
): Promise<Record<string, unknown[][]>> {
  expect(
    file.bytes.subarray(0, 2).toString("latin1"),
    `${file.filename} bukan file zip/xlsx`,
  ).toBe("PK");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file.path);
  const book: Record<string, unknown[][]> = {};
  workbook.eachSheet((sheet) => {
    const rows: unknown[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push((row.values as unknown[]).slice(1));
    });
    book[sheet.name] = rows;
  });
  return book;
}

/** Blok identitas sheet "Ringkasan" sebagai pasangan label → nilai. */
export function summaryFacts(
  book: Record<string, unknown[][]>,
): Record<string, unknown> {
  const facts: Record<string, unknown> = {};
  for (const row of book["Ringkasan"] ?? []) {
    if (row.length === 2 && typeof row[0] === "string") facts[row[0]] = row[1];
  }
  return facts;
}

/**
 * Papan kontrol UI yang tidak mungkin bekerja pada file unduhan offline.
 *
 * `variant` menentukan varian mana yang wajib bebas dari papan kontrol itu:
 * `<button>`/:role=tab` sah di varian interaktif (memang bekerja), tetapi di
 * varian statis keduanya adalah kontrol palsu.
 */
export const FAUX_CHROME: ReadonlyArray<{
  pattern: RegExp;
  label: string;
  variant: "static" | "both";
}> = [
  {
    pattern: /Unduh Laporan/,
    label: "tombol 'Unduh Laporan'",
    variant: "both",
  },
  { pattern: /Input Audit/, label: "tombol 'Input Audit'", variant: "both" },
  { pattern: /Muat ulang/, label: "kontrol 'Muat ulang'", variant: "both" },
  { pattern: /<select\b/i, label: "<select> non-fungsional", variant: "both" },
  {
    pattern: /\sdisabled(\s|=|\/)/i,
    label: "atribut disabled",
    variant: "both",
  },
  { pattern: /<img\b/i, label: "<img> (avatar remote)", variant: "both" },
  { pattern: /<button\b/i, label: "<button>", variant: "static" },
  {
    pattern: /role="tab(list)?"/,
    label: "ARIA tab tanpa perilaku",
    variant: "static",
  },
];

export function missingPrintedFacts(text: string): string[] {
  return REPORT_FACTS.filter((fact) => !printedIncludes(text, fact));
}

/**
 * Label grafik dan tabel yang harus muncul PADA FILE YANG DIUNDUH. Ditulis
 * literal di sini, bukan diimpor dari generator: kalau test mengimpor
 * konstanta yang sama dengan produk, ia hanya mengukur bahwa produk konsisten
 * dengan dirinya sendiri, bukan bahwa pembaca mendapat label yang benar.
 *
 * Seksi skor dan seksi tren temuan adalah dua hal berbeda: yang pertama
 * mengukur skor (`periodSummaries`), yang kedua menghitung jumlah temuan
 * (`personalTrend`). Satu metrik skor satu grafik; jumlah temuan per parameter
 * berupa tabel. Angka skor lengkap ada di tabel Rekap Skor Bulanan, jadi grafik
 * skor tidak lagi punya tabel data sendiri.
 */
export const TREND_TOTAL_CHART_TITLE = "Total Temuan per Bulan";

export const TREND_PARAMETER_TABLE_CAPTION = "Temuan per Parameter";

export const MONTHLY_TABLE_CAPTION = "Rekap Skor Bulanan";

export const SCORE_FINAL_CHART_TITLE = "Skor Final";

export const SCORE_NON_CRITICAL_CHART_TITLE = "Skor Non-Critical";

export const SCORE_CRITICAL_CHART_TITLE = "Skor Critical";

export const SCORE_UNIT = "Skor";

export const FINDING_COUNT_UNIT = "Jumlah temuan";

/**
 * Caption tabel sebagai regex yang LITERAL. Beberapa caption memuat "(" dan ")"
 * (misalnya "Skor Non-Critical (NC)"), yang tanpa escape akan dibaca sebagai
 * grup dan tidak pernah mencocokkan caption aslinya.
 */
export function captionPattern(caption: string): RegExp {
  return new RegExp(caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/** `rgb(15, 23, 42)` -> `[15, 23, 42]`; sumbernya selalu computed style. */
export function parseCssColor(value: string): [number, number, number] {
  const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0];
}

/** Rasio kontras WCAG antara dua warna `rgb()`. */
export function contrastRatio(foreground: string, background: string): number {
  const luminance = (value: string) => {
    const [r, g, b] = parseCssColor(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Cetak sungguhan lewat `page.pdf()` (A4 dengan aturan `@page` milik dokumen)
 * plus baca-balik teks per halaman dari PDF itu.
 *
 * Kenapa bukan potongan `page.screenshot({ clip })`: `clip` hanya memotong
 * aliran dokumen yang kontinu, bukan hasil paginasi peramban. `break-inside:
 * avoid` memindahkan blok ke halaman berikutnya TANPA mengubah posisinya di
 * aliran, sehingga "halaman 4" hasil potong bisa berisi blok yang sebenarnya
 * sudah pindah ke halaman 3 — atau sebaliknya. Pola itu sempat menghasilkan
 * artefak "halaman 4 hanya berisi colophon" yang tidak ada sama sekali di PDF
 * aslinya, jadi artefak itu tidak boleh dipakai sebagai bukti pagination.
 * PDF adalah bukti jujur, dan teks per halaman yang ditulis ke artefak adalah
 * read-back yang bisa diperiksa manusia tanpa alat eksternal apa pun.
 */
export async function capturePrintOutput(
  page: Page,
  dir: string,
  name: string,
): Promise<{ pdfPath: string; pages: string[] }> {
  const pdfPath = path.join(dir, `${name}.pdf`);
  const bytes = await page.pdf({ format: "A4", printBackground: true });
  writeFileSync(pdfPath, bytes);
  const pages = readPdfPages(bytes).texts;
  const dump = path.join(dir, `${name}-pages.txt`);
  writeFileSync(
    dump,
    pages
      .map((text, index) => `=== PAGE ${index + 1} ===\n${text}`)
      .join("\n\n"),
  );
  console.log(
    `[artifact] ${pdfPath} (${bytes.length} byte, ${pages.length} halaman A4)\n[artifact] ${dump}`,
  );
  return { pdfPath, pages };
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE 4 — PDF unduhan langsung (bukan dialog cetak peramban).
// Plan: `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md` Fase 4.
//
// Semua diukur dari FILE YANG DIUNDUH lewat menu nyata, sama seperti format
// lain: tidak ada `new jsPDF(...)` di dalam test, tidak ada `page.pdf()`, dan
// tidak ada generator yang dipanggil langsung. Yang dibaca hanya byte file
// hasil unduhan browser.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Binary PDF tidak boleh ber-BOM. BOM UTF-8 (EF BB BF) adalah byte yang sah
 * di stream PDF secara teknis, tapi pembaca PDF dan pembaca teks menafsirkan awal file
 * sebagai header, sehingga byte pertama bukan lagi `%PDF-`; untuk format biner, BOM tidak pernah dibutuhkan.
 */
export function expectNoBom(file: ExportedFile) {
  expect(
    file.bytes.subarray(0, 3).toString("hex"),
    `${file.filename} tidak boleh ber-BOM (EF BB BF) — format biner`,
  ).not.toBe("efbbbf");
}
