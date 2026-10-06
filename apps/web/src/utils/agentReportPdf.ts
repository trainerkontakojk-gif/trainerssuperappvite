/**
 * Laporan audit agen (SIDAK) — generator PDF A4 dengan teks yang bisa dicari.
 *
 * Unduhan PDF LANGSUNG, bukan dialog cetak: `jsPDF` (dependency web yang sudah
 * ada, diimpor dinamis) menulis dokumen biner dari snapshot yang sama dengan
 * HTML dan Excel, lalu hook mengunduhnya sebagai Blob `application/pdf`.
 *
 * Aturan yang dijaga di sini:
 *  - **Urutan baca sama dengan HTML.** Identitas → Kesimpulan Utama →
 *    Ringkasan (posisi, skor bulan terpilih, rekap bulanan, tiket, akar
 *    masalah) → Perkembangan Skor → Tren Temuan (total, per parameter,
 *    perbandingan) → Detail Temuan per parameter → catatan kaki. Label,
 *    cakupan, kesimpulan, dan arah baik/buruk datang dari `agentReportModel`.
 *  - **Teks asli, bukan gambar.** Seluruh isi ditulis sebagai operator teks;
 *    grafik hanya garis vektor dan angkanya tetap ada di tabel.
 *  - **Paginasi jujur.** Judul tidak menggantung di dasar halaman, header tabel
 *    berulang saat tabel terbelah, baris tabel tidak pernah keluar dari area
 *    cetak, dan setiap halaman memakai footer "Halaman X dari N".
 *  - **Teks aman untuk font standar tanpa kehilangan bukti.** Helvetica hanya
 *    mencetak WinAnsi; titik kode tanpa glyph dicetak sebagai penanda
 *    `[U+XXXX]` yang bisa dicari dan dibalik.
 *  - **Tanpa aset remote dan tanpa angka karangan.** Bagian kosong dinyatakan
 *    eksplisit; sesi tanpa temuan tidak pernah jadi baris temuan.
 */

import type { jsPDF as JsPdfDocument } from "jspdf";
import type { SidakAgentQuickviewResponse } from "@trainers/types";
import {
  QA_TARGET,
  SCORE_EMPTY_NOTE,
  TREND_EMPTY_NOTE,
  TREND_UNIT_LABEL,
  buildHighlights,
  comparisonDelta,
  computeTenure,
  countAxis,
  findingDeltaTone,
  findingTrend,
  finiteNumber,
  formatNumber,
  formatPercentDelta,
  formatPointDelta,
  groupFindingsByParameter,
  jabatanLabel,
  monthLabel,
  nilaiText,
  qaStatusLabel,
  reportScopes,
  resolveActiveMonth,
  resolveActiveScore,
  scoreAxis,
  scoreDeltaTone,
  scoreTrend,
  serviceLabel,
  yearText,
  type AgentReportSnapshot,
  type ReportScopes,
  type Tone,
  type TrendSeries,
} from "./agentReportModel";
import { sidakScoreLabel, sidakScoreTone } from "./sidakScoreStatus";

/** Snapshot laporan yang dipakai PDF: sama dengan HTML, tanpa `variant`. */
export type AgentReportPdfInput = AgentReportSnapshot;

// ---------------------------------------------------------------------------
// Geometri & tipografi (mm untuk tata letak, pt untuk ukuran font)
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_LEFT = 16;
const MARGIN_RIGHT = 16;
const MARGIN_TOP = 28;
/** Posisi header halaman; selalu DI ATAS area isi supaya tidak menimpa isi. */
const HEADER_TOP = 14;
const HEADER_RULE = 20;
/** Batas bawah area isi; footer digambar di bawah garis ini. */
const CONTENT_BOTTOM = PAGE_HEIGHT - 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const FONT = "helvetica";
const LINE_FACTOR = 1.4;

type Rgb = [number, number, number];

/** Palet yang sama dengan stylesheet laporan HTML (`agentReportHtml.ts`). */
const INK: Rgb = [15, 23, 42];
const INK_BODY: Rgb = [51, 65, 85];
const INK_MUTE: Rgb = [71, 85, 105];
const INK_FAINT: Rgb = [100, 116, 139];
const LINE: Rgb = [226, 232, 240];
const LINE_STRONG: Rgb = [203, 213, 225];
const WASH: Rgb = [241, 245, 249];
const TONE_OK: Rgb = [4, 120, 87];
const TONE_WARN: Rgb = [180, 83, 9];
const TONE_BAD: Rgb = [190, 18, 60];

const mm = (points: number): number => (points * 25.4) / 72;
const line = (size: number): number => mm(size * LINE_FACTOR);
const toneColor = (tone: Tone | null): Rgb =>
  tone === "ok"
    ? TONE_OK
    : tone === "warn"
      ? TONE_WARN
      : tone === "bad"
        ? TONE_BAD
        : INK_BODY;

// ---------------------------------------------------------------------------
// Sanitasi teks untuk font standar PDF (WinAnsi)
// ---------------------------------------------------------------------------

/**
 * Simbol yang lazim muncul di teks audit tetapi di luar WinAnsi. Dipetakan ke
 * ejaan Indonesia supaya kalimatnya tetap terbaca dan tidak berubah makna.
 */
const UNICODE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  // Spasi yang tidak bisa dipecah (non-breaking, narrow, thin) jadi spasi biasa,
  // supaya pembungkusan baris tidak tersandung di tengah kata.
  [/[\u00a0\u2007\u202f]/g, " "],
  // Panah dan matematika: ditulis ulang pakai ejaan Indonesia, bukan dihapus,
  // supaya arah dan batasnya masih terbaca di atas kertas.
  [/[→⇢➡➔]/g, "ke"],
  [/[←⇐⇠]/g, "dari"],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/[≈≅]/g, "~"],
  [/[×✕]/g, "x"],
  [/÷/g, "/"],
  [/±/g, "+/-"],
  // Superscript ditulis ulang sebagai digit biasa (pangkat 2 -> 2).
  [/¹/g, "1"],
  [/²/g, "2"],
  [/³/g, "3"],
  [/⁴/g, "4"],
  // Kutip melengkung tidak ada di sebagian pembaca font lawas; diseragamkan ke
  // ASCII agar tanda kutip data tidak berubah bentuk.
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
];

/**
 * Titik kode WinAnsi di atas Latin-1 (0x80-0x9F). Huruf Asia, emoji, dan
 * matematika Unicode tidak termasuk daftar ini karena Helvetica tidak punya
 * glyph-nya; semuanya dicetak sebagai penanda `unprintableMarker()`, bukan
 * dibiarkan jadi byte rusak dan bukan pula diganti spasi (yang menghapus bukti
 * pengguna tanpa jejak).
 */
const WIN_ANSI_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Penanda yang sah sebagai satu token utuh, untuk pemotongan baris. */
const MARKER_AT_TOKEN_START = /^\[U\+[0-9A-F]{4,6}\]/;

