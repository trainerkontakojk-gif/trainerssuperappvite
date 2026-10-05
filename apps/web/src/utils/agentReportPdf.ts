/**
 * Laporan audit agen (SIDAK) - generator PDF A4 dengan teks yang bisa dicari.
 *
 * Ini unduhan PDF LANGSUNG, bukan dialog cetak peramban: `jsPDF` (dependency web
 * yang sudah ada) menulis dokumen biner dari snapshot yang sama dengan HTML/CSV,
 * lalu hook mengunduhnya sebagai Blob `application/pdf`.
 *
 * Aturan yang dijaga di sini:
 *  - **Teks asli, bukan gambar.** Tidak ada `html2canvas`/raster: seluruh isi
 *    laporan ditulis sebagai operator teks jsPDF, jadi bisa diseleksi, dicari,
 *    dan disalin di pembaca PDF mana pun. Grafik tren hanya garis vektor, dan
 *    angkanya tetap hadir lengkap di tabel "Data tren".
 *  - **A4 portrait, satu sumber isi.** Hirarki dokumen sama dengan varian HTML
 *    (identitas -> ringkasan eksekutif -> bulanan -> tiket -> akar masalah ->
 *    skor -> tren temuan + benchmark -> seluruh temuan -> colophon), dan tiap
 *    seksi memakai helper `*ScopeLabel` yang sama dengan CSV/MD/HTML sehingga
 *    "cakupan seksi" hanya punya satu definisi.
 *  - **Paginasi jujur.** Judul seksi tidak pernah menggantung di dasar halaman,
 *    header tabel berulang saat tabel terbelah, satu baris tabel tidak pernah
 *    keluar dari area cetak, dan setiap halaman memakai footer
 *    "Halaman X dari N". Teks panjang mengalir per baris, sehingga panjang
 *    tidak pernah berarti terpotong.
 *  - **Teks aman untuk font standar, tanpa kehilangan bukti.** Font standar PDF
 *    (Helvetica) hanya bisa menencetak WinAnsi. Semua teks dari data pengguna
 *    dilewatkan `pdfSafeText()`: handful simbol umum dipetakan ke ejaan
 *    Indonesia, dan setiap titik kode yang tidak punya glyph — termasuk
 *    karakter kontrol — dicetak sebagai penanda `[U+XXXX]`: terlihat, bisa
 *    dicari, dan bisa dibalik persis ke karakter aslinya. Tanpa sanitasi jsPDF
 *    menulis byte rusak yang membuat glyph tidak bisa dipetakan ke Unicode;
 *    menukar karakter itu dengan spasi lebih buruk lagi, karena bukti pengguna
 *    hilang tanpa jejak.
 *  - **Hierarki yang bisa dipindai.** Nomor tiket adalah identifier laporan,
 *    jadi ia dicetak paling besar dan paling tebal di dalam blok temuan
 *    (pita berlabel "NO TIKET"), sementara nama parameter dan nilai tetap
 *    lengkap tapi tipografinya proporsional. Skor periode aktif tetap angka
 *    utama blok ringkasan tanpa mengambil alih halaman.
 *  - **Dua keluarga tren, dua seksi.** "Perkembangan Skor" memakai skor yang
 *    dihitung backend (`monthlySummaries`: final, non-critical, critical),
 *    masing-masing satu grafik + satu tabel. "Tren Temuan" memakai
 *    `personalTrend`, yang berisi JUMLAH TEMUAN per periode — bukan skor — dan
 *    hanya memuat grafik temuan, bukan satu pun garis skor.
 *  - **Satu metrik satu grafik.** Tiga metrik skor tidak pernah digabung dalam
 *    satu trendline; di seksi temuan, `Total Temuan` (agregat) dan rincian per
 *    parameter (komponen) juga terpisah: masing-masing punya grafik, judul,
 *    satuan sumbu, legenda, dan tabel data lengkapnya sendiri. Angka yang
 *    digambar persis sama dengan sumbernya, jadi tidak ada data turunan yang
 *    dikarang.
 *  - **Tanpa aset remote.** Tidak ada font eksternal, gambar, atau permintaan
 *    jaringan; avatar berupa inisial seperti di HTML.
 *  - **Tanpa angka karangan.** Bagian yang tidak punya isi dinyatakan eksplisit
 *    ("Tidak ada ... pada cakupan ini"), bukan diisi nol atau placeholder.
 *    Sesi tanpa temuan (`is_phantom_padding`) tidak pernah ikut karena snapshot
 *    tidak pernah meneruskannya, dan colophon menyatakan hal itu terbuka.
 */

import type { jsPDF as JsPdfDocument } from "jspdf";
import type {
  AgentDetailData,
  AgentPeriodSummary,
  RootCauseResult,
  SidakAgentQuickviewResponse,
} from "@trainers/types";
import {
  MONTHS_FULL,
  SCORE_EMPTY_NOTE,
  SCORE_UNIT_LABEL,
  TREND_PARAMETER_TABLE_CAPTION,
  TREND_TOTAL_TABLE_CAPTION,
  TREND_UNIT_LABEL,
  buildScoreTrend,
  computeTenure,
  groupTrendSeries,
  monthScopeLabel,
  nilaiLabel,
  trendScopeLabel,
  yearServiceScopeLabel,
  yearToDateScopeLabel,
} from "./agentReportHtml";
import type {
  AgentHtmlExportContext,
  TicketScoreExport,
  TemuanDisplayItemExport,
  TrendSeries,
} from "./agentReportHtml";
import { comparisonScopeLabel } from "./exportAgentReport";
import { sidakScoreLabel, sidakScoreTone } from "./sidakScoreStatus";

/**
 * Snapshot laporan yang dipakai PDF. Sengaja identik dengan snapshot HTML
 * (tanpa `variant`, yang hanya relevan untuk perilaku HTML): PDF, HTML, CSV, dan
 * MD harus selalu melihat data yang sama dari state UI yang sama.
 */
export interface AgentReportPdfInput {
  data: AgentDetailData;
  monthlySummaries: AgentPeriodSummary[];
  temuanDisplayItems: TemuanDisplayItemExport[];
  topTickets: TicketScoreExport[];
  activeRootCauses: RootCauseResult[];
  selectedYear: number;
  selectedService: string;
  context: AgentHtmlExportContext;
}

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
type Tone = "ok" | "warn" | "bad" | "flat";

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

