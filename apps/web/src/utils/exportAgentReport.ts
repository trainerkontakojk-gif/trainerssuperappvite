/**
 * Agent Detail Report Export Utility
 *
 * Generates CSV, Markdown (.md), and HTML (.html) reports from AgentDetailData.
 * All formats include the full dataset: profile, monthly summaries, findings,
 * top tickets, root causes, trend data, and comparison table.
 */

import type {
  AgentDetailData,
  AgentPeriodSummary,
  RootCauseResult,
} from "@trainers/types";
import {
  MONTHS_FULL,
  MONTHS_SHORT,
  buildAgentReportHtml,
  computeTenure,
  monthScopeLabel,
  nilaiLabel,
  trendScopeLabel,
  yearServiceScopeLabel,
  yearToDateScopeLabel,
} from "./agentReportHtml";
import type {
  AgentHtmlExportContext,
  AgentHtmlVariant,
  TicketScoreExport,
  TemuanDisplayItemExport,
} from "./agentReportHtml";

// Kontrak ini berasal dari `agentReportHtml.ts` (satu sumber untuk satu laporan),
// tapi tetap di-re-export di sini supaya pemanggil yang sudah mengimpor dari
// modul ini tidak perlu tahu file mana yang memiliki definisinya.
export type {
  AgentHtmlExportContext,
  TicketScoreExport,
  TemuanDisplayItemExport,
} from "./agentReportHtml";

// ---------------------------------------------------------------------------
// Format laporan
// ---------------------------------------------------------------------------

export type AgentReportFormat =
  | "csv"
  | "md"
  | "html-interactive"
  | "html-static"
  | "pdf";

/**
 * Konteks audit aktif saat unduhan ditekan.
 *
 * CSV/MD tidak memakai satu periode untuk seluruh dokumen: ringkasan bulanan dan
 * detail temuan mengikuti tahun + layanan, tiket dan akar masalah mengikuti bulan
 * terpilih, tren mengikuti periode yang benar-benar ada pada datanya, dan
 * benchmark memakai cakupan yang dideklarasikan `comparisonTable.scope`. Agar
 * laporan tidak menyiratkan satu bulan untuk semua seksi, tiap seksi menyatakan
 * cakupannya sendiri di batas non-tabel (baris komentar CSV / baris `_..._` MD).
 *
 * `service` dan `month` TIDAK pernah memengaruhi isi baris data — hanya label
 * cakupan. Tanpa objek ini, generator tetap menghasilkan keluaran yang sama
 * seperti sebelumnya (dipakai pemanggil lama yang tidak punya konteks).
 */