/**
 * Penanda satu titik kode yang tidak bisa dicetak: `U+` + 4-6 digit heksa huruf
 * besar, jadi `[U+4E2D]`.
 *
 * Bentuk ini dipilih karena memenuhi empat syarat sekaligus, tanpa menambah
 * dependency dan tanpa font eksternal:
 *   1. **Terlihat.** Penanda dicetak seperti teks biasa, jadi pembaca laporan
 *      tahu ada karakter yang tidak ikut tercetak — bukan mengira datanya
 *      bersih.
 *   2. **Bisa dicari.** Seluruhnya ASCII, jadi mencari `[U+4E2D]` di pembaca PDF
 *      mana pun bekerja seperti mencari teks biasa.
 *   3. **Tidak ambigu.** Tidak ada teks lain di dokumen ini yang memakai kurung
 *      siku + `U+` + heksa, sehingga penanda selalu berarti "satu titik kode".
 *   4. **Dapat dibalik.** `parseInt(heksa, 16)` mengembalikan karakter aslinya
 *      persis, jadi bukti yang tidak bisa dicetak tetap bisa dipulihkan, bukan
 *      hanya dicatat sebagai "ada yang hilang".
 *
 * Notasi titik kode Unicode ini lazim dibaca, jadi tidak ada format baru yang
 * harus dipelajari pembaca. Batasan yang tersisa dicatat di
 * `docs/feature-agent-detail-export-csv-md-html.md`.
 */
function unprintableMarker(code: number): string {
  return `[U+${code.toString(16).toUpperCase().padStart(4, "0")}]`;
}

/**
 * Teks aman untuk font standar PDF: petakan simbol di luar WinAnsi ke ejaan
 * Indonesia, lalu ganti setiap titik kode yang tidak punya glyph dengan
 * penandanya. Panjang teks tidak dibatasi di sini; pembungkusan baris ada di
 * lapisan layout, sehingga teks yang panjang tetap utuh dan hanya menjadi
 * lebih banyak baris.
 */
function pdfSafeText(value: unknown): string {
  // Enter dan tab dari catatan yang diketik adalah spasi putih, bukan karakter
  // tak-tercetak: tanpa ini setiap pindah baris tercetak sebagai "[U+000A]".
  // Pemisah baris yang ingin dipertahankan sudah dipecah lebih dulu oleh
  // `wrapPdfText`.
  let text = String(value ?? "").replace(/[\t\r\n]/g, " ");
  for (const [pattern, replacement] of UNICODE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = Array.from(text)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      // Karakter kontrol (C0/C1) tidak punya glyph dan merusak content
      // stream PDF, jadi diperlakukan sama seperti karakter tanpa glyph: bukan
      // dihapus diam-diam, tapi ditandai supaya jejaknya masih ada.
      if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
        return unprintableMarker(code);
      }
      return code <= 0xff || WIN_ANSI_HIGH.has(code)
        ? char
        : unprintableMarker(code);
    })
    .join("");
  return text.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Pengukuran & pembungkusan baris
// ---------------------------------------------------------------------------

type Measure = (text: string, font: "normal" | "bold", size: number) => number;

/**
 * Lebar satu karakter, diukur sekali per (font, ukuran, karakter).
 *
 * `getTextWidth` jsPDF tidak bisa dipercaya untuk string panjang (terbukti
 * mengembalikan 0 untuk pengulangan karakter yang panjang), sedangkan
 * pengukuran per karakter konsisten dengan pengukuran string utuh. Karena itu
 * tabel lebar di-cache dan lebar string dihitung sendiri. `splitTextToSize`
 * juga tidak dipakai: pengukurannya meleset untuk teks tanpa spasi sehingga
 * baris bisa melewati margin kanan.
 */
function createMeasurer(doc: JsPdfDocument): Measure {
  const cache = new Map<string, number>();
  return (text, font, size) => {
    doc.setFont(FONT, font);
    doc.setFontSize(size);
    let total = 0;
    for (const char of text) {
      const key = `${font}|${size}|${char}`;
      let width = cache.get(key);
      if (width === undefined) {
        // Pengukuran pertama sesudah `setFont` bisa mengembalikan 0 pada
        // beberapa versi jsPDF, jadi satu karakter dummy diukur lebih dulu.
        doc.getTextWidth("0");
        width = doc.getTextWidth(char);
        cache.set(key, width);
      }
      total += width;
    }
    return total;
  };
}

/**
 * Pecah satu token jadi atom untuk pemotongan baris. Satu penanda `[U+…]`
 * dihitung sebagai SATU atom: kalau tidak, token yang dipecah per karakter
 * bisa membelah penanda menjadi `[U+1EC` + `7]`, dan penanda yang terbelah
 * tidak bisa dibalik ke karakter aslinya.
 *
 * Penanda satu karakter lebih lebar dari kolom (tidak pernah terjadi pada kolom
 * laporan mana pun, karena penanda terpendek pun 8 karakter) tetap dicetak
 * utuh: kemampuan membalik bukti lebih penting daripada menjaga lebar baris,
 * dan hal itu hanya berlaku pada kasus yang tidak ada.
 */
function markerAtoms(token: string): string[] {
  const atoms: string[] = [];
  let rest = token;
  while (rest.length > 0) {
    const marker = MARKER_AT_TOKEN_START.exec(rest)?.[0];
    if (marker !== undefined) {
      atoms.push(marker);
      rest = rest.slice(marker.length);
      continue;
    }
    atoms.push(rest.charAt(0));
    rest = rest.slice(1);
  }
  return atoms;
}

