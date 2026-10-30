import { expect, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";

/**
 * Kemunculan fakta di cetakan. PDF menyimpan teks per glyph dan kehilangan
 * spasi di ujung baris saat teks terlipat, jadi kemunculan diuji pada teks yang
 * whitespace-nya dibuang. Yang dibuktikan adalah "fakta ini ikut tercetak",
 * bukan di mana barisnya terpenggal.
 */
export function printedIncludes(text: string, fact: string): boolean {
  return text.replace(/\s+/g, "").includes(fact.replace(/\s+/g, ""));
}

// ---------------------------------------------------------------------------
// Penanda karakter tak-tercetak di PDF (`[U+XXXX]`)
// ---------------------------------------------------------------------------

type PrintedMarkers = {
  /** Semua penanda UTUH yang terbaca di teks hasil read-back. */
  complete: string[];
  /** Titik kode unik hasil dibaca ulang dari penanda, terurut. */
  codePoints: string[];
  /** Berapa kali `[U+` muncul — termasuk kemunculan penanda yang terpotong. */
  starts: number;
};

/**
 * Baca penanda karakter tak-tercetak dari teks hasil read-back PDF.
 *
 * `starts` sengaja dibandingkan dengan `complete`: kalau pembungkusan baris
 * memecah penanda jadi dua baris (`[U+1EC` + `7]`), `[U+` masih muncul tapi
 * regex penanda utuh tidak — jadi selisih keduanya membocorkan penanda yang
 * terpotong. Bandingkan hanya `complete` saja tidak cukup, karena penanda yang
 * terbelah hilang tanpa jejak dan seluruh bukti "tidak ada yang hilang" jadi
 * lulus palsu.
 */
export function readPrintedMarkers(text: string): PrintedMarkers {
  const complete = text.match(/\[U\+[0-9A-F]{4,6}\]/g) ?? [];
  return {
    complete,
    codePoints: [
      ...new Set(complete.map((marker) => marker.slice(1, -1))),
    ].sort(),
    starts: text.split("[U+").length - 1,
  };
}

/** Gabungan seluruh halaman hasil read-back, untuk pengecekan isi cetak. */
export function printedReadBack(pages: readonly string[]): string {
  return pages.join("\n");
}

/**
 * Teks per halaman dari PDF hasil `page.pdf()`.
 *
 * PDF peramban tidak pernah menyertakan plain text: teksnya disimpan sebagai
 * kode glyph (font Type3) dan dipetakan ke Unicode lewat CMap `/ToUnicode`
 * per font. Jadi decoder di sini: (1) indeks objek PDF, (2) CMap tiap font,
 * (3) stream konten tiap halaman, (4) glyph hex → Unicode memakai font yang
 * sedang aktif (`/Fn size Tf`). Tidak ada tool eksternal (tidak ada poppler
 * atau pun unrar di CI), dan kalau dekoder ini gagal membaca apa pun, hasilnya
 * string kosong yang membuat assertion gagal — bukan lulus palsu.
 */
type PdfTextRun = {
  size: number;
  baseFont: string;
  text: string;
  /** Warna isi terakhir (`r g b rg`); null kalau tidak pernah diisi. */
  fill: [number, number, number] | null;
};

export function readPdfPages(bytes: Buffer): {
  texts: string[];
  contents: string[];
  runs: PdfTextRun[][];
} {
  const raw = bytes.toString("latin1");

  const objectStart = new Map<number, number>();
  const objectPattern = /(?:^|[\s>])(\d+)\s+0\s+obj\b/g;
  let objectMatch: RegExpExecArray | null;
  while ((objectMatch = objectPattern.exec(raw))) {
    objectStart.set(
      Number(objectMatch[1]),
      objectMatch.index + objectMatch[0].length,
    );
  }
  const objectBody = (number: number): string => {
    const start = objectStart.get(number);
    if (start === undefined) return "";
    const end = raw.indexOf("endobj", start);
    return raw.slice(start, end < 0 ? raw.length : end);
  };
  const objectStream = (number: number): Buffer | null => {
    const body = objectBody(number);
    const keyword = body.indexOf("stream");
    if (keyword < 0) return null;
    const head = body.slice(0, keyword);
    // `/Length` dipakai kalau ada: data terkompresi bisa saja memuat literal
    // "endstream", jadi memotong sampai keyword itu bisa memotong stream.
    const declared = Number(/\/Length\s+(\d+)/.exec(head)?.[1] ?? NaN);
    let start = keyword + "stream".length;
    if (body[start] === "\r") start += 1;
    if (body[start] === "\n") start += 1;
    const end = Number.isFinite(declared)
      ? start + declared
      : body.indexOf("endstream", start);
    if (end < 0) return null;
    const data = Buffer.from(body.slice(start, end), "latin1");
    if (!/\/FlateDecode/.test(head)) return data;
    try {
      return inflateSync(data);
    } catch {
      return null;
    }
  };

  const fontCache = new Map<number, PdfFontMap | null>();
  /**
   * Peta glyph → Unicode sebuah font. Ada dua sumber, dan keduanya nyata:
   *   1. `/ToUnicode` CMap — PDF peramban (Chromium) menyimpan teks sebagai
   *      kode glyph Type3 dan memetakan lewat CMap.
   *   2. `/Encoding /WinAnsiEncoding` — PDF generator (jsPDF) memakai font
   *      standar PDF dan menulis byte WinAnsi langsung, tanpa CMap sama sekali.
   * Tanpa cabang kedua, PDF unduhan produk hanya akan terbaca sebagai karakter
   * asing — dan test akan salah menyimpulkan "PDF-nya tidak punya teks".
   */
  /**
   * `/BaseFont` sebuah objek font. Dipakai untuk membedakan font bold dari
   * reguler saat membaca run teks: "nomor tiket lebih tebal daripada nama
   * parameter" adalah klaim tipografi, jadi harus dibaca dari font yang benar
   *-benar dipakai, bukan dari tebakan.
   */
  const baseFontOf = (font: number): string =>
    /\/BaseFont\s*\/([A-Za-z0-9-]+)/.exec(objectBody(font))?.[1] ?? "";

  const cmapOf = (font: number): PdfFontMap | null => {
    if (fontCache.has(font)) return fontCache.get(font) ?? null;
    const fontBody = objectBody(font);
    const reference = /\/ToUnicode\s+(\d+)\s+0\s+R/.exec(fontBody);
    const stream = reference ? objectStream(Number(reference[1])) : null;
    let map: PdfFontMap | null = stream
      ? parseUnicodeCmap(stream.toString("latin1"))
      : null;
    if (!map && /\/Encoding\s*\/WinAnsiEncoding/.test(fontBody)) {
      map = WIN_ANSI;
    }
    fontCache.set(font, map);
    return map;
  };

  // Urutan halaman otoritatif ada di `/Kids` objek `/Type /Pages`.
  let pageObjects: number[] = [];
  for (const number of objectStart.keys()) {
    const body = objectBody(number);
    if (!/\/Type\s*\/Pages/.test(body)) continue;
    const kids = /\/Kids\s*\[([\s\S]*?)\]/.exec(body);
    if (!kids) continue;
    pageObjects = [...kids[1].matchAll(/(\d+)\s+0\s+R/g)].map((match) =>
      Number(match[1]),
    );
  }
  if (pageObjects.length === 0) return { texts: [], contents: [], runs: [] };

  const pages = pageObjects.map((page) => {
    const body = objectBody(page);
    const content = [...body.matchAll(/\/Contents\s+(\d+)\s+0\s+R/g)]
      .map((match) => objectStream(Number(match[1])))
      .filter((stream): stream is Buffer => stream !== null)
      .map((stream) => stream.toString("latin1"))
      .join("\n");
    // Font bisa didaftar LANGSUNG di kamus `/Resources` halaman (PDF
    // peramban) atau di objek terpisah yang dirujuk `/Resources N 0 R`
    // (PDF generator, yang memakai satu kamus bersama untuk semua halaman).
    // Hanya membaca yang inline akan membuat PDF unduhan terbaca kosong.
    const resources =
      /\/Resources\s+(\d+)\s+0\s+R/.exec(body)?.[1] !== undefined
        ? objectBody(Number(/\/Resources\s+(\d+)\s+0\s+R/.exec(body)![1]))
        : body;
    const fonts = new Map<string, PdfFontMap | null>();
    const baseFonts = new Map<string, string>();
    for (const match of /\/Font\s*<<([\s\S]*?)>>/
      .exec(resources)?.[1]
      ?.matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g) ?? []) {
      fonts.set(match[1], cmapOf(Number(match[2])));
      baseFonts.set(match[1], baseFontOf(Number(match[2])));
    }
    return {
      content,
      text: decodeContentText(content, fonts),
      runs: decodeContentRuns(content, fonts, baseFonts),
    };
  });

  return {
    texts: pages.map((page) => page.text),
    // Content stream yang SUDAH didekompresi. PDF bisa memakai kompresi
    // Flate, jadi operator teks tidak pernah terlihat di byte mentah.
    contents: pages.map((page) => page.content),
    runs: pages.map((page) => page.runs),
  };
}