/** Ambang QA yang sama dengan `MonthRail`/`AgentAuditDossier` di aplikasi. */
const QA_TARGET = 95;

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
  let text = String(value ?? "");
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
  heading(title: string, scope: string | undefined, keepWith: number): void {
    const scopeLines = scope
      ? wrapPdfText(scope, CONTENT_WIDTH, this.measure, "normal", 7.5)
      : [];
    this.ensureSpace(
      line(11) + scopeLines.length * line(7.5) + 4 + Math.max(0, keepWith),
    );
    this.paragraph(title, { font: "bold", size: 11, color: INK });
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
      let x = MARGIN_LEFT;
      spec.columns.forEach((column, index) => {
        this.write(column.header, x + paddingX, column.align ?? "left");
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
// Nilai & pelabelan
// ---------------------------------------------------------------------------

function safeNumber(
  value: unknown,
  fallback = 0,
  min = -Infinity,
  max = Infinity,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function numberText(value: unknown, fallback = 0): string {
  return String(safeNumber(value, fallback));
}

function yearText(value: unknown, fallback = 0): string {
  return String(Math.trunc(safeNumber(value, fallback)));
}

/** Ambang status sama dengan halaman detail agent (`sidakScoreStatus`). */
function scoreTone(score: number): Tone {
  return sidakScoreTone(safeNumber(score));
}

function scoreLabel(score: number): string {
  return sidakScoreLabel(safeNumber(score));
}

function deltaTone(value: number | null): Tone | null {
  if (value === null) return null;
  if (value > 0) return "ok";
  if (value < 0) return "bad";
  return "flat";
}

function formatNilai(nilai: number): string {
  return `${nilai} (${nilaiLabel(nilai)})`;
}

function monthYear(month: number | null, year: number): string {
  const index = Math.trunc(safeNumber(month, 0, 0, 12));
  if (index < 1) return "belum ada";
  return `${MONTHS_FULL[index - 1]} ${yearText(year)}`;
}

/** Langkah sumbu "bulat" supaya label sumbu tidak memotong tinggi plot. */
function niceStep(maxValue: number): number {
  const safe = Math.max(1, maxValue);
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (Math.ceil(safe / step) <= 5) return step;
  }
  return Math.ceil(safe / 5 / 1000) * 1000;
}

// ---------------------------------------------------------------------------
// Bagian dokumen
// ---------------------------------------------------------------------------

function buildMasthead(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  masaKerja: string,
  serviceLabel: string,
): void {
  const peserta = input.data.peserta;
  const initial = (peserta.nama.trim().charAt(0) || "?").toUpperCase();
  // Identitas + ringkasan executive kerasikan: tidak ada halaman sampul
  // terpisah, blok pertama halaman 1 langsung berisi isi laporan.
  pdf.ensureSpace(58);

  pdf.doc.setFillColor(WASH[0], WASH[1], WASH[2]);
  pdf.doc.setDrawColor(LINE_STRONG[0], LINE_STRONG[1], LINE_STRONG[2]);
  pdf.doc.setLineWidth(0.2);
  pdf.doc.rect(MARGIN_LEFT, pdf.cursor, 13, 13, "FD");
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(13);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  pdf.doc.text(pdfSafeText(initial), MARGIN_LEFT + 6.5, pdf.cursor + 6.5, {
    align: "center",
    baseline: "middle",
  });
  pdf.moveTo(pdf.cursor + 17);

  const nameX = MARGIN_LEFT + 17;
  const nameWidth = CONTENT_WIDTH - 17;
  pdf.paragraph(peserta.nama, {
    x: nameX,
    width: nameWidth,
    font: "bold",
    size: 17,
    color: INK,
    lineHeight: mm(17 * 1.2),
  });
  pdf.paragraph("Laporan Audit Agent", {
    x: nameX,
    width: nameWidth,
    size: 9,
    color: INK_MUTE,
  });
  pdf.paragraph(
    `Tahun ${yearText(input.selectedYear)} \u2022 Layanan ${serviceLabel}`,
    { x: nameX, width: nameWidth, size: 8.5, color: INK_MUTE, gapAfter: 3 },
  );

  const meta: Array<[string, string]> = [
    ["Tim", peserta.tim],
    ["Batch", peserta.batch_name],
    ["Jabatan", peserta.jabatan || "Agent"],
    ["Masa kerja", masaKerja],
  ];
  const columnWidth = CONTENT_WIDTH / meta.length;
  const metaTop = pdf.cursor;
  meta.forEach(([term, value], index) => {
    const x = MARGIN_LEFT + columnWidth * index;
    pdf.doc.setFont(FONT, "normal");
    pdf.doc.setFontSize(7);
    pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
    pdf.doc.text(pdfSafeText(term), x, metaTop, { baseline: "top" });
    const valueLines = wrapPdfText(
      value,
      columnWidth - 2,
      pdf.measure,
      "bold",
      8.5,
    );
    valueLines.forEach((item, lineIndex) => {
      pdf.doc.setFont(FONT, "bold");
      pdf.doc.setFontSize(8.5);
      pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
      pdf.doc.text(item, x, metaTop + line(7) + lineIndex * line(8.5), {
        baseline: "top",
      });
    });
  });
  pdf.moveTo(metaTop + line(7) + line(8.5) * 2);
  pdf.rule(INK, 2, 5);
}

function buildActiveScore(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  activeMonth: number | null,
): void {
  const summaries = input.monthlySummaries;
  if (summaries.length === 0) {
    pdf.paragraph("Ringkasan skor belum tersedia untuk cakupan ini.", {
      color: INK_MUTE,
    });
    return;
  }
  const latest =
    (activeMonth
      ? summaries.find((summary) => summary.month === activeMonth)
      : null) ?? summaries[summaries.length - 1];
  const index = summaries.findIndex((summary) => summary.id === latest.id);
  const previous = index > 0 ? summaries[index - 1] : null;
  const delta = previous ? latest.finalScore - previous.finalScore : null;
  const safeScore = safeNumber(latest.finalScore, 0, 0, 100);
  const monthIndex = Math.trunc(safeNumber(latest.month, 1, 1, 12));
  const periodLabel = `${MONTHS_FULL[monthIndex - 1]?.slice(0, 3) ?? ""} ${numberText(latest.year)}`;

  pdf.paragraph("Skor Periode Aktif", { font: "bold", size: 9, color: INK });
  pdf.paragraph(
    monthScopeLabel(input.selectedService, input.selectedYear, activeMonth),
    { size: 7.5, color: INK_FAINT, gapAfter: 2 },
  );
  pdf.ensureSpace(46);

  const top = pdf.cursor;
  pdf.doc.setFont(FONT, "normal");
  pdf.doc.setFontSize(7.5);
  pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
  pdf.doc.text(pdfSafeText(periodLabel), MARGIN_LEFT, top, { baseline: "top" });
  // Skor tetap jadi angka utama blok ini, tapi tidak lagi mendominasi seluruh
  // dokumen: nama agen (17pt) dan nomor tiket (11.5pt) harus tetap bisa dibaca
  // tanpa diambil alih oleh angka.
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(19);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  pdf.doc.text(`${safeScore.toFixed(1)}%`, MARGIN_LEFT, top + line(8), {
    baseline: "top",
  });
  const scoreBottom = top + line(8) + mm(19 * 1.05);
  pdf.doc.setFontSize(8);
  const statusColor = toneColor(scoreTone(latest.finalScore));
  pdf.doc.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.doc.text(
    pdfSafeText(scoreLabel(latest.finalScore)),
    MARGIN_LEFT,
    scoreBottom,
    {
      baseline: "top",
    },
  );

  // Meter tipis: angka tetap angka, meter hanya penanda posisi terhadap 100.
  const meterY = scoreBottom + line(8) + 1.5;
  pdf.doc.setFillColor(WASH[0], WASH[1], WASH[2]);
  pdf.doc.rect(MARGIN_LEFT, meterY, CONTENT_WIDTH, 2, "F");
  pdf.doc.setFillColor(INK[0], INK[1], INK[2]);
  pdf.doc.rect(MARGIN_LEFT, meterY, (CONTENT_WIDTH * safeScore) / 100, 2, "F");
  pdf.moveTo(meterY + 6);

  const stats: Array<[string, string, Tone | null]> = [
    ["Sesi", numberText(latest.sessionCount), null],
    ["Temuan", numberText(latest.findingsCount), null],
    [
      "Selisih periode sebelumnya",
      delta === null
        ? "\u2014"
        : `${delta > 0 ? "+" : ""}${safeNumber(delta).toFixed(1)}%`,
      delta === null ? null : deltaTone(delta),
    ],
  ];
  const statColumn = CONTENT_WIDTH / stats.length;
  const statTop = pdf.cursor;
  stats.forEach(([term, value, tone], index) => {
    const x = MARGIN_LEFT + statColumn * index;
    pdf.doc.setFont(FONT, "normal");
    pdf.doc.setFontSize(7);
    pdf.doc.setTextColor(INK_FAINT[0], INK_FAINT[1], INK_FAINT[2]);
    pdf.doc.text(pdfSafeText(term), x, statTop, { baseline: "top" });
    const color = tone ? toneColor(tone) : INK;
    pdf.doc.setFont(FONT, "bold");
    pdf.doc.setFontSize(9.5);
    pdf.doc.setTextColor(color[0], color[1], color[2]);
    pdf.doc.text(pdfSafeText(value), x, statTop + line(7), { baseline: "top" });
  });
  pdf.moveTo(statTop + line(7) + line(9.5) + 1);
}

function buildStanding(pdf: PdfDocument, input: AgentReportPdfInput): void {
  const quickview = input.context.quickview;
  if (!quickview) return;
  const rank = (
    metric: SidakAgentQuickviewResponse["combinedTeam"],
  ): { value: string; note: string } => {
    if (!metric) return { value: "\u2014", note: "Peringkat belum tersedia" };
    if (metric.rank != null) {
      return {
        value: `#${numberText(metric.rank)} dari ${numberText(metric.total)}`,
        note: metric.scopeLabel,
      };
    }
    return {
      value: "\u2014",
      note:
        safeNumber(metric.total) > 0
          ? "Belum masuk peringkat pada cakupan ini"
          : "Belum ada agen pembanding",
    };
  };
  const combined = rank(quickview.combinedTeam);
  const leader = rank(quickview.leaderTeam);
  pdf.paragraph("Posisi Performa", { font: "bold", size: 9, color: INK });
  pdf.paragraph(
    `Tahun ${yearText(input.selectedYear)} \u2022 Layanan ${input.selectedService.toUpperCase() || "\u2014"}`,
    { size: 7.5, color: INK_FAINT, gapAfter: 2 },
  );
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
        "Forecast 3 bulan",
        quickview.forecast?.label ?? "\u2014",
        quickview.forecast?.supportingText ?? "Forecast belum tersedia",
      ],
    ],
  });
}

