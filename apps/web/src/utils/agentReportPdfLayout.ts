/** Mesin tata letak PDF laporan agen: halaman, paragraf, tabel, dan elemen kecil. Dipecah dari `agentReportPdf.ts`. */

import type { jsPDF as JsPdfDocument } from "jspdf";
import { type Tone } from "./agentReportModel";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  HEADER_TOP,
  HEADER_RULE,
  CONTENT_BOTTOM,
  CONTENT_WIDTH,
  FONT,
  type Rgb,
  INK,
  INK_BODY,
  INK_MUTE,
  INK_FAINT,
  LINE,
  LINE_STRONG,
  WASH,
  line,
  toneColor,
} from "./agentReportPdfTheme";
import { pdfSafeText, type Measure, wrapPdfText } from "./agentReportPdfText";

// ---------------------------------------------------------------------------
// Mesin tata letak
// ---------------------------------------------------------------------------

export interface TextStyle {
  font?: "normal" | "bold";
  size?: number;
  color?: Rgb;
  /** Ketinggian satu baris termasuk spasi antarbaris (mm). */
  lineHeight?: number;
  gapAfter?: number;
}

export interface PdfColumn {
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

export interface PdfTable {
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
export class PdfDocument {
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

export function columnWidths(columns: PdfColumn[]): number[] {
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
export function bullet(
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
export function statRow(
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

export function note(pdf: PdfDocument, text: string, gapAfter = 2): void {
  pdf.paragraph(text, { size: 7.5, color: INK_MUTE, gapAfter });
}