/** Peta satu byte font → teks Unicode. */
type PdfFontMap = Map<number, string>;

/**
 * Tabel WinAnsiEncoding (CP1252) — font standar PDF, dipakai generator PDF
 * tanpa CMap. Byte 0x00–0x7F = ASCII; 0xA0–0xFF = Latin-1; 0x80–0x9F =
 * karakter khusus CP1252 (termasuk bullet 0x95 dan em dash 0x97). Byte yang
 * tidak punya padanan dipetakan ke "?" supaya kebocoran byte rusak terlihat
 * sebagai kegagalan assertion, bukan sebagai teks yang terpotong diam-diam.
 */
const WIN_ANSI: PdfFontMap = (() => {
  const map: PdfFontMap = new Map();
  for (let code = 0x20; code <= 0x7e; code += 1)
    map.set(code, String.fromCharCode(code));
  for (let code = 0xa0; code <= 0xff; code += 1)
    map.set(code, String.fromCharCode(code));
  const special: Record<number, string> = {
    0x80: "€",
    0x82: "‚",
    0x83: "ƒ",
    0x84: "„",
    0x85: "…",
    0x86: "†",
    0x87: "‡",
    0x88: "ˆ",
    0x89: "‰",
    0x8a: "Š",
    0x8b: "‹",
    0x8c: "Œ",
    0x8e: "Ž",
    0x91: "‘",
    0x92: "’",
    0x93: "“",
    0x94: "”",
    0x95: "•",
    0x96: "–",
    0x97: "—",
    0x98: "˜",
    0x99: "™",
    0x9a: "š",
    0x9b: "›",
    0x9c: "œ",
    0x9e: "ž",
    0x9f: "Ÿ",
  };
  for (const [code, text] of Object.entries(special)) {
    map.set(Number(code), text);
  }
  map.set(0x09, " ");
  map.set(0x0a, " ");
  map.set(0x0d, " ");
  return map;
})();