function buildMonthlyTable(pdf: PdfDocument, input: AgentReportPdfInput): void {
  pdf.paragraph(
    yearServiceScopeLabel(input.selectedService, input.selectedYear),
    { size: 7.5, color: INK_FAINT },
  );
  if (input.monthlySummaries.length === 0) {
    pdf.paragraph("Ringkasan bulanan belum tersedia untuk cakupan ini.", {
      color: INK_MUTE,
    });
    return;
  }
  pdf.table({
    caption: "Ringkasan Skor Bulanan",
    columns: [
      { header: "Bulan", weight: 1.1, minWidth: 18 },
      { header: "Skor Final", weight: 0.9, minWidth: 17, align: "right" },
      { header: "NC Score", weight: 0.9, minWidth: 17, align: "right" },
      { header: "CR Score", weight: 0.9, minWidth: 17, align: "right" },
      { header: "Sesi", weight: 0.5, minWidth: 10, align: "right" },
      { header: "Temuan", weight: 0.6, minWidth: 12, align: "right" },
      {
        header: "Status QA",
        weight: 1,
        minWidth: 22,
        tone: (rowIndex) =>
          safeNumber(input.monthlySummaries[rowIndex]?.finalScore) < QA_TARGET
            ? "warn"
            : "ok",
      },
    ],
    rows: input.monthlySummaries.map((summary) => [
      summary.label,
      numberText(summary.finalScore),
      numberText(summary.nonCriticalScore),
      numberText(summary.criticalScore),
      numberText(summary.sessionCount),
      numberText(summary.findingsCount),
      safeNumber(summary.finalScore) < QA_TARGET
        ? `Di bawah target ${QA_TARGET}%`
        : `Sesuai target ${QA_TARGET}%`,
    ]),
  });
}