/** Potongan satu token yang muat di lebar kolom (dipakai untuk token panjang). */
function hardBreak(
  token: string,
  maxWidth: number,
  measure: Measure,
  font: "normal" | "bold",
  size: number,
): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const atom of markerAtoms(token)) {
    const candidate = current + atom;
    if (current !== "" && measure(candidate, font, size) > maxWidth) {
      chunks.push(current);
      current = atom;
      continue;
    }
    current = candidate;
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

/**
 * Bungkus teks pada lebar kolom. Kata dipisah di spasi; token yang sendirian
 * sudah lebih lebar dari kolom (URL, nomor panjang, kalimat tanpa spasi) dipecah
 * per karakter supaya tidak pernah melewati margin kanan.
 */
function wrapPdfText(
  text: unknown,
  maxWidth: number,
  measure: Measure,
  font: "normal" | "bold" = "normal",
  size = 8.5,
): string[] {
  // Baris baru di data (catatan yang diketik dengan Enter) dipertahankan
  // sebagai baris baru; baris kosong di antaranya tidak dicetak.
  const lines = String(text ?? "")
    .split(/\r\n|\r|\n/)
    .filter((part) => part.trim() !== "")
    .flatMap((part) => wrapLine(part, maxWidth, measure, font, size));
  return lines.length > 0 ? lines : [""];
}

/** Bungkus SATU baris teks (tanpa pemisah baris) pada lebar kolom. */
function wrapLine(
  text: string,
  maxWidth: number,
  measure: Measure,
  font: "normal" | "bold",
  size: number,
): string[] {
  const lines: string[] = [];
  for (const word of pdfSafeText(text).split(" ")) {
    if (word === "") continue;
    const current = lines[lines.length - 1];
    if (current !== undefined) {
      const candidate = `${current} ${word}`;
      if (measure(candidate, font, size) <= maxWidth) {
        lines[lines.length - 1] = candidate;
        continue;
      }
    }
    if (measure(word, font, size) <= maxWidth) {
      lines.push(word);
      continue;
    }
    const chunks = hardBreak(word, maxWidth, measure, font, size);
    for (let index = 0; index < chunks.length - 1; index += 1) {
      lines.push(chunks[index]);
    }
    lines.push(chunks[chunks.length - 1]);
  }
  return lines.length > 0 ? lines : [""];
}

// ---------------------------------------------------------------------------
// Mesin tata letak
// ---------------------------------------------------------------------------

interface TextStyle {
  font?: "normal" | "bold";
  size?: number;
  color?: Rgb;
  /** Ketinggian satu baris termasuk spasi antarbaris (mm). */
  lineHeight?: number;
  gapAfter?: number;
}

interface PdfColumn {
  header: string;
  align?: "left" | "right";
  /** Bobot lebar kolom relatif; lebar minimum dijaga agar isi tidak terlalu rapat. */
  weight: number;
  minWidth?: number;
  tone?: (rowIndex: number, value: string) => Tone | null;
  /**
   * Kolom identifier (mis. nomor tiket): dicetak bold kontras penuh, bukan
   * abu-abu seperti sel biasa, supaya nomor tiket mudah dipindai di antara
   * angka-angka lain.
   */
  emphasis?: boolean;
}

interface PdfTable {
  caption?: string;
  columns: PdfColumn[];
  rows: string[][];
  /** Indeks baris yang ditandai sebagai total (mis. total benchmark). */
  totalRows?: number[];
}

/**
 * Dokumen A4 dengan paginasi.
 *
 * Semua koordinat dalam mm dan `y` selalu tepi ATAS baris berikutnya, jadi satu
 * blok = "pastikan ruang -> gambar -> majukan `y`". Setiap baris yang melewati
 * batas bawah membuat halaman baru secara otomatis, sehingga tidak ada kondisi
 * yang bisa menggambar di luar area cetak.
 *
 * `doc` sengaja terekspos: meter skor, kotak inisial, dan grafik tren lebih
 * jujur digambar langsung ke kanvas daripada dipaksakan ke dalam API paragraf.
 */
class PdfDocument {
  /** Kanvas jsPDF; dipakai untuk gambar vektor (meter, kotak, garis tren). */
  readonly doc: JsPdfDocument;
  private y = MARGIN_TOP;
  private pages = 0;

  constructor(
    doc: JsPdfDocument,
    private readonly header: { left: string; right: string },
    readonly measure: Measure,
  ) {
    this.doc = doc;
  }

  get cursor(): number {
    return this.y;
  }

  /** Sisa tinggi area isi pada halaman sekarang (mm). */
  get remaining(): number {
    return CONTENT_BOTTOM - this.y;
  }

  begin(): void {
    this.startPage();
  }

  moveTo(value: number): void {
    this.y = value;
  }

  private startPage(): void {
    if (this.pages > 0) this.doc.addPage();
    this.pages += 1;
    // Header digambar pada koordinat tetap, BUKAN pada kursor isi: kalau
    // header memakai kursor, teksnya menimpa baris isi pertama halaman itu.
    this.y = HEADER_TOP;
    // Font, ukuran, dan warna ditulis eksplisit: `write` hanya memindahkan
    // glyph, jadi tanpa ini header halaman mewarisi warna sel terakhir yang
    // digambar — baris tabel dengan delta negatif membuat header identitas
    // tercetak merah seperti status, bukan seperti header.
    this.doc.setFont(FONT, "normal");
    this.doc.setFontSize(8);
    this.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
    this.write(this.header.left, MARGIN_LEFT, "left");
    this.write(this.header.right, PAGE_WIDTH - MARGIN_RIGHT, "right");
    this.doc.setDrawColor(LINE_STRONG[0], LINE_STRONG[1], LINE_STRONG[2]);
    this.doc.setLineWidth(0.2);
    this.doc.line(
      MARGIN_LEFT,
      HEADER_RULE,
      PAGE_WIDTH - MARGIN_RIGHT,
      HEADER_RULE,
    );
    this.y = MARGIN_TOP;
  }

  /** Pindah halaman bila `height` tidak muat; true berarti baru pindah. */
  ensureSpace(height: number): boolean {
    if (this.remaining >= height) return false;
    this.startPage();
    return true;
  }

  /** Garis pemisah 0.2mm (bukan bayangan) sebagai batas seksi. */
  rule(color: Rgb = LINE, gapBefore = 3, gapAfter = 4): void {
    this.ensureSpace(gapBefore + 1 + gapAfter);
    this.y += gapBefore;
    this.doc.setDrawColor(color[0], color[1], color[2]);
    this.doc.setLineWidth(0.2);
    this.doc.line(MARGIN_LEFT, this.y, PAGE_WIDTH - MARGIN_RIGHT, this.y);
    this.y += gapAfter;
  }

  private write(
    text: string,
    x: number,
    align: "left" | "right" | "center",
  ): void {
    this.doc.text(pdfSafeText(text), x, this.y, { align, baseline: "top" });
  }

  /** Satu baris teks pada posisi kursor; pindah halaman bila tidak muat. */
  writeLine(
    text: string,
    x: number,
    style: TextStyle = {},
    align: "left" | "right" | "center" = "left",
  ): void {
    const size = style.size ?? 8.5;
    const step = style.lineHeight ?? line(size);
    this.ensureSpace(step);
    this.doc.setFont(FONT, style.font ?? "normal");
    this.doc.setFontSize(size);
    const color = style.color ?? INK_BODY;
    this.doc.setTextColor(color[0], color[1], color[2]);
    this.write(text, x, align);
    this.y += step;
  }

  /**
   * Paragraf yang boleh turun halaman: ditulis per baris hasil pembungkusan, jadi
   * teks panjang mengalir ke halaman berikutnya, tidak pernah terpotong.
   */
  paragraph(
    text: unknown,
    options: TextStyle & { x?: number; width?: number; indent?: number } = {},
  ): void {
    const size = options.size ?? 8.5;
    const width = options.width ?? CONTENT_WIDTH;
    const x = (options.x ?? MARGIN_LEFT) + (options.indent ?? 0);
    const wrapped = wrapPdfText(
      text,
      width - (options.indent ?? 0),
      this.measure,
      options.font ?? "normal",
      size,
    );
    for (const item of wrapped) this.writeLine(item, x, options);
    if (options.gapAfter) this.y += options.gapAfter;
  }

  /**
   * Judul seksi + baris cakupan. `keepWith` adalah tinggi minimum isi yang
   * harus ikut dalam halaman yang sama, jadi judul tidak pernah menggantung
   * sendirian di dasar halaman dengan isinya di halaman berikutnya.
   */
  heading(
    title: string,
    scope: string | undefined,
    keepWith: number,
    size = 12,
  ): void {
    const scopeLines = scope
      ? wrapPdfText(scope, CONTENT_WIDTH, this.measure, "normal", 7.5)
      : [];
    this.ensureSpace(
      line(size) + scopeLines.length * line(7.5) + 4 + Math.max(0, keepWith),
    );
    this.paragraph(title, { font: "bold", size, color: INK });
    for (const item of scopeLines) {
      this.writeLine(item, MARGIN_LEFT, { size: 7.5, color: INK_FAINT });
    }
    this.y += 2;
  }

  /**
   * Tabel dengan header berulang.
   *
   * Setiap baris diukur lebih dulu. Baris yang tidak muat dipindah ke halaman
   * berikutnya bersama header-nya, dan baris yang lebih tinggi dari satu halaman
   * dipecah per baris teks (band), sehingga tidak ada isi tabel yang keluar dari
   * area cetak.
   */
  table(spec: PdfTable): void {
    const size = 8;
    const lineHeight = line(size);
    const paddingX = 2;
    const paddingY = 1.5;
    const widths = columnWidths(spec.columns);

    const drawHeader = () => {
      this.doc.setFillColor(WASH[0], WASH[1], WASH[2]);
      this.doc.rect(
        MARGIN_LEFT,
        this.y,
        CONTENT_WIDTH,
        lineHeight + paddingY * 2,
        "F",
      );
      this.doc.setFont(FONT, "bold");
      this.doc.setFontSize(7);
      this.doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
      // Header memakai titik jangkar yang sama dengan sel: kolom rata kanan
      // dijangkar di tepi kanan kolom, bukan di tepi kirinya. Sebelumnya header
      // rata kanan dijangkar di tepi KIRI sehingga bergeser satu kolom ke kiri
      // dari angkanya.
      let x = MARGIN_LEFT;
      spec.columns.forEach((column, index) => {
        const align = column.align ?? "left";
        this.doc.text(
          pdfSafeText(column.header),
          align === "right" ? x + widths[index] - paddingX : x + paddingX,
          this.y + paddingY,
          { align, baseline: "top" },
        );
        x += widths[index];
      });
      this.doc.setDrawColor(LINE_STRONG[0], LINE_STRONG[1], LINE_STRONG[2]);
      this.doc.setLineWidth(0.2);
      const bottom = this.y + lineHeight + paddingY * 2;
      this.doc.line(MARGIN_LEFT, bottom, PAGE_WIDTH - MARGIN_RIGHT, bottom);
      this.y = bottom;
    };

    if (spec.caption) {
      this.ensureSpace(line(8.5) + lineHeight + paddingY * 2);
      this.paragraph(spec.caption, { font: "bold", size: 8.5, color: INK });
    }
    this.ensureSpace(lineHeight + paddingY * 2);
    drawHeader();

    spec.rows.forEach((row, rowIndex) => {
      const isTotal = (spec.totalRows ?? []).includes(rowIndex);
      const cells = spec.columns.map((column, index) =>
        wrapPdfText(
          row[index] ?? "",
          widths[index] - paddingX * 2,
          this.measure,
          isTotal || column.emphasis ? "bold" : "normal",
          size,
        ),
      );
      const bands = Math.max(...cells.map((cell) => cell.length));
      for (let band = 0; band < bands; band += 1) {
        const bandHeight = lineHeight + paddingY * 2;
        if (this.remaining < bandHeight) {
          this.startPage();
          drawHeader();
        }
        if (band === 0 && rowIndex % 2 === 1 && !isTotal) {
          this.doc.setFillColor(251, 252, 254);
          this.doc.rect(MARGIN_LEFT, this.y, CONTENT_WIDTH, bandHeight, "F");
        }
        let x = MARGIN_LEFT;
        spec.columns.forEach((column, index) => {
          const align = column.align ?? "left";
          const tone = column.tone?.(rowIndex, row[index] ?? "") ?? null;
          const bold = isTotal || column.emphasis === true;
          // Kolom emphasis memakai tinta penuh, bukan warna sel biasa: nomor
          // tiket tidak boleh ikut memudar bersama baris tabel.
          const color = bold ? INK : toneColor(tone);
          this.doc.setFont(FONT, bold ? "bold" : "normal");
          this.doc.setFontSize(size);
          this.doc.setTextColor(color[0], color[1], color[2]);
          const value = cells[index][band];
          if (value !== undefined) {
            this.doc.text(
              value,
              align === "right" ? x + widths[index] - paddingX : x + paddingX,
              this.y + paddingY,
              {
                align,
                baseline: "top",
              },
            );
          }
          x += widths[index];
        });
        this.y += bandHeight;
        if (band === bands - 1) {
          this.doc.setDrawColor(
            isTotal ? LINE_STRONG[0] : LINE[0],
            isTotal ? LINE_STRONG[1] : LINE[1],
            isTotal ? LINE_STRONG[2] : LINE[2],
          );
          this.doc.setLineWidth(isTotal ? 0.3 : 0.15);
          this.doc.line(MARGIN_LEFT, this.y, PAGE_WIDTH - MARGIN_RIGHT, this.y);
        }
      }
    });
    this.y += 3;
  }

  /** Footer "Halaman X dari N" digambar setelah jumlah halaman diketahui. */
  finalize(): void {
    const total = this.doc.getNumberOfPages();
    for (let page = 1; page <= total; page += 1) {
      this.doc.setPage(page);
      this.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      this.doc.setLineWidth(0.2);
      this.doc.line(
        MARGIN_LEFT,
        PAGE_HEIGHT - 15,
        PAGE_WIDTH - MARGIN_RIGHT,
        PAGE_HEIGHT - 15,
      );
      this.doc.setFont(FONT, "normal");
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
      this.doc.text(this.header.left, MARGIN_LEFT, PAGE_HEIGHT - 13, {
        baseline: "top",
      });
      this.doc.text(
        `Halaman ${page} dari ${total}`,
        PAGE_WIDTH - MARGIN_RIGHT,
        PAGE_HEIGHT - 13,
        {
          align: "right",
          baseline: "top",
        },
      );
    }
  }
}

function columnWidths(columns: PdfColumn[]): number[] {
  const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
  const minima = columns.map((column) => column.minWidth ?? 14);
  const widths = columns.map((column, index) =>
    Math.max(minima[index], (column.weight / totalWeight) * CONTENT_WIDTH),
  );
  // Selisih pembulatan dikembalikan ke kolom terlebar supaya totalnya persis
  // CONTENT_WIDTH: kolom tidak boleh meluber melewati margin kanan.
  const overflow =
    widths.reduce((sum, width) => sum + width, 0) - CONTENT_WIDTH;
  if (Math.abs(overflow) > 0.01) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] = Math.max(minima[widest], widths[widest] - overflow);
  }
  return widths;
}