/** `beginbfchar` / `beginbfrange` → peta kode glyph ke Unicode. */
function parseUnicodeCmap(source: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of source.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1].matchAll(/<([\da-f]+)>\s*<([\da-f]*)>/gi)) {
      map.set(parseInt(pair[1], 16), utf16be(pair[2]));
    }
  }
  for (const block of source.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const range of block[1].matchAll(
      /<([\da-f]+)>\s*<([\da-f]+)>\s*<([\da-f]*)>/gi,
    )) {
      const first = parseInt(range[1], 16);
      const last = parseInt(range[2], 16);
      if (range[3] === "" || last < first || last - first > 4096) continue;
      const base = parseInt(range[3].slice(0, 4), 16);
      for (let code = first; code <= last; code += 1) {
        map.set(code, String.fromCodePoint(base + (code - first)));
      }
    }
  }
  return map;
}

function utf16be(hex: string): string {
  let out = "";
  for (let index = 0; index + 4 <= hex.length; index += 4) {
    out += String.fromCharCode(parseInt(hex.slice(index, index + 4), 16));
  }
  return out;
}

function decodeContentText(
  content: string,
  fonts: Map<string, PdfFontMap | null>,
): string {
  const out: string[] = [];
  let font: PdfFontMap | null = null;
  // Angka posisi ikut dipertahankan: `Td` dengan koordinat Y != 0 artinya baris
  // baru, dan spasi di ujung baris hilang saat teks terlipat. Tanpa itu, "tanpa
  // tegas" jadi "tanpategas" di read-back.
  let pendingNumbers: number[] = [];
  const tokens =
    content.match(
      /\/[A-Za-z0-9]+\s+[\d.]+\s+Tf|<[\da-f]*>|\((?:\\[\s\S]|[^\\()])*\)|-?[\d.]+|Td|TD|Tm|T\*|TJ|Tj/gi,
    ) ?? [];
  for (const token of tokens) {
    if (token.endsWith("Tf")) {
      font = fonts.get(token.slice(1, token.search(/\s/))) ?? font;
      continue;
    }
    if (token === "Td" || token === "TD" || token === "Tm" || token === "T*") {
      // `Tm` selalu memulai run teks baru; `Td`/`TD` dengan Y != 0 pindah baris.
      const movesDown =
        token !== "Td" && token !== "TD" ? true : pendingNumbers.at(-1) !== 0;
      if (movesDown) out.push(" ");
      pendingNumbers = [];
      continue;
    }
    if (/^-?[\d.]+$/.test(token)) {
      pendingNumbers.push(Number(token));
      continue;
    }
    // Token lain hanya mengatur posisi; untuk kontrak ini yang penting
    // adalah isi teksnya, bukan koordinatnya.
    if (!token.startsWith("<") && !token.startsWith("(")) continue;
    for (const code of stringBytes(token)) {
      // Glyph tak dikenal menjadi "?" supaya assertion gagal nyaring, bukan
      // membuat halaman yang salah baca terlihat kosong.
      out.push(font?.get(code) ?? "?");
    }
  }
  return out.join("").replace(/ {2,}/g, " ").trim();
}