export interface AgentReportScope {
  /** Layanan audit terpilih di UI; `""`/tak dikenal berarti belum terkonteks. */
  service: string;
  /** Bulan audit terpilih di UI; `null` berarti belum ada bulan aktif. */
  month: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
//
// Bulan, masa kerja, dan label cakupan seksi TIDAK didefinisikan ulang di sini:
// semuanya datang dari `agentReportHtml.ts` supaya "cakupan seksi" punya satu
// definisi yang dipakai HTML, CSV, dan MD sekaligus.
// ---------------------------------------------------------------------------

function formatNilai(nilai: number): string {
  return nilai + " (" + nilaiLabel(nilai) + ")";
}

/**
 * Cakupan benchmark memakai `comparisonTable.scope` apa adanya — nilai yang
 * dideklarasikan backend tidak ditimpa nilai UI, jadi label ini selalu jujur
 * tentang periode yang benar-benar dihitung server. Bentuk kalimatnya dikunci
 * di docs dan diuji E2E, jadi ia tetap hidup di modul ini.
 *
 * Diekspor supaya PDF memakai kalimat yang sama persis, bukan definisi kedua:
 * "cakupan benchmark" harus punya satu kalimat di semua format.
 */
export function comparisonScopeLabel(data: AgentDetailData): string {
  const scope = data.comparisonTable?.scope;
  if (!scope) return "";
  const startLabel = MONTHS_SHORT[(scope.startMonth ?? 1) - 1] ?? "";
  const endLabel = MONTHS_SHORT[(scope.endMonth ?? 12) - 1] ?? "";
  const period =
    startLabel && endLabel ? ` • Periode ${startLabel}-${endLabel}` : "";
  return (
    `Tahun ${scope.year} • Layanan ${scope.serviceLabel || scope.serviceType}` +
    ` • ${scope.teamLabel}${period}`
  );
}

// ---------------------------------------------------------------------------
// Nama file
// ---------------------------------------------------------------------------

/**
 * Karakter yang merusak nama file lintas OS/path: separator direktori, wildcard,
 * dan reserved Windows. Karakter kontrol ditangani terpisah lewat
 * `isControlCode` supaya tidak butuh regex control-character.
 */
const UNSAFE_FILENAME_CHARS = new Set([
  "/",
  "\\",
  ":",
  "*",
  "?",
  '"',
  "<",
  ">",
  "|",
]);

function isControlCode(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

export function sanitizeReportFilePart(
  value: string | null | undefined,
  fallback: string,
): string {
  // Satu garis bawah per RENTETAN karakter berbahaya, jadi
  // `Rina/Adi:*?"<>|Bunga` menjadi `Rina_Adi_Bunga`, bukan `Rina_Adi______Bunga`.
  let out = "";
  let pendingSeparator = false;
  for (const char of String(value ?? "")) {
    const code = char.codePointAt(0) ?? 0;
    if (UNSAFE_FILENAME_CHARS.has(char) || isControlCode(code)) {
      if (out.length > 0) pendingSeparator = true;
      continue;
    }
    if (pendingSeparator) {
      out += "_";
      pendingSeparator = false;
    }
    out += char;
  }

  const cleaned = out
    .slice(0, 120)
    .replace(/\s+/g, " ")
    .trim()
    // Nama file/folder tidak boleh diawali atau diakhiri titik, spasi, garis,
    // atau underscore (`.hidden`, `CON`, `trailing .`).
    .replace(/^[.\-_\s]+|[.\-_\s]+$/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}


export function buildAgentReportFileName(options: {
  agentName: string | null | undefined;
  agentId: string;
  year: number;
  extension: string;
}): string {
  const { agentName, agentId, year, extension } = options;
  const safeAgentId = sanitizeReportFilePart(agentId, "agent");
  const safeAgentName = sanitizeReportFilePart(agentName, safeAgentId);
  return `Laporan_Audit_${safeAgentName}_${year}.${extension}`;
}

// ---------------------------------------------------------------------------
// CSV Helpers
// ---------------------------------------------------------------------------

/**
 * Pemicu formula spreadsheet. Kalau karakter pertama sebuah sel adalah salah
 * satunya, spreadsheet dapat memperlakukan sel itu sebagai formula, bukan
 * sebagai teks.
 *
 * Bukti empiris yang tersedia di lingkungan ini: pada LibreOffice headless
 * hanya `=` yang benar-benar menjadi formula (`'=1+1` tetap sel formula pada
 * baca-balik `openpyxl`), sementara `@SUM(1,1)`, `+1+1`, dan `-1-1` tetap
 * teks. `+`, `-`, dan `@` tetap dimasukkan karena aturan konsumen
 * berbeda-beda dan hanya satu konsumen yang bisa diuji di sini — jadi bagian
 * ini bersifat **defensif, bukan terverifikasi**. `\t` dan `\r` dipertahankan
 * dari perilaku lama; keduanya tidak terbukti memicu formula di LibreOffice,
 * tapi tidak ada biaya menanganinya dan keduanya merusak pembacaan kalau tidak
 * di-escape.
 */
const CSV_FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Angka biasa, tanda opsional. Sel seperti `-1.5` atau `+3` BUKAN formula:
 * menganotasinya akan mengubah kolom numerik menjadi teks dan merusak
 * perhitungan pembaca, jadi sel seperti itu dikecualikan.
 */
const CSV_PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Placeholder internal laporan untuk nilai yang tidak ada — `computeTenure()`
 * memakai `-` untuk agen tanpa `bergabung_date`. Ini bukan pemicu formula,
 * jadi penanda `[teks] ` di depannya hanya mengaburkan nilai yang sebenarnya
 * (`Masa Kerja,[teks] -`), dan reviewer laporan mengira ada data yang perlu
 * dinetralisasi padahal tidak ada.
 *
 * Pengecualian ini sengaja **sangat sempit**: hanya string yang persis satu
 * tanda hubung. Semua tetangganya tetap seperti sebelumnya —
 *   - `-1-1` masih pemicu formula, jadi tetap dilindungi penanda;
 *   - `-1.5` sudah dikecualikan `CSV_PLAIN_NUMBER` sebagai angka biasa;
 *   - `- 1`, `--`, dan ` - ` bukan placeholder, jadi masuk aturan biasa.
 *
 * Empat karakter, `=`, `+`, `-`, dan `@`, tidak mungkin membentuk ekspresi
 * lengkap tanpa operand: satu tanda hubung tunggal bukan formula yang bisa
 * dievaluasi spreadsheet, dan itulah yang dibuktikan lewat konsumen spreadsheet
 * nyata pada file yang diunduh.
 */
const CSV_INTERNAL_PLACEHOLDER = "-";

/**
 * Penanda netralisasi, disisipkan di depan nilai yang akan dibaca spreadsheet
 * sebagai formula.
 *
 * Kenapa penanda, bukan sekadar diapit tanda kutip: pengapitan tanda kutip
 * sudah terbukti BUKAN netralisasi. Diuji pada file CSV yang benar-benar
 * diunduh, dibuka di LibreOffice headless, sel `"=1+1"` tetap terbaca sebagai
 * sel formula (`data_type` formula pada baca-balik `openpyxl`) — cukup untuk
 * membuktikan bahwa diapit tanda kutip tidak neutralize apa pun. Penanda
 * membuat karakter pertama sel berhenti jadi pemicu formula, jadi tidak ada
 * konsumen yang bisa menilainya sebagai formula hanya karena mem-parse CSV.
 *
 * Penanda `[teks] ` dipilih (bukan hanya tanda kutip tunggal) karena tidak ada
 * alat mana pun yang mengupasnya: kalau suatu saat pipeline hilir menghapus
 * tanda kutip paksa, nilai yang tersisa kembali berawalan `=` dan bisa dievaluasi
 * lagi. Penanda ini juga terbaca apa adanya oleh auditor yang membuka
 * laporan, dan persis satu prefiks per sel yang perlu netralisasi — bukan
 * pengubah isi atau skema dokumen.
 *
 * Batasan yang jujur: nilai yang diawali spasi lalu pemicu (` =1+1`) tidak
 * diubah — di LibreOffice sel seperti itu tetap teks, dan tidak ada konsumen
 * lain yang bisa diuji di sini. Penganotasan prosa biasa yang kebetulan
 * diawali spasi hanya menambah kebisingan, jadi aturan ini sengaja berhenti di
 * karakter pertama. Lihat `docs/feature-agent-detail-export-csv-md-html.md`.
 */
const CSV_FORMULA_PREFIX = "[teks] ";

/**
 * Escape satu nilai sel CSV.
 *
 * Empat lapis, berurutan:
 *   1. **Pengecualian placeholder internal.** String yang persis `-` (lihat
 *      `CSV_INTERNAL_PLACEHOLDER`) ditulis apa adanya — tanpa penanda dan
 *      tanpa tanda kutip, jadi nilainya tetap terbaca persis seperti yang
 *      ditulis exporter.
 *   2. **Netralisasi formula.** Nilai yang diawali pemicu formula dan bukan
 *      angka biasa diberi penanda di depannya. Nilai aslinya tidak pernah
 *      diubah atau dipotong — penanda bisa dihapus sepenuhnya untuk
 *      memulihkan teks apa adanya.
 *   3. **Pengapitan.** Sel yang berisi koma, tanda kutip, atau baris baru
 *      diapit tanda kutip; tanda kutip di dalamnya digandakan (RFC 4180).
 *   4. **Konsistensi angka bertanda.** Nilai yang sudah berupa angka bertanda
 *      (`-1.5`) tetap diapit tanda kutip seperti sebelumnya, jadi sel angka
 *      tidak pernah berubah bentuk byte hanya karena ada mitigasi baru.
 */
function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  const isPlaceholder = str === CSV_INTERNAL_PLACEHOLDER;
  const isFormula =
    !isPlaceholder &&
    CSV_FORMULA_TRIGGER.test(str) &&
    !CSV_PLAIN_NUMBER.test(str);
  const safe = isFormula ? CSV_FORMULA_PREFIX + str : str;
  if (
    safe.includes(",") ||
    safe.includes('"') ||
    safe.includes("\n") ||
    safe.includes("\r") ||
    // Angka bertanda: pertahankan pengapitan yang sudah ada sebelumnya.
    // Placeholder dikecualikan supaya `-` tetap polos, bukan `"-"`.
    (!isPlaceholder && CSV_FORMULA_TRIGGER.test(safe))
  ) {
    return '"' + safe.replace(/"/g, '""') + '"';
  }
  return safe;
}

function csvRow(values: unknown[]): string {
  return values.map(csvEscape).join(",") + "\n";
}

/**
 * Baris komentar cakupan. Diletakkan DI ANTARA baris kosong pemisah dan baris
 * heading seksi, jadi tidak pernah ikut terhitung sebagai baris tabel oleh
 * pembaca seksi (`csvSectionRows` berhenti di baris kosong maupun di `# `).
 */
function csvScopeComment(label: string): string {
  return "// Cakupan: " + label + "\n";
}

function csvSection(
  rows: string[],
  sectionName: string,
  headerRow?: unknown[],
  scopeLabel?: string,
): void {
  rows.push("\n");
  if (scopeLabel) {
    rows.push(csvScopeComment(scopeLabel));
  }
  rows.push("# " + sectionName + "\n");
  if (headerRow) {
    rows.push(csvRow(headerRow));
  }
}

// ---------------------------------------------------------------------------
// generateCSV
// ---------------------------------------------------------------------------

export function generateCSV(
  data: AgentDetailData,
  monthlySummaries: AgentPeriodSummary[],
  temuanDisplayItems: TemuanDisplayItemExport[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[],
  selectedYear: number,
  scope?: AgentReportScope,
): string {
  const rows: string[] = [];

  const peserta = data.peserta;
  const masaKerja = computeTenure(peserta.bergabung_date);
  // Nama agen ikut di-escape: tanpa itu, satu tanda kutip di nama agen membuat
  // seluruh file CSV tidak bisa di-parse (saya buka kuotanya sampai baris
  // berikutnya). Untuk nama tanpa karakter khusus, byte keluaran tidak berubah.
  rows.push("# Laporan Audit Agent - " + csvEscape(peserta.nama) + "\n");
  rows.push(csvRow(["Nama", peserta.nama]));
  rows.push(csvRow(["Tim", peserta.tim]));
  rows.push(csvRow(["Batch", peserta.batch_name]));
  rows.push(csvRow(["Jabatan", peserta.jabatan ?? "Agent"]));
  rows.push(csvRow(["Masa Kerja", masaKerja]));
  rows.push(csvRow(["Tahun Laporan", String(selectedYear)]));
  // Baris key/value tambahan, bukan kolom tabel baru: menyatakan layanan audit
  // yang aktif sehingga angka seksi lain tidak dibaca sebagai satu periode.
  if (scope) {
    rows.push(csvRow(["Layanan Audit", scope.service.toUpperCase()]));
  }

  // Monthly Summaries
  csvSection(
    rows,
    "Ringkasan Skor Bulanan",
    ["Bulan", "Skor Final", "NC Score", "CR Score", "Sesi", "Temuan"],
    scope ? yearServiceScopeLabel(scope.service, selectedYear) : undefined,
  );
  for (const s of monthlySummaries) {
    rows.push(
      csvRow([s.label, s.finalScore, s.nonCriticalScore, s.criticalScore, s.sessionCount, s.findingsCount]),
    );
  }

  // Detail Temuan
  csvSection(
    rows,
    "Detail Temuan",
    [
      "Bulan", "Tahun", "Indikator", "Kategori", "Nilai", "Ketidaksesuaian", "Sebaiknya", "No Tiket",
    ],
    scope ? yearServiceScopeLabel(scope.service, selectedYear) : undefined,
  );
  for (const t of temuanDisplayItems) {
    rows.push(
      csvRow([
        MONTHS_FULL[t.month - 1] ?? t.month,
        t.year,
        t.indicatorName,
        t.category,
        formatNilai(t.nilai),
        t.ketidaksesuaian ?? "",
        t.sebaiknya ?? "",
        t.no_tiket ?? "",
      ]),
    );
  }

  // Top Tickets
  csvSection(
    rows,
    "Tiket Pengurang Skor Terbesar",
    [
      "No Tiket", "Score Deduction", "Jumlah Temuan", "Parameter Terberat",
    ],
    scope ? monthScopeLabel(scope.service, selectedYear, scope.month) : undefined,
  );
  for (const ticket of topTickets) {
    rows.push(
      csvRow([
        ticket.no_tiket,
        ticket.scoreDeduction.toFixed(1),
        ticket.findingCount,
        ticket.heaviestParam,
      ]),
    );
  }

  // Root Causes
  csvSection(
    rows,
    "Akar Masalah",
    [
      "Label", "Prioritas", "Jumlah Temuan", "Tiket Terdampak",
      "Temuan Critical", "Rata-rata Nilai", "Rekomendasi",
    ],
    scope ? yearToDateScopeLabel(scope.service, selectedYear, scope.month) : undefined,
  );
  for (const cause of activeRootCauses) {
    rows.push(
      csvRow([
        cause.label,
        cause.priority,
        cause.findingsCount,
        cause.affectedTickets,
        cause.criticalFindingsCount,
        cause.averageNilai.toFixed(2),
        cause.recommendation,
      ]),
    );
  }

  // Trend Data
  if (data.personalTrend && data.personalTrend.labels.length > 0) {
    csvSection(
      rows,
      "Perkembangan Skor",
      [
        "Periode",
        ...data.personalTrend.datasets.map((ds) => ds.label),
      ],
      scope
        ? trendScopeLabel(
            scope.service,
            selectedYear,
            data.personalTrend.labels,
          )
        : undefined,
    );
    for (let i = 0; i < data.personalTrend.labels.length; i++) {
      rows.push(
        csvRow([
          data.personalTrend.labels[i],
          ...data.personalTrend.datasets.map((ds) => ds.data[i] ?? ""),
        ]),
      );
    }
  }

  // Comparison Table
  if (data.comparisonTable && data.comparisonTable.rows.length > 0) {
    csvSection(
      rows,
      "Perbandingan Temuan",
      [
        "Parameter", "Agent Ini", "Rata-rata Tim", "Rata-rata Service",
      ],
      comparisonScopeLabel(data),
    );
    for (const row of data.comparisonTable.rows) {
      rows.push(
        csvRow([row.label, row.agentCount, row.teamAverage, row.serviceAverage]),
      );
    }
  }

  return rows.join("");
}

// ---------------------------------------------------------------------------
// MD Helpers
// ---------------------------------------------------------------------------

function mdEscape(text: unknown): string {
  const str = text == null ? "" : String(text);
  return str.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function mdTable(
  header: string[],
  rows: string[][],
): string {
  const h = "| " + header.join(" | ") + " |\n";
  const sep = "| " + header.map(() => "---").join(" | ") + " |\n";
  const body = rows
    .map((r) => "| " + r.map((c) => mdEscape(c)).join(" | ") + " |")
    .join("\n");
  return "\n" + h + sep + body + "\n";
}

/** Baris cakupan MD, setara baris komentar CSV di batas non-tabel yang sama. */
function mdScopeLine(label: string): string {
  return "_Cakupan: " + label + "_\n";
}

// ---------------------------------------------------------------------------
// generateMD
// ---------------------------------------------------------------------------

export function generateMD(
  data: AgentDetailData,
  monthlySummaries: AgentPeriodSummary[],
  temuanDisplayItems: TemuanDisplayItemExport[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[],
  selectedYear: number,
  scope?: AgentReportScope,
): string {
  const peserta = data.peserta;
  const masaKerja = computeTenure(peserta.bergabung_date);
  const lines: string[] = [];

  // Title
  lines.push("# Laporan Audit Agent: " + peserta.nama + "\n");

  // Profile
  lines.push("## Profil Agent\n");
  lines.push(
    mdTable(
      ["Atribut", "Nilai"],
      [
        ["Nama", peserta.nama],
        ["Tim", peserta.tim],
        ["Batch", peserta.batch_name],
        ["Jabatan", peserta.jabatan ?? "Agent"],
        ["Masa Kerja", masaKerja],
        ["Tahun Laporan", String(selectedYear)],
        ...(scope
          ? [["Layanan Audit", scope.service.toUpperCase()]]
          : []),
      ],
    ),
  );

  // Monthly Summaries
  lines.push("\n## Ringkasan Skor Bulanan\n");
  if (scope)
    lines.push(mdScopeLine(yearServiceScopeLabel(scope.service, selectedYear)));
  if (monthlySummaries.length === 0) {
    lines.push("_Tidak ada data ringkasan untuk periode ini._\n");
  } else {
    lines.push(
      mdTable(
        ["Bulan", "Skor Final", "NC Score", "CR Score", "Sesi", "Temuan"],
        monthlySummaries.map((s) => [
          s.label,
          String(s.finalScore),
          String(s.nonCriticalScore),
          String(s.criticalScore),
          String(s.sessionCount),
          String(s.findingsCount),
        ]),
      ),
    );
  }

  // Detail Temuan
  lines.push("\n## Detail Temuan\n");
  if (scope)
    lines.push(mdScopeLine(yearServiceScopeLabel(scope.service, selectedYear)));
  if (temuanDisplayItems.length === 0) {
    lines.push("_Tidak ada temuan untuk periode ini._\n");
  } else {
    lines.push(
      mdTable(
        ["Bulan", "Tahun", "Indikator", "Kategori", "Nilai", "Ketidaksesuaian", "Sebaiknya", "No Tiket"],
        temuanDisplayItems.map((t) => [
          MONTHS_FULL[t.month - 1] ?? String(t.month),
          String(t.year),
          t.indicatorName,
          t.category,
          formatNilai(t.nilai),
          t.ketidaksesuaian ?? "-",
          t.sebaiknya ?? "-",
          t.no_tiket ?? "-",
        ]),
      ),
    );
  }

  // Top Tickets
  lines.push("\n## Tiket Pengurang Skor Terbesar\n");
  if (scope)
    lines.push(
      mdScopeLine(monthScopeLabel(scope.service, selectedYear, scope.month)),
    );
  if (topTickets.length === 0) {
    lines.push("_Tidak ada tiket yang menurunkan skor._\n");
  } else {
    lines.push(
      mdTable(
        ["#", "No Tiket", "Score Deduction", "Jumlah Temuan", "Parameter Terberat"],
        topTickets.map((t, i) => [
          String(i + 1),
          t.no_tiket,
          t.scoreDeduction.toFixed(1),
          String(t.findingCount),
          t.heaviestParam,
        ]),
      ),
    );
  }

  // Root Causes
  lines.push("\n## Akar Masalah\n");
  if (scope)
    lines.push(
      mdScopeLine(
        yearToDateScopeLabel(scope.service, selectedYear, scope.month),
      ),
    );
  if (activeRootCauses.length === 0) {
    lines.push("_Belum ditemukan pola akar masalah yang dominan._\n");
  } else {
    for (const cause of activeRootCauses) {
      lines.push("### " + cause.label + "\n");
      lines.push("- **Prioritas**: " + cause.priority);
      lines.push("- **Jumlah Temuan**: " + cause.findingsCount);
      lines.push("- **Tiket Terdampak**: " + cause.affectedTickets);
      lines.push("- **Temuan Critical**: " + cause.criticalFindingsCount);
      lines.push("- **Rata-rata Nilai**: " + cause.averageNilai.toFixed(2));
      lines.push("- **Rekomendasi**: " + cause.recommendation);
      lines.push("");
    }
  }

  // Trend Data
  if (data.personalTrend && data.personalTrend.labels.length > 0) {
    lines.push("\n## Perkembangan Skor\n");
    if (scope) {
      lines.push(
        mdScopeLine(
          trendScopeLabel(
            scope.service,
            selectedYear,
            data.personalTrend.labels,
          ),
        ),
      );
    }
    lines.push(
      mdTable(
        ["Periode", ...data.personalTrend.datasets.map((ds) => ds.label)],
        data.personalTrend.labels.map((label, i) => [
          label,
          ...data.personalTrend.datasets.map((ds) => {
            const val = ds.data[i];
            return val != null ? String(val) : "-";
          }),
        ]),
      ),
    );
  }

  // Comparison Table
  if (data.comparisonTable && data.comparisonTable.rows.length > 0) {
    const scope = data.comparisonTable.scope;
    const startLabel = MONTHS_SHORT[(scope.startMonth ?? 1) - 1];
    const endLabel = MONTHS_SHORT[(scope.endMonth ?? 12) - 1];
    lines.push("\n## Perbandingan Temuan\n");
    lines.push(
      "_" + startLabel + "-" + endLabel + " " + scope.year +
      " • Layanan " + (scope.serviceLabel || scope.serviceType) +
      " • " + scope.teamLabel + "_\n",
    );
    lines.push(
      mdTable(
        ["Parameter", "Agent Ini", "Rata-rata Tim", "Rata-rata Service"],
        data.comparisonTable.rows.map((row) => [
          row.label,
          String(row.agentCount),
          String(row.teamAverage),
          String(row.serviceAverage),
        ]),
      ),
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// generateHTML
// ---------------------------------------------------------------------------

/**
 * Pintu masuk HTML untuk kedua varian.
 *
 * Seluruh desain laporan (stylesheet, kerangka markup, dan script interaktif)
 * hidup di `agentReportHtml.ts` supaya hanya ada SATU sumber desain. Fungsi ini
 * tidak merakit apa pun: ia hanya meneruskan snapshot yang sama ke builder itu.
 */
export function generateHTML(
  data: AgentDetailData,
  monthlySummaries: AgentPeriodSummary[],
  temuanDisplayItems: TemuanDisplayItemExport[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[],
  selectedYear: number,
  selectedService: string,
  variant: AgentHtmlVariant = "static",
  context: AgentHtmlExportContext = {},
): string {
  return buildAgentReportHtml({
    data,
    monthlySummaries,
    temuanDisplayItems,
    topTickets,
    activeRootCauses,
    selectedYear,
    selectedService,
    variant,
    context,
  });
}