// ---------------------------------------------------------------------------
// Blok teks
// ---------------------------------------------------------------------------

/** Baris berpoin: poin di margin, teks membungkus dengan indentasi. */
function bullet(
  pdf: PdfDocument,
  text: string,
  style: { size?: number; color?: Rgb } = {},
): void {
  const size = style.size ?? 9;
  const indent = 5;
  const lines = wrapPdfText(
    text,
    CONTENT_WIDTH - indent,
    pdf.measure,
    "normal",
    size,
  );
  pdf.ensureSpace(line(size) * Math.min(2, lines.length));
  const color = style.color ?? INK;
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(size);
  pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
  pdf.doc.text("•", MARGIN_LEFT + 1, pdf.cursor, { baseline: "top" });
  for (const item of lines) {
    pdf.writeLine(item, MARGIN_LEFT + indent, { size, color });
  }
  pdf.moveTo(pdf.cursor + 1);
}

/** Label kecil di atas angka besar (statistik berderet). */
function statRow(
  pdf: PdfDocument,
  stats: Array<{ term: string; value: string; tone: Tone | null }>,
): void {
  const column = CONTENT_WIDTH / stats.length;
  pdf.ensureSpace(line(7) + line(10) + 2);
  const top = pdf.cursor;
  stats.forEach(({ term, value, tone }, index) => {
    const x = MARGIN_LEFT + column * index;
    pdf.doc.setFont(FONT, "normal");
    pdf.doc.setFontSize(7);
    pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
    pdf.doc.text(pdfSafeText(term), x, top, { baseline: "top" });
    const color = tone ? toneColor(tone) : INK;
    pdf.doc.setFont(FONT, "bold");
    pdf.doc.setFontSize(10);
    pdf.doc.setTextColor(color[0], color[1], color[2]);
    pdf.doc.text(pdfSafeText(value), x, top + line(7), { baseline: "top" });
  });
  pdf.moveTo(top + line(7) + line(10) + 2);
}