/**
 * Run teks per baris-per-`Tj`, lengkap dengan ukuran font dan `/BaseFont` yang
 * sedang aktif.
 *
 * Dibaca dari content stream yang SUDAH didekompresi. Klaim hierarki visual
 * (mis. "nomor tiket lebih besar dan lebih tebal daripada nama parameter")
 * hanya bisa dibuktikan lewat ukuran font + nama font yang benar-benar ditulis
 * generator; membacanya dari string teks biasa tidak bisa membedakan "12pt
 * bold" dari "8pt biasa".
 */
function decodeContentRuns(
  content: string,
  fonts: Map<string, PdfFontMap | null>,
  baseFonts: Map<string, string>,
): PdfTextRun[] {
  const runs: PdfTextRun[] = [];
  let fontName = "";
  let size = 0;
  let fill: [number, number, number] | null = null;
  let pending: number[] = [];
  const tokens =
    content.match(
      /\/[A-Za-z0-9]+\s+[\d.]+\s+Tf|[\d.]+(?:\s+[\d.]+){2}\s+rg|<[\da-f]*>|\((?:\\[\s\S]|[^\\()])*\)|[\d.]+|Td|TD|Tm|T\*|TJ|Tj/gi,
    ) ?? [];
  for (const token of tokens) {
    if (token.endsWith("Tf")) {
      fontName = token.slice(1, token.search(/\s/));
      size = Number(token.split(/\s+/)[1] ?? 0);
      continue;
    }
    // `r g b rg` = warna isi teks aktif. Tanpa ini, warna glyph tidak bisa
    // dibedakan: glyph yang salah warna tetap terbaca sebagai teks biasa.
    if (token.endsWith(" rg")) {
      const parts = token.split(/\s+/).map(Number);
      fill = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
      continue;
    }
    if (token === "Td" || token === "TD" || token === "Tm" || token === "T*") {
      continue;
    }
    if (/^[\d.]+$/.test(token)) {
      pending.push(Number(token));
      continue;
    }
    if (!token.startsWith("<") && !token.startsWith("(")) continue;
    const font = fonts.get(fontName) ?? null;
    const text = [...stringBytes(token)]
      .map((code) => font?.get(code) ?? "?")
      .join("");
    if (text !== "") {
      runs.push({
        size,
        baseFont: baseFonts.get(fontName) ?? "",
        text,
        fill,
      });
    }
    pending = [];
  }
  return runs;
}

/**
 * Byte teks dari satu operand string PDF: `<hex>` atau `(literal)`. Kurung dan
 * backslash di dalam literal string di-escape (`\(`), octal `\ddd` adalah byte
 * langsung. Escape lain (`\n`, `\t`, `\r`, `\b`, `\f`) tetap ASCII.
 */
