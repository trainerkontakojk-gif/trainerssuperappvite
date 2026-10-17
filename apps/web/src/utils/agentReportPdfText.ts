/** Sanitasi teks WinAnsi serta pengukuran dan pembungkusan baris untuk PDF laporan agen. Dipecah dari `agentReportPdf.ts`. */

import type { jsPDF as JsPdfDocument } from "jspdf";
import { FONT } from "./agentReportPdfTheme";

// ---------------------------------------------------------------------------
// Sanitasi teks untuk font standar PDF (WinAnsi)
// ---------------------------------------------------------------------------

/**
 * Simbol yang lazim muncul di teks audit tetapi di luar WinAnsi. Dipetakan ke
 * ejaan Indonesia supaya kalimatnya tetap terbaca dan tidak berubah makna.
 */
export const UNICODE_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
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
export const WIN_ANSI_HIGH = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Penanda yang sah sebagai satu token utuh, untuk pemotongan baris. */
export const MARKER_AT_TOKEN_START = /^\[U\+[0-9A-F]{4,6}\]/;

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
export function unprintableMarker(code: number): string {
  return `[U+${code.toString(16).toUpperCase().padStart(4, "0")}]`;
}

/**
 * Teks aman untuk font standar PDF: petakan simbol di luar WinAnsi ke ejaan
 * Indonesia, lalu ganti setiap titik kode yang tidak punya glyph dengan
 * penandanya. Panjang teks tidak dibatasi di sini; pembungkusan baris ada di
 * lapisan layout, sehingga teks yang panjang tetap utuh dan hanya menjadi
 * lebih banyak baris.
 */
export function pdfSafeText(value: unknown): string {
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

export type Measure = (
  text: string,
  font: "normal" | "bold",
  size: number,
) => number;

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
export function createMeasurer(doc: JsPdfDocument): Measure {
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
export function markerAtoms(token: string): string[] {
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
export function hardBreak(
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
export function wrapPdfText(
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
export function wrapLine(
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