function note(pdf: PdfDocument, text: string, gapAfter = 2): void {
  pdf.paragraph(text, { size: 7.5, color: INK_MUTE, gapAfter });
}

// ---------------------------------------------------------------------------
// Bagian dokumen
// ---------------------------------------------------------------------------

function buildMasthead(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
  dateStr: string,
): void {
  const peserta = input.data.peserta;
  const initial = (peserta.nama.trim().charAt(0) || "?").toUpperCase();
  pdf.ensureSpace(50);
  const top = pdf.cursor;

  // Inisial dan nama SEBARIS: kotak di kiri, identitas di kanannya.
  pdf.doc.setFillColor(WASH[0], WASH[1], WASH[2]);
  pdf.doc.setDrawColor(LINE_STRONG[0], LINE_STRONG[1], LINE_STRONG[2]);
  pdf.doc.setLineWidth(0.2);
  pdf.doc.rect(MARGIN_LEFT, top, 14, 14, "FD");
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(13);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  pdf.doc.text(pdfSafeText(initial), MARGIN_LEFT + 7, top + 7, {
    align: "center",
    baseline: "middle",
  });

  const nameX = MARGIN_LEFT + 18;
  const nameWidth = CONTENT_WIDTH - 18;
  pdf.moveTo(top);
  pdf.paragraph("LAPORAN AUDIT AGENT", {
    x: nameX,
    width: nameWidth,
    font: "bold",
    size: 7,
    color: INK_FAINT,
  });
  pdf.paragraph(peserta.nama, {
    x: nameX,
    width: nameWidth,
    font: "bold",
    size: 17,
    color: INK,
    lineHeight: mm(17 * 1.2),
  });
  pdf.paragraph(scopes.header, {
    x: nameX,
    width: nameWidth,
    size: 9,
    color: INK_MUTE,
  });
  // Waktu pembuatan ditulis di identitas, bukan di blok penutup tersendiri:
  // blok penutup yang tidak muat bisa membuat halaman terakhir berisi itu saja.
  pdf.paragraph(`Dibuat ${dateStr} dari SIDAK`, {
    x: nameX,
    width: nameWidth,
    size: 7,
    color: INK_FAINT,
  });
  pdf.moveTo(Math.max(pdf.cursor, top + 14) + 4);

  const meta: Array<[string, string]> = [
    ["Tim", peserta.tim],
    ["Batch", peserta.batch_name],
    ["Jabatan", jabatanLabel(peserta.jabatan)],
    ["Masa kerja", computeTenure(peserta.bergabung_date)],
  ];
  const columnWidth = CONTENT_WIDTH / meta.length;
  const metaTop = pdf.cursor;
  meta.forEach(([term, value], index) => {
    const x = MARGIN_LEFT + columnWidth * index;
    pdf.doc.setFont(FONT, "normal");
    pdf.doc.setFontSize(7);
    pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
    pdf.doc.text(pdfSafeText(term), x, metaTop, { baseline: "top" });
    wrapPdfText(value, columnWidth - 2, pdf.measure, "bold", 9).forEach(
      (item, lineIndex) => {
        pdf.doc.setFont(FONT, "bold");
        pdf.doc.setFontSize(9);
        pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
        pdf.doc.text(item, x, metaTop + line(7) + lineIndex * line(9), {
          baseline: "top",
        });
      },
    );
  });
  pdf.moveTo(metaTop + line(7) + line(9) * 2);
  pdf.rule(INK, 1, 5);
}

function buildHighlightsSection(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
): void {
  pdf.heading("Kesimpulan Utama", undefined, 20);
  for (const item of buildHighlights(input)) bullet(pdf, item);
  pdf.rule(LINE, 2, 5);
}

function buildStanding(pdf: PdfDocument, input: AgentReportPdfInput): void {
  const quickview = input.context.quickview;
  if (!quickview) return;
  const rank = (
    metric: SidakAgentQuickviewResponse["combinedTeam"],
  ): { value: string; note: string } => {
    if (!metric) return { value: "—", note: "Peringkat belum tersedia" };
    if (metric.rank != null) {
      return {
        value: `#${formatNumber(metric.rank)} dari ${formatNumber(metric.total)}`,
        note: metric.scopeLabel,
      };
    }
    return {
      value: "—",
      note:
        finiteNumber(metric.total) > 0
          ? "Belum masuk peringkat pada cakupan ini"
          : "Belum ada agen pembanding",
    };
  };
  const combined = rank(quickview.combinedTeam);
  const leader = rank(quickview.leaderTeam);
  pdf.heading("Posisi Performa", undefined, 20, 10);
  pdf.table({
    columns: [
      { header: "Cakupan", weight: 1, minWidth: 32 },
      { header: "Peringkat", weight: 0.7, minWidth: 24, align: "right" },
      { header: "Keterangan", weight: 1.6, minWidth: 44 },
    ],
    rows: [
      ["Tim Gabungan", combined.value, combined.note],
      ["Tim Leader", leader.value, leader.note],
      [
        "Perkiraan 3 bulan",
        quickview.forecast?.label ?? "—",
        quickview.forecast?.supportingText ?? "Perkiraan belum tersedia",
      ],
    ],
  });
}

function buildActiveScore(pdf: PdfDocument, input: AgentReportPdfInput): void {
  const active = resolveActiveScore(
    input.monthlySummaries,
    resolveActiveMonth(input),
  );
  pdf.heading("Skor Bulan Terpilih", undefined, 30, 10);
  if (!active) {
    note(pdf, "Belum ada skor untuk tahun dan layanan ini.");
    return;
  }
  const { current, previous, delta } = active;
  const score = finiteNumber(current.finalScore, 0, 0, 100);
  pdf.ensureSpace(30);
  const top = pdf.cursor;
  pdf.doc.setFont(FONT, "normal");
  pdf.doc.setFontSize(8);
  pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
  pdf.doc.text(pdfSafeText(monthLabel(current.month, current.year)), MARGIN_LEFT, top, {
    baseline: "top",
  });
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(22);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  pdf.doc.text(formatNumber(score), MARGIN_LEFT, top + line(8), {
    baseline: "top",
  });
  const statusTop = top + line(8) + mm(22 * 1.1);
  const statusColor = toneColor(sidakScoreTone(score));
  pdf.doc.setFontSize(8);
  pdf.doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.doc.text(
    pdfSafeText(`${sidakScoreLabel(score)} (target ${QA_TARGET})`),
    MARGIN_LEFT,
    statusTop,
    { baseline: "top" },
  );
  pdf.moveTo(statusTop + line(8) + 3);
  statRow(pdf, [
    { term: "Sesi diaudit", value: formatNumber(current.sessionCount), tone: null },
    { term: "Temuan", value: formatNumber(current.findingsCount), tone: null },
    {
      term: previous
        ? `Dibanding ${monthLabel(previous.month, previous.year)}`
        : "Dibanding bulan sebelumnya",
      value: delta === null ? "—" : formatPointDelta(delta),
      tone: delta === null ? null : scoreDeltaTone(delta),
    },
  ]);
}