function stringBytes(token: string): number[] {
  if (token.startsWith("<")) {
    const hex = token.slice(1, -1);
    const bytes: number[] = [];
    for (let index = 0; index + 2 <= hex.length; index += 2) {
      bytes.push(parseInt(hex.slice(index, index + 2), 16));
    }
    return bytes;
  }
  const body = token.slice(1, -1);
  const bytes: number[] = [];
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0) & 0xff);
      continue;
    }
    const next = body[index + 1];
    index += 1;
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      const octal =
        body.slice(index, index + 3).match(/^[0-7]{1,3}/)?.[0] ?? next;
      bytes.push(parseInt(octal, 8) & 0xff);
      index += octal.length - 1;
      continue;
    }
    bytes.push(next.charCodeAt(0) & 0xff);
  }
  return bytes;
}

/** Isi kamus `/Info` PDF: judul, subjudul, penulis, pembuat, produser. */
export function readPdfInfo(bytes: Buffer): Record<string, string> {
  const raw = bytes.toString("latin1");
  const info: Record<string, string> = {};
  for (const match of raw.matchAll(
    /\/(Title|Subject|Author|Creator|Keywords|Producer|CreationDate)\s*\(((?:\\[\s\S]|[^\\()])*)\)/g,
  )) {
    info[match[1]] = match[2].replace(/\\([\\()])/g, "$1");
  }
  return info;
}

type RecordedBlob = { type: string; size: number };

/**
 * Pasang pencatat blob lalu kembalikan pembacaannya. Pencatat harus dipasang
 * SEBELUM unduhan dan dibaca SESUDAH unduhan, jadi bentuknya install + reader.
 *
 * Ini satu-satunya cara jujur melihat MIME + ukuran bytes yang benar-benar
 * diterima browser, tanpa mengurangi jalur unduhan yang sedang dibuktikan:
 * `createObjectURL` hanya dibaca, `click()` anchor tetap jalan, dan file tetap
 * dibaca dari disk.
 */
export async function recordDownloadBlobs(
  page: Page,
): Promise<() => Promise<RecordedBlob[]>> {
  await page.evaluate(() => {
    const record: RecordedBlob[] = [];
    (window as unknown as { __sidakBlobs: RecordedBlob[] }).__sidakBlobs =
      record;
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob) => {
      record.push({ type: blob.type, size: blob.size });
      return create(blob);
    };
  });
  return () =>
    page.evaluate(
      () =>
        (window as unknown as { __sidakBlobs: RecordedBlob[] }).__sidakBlobs,
    );
}

/**
 * Fail-closed: PDF harus punya blok teks di SETIAP halaman (bukan gambar).
 * Operator teks dibaca dari content stream yang sudah didekompresi, karena PDF
 * uncompressed maupun terkompresi tidak pernah menampilkannya di byte mentah.
 */
export function expectTextBasedPdf(
  bytes: Buffer,
  pdfPages: { texts: string[]; contents: string[] },
) {
  const raw = bytes.toString("latin1");
  expect(
    /\/Subtype\s*\/?Image/.test(raw),
    "PDF tidak boleh berupa gambar penuh (raster); teks harus selectable",
  ).toBe(false);
  expect(
    pdfPages.contents.length,
    "tidak ada content stream per halaman untuk diperiksa",
  ).toBe(pdfPages.texts.length);
  const pagesWithoutTextOperator = pdfPages.contents.filter(
    (content) => !/\bBT\b[\s\S]*?\bTj\b/.test(content),
  ).length;
  expect(
    pagesWithoutTextOperator,
    `halaman tanpa operator teks (BT ... Tj): ${pagesWithoutTextOperator} dari ${pdfPages.contents.length}`,
  ).toBe(0);
  expect(
    pdfPages.texts.filter((text) => text.trim() === "").length,
    "ada halaman PDF tanpa teks: bisa jadi konten terpotong atau font gagal",
  ).toBe(0);
}

/** Footnote penanda footer: satu per halaman, "Halaman X dari N". */
export function expectPageFooters(pages: readonly string[]) {
  pages.forEach((text, index) => {
    expect(
      printedIncludes(text, `Halaman ${index + 1} dari ${pages.length}`),
      `halaman ${index + 1} tidak punya footer "Halaman ${index + 1} dari ${pages.length}"; read-back: ${text.slice(0, 200)}`,
    ).toBe(true);
  });
}