function buildTicketsTable(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  activeMonth: number | null,
): void {
  pdf.paragraph(
    monthScopeLabel(input.selectedService, input.selectedYear, activeMonth),
    { size: 7.5, color: INK_FAINT },
  );
  if (input.topTickets.length === 0) {
    pdf.paragraph("Tidak ada tiket yang menurunkan skor pada cakupan ini.", {
      color: INK_MUTE,
    });
    return;
  }
  pdf.table({
    caption: "Tiket Pengurang Skor Terbesar",
    columns: [
      { header: "#", weight: 0.25, minWidth: 7, align: "right" },
      { header: "No Tiket", weight: 1.1, minWidth: 28, emphasis: true },
      { header: "Parameter Terberat", weight: 1.7, minWidth: 42 },
      { header: "Score Deduction", weight: 0.9, minWidth: 24, align: "right" },
      { header: "Jumlah Temuan", weight: 0.8, minWidth: 22, align: "right" },
    ],
    rows: input.topTickets.map((ticket, index) => [
      String(index + 1),
      ticket.no_tiket,
      ticket.heaviestParam,
      safeNumber(ticket.scoreDeduction).toFixed(1),
      numberText(ticket.findingCount),
    ]),
  });
}

function buildRootCauses(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  activeMonth: number | null,
): void {
  pdf.paragraph(
    yearToDateScopeLabel(
      input.selectedService,
      input.selectedYear,
      activeMonth,
    ),
    { size: 7.5, color: INK_FAINT },
  );
  if (input.activeRootCauses.length === 0) {
    pdf.paragraph(
      "Belum ditemukan pola akar masalah yang dominan pada cakupan ini.",
      { color: INK_MUTE },
    );
    return;
  }
  input.activeRootCauses.forEach((cause, index) => {
    const critical = safeNumber(cause.criticalFindingsCount);
    const facts = [
      `${numberText(cause.findingsCount)} temuan`,
      `${numberText(cause.affectedTickets)} tiket`,
      critical > 0 ? `${numberText(critical)} critical` : "",
    ]
      .filter(Boolean)
      .join(" \u2022 ");
    pdf.paragraph(
      `${index + 1}. ${cause.label} (prioritas ${numberText(cause.priority)})`,
      { font: "bold", size: 9, color: INK },
    );
    pdf.paragraph(facts, { size: 7.5, color: INK_MUTE });
    if (cause.matchedKeywords?.[0]) {
      pdf.paragraph(`Keyword: ${cause.matchedKeywords[0]}`, {
        size: 7.5,
        color: INK_FAINT,
      });
    }
    pdf.paragraph(`Rekomendasi: ${cause.recommendation}`, {
      size: 8.5,
      gapAfter: 1,
    });
    const references = cause.ticketReferences ?? [];
    if (references.length > 0) {
      pdf.paragraph(
        `Tiket terkait (${numberText(references.length)}): ` +
          references
            .map((reference) =>
              [
                reference.no_tiket,
                reference.periodLabel,
                `${numberText(reference.findingsCount)} temuan`,
                reference.criticalFindingsCount > 0
                  ? `${numberText(reference.criticalFindingsCount)} critical`
                  : "",
              ]
                .filter(Boolean)
                .join(" \u2022 "),
            )
            .join("; "),
        { size: 7.5, color: INK_MUTE, gapAfter: 1 },
      );
    }
    for (const item of cause.evidence ?? []) {
      pdf.paragraph(
        `Bukti: ${item.no_tiket ?? "-"} \u2022 ${item.indicatorName} \u2022 nilai ${numberText(item.nilai)} (${nilaiLabel(item.nilai)})${item.text ? ` \u2014 ${item.text}` : ""}`,
        { size: 7.5, color: INK_MUTE, indent: 3, gapAfter: 0.5 },
      );
    }
    pdf.paragraph("", { size: 4 });
  });
}

/** [pola garis, lebar garis] per seri; seri total ditebalkan tanpa pola. */
const DASH_PATTERNS: ReadonlyArray<{ pattern: number[]; width: number }> = [
  { pattern: [], width: 0.6 },
  { pattern: [2, 1.5], width: 0.3 },
  { pattern: [1, 1.2], width: 0.3 },
  { pattern: [4, 1.5, 1, 1.5], width: 0.3 },
  { pattern: [3, 1, 1, 1], width: 0.3 },
  { pattern: [1, 1], width: 0.4 },
];

/**
 * Gaya seri pada posisi tertentu. Seri total memakai pola kosong (tebal),
 * seri rincian SELALU memakai pola garis yang tidak kosong: laporan juga dibaca
 * saat dicetak hitam-putih, jadi pembeda warna saja tidak boleh jadi satu-
 *-satunya pembeda dua parameter.
 */
function lineDash(index: number, emphasis: boolean) {
  return emphasis
    ? DASH_PATTERNS[0]
    : DASH_PATTERNS[1 + (index % (DASH_PATTERNS.length - 1))];
}

function seriesPattern(index: number, emphasis: boolean): number[] {
  return emphasis ? [] : lineDash(index, false).pattern;
}

/** `#0f766e` → `[15, 118, 110]`, supaya warna seri PDF sama dengan HTML. */
function hexRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value;
  const parsed = Number.parseInt(full, 16);
  if (!Number.isFinite(parsed)) return INK_MUTE;
  return [(parsed >> 16) & 0xff, (parsed >> 8) & 0xff, parsed & 0xff];
}

interface PdfTrendChart {
  /** Judul yang dilihat pembaca: metrik + satuan, bukan "Grafik". */
  title: string;
  /** Satu kalimat yang menjelaskan apa yang diukur grafik ini. */
  note: string;
  /** Satuan sumbu Y, ditulis di atas plot ("Jumlah temuan" / "Skor (0-100)"). */
  unit: string;
  caption: string;
  series: TrendSeries[];
  labels: string[];
}

/**
 * Tinggi satu blok grafik tren (mm), dipakai untuk `ensureSpace` supaya plot,
 * label periode, label nilai, dan legenda tidak pernah terbelah batas halaman.
 */
function trendChartHeight(
  pdf: PdfDocument,
  chart: PdfTrendChart,
  legendLines: number,
): number {
  const plotHeight = 34;
  return (
    line(9.5) +
    line(7.5) +
    line(6.5) + // label satuan
    plotHeight +
    line(6.5) + // label periode
    legendLines * line(7.5) +
    line(7) // keterangan grafik
  );
}