function buildMonthlyTable(pdf: PdfDocument, input: AgentReportPdfInput): void {
  if (input.monthlySummaries.length === 0) return;
  pdf.table({
    caption: "Rekap Skor Bulanan",
    columns: [
      { header: "Bulan", weight: 1.2, minWidth: 26 },
      { header: "Skor Final", weight: 0.8, minWidth: 18, align: "right" },
      { header: "Skor Non-Critical", weight: 1, minWidth: 26, align: "right" },
      { header: "Skor Critical", weight: 0.9, minWidth: 20, align: "right" },
      { header: "Sesi", weight: 0.5, minWidth: 10, align: "right" },
      { header: "Temuan", weight: 0.6, minWidth: 13, align: "right" },
      {
        header: "Status",
        weight: 1.2,
        minWidth: 30,
        tone: (rowIndex) =>
          finiteNumber(input.monthlySummaries[rowIndex]?.finalScore) < QA_TARGET
            ? "warn"
            : "ok",
      },
    ],
    rows: input.monthlySummaries.map((summary) => [
      monthLabel(summary.month, summary.year),
      formatNumber(summary.finalScore),
      formatNumber(summary.nonCriticalScore),
      formatNumber(summary.criticalScore),
      formatNumber(summary.sessionCount),
      formatNumber(summary.findingsCount),
      qaStatusLabel(summary.finalScore),
    ]),
  });
  note(
    pdf,
    "Sesi tanpa temuan dihitung pada kolom Sesi, tetapi tidak ditampilkan sebagai temuan.",
  );
}

function buildTicketsTable(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
): void {
  pdf.heading("Tiket Pengurang Skor Terbesar", scopes.tickets, 14, 10);
  if (input.topTickets.length === 0) {
    note(pdf, "Tidak ada tiket yang menurunkan skor pada bulan ini.");
    return;
  }
  pdf.table({
    columns: [
      { header: "#", weight: 0.25, minWidth: 7, align: "right" },
      { header: "No Tiket", weight: 1.1, minWidth: 30, emphasis: true },
      { header: "Parameter Terberat", weight: 1.7, minWidth: 42 },
      { header: "Pengurangan Skor", weight: 0.9, minWidth: 26, align: "right" },
      { header: "Jumlah Temuan", weight: 0.8, minWidth: 22, align: "right" },
    ],
    rows: input.topTickets.map((ticket, index) => [
      String(index + 1),
      ticket.no_tiket,
      ticket.heaviestParam,
      formatNumber(ticket.scoreDeduction, 1),
      formatNumber(ticket.findingCount),
    ]),
  });
}

function buildRootCauses(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
): void {
  pdf.heading("Akar Masalah", scopes.rootCauses, 14, 10);
  if (input.activeRootCauses.length === 0) {
    note(pdf, "Belum ada pola akar masalah yang menonjol.");
    return;
  }
  input.activeRootCauses.forEach((cause, index) => {
    const critical = finiteNumber(cause.criticalFindingsCount);
    pdf.ensureSpace(line(9.5) + line(7.5) + line(9) * 2);
    pdf.paragraph(`${index + 1}. ${cause.label}`, {
      font: "bold",
      size: 9.5,
      color: INK,
    });
    pdf.paragraph(
      [
        `${formatNumber(cause.findingsCount)} temuan`,
        `${formatNumber(cause.affectedTickets)} tiket`,
        critical > 0 ? `${formatNumber(critical)} critical` : "",
      ]
        .filter(Boolean)
        .join(" • "),
      { size: 7.5, color: INK_MUTE },
    );
    pdf.paragraph(cause.recommendation, { size: 9, gapAfter: 1 });
    const references = cause.ticketReferences ?? [];
    if (references.length > 0) {
      pdf.paragraph(
        "Tiket terkait: " +
          references
            .map(
              (reference) =>
                `${reference.no_tiket} (${reference.periodLabel}, ${formatNumber(reference.findingsCount)} temuan)`,
            )
            .join("; "),
        { size: 7.5, color: INK_MUTE, gapAfter: 1 },
      );
    }
    pdf.moveTo(pdf.cursor + 2);
  });
}

// ---------------------------------------------------------------------------
// Grafik
// ---------------------------------------------------------------------------

interface PdfChart {
  x: number;
  width: number;
  title: string;
  unit?: string;
  labels: string[];
  series: TrendSeries;
  axis: { min: number; max: number; step: number };
  target?: number;
  plotHeight: number;
}

function chartHeight(chart: PdfChart): number {
  return line(9) + (chart.unit ? line(6.5) : 0) + chart.plotHeight + line(6.5) + 2;
}

/**
 * Grafik garis satu seri di kolom `x`/`width`: judul, angka sumbu, garis target
 * putus-putus (skor), label periode yang tidak saling menimpa, dan nilai di
 * atas titik bila jaraknya cukup. Mengembalikan tepi bawahnya.
 */
