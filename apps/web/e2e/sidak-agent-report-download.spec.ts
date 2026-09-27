import {
  expect,
  test,
  type Download,
  type Page,
} from "@playwright/test";
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import {
  AGENT_NAME,
  APP_ORIGIN,
  DEGENERATE_SERIES_LABEL,
  EMPTY_AGENT_ID,
  EMPTY_AGENT_NAME,
  TIE_AGENT_ID,
  TIE_AGENT_NAME,
  GAP_TREND_AGENT_ID,
  HOSTILE_SERIES_LABEL,
  GAP_TREND_AGENT_NAME,
  SINGLE_POINT_TREND_AGENT_ID,
  SINGLE_POINT_TREND_AGENT_NAME,
  CHAT_TICKET_A,
  CHAT_TICKET_B,
  CLEAN_SESSION_TICKET,
  EXPORT_ERROR_TITLE,
  FORMULA_SAMPLES,
  HOSTILE_FINDING_TEXT,
  HOSTILE_RECOMMENDATION_TEXT,
  INDICATOR_NAME,
  LONG_TEXT_AGENT_ID,
  LONG_TEXT_AGENT_NAME,
  LONG_TEXT_HEAD,
  LONG_TEXT_TAIL,
  LONG_TEXT_TICKET,
  LONG_TEXT_TICKET_2,
  LONG_UNBREAKABLE_TOKEN,
  REAL_TICKET,
  REMOTE_RESOURCE_PATTERNS,
  REPORT_FACTS,
  SECOND_AGENT_ID,
  UNSAFE_NAME,
  UNSAFE_NAME_FILE_PART,
  UNSUPPORTED_IN_TOKEN,
  UNSUPPORTED_IN_TOKEN_ASCII_HEAD,
  UNSUPPORTED_IN_TOKEN_ASCII_TAIL,
  UNSUPPORTED_SAMPLE_CODE_POINTS,
  UNSUPPORTED_SAMPLE_PAIRS,
  UNSUPPORTED_UNICODE_TEXT,
  YEAR,
  assertLocalDevOnlyTarget,
  captureViewportShot,
  drainAudits,
  expectNoApplicationTraffic,
  expectNoHorizontalOverflow,
  expectNoOfflineEgress,
  exportFromMenu,
  formatAudit,
  installOfflineEgressGuard,
  missingFacts,
  openAgentDetail,
  readReportOffline,
  reportArtifactDir,
  startAudit,
  unsupportedMarker,
  type ExportedFile,
} from "./helpers/sidakAgentReportFixture";

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
 * `sidak-reports-data.spec.ts`):
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
 *   4. Bukti isolasi diuji oleh dua test "Guard ..." di bawah, bukan hanya
 *      diklaim: salah satu memakai listener loopback standing-in dan membuktikan
 *      tidak ada byte yang sampai ke socket.
 */



/** BOM UTF-8 = EF BB BF; spreadsheet/MD/HTML butuh ini agar karakter awal aman. */
function expectUtf8Bom(file: ExportedFile) {
  expect(
    [...file.bytes.subarray(0, 3)],
    `${file.filename} harus ber-BOM UTF-8 (EF BB BF), byte pertama: ${file.bytes
      .subarray(0, 6)
      .toString("hex")}`,
  ).toEqual([0xef, 0xbb, 0xbf]);
}

/**
 * Baris sebuah seksi CSV: baris header skema diikutkan, lalu baris data sampai
 * baris kosong atau baris seksi berikutnya. Skema multi-seksi yang disengaja
 * (keputusan Fajar: CSV tetap multi-seksi) dibaca apa adanya, bukan
 * dinormalkan menjadi tabel tunggal.
 */
function csvSectionRows(text: string, sectionName: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `# ${sectionName}`);
  expect(
    start,
    `seksi CSV "# ${sectionName}" tidak ada`,
  ).toBeGreaterThanOrEqual(0);
  const rows: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.startsWith("# ")) break;
    rows.push(line);
  }
  return rows;
}

/** Baris header skema (elemen pertama) sebuah seksi CSV. */
function csvSectionHeaderRow(text: string, sectionName: string): string {
  const [header] = csvSectionRows(text, sectionName);
  return header;
}

/**
 * Urutan seksi CSV setelah blok profil, apa adanya. Ini kontrak skema yang
 * tidak boleh berubah: menambah cakupan tidak boleh menambah/menggeser/mengubah
 * seksi maupun baris header skema.
 */
function csvSectionNames(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => line.startsWith("# "))
    .map((line) => line.slice(2).trim())
    .filter((name) => !name.startsWith("Laporan Audit Agent -"));
}

/** Kontrak skema enam seksi + baris header kolomnya. */
const CSV_SECTION_SCHEMA: ReadonlyArray<readonly [string, string]> = [
  [
    "Ringkasan Skor Bulanan",
    "Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan",
  ],
  [
    "Detail Temuan",
    "Bulan,Tahun,Indikator,Kategori,Nilai,Ketidaksesuaian,Sebaiknya,No Tiket",
  ],
  [
    "Tiket Pengurang Skor Terbesar",
    "No Tiket,Score Deduction,Jumlah Temuan,Parameter Terberat",
  ],
  [
    "Akar Masalah",
    "Label,Prioritas,Jumlah Temuan,Tiket Terdampak,Temuan Critical,Rata-rata Nilai,Rekomendasi",
  ],
  ["Perkembangan Skor", `Periode,Total Temuan,${INDICATOR_NAME}`],
  [
    "Perbandingan Temuan",
    "Parameter,Agent Ini,Rata-rata Tim,Rata-rata Service",
  ],
];

function expectCsvSectionSchema(text: string) {
  expect(csvSectionNames(text)).toEqual(
    CSV_SECTION_SCHEMA.map(([name]) => name),
  );
  for (const [name, header] of CSV_SECTION_SCHEMA) {
    expect(csvSectionHeaderRow(text, name), `header seksi "${name}"`).toBe(
      header,
    );
  }
}

/**
 * Parser RFC4180 minimal, berdiri sendiri. Tujuannya BUKAN merekonstruksi tabel
 * (CSV ini multi-seksi secara sengaja), melainkan membuktikan dua hal pada file
 * yang benar-benar diunduh: tidak ada tanda kutip yang menggantung (satu karakter
 * terlewat membuat seluruh file tak terbaca spreadsheet), dan nilai yang berisi
 * kutip kembali utuh setelah di-parse.
 */
function parseCsvRecords(text: string): {
  records: string[][];
  unterminated: boolean;
} {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char !== '"') {
        field += char;
      } else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = false;
      }
      continue;
    }
    if (char === '"') inQuotes = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return { records, unterminated: inQuotes };
}

function expectCsvParseable(file: ExportedFile): string[][] {
  const { records, unterminated } = parseCsvRecords(file.text);
  expect(
    unterminated,
    `${file.filename} punya tanda kutip menggantung — spreadsheet akan gagal mem-parse seluruh file`,
  ).toBe(false);
  expect(records.length).toBeGreaterThan(10);
  return records;
}

// ---------------------------------------------------------------------------
// Invarian formula spreadsheet (data-integrity CSV)
// ---------------------------------------------------------------------------

/**
 * Pemicu formula. Kalau karakter pertama sebuah sel adalah salah satunya,
 * spreadsheet bisa memperlakukan sel itu sebagai formula — bukan sebagai teks.
 * Hasil audit: pengapitan tanda kutip BUKAN netralisasi, jadi yang diuji di
 * sini adalah karakter pertamanya, bukan tanda kutipnya.
 */
const FORMULA_TRIGGERS: readonly string[] = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Angka biasa (tanda opsional) bukan formula: sel seperti `-1.5` atau `+3`
 * HARUS tetap angka di spreadsheet. Eksempsi ini yang menjaga kolom numerik
 * tidak berubah jenis datanya.
 */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Penanda netralisasi formula yang harus disisipkan exporter. Bentuknya
 * diikat di sini supaya test benar-benar mengukur keputusan implementasi, bukan
 * "ada karakter apa pun di depan nilai"; motif dan alasannya ada di
 * `apps/web/src/utils/exportAgentReport.ts`.
 */
const CSV_FORMULA_PREFIX = "[teks] ";

/**
 * Semua field hasil-parse yang masih diawali pemicu formula, apa adanya.
 *
 * Dipakai sebagai invarian SELURUH FILE, bukan cuma sel fixture: sel
 * bermasalah harus ditemukan dari mana saja asalnya, termasuk dari nama agen,
 * nomor tiket, atau label akar masalah.
 */
function csvFormulaRiskyFields(records: string[][]): string[] {
  const risky: string[] = [];
  for (const record of records) {
    for (const field of record) {
      if (field === "" || PLAIN_NUMBER.test(field)) continue;
      if (FORMULA_TRIGGERS.includes(field[0])) risky.push(field);
    }
  }
  return risky;
}

/**
 * Semua field hasil parse yang BERAKHIRAN nilai contoh. Pencarian lewat suffix
 * (bukan kesamaan penuh) supaya sel yang sudah dinetralisasi pun ikut ketemu;
 * pemeriksaannya nanti memeriksa bahwa bagian sebelum nilai itu persis satu
 * penanda, sehingga prefiks tidak bisa berupa apa pun yang lain.
 */
function csvCellsEndingWith(records: string[][], suffix: string): string[] {
  return records.flat().filter((field) => field.endsWith(suffix));
}

/**
 * Baris komentar cakupan tepat sebelum heading seksi (`// Cakupan: ...`).
 * Cakupan adalah metadata dokumen di batas non-tabel, bukan kolom tabel, jadi
 * `csvSectionRows` tidak menghitungnya sebagai baris data.
 */
function csvSectionScope(text: string, sectionName: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === `# ${sectionName}`);
  expect(start, `seksi CSV "# ${sectionName}" tidak ada`).toBeGreaterThan(0);
  return lines[start - 1].startsWith("//") ? lines[start - 1] : null;
}

/** Baris cakupan (`_Cakupan: ..._`) tepat setelah heading `##` sebuah blok MD. */
function mdSectionScope(text: string, heading: string): string | null {
  const lines = text.split("\n");
  const start = lines.indexOf(`## ${heading}`);
  expect(start, `heading MD "## ${heading}" tidak ada`).toBeGreaterThanOrEqual(0);
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    if (line.startsWith("_") && line.endsWith("_") && line.length > 2) {
      return line;
    }
  }
  return null;
}

/** Tag/tabel yang boleh self-contained: HTML export tidak boleh menarik resource remote. */

// ═══════════════════════════════════════════════════════════════════════════
// FASE 3 — HTML Statis & HTML Interaktif sebagai laporan profesional.
// Plan: `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md` Fase 3.
//
// Semua kontrak fase ini diukur dari FILE YANG DIUNDUH, dibuka offline lewat
// `file://` di konteks browser TERPISA (tanpa mock app, tanpa network guard),
// lalu diamati lewat perilaku yang bisa dilihat pembaca: tidak ada kontrol
// palsu, isi kedua varian sama, navigasi tab jalan dari keyboard, cetak
// membuka semua bagian, dan tabel data tren benar-benar bisa diakses.
//
// Yang SENGAJA tidak diuji: kesamaan piksel dengan aplikasi, ukuran font
// tertentu, atau hex warna tertentu. Ukuran|score|warna adalah detail visual
// yang boleh berubah; kontrak fase ini adalah perilaku & isi.
// ═══════════════════════════════════════════════════════════════════════════


/**
 * Papan kontrol UI yang tidak mungkin bekerja pada file unduhan offline.
 *
 * `variant` menentukan varian mana yang wajib bebas dari papan kontrol itu:
 * `<button>`/:role=tab` sah di varian interaktif (memang bekerja), tetapi di
 * varian statis keduanya adalah kontrol palsu.
 */
const FAUX_CHROME: ReadonlyArray<{
  pattern: RegExp;
  label: string;
  variant: "static" | "both";
}> = [
  { pattern: /Unduh Laporan/, label: "tombol 'Unduh Laporan'", variant: "both" },
  { pattern: /Input Audit/, label: "tombol 'Input Audit'", variant: "both" },
  { pattern: /Muat ulang/, label: "kontrol 'Muat ulang'", variant: "both" },
  { pattern: /<select\b/i, label: "<select> non-fungsional", variant: "both" },
  { pattern: /\sdisabled(\s|=|\/)/i, label: "atribut disabled", variant: "both" },
  { pattern: /<img\b/i, label: "<img> (avatar remote)", variant: "both" },
  { pattern: /<button\b/i, label: "<button>", variant: "static" },
  { pattern: /role="tab(list)?"/, label: "ARIA tab tanpa perilaku", variant: "static" },
];


/**
 * Kemunculan fakta di cetakan. PDF menyimpan teks per glyph dan kehilangan
 * spasi di ujung baris saat teks terlipat, jadi kemunculan diuji pada teks yang
 * whitespace-nya dibuang. Yang dibuktikan adalah "fakta ini ikut tercetak",
 * bukan di mana barisnya terpenggal.
 */
function printedIncludes(text: string, fact: string): boolean {
  return text.replace(/\s+/g, "").includes(fact.replace(/\s+/g, ""));
}