/**
 * Legenda yang menempel di bawah plot: satu baris per seri, memakai potongan
 * garis dengan pola yang sama dengan garis di grafik, jadi pembaca bisa
 * mencocokkan garisnya tanpa bergantung pada warna. Label panjang membungkus
 * dengan indentasi, bukan terpotong.
 */
function drawTrendLegend(
  pdf: PdfDocument,
  chart: PdfTrendChart,
  top: number,
): number {
  const swatchWidth = 6;
  const gap = 1.5;
  const indent = MARGIN_LEFT + swatchWidth + gap;
  // Kursor dipindah ke atas legenda lebih dulu: `writeLine` menulis pada kursor
  // dokumen, jadi tanpa ini legenda digambar di dalam area plot.
  pdf.moveTo(top);
  chart.series.forEach((series, seriesIndex) => {
    const y = pdf.cursor;
    const color = hexRgb(series.color);
    pdf.doc.setDrawColor(color[0], color[1], color[2]);
    pdf.doc.setLineWidth(lineDash(seriesIndex, series.emphasis).width);
    pdf.doc.setLineDashPattern(seriesPattern(seriesIndex, series.emphasis), 0);
    pdf.doc.line(MARGIN_LEFT, y - 0.6, MARGIN_LEFT + swatchWidth, y - 0.6);
    pdf.doc.setLineDashPattern([], 0);
    wrapPdfText(
      series.label,
      CONTENT_WIDTH - swatchWidth - gap,
      pdf.measure,
      "bold",
      7.5,
    ).forEach((item) => {
      pdf.writeLine(item, indent, { font: "bold", size: 7.5, color: INK });
    });
  });
  return pdf.cursor;
}

/** Jumlah baris legenda untuk sebuah grafik (dipakai untuk pagination). */
function trendLegendLineCount(pdf: PdfDocument, chart: PdfTrendChart): number {
  return chart.series.reduce(
    (sum, series) =>
      sum +
      wrapPdfText(series.label, CONTENT_WIDTH - 7.5, pdf.measure, "bold", 7.5)
        .length,
    0,
  );
}

/**
 * Grafik tren vektor: judul, satuan sumbu Y, kisi + angka sumbu, label periode
 * yang tidak pernah saling tumpang tindih, nilai di atas tiap titik, lalu
 * legenda. Satu grafik = satu kelompok seri, jadi tiga metrik skor maupun
 * agregat (Total Temuan) dan rincian (per parameter) tidak pernah digabung
 * dalam satu trendline.
 */
function drawTrendChart(pdf: PdfDocument, chart: PdfTrendChart): void {
  const { labels, series } = chart;
  const plotHeight = 34;
  const axisWidth = 9;
  // Sisakan ruang di kanan supaya label periode terakhir tidak menyentuh tepi
  // margin.
  const labelRoom = 5;
  const legendLines = trendLegendLineCount(pdf, chart);
  pdf.ensureSpace(trendChartHeight(pdf, chart, legendLines) + 2);

  pdf.paragraph(chart.title, { font: "bold", size: 9.5, color: INK });
  pdf.paragraph(chart.note, { size: 7.5, color: INK_MUTE });

  const unitTop = pdf.cursor;
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(6.5);
  pdf.doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
  pdf.doc.text(pdfSafeText(chart.unit), MARGIN_LEFT, unitTop, {
    baseline: "top",
  });
  pdf.moveTo(unitTop + line(6.5));

  const plotLeft = MARGIN_LEFT + axisWidth;
  const plotTop = pdf.cursor;
  const plotWidth = CONTENT_WIDTH - axisWidth - labelRoom;
  const values = series.flatMap((item) =>
    item.data.filter((value): value is number => value !== null),
  );
  const maxValue = Math.max(1, ...values);
  const step = niceStep(maxValue);
  const tickMax = step * Math.max(1, Math.ceil(maxValue / step));
  const yFor = (value: number) =>
    plotTop + plotHeight - (value / tickMax) * plotHeight;
  const xFor = (index: number) =>
    labels.length === 1
      ? plotLeft + plotWidth / 2
      : plotLeft + (index / (labels.length - 1)) * plotWidth;

  const gridCount = Math.max(1, Math.round(tickMax / step));
  for (let index = 0; index <= gridCount; index += 1) {
    const value = step * index;
    const y = yFor(value);
    pdf.doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    pdf.doc.setLineWidth(0.15);
    pdf.doc.line(plotLeft, y, plotLeft + plotWidth, y);
    pdf.doc.setFont(FONT, "normal");
    pdf.doc.setFontSize(6.5);
    pdf.doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
    pdf.doc.text(String(value), plotLeft - 1.5, y, {
      align: "right",
      baseline: "middle",
    });
  }

  // Label periode: hanya yang tidak akan saling menimpa. Ujung kiri/kanan
  // selalu dicetak (rata kiri/rata kanan) supaya tidak keluar dari margin.
  const labelWidths = labels.map((item) =>
    pdf.measure(pdfSafeText(item), "normal", 6.5),
  );
  const spacing =
    labels.length > 1 ? plotWidth / (labels.length - 1) : plotWidth;
  const stride = Math.max(
    1,
    Math.ceil((Math.max(...labelWidths) + 2) / Math.max(spacing, 0.01)),
  );
  const lastIndex = labels.length - 1;
  let previousDrawn = -1;
  labels.forEach((item, index) => {
    const isEdge = index === 0 || index === lastIndex;
    const onStride = index % stride === 0;
    if (!isEdge && !onStride) return;
    // Label yang terlalu dekat dengan label terakhir dilewati: dua label
    // yang tumpang tindih lebih buruk daripada satu label yang dilewati.
    if (onStride && !isEdge && lastIndex - previousDrawn < stride * 0.7) return;
    const align =
      index === 0 ? "left" : index === lastIndex ? "right" : "center";
    pdf.doc.setFont(FONT, "normal");
    pdf.doc.setFontSize(6.5);
    pdf.doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
    pdf.doc.text(pdfSafeText(item), xFor(index), plotTop + plotHeight + 1.5, {
      align,
      baseline: "top",
    });
    previousDrawn = index;
  });

  // Label nilai hanya digambar kalau jaraknya cukup lega; kalau tidak, angka
  // saling tumpang tindih dan grafik justru makin sulit dibaca.
  const showValues = spacing >= 9;
  series.forEach((seriesItem, seriesIndex) => {
    const color = hexRgb(seriesItem.color);
    pdf.doc.setDrawColor(color[0], color[1], color[2]);
    pdf.doc.setLineWidth(lineDash(seriesIndex, seriesItem.emphasis).width);
    pdf.doc.setLineDashPattern(
      seriesPattern(seriesIndex, seriesItem.emphasis),
      0,
    );
    for (let position = 1; position < labels.length; position += 1) {
      const previousValue = seriesItem.data[position - 1];
      const value = seriesItem.data[position];
      // Periode tanpa data (null) tidak pernah disambung ke periode berikutnya.
      if (previousValue == null || value == null) continue;
      if (!Number.isFinite(previousValue) || !Number.isFinite(value)) continue;
      pdf.doc.line(
        xFor(position - 1),
        yFor(previousValue),
        xFor(position),
        yFor(value),
      );
    }
    pdf.doc.setLineDashPattern([], 0);
    for (let position = 0; position < labels.length; position += 1) {
      const value = seriesItem.data[position];
      if (value == null || !Number.isFinite(value)) continue;
      pdf.doc.setFillColor(255, 255, 255);
      pdf.doc.setDrawColor(color[0], color[1], color[2]);
      pdf.doc.setLineWidth(0.2);
      pdf.doc.circle(xFor(position), yFor(value), 0.9, "FD");
      if (!showValues) continue;
      // Hanya nilai yang menyentuh PUNCUK plot yang dicetak di bawah titik.
      // Nilai di dasar plot (nol) juga dicetak di bawah akan menabrak label
      // periode yang tepat di bawah sumbu X.
      const atTop = yFor(value) <= plotTop + 2;
      pdf.doc.setFont(FONT, "bold");
      pdf.doc.setFontSize(6.5);
      pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
      pdf.doc.text(
        String(value),
        xFor(position),
        yFor(value) + (atTop ? 1.4 : -1.4),
        {
          align: "center",
          baseline: atTop ? "top" : "bottom",
        },
      );
    }
  });

  const afterPlot = plotTop + plotHeight + line(6.5) + 1;
  const afterLegend = drawTrendLegend(pdf, chart, afterPlot);
  pdf.moveTo(afterLegend);
  pdf.paragraph(
    `Grafik menampilkan ${labels.length} periode dan ${series.length} seri data. Nilai lengkapnya ada pada tabel ${chart.caption}.`,
    { size: 7, color: INK_FAINT, gapAfter: 2 },
  );

  pdf.table({
    caption: chart.caption,
    columns: ["Periode", ...series.map((item) => item.label)].map(
      (label, index) => ({
        header: label,
        weight: index === 0 ? 0.8 : 1,
        minWidth: index === 0 ? 16 : 20,
        align: index === 0 ? ("left" as const) : ("right" as const),
      }),
    ),
    rows: labels.map((item, index) => [
      item,
      ...series.map((seriesItem) => {
        const value = seriesItem.data[index];
        return typeof value === "number" && Number.isFinite(value)
          ? numberText(value)
          : "\u2014";
      }),
    ]),
  });
}