function drawChart(pdf: PdfDocument, chart: PdfChart, top: number): number {
  const { labels, series, axis } = chart;
  const doc = pdf.doc;
  doc.setFont(FONT, "bold");
  doc.setFontSize(9);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(pdfSafeText(chart.title), chart.x, top, { baseline: "top" });
  let cursor = top + line(9);
  if (chart.unit) {
    doc.setFontSize(6.5);
    doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
    doc.text(pdfSafeText(chart.unit), chart.x, cursor, { baseline: "top" });
    cursor += line(6.5);
  }

  const axisWidth = 8;
  const plotLeft = chart.x + axisWidth;
  const plotWidth = chart.width - axisWidth - 3;
  const plotTop = cursor + 1.5;
  const span = Math.max(1, axis.max - axis.min);
  const yFor = (value: number) =>
    plotTop +
    chart.plotHeight -
    ((Math.min(axis.max, Math.max(axis.min, value)) - axis.min) / span) *
      chart.plotHeight;
  // Titik ujung diberi jarak dari tepi plot supaya label nilainya tidak
  // menabrak angka sumbu Y.
  const inset = Math.min(4, plotWidth / 10);
  const xFor = (index: number) =>
    labels.length === 1
      ? plotLeft + plotWidth / 2
      : plotLeft + inset + (index / (labels.length - 1)) * (plotWidth - inset * 2);

  for (let value = axis.min; value <= axis.max + 0.0001; value += axis.step) {
    const y = yFor(value);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.15);
    doc.line(plotLeft, y, plotLeft + plotWidth, y);
    doc.setFont(FONT, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
    doc.text(formatNumber(value), plotLeft - 1.5, y, {
      align: "right",
      baseline: "middle",
    });
  }

  if (chart.target !== undefined) {
    const y = yFor(chart.target);
    doc.setDrawColor(TONE_WARN[0], TONE_WARN[1], TONE_WARN[2]);
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([1.5, 1], 0);
    doc.line(plotLeft, y, plotLeft + plotWidth, y);
    // Keterangan target sejajar judul, di luar area plot: tidak pernah
    // menimpa titik data yang dekat dengan target.
    const legendRight = chart.x + chart.width;
    doc.line(legendRight - 17, top + 1.6, legendRight - 12, top + 1.6);
    doc.setLineDashPattern([], 0);
    doc.setFont(FONT, "bold");
    doc.setFontSize(6);
    doc.setTextColor(TONE_WARN[0], TONE_WARN[1], TONE_WARN[2]);
    doc.text(`Target ${chart.target}`, legendRight, top + 0.3, {
      align: "right",
      baseline: "top",
    });
  }

  // Label periode: hanya yang tidak akan saling menimpa; ujung selalu dicetak.
  const widths = labels.map((item) =>
    pdf.measure(pdfSafeText(item), "normal", 6.5),
  );
  const spacing =
    labels.length > 1 ? (plotWidth - inset * 2) / (labels.length - 1) : plotWidth;
  const stride = Math.max(
    1,
    Math.ceil((Math.max(0, ...widths) + 2) / Math.max(spacing, 0.01)),
  );
  const lastIndex = labels.length - 1;
  labels.forEach((item, index) => {
    const isEdge = index === 0 || index === lastIndex;
    if (!isEdge && index % stride !== 0) return;
    if (!isEdge && lastIndex - index < stride * 0.7) return;
    // Ujung kiri/kanan rata ke tepi plot supaya tidak keluar dari kolomnya.
    const align =
      labels.length === 1
        ? "center"
        : index === 0 && inset < 3
          ? "left"
          : index === lastIndex && inset < 3
            ? "right"
            : "center";
    doc.setFont(FONT, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
    doc.text(pdfSafeText(item), xFor(index), plotTop + chart.plotHeight + 1.5, {
      align,
      baseline: "top",
    });
  });

  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.5);
  for (let position = 1; position < labels.length; position += 1) {
    const previous = series.data[position - 1];
    const value = series.data[position];
    if (previous == null || value == null) continue;
    doc.line(xFor(position - 1), yFor(previous), xFor(position), yFor(value));
  }
  const showValues = spacing >= 7;
  series.data.forEach((value, position) => {
    if (value == null) return;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.25);
    doc.circle(xFor(position), yFor(value), 0.8, "FD");
    if (!showValues) return;
    const nearTop = yFor(value) <= plotTop + 2.5;
    doc.setFont(FONT, "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(
      formatNumber(value),
      xFor(position),
      yFor(value) + (nearTop ? 1.3 : -1.3),
      { align: "center", baseline: nearTop ? "top" : "bottom" },
    );
  });
  return plotTop + chart.plotHeight + line(6.5) + 2;
}

function buildScoreTrendSection(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
): void {
  const { labels, charts } = scoreTrend(input);
  pdf.heading("Perkembangan Skor", undefined, 50);
  if (labels.length === 0) {
    note(pdf, SCORE_EMPTY_NOTE);
    return;
  }
  note(
    pdf,
    `Satu grafik per jenis skor. Garis putus-putus menandai target ${QA_TARGET}; angka lengkapnya ada di tabel Rekap Skor Bulanan.`,
  );
  const gap = 6;
  const width = (CONTENT_WIDTH - gap * (charts.length - 1)) / charts.length;
  const specs: PdfChart[] = charts.map((chart, index) => ({
    x: MARGIN_LEFT + index * (width + gap),
    width,
    title: chart.title,
    labels,
    series: chart.series,
    axis: scoreAxis(chart.series.data),
    target: QA_TARGET,
    plotHeight: 30,
  }));
  pdf.ensureSpace(Math.max(...specs.map(chartHeight)));
  const top = pdf.cursor;
  const bottoms = specs.map((spec) => drawChart(pdf, spec, top));
  pdf.moveTo(Math.max(...bottoms) + 4);
}

function buildFindingsTrendSection(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
): void {
  const { labels, total, parameters } = findingTrend(input.data);
  pdf.heading("Tren Temuan", undefined, 40);
  if (labels.length === 0 || (total === null && parameters.length === 0)) {
    note(pdf, TREND_EMPTY_NOTE);
  } else {
    if (total) {
      const spec: PdfChart = {
        x: MARGIN_LEFT,
        width: CONTENT_WIDTH,
        title: "Total Temuan per Bulan",
        unit: TREND_UNIT_LABEL,
        labels,
        series: total,
        axis: countAxis(total.data),
        plotHeight: 32,
      };
      pdf.ensureSpace(chartHeight(spec));
      pdf.moveTo(drawChart(pdf, spec, pdf.cursor) + 3);
    }
    const sum = (series: TrendSeries) =>
      series.data.reduce<number>((acc, value) => acc + (value ?? 0), 0);
    const cell = (value: number | null) =>
      value === null ? "—" : formatNumber(value);
    const rows = [
      ...(total ? [total] : []),
      ...parameters,
    ].map((series) => [
      series.label,
      ...series.data.map(cell),
      formatNumber(sum(series)),
    ]);
    pdf.table({
      caption: "Temuan per Parameter",
      columns: [
        { header: "Parameter", weight: 3, minWidth: 40 },
        ...labels.map((label) => ({
          header: label,
          weight: 1,
          minWidth: 9,
          align: "right" as const,
        })),
        { header: "Total", weight: 1, minWidth: 11, align: "right" as const },
      ],
      rows,
      totalRows: total ? [0] : [],
    });
  }
  buildComparisonTable(pdf, input, scopes);
}

function buildComparisonTable(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  scopes: ReportScopes,
): void {
  const table = input.data.comparisonTable;
  if (!table || table.rows.length === 0) return;
  pdf.heading("Perbandingan dengan Tim dan Layanan", scopes.comparison, 20, 10);
  const deltas = table.rows.map((row) => ({
    team: comparisonDelta(row.agentCount, row.teamAverage),
    service: comparisonDelta(row.agentCount, row.serviceAverage),
  }));
  pdf.table({
    columns: [
      { header: "Parameter", weight: 1.8, minWidth: 44 },
      { header: "Agen ini", weight: 0.6, minWidth: 14, align: "right" },
      { header: "Rata-rata tim", weight: 0.8, minWidth: 20, align: "right" },
      { header: "Rata-rata layanan", weight: 0.9, minWidth: 25, align: "right" },
      {
        header: "Selisih vs tim",
        weight: 0.8,
        minWidth: 21,
        align: "right",
        tone: (rowIndex) =>
          findingDeltaTone(
            table.rows[rowIndex]?.agentCount ?? 0,
            deltas[rowIndex]?.team ?? null,
          ),
      },
      {
        header: "Selisih vs layanan",
        weight: 0.9,
        minWidth: 26,
        align: "right",
        tone: (rowIndex) =>
          findingDeltaTone(
            table.rows[rowIndex]?.agentCount ?? 0,
            deltas[rowIndex]?.service ?? null,
          ),
      },
    ],
    rows: table.rows.map((row, index) => [
      row.label,
      formatNumber(row.agentCount),
      formatNumber(row.teamAverage, 1),
      formatNumber(row.serviceAverage, 1),
      formatPercentDelta(deltas[index].team),
      formatPercentDelta(deltas[index].service),
    ]),
    totalRows: table.rows
      .map((row, index) => (row.key === "total" ? index : -1))
      .filter((index) => index >= 0),
  });
  note(
    pdf,
    "Hijau = temuan lebih sedikit dari rata-rata (lebih baik). Merah = lebih banyak.",
  );
}