function missingPrintedFacts(text: string): string[] {
  return REPORT_FACTS.filter((fact) => !printedIncludes(text, fact));
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
function readPrintedMarkers(text: string): PrintedMarkers {
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
function printedReadBack(pages: readonly string[]): string {
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
function readPdfPages(bytes: Buffer): { texts: string[]; contents: string[] } {
  const raw = bytes.toString("latin1");

  const objectStart = new Map<number, number>();
  const objectPattern = /(?:^|[\s>])(\d+)\s+0\s+obj\b/g;
  let objectMatch: RegExpExecArray | null;
  while ((objectMatch = objectPattern.exec(raw))) {
    objectStart.set(Number(objectMatch[1]), objectMatch.index + objectMatch[0].length);
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
    pageObjects = [...kids[1].matchAll(/(\d+)\s+0\s+R/g)].map(
      (match) => Number(match[1]),
    );
  }
  if (pageObjects.length === 0) return { texts: [], contents: [] };

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
    for (const match of /\/Font\s*<<([\s\S]*?)>>/.exec(resources)?.[1]?.matchAll(
      /\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g,
    ) ?? []) {
      fonts.set(match[1], cmapOf(Number(match[2])));
    }
    return { content, text: decodeContentText(content, fonts) };
  });

  return {
    texts: pages.map((page) => page.text),
    // Content stream yang SUDAH didekompresi. PDF bisa memakai kompresi
    // Flate, jadi operator teks tidak pernah terlihat di byte mentah.
    contents: pages.map((page) => page.content),
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
  for (let code = 0x20; code <= 0x7e; code += 1) map.set(code, String.fromCharCode(code));
  for (let code = 0xa0; code <= 0xff; code += 1) map.set(code, String.fromCharCode(code));
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
      const octal = body.slice(index, index + 3).match(/^[0-7]{1,3}/)?.[0] ?? next;
      bytes.push(parseInt(octal, 8) & 0xff);
      index += octal.length - 1;
      continue;
    }
    bytes.push(next.charCodeAt(0) & 0xff);
  }
  return bytes;
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
async function capturePrintOutput(
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
      .map(
        (text, index) =>
          `=== PAGE ${index + 1} ===\n${text}`,
      )
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
function expectNoBom(file: ExportedFile) {
  expect(
    file.bytes.subarray(0, 3).toString("hex"),
    `${file.filename} tidak boleh ber-BOM (EF BB BF) — format biner`,
  ).not.toBe("efbbbf");
}

/** Isi kamus `/Info` PDF: judul, subjudul, penulis, pembuat, produser. */
function readPdfInfo(bytes: Buffer): Record<string, string> {
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
async function recordDownloadBlobs(
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
      () => (window as unknown as { __sidakBlobs: RecordedBlob[] }).__sidakBlobs,
    );
}

/**
 * Fail-closed: PDF harus punya blok teks di SETIAP halaman (bukan gambar).
 * Operator teks dibaca dari content stream yang sudah didekompresi, karena PDF
 * uncompressed maupun terkompresi tidak pernah menampilkannya di byte mentah.
 */
function expectTextBasedPdf(
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
function expectPageFooters(pages: readonly string[]) {
  pages.forEach((text, index) => {
    expect(
      printedIncludes(text, `Halaman ${index + 1} dari ${pages.length}`),
      `halaman ${index + 1} tidak punya footer "Halaman ${index + 1} dari ${pages.length}"; read-back: ${text.slice(0, 200)}`,
    ).toBe(true);
  });
}

test.describe("SIDAK agent report download nyata", () => {
  // Fail-closed SEBELUM test pertama: target harus terbukti dev-server lokal.
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.afterEach(() => {
    for (const audit of drainAudits()) {
      console.log(formatAudit(audit));
    }
  });

  test("Menu Unduh Laporan menghasilkan CSV asli: nama file, BOM, isi, dan scope", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "CSV");

    // (1) Nama file dari state UI (nama agen + tahun audit terpilih).
    expect(file.filename).toBe(`Laporan_Audit_${AGENT_NAME}_${YEAR}.csv`);

    // (2) BOM.
    expectUtf8Bom(file);

    // (3) Blok profil: identitas dari fixture, tahun dari context UI.
    expect(
      file.text.startsWith(`# Laporan Audit Agent - ${AGENT_NAME}\n`),
    ).toBe(true);
    expect(file.text).toContain("Nama,Alya Pranoto\n");
    expect(file.text).toContain("Tim,Tim Call\n");
    expect(file.text).toContain("Batch,Batch 7\n");
    // `Masa Kerja` dihitung dari tanggal hari ini, jadi labelnya saja yang
    // diassert; nilainya tidak boleh dikarang di test.
    expect(file.text).toMatch(/^Masa Kerja,.+$/m);
    expect(file.text).toContain(`Tahun Laporan,${YEAR}\n`);

    // (4) Ringkasan bulanan: kedua bulan, angka dari fixture.
    expect(csvSectionRows(file.text, "Ringkasan Skor Bulanan")).toEqual([
      "Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan",
      "01/2026,82,84,80,1,0",
      "02/2026,91,92,90,2,1",
    ]);

    // (5) Detail temuan: satu baris riil,/teks berbahaya tetap ter-quote dan
    //     kutip ganda digandakan (baris utuh, bukan terpotong newline).
    const temuanRows = csvSectionRows(file.text, "Detail Temuan");
    expect(temuanRows).toHaveLength(2);
    expect(temuanRows[0]).toBe(
      "Bulan,Tahun,Indikator,Kategori,Nilai,Ketidaksesuaian,Sebaiknya,No Tiket",
    );
    const temuanRow = temuanRows[1];
    expect(
      temuanRow.startsWith(
        `Februari,${YEAR},${INDICATOR_NAME},critical,1 (TIDAK SESUAI),"`,
      ),
    ).toBe(true);
    expect(temuanRow.endsWith(`,${REAL_TICKET}`)).toBe(true);
    // Tanda kutip di dalam teks menjadi `""`; koma membuat sel terbungkus `"`.
    expect(temuanRow).toContain('"" tenor 12 bulan""');
    expect(temuanRow).toContain(HOSTILE_FINDING_TEXT.replace(/"/g, '""'));

    // (6) Tiket pengurang skor + akar masalah tetap ikut untuk bulan terpilih.
    //     Nilai dediksi dihitung hook dari bobot indikator, jadi bentuknya
    //     (satu desimal, jumlah temuan, parameter terberat) yang diassert.
    const ticketRows = csvSectionRows(
      file.text,
      "Tiket Pengurang Skor Terbesar",
    );
    expect(ticketRows[0]).toBe(
      "No Tiket,Score Deduction,Jumlah Temuan,Parameter Terberat",
    );
    expect(ticketRows).toHaveLength(2);
    expect(ticketRows[1]).toMatch(
      new RegExp(`^${REAL_TICKET},\\d+\\.\\d,1,${INDICATOR_NAME}$`),
    );
    expect(csvSectionRows(file.text, "Akar Masalah")[0]).toContain(
      "Label,Prioritas",
    );
    expect(file.text).toContain("Akurasi jawaban");

    // (7) Tren + benchmark, dan label cakupan benchmark.
    const trendRows = csvSectionRows(file.text, "Perkembangan Skor");
    expect(trendRows[0]).toBe(`Periode,Total Temuan,${INDICATOR_NAME}`);
    expect(trendRows.slice(1)).toEqual(["Jan,0,0", "Feb,1,1"]);
    const comparisonRows = csvSectionRows(file.text, "Perbandingan Temuan");
    expect(comparisonRows[0]).toBe(
      "Parameter,Agent Ini,Rata-rata Tim,Rata-rata Service",
    );
    expect(comparisonRows.slice(1)).toEqual([
      "Total Temuan,1,2,3",
      `${INDICATOR_NAME},1,1,2`,
    ]);

    // (8) Keputusan Fajar: sesi tanpa temuan tidak diekspor.
    expect(file.text).not.toContain(CLEAN_SESSION_TICKET);

    expectNoApplicationTraffic(audit);
  });

  test("Menu Unduh Laporan menghasilkan Markdown asli dengan heading dan cakupan benchmark", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "Markdown");

    expect(file.filename).toBe(`Laporan_Audit_${AGENT_NAME}_${YEAR}.md`);
    expectUtf8Bom(file);

    // Struktur dokumen: judul + satu `##` per blok laporan.
    expect(file.text).toContain(`# Laporan Audit Agent: ${AGENT_NAME}`);
    for (const heading of [
      "## Profil Agent",
      "## Ringkasan Skor Bulanan",
      "## Detail Temuan",
      "## Tiket Pengurang Skor Terbesar",
      "## Akar Masalah",
      "## Perkembangan Skor",
      "## Perbandingan Temuan",
    ]) {
      expect(file.text, `heading hilang: ${heading}`).toContain(heading);
    }

    // Isi: baris bulanan, temuan, tiket, akar masalah, tren.
    expect(file.text).toContain("| 01/2026 | 82 | 84 | 80 | 1 | 0 |");
    expect(file.text).toContain("| 02/2026 | 91 | 92 | 90 | 2 | 1 |");
    expect(file.text).toContain(
      `| Februari | ${YEAR} | ${INDICATOR_NAME} | critical | 1 (TIDAK SESUAI) |`,
    );
    // Sel tabel yang berisi koma DAN `|` harus tetap utuh sebagai satu sel:
    // di Markdown, `|` adalah PEMBATAS KOLOM, jadi kalau tidak di-escape satu
    // catatan agen memecah baris tabel menjadi kolom palsu.
    expect(file.text).toContain(HOSTILE_FINDING_TEXT.replace("|", "\\|"));
    expect(file.text, "pipe di dalam nilai harus di-escape di MD").not.toContain(
      HOSTILE_FINDING_TEXT,
    );
    expect(file.text).toMatch(
      new RegExp(
        `\\| 1 \\| ${REAL_TICKET} \\| \\d+\\.\\d \\| 1 \\| ${INDICATOR_NAME} \\|`,
      ),
    );
    expect(file.text).toContain("### Akurasi jawaban");
    expect(file.text).toContain("- **Prioritas**: 6");
    expect(file.text).toContain("| Feb | 1 | 1 |");

    // Scope benchmark: bulan, tahun, layanan, tim — dari `comparisonTable.scope`.
    expect(file.text).toContain(`_Jan-Feb ${YEAR} • Layanan Call • Tim Call_`);

    // Keputusan Fajar: sesi tanpa temuan tidak diekspor.
    expect(file.text).not.toContain(CLEAN_SESSION_TICKET);

    expectNoApplicationTraffic(audit);
  });

  test("Menu Unduh Laporan menghasilkan HTML Statis self-contained dengan semua panel terbuka", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Statis");

    expect(file.filename).toBe(
      `Laporan_Audit_${AGENT_NAME}_${YEAR}.statis.html`,
    );
    expectUtf8Bom(file);

    // Varian statis: semua panel audit terbuka (tidak ada `hidden`).
    expect(file.text).toContain('data-report-variant="static"');
    expect(file.text).not.toMatch(/data-report-panel="[a-z]+"[^>]*\shidden/);
    expect(file.text).toContain('<details class="findings-period" open>');

    // Identitas + scope dari state UI.
    expect(file.text).toContain(`<title>Laporan Audit - ${AGENT_NAME}</title>`);
    // Cakupan dokumen dinyatakan sebagai teks biasa (bukan kontrol select palsu).
    expect(file.text).toContain(`Tahun ${YEAR} • Layanan CALL`);
    expect(file.text).toContain("Layanan audit</dt>");

    // Isi laporan benar-benar ada, bukan kerangka kosong.
    expect(file.text).toContain("Ringkasan Skor Bulanan");
    expect(file.text).toContain("Riwayat Temuan");
    expect(file.text).toContain(REAL_TICKET);
    expect(file.text).toContain("Akurasi jawaban");

    // Markup berbahaya dari fixture di-escape, tidak pernah jadi elemen.
    expect(file.text).toContain("&lt;script&gt;");
    expect(file.text).not.toContain("<script>alert");

    // Self-contained: tidak menarik resource remote untuk render.
    for (const pattern of REMOTE_RESOURCE_PATTERNS) {
      expect(
        pattern.test(file.text),
        `HTML Statis menarik resource remote (${pattern}) — harus offline-safe`,
      ).toBe(false);
    }

    // Keputusan Fajar: sesi tanpa temuan tidak diekspor.
    expect(file.text).not.toContain(CLEAN_SESSION_TICKET);

    expectNoApplicationTraffic(audit);
  });

  test("Menu Unduh Laporan menghasilkan HTML Interaktif dengan tab dan hanya satu panel terbuka", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Interaktif");

    expect(file.filename).toBe(
      `Laporan_Audit_${AGENT_NAME}_${YEAR}.interaktif.html`,
    );
    expectUtf8Bom(file);

    // Varian interaktif: tab nyata, Ringkasan default, panel lain tersembunyi.
    expect(file.text).toContain('data-report-variant="interactive"');
    expect(file.text).toContain(
      'data-report-tab="summary" aria-selected="true"',
    );
    expect(file.text).toContain(
      'data-report-tab="temuan" aria-selected="false"',
    );
    expect(file.text).toMatch(/data-report-panel="temuan"[^>]*\shidden/);
    expect(file.text).toMatch(/data-report-panel="trend"[^>]*\shidden/);
    // Disclosure temuan tertutup secara default (bukan `open`).
    expect(file.text).toContain('<details class="findings-period">');
    // Interaktivitas inline, bukan fetch resource luar.
    expect(file.text).toContain("<script>");
    for (const pattern of REMOTE_RESOURCE_PATTERNS) {
      expect(
        pattern.test(file.text),
        `HTML Interaktif menarik resource remote (${pattern}) — harus offline-safe`,
      ).toBe(false);
    }

    // Konten tetap sama dengan statis: identitas, scope, temuan, akar masalah.
    expect(file.text).toContain(`Tahun ${YEAR} • Layanan CALL`);
    expect(file.text).toContain(REAL_TICKET);
    expect(file.text).toContain("Akurasi jawaban");
    expect(file.text).toContain("&lt;script&gt;");
    expect(file.text).not.toContain("<script>alert");

    // Keputusan Fajar: sesi tanpa temuan tidak diekspor.
    expect(file.text).not.toContain(CLEAN_SESSION_TICKET);

    expectNoApplicationTraffic(audit);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3 — dua HTML profesional: isi sama, tanpa kontrol palsu, tab
  // accessible dari keyboard, cetak membuka semua bagian.
  // ═══════════════════════════════════════════════════════════════════════

  test("HTML Statis adalah dokumen baca: tanpa kontrol palsu, semua bagian terbuka, dan tidak meluber horizontal", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Statis", "fase3-statis");
    const dir = reportArtifactDir("statis");

    // (1) Tidak ada satu pun kontrol yang tidak bisa bekerja pada file offline.
    for (const rule of FAUX_CHROME) {
      expect(
        rule.pattern.test(file.text),
        `HTML Statis masih memuat ${rule.label} (${rule.pattern})`,
      ).toBe(false);
    }
    // Varian statis tidak boleh berpura-pura punya tab: tanpa `role="tab"`
    // yang tidak punya perilaku, pembaca akan hearing kontrol tak berguna.
    expect(
      file.text,
      "HTML Statis tidak boleh punya panel tersembunyi",
    ).not.toMatch(/data-report-panel="[a-z]+"[^>]*\shidden/);

    // (2) Offline: dokumen benar-benar terbuka dan tidak menarik apa pun.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;

      expect(
        missingFacts(offline.state.text),
        "fakta laporan hilang di HTML Statis",
      ).toEqual([]);
      expectNoOfflineEgress(offline, "HTML Statis");
      expect(
        offline.consoleErrors,
        `error saat membuka offline: ${offline.consoleErrors.join(" | ")}`,
      ).toEqual([]);

      // (3) Semuanya terbaca: identitas, tabel bulanan, temuan, akar masalah —
      //     tanpa perlu klik dan tanpa JavaScript sama sekali.
      await expect(document.getByRole("heading", { level: 1 })).toHaveText(AGENT_NAME);
      await expect(document.getByText(REAL_TICKET).first()).toBeVisible();
      await expect(document.getByText("Akurasi jawaban").first()).toBeVisible();
      await expect(
        document.getByText(HOSTILE_FINDING_TEXT).first(),
        "teks temuan berbahaya harus tampil sebagai teks, bukan dieksekusi",
      ).toBeVisible();
      expect(
        await document.locator("script").count(),
        "HTML Statis tidak boleh menjalankan JavaScript apa pun",
      ).toBe(0);
      // Tabel bulanan dan tabel data tren bukan sekadar ada: keduanya terlihat.
      const monthlyTable = document.getByRole("table", {
        name: /Ringkasan Skor Bulanan/i,
      });
      await expect(monthlyTable).toBeVisible();
      await expect(monthlyTable).toContainText("01/2026");
      await expect(monthlyTable).toContainText("02/2026");
      await expect(document.getByRole("table", { name: /Data tren/i })).toBeVisible();

      // (4) Tidak meluber horizontal di mobile maupun desktop.
      await captureViewportShot(document, dir, "statis-1440.png", {
        width: 1440,
        height: 1000,
      });
      await expectNoHorizontalOverflow(document, "HTML Statis 1440");
      await captureViewportShot(document, dir, "statis-390.png", {
        width: 390,
        height: 844,
      });
      await expectNoHorizontalOverflow(document, "HTML Statis 390");
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });

  test("HTML Statis dan HTML Interaktif menyajikan isi yang sama dari file yang diunduh", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const staticFile = await exportFromMenu(page, "HTML Statis", "fase3-parity");
    const interactiveFile = await exportFromMenu(
      page,
      "HTML Interaktif",
      "fase3-parity",
    );

    const offlineOf = async (file: ExportedFile) => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      try {
        const offline = await readReportOffline(context, file);
        await expectNoHorizontalOverflow(offline.page, `${file.filename} 1440`);
        return offline;
      } finally {
        await context.close();
      }
    };

    const staticOffline = await offlineOf(staticFile);
    const interactiveOffline = await offlineOf(interactiveFile);

    // (1) Isi yang sama: setiap fakta data ada di kedua dokumen, tidak ada
    //     fakta yang hanya muncul di satu varian.
    expect(missingFacts(staticOffline.state.text)).toEqual([]);
    expect(missingFacts(interactiveOffline.state.text)).toEqual([]);

    // (2) Kerangka yang sama: jumlah/urutan bagian dan seluruh heading editorial
    //     identik, jadi tidak ada konten yang hilang di salah satu varian.
    expect(interactiveOffline.state.panels).toBe(staticOffline.state.panels);
    expect(interactiveOffline.state.panelKeys).toEqual(staticOffline.state.panelKeys);
    expect(interactiveOffline.state.panelSections).toEqual(
      staticOffline.state.panelSections,
    );
    for (const key of ["summary", "trend", "temuan"]) {
      expect(
        staticOffline.state.panelKeys,
        `bagian "${key}" harus ada di kedua varian`,
      ).toContain(key);
    }
    expect(interactiveOffline.state.headings).toEqual(staticOffline.state.headings);

    // (3) Keduanya offline-safe dan bebas error konsol.
    for (const offline of [staticOffline, interactiveOffline]) {
      expectNoOfflineEgress(offline, `${offline.page.url()}`);
      expect(
        offline.consoleErrors,
        `${offline.page.url()} error saat dibuka offline: ${offline.consoleErrors.join(" | ")}`,
      ).toEqual([]);
    }
    for (const file of [staticFile, interactiveFile]) {
      for (const pattern of REMOTE_RESOURCE_PATTERNS) {
        expect(
          pattern.test(file.text),
          `${file.filename} menarik resource remote (${pattern}) — harus offline-safe`,
        ).toBe(false);
      }
    }

    // Keputusan Fajar: sesi tanpa temuan tidak pernah muncul di dokumen.
    for (const file of [staticFile, interactiveFile]) {
      expect(file.text, `${file.filename} memuat tiket sesi bersih`).not.toContain(
        CLEAN_SESSION_TICKET,
      );
      const text =
        file === staticFile
          ? staticOffline.state.text
          : interactiveOffline.state.text;
      expect(text, `${file.filename} memuat tiket sesi bersih`).not.toContain(
        CLEAN_SESSION_TICKET,
      );
    }

    expectNoApplicationTraffic(audit);
  });

  test("HTML Interaktif: tab keyboard-accessible, filter tren bekerja, dan cetak membuka semua bagian", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Interaktif", "fase3-interaktif");
    const dir = reportArtifactDir("interaktif");

    // Kontrol yang tersisa di varian interaktif HANYA yang benar-benar bekerja
    // (tab, filter, disclosure). Tidak ada yang meniru tombol aplikasi.
    for (const rule of FAUX_CHROME) {
      if (rule.variant !== "both") continue;
      expect(
        rule.pattern.test(file.text),
        `HTML Interaktif masih memuat ${rule.label} (${rule.pattern})`,
      ).toBe(false);
    }

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;
      expectNoOfflineEgress(offline, "HTML Interaktif");
      expect(
        offline.consoleErrors,
        `error saat membuka offline: ${offline.consoleErrors.join(" | ")}`,
      ).toEqual([]);

      // (1) Hanya satu panel terbuka pada satu waktu, Ringkasan sebagai default.
      const summaryPanel = document.getByRole("tabpanel", { name: "Ringkasan" });
      const trendPanel = document.getByRole("tabpanel", { name: "Tren" });
      const temuanPanel = document.getByRole("tabpanel", { name: "Temuan" });
      const summaryTab = document.getByRole("tab", { name: "Ringkasan" });
      const trenTab = document.getByRole("tab", { name: "Tren" });
      const temuanTab = document.getByRole("tab", { name: "Temuan" });
      await expect(summaryPanel).toBeVisible();
      await expect(trendPanel).toBeHidden();
      await expect(temuanPanel).toBeHidden();
      await expect(summaryTab).toHaveAttribute("tabindex", "0");

      // (2) Navigasi tab dari keyboard (pola APG): ArrowRight, End, Home, dengan
      //     roving tabindex sehingga hanya tab aktif yang di-tab.
      await summaryTab.focus();
      await document.keyboard.press("ArrowRight");
      await expect(trenTab).toHaveAttribute("aria-selected", "true");
      await expect(trenTab).toHaveAttribute("tabindex", "0");
      await expect(summaryTab).toHaveAttribute("tabindex", "-1");
      await expect(trendPanel).toBeVisible();
      await expect(summaryPanel).toBeHidden();

      await document.keyboard.press("End");
      await expect(temuanTab).toHaveAttribute("aria-selected", "true");
      await expect(temuanPanel).toBeVisible();
      await expect(trendPanel).toBeHidden();

      await document.keyboard.press("Home");
      await expect(summaryTab).toHaveAttribute("aria-selected", "true");
      await expect(summaryPanel).toBeVisible();

      // (3) Filter seri tren: tombol nyata dengan aria-pressed, dan grafik
      //     benar-benar menyaring seri (bukan hanya berubah warna tombol).
      await trenTab.click();
      const parameterFilter = document.getByRole("button", { name: INDICATOR_NAME });
      const parameterSeries = document.locator(
        '[data-chart-series][data-series-key="series-1"]',
      );
      const totalSeries = document.locator(
        '[data-chart-series][data-series-total="true"]',
      );
      await expect(parameterFilter).toHaveAttribute("aria-pressed", "false");
      await parameterFilter.click();
      await expect(parameterFilter).toHaveAttribute("aria-pressed", "true");
      await expect(parameterSeries.first()).toBeVisible();
      await expect(totalSeries.first()).toBeHidden();
      await parameterFilter.click();
      await expect(totalSeries.first()).toBeVisible();

      // (4) Grafik tetap bisa dibaca tanpa warna: tabel data tren terlihat,
      //     punya caption, dan memuat angka tiap periode.
      const trendTable = document.getByRole("table", { name: /Data tren/i });
      await expect(trendTable).toBeVisible();
      await expect(trendTable.locator("caption")).toBeVisible();
      await expect(trendTable).toContainText("Jan");
      await expect(trendTable).toContainText("Feb");
      await expect(
        document.getByRole("img", { name: /Grafik tren/i }),
      ).toBeVisible();

      // (5) Disclosure opsional: tertutup secara default tapi isinya nyata.
      await temuanTab.click();
      await expect(temuanPanel).toBeVisible();
      const findingsDisclosure = document.locator("details.findings-period").first();
      await expect(findingsDisclosure).toBeVisible();
      expect(
        await findingsDisclosure.evaluate((node) => node.hasAttribute("open")),
        "disclosure periode temuan harus tertutup secara default",
      ).toBe(false);
      await findingsDisclosure.locator("summary").click();
      await expect(findingsDisclosure).toHaveAttribute("open", "");
      await expect(
        findingsDisclosure.getByText(HOSTILE_FINDING_TEXT),
      ).toBeVisible();

      // (6) Cetak: semua bagian terbuka kembali, kontrol navigasi hilang, dan
      //     tabel tren tetap terbaca.
      await document.emulateMedia({ media: "print" });
      await expect(document.getByRole("tablist")).toBeHidden();
      await expect(summaryPanel).toBeVisible();
      await expect(trendPanel).toBeVisible();
      await expect(temuanPanel).toBeVisible();
      await expect(document.getByRole("table", { name: /Data tren/i })).toBeVisible();
      await expect(
        document.getByText(HOSTILE_FINDING_TEXT).first(),
        "pencetakan harus membuka disclosure yang tadinya tertutup",
      ).toBeVisible();
      await expectNoHorizontalOverflow(document, "HTML Interaktif print 1440");

      // (7) Artefak: viewport desktop/mobile + PDF A4 asli dari cetakan
      //     peramban, bukan potongan `clip` yang mengarang paginasi.
      await document.emulateMedia({ media: "screen" });
      await trenTab.click();
      await captureViewportShot(document, dir, "interaktif-1440.png", {
        width: 1440,
        height: 1000,
      });
      await expectNoHorizontalOverflow(document, "HTML Interaktif 1440");
      await captureViewportShot(document, dir, "interaktif-390.png", {
        width: 390,
        height: 844,
      });
      await expectNoHorizontalOverflow(document, "HTML Interaktif 390");
      await document.emulateMedia({ media: "print" });
      await capturePrintOutput(document, dir, "interaktif-print");
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 3 gate repair — pagination cetak dibaca dari PDF peramban.
  // ═══════════════════════════════════════════════════════════════════════

  test("Cetak laporan: tiga halaman A4, semua temuan ikut, dan tidak ada halaman terakhir khusus colophon", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Interaktif", "fase3-print");
    const dir = reportArtifactDir("print");

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;

      // Disclosure TEMUAN sengaja dibiarkan tertutup — persis seperti file
      // yang diunduh. Test sebelumnya membuka disclosure itu dengan klik
      // sebelum mencetak, jadi klaim "cetak membuka disclosure tertutup"
      // tidak pernah benar-benar diuji; di sini keadaan default ikut diuji.
      expect(
        await document
          .locator("details.findings-period")
          .first()
          .evaluate((node) => node.hasAttribute("open")),
        "fixture harus menguji disclosure yang tadinya tertutup",
      ).toBe(false);
      await expect(
        document.getByText(HOSTILE_FINDING_TEXT).first(),
        "default unduhan harus menyembunyikan temuan di balik disclosure tertutup",
      ).toBeHidden();

      // (1) Tidak ada kontrol navigasi yang ikut tercetak, dan tidak ada
      //     petunjuk "geser tabel" di atas kertas.
      await document.emulateMedia({ media: "print" });
      await expect(document.getByRole("tablist")).toBeHidden();
      await expect(document.locator(".table-hint")).toBeHidden();
      await expectNoHorizontalOverflow(document, "cetak 1440");

      // (2) Cetak sungguhan lewat `page.pdf()` (A4 + `@page` dokumen), lalu
      //     baca-balik teks tiap halaman dari PDF itu.
      const printed = await capturePrintOutput(document, dir, "cetak-interaktif");
      const pages = printed.pages;
      const lastPage = pages[pages.length - 1] ?? "";

      // Halaman A4 selalu punya isi; kalau decoder gagal, ini yang menggagalkan
      // test, bukan read-back yang lebih longgar.
      expect(
        pages.length,
        `PDF tidak terbaca per halaman: ${pages.length} halaman`,
      ).toBeGreaterThan(0);
      expect(
        pages.filter((text) => text.trim() === "").length,
        "ada halaman PDF kosong: rule @page atau isi dokumen rusak",
      ).toBe(0);
      // Decoder glyph harus benar-benar memetakan kode ke Unicode. Kalau
      // Chromium mengubah format PDF-nya, placeholder "?" muncul dan test gagal
      // di sini — bukan diam-diam lulus karena teksnya salah baca.
      expect(
        printedReadBack(pages).includes("?"),
        "decoder PDF gagal memetakan kode glyph ke Unicode; read-back tidak sah",
      ).toBe(false);

      // (3) Fixture ini harus 3 halaman A4, bukan 4. Angka ini terikat fixture
      //     (1 agen, 1 bulan ber-temuan, 1 akar masalah); kalau fixture
      //     berubah, assertion inilah yang menyesuaikan — kontrak di (4) dan
      //     (5) yang tidak bergantung pada jumlah halaman.
      expect(
        pages.length,
        "laporan+cetak+colophon harus muat 3 halaman A4; read-back:\n" +
          pages
            .map((text, index) => `[p${index + 1}] ${text}`)
            .join("\n"),
      ).toBe(3);

      // (4) Tidak ada halaman terakhir yang isinya HANYA colophon. Kandidat
      //     colophon = awalan. Kandidat isi = teks halaman yang bukan awal
      //     colophon, minimal 40 karakter supaya noise glyph tidak lolos.
      const colophonPrefix = `Laporan Audit SIDAK • ${AGENT_NAME}`;
      const nonColophonLength = (text: string) =>
        text.replace(colophonPrefix, "").replace(/[^A-Za-z0-9]/g, "").length;
      expect(
        nonColophonLength(lastPage),
        `halaman terakhir hanya berisi colophon; read-back: ${lastPage}`,
      ).toBeGreaterThanOrEqual(40);
      expect(
        printedIncludes(lastPage, colophonPrefix),
        `footer/colophon tidak ikut tercetak; read-back: ${lastPage}`,
      ).toBe(true);
      expect(
        pages.some((text) => printedIncludes(text, "Laporan Audit SIDAK")),
        "colophon hilang dari cetakan",
      ).toBe(true);

      // (5) Tidak ada isi yang hilang: semua fakta laporan harus ada di dalam
      //     PDF, termasuk isi disclosure tertutup. Ini yang membuat "3 halaman"
      //     bermakna — pemadatan tidak boleh memotong isi.
      const printedText = printedReadBack(pages);
      expect(
        missingPrintedFacts(printedText),
        "fakta laporan hilang dari cetakan",
      ).toEqual([]);
      for (const detail of [
        HOSTILE_FINDING_TEXT,
        HOSTILE_RECOMMENDATION_TEXT,
        REAL_TICKET,
        "Akurasi jawaban",
        "Keyword: tenor",
        "Ringkasan Skor Bulanan",
        "Data tren",
        "Perbandingan Temuan",
      ]) {
        expect(
          printedIncludes(printedText, detail),
          `bagian ini tidak tercetak: ${detail}`,
        ).toBe(true);
      }
      // Cakupan tidak berubah hanya karena dicetak: dokumen ini layanan CALL,
      // jadi temuan layanan CHAT tidak boleh bocor ke halaman kertas.
      for (const foreign of [
      CHAT_TICKET_A,
      CHAT_TICKET_B,
      CLEAN_SESSION_TICKET,
    ]) {
        expect(
          printedIncludes(printedText, foreign),
          `cetakan membocorkan data di luar cakupan: ${foreign}`,
        ).toBe(false);
      }

      // (6) Screenshot cetakan penuh (media print aktif) sebagai artefak visual
      //     tambahan. Pagination yang sah dibaca dari `printed.pages`, bukan
      //     dari tinggi dokumen.
      const shot = path.join(dir, "cetak-interaktif-full.png");
      await document.screenshot({ path: shot, fullPage: true });
      console.log(`[artifact] ${shot}`);
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });

  test("Petunjuk gulir tabel muncul di 390px, hilang di desktop, dan tidak ikut tercetak", async ({
    page,
    browser,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const file = await exportFromMenu(page, "HTML Interaktif", "fase3-scrollhint");
    const dir = reportArtifactDir("print");

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      const offline = await readReportOffline(context, file);
      const document = offline.page;
      const hint = document.locator(".table-hint");
      await expect(hint).toHaveCount(1);

      // Wrapper yang digulir adalah saudara langsung setelah petunjuk, jadi
      // keduanya diikat secara struktural: petunjuk tidak mungkin menempel
      // ke tabel lain.
      const benchmarkScrollBox = hint.locator("xpath=following-sibling::div[1]");

      // Tabel benchmark ada di panel Tren, yang tersembunyi pada tab default.
      // Petunjuk dinilai dari keadaan nyata pembaca: panel Tren terbuka.
      await document.getByRole("tab", { name: "Tren" }).click();
      await expect(
        document.getByRole("tabpanel", { name: "Tren" }),
      ).toBeVisible();

      // Petunjuk ini hanya berguna kalau tabelnya memang melebar di 390px.
      await document.setViewportSize({ width: 390, height: 844 });
      const benchmarkScroll = await benchmarkScrollBox.evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }));
      expect(
        benchmarkScroll.scrollWidth,
        `tabel benchmark tidak melebar di 390px (${benchmarkScroll.scrollWidth} <= ${benchmarkScroll.clientWidth}); petunjuk gulir akan berbohong`,
      ).toBeGreaterThan(benchmarkScroll.clientWidth);
      await expect(
        hint,
        "tabel benchmark menggulir di 390px tapi tidak ada petunjuknya",
      ).toBeVisible();
      await expectNoHorizontalOverflow(document, "HTML Interaktif 390 + petunjuk");
      // Artefak review: scroll ke petunjuk + tabel yang terpotong tepi kanan,
      // supaya affordance-nya terlihat, bukan hanya "ada di DOM".
      await hint.scrollIntoViewIfNeeded();
      const hintShot = path.join(dir, "scroll-hint-390.png");
      await document.screenshot({ path: hintShot, fullPage: false });
      console.log(`[artifact] ${hintShot}`);

      // Desktop: tidak ada ruang untuk petunjuk, jadi tidak ditampilkan —
      // dan tabelnya juga tidak lagi perlu digulir.
      await document.setViewportSize({ width: 1440, height: 1000 });
      await expect(
        hint,
        "petunjuk gulir tidak boleh muncul di desktop",
      ).toBeHidden();
      const desktopScroll = await benchmarkScrollBox.evaluate((node) => ({
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }));
      expect(
        desktopScroll.scrollWidth,
        `desktop: tabel benchmark tidak seharusnya melebar (${desktopScroll.scrollWidth} > ${desktopScroll.clientWidth})`,
      ).toBeLessThanOrEqual(desktopScroll.clientWidth);

      // Cetak: di atas kertas tabel tidak menggulir, jadi petunjuknya hilang
      // dan tidak memakan ruang halaman.
      await document.emulateMedia({ media: "print" });
      await expect(
        hint,
        "petunjuk gulir tidak boleh ikut tercetak",
      ).toBeHidden();

      expectNoOfflineEgress(offline, "HTML Interaktif");
    } finally {
      await context.close();
    }

    expectNoApplicationTraffic(audit);
  });

  test("Guard offline menutup egress pada konteks file:// sebelum navigasi", async ({
    browser,
  }) => {
    const audit = startAudit();

    // Listener standing-in di loopback: kalau guard bocor, bytes sampai ke sini
    // dan `hits` terisi. Sasarannya loopback, jadi test ini sendiri tidak
    // melakukan egress ke host mana pun.
    const hits: string[] = [];
    const listener = createServer((incoming, response) => {
      hits.push(`${incoming.method} ${incoming.url}`);
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("bocor");
    });
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address();
    const foreignOrigin =
      address && typeof address === "object"
        ? `http://127.0.0.1:${address.port}`
        : null;
    expect(foreignOrigin, "listener loopback tidak siap").not.toBeNull();

    // Dokumen yang benar-benar menarik resource jaringan, ditulis di artefak
    // luar repo supaya tidak ada file sementara di dalam repo. Dua sub-sumber
    // berbeda (gambar + skrip) supaya keduanya terisi, bukan cuma yang pertama.
    const documentPath = path.join(reportArtifactDir("offline-guard"), "luring.html");
    writeFileSync(
      documentPath,
      [
        "<!DOCTYPE html>",
        '<html lang="id"><head><title>luring</title></head><body>',
        `<img src="${foreignOrigin}/pixel.png" alt="">`,
        `<script src="${foreignOrigin}/skrip.js"></script>`,
        "</body></html>",
      ].join("\n"),
    );

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    try {
      // Guard dipasang lewat jalur produksi yang sama seperti
      // `readReportOffline`, dan dipasang SEBELUM `page.goto`.
      const blocked: string[] = [];
      await installOfflineEgressGuard(context, blocked);
      const page = await context.newPage();
      await page.goto(`file://${documentPath}`, { waitUntil: "load" });

      // (1) Guard mengklaim kedua request. Urutan intercept tidak dijamin, jadi
        //     yang dibandingkan adalah himpunannya, bukan urutannya.
      expect(
        [...blocked].sort(),
        `guard offline tidak mengklaim semua request: ${blocked.join(" | ")}`,
      ).toEqual(
        [
          `GET ${foreignOrigin}/pixel.png`,
          `GET ${foreignOrigin}/skrip.js`,
        ].sort(),
      );
      // (2) Bukti terkuat: tidak ada satu byte pun yang sampai ke soket nyata.
      expect(hits, `request bocor ke jaringan: ${hits.join(" | ")}`).toEqual([]);
    } finally {
      await context.close();
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => (error ? reject(error) : resolve()));
      });
    }

    expectNoApplicationTraffic(audit);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 2 — cakupan per seksi, pengecualian sesi bersih, nama file, error.

  // Plan: `.hermes/plans/2026-09-27_201056-sidak-agent-report-exports.md` Fase 2.
  // Semua lewat menu nyata + file yang diunduh; tidak ada panggilan generator
  // langsung. Opsi PDF sengaja TIDAK disentuh di fase ini.
  // ═══════════════════════════════════════════════════════════════════════

  test("CSV menyatakan cakupan tiap seksi dan skeletanya tetap enam seksi saat bulan berubah", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // Default: layanan Call, bulan terakhir = Februari.
    const feb = await exportFromMenu(page, "CSV", "csv-bulan-februari");
    expect(feb.filename).toBe(`Laporan_Audit_${AGENT_NAME}_${YEAR}.csv`);
    expectUtf8Bom(feb);
    expectCsvSectionSchema(feb.text);

    // Blok profil(key/value, non-tabel) menyatakan layanan terpilih.
    expect(feb.text).toContain(`Tahun Laporan,${YEAR}\n`);
    expect(feb.text).toContain("Layanan Audit,CALL\n");

    // Cakupan tiap seksi; default = layanan Call + bulan Februari.
    expect(csvSectionScope(feb.text, "Ringkasan Skor Bulanan")).toBe(
      `// Cakupan: Layanan CALL • Tahun ${YEAR}`,
    );
    expect(csvSectionScope(feb.text, "Detail Temuan")).toBe(
      `// Cakupan: Layanan CALL • Tahun ${YEAR}`,
    );
    expect(csvSectionScope(feb.text, "Tiket Pengurang Skor Terbesar")).toBe(
      `// Cakupan: Layanan CALL • Tahun ${YEAR} • Bulan terpilih Februari ${YEAR}`,
    );
    expect(csvSectionScope(feb.text, "Akar Masalah")).toBe(
      `// Cakupan: Layanan CALL • Tahun berjalan s.d. Februari ${YEAR}`,
    );
    expect(csvSectionScope(feb.text, "Perkembangan Skor")).toBe(
      `// Cakupan: Layanan CALL • Tahun ${YEAR} • Periode Jan - Feb`,
    );
    // Benchmark memakai cakupan yang dideklarasikan `comparisonTable.scope`.
    expect(csvSectionScope(feb.text, "Perbandingan Temuan")).toBe(
      `// Cakupan: Tahun ${YEAR} • Layanan Call • Tim Call • Periode Jan-Feb`,
    );

    // Ganti bulan ke Januari lewat MonthRail nyata, bukan set state internal.
    const januaryChip = page.getByRole("button", { name: /Pilih bulan Jan 2026/ });
    await januaryChip.click();
    await expect(januaryChip).toHaveAttribute("aria-pressed", "true");

    const jan = await exportFromMenu(page, "CSV", "csv-bulan-januari");

    // (1) Skema enam seksi + baris header kolom tidak berubah sama sekali.
    expectCsvSectionSchema(jan.text);
    // (2) Temuan tetap cakupan tahun+layanan: tidak ikut menyempit ke bulan.
    expect(csvSectionRows(jan.text, "Detail Temuan")).toEqual(
      csvSectionRows(feb.text, "Detail Temuan"),
    );
    // (3) Seksi per-bulan mengikuti bulan terpilih.
    expect(csvSectionScope(jan.text, "Tiket Pengurang Skor Terbesar")).toBe(
      `// Cakupan: Layanan CALL • Tahun ${YEAR} • Bulan terpilih Januari ${YEAR}`,
    );
    expect(csvSectionScope(jan.text, "Akar Masalah")).toBe(
      `// Cakupan: Layanan CALL • Tahun berjalan s.d. Januari ${YEAR}`,
    );
    // (4) Januari tidak punya temuan/akar masalah → header saja, tanpa baris
    //     dan tanpa angka karangan.
    expect(
      csvSectionRows(jan.text, "Tiket Pengurang Skor Terbesar"),
    ).toEqual(["No Tiket,Score Deduction,Jumlah Temuan,Parameter Terberat"]);
    expect(csvSectionRows(jan.text, "Akar Masalah")).toEqual([
      "Label,Prioritas,Jumlah Temuan,Tiket Terdampak,Temuan Critical,Rata-rata Nilai,Rekomendasi",
    ]);
    // (5) Ringkasan bulanan tetap semua bulan pada tahun+layanan.
    expect(csvSectionRows(jan.text, "Ringkasan Skor Bulanan")).toEqual([
      "Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan",
      "01/2026,82,84,80,1,0",
      "02/2026,91,92,90,2,1",
    ]);

    expectNoApplicationTraffic(audit);
  });

  test("CSV dan MD mengikuti layanan audit yang dipilih tanpa membocorkan data layanan lain", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const csvCall = await exportFromMenu(page, "CSV", "layanan-call-csv");
    const mdCall = await exportFromMenu(page, "MD", "layanan-call-md");
    expect(csvCall.text).toContain("Layanan Audit,CALL\n");
    expect(mdCall.text).toContain(`_Cakupan: Layanan CALL •`);

    // Ganti layanan lewat Select nyata di ContextControlBar. `combobox` dipakai
    // agar tidak ikut mencocokkan wrapper `role="group"` yang memakai label sama.
    const serviceSelect = page.getByRole("combobox", {
      name: "Pilihan layanan audit",
    });
    await serviceSelect.click();
    await page.getByRole("option", { name: "Chat" }).click();
    await expect(serviceSelect).toContainText("Chat");

    const csvChat = await exportFromMenu(page, "CSV", "layanan-chat-csv");
    const mdChat = await exportFromMenu(page, "MD", "layanan-chat-md");

    // (1) Cakupan layanan mengikuti UI pada kedua format.
    expect(csvChat.text).toContain("Layanan Audit,CHAT\n");
    expect(csvChat.text).not.toContain("Layanan Audit,CALL\n");
    expect(mdChat.text).toContain(`_Cakupan: Layanan CHAT •`);
    expect(mdChat.text).not.toContain(`_Cakupan: Layanan CALL •`);
    expect(csvSectionScope(csvChat.text, "Tiket Pengurang Skor Terbesar")).toContain(
      "Layanan CHAT",
    );
    expect(csvSectionScope(csvChat.text, "Akar Masalah")).toContain(
      "Layanan CHAT",
    );

    // (2) Skema tetap enam seksi di kedua layanan.
    expectCsvSectionSchema(csvChat.text);

    // (3) Data bulanan mengikuti layanan terpilih.
    expect(csvSectionRows(csvChat.text, "Ringkasan Skor Bulanan")).toEqual([
      "Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan",
      "02/2026,88,89,87,3,2",
    ]);

    // (4) Temuan tidak bocor lintas layanan, di CSV maupun MD.
    const chatFindings = csvSectionRows(csvChat.text, "Detail Temuan");
    expect(chatFindings).toHaveLength(3);
    expect(chatFindings.join("\n")).toContain(CHAT_TICKET_A);
    expect(chatFindings.join("\n")).toContain(CHAT_TICKET_B);
    expect(csvChat.text).not.toContain(REAL_TICKET);
    expect(mdChat.text).toContain(CHAT_TICKET_A);
    expect(mdChat.text).not.toContain(REAL_TICKET);
    expect(csvCall.text).toContain(REAL_TICKET);
    expect(csvCall.text).not.toContain(CHAT_TICKET_A);
    expect(mdCall.text).not.toContain(CHAT_TICKET_A);

    // (5) MD juga menyatakan cakupan bulan untuk seksi per-bulan.
    expect(mdSectionScope(mdChat.text, "Tiket Pengurang Skor Terbesar")).toBe(
      `_Cakupan: Layanan CHAT • Tahun ${YEAR} • Bulan terpilih Februari ${YEAR}_`,
    );
    expect(mdSectionScope(mdChat.text, "Detail Temuan")).toBe(
      `_Cakupan: Layanan CHAT • Tahun ${YEAR}_`,
    );

    expectNoApplicationTraffic(audit);
  });

  test("Sesi tanpa temuan hanya menyumbang angka agregat Sesi, tidak pernah sebagai baris laporan", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    const csv = await exportFromMenu(page, "CSV", "sesi-bersih-csv");
    const md = await exportFromMenu(page, "MD", "sesi-bersih-md");

    // Angka agregat sesi dari backend diteruskan apa adanya:
    // Januari = 1 sesi tanpa temuan, Februari = 2 sesi dengan 1 temuan.
    expect(csvSectionRows(csv.text, "Ringkasan Skor Bulanan")).toEqual([
      "Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan",
      "01/2026,82,84,80,1,0",
      "02/2026,91,92,90,2,1",
    ]);
    expect(md.text).toContain("| 01/2026 | 82 | 84 | 80 | 1 | 0 |");
    expect(md.text).toContain("| 02/2026 | 91 | 92 | 90 | 2 | 1 |");

    // Bukti `Sesi` bukan hasil hitung baris yang diekspor: Februari punya
    // 2 sesi tapi hanya 1 baris temuan dan 1 baris tiket.
    expect(csvSectionRows(csv.text, "Detail Temuan")).toHaveLength(2);
    expect(
      csvSectionRows(csv.text, "Tiket Pengurang Skor Terbesar"),
    ).toHaveLength(2);

    // Sebaliknya: sesi bersih tidak pernah muncul sebagai baris.
    for (const file of [csv, md]) {
      expect(
        file.text,
        `${file.filename} memuat nomor tiket sesi bersih`,
      ).not.toContain(CLEAN_SESSION_TICKET);
    }

    expectNoApplicationTraffic(audit);
  });

  test("Nama file dengan karakter berbahaya disanitasi tanpa mengubah isi laporan", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit, {
      id: SECOND_AGENT_ID,
      name: UNSAFE_NAME,
    });

    const file = await exportFromMenu(page, "CSV", "nama-berbahaya");

    // Nama file aman: satu garis bawah per rangkaian karakter berbahaya.
    expect(file.filename).toBe(
      `Laporan_Audit_${UNSAFE_NAME_FILE_PART}_${YEAR}.csv`,
    );
    expect(file.filename).not.toMatch(/[/\\:*?"<>|]/);

    // Sanitasi hanya menyentuh nama file: isi laporan tetap memakai nama
    // BERBAHAYA apa adanya dan tetap lengkap. Baris CSV-nya di-quote RFC4180
    // karena nama itu memuat kutip, jadi ekspektasinya bukan string telanjang.
    expect(file.text).toContain(
      `# Laporan Audit Agent - "${UNSAFE_NAME.replace(/"/g, '""')}"\n`,
    );
    expect(file.text).toContain(
      `Nama,"${UNSAFE_NAME.replace(/"/g, '""')}"\n`,
    );
    expectCsvSectionSchema(file.text);
    expect(file.text).toContain(REAL_TICKET);

    // Kontrak "CSV tetap bisa di-parse": kutip di dalam nilai tidak boleh
    // merusak struktur file, dan nilainya harus kembali utuh setelah di-parse.
    const records = expectCsvParseable(file);
    expect(
      records.find((record) => record[0] === "Nama")?.[1],
      "nama agen tidak kembali utuh setelah CSV di-parse",
    ).toBe(UNSAFE_NAME);
    expect(
      records.some((record) => record.includes(HOSTILE_FINDING_TEXT)),
      "teks temuan berisi tanda kutip tidak kembali utuh setelah CSV di-parse",
    ).toBe(true);

    expectNoApplicationTraffic(audit);
  });

  test("Kegagalan ekspor memberi umpan balik error yang terlihat tanpa menghasilkan file", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    /**
     * Kegagalan nyata, bukan menu yang dinonaktifkan atau data yang hilang:
     * modul yang diimpor dinamis oleh `handleExport` diganti dengan modul yang
     * melempar error saat evaluasi, sehingga `await import(...)` benar-benar
     * menolak. Daftarkan SESUDAH guard — Playwright memeriksa handler dalam
     * urutan terbalik, jadi intercept ini yang pertama kali menangani request.
     */
    const intercepted: string[] = [];
    await page.route(
      `${APP_ORIGIN}/src/utils/exportAgentReport.ts*`,
      async (route) => {
        intercepted.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "text/javascript; charset=utf-8",
          body: 'throw new Error("E2E: modul ekspor gagal dimuat");\n',
        });
      },
    );

    const downloads: Download[] = [];
    page.on("download", (download) => {
      downloads.push(download);
    });

    const trigger = page.getByRole("button", { name: "Unduh Laporan" });
    await trigger.click();
    const item = page.getByRole("menuitem").filter({ hasText: "CSV" });
    await expect(item).toBeEnabled();
    await item.click();

    // Bukti kegagalannya di jalur nyata: modul yang di-intercept benar-benar
    // diambil, jadi kegagalan ini bukan caused by menu mati/data kosong.
    expect(
      intercepted.length,
      "intercept modul ekspor tidak pernah dipanggil — test ini tidak membuktikan apa pun",
    ).toBeGreaterThan(0);

    // Umpan balik error terlihat dan diumumkan ke assistive tech lewat
    // live region aplikasi (Toaster), bukan ditelan diam-diam.
    const liveRegion = page.locator('section[aria-live="polite"]');
    await expect(liveRegion.getByText(EXPORT_ERROR_TITLE)).toBeVisible();

    // Tidak ada file palsu yang lahir dari kegagalan: bukan file kosong,
    // bukan file separuh jadi, dan tidak ada unduhan sama sekali.
    expect(
      downloads.map((download) => download.suggestedFilename()),
      "kegagalan ekspor tetap menghasilkan unduhan",
    ).toEqual([]);

    expectNoApplicationTraffic(audit);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 5 — data-integrity CSV: tidak ada sel yang dibaca spreadsheet
  // sebagai formula, sementara angka dan skema enam seksi tidak berubah.
  //
  // Diawali dari hasil audit: `csvEscape` lama hanya mengapit tanda kutip
  // nilai yang diawali `=`, `+`, `-`, atau `@`. Pengapitan tanda kutip
  // terbukti BUKAN netralisasi formula, jadi klaim "CSV aman dari formula"
  // tidak pernah benar. Fixture di sini sengaja berisi nilai yang benar-benar
  // dievaluasi spreadsheet kalau dibaca apa adanya.
  // ═══════════════════════════════════════════════════════════════════════

  test("CSV dari fixture berformula: tidak ada sel formula di seluruh file, angka tetap angka, skema enam seksi utuh", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit, {
      id: LONG_TEXT_AGENT_ID,
      name: LONG_TEXT_AGENT_NAME,
    });

    const file = await exportFromMenu(page, "CSV", "csv-formula");

    // (1) Bentuk file tidak berubah: BOM UTF-8, enam seksi, dan baris header
    //     skema tiap seksi. Mitigasi baru bekerja di level isi sel, bukan di
    //     level struktur dokumen.
    expectUtf8Bom(file);
    expect(csvSectionNames(file.text)).toEqual(
      CSV_SECTION_SCHEMA.map(([name]) => name),
    );
    expect(csvSectionHeaderRow(file.text, "Ringkasan Skor Bulanan")).toBe(
      "Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan",
    );
    expect(csvSectionHeaderRow(file.text, "Detail Temuan")).toBe(
      "Bulan,Tahun,Indikator,Kategori,Nilai,Ketidaksesuaian,Sebaiknya,No Tiket",
    );
    // Seksi tren agen ini punya tiga seri, jadi header-nya mengikuti data.
    expect(csvSectionHeaderRow(file.text, "Perkembangan Skor")).toBe(
      `Periode,Total Temuan,${INDICATOR_NAME},Kepatuhan prosedur`,
    );

    // (2) File tetap CSV RFC4180 yang bisa di-parse utuh.
    const records = expectCsvParseable(file);

    // (3) INVIARIAN UTAMA, diukur terhadap SELURUH file: tidak ada satu pun
    //     field hasil parse yang diawali pemicu formula. Ini yang diuji,
    //     bukan tanda kutipnya — karena tanda kutip sudah terbukti bukan
    //     netralisasi.
    const risky = csvFormulaRiskyFields(records);
    expect(
      risky,
      `sel yang masih dibaca spreadsheet sebagai formula: ${JSON.stringify(risky)}`,
    ).toEqual([]);

    // (4) Tidak ada data yang hilang: nilai contoh aslinya tetap utuh di
    //     belakang penanda, jadi menghapus penanda memulihkan teks apa adanya.
    for (const sample of FORMULA_SAMPLES) {
      const cells = csvCellsEndingWith(records, sample.value);
      expect(
        cells.length,
        `nilai contoh "${sample.value}" hilang dari CSV (harus tetap utuh di dalam sel)`,
      ).toBeGreaterThan(0);
      for (const cell of cells) {
        const prefix = cell.slice(0, cell.length - sample.value.length);
        expect(
          prefix,
          `sel untuk pemicu "${sample.trigger}" harus persis satu penanda ` +
            `[teks] + ruang di depan nilai aslinya, bukan "${cell}"`,
        ).toBe(CSV_FORMULA_PREFIX);
        expect(
          cell.slice(CSV_FORMULA_PREFIX.length),
          "nilai setelah penanda harus sama persis dengan nilai fixture",
        ).toBe(sample.value);
      }
    }
    // Penanda hanya boleh muncul pada sel yang benar-benar perlu dinetralisasi.
    // Kalau jumlahnya lebih, mitigasi berubah jadi "anotasi semua teks" dan
    // laporan jadi tidak jujur soal data mana yang berisiko.
    expect(
      file.text.split(CSV_FORMULA_PREFIX).length - 1,
      "penanda [teks] muncul di sel lain, padahal sel itu tidak berawalan pemicu formula",
    ).toBe(FORMULA_SAMPLES.length);

    // (5) Angka kolom numerik tidak berubah BITE demi byte: kolom skor harus
    //     tetap angka, bukan teks yang diawali tanda.
    expect(csvSectionRows(file.text, "Ringkasan Skor Bulanan")).toEqual([
      "Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan",
      "01/2026,82,84,80,1,0",
      "02/2026,91,92,90,2,1",
      "03/2026,74.5,79,70,4,2",
    ]);

    // (6) Artefak review: file CSV yang BENAR-BENAR diunduh, untuk dibuka di
    //     konsumen spreadsheet lokal (bukan string dari generator).
    const dir = reportArtifactDir("csv-formula");
    const copy = path.join(dir, file.filename);
    writeFileSync(copy, file.bytes);
    console.log(`[artifact] ${copy} (${file.bytes.length} byte)`);

    expectNoApplicationTraffic(audit);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PLACEHOLDER INTERNAL — penanda `[teks] ` tidak boleh menempel pada nilai
  // yang bukan pemicu formula.
  //
  // Dua nilai yang sama-sama diawali `-` diuji dari file yang BENAR-BENAR
  // diunduh, karena keduanya hanya bisa dibedakan di posisinya masing-masing:
  //   - `-`   : placeholder internal `computeTenure()` untuk agen tanpa
  //             `bergabung_date`. Bukan formula, jadi penanda hanya
  //             mengaburkan nilai yang sebenarnya.
  //   - `-1-1`: pemicu formula asli dari fixture. Harus tetap dilindungi.
  //
  // Kalau penandanya dihapus sekalian untuk semua sel berawalan `-`, file ini
  // masih hijau di assertion kedua tapi kembali membuka formula; kalau
  // placeholder-nya dibiarkan, assertion pertama yang gagal. Test ini ada
  // supaya keduanya tidak bisa lolos tanpa dibedakan.
  // ═══════════════════════════════════════════════════════════════════════

  test("CSV: placeholder internal `-` tetap polos, pemicu formula `-1-1` tetap dilindungi", async ({
    page,
  }) => {
    // (1) Agen tanpa `bergabung_date` → `Masa Kerja` berisi placeholder `-`.
    const emptyAudit = startAudit();
    await openAgentDetail(
      page,
      emptyAudit,
      { id: EMPTY_AGENT_ID, name: EMPTY_AGENT_NAME },
      // Agen tanpa periode tidak memanggil endpoint quickview sama sekali.
      { expectQuickviewRequest: false },
    );
    const empty = await exportFromMenu(page, "CSV", "placeholder");

    expectUtf8Bom(empty);

    const tenureLine = empty.text
      .split("\n")
      .find((line) => line.startsWith("Masa Kerja,"));
    // Nilai placeholder harus terbaca apa adanya. `\"-\"` juga salah: sel
    // yang diapit tanda kutip bukan bentuk yang pernah dipakai dokumen ini.
    expect(
      tenureLine,
      "baris `Masa Kerja` hilang dari CSV agen tanpa tanggal bergabung",
    ).toBe("Masa Kerja,-");

    // Tidak ada satu pun nilai di laporan ini yang perlu dinetralisasi, jadi
    // penanda tidak boleh muncul sama sekali. Pengecualian placeholder harus
    // berputar di level NILAI, bukan di level dokumen.
    expect(
      empty.text.split(CSV_FORMULA_PREFIX).length - 1,
      "penanda [teks] muncul di laporan yang tidak punya nilai berawalan pemicu",
    ).toBe(0);

    // Skema seksi tidak bergeser: agen tanpa tren/benchmark memang hanya
    // menulis empat seksi (kontrak lama), tapi urutan dan namanya tetap.
    expect(csvSectionNames(empty.text)).toEqual([
      "Ringkasan Skor Bulanan",
      "Detail Temuan",
      "Tiket Pengurang Skor Terbesar",
      "Akar Masalah",
    ]);

    expectNoApplicationTraffic(emptyAudit);

    // (2) Agen dengan fixture berformula: pengecualian placeholder harus
    //     sempit. Sel `-1-1` masih perlu penanda, persis seperti pemicu lain.
    const formulaAudit = startAudit();
    await openAgentDetail(page, formulaAudit, {
      id: LONG_TEXT_AGENT_ID,
      name: LONG_TEXT_AGENT_NAME,
    });
    const formula = await exportFromMenu(page, "CSV", "placeholder");

    expectUtf8Bom(formula);
    // Skema enam seksi utuh untuk agen yang datanya lengkap.
    expect(csvSectionNames(formula.text)).toEqual(
      CSV_SECTION_SCHEMA.map(([name]) => name),
    );

    const negativeSample = FORMULA_SAMPLES.find(
      (sample) => sample.trigger === "-",
    );
    expect(negativeSample, "fixture formula kehilangan sampel pemicu `-`").toBeDefined();
    const negativeCells = csvCellsEndingWith(
      expectCsvParseable(formula),
      negativeSample!.value,
    );
    expect(
      negativeCells.length,
      `nilai pemicu "${negativeSample!.value}" hilang dari CSV`,
    ).toBeGreaterThan(0);
    for (const cell of negativeCells) {
      expect(
        cell,
        `pemicu "${negativeSample!.value}" harus tetap dinetralisasi ` +
          `dengan satu penanda [teks] + ruang, bukan "${cell}"`,
      ).toBe(`${CSV_FORMULA_PREFIX}${negativeSample!.value}`);
    }

    expectNoApplicationTraffic(formulaAudit);
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 4 — PDF. Menu → generator → Blob biner → file yang diunduh.
  // ═══════════════════════════════════════════════════════════════════════

  test("Menu Unduh Laporan menghasilkan PDF asli: A4 multi-halaman, teks bisa dicari, tanpa BOM", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // Kontrak: lima format termasuk PDF. Test ini lahir dari RED Fase 1
    // (`menu Unduh Laporan belum punya opsi PDF`) dan sekarang harus hijau.
    const trigger = page.getByRole("button", { name: "Unduh Laporan" });
    await trigger.click();
    // `allTextContents()` tidak menunggu render menu, jadi jumlah item
    // diperiksa lewat `toHaveCount` yang ikut menunggu menu terisi.
    const menuItems = page.getByRole("menuitem");
    await expect(
      menuItems,
      `menu Unduh Laporan harus punya lima format termasuk PDF; isi menu: ${JSON.stringify(
        await menuItems.allTextContents(),
      )}`,
    ).toHaveCount(5);
    const menuLabels = (await menuItems.allTextContents()).map((label) =>
      label.trim(),
    );
    const pdfItem = menuItems.filter({ hasText: "PDF" });
    await expect(
      pdfItem,
      `menu Unduh Laporan belum punya opsi PDF; isi menu: ${JSON.stringify(menuLabels)}`,
    ).toHaveCount(1);

    const readBlobs = await recordDownloadBlobs(page);
    // Menu ditutup dulu supaya `exportFromMenu` menjalankan jalur yang sama
    // dengan test lain: klik trigger dari keadaan tertutup.
    await page.keyboard.press("Escape");
    await expect(menuItems).toHaveCount(0);
    const file = await exportFromMenu(page, "PDF", "fase4-pdf");
    const blobs = await readBlobs();

    // (1) Nama file dari state UI, sama seperti format lain.
    expect(file.filename).toBe(`Laporan_Audit_${AGENT_NAME}_${YEAR}.pdf`);
    // (2) Biner: magic bytes, tanpa BOM, ukuran masuk akal. BOM di file biner
    //     tidak pernah dibutuhkan dan menggeser header `%PDF-`.
    expect(
      file.bytes.subarray(0, 5).toString("latin1"),
      "file PDF harus magic bytes %PDF-",
    ).toBe("%PDF-");
    expectNoBom(file);
    expect(
      file.bytes.length,
      "PDF kosong/tidak wajar tidak boleh lahir dari kegagalan",
    ).toBeGreaterThan(2000);
    expect(file.bytes.length).toBeLessThan(2_000_000);

    // (3) Blob yang benar-benar diterima browser: `application/pdf` dan
    //     tidak nol byte. PDF tidak memakai prefix BOM seperti 4 format teks.
    expect(blobs, "tidak ada blob yang dibuat untuk unduhan PDF").toHaveLength(
      1,
    );
    expect(blobs[0].type).toBe("application/pdf");
    expect(blobs[0].size).toBeGreaterThan(0);
    expect(blobs[0].size).toBe(file.bytes.length);

    // (4) Metadata dokumen: judul/subjek memuat identitas + konteks laporan,
    //     bukan nama file generik.
    const info = readPdfInfo(file.bytes);
    expect(info.Title ?? "", "/Title PDF").toContain(AGENT_NAME);
    expect(info.Subject ?? "", "/Subject PDF").toContain(String(YEAR));
    expect(info.Subject ?? "", "/Subject PDF").toContain("CALL");
    expect(info.Author ?? "", "/Author PDF").toContain("SIDAK");
    expect(info.Producer ?? "", "/Producer PDF").not.toBe("");

    // (5) Halaman: lebih dari satu, tidak ada halaman kosong, dan tiap halaman
    //     punya footer "Halaman X dari N" (bukti header/footer berulang).
    const pdfPages = readPdfPages(file.bytes);
    const pages = pdfPages.texts;
    expect(
      pages.length,
      `PDF tidak terbaca per halaman: ${pages.length} halaman`,
    ).toBeGreaterThan(0);
    expect(
      pages.length,
      "laporan A4 dengan tabel + tren + seluruh temuan harus multi-halaman",
    ).toBeGreaterThan(1);
    expect(pages.length, "jumlah halaman PDF tidak masuk akal").toBeLessThan(
      12,
    );
    expectTextBasedPdf(file.bytes, pdfPages);
    expect(
      printedReadBack(pages).includes("?"),
      "decoder PDF gagal memetakan byte ke Unicode; read-back tidak sah",
    ).toBe(false);
    expectPageFooters(pages);

    const firstPage = pages[0];
    const lastPage = pages[pages.length - 1];
    const whole = printedReadBack(pages);

    // (6) Halaman pertama: identitas + konteks laporan (tanpa halaman sampul
    //     terpisah) dan ringkasan eksekutif sudah berisi skor & rekap bulanan.
    for (const fact of [
      AGENT_NAME,
      "Tim Call",
      "Batch 7",
      `Tahun ${YEAR}`,
      "Layanan CALL",
      "Ringkasan Skor Bulanan",
      "01/2026",
      "02/2026",
    ]) {
      expect(
        printedIncludes(firstPage, fact),
        `halaman pertama tidak memuat "${fact}"; read-back: ${firstPage}`,
      ).toBe(true);
    }

    // (7) Tiket pengurang skor ikut di PDF, dengan angka dediksi yang dihitung
    //     hook (bentuk satu desimal), bukan angka karangan.
    expect(
      printedIncludes(whole, REAL_TICKET),
      `tiket riil tidak ikut di PDF; read-back: ${whole}`,
    ).toBe(true);
    expect(
      /TKT-2026-0142[\s\S]{0,80}?\d+\.\d/.test(whole),
      "kolom Score Deduction tidak ikut di PDF",
    ).toBe(true);

    // (8) Halaman terakhir: seluruh temuan (tiket, indikator, nilai, teks
    //     Ketidaksesuaian +Sebaiknya) dan colophon, termasuk teks BERBAHAYA
    //     yang harus keluar sebagai TEKS, bukan dieksekusi atau terpotong.
    for (const fact of [
      INDICATOR_NAME,
      REAL_TICKET,
      HOSTILE_FINDING_TEXT,
      HOSTILE_RECOMMENDATION_TEXT,
      "Sebaiknya:",
      "Laporan Audit SIDAK",
    ]) {
      expect(
        printedIncludes(lastPage, fact),
        `halaman terakhir tidak memuat "${fact}"; read-back: ${lastPage}`,
      ).toBe(true);
    }
    // Akar masalah + rekap + tiket ada di halaman ringkasan; seluruh fakta
    // laporan harus ada di dokumen, tidak ada yang hilang di tengah.
    expect(
      printedIncludes(firstPage, "Akurasi jawaban"),
      `halaman pertama tidak memuat akar masalah; read-back: ${firstPage}`,
    ).toBe(true);
    expect(missingPrintedFacts(whole), "fakta laporan hilang dari PDF").toEqual(
      [],
    );

    // (9) Cakupan jujur: dokumen ini layanan CALL bulan Februari, jadi tiket
    //     chat dan tiket sesi bersih tidak boleh bocor ke PDF mana pun.
    for (const foreign of [
      CHAT_TICKET_A,
      CHAT_TICKET_B,
      CLEAN_SESSION_TICKET,
    ]) {
      expect(
        printedIncludes(whole, foreign),
        `PDF membocorkan data di luar cakupan: ${foreign}`,
      ).toBe(false);
    }
    // Setiap seksi menyatakan cakupannya sendiri; tidak boleh ada satu periode
    // yang lendoh ke seluruh dokumen.
    for (const scope of [
      `Layanan CALL • Tahun ${YEAR}`,
      "Bulan terpilih Februari 2026",
      `Tahun berjalan s.d. Februari 2026`,
    ]) {
      expect(
        printedIncludes(whole, scope),
        `label cakupan tidak ikut di PDF: ${scope}`,
      ).toBe(true);
    }

    // (10) Artefak review di luar repo: PDF + read-back per halaman.
    const dir = reportArtifactDir("pdf");
    const copy = path.join(dir, file.filename);
    writeFileSync(copy, file.bytes);
    writeFileSync(
      path.join(dir, `${file.filename}-pages.txt`),
      pages
        .map((text, index) => `=== PAGE ${index + 1} ===\n${text}`)
        .join("\n\n"),
    );
    console.log(
      `[artifact] ${copy} (${file.bytes.length} byte, ${pages.length} halaman)`,
    );

    expectNoApplicationTraffic(audit);
  });

  test("PDF memuat teks panjang di beberapa halaman dan tidak memotong blok antar halaman", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit, {
      id: LONG_TEXT_AGENT_ID,
      name: LONG_TEXT_AGENT_NAME,
    });

    const file = await exportFromMenu(page, "PDF", "fase4-pdf-teks-panjang");
    const pdfPages = readPdfPages(file.bytes);
    const pages = pdfPages.texts;
    const whole = printedReadBack(pages);

    expect(
      pages.length,
      "isi panjang harus menghasilkan PDF multi-halaman; read-back:\n" +
        pages
          .map((text, index) => `[p${index + 1}] ${text.slice(0, 160)}`)
          .join("\n"),
    ).toBeGreaterThanOrEqual(3);
    expectTextBasedPdf(file.bytes, pdfPages);
    expect(
      whole.includes("?"),
      "decoder PDF gagal memetakan byte ke Unicode; read-back tidak sah",
    ).toBe(false);
    expectPageFooters(pages);

    // (1) Blok temuan panjang benar-benar MELEWATI batas halaman: penanda awal
    //     dan penanda akhir ada di halaman BERBEDA. Kalau keduanya di halaman
    //     yang sama, klaim "teks panjang tidak terpotong antar halaman" tidak
    //     benar-benar diuji.
    const headPage = pages.findIndex((text) =>
      printedIncludes(text, LONG_TEXT_HEAD),
    );
    const tailPage = pages.findIndex((text) =>
      printedIncludes(text, LONG_TEXT_TAIL),
    );
    expect(
      headPage,
      "penanda awal teks panjang hilang dari PDF",
    ).toBeGreaterThanOrEqual(0);
    expect(
      tailPage,
      "penanda akhir teks panjang hilang dari PDF",
    ).toBeGreaterThan(headPage);
    // Halaman yang memuat ekor teks panjang juga memuat baris penutup
    // temuan ("Sebaiknya") dan penjelesarnya: blok tidak terpotong di tepi.
    const tailText = pages[tailPage];
    expect(
      printedIncludes(tailText, "Gunakan naskah satu halaman"),
      `blok temuan terpotong di batas halaman; read-back: ${tailText.slice(0, 300)}`,
    ).toBe(true);
    // Dokumen berakhir bersih: kalimat terakhir colophon ada di halaman
    // terakhir, jadi tidak ada blok yang menggantung di akhir file.
    const lastPage = pages[pages.length - 1];
    expect(
      printedIncludes(
        lastPage,
        "Angka agregat sesi berasal dari penilaian backend dan tidak dihitung ulang oleh laporan ini.",
      ),
      `halaman terakhir tidak ditutup colophon; read-back: ${lastPage.slice(0, 300)}`,
    ).toBe(true);

    // (2) Token tanpa spasi yang lebih lebar dari kolom harus dipecah per
    //     karakter dan tetap utuh secara harfiah setelah whitespace read-back
    //     dibuang. Kalau terpotong, barisnya akan hilang di sisi kanan margin.
    expect(
      printedIncludes(whole, LONG_UNBREAKABLE_TOKEN),
      "token tanpa spasi terpotong di batas kolom",
    ).toBe(true);

    // (3) Temuan lain pada periode berbeda juga ikut: PDF tidak berhenti di
    //     satu periode atau satu tiket.
    for (const fact of [
      LONG_TEXT_TICKET,
      LONG_TEXT_TICKET_2,
      LONG_TEXT_AGENT_NAME,
      "03/2026",
      "Kepatuhan prosedur",
    ]) {
      expect(
        printedIncludes(whole, fact),
        `bagian ini hilang dari PDF: ${fact}`,
      ).toBe(true);
    }

    // (4) Karakter di luar WinAnsi yang punya padanan ejaan Indonesia
    //     disanitasi menjadi teks biasa, dan tidak ada byte rusak yang lolos
    //     ke PDF.
    expect(
      printedIncludes(whole, "Alur harus naik ke lalu turun"),
      "panah di luar WinAnsi harus disanitasi menjadi teks biasa",
    ).toBe(true);
    expect(
      printedIncludes(whole, "2 tingkat"),
      "bagian teks setelah karakter disanitasi hilang",
    ).toBe(true);

    // (4b) BAWAAN FASE 5 — karakter yang TIDAK punya padanan ejaan (CJK, emoji,
    //      Latin-Extended) tidak boleh hilang diam-diam jadi spasi. Setiap kode
    //     such muncul sebagai penanda `[U+XXXX]`: terlihat, bisa dicari, dan
    //      bisa dibalik ke karakter aslinya.
    const markers = readPrintedMarkers(whole);
    // Penanda yang terpotong oleh pembungkusan baris tidak bisa dibalik; jumlah
    // `[U+` harus sama dengan jumlah penanda utuh.
    expect(
      markers.starts,
      "ada penanda [U+…] yang terpotong di batas kolom/halaman: tidak bisa dibalik",
    ).toBe(markers.complete.length);
    // Himpunan penanda harus PERSIS titik kode karakter yang tidak bisa
    // dicetak pada fixture. Karakter yang sebenarnya bisa dicetak (é, —, •)
    // tidak boleh ikut ditandai — kalau muncul di daftar ini, sanitizer terlalu
    // lebar dan bukti yang bisa dibaca jadi rusak.
    expect(
      markers.codePoints,
      "penanda karakter tak-tercetak tidak sama dengan fixture; lihat penanda yang terbaca",
    ).toEqual(UNSUPPORTED_SAMPLE_CODE_POINTS);
    for (const [codePoint, char] of UNSUPPORTED_SAMPLE_PAIRS) {
      // Mengikat daftar titik kode ke fixture: kalau teks fixture berubah dan
      // daftar ini tidak ikut, test gagal di sini — bukan diam-diam melolos.
      expect(
        UNSUPPORTED_UNICODE_TEXT.includes(char) ||
          UNSUPPORTED_IN_TOKEN.includes(char),
        `daftar titik kode tidak cocok dengan fixture: ${codePoint}`,
      ).toBe(true);
      expect(
        whole.includes(char),
        `karakter "${char}" lolos apa adanya ke PDF; WinAnsi tidak bisa menencetaknya`,
      ).toBe(false);
    }

    // (4c) Penanda di dalam token tanpa spasi harus UTUH meski tokennya dipecah
    //      per karakter. `U+1EC7` hanya muncul di token itu, jadi penandanya
    //      tidak mungkin datang dari kalimat lain.
    expect(
      printedIncludes(whole, UNSUPPORTED_IN_TOKEN_ASCII_HEAD),
      "awal token tanpa spasi hilang dari PDF",
    ).toBe(true);
    expect(
      printedIncludes(whole, UNSUPPORTED_IN_TOKEN_ASCII_TAIL),
      "akhir token tanpa spasi hilang dari PDF",
    ).toBe(true);
    expect(
      printedIncludes(
        whole,
        UNSUPPORTED_IN_TOKEN.replace(
          "ệ",
          unsupportedMarker("U+1EC7"),
        ),
      ),
      "token tanpa spasi terpotong di batas kolom",
    ).toBe(true);

    // (4d) Karakter yang DIDUKUNG WinAnsi tetap utuh di kalimat yang sama:
    //      é (Latin-1), em dash, dan bullet tidak boleh jadi penanda.
    for (const supported of ["André", "—", "•"]) {
      expect(
        printedIncludes(whole, supported),
        `karakter yang didukung font standar (${supported}) hilang dari PDF`,
      ).toBe(true);
    }
    for (const prose of [
      "Temuwa agen: pelanggan menulis",
      "lalu membalas",
      "saat menunggu konfirmasi,",
      "Nama klien",
    ]) {
      expect(
        printedIncludes(whole, prose),
        `teks di sekitar karakter tak-tercetak hilang: "${prose}"`,
      ).toBe(true);
    }

    // (5) Sesi bersih tetap tidak masuk, dan cakupan bulan terakhir (Maret)
    //     dipakai untuk tiket/akar masalah.
    expect(
      printedIncludes(whole, CLEAN_SESSION_TICKET),
      "PDF memuat tiket sesi bersih",
    ).toBe(false);
    expect(
      printedIncludes(whole, "Bulan terpilih Maret 2026"),
      "bulan terpilih tidak mengikuti state UI",
    ).toBe(true);

    const dir = reportArtifactDir("pdf");
    const copy = path.join(dir, "pdf-teks-panjang.pdf");
    writeFileSync(copy, file.bytes);
    writeFileSync(
      path.join(dir, "pdf-teks-panjang-pages.txt"),
      pages
        .map((text, index) => `=== PAGE ${index + 1} ===\n${text}`)
        .join("\n\n"),
    );
    console.log(
      `[artifact] ${copy} (${file.bytes.length} byte, ${pages.length} halaman)`,
    );

    expectNoApplicationTraffic(audit);
  });

  test("Kegagalan pembuatan PDF memberi umpan balik error tanpa menghasilkan file", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    /**
     * Kegagalan yang nyata: modul PDF yang diimpor dinamis diganti dengan
     * modul yang melempar error saat evaluasi, jadi `await import()` benar-benar
     * menolak di tengah percakapan async `handleExport`.
     */
    const intercepted: string[] = [];
    await page.route(
      `${APP_ORIGIN}/src/utils/agentReportPdf.ts*`,
      async (route) => {
        intercepted.push(route.request().url());
        await route.fulfill({
          status: 200,
          contentType: "text/javascript; charset=utf-8",
          body: 'throw new Error("E2E: generator PDF gagal dimuat");\n',
        });
      },
    );

    const downloads: Download[] = [];
    page.on("download", (download) => downloads.push(download));

    const trigger = page.getByRole("button", { name: "Unduh Laporan" });
    await trigger.click();
    const item = page.getByRole("menuitem").filter({ hasText: "PDF" });
    await expect(item).toBeEnabled();
    await item.click();

    // Impor modul terjadi setelah klik (dynamic import), jadi penangkapan
    // request-nya harus menunggu, bukan diasumsikan sudah terjadi.
    await expect
      .poll(() => intercepted.length, {
        message:
          "intercept generator PDF tidak pernah dipanggil — test ini tidak membuktikan apa pun",
        timeout: 15000,
      })
      .toBeGreaterThan(0);

    const liveRegion = page.locator('section[aria-live="polite"]');
    await expect(liveRegion.getByText(EXPORT_ERROR_TITLE)).toBeVisible();

    // Tidak ada file kosong, tidak ada file separuh jadi, tidak ada unduhan.
    expect(
      downloads.map((download) => download.suggestedFilename()),
      "kegagalan PDF tetap menghasilkan unduhan",
    ).toEqual([]);

    expectNoApplicationTraffic(audit);
  });

  test("Guard memblokir /api yang tidak dimock dan host eksternal tak dikenal", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // (0) Baseline: satu-satunya lalu lintas jaringan adalah font (di-abort).
    expectNoApplicationTraffic(audit);

    // (1) Endpoint yang dimock dilayani fixture lokal, bukan proxy Vite.
    const mocked = await page.evaluate(async () => {
      const response = await fetch("/api/v1/sidak/agents/agent-1?year=2026");
      return { ok: response.ok, body: await response.text() };
    });
    expect(mocked.ok).toBe(true);
    expect(mocked.body).toContain(AGENT_NAME);
    expect(
      audit.mockedApi.some((label) =>
        label.includes("/api/v1/sidak/agents/agent-1?"),
      ),
    ).toBe(true);

    // (2) `/api/v1/*` yang tidak dimock tidak boleh sampai ke proxy `localhost:3001`.
    const unmockedApi = await page.evaluate(async () => {
      try {
        const response = await fetch("/api/v1/sidak/agents/agent-1/tidak-ada");
        return { failed: false, status: response.status };
      } catch {
        return { failed: true, status: 0 };
      }
    });
    expect(unmockedApi).toEqual({ failed: true, status: 0 });
    expect(audit.blockedApi).toContain(
      "GET http://localhost:3005/api/v1/sidak/agents/agent-1/tidak-ada",
    );

    // (3) Host eksternal yang reachable (example.com) tidak boleh keluar dari mesin.
    const externalBefore = audit.blockedExternal.length;
    const external = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/probe-unduhan");
        return false;
      } catch {
        return true;
      }
    });
    expect(external).toBe(true);
    expect(audit.blockedExternal.slice(externalBefore)).toEqual([
      "GET https://example.com/probe-unduhan",
    ]);
  });

  test("Guard memblokir path yang dimock dari origin lain tanpa menyentuh socket", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // (0) Baseline: sebelum ada probe, tidak ada lalu lintas jaringan.
    expectNoApplicationTraffic(audit);

    // Listener standing-in di loopback dengan port ephemeral: origin-nya BERBEDA
    // dari `APP_ORIGIN`, jadi test ini tidak pernah melakukan egress ke host
    // eksternal mana pun, tetapi tetap membuktikan hal yang sama — kalau guard
    // meloloskan path yang dimock ke jaringan, listener lokal inilah yang
    // mencatatnya.
    const hits: string[] = [];
    const listener = createServer((incoming, response) => {
      hits.push(`${incoming.method} ${incoming.url}`);
      response.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      });
      response.end(JSON.stringify({ success: true, data: [{ leaked: true }] }));
    });
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const address = listener.address();
    const foreignOrigin =
      address && typeof address === "object"
        ? `http://127.0.0.1:${address.port}`
        : null;
    expect(
      foreignOrigin,
      "listener loopback tidak siap untuk probe",
    ).not.toBeNull();

    try {
      const blockedBefore = audit.blockedExternal.length;
      const probe = await page.evaluate(async (origin) => {
        try {
          const response = await fetch(
            `${origin}/api/v1/sidak/agents/agent-1?year=2026`,
          );
          return {
            failed: false,
            status: response.status,
            body: await response.text(),
          };
        } catch {
          return { failed: true, status: 0, body: "" };
        }
      }, foreignOrigin!);

      // (1) Guard harus mengklaim request itu. `fallback` tidak pernah mencatat
      // apa pun, jadi label yang tidak muncul di sini berarti request lolos ke
      // jaringan atau dilayani handler lain.
      expect(
        audit.blockedExternal.slice(blockedBefore),
        `path yang dimock dari origin lain lolos tanpa di-abort; respons nyata: ${probe.status} ${probe.body}`,
      ).toEqual([`GET ${foreignOrigin}/api/v1/sidak/agents/agent-1?year=2026`]);

      // (2) Bukti terkuat: tidak ada byte yang sampai ke socket nyata.
      expect(hits, `request bocor ke jaringan: ${hits.join(" | ")}`).toEqual(
        [],
      );

      // (3) Foreign origin tidak boleh dilayani fixture mock app.
      expect(probe.body).not.toContain(AGENT_NAME);
      expect(
        probe.failed,
        `respons dari jaringan: ${probe.status} ${probe.body}`,
      ).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
  // ═══════════════════════════════════════════════════════════════════════
  // FASE 5 — dua invarian yang tadinya hanya bisa dibuktikan lewat unit test.
  //
  // Keduanya di sini diukur dari file yang diunduh dan dari perilaku yang
  // terlihat mata di browser, bukan dari kelas CSS atau atribut SVG.
  // ═══════════════════════════════════════════════════════════════════════

  test("Menu Unduh Laporan tidak terpotong di layar sempit dan semua lima format tetap terjangkau", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(page, audit);

    // Invariant lamanya diuji sebagai kelas CSS (`overflow-hidden`, `z-50`).
    // Yang bisa dilihat pembaca sebenarnya lebih sederhana dan lebih jujur:
    // menu utuh di dalam viewport, dan item format TERAKHIR (yang paling dekat
    // tepi bawah) tetap terlihat serta bisa diklik.
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 720 });
      const trigger = page.getByRole("button", { name: "Unduh Laporan" });
      await expect(trigger).toBeVisible();
      await trigger.click();

      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();

      const viewport = page.viewportSize();
      expect(viewport, "viewport tidak terbaca").not.toBeNull();
      const box = await menu.boundingBox();
      expect(box, `menu tidak punya bounding box di ${width}px`).not.toBeNull();
      expect(
        box!.x >= -0.5 && box!.y >= -0.5,
        `menu keluar dari atas/kiri viewport di ${width}px: ${JSON.stringify(box)}`,
      ).toBe(true);
      expect(
        box!.x + box!.width <= viewport!.width + 0.5,
        `menu melebar melewati kanan viewport di ${width}px: ${JSON.stringify(box)} vs ${viewport!.width}`,
      ).toBe(true);
      expect(
        box!.y + box!.height <= viewport!.height + 0.5,
        `menu terpotong bawah viewport di ${width}px: ${JSON.stringify(box)} vs ${viewport!.height}`,
      ).toBe(true);

      // Lima format, dan yang terakhir (PDF) benar-benar terlihat.
      await expect(page.getByRole("menuitem")).toHaveCount(5);
      const lastItem = page.getByRole("menuitem", { name: /PDF/ });
      await expect(lastItem).toBeVisible();
      const lastBox = await lastItem.boundingBox();
      expect(
        lastBox !== null &&
          lastBox.y + lastBox.height <= viewport!.height + 0.5,
        `item format terakhir terpotong di ${width}px: ${JSON.stringify(lastBox)}`,
      ).toBe(true);

      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    }

    expectNoApplicationTraffic(audit);
  });

  test("Tren degeneratif (titik tunggal, celah null, seri semua nol) menghasilkan koordinat berhingga di file yang diunduh", async ({
    page,
  }) => {
    const agents = [
      {
        id: SINGLE_POINT_TREND_AGENT_ID,
        name: SINGLE_POINT_TREND_AGENT_NAME,
        what: "satu label, satu titik, dan satu seri bernilai nol",
        seriesLabelInFile: DEGENERATE_SERIES_LABEL,
      },
      {
        id: GAP_TREND_AGENT_ID,
        name: GAP_TREND_AGENT_NAME,
        what: "celah null di tengah seri dan seri seluruhnya nol",
        // Label seri agen ini sengaja menutup <script>; yang ada di file harus
        // bentuk ter-escape-nya.
        seriesLabelInFile: HOSTILE_SERIES_LABEL.replace("</script>", "&lt;/script&gt;").replace("<script>", "&lt;script&gt;").replace("</script>", "&lt;/script&gt;"),
      },
    ];

    for (const agent of agents) {
      const audit = startAudit();
      await openAgentDetail(page, audit, { id: agent.id, name: agent.name });

      const file = await exportFromMenu(page, "HTML Statis", `tren-${agent.id}`);

      // (1) Tidak ada nilai tidak berhingga yang bocor ke dokumen. Ini yang dulu
      //     hanya bisa dicek di string generator; di sini yang dibaca adalah
      //     file yang benar-benar keluar dari browser.
      expect(
        file.text,
        `${agent.name} (${agent.what}): nilai tidak berhingga bocor ke HTML`,
      ).not.toMatch(/\bNaN\b|\bInfinity\b|\bundefined\b/);
      expect(file.text).not.toMatch(
        /(?:x|y|x1|y1|x2|y2|width|height|r|cx|cy|rx|ry)="[^"]*(?:NaN|Infinity)/,
      );

      // (2) Grafik benar-benar dirender — bukan dokumen tanpa sumbu.
      expect(file.text).toContain('<svg class="trend-chart"');
      // (3) Setiap nilai seri tetap TERLIHAT di tabel data tren, termasuk
      //     periode yang tidak punya angka: pembaca harus bisa membedakan
      //     "tidak ada data" dari "nol". Label seri diuji dalam bentuk yang
      //     benar-benar keluar dari file, jadi label BERBAHAYA ikut ter-escape.
      expect(file.text).toContain("Data tren");
      expect(file.text).toContain(agent.seriesLabelInFile);
      expect(file.text).toContain("Feb");
      // (4) Label cakupan tren masih jujur: periode nyata, bukan karangan.
      expect(file.text).toMatch(/Total Periode/);

      expectNoApplicationTraffic(audit);
    }
  });

  test("Agen tanpa data audit: unduhan tetap jujur — profil ada, seksi kosong dinyatakan kosong", async ({
    page,
  }) => {
    const audit = startAudit();
    await openAgentDetail(
      page,
      audit,
      { id: EMPTY_AGENT_ID, name: EMPTY_AGENT_NAME },
      // Agen tanpa periode tidak memanggil endpoint quickview sama sekali.
      { expectQuickviewRequest: false },
    );

    // (1) Ketiga format tetap menghasilkan file yang ADA isinya. Unduhan kosong
    //     yang "berhasil" adalah kegagalan yang lebih buruk daripada error.
    const csv = await exportFromMenu(page, "CSV", "kosong");
    const md = await exportFromMenu(page, "Markdown", "kosong");
    const html = await exportFromMenu(page, "HTML Statis", "kosong");

    expect(csv.bytes.length).toBeGreaterThan(0);
    expect(md.bytes.length).toBeGreaterThan(0);
    expect(html.bytes.length).toBeGreaterThan(0);

    // (2) Identitas tetap terbaca di semua format — ini satu-satunya isi yang
    //     benar-benar ada.
    for (const [label, file] of [
      ["CSV", csv],
      ["MD", md],
      ["HTML", html],
    ] as const) {
      expect(file.text, `${label} kehilangan nama agen`).toContain(EMPTY_AGENT_NAME);
    }
    expect(csv.text).toContain(`Tahun Laporan,${YEAR}\n`);

    // (3) Seksi kosong dinyatakan eksplisit, bukan diisi nol. Ini bedanya
    //     "tidak ada data" dengan "nilaianya nol", dan keduanya tidak boleh
    //     tercampur dalam laporan.
    expect(md.text).toContain("## Ringkasan Skor Bulanan");
    expect(md.text).toContain("Tidak ada data ringkasan");
    expect(md.text).toContain("## Detail Temuan");
    expect(md.text).toContain("Tidak ada temuan");
    expect(md.text).toContain("Tidak ada tiket");
    expect(md.text).toContain("Belum ditemukan pola akar masalah");
    // Seksi tren + benchmark hanya ditulis kalau datanya ada.
    expect(md.text).not.toContain("## Perkembangan Skor");
    expect(md.text).not.toContain("## Perbandingan Temuan");

    // HTML menyatakan tiap seksi kosong dengan kalimatnya sendiri, dan tren
    // yang tidak punya data tidak dikarang jadi garis lurus.
    expect(html.text).toContain("Tidak ada temuan untuk cakupan ini.");
    expect(html.text).toContain(
      "Tidak ada tiket yang menurunkan skor pada cakupan ini.",
    );
    expect(html.text).toContain("Data tren belum tersedia untuk konteks ini.");
    expect(html.text).not.toContain("## Perkembangan Skor");

    // (4) Skema enam seksi TETAP ditulis Even saat datanya kosong — inilah
    //     bentuk multi-seksi CSV yang jadi keputusan produk — tapi tanpa satu
    //     pun baris data. Angka tidak dikarang: tidak ada `0` yang berdiri di
    //     tempat data yang belum pernah ada.
    expect(csv.text).toContain("# Ringkasan Skor Bulanan");
    expect(csv.text).toContain(
      "Bulan,Skor Final,NC Score,CR Score,Sesi,Temuan",
    );
    expect(csv.text).not.toMatch(/^\d{2}\/\d{4},/m);
    expect(csv.text).not.toContain(",TIDAK SESUAI");
    expect(html.text).not.toContain("T-");

    expectNoApplicationTraffic(audit);
  });

  test("Data BERBAHAYA dari label seri, cakupan benchmark, dan quickview masuk laporan sebagai teks, bukan markup", async ({
    page,
  }) => {
    // (1) Label seri tren yang menutup <script> dari DALAM data seri.
    const gapAudit = startAudit();
    await openAgentDetail(page, gapAudit, {
      id: GAP_TREND_AGENT_ID,
      name: GAP_TREND_AGENT_NAME,
    });
    const gapFile = await exportFromMenu(page, "HTML Statis", "hostile-gap");

    expect(
      gapFile.text,
      "label seri tren menutup <script> dan berhasil dieksekusi",
    ).not.toContain("<script>alert(1)</script>");
    expect(gapFile.text).toContain("&lt;/script&gt;");
    // Cakupan benchmark berasal dari backend dan ikut ke ringkasan + heading.
    expect(gapFile.text).toContain("&lt;b&gt;Tim Call&lt;/b&gt;");
    expect(gapFile.text).not.toMatch(/<img[^>]*>/i);
    expect(gapFile.text).not.toMatch(/<script[^>]*>/i);
    expectNoApplicationTraffic(gapAudit);

    // (2) Nama agen yang menutup quickview harus ter-escape, dan disclosure
    //     "berbagi peringkat" harus benar-benar bisa dibuka.
    const tieAudit = startAudit();
    await openAgentDetail(page, tieAudit, {
      id: TIE_AGENT_ID,
      name: TIE_AGENT_NAME,
    });
    const tieFile = await exportFromMenu(page, "HTML Statis", "hostile-tie");

    expect(tieFile.text).toContain("Berbagi peringkat");
    expect(tieFile.text).toContain("Nurul &lt;Hidayah&gt;");
    expect(tieFile.text).not.toMatch(/<script[^>]*>/i);
    // Dua agen seri: yang pertama disebut, sisanya diringkas, keduanya tetap
    // bisa ditemukan pembaca lewat disclosure.
    expect(tieFile.text).toMatch(/quickview-ties/);
    expect(tieFile.text).toMatch(/1 agen lain|Yoga Saputra/);
    expectNoApplicationTraffic(tieAudit);
  });

});