/**
 * Seksi "Perkembangan Skor" — skor dari `monthlySummaries`, bukan dari
 * `personalTrend`. Tiga metrik (final, non-critical, critical) masing-masing
 * satu grafik vektor + satu tabel, jadi tidak ada trendline yang mencampur tiga
 * sumber hitungan berbeda dan tidak ada tabel yang ikut memuat kolom metrik
 * lain.
 */
function buildScoreTrendSection(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
): void {
  const { labels, charts } = buildScoreTrend({
    monthlySummaries: input.monthlySummaries,
    selectedYear: input.selectedYear,
  });
  if (labels.length === 0) {
    pdf.paragraph(SCORE_EMPTY_NOTE, { color: INK_MUTE });
    return;
  }
  pdf.paragraph(
    trendScopeLabel(input.selectedService, input.selectedYear, labels),
    { size: 7.5, color: INK_FAINT },
  );
  for (const chart of charts) {
    drawTrendChart(pdf, {
      title: chart.title,
      note: chart.note,
      unit: SCORE_UNIT_LABEL,
      caption: chart.tableCaption,
      series: [chart.series],
      labels,
    });
  }
}

/**
 * Seksi "Tren Temuan" — `personalTrend`, yaitu JUMLAH TEMUAN per periode.
 *
 * Tidak ada satu pun garis skor di sini: seksi skor sudah punya grafik dan
 * tabelnya sendiri di atas. Tabel perbandingan temuan ikut di sini karena
 * isinya juga hitungan temuan.
 */
function buildFindingsTrendSection(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
): void {
  const { labels, total, parameters } = groupTrendSeries(input.data);
  if (labels.length === 0 || (total === null && parameters.length === 0)) {
    pdf.paragraph("Data tren belum tersedia untuk konteks ini.", {
      color: INK_MUTE,
    });
    return;
  }
  pdf.paragraph(
    trendScopeLabel(input.selectedService, input.selectedYear, labels),
    {
      size: 7.5,
      color: INK_FAINT,
    },
  );

  if (total) {
    drawTrendChart(pdf, {
      title: "Jumlah Total Temuan per Periode",
      note: "Agregat seluruh temuan pada cakupan ini, satu titik per periode.",
      unit: TREND_UNIT_LABEL,
      caption: TREND_TOTAL_TABLE_CAPTION,
      series: [total],
      labels,
    });
  }
  if (parameters.length > 0) {
    drawTrendChart(pdf, {
      title: "Jumlah Temuan per Parameter",
      note:
        "Satu seri per parameter penilaian. Semua seri memakai satuan yang sama (" +
        TREND_UNIT_LABEL.toLowerCase() +
        " per periode), jadi boleh dibaca sebagai pembanding langsung.",
      unit: TREND_UNIT_LABEL,
      caption: TREND_PARAMETER_TABLE_CAPTION,
      series: parameters,
      labels,
    });
  }
}