// ---------------------------------------------------------------------------
// Detail temuan
// ---------------------------------------------------------------------------

/**
 * Pita satu parameter: nama parameter (tebal) di kiri, ringkasan jumlah dan
 * kategori di kanan. Pita selalu membawa minimal dua baris isi bersamanya.
 */
function drawGroupBand(pdf: PdfDocument, title: string, facts: string): void {
  const paddingX = 3;
  const paddingY = 1.8;
  const size = 10;
  const factsWidth = pdf.measure(pdfSafeText(facts), "normal", 7.5) + 2;
  const titleLines = wrapPdfText(
    title,
    CONTENT_WIDTH - paddingX * 2 - factsWidth - 4,
    pdf.measure,
    "bold",
    size,
  );
  const bandHeight = paddingY * 2 + line(size) * titleLines.length;
  pdf.ensureSpace(bandHeight + line(9) * 2 + 2);
  const top = pdf.cursor;
  pdf.doc.setFillColor(WASH[0], WASH[1], WASH[2]);
  pdf.doc.setDrawColor(LINE_STRONG[0], LINE_STRONG[1], LINE_STRONG[2]);
  pdf.doc.setLineWidth(0.2);
  pdf.doc.rect(MARGIN_LEFT, top, CONTENT_WIDTH, bandHeight, "FD");
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(size);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  titleLines.forEach((item, index) => {
    pdf.doc.text(item, MARGIN_LEFT + paddingX, top + paddingY + index * line(size), {
      baseline: "top",
    });
  });
  pdf.doc.setFont(FONT, "normal");
  pdf.doc.setFontSize(7.5);
  pdf.doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
  pdf.doc.text(
    pdfSafeText(facts),
    PAGE_WIDTH - MARGIN_RIGHT - paddingX,
    top + paddingY + 0.6,
    { align: "right", baseline: "top" },
  );
  pdf.moveTo(top + bandHeight + 2);
}

function buildFindings(pdf: PdfDocument, input: AgentReportPdfInput): void {
  pdf.heading("Detail Temuan", undefined, 30);
  const groups = groupFindingsByParameter(input.temuanDisplayItems);
  if (groups.length === 0) {
    note(pdf, "Tidak ada temuan pada tahun dan layanan ini.");
    return;
  }
  note(
    pdf,
    `${formatNumber(input.temuanDisplayItems.length)} temuan di ${formatNumber(groups.length)} parameter, paling sering lebih dulu. Temuan dengan catatan yang sama digabung dan daftar tiketnya ditulis di bawahnya.`,
    3,
  );
  for (const group of groups) {
    drawGroupBand(
      pdf,
      group.parameter,
      [
        `${formatNumber(group.count)} temuan`,
        group.category,
        group.criticalCount > 0 && group.category !== "Critical"
          ? `${formatNumber(group.criticalCount)} critical`
          : "",
      ]
        .filter(Boolean)
        .join(" • "),
    );
    group.entries.forEach((entry, index) => {
      if (index > 0) pdf.rule(LINE, 0.5, 2);
      pdf.paragraph(`Ketidaksesuaian: ${entry.ketidaksesuaian}`, {
        size: 9,
        indent: 3,
        gapAfter: 0.5,
      });
      // "Sebaiknya" + daftar tiketnya adalah satu unit: daftar tiket tidak
      // boleh jatuh sendirian ke halaman berikutnya tanpa konteksnya.
      const fixLines = wrapPdfText(
        `Sebaiknya: ${entry.sebaiknya}`,
        CONTENT_WIDTH - 3,
        pdf.measure,
        "normal",
        9,
      ).length;
      pdf.ensureSpace(
        Math.min(
          fixLines * line(9) + 1 + entry.occurrences.length * line(8),
          CONTENT_BOTTOM - MARGIN_TOP,
        ),
      );
      pdf.paragraph(`Sebaiknya: ${entry.sebaiknya}`, {
        size: 9,
        color: INK,
        indent: 3,
        gapAfter: 1,
      });
      for (const occurrence of entry.occurrences) {
        pdf.paragraph(
          `${occurrence.ticket} — ${monthLabel(occurrence.month, occurrence.year)} — Nilai ${nilaiText(occurrence.nilai)}`,
          { size: 8, color: INK_MUTE, indent: 6 },
        );
      }
      pdf.moveTo(pdf.cursor + 1.5);
    });
    pdf.moveTo(pdf.cursor + 2);
  }
}

// ---------------------------------------------------------------------------
// Pintu masuk
// ---------------------------------------------------------------------------

/**
 * Bangun PDF A4 portrait dari snapshot yang sama dengan format lain. Kegagalan
 * impor maupun pembuatan dilempar apa adanya supaya pemanggil menampilkan
 * umpan balik error dan tidak pernah mengunduh file kosong.
 */
export async function generateAgentReportPdf(
  input: AgentReportPdfInput,
): Promise<ArrayBuffer> {
  if (!input.data?.peserta) {
    throw new Error("data profil agen tidak tersedia untuk laporan PDF");
  }
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const peserta = input.data.peserta;
  const scopes = reportScopes(input);
  const service = serviceLabel(input.selectedService);
  const year = yearText(input.selectedYear);
  const activeMonth = resolveActiveMonth(input);
  const dateStr = new Date().toLocaleString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  doc.setProperties({
    title: `Laporan Audit Agent - ${pdfSafeText(peserta.nama)}`,
    subject: `Tahun ${year} - Layanan ${service} - Bulan ${activeMonth ? monthLabel(activeMonth, year) : "belum ada"}`,
    author: "SIDAK",
    keywords: `audit, sidak, ${year}, ${service}`,
    creator: "Trainers SuperApp - Laporan Audit SIDAK",
  });

  const pdf = new PdfDocument(
    doc,
    {
      left: "Laporan Audit SIDAK",
      right: `${pdfSafeText(peserta.nama)} • Layanan ${service} • ${year}`,
    },
    createMeasurer(doc),
  );
  pdf.begin();

  buildMasthead(pdf, input, scopes, dateStr);
  buildHighlightsSection(pdf, input);

  pdf.heading("Ringkasan", undefined, 40);
  buildStanding(pdf, input);
  buildActiveScore(pdf, input);
  buildMonthlyTable(pdf, input);
  buildTicketsTable(pdf, input, scopes);
  buildRootCauses(pdf, input, scopes);

  buildScoreTrendSection(pdf, input);
  buildFindingsTrendSection(pdf, input, scopes);
  buildFindings(pdf, input);
  pdf.finalize();

  return doc.output("arraybuffer") as ArrayBuffer;
}