function buildComparisonTable(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
): void {
  const table = input.data.comparisonTable;
  if (!table || table.rows.length === 0) return;
  const delta = (agentCount: number, average: number): number | null => {
    const agent = safeNumber(agentCount);
    const mean = safeNumber(average);
    if (mean === 0) return agent === 0 ? 0 : null;
    return safeNumber(((agent - mean) / mean) * 100);
  };
  const formatDelta = (value: number | null): string => {
    if (value === null) return "\u2014";
    const rounded = Math.round(safeNumber(value) * 10) / 10;
    if (rounded === 0) return "0%";
    return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(1)}%`;
  };
  const totalRow = table.rows.find((row) => row.key === "total");
  const peers = `${numberText(totalRow?.teamAgentCount)} agen tim / ${numberText(totalRow?.serviceAgentCount)} agen layanan sama`;
  // Cakupan benchmark memakai kalimat yang sama dengan CSV/MD
  // (`comparisonScopeLabel`), jadi ketiga format tidak berbeda cerita tentang
  // periode mana yang dibandingkan.
  pdf.paragraph(
    [comparisonScopeLabel(input.data), peers].filter(Boolean).join(" \u2022 "),
    { size: 7.5, color: INK_FAINT },
  );
  pdf.table({
    caption: "Perbandingan Temuan",
    columns: [
      { header: "Parameter", weight: 1.8, minWidth: 44 },
      { header: "Agen Ini", weight: 0.7, minWidth: 16, align: "right" },
      { header: "Rata-rata Tim", weight: 0.8, minWidth: 20, align: "right" },
      {
        header: "Rata-rata Service",
        weight: 0.9,
        minWidth: 24,
        align: "right",
      },
      {
        header: "% vs Tim",
        weight: 0.7,
        minWidth: 16,
        align: "right",
        tone: (rowIndex) => {
          const row = table.rows[rowIndex];
          return row ? deltaTone(delta(row.agentCount, row.teamAverage)) : null;
        },
      },
      {
        header: "% vs Service",
        weight: 0.8,
        minWidth: 20,
        align: "right",
        tone: (rowIndex) => {
          const row = table.rows[rowIndex];
          return row
            ? deltaTone(delta(row.agentCount, row.serviceAverage))
            : null;
        },
      },
    ],
    rows: table.rows.map((row) => [
      row.label,
      numberText(row.agentCount),
      safeNumber(row.teamAverage).toFixed(1),
      safeNumber(row.serviceAverage).toFixed(1),
      formatDelta(delta(row.agentCount, row.teamAverage)),
      formatDelta(delta(row.agentCount, row.serviceAverage)),
    ]),
    totalRows: table.rows
      .map((row, index) => (row.key === "total" ? index : -1))
      .filter((index) => index >= 0),
  });
}

function buildFindings(pdf: PdfDocument, input: AgentReportPdfInput): void {
  pdf.paragraph(
    yearServiceScopeLabel(input.selectedService, input.selectedYear),
    { size: 7.5, color: INK_FAINT },
  );
  const items = input.temuanDisplayItems;
  if (items.length === 0) {
    pdf.paragraph("Tidak ada temuan untuk cakupan ini.", { color: INK_MUTE });
    return;
  }

  const grouped = new Map<string, TemuanDisplayItemExport[]>();
  for (const item of items) {
    const key = `${item.year}-${String(item.month).padStart(2, "0")}`;
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  for (const [, monthItems] of Array.from(grouped.entries()).sort(([a], [b]) =>
    b.localeCompare(a),
  )) {
    const first = monthItems[0];
    const tickets = new Map<
      string,
      { label: string; items: TemuanDisplayItemExport[] }
    >();
    for (const item of monthItems) {
      const raw = (item.no_tiket ?? "").trim();
      const key = raw ? raw.toUpperCase() : `audit-${item.id}`;
      const ticket = tickets.get(key) ?? {
        label: raw ? raw.toUpperCase() : "AUDIT INTERNAL",
        items: [],
      };
      ticket.items.push(item);
      tickets.set(key, ticket);
    }
    pdf.paragraph(
      `${monthYear(first.month, first.year)} \u2014 ${numberText(monthItems.length)} temuan, ${numberText(tickets.size)} tiket`,
      { font: "bold", size: 9.5, color: INK, gapAfter: 1 },
    );
    for (const ticket of tickets.values()) {
      drawTicketBand(pdf, ticket.label, ticket.items.length);
      for (const item of ticket.items) {
        // Nama parameter + nilai: lengkap dan proporsional, tapi tidak pernah
        // lebih besar atau lebih tebal daripada nomor tiket di pitanya.
        pdf.paragraph(
          `${formatNilai(item.nilai)} \u2014 ${item.indicatorName}`,
          {
            font: "bold",
            size: 9,
            color: INK,
            indent: 3,
          },
        );
        pdf.paragraph(`Ketidaksesuaian: ${item.ketidaksesuaian ?? "\u2014"}`, {
          size: 9,
          indent: 3,
          gapAfter: 0.5,
        });
        pdf.paragraph(`Sebaiknya: ${item.sebaiknya ?? "\u2014"}`, {
          size: 9,
          indent: 3,
          gapAfter: 1.5,
        });
      }
    }
  }
}

/**
 * Pita identitas per tiket: label "NO TIKET", nomor tiket, dan jumlah parameter
 * di dalam bidang abu muda. Nomor tiket dicetak paling besar dan paling tebal
 * di blok temuan — itu identifier yang dicari pembaca saat membaca audit, dan
 * sebelumnya ia tenggelam di antara nama parameter.
 *
 * Pita ini adalah satu blok: pita tidak pernah menggantung sendirian di dasar
 * halaman, dan pita selalu membawa minimal satu baris temuan bersamanya.
 */
function drawTicketBand(
  pdf: PdfDocument,
  label: string,
  itemCount: number,
): void {
  const paddingX = 3;
  const paddingY = 2;
  const labelSize = 7;
  const codeSize = 11.5;
  const labelText = "NO TIKET";
  const labelWidth = pdf.measure(labelText, "bold", labelSize);
  const note = `${numberText(itemCount)} parameter`;
  // Nomor tiket yang panjang membungkus di dalam pita, bukan meluber melewati
  // margin kanan. Ruang sisanya dipakai untuk jumlah parameter di tepi kanan.
  const code = wrapPdfText(
    label,
    CONTENT_WIDTH - paddingX * 2 - labelWidth - 2 - 30,
    pdf.measure,
    "bold",
    codeSize,
  );
  const bandHeight = paddingY * 2 + line(codeSize) * code.length;
  // Pita + satu baris temuan pertama harus muat bersama; kalau tidak, pindah
  // halaman sekarang juga.
  pdf.ensureSpace(bandHeight + line(9) + 2);

  const top = pdf.cursor;
  pdf.doc.setFillColor(WASH[0], WASH[1], WASH[2]);
  pdf.doc.setDrawColor(LINE_STRONG[0], LINE_STRONG[1], LINE_STRONG[2]);
  pdf.doc.setLineWidth(0.2);
  pdf.doc.rect(MARGIN_LEFT, top, CONTENT_WIDTH, bandHeight, "FD");

  const textTop = top + paddingY;
  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(labelSize);
  pdf.doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
  pdf.doc.text(labelText, MARGIN_LEFT + paddingX, textTop, { baseline: "top" });

  pdf.doc.setFont(FONT, "bold");
  pdf.doc.setFontSize(codeSize);
  pdf.doc.setTextColor(INK[0], INK[1], INK[2]);
  code.forEach((item, index) => {
    pdf.doc.text(
      item,
      MARGIN_LEFT + paddingX + labelWidth + 2,
      textTop + index * line(codeSize),
      {
        baseline: "top",
      },
    );
  });

  pdf.doc.setFont(FONT, "normal");
  pdf.doc.setFontSize(7.5);
  pdf.doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
  pdf.doc.text(note, PAGE_WIDTH - MARGIN_RIGHT - paddingX, textTop, {
    align: "right",
    baseline: "top",
  });
  pdf.moveTo(top + bandHeight + 1);
}

function buildColophon(
  pdf: PdfDocument,
  input: AgentReportPdfInput,
  dateStr: string,
  serviceLabel: string,
): void {
  const notes: string[] = [
    `Dihasilkan pada ${dateStr} dari halaman SIDAK saat laporan diunduh. Tiap bagian menyatakan cakupan periodenya sendiri di bawah judulnya.`,
    "Sesi tanpa temuan (clean session) tidak ditampilkan sebagai baris temuan, tiket, atau parameter; hanya angka agregat Sesi pada rekap bulanan yang ikut, sesuai perhitungan backend.",
    "Angka agregat sesi berasal dari penilaian backend dan tidak dihitung ulang oleh laporan ini.",
  ];
  // Colophon adalah satu blok: kalau tidak muat, ia pindah halaman utuh
  // daripada terbelah sehingga penyimpulan laporan terpisah dari paragrafnya.
  const blockHeight =
    7 +
    line(7.5) +
    notes.reduce(
      (sum, note) =>
        sum +
        wrapPdfText(note, CONTENT_WIDTH, pdf.measure, "normal", 7).length *
          line(7),
      0,
    );
  pdf.ensureSpace(blockHeight + 8);
  pdf.rule(LINE, 4, 3);
  pdf.paragraph(
    `Laporan Audit SIDAK \u2022 ${input.data.peserta.nama} \u2022 Tahun ${yearText(input.selectedYear)} \u2022 Layanan ${serviceLabel}`,
    { font: "bold", size: 7.5, color: INK_MUTE },
  );
  for (const note of notes) pdf.paragraph(note, { size: 7, color: INK_FAINT });
}

// ---------------------------------------------------------------------------
// Pintu masuk
// ---------------------------------------------------------------------------

/**
 * Bangun PDF A4 portrait dari snapshot yang sama dengan format lain.
 *
 * `jsPDF` diimpor secara dinamis di dalam fungsi ini: pengguna yang hanya
 * mengunduh CSV/MD/HTML tidak pernah memuat pustaka PDF. Kegagalan import
 * maupun kegagalan pembuatan dilempar apa adanya supaya pemanggil menampilkan
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
  const masaKerja = computeTenure(peserta.bergabung_date);
  const serviceLabel = input.selectedService.toUpperCase() || "\u2014";
  const dateStr = new Date().toLocaleString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const activeMonth =
    input.context.selectedMonth ??
    input.monthlySummaries[input.monthlySummaries.length - 1]?.month ??
    null;

  // Metadata memakai teks yang sudah disanitasi supaya judul/subject tidak
  // pernah memuat byte yang tidak bisa dibaca pembaca PDF mana pun.
  doc.setProperties({
    title: `Laporan Audit Agent - ${pdfSafeText(peserta.nama)}`,
    subject: `Tahun ${yearText(input.selectedYear)} - Layanan ${serviceLabel} - Bulan ${monthYear(activeMonth, input.selectedYear)}`,
    author: "SIDAK",
    keywords: `audit, sidak, ${yearText(input.selectedYear)}, ${input.selectedService}`,
    creator: "Trainers SuperApp - Laporan Audit SIDAK",
  });

  const pdf = new PdfDocument(
    doc,
    {
      left: "Laporan Audit SIDAK",
      right: `${pdfSafeText(peserta.nama)} \u2022 Tahun ${yearText(input.selectedYear)} \u2022 ${serviceLabel}`,
    },
    createMeasurer(doc),
  );
  pdf.begin();

  buildMasthead(pdf, input, masaKerja, serviceLabel);
  pdf.heading(
    "Ringkasan",
    `Tahun ${yearText(input.selectedYear)} \u2022 Layanan ${serviceLabel} \u2022 Bulan terpilih ${monthYear(activeMonth, input.selectedYear)}`,
    // Blok skor periode aktif adalah isi pertama seksi ini.
    40,
  );
  buildActiveScore(pdf, input, activeMonth);
  buildStanding(pdf, input);
  buildMonthlyTable(pdf, input);
  buildTicketsTable(pdf, input, activeMonth);
  buildRootCauses(pdf, input, activeMonth);

  // Isi pertama seksi ini adalah blok grafik skor pertama: judul, satuan,
  // plot, label periode, nilai, dan legenda harus utuh di halaman yang sama.
  pdf.heading("Perkembangan Skor", undefined, 62);
  buildScoreTrendSection(pdf, input);

  // Isi seksi ini adalah grafik JUMLAH TEMUAN (bukan skor) + tabel benchmark.
  pdf.heading("Tren Temuan", undefined, 62);
  buildFindingsTrendSection(pdf, input);
  buildComparisonTable(pdf, input);

  // Isi pertama seksi ini adalah satu blok periode + pita tiket + temuan.
  pdf.heading("Riwayat Temuan", undefined, 34);
  buildFindings(pdf, input);

  buildColophon(pdf, input, dateStr, serviceLabel);
  pdf.finalize();

  return doc.output("arraybuffer") as ArrayBuffer;
}
