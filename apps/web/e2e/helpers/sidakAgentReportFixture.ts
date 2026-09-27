/**
 * Harness E2E bersama untuk laporan audit agen SIDAK.
 *
 * Dipakai oleh dua spec yang mengukur dua permukaan berbeda dari fixture yang
 * SAMA, supaya "parity" punya arti:
 *   - `sidak-agent-report-download.spec.ts` — kontrak tiap format yang
 *     diunduh lewat menu nyata.
 *   - `sidak-agent-html-export-parity.spec.ts` — apa yang dibaca pembaca di
 *     halaman live dibanding dokumen HTML yang diunduh dari fixture itu juga.
 *
 * Dipisah dari spec supaya fixture-nya hanya ada satu. Dua fixture berbeda akan
 * membuat perbandingan lintas permukaan mustahil dibuktikan.
 *
 * Yang TIDAK ada di sini: helper spesifik satu format (parser CSV, decoder PDF,
 * layout cetak). Itu tetap milik spec yang memakainya, supaya spec ini tetap
 * bisa dibaca tanpa menelusuri 1400 baris yang tidak relevan.
 *
 * Isolasi dijaga di level modul ini, bukan di level test:
 *   1. `assertLocalDevOnlyTarget()` membuktikan target adalah dev-server Vite
 *      repo ini (bukan hasil build produksi) dan proxy `/api`-nya hanya loopback.
 *   2. `openAgentDetail()` memasang mock auth, mock `/api`, lalu guard
 *      fail-closed dalam satu urutan, sehingga `/api/*` yang tidak dimock dan
 *      host apa pun di luar loopback tidak pernah keluar.
 *   3. `readReportOffline()` memasang guard egress di level KONTEKS sebelum
 *      `file://` dinavigasi, jadi dokumen unduhan tidak bisa menarik resource
 *      remote dan assertion baru gagal SETELAH byte-nya keluar.
 *   4. `resolveArtifactDir()` menolak menulis artefak di dalam repo.
 */

import {
  expect,
  type BrowserContext,
  type Download,
  type Page,
} from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentDetailData,
  ServiceType,
  ServiceWeight,
  SidakAgentQuickviewResponse,
} from "@trainers/types";
import { VALID_SERVICE_TYPES } from "@trainers/types";
import { buildMockAuth, mockSupabaseAuth } from "./mockAuth";

/**
 * Akar repo. Helper ini berada di `apps/web/e2e/helpers/`, jadi satu level
 * lebih dalam daripada spec — empat level ke atas, bukan tiga.
 */
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

const APP_ORIGIN = "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";

type MockedEndpoint = {
  id: string;
  method: string;
  /** Path persis (dipakai kalau ada). */
  path?: string;
  /** Path dinamis (dipakai kalau `path` tidak ada). */
  pathPattern?: RegExp;
};

/**
 * Satu-satunya endpoint yang boleh menerima mock. Method + path/pattern di sini
 * adalah allowlist milik guard DAN kunci dispatch mock, jadi tidak bisa berbeda.
 * `fetchApi` memakai `API_BASE = /api/v1`, jadi path apa pun yang tidakListed
 * di sini akan di-`abort`, bukan diteruskan ke proxy Vite.
 */
const MOCKED_API: ReadonlyArray<MockedEndpoint> = [
  { id: "agentDetail", method: "GET", path: "/api/v1/sidak/agents/agent-1" },
  {
    id: "agentDetailUnsafeName",
    method: "GET",
    path: "/api/v1/sidak/agents/agent-nama-berbahaya",
  },
  {
    // Agen ketiga: dataset isi panjang untuk pembuktian paginasi PDF (Fase 4).
    id: "agentDetailLongText",
    method: "GET",
    path: "/api/v1/sidak/agents/agent-teks-panjang",
  },
  {
    // Satu pola untuk semua agen: hanya sufiks `/quickview`, tetap method GET,
    // dan tetap di-anchor ke origin app.
    id: "quickview",
    method: "GET",
    pathPattern: /^\/api\/v1\/sidak\/agents\/[^/]+\/quickview$/,
  },
  {
    id: "agentDetailSinglePointTrend",
    method: "GET",
    path: "/api/v1/sidak/agents/agent-tren-titik-tunggal",
  },
  {
    id: "agentDetailGapTrend",
    method: "GET",
    path: "/api/v1/sidak/agents/agent-tren-jarak-null",
  },
  {
    id: "agentDetailEmpty",
    method: "GET",
    path: "/api/v1/sidak/agents/agent-kosong",
  },
  {
    id: "agentDetailTie",
    method: "GET",
    path: "/api/v1/sidak/agents/agent-peringkat-seri",
  },
  { id: "folders", method: "GET", path: "/api/v1/sidak/folders" },
  {
    id: "folderAgents",
    method: "GET",
    pathPattern: /^\/api\/v1\/sidak\/folders\/[^/]+\/agents$/,
  },
];

/** Mock auth/profile dari `helpers/mockAuth.ts`; hanya dua path ini. */
const MOCKED_SUPABASE = [
  { id: "authUser", path: "/auth/v1/user" },
  { id: "profiles", path: "/rest/v1/profiles" },
] as const;

/** Host pihak ketiga yang memang dipanggil index.html; tetap diblokir, hanya dicatat. */
const EXTERNAL_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

// ── Fixture ─────────────────────────────────────────────────────────────────

const AGENT_ID = "agent-1";
const YEAR = 2026;
const SERVICE = "call" as const;
const AGENT_NAME = "Alya Pranoto";
const REAL_TICKET = "TKT-2026-0142";
/** Tiket clean session: HARUS tidak muncul di file mana pun. */
const CLEAN_SESSION_TICKET = "TKT-CLEAN-2026-0001";
const INDICATOR_NAME = "Akurasi informasi produk";

/** Layanan kedua (chat) supaya cakupan benar-benar diuji lintas layanan. */
const SECOND_AGENT_ID = "agent-nama-berbahaya";
const CHAT_INDICATOR_NAME = "Kecepatan respons chat";
const CHAT_TICKET_A = "TKT-2026-0771";
const CHAT_TICKET_B = "TKT-2026-0772";

/**
 * Agen ketiga (Fase 4/PDF) untuk menguji isi panjang: beberapa temuan dengan
 * kalimat panjang DAN satu token tanpa spasi yang jauh lebih lebar dari kolom
 * A4. Token tanpa spasi inilah yang biasanya "melewati" margin kalau generator
 * hanya memecah baris di spasi, jadi keberadaannya utuh di dalam PDF yang
 * diunduh adalah bukti teks panjang tidak dipotong diam-diam.
 */
const LONG_TEXT_AGENT_ID = "agent-teks-panjang";
const LONG_TEXT_AGENT_NAME = "Bagas Prakoso";
const LONG_TEXT_TICKET = "TKT-2026-0900";
const LONG_TEXT_TICKET_2 = "TKT-2026-0901";
/** 120 karakter tanpa spasi: lebih lebar dari kolom A4 (~178mm). */
const LONG_UNBREAKABLE_TOKEN =
  "NOMINALANGGARANPANGANJUTRAUKANGSIFKREDITPROPOSALDANAANGSURBUYANGSALDOAWALAKHIRPERIODE2026KETERLAMBATAN";
/** Penanda awal/akhir: keduanya harus muncul utuh di PDF (bukan terpotong). */
const LONG_TEXT_HEAD =
  "Awal teks panjang: agen mengulang naskah pembuka sebelum menjawab.";
const LONG_TEXT_TAIL = "Penanda akhir teks panjang: TUTUP-LAPORAN-2026-OK.";

const LONG_TEXT_SENTENCES: readonly string[] = [
  "Agen mengulang kalimat pembuka sebanyak empat kali sebelum menjawab pertanyaan saldo awal, lalu menyebut kode promosi yang tidak ada di naskah resmi.",
  "Keterangan bunga dan masa pakai memakai jargon internal yang tidak ada di daftar istilah wajib, sehingga pelanggan meminta penjelasan ulang dua kali.",
  LONG_UNBREAKABLE_TOKEN,
  "Klausa tanpa spasi di atas sengaja membuat baris lebih lebar dari kolom A4, jadi generator wajib memecahnya per karakter.",
  "Catatan tambahan untuk auditor: tidak ada temuan yang boleh dihapus hanya karena panjang teksnya tidak enak dibaca.",
  "Paragraf penutup yang menandai bahwa teks panjang ini benar-benar sampai ke bagian akhir dokumen.",
];

/**
 * Teks temuan panjang. Diulang beberapa kali secara sengaja: supaya satu blok
 * temuan benar-benar harus MELEWATI batas halaman, bukan hanya "/ada teks
 * panjang". Head dan tail-nya dipisahkan oleh banyak baris, jadi head di satu
 * halaman dan tail di halaman lain adalah bukti alur baris berjalan, bukan
 * blok yang dipotong.
 */
const LONG_TEXT_FINDING = [
  LONG_TEXT_HEAD,
  ...Array.from({ length: 4 }).flatMap(() => LONG_TEXT_SENTENCES),
  LONG_TEXT_TAIL,
].join(" ");

/**
 * Teks BERBAHAYA non-ASCII untuk font PDF standar (WinAnsi). Panah, tanda
 * "lebih besar sama dengan", dan superscript di luar jangkauan WinAnsi; kalau
 * tidak disanitasi, jsPDF menulisnya sebagai bytesampah dan PDF berisi glyph
 * yang tidak bisa dipetakan ke Unicode.
 */
const HOSTILE_UNICODE_TEXT =
  "Alur harus naik → lalu turun ≥ 2 tingkat; gunakan tanda ™ dan pangkat ² seperlunya.";
/**
 * Nama agen dengan karakter yang tidak aman untuk nama file. Isi laporan harus
 * tetap memakai nama ini apa adanya; hanya nama file-nya yang disanitasi.
 */
const UNSAFE_NAME = 'Rina/Adi:*?"<>|Bunga';
const UNSAFE_NAME_FILE_PART = "Rina_Adi_Bunga";

/**
 * Judul toast error saat ekspor gagal. Harus sama persis dengan teks yang
 * dirender aplikasi supaya test benar-benar mengukur umpan balik ke pengguna.
 */
const EXPORT_ERROR_TITLE = "Gagal membuat laporan";

/**
 * Teks BERBAHAYA. Mengandung markup script, kutip ganda, koma, dan tanda hubung
 * agar escaping tiap format benar-benar terukur dari file yang diunduh.
 * `=cmd()` sengaja tidak dipakai: klaim keamanan formula spreadsheet hanya sah
 * setelah diuji di konsumen spreadsheet sungguhan (lihat GAPS di laporan).
 */
const HOSTILE_FINDING_TEXT =
  // `|` sengaja ada di dalam kalimat: di Markdown, karakter itu adalah
  // PEMBATAS KOLOM tabel. Kalau tidak di-escape, satu catatan agen akan
  // memecah baris tabel MD menjadi kolom palsu.
  'Agent menyebut " tenor 12 bulan" tanpa tegas, lalu menambahkan <script>alert("xss")</script> pada catatan | nominal, dan bunga.';
const HOSTILE_RECOMMENDATION_TEXT =
  "Ucapkan tenor, bunga, dan angsuran berurutan; minta konfirmasi ulang <b>tertulis</b> sebelum menutup tiket.";

// ═══════════════════════════════════════════════════════════════════════════
// BAWAAN FASE 5 — data-integrity: karakter tak-tercetak di PDF & formula di CSV.
//
// Dua set fixture ini sengaja memakai karakter NYATA dari data yang bisa masuk
// laporan (catatan agen), bukan karakter dekoratif:
//
//   1. `UNSUPPORTED_*` — kode yang TIDAK punya glyph di font standar PDF
//      (Helvetica = WinAnsi). Dua ideogram CJK, satu emoji, dan dua huruf
//      Latin-Extended yang secara visual "mirip" huruf biasa. Kalau generator
//      menukar semuanya dengan spasi, bukti pengguna hilang tanpa jejak.
//   2. `FORMULA_*` — nilai yang SPREADSHEET akan mengevaluasi kalau selnya
//      dibaca apa adanya. Rumusnya sengaja TIDAK berbahaya (`=1+1`, bukan
//      `=cmd(...)`): payload berbahaya tidak pernah ditulis ke repo ini, dan
//      invarian yang diuji sama saja — "tidak dievaluasi" — bisa dibuktikan
//      lewat nilai hitungannya, bukan lewat gadget.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Teks temuan dengan karakter yang tidak bisa dicetak font standar PDF,
 * dicampur dengan karakter yang DIDUKUNG (é Latin-1, em dash, bullet WinAnsi)
 * di dalam kalimat yang sama. Bentuk campuran inilah yang membuatnya jadi uji:
 * sanitasi yang benar mempertahankan bagian yang bisa dicetak apa adanya, bukan
 * menandai seluruh teks non-ASCII.
 */
const UNSUPPORTED_UNICODE_TEXT = [
  "Temuwa agen: pelanggan menulis 中 lalu membalas 日本語,",
  "menambahkan emoji 😅 saat menunggu konfirmasi,",
  "dan mencatat đ di buku catatan.",
  "Nama klien André tetap tercetak apa adanya; pemisah — dan • juga ikut utuh.",
].join(" ");

/**
 * Pasangan (titik kode, karakter asli) untuk setiap kode yang TIDAK ada di
 * WinAnsi. Ditulis sebagai heksadesimal, bukan `codePointAt()` dari teks
 * fixture: kalau teks fixture ikut berubah, daftar ini harus gagal nyaring,
 * bukan ikut menyesuaikan sendiri. `U+1EC7` sengaja hanya muncul di token
 * tanpa spasi (`UNSUPPORTED_IN_TOKEN`), jadi penandanya tidak bisa datang dari
 * kalimat biasa.
 */
const UNSUPPORTED_SAMPLE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["U+4E2D", "中"],
  ["U+65E5", "日"],
  ["U+672C", "本"],
  ["U+8A9E", "語"],
  ["U+1F605", "😅"],
  ["U+0111", "đ"],
  ["U+1EC7", "ệ"],
];

/** Titik kode yang harus muncul sebagai penanda di PDF (urutan stabil). */
const UNSUPPORTED_SAMPLE_CODE_POINTS: readonly string[] = [
  ...UNSUPPORTED_SAMPLE_PAIRS.map(([codePoint]) => codePoint),
].sort();

/** Penanda yang dipakai PDF untuk satu kode yang tidak bisa dicetak. */
function unsupportedMarker(codePoint: string): string {
  return `[${codePoint}]`;
}

/**
 * Token tanpa spasi yang memuat satu karakter tak-tercetak. Token ini lebih
 * lebar dari kolom A4, jadi pasti dipecah per karakter saat pembungkusan baris.
 * Ini yang membuktikan penanda `[U+…]` TIDAK ikut terpotong: penanda yang
 * terbelah jadi dua baris tidak bisa dibalik lagi ke karakter aslinya.
 */
const UNSUPPORTED_IN_TOKEN =
  "NOMINALANGGARANệPANGANJUTRAUKANGSIFKREDITPROPOSALDANAANGSURBUYANGSALDOAWALAKHIRPERIODE2026KETERLAMBATAN";

/** Bagian token yang pasti bisa dicetak, dipakai sebagai kontrol positif. */
const UNSUPPORTED_IN_TOKEN_ASCII_HEAD = "NOMINALANGGARAN";
const UNSUPPORTED_IN_TOKEN_ASCII_TAIL = "KETERLAMBATAN";

/**
 * Sampel formula, satu per pemicu, di dua kolom teks yang berbeda
 * (`ketidaksesuaian` + `sebaiknya`) supaya tiap pemicu benar-benar diuji pada
 * posisi pertama sel — satu-satunya posisi yang menentukan apakah spreadsheet
 * memperlakukannya sebagai formula.
 */
const FORMULA_SAMPLES: ReadonlyArray<{
  trigger: string;
  value: string;
}> = [
  { trigger: "=", value: "=1+1" },
  { trigger: "@", value: "@SUM(1,1)" },
  { trigger: "+", value: "+1+1" },
  { trigger: "-", value: "-1-1" },
];

/**
 * Bobot layanan dipakai hook untuk menghitung dediksi tiket. Nilainya pecahan
 * (0.5/0.5) seperti `DEFAULT_SERVICE_WEIGHTS`; kalau diisi persen, `scoreSession`
 * menghasilkan skor jauh di atas 100 dan setiap tiket ter-filter sebagai
 * `scoreDeduction === 0` — gejalanya "tiket tidak pernah muncul di laporan".
 */
const WEIGHTS = Object.fromEntries(
  VALID_SERVICE_TYPES.map((service_type) => [
    service_type,
    {
      service_type,
      critical_weight: 0.5,
      non_critical_weight: 0.5,
      scoring_mode: "weighted",
    } satisfies ServiceWeight,
  ]),
) as Record<ServiceType, ServiceWeight>;

const agentFixture: AgentDetailData = {
  peserta: {
    id: AGENT_ID,
    nama: AGENT_NAME,
    tim: "Tim Call",
    batch_name: "Batch 7",
    jabatan: "Agent",
    foto_url: null,
    bergabung_date: "2024-03-01",
  },
  indicators: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      name: INDICATOR_NAME,
      parameter_group: null,
      category: "critical",
      bobot: 50,
      has_na: false,
      sort_order: 1,
      is_active: true,
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      service_type: "chat",
      name: CHAT_INDICATOR_NAME,
      parameter_group: null,
      category: "non_critical",
      bobot: 30,
      has_na: false,
      sort_order: 1,
      is_active: true,
    },
  ],
  periodSummaries: [
    {
      id: "period-01",
      month: 1,
      year: YEAR,
      label: "01/2026",
      serviceType: "call",
      finalScore: 82,
      nonCriticalScore: 84,
      criticalScore: 80,
      sessionCount: 1,
      findingsCount: 0,
    },
    {
      id: "period-02",
      month: 2,
      year: YEAR,
      label: "02/2026",
      serviceType: "call",
      finalScore: 91,
      nonCriticalScore: 92,
      criticalScore: 90,
      sessionCount: 2,
      findingsCount: 1,
    },
    {
      id: "period-03",
      month: 2,
      year: YEAR,
      label: "02/2026",
      serviceType: "chat",
      finalScore: 88,
      nonCriticalScore: 89,
      criticalScore: 87,
      sessionCount: 3,
      findingsCount: 2,
    },
  ],
  selectedPeriod: null,
  temuan: [
    {
      id: "finding-01",
      peserta_id: AGENT_ID,
      period_id: "period-02",
      indicator_id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      no_tiket: REAL_TICKET,
      nilai: 1,
      ketidaksesuaian: HOSTILE_FINDING_TEXT,
      sebaiknya: HOSTILE_RECOMMENDATION_TEXT,
      tahun: YEAR,
      qa_indicators: {
        id: "11111111-1111-1111-1111-111111111111",
        name: INDICATOR_NAME,
        service_type: "call",
        category: "critical",
        bobot: 50,
        has_na: false,
      },
      qa_periods: { id: "period-02", month: 2, year: YEAR, label: "02/2026" },
    },
    {
      id: "finding-02",
      peserta_id: AGENT_ID,
      period_id: "period-03",
      indicator_id: "22222222-2222-2222-2222-222222222222",
      service_type: "chat",
      no_tiket: CHAT_TICKET_A,
      nilai: 2,
      ketidaksesuaian: "Balasan chat menyusul setelah agen menutup sesi.",
      sebaiknya: "Kirim konfirmasi singkat sebelum menutup sesi chat.",
      tahun: YEAR,
      qa_indicators: {
        id: "22222222-2222-2222-2222-222222222222",
        name: CHAT_INDICATOR_NAME,
        service_type: "chat",
        category: "non_critical",
        bobot: 30,
        has_na: false,
      },
      qa_periods: { id: "period-03", month: 2, year: YEAR, label: "02/2026" },
    },
    {
      id: "finding-03",
      peserta_id: AGENT_ID,
      period_id: "period-03",
      indicator_id: "22222222-2222-2222-2222-222222222222",
      service_type: "chat",
      no_tiket: CHAT_TICKET_B,
      nilai: 1,
      ketidaksesuaian: "Agen tidak menanyakan nominal bunga pada chat kedua.",
      sebaiknya: "Konfirmasi nominal bunga dan tenor secara tertulis.",
      tahun: YEAR,
      qa_indicators: {
        id: "22222222-2222-2222-2222-222222222222",
        name: CHAT_INDICATOR_NAME,
        service_type: "chat",
        category: "non_critical",
        bobot: 30,
        has_na: false,
      },
      qa_periods: { id: "period-03", month: 2, year: YEAR, label: "02/2026" },
    },
  ],
  /**
   * Clean session (phantom). Ada di UI sebagai "Sesi tanpa temuan" dengan skor
   * 100, tapi hanya boleh menyumbang angka agregat `sessionCount`, tidak boleh
   * masuk daftar temuan/HTML/CSV mana pun.
   */
  phantomSessions: [
    {
      id: "phantom-01",
      peserta_id: AGENT_ID,
      period_id: "period-01",
      indicator_id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      no_tiket: CLEAN_SESSION_TICKET,
      is_phantom_padding: true,
      nilai: 3,
      tahun: YEAR,
      qa_indicators: {
        id: "11111111-1111-1111-1111-111111111111",
        name: INDICATOR_NAME,
        service_type: "call",
        category: "critical",
        bobot: 50,
        has_na: false,
      },
      qa_periods: { id: "period-01", month: 1, year: YEAR, label: "01/2026" },
    },
  ],
  weights: WEIGHTS,
  scoreHistory: [
    {
      month: 1,
      year: YEAR,
      finalScore: 82,
      nonCriticalScore: 84,
      criticalScore: 80,
      sessionCount: 1,
      service_type: "call",
    },
    {
      month: 2,
      year: YEAR,
      finalScore: 91,
      nonCriticalScore: 92,
      criticalScore: 90,
      sessionCount: 2,
      service_type: "call",
    },
  ],
  personalTrend: {
    labels: ["Jan", "Feb"],
    datasets: [
      { label: "Total Temuan", data: [0, 1], isTotal: true },
      { label: INDICATOR_NAME, data: [0, 1], isTotal: false },
    ],
  },
  comparisonTable: {
    scope: {
      year: YEAR,
      serviceType: "call",
      startMonth: 1,
      endMonth: 2,
      teamLabel: "Tim Call",
      serviceLabel: "Call",
    },
    rows: [
      {
        key: "total",
        label: "Total Temuan",
        agentCount: 1,
        teamAverage: 2,
        serviceAverage: 3,
        teamAgentCount: 4,
        serviceAgentCount: 8,
      },
      {
        key: "akurasi",
        label: INDICATOR_NAME,
        agentCount: 1,
        teamAverage: 1,
        serviceAverage: 2,
        teamAgentCount: 4,
        serviceAgentCount: 8,
      },
    ],
  },
  rootCauses: [
    {
      clusterId: "salah_jawaban",
      label: "Akurasi jawaban",
      priority: 6,
      findingsCount: 1,
      affectedTickets: 1,
      criticalFindingsCount: 1,
      averageNilai: 1,
      matchedKeywords: ["tenor"],
      recommendation: HOSTILE_RECOMMENDATION_TEXT,
      evidence: [
        {
          id: "evidence-1",
          no_tiket: REAL_TICKET,
          periodId: "period-02",
          indicatorName: INDICATOR_NAME,
          nilai: 1,
          text: "Tenor dan bunga tidak disebutkan lengkap",
        },
      ],
      periods: [
        {
          periodId: "period-02",
          month: 2,
          year: YEAR,
          label: "02/2026",
          serviceType: "call",
          findingsCount: 1,
          criticalFindingsCount: 1,
          affectedTickets: 1,
        },
      ],
    },
  ],
  availableYears: [YEAR],
  initialYear: YEAR,
  initialService: SERVICE,
  initialTrendRange: { start: 1, end: 2 },
};

/**
 * Agen kedua yang **hanya** berbeda pada nama. Semua koleksi lain sengaja
 * identik supaya selisih antara file keduanya hanya bisa datang dari nama agen:
 * nama BERBAHAYA harus utuh di isi laporan, sementara nama file-nya disanitasi.
 * `peserta_id` pada `temuan` masih menunjuk `agent-1`; ekspor tidak pernah
 * memfilternya, jadi itu tidak memengaruhi apa pun yang dibuktikan di sini.
 */
const unsafeNameAgentFixture: AgentDetailData = {
  ...agentFixture,
  peserta: {
    ...agentFixture.peserta,
    id: SECOND_AGENT_ID,
    nama: UNSAFE_NAME,
  },
};

/**
 * Fixture PDF "isi panjang" (Fase 4). Tujuannya satu: memaksa dokumen
 * A4 multi-halaman dengan teks yang JAUH lebih panjang dari satu baris dan
 * lebih panjang dari satu token per baris, lalu membuktikan seluruhnya ikut
 * ke PDF yang diunduh (halaman awal sampai halaman akhir) tanpa terpotong.
 *
 * Bedanya dari `agentFixture`: lebih banyak periode, lebih banyak temuan per
 * periode, satu temuan berisi teks panjang + token tanpa spasi, dan satu
 * temuan berisi karakter di luar WinAnsi.
 */
const LONG_TEXT_INDICATOR_ID = "33333333-3333-3333-3333-333333333333";
const longTextAgentFixture: AgentDetailData = {
  ...agentFixture,
  peserta: {
    ...agentFixture.peserta,
    id: LONG_TEXT_AGENT_ID,
    nama: LONG_TEXT_AGENT_NAME,
  },
  indicators: [
    ...agentFixture.indicators,
    {
      id: LONG_TEXT_INDICATOR_ID,
      service_type: "call",
      name: "Kepatuhan prosedur",
      parameter_group: null,
      category: "critical",
      bobot: 40,
      has_na: false,
      sort_order: 2,
      is_active: true,
    },
  ],
  periodSummaries: [
    ...agentFixture.periodSummaries.filter(
      (summary) => summary.serviceType === SERVICE,
    ),
    {
      id: "period-04",
      month: 3,
      year: YEAR,
      label: "03/2026",
      serviceType: SERVICE,
      finalScore: 74.5,
      nonCriticalScore: 79,
      criticalScore: 70,
      sessionCount: 4,
      findingsCount: 2,
    },
  ],
  temuan: [
    {
      id: "long-finding-01",
      peserta_id: LONG_TEXT_AGENT_ID,
      period_id: "period-02",
      indicator_id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      no_tiket: LONG_TEXT_TICKET,
      nilai: 1,
      ketidaksesuaian: LONG_TEXT_FINDING,
      sebaiknya:
        "Gunakan naskah satu halaman, adherence check sebelum menutup sesi, dan minta konfirmasi tertulis untuk nominal bunga.",
      tahun: YEAR,
      qa_indicators: {
        id: "11111111-1111-1111-1111-111111111111",
        name: INDICATOR_NAME,
        service_type: "call",
        category: "critical",
        bobot: 50,
        has_na: false,
      },
      qa_periods: { id: "period-02", month: 2, year: YEAR, label: "02/2026" },
    },
    {
      id: "long-finding-02",
      peserta_id: LONG_TEXT_AGENT_ID,
      period_id: "period-04",
      indicator_id: LONG_TEXT_INDICATOR_ID,
      service_type: "call",
      no_tiket: LONG_TEXT_TICKET_2,
      nilai: 0,
      ketidaksesuaian: HOSTILE_UNICODE_TEXT,
      sebaiknya: "Terapkan checklist radially, Params panjang.",
      tahun: YEAR,
      qa_indicators: {
        id: LONG_TEXT_INDICATOR_ID,
        name: "Kepatuhan prosedur",
        service_type: "call",
        category: "critical",
        bobot: 40,
        has_na: false,
      },
      qa_periods: { id: "period-04", month: 3, year: YEAR, label: "03/2026" },
    },
    {
      id: "long-finding-03",
      peserta_id: LONG_TEXT_AGENT_ID,
      period_id: "period-04",
      indicator_id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      no_tiket: LONG_TEXT_TICKET_2,
      nilai: 2,
      ketidaksesuaian:
        "Agen menutup sesi sebelum mengonfirmasi nominal akhir kepada pelanggan.",
      sebaiknya:
        "Konfirmasi nominal akhir dan waktu pencairan secara eksplisit.",
      tahun: YEAR,
      qa_indicators: {
        id: "11111111-1111-1111-1111-111111111111",
        name: INDICATOR_NAME,
        service_type: "call",
        category: "critical",
        bobot: 50,
        has_na: false,
      },
      qa_periods: { id: "period-04", month: 3, year: YEAR, label: "03/2026" },
    },
    /**
     * BAWAAN FASE 5 — karakter tak-tercetak (CJK/emoji/Latin-Extended) dicampur
     * karakter yang didukung, pada satu kalimat. Perbaikan data-integrity PDF
     * harus menandai hanya kode yang benar-benar tidak bisa dicetak.
     *
     * Empat temuan Fase 5 ini sengaja memakai SATU periode dan SATU tiket yang
     * sama dengan temuan teks panjang (Februari, `LONG_TEXT_TICKET`): satu
     * skenario audit, bukan empat skenario terpisah. Konsekuensi yang disengaja:
     * isi sebelum blok teks panjang di PDF tidak berubah, jadi bukti "blok itu
     * benar-benar melewati batas halaman" pada test PDF panjang tetap berlaku.
     */
    {
      id: "long-finding-04",
      peserta_id: LONG_TEXT_AGENT_ID,
      period_id: "period-02",
      indicator_id: LONG_TEXT_INDICATOR_ID,
      service_type: "call",
      no_tiket: LONG_TEXT_TICKET,
      nilai: 2,
      ketidaksesuaian: UNSUPPORTED_UNICODE_TEXT,
      sebaiknya:
        "Terjemahkan istilah ke bahasa pelanggan dan gunakan hanya simbol yang tersedia di font standar.",
      tahun: YEAR,
      qa_indicators: {
        id: LONG_TEXT_INDICATOR_ID,
        name: "Kepatuhan prosedur",
        service_type: "call",
        category: "critical",
        bobot: 40,
        has_na: false,
      },
      qa_periods: { id: "period-02", month: 2, year: YEAR, label: "02/2026" },
    },
    /**
     * BAWAAN FASE 5 — penanda karakter tak-tercetak di dalam token tanpa spasi
     * yang harus dipecah per karakter. Bukti bahwa penanda tidak ikut terbelah.
     */
    {
      id: "long-finding-05",
      peserta_id: LONG_TEXT_AGENT_ID,
      period_id: "period-02",
      indicator_id: LONG_TEXT_INDICATOR_ID,
      service_type: "call",
      no_tiket: LONG_TEXT_TICKET,
      nilai: 2,
      ketidaksesuaian: UNSUPPORTED_IN_TOKEN,
      sebaiknya:
        "Pisahkan kode program dari catatan, lalu pastikan keduanya terbaca jelas.",
      tahun: YEAR,
      qa_indicators: {
        id: LONG_TEXT_INDICATOR_ID,
        name: "Kepatuhan prosedur",
        service_type: "call",
        category: "critical",
        bobot: 40,
        has_na: false,
      },
      qa_periods: { id: "period-02", month: 2, year: YEAR, label: "02/2026" },
    },
    /**
     * BAWAAN FASE 5 — dua temuan yang isinya PURE formula spreadsheet, satu
     * pemicu per kolom (`ketidaksesuaian` dan `sebaiknya`). Nilai bom seperti
     * `=1+1` dipilih supaya "dievaluasi atau tidak" bisa dibuktikan dari nilai
     * hitungannya, tanpa payload berbahaya di dalam repo.
     */
    {
      id: "long-finding-06",
      peserta_id: LONG_TEXT_AGENT_ID,
      period_id: "period-02",
      indicator_id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      no_tiket: LONG_TEXT_TICKET,
      nilai: 1,
      ketidaksesuaian: FORMULA_SAMPLES[0].value,
      sebaiknya: FORMULA_SAMPLES[1].value,
      tahun: YEAR,
      qa_indicators: {
        id: "11111111-1111-1111-1111-111111111111",
        name: INDICATOR_NAME,
        service_type: "call",
        category: "critical",
        bobot: 50,
        has_na: false,
      },
      qa_periods: { id: "period-02", month: 2, year: YEAR, label: "02/2026" },
    },
    {
      id: "long-finding-07",
      peserta_id: LONG_TEXT_AGENT_ID,
      period_id: "period-02",
      indicator_id: "11111111-1111-1111-1111-111111111111",
      service_type: "call",
      no_tiket: LONG_TEXT_TICKET,
      nilai: 1,
      ketidaksesuaian: FORMULA_SAMPLES[2].value,
      sebaiknya: FORMULA_SAMPLES[3].value,
      tahun: YEAR,
      qa_indicators: {
        id: "11111111-1111-1111-1111-111111111111",
        name: INDICATOR_NAME,
        service_type: "call",
        category: "critical",
        bobot: 50,
        has_na: false,
      },
      qa_periods: { id: "period-02", month: 2, year: YEAR, label: "02/2026" },
    },
  ],
  personalTrend: {
    labels: ["Jan", "Feb", "Mar"],
    datasets: [
      { label: "Total Temuan", data: [0, 1, 2], isTotal: true },
      { label: INDICATOR_NAME, data: [0, 1, 1], isTotal: false },
      { label: "Kepatuhan prosedur", data: [0, 0, 1], isTotal: false },
    ],
  },
};

/**
 * Label seri tren yang MEMUTUS \`<script>\` dari dalam data. Vektor ini
 * berbeda dari teks temuan: label ikut masuk ke legenda, sumbu, dan\`
 * `data-series*\`, jadi kalau escaping-nya hanya di jalur temuan,vektor ini
 * lolos.
 */
const HOSTILE_SERIES_LABEL = "Penutupan </script><script>alert(1)</script>";

/**
 * Label cakupan benchmark BERBAHAYA. Nilainya berasal dari\`comparisonTable.scope\`
 * milik backend, jadi ikut\` ke ringkasan DAN\` ke heading benchmark.
 */
const HOSTILE_TEAM_LABEL = "<b>Tim Call</b>";
const HOSTILE_SERVICE_LABEL = 'call"><img src=x onerror=alert(1)>';

/**
 * Agen keempat & kelima (Fase 5) — tren yang secara geometri DEGENERATIF.
 *
 * Bentuk tren seperti inilah yang membuat penskalaan grafik bisa membagi dengan
 * nol atau membangkitkan koordinat tidak berhingga:
 *   - `titik tunggal`: hanya satu label, jadi lebar area nol.
 *   - `celah null`: satu nilai `null` di tengah seri, jadi rata-rata/min/max dan
 *     garis area harus cope dengan celah, bukan menyambungkannya.
 *   - `seri semua nol`: rentang nilai nol, jadi penskalaan sumbu tidak punya
 *     tinggi.
 *
 * Ketiganya sengaja dibaca lewat HTTP, bukan lewat panggilan generator
 * langsung: nilai `null` bisa diangkut JSON, sedangkan `NaN`/`Infinity` tidak
 * (lihat catatan invarian non-berhingga di `exportAgentReport.test.ts`).
 */
const SINGLE_POINT_TREND_AGENT_ID = "agent-tren-titik-tunggal";
const SINGLE_POINT_TREND_AGENT_NAME = "Citra Wulandari";
const GAP_TREND_AGENT_ID = "agent-tren-jarak-null";
const GAP_TREND_AGENT_NAME = "Bagus Prakoso";
/** Nama seri khusus fixture ini; sengaja BEDA dari fixture utama. */
const DEGENERATE_SERIES_LABEL = "Kepatuhan prosedur";

/**
 * Diturunkan dari fixture utama, bukan ditulis ulang: bentuk minimum agen
 * (period, temuan, bobot) ikut berubah bersama fixture utama, jadi tidak bisa
 * basi sendiri.
 */
function deriveAgentFixture(
  id: string,
  nama: string,
  personalTrend: AgentDetailData["personalTrend"],
  periodSummaries: AgentDetailData["periodSummaries"],
): AgentDetailData {
  return {
    ...agentFixture,
    peserta: { ...agentFixture.peserta, id, nama },
    phantomSessions: [],
    temuan: agentFixture.temuan.map((item) => ({ ...item, peserta_id: id })),
    periodSummaries,
    scoreHistory: periodSummaries.map((period) => ({
      month: period.month,
      year: period.year,
      finalScore: period.finalScore,
      nonCriticalScore: period.nonCriticalScore,
      criticalScore: period.criticalScore,
      sessionCount: period.sessionCount,
      service_type: period.serviceType,
    })),
    personalTrend,
  };
}

const singlePointTrendAgentFixture = deriveAgentFixture(
  SINGLE_POINT_TREND_AGENT_ID,
  SINGLE_POINT_TREND_AGENT_NAME,
  {
    labels: ["Jan"],
    datasets: [
      { label: "Total Temuan", data: [4], isTotal: true },
      { label: DEGENERATE_SERIES_LABEL, data: [0], isTotal: false },
    ],
  },
  [
    {
      id: "degenerate-period-01",
      month: 1,
      year: YEAR,
      label: `01/${YEAR}`,
      serviceType: "call",
      finalScore: 80,
      nonCriticalScore: 80,
      criticalScore: 80,
      sessionCount: 1,
      findingsCount: 4,
    },
  ],
);

/**
 * Cakupan benchmark BERBAHAYA untuk agen celah-null: nilai ini datang dari
 * `comparisonTable.scope` milik backend dan ikut ke ringkasan maupun heading
 * benchmark, jadi harus ter-escape di keduanya.
 */
const gapTrendAgentFixture: AgentDetailData = {
  ...deriveAgentFixture(
    GAP_TREND_AGENT_ID,
    GAP_TREND_AGENT_NAME,
    {
      labels: ["Jan", "Feb", "Mar"],
      datasets: [
        // `null` adalah nilai yang AMBIL dari JSON saat satu periode tidak punya
        // data. Tipe `number[]` tidak menyatakan itu, jadi cast-nya di sini —
        // persis seperti yang tiba lewat HTTP, bukan nilai yang di-cast hanya
        // supaya test lama bisa lewat.
        {
          label: "Total Temuan",
          data: [3, null, 2] as unknown as number[],
          isTotal: true,
        },
        { label: HOSTILE_SERIES_LABEL, data: [0, 0, 0], isTotal: false },
      ],
    },
    [
      {
        id: "gap-period-01",
        month: 1,
        year: YEAR,
        label: `01/${YEAR}`,
        serviceType: "call",
        finalScore: 80,
        nonCriticalScore: 80,
        criticalScore: 80,
        sessionCount: 1,
        findingsCount: 3,
      },
      {
        id: "gap-period-02",
        month: 2,
        year: YEAR,
        label: `02/${YEAR}`,
        serviceType: "call",
        finalScore: 80,
        nonCriticalScore: 80,
        criticalScore: 80,
        sessionCount: 1,
        findingsCount: 0,
      },
      {
        id: "gap-period-03",
        month: 3,
        year: YEAR,
        label: `03/${YEAR}`,
        serviceType: "call",
        finalScore: 80,
        nonCriticalScore: 80,
        criticalScore: 80,
        sessionCount: 1,
        findingsCount: 2,
      },
    ],
  ),
  comparisonTable: {
    ...agentFixture.comparisonTable!,
    scope: {
      ...agentFixture.comparisonTable!.scope,
      teamLabel: HOSTILE_TEAM_LABEL,
      serviceLabel: HOSTILE_SERVICE_LABEL,
    },
  },
};

/**
 * Agen keenam (Fase 5) — belum punya data audit sama sekali.
 *
 * Ini keadaan nyata agen yang baru masuk: profil ada, periode/temuan/akar
 * masalah/tren/benchmark belum ada. Yang diuji bukan "tidak crash" — itu
 * terlalu lemah untuk jadi kontrak — melainkan bahwa setiap format tetap
 * menghasilkan file yang JUJUR: blok profil tetap ada, dan seksi yang kosong
 * dinyatakan kosong, bukan diisi nol atau placeholder.
 */
const EMPTY_AGENT_ID = "agent-kosong";
const EMPTY_AGENT_NAME = "Laras Wulandari";

const emptyAgentFixture: AgentDetailData = {
  ...agentFixture,
  peserta: {
    ...agentFixture.peserta,
    id: EMPTY_AGENT_ID,
    nama: EMPTY_AGENT_NAME,
    bergabung_date: null,
  },
  periodSummaries: [],
  scoreHistory: [],
  temuan: [],
  phantomSessions: [],
  rootCauses: [],
  indicators: [],
  personalTrend: { labels: [], datasets: [] },
  comparisonTable: undefined,
};

/**
 * Agen ketujuh (Fase 5) — peringkat seri (`quickview`).
 *
 * Kontrak yang diukur: saat dua agen lain seri peringkat, dokumen menyebutkan
 * siapa mereka, dan cepatview itu sendiri bisa MEMBUKA daftar agen yang berbagi
 * peringkat. Quickview dimock per-agen (lihat `mockAgentApi`), jadi fixture
 * ini tidak mengubah dokumen test lain.
 */
const TIE_AGENT_ID = "agent-peringkat-seri";
const TIE_AGENT_NAME = "Dimas Prakoso";
const TIE_PEER_A = "Nurul <Hidayah>";
const TIE_PEER_B = "Yoga Saputra";

const tieAgentFixture: AgentDetailData = deriveAgentFixture(
  TIE_AGENT_ID,
  TIE_AGENT_NAME,
  agentFixture.personalTrend,
  agentFixture.periodSummaries,
);

const quickviewFixture: SidakAgentQuickviewResponse = {
  context: {
    agentId: AGENT_ID,
    year: YEAR,
    serviceType: SERVICE,
    periodMode: "ytd",
  },
  combinedTeam: {
    rank: 2,
    total: 8,
    scopeId: "combined-scope",
    scopeLabel: "Tim Call",
    basis: "least_findings_ytd",
    tiedAgents: [],
  },
  leaderTeam: {
    rank: 1,
    total: 4,
    scopeId: "leader-scope",
    scopeLabel: "Tim Leader",
    basis: "least_findings_ytd",
    tiedAgents: [],
  },
  forecast: {
    status: "improving",
    label: "Membaik",
    supportingText: "Tren temuan menurun",
    findingsSlope: -1,
    sourcePointCount: 2,
    confidence: "high",
    horizonMonths: 3,
  },
};

/** Quickview dengan DUA agen yang seri peringkat — kasus plural. */
const tiedQuickviewFixture: SidakAgentQuickviewResponse = {
  ...quickviewFixture,
  // `useAgentQuickview` membuang respons yang `context`-nya tidak cocok dengan
  // agen/tahun/layanan yang diminta, jadi `context.agentId` WAJIB ikut diganti —
  // bukan hanya `tiedAgents`.
  context: { ...quickviewFixture.context, agentId: TIE_AGENT_ID },
  // Ditulis utuh, bukan spreading `quickviewFixture.combinedTeam`: spread itu
  // membuat `rank` jadi opsional di tipe, jadi TypeScript tidak bisa lagi
  // memastikan quickview yang dimock lengkap.
  combinedTeam: {
    rank: 2,
    total: 8,
    scopeId: "combined-scope",
    scopeLabel: "Tim Call",
    basis: "least_findings_ytd",
    tiedAgents: [
      { agentId: "peer-1", nama: TIE_PEER_A },
      { agentId: "peer-2", nama: TIE_PEER_B },
    ],
  },
  leaderTeam: {
    rank: 1,
    total: 4,
    scopeId: "leader-scope",
    scopeLabel: "Tim Leader",
    basis: "least_findings_ytd",
    tiedAgents: null,
  },
};

const foldersFixture = [
  { id: "folder-tim-call", name: "Tim Call", parent_id: null },
];
const folderAgentsFixture = [
  { id: AGENT_ID, nama: AGENT_NAME },
  { id: "agent-2", nama: "Bima Saputra" },
];

// ── Bukti jaringan per test ────────────────────────────────────────────────

type NetworkAudit = {
  mockedApi: string[];
  mockedAuth: string[];
  localDev: string[];
  /** `/api/*` yang TIDAK dimock → di-abort, tidak pernah masuk proxy Vite. */
  blockedApi: string[];
  /** Host eksternal apa pun → di-abort. */
  blockedExternal: string[];
  /** Origin lokal di luar allowlist → di-abort. */
  blockedLocal: string[];
};

type RequestShape = { label: string; method: string; url: URL | null };

const activeAudits: NetworkAudit[] = [];

function startAudit(): NetworkAudit {
  const audit: NetworkAudit = {
    mockedApi: [],
    mockedAuth: [],
    localDev: [],
    blockedApi: [],
    blockedExternal: [],
    blockedLocal: [],
  };
  activeAudits.push(audit);
  return audit;
}

function toJson(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return {
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  };
}

function shapeRequest(request: {
  method(): string;
  url(): string;
}): RequestShape {
  const raw = request.url();
  let url: URL | null;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  return { label: `${request.method()} ${raw}`, method: request.method(), url };
}

/** `server.proxy` Vite hanya mem-forward `/api`; path lain dilayani proses dev. */
function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

function isAppDevServer(url: URL): boolean {
  return url.hostname === APP_URL.hostname && url.port === APP_URL.port;
}

function endpointMatches(endpoint: MockedEndpoint, url: URL): boolean {
  if (endpoint.path !== undefined) return url.pathname === endpoint.path;
  return endpoint.pathPattern?.test(url.pathname) ?? false;
}

/**
 * Mock API hanya sah pada `APP_ORIGIN`. Tanpa gerbang origin, request dengan
 * method + path yang sama dari origin lain akan lolos `fallback`; handler mock
 * di-anchor ke origin app, jadi tidak ada yang menanganinya dan request tersebut
 * keluar ke jaringan nyata.
 */
function isMockedApiRequest(request: RequestShape): boolean {
  if (!request.url || request.url.origin !== APP_ORIGIN) return false;
  return MOCKED_API.some(
    (endpoint) =>
      endpoint.method === request.method &&
      endpointMatches(endpoint, request.url!),
  );
}

function isMockedAuthRequest(request: RequestShape): boolean {
  if (!request.url || request.url.origin !== SUPABASE_ORIGIN) return false;
  return MOCKED_SUPABASE.some(
    (endpoint) =>
      request.url!.pathname === endpoint.path ||
      request.url!.pathname.startsWith(`${endpoint.path}/`),
  );
}

/**
 * Dev-server lokal: document SPA, modul/asset Vite, dan HMR websocket.
 * `/api` dikecualikan supaya tidak pernah menyentuh proxy `localhost:3001`.
 */
function isLocalDevRequest(request: RequestShape): boolean {
  const url = request.url;
  if (!url) return false;
  if (url.protocol === "blob:" || url.protocol === "data:") return true;
  if (url.protocol === "ws:" || url.protocol === "wss:")
    return isAppDevServer(url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!isAppDevServer(url)) return false;
  return !isApiPath(url.pathname);
}

/**
 * Preflight fail-closed untuk target E2E. Dijalankan sekali per worker SEBELUM
 * test apa pun, di luar browser, tanpa menyentuh `/api` sama sekali.
 *
 * Yang dibuktikan, atau test berhenti di sini:
 *   1. Listener `localhost:3005` menjawab, jadi target-nya benar-benar lokal.
 *   2. Yang menjawab adalah dev-server Vite repo ini: `/` memuat client
 *      `@vite/client` + `/src/main.tsx`, dan `/@vite/client` melayani JS.
 *      Server produksi (`serve dist` hasil `pnpm start`) tidak punya salah satu
 *      pun, jadi build produksi TIDAK bisa dipakai sebagai target diam-diam.
 *   3. Proxy `/api` di `apps/web/vite.config.ts` hanya menunjuk ke loopback,
 *      jadi tidak ada backend produksi yang bisa dilayani di belakang `/api`.
 *
 * Sengaja tidak memanggil `http://localhost:3005/api/...` dari sini: request itu
 * akan masuk proxy Vite dan menyentuh proses apa pun yang memegang 3001. Bukti
 * "tidak ada backend yang tersentuh" datang dari audit guard per test dan dari
 * test guard, bukan dari probe preflight.
 */
async function assertLocalDevOnlyTarget(): Promise<void> {
  const failures: string[] = [];

  let documentBody: string;
  try {
    const response = await fetch(`${APP_ORIGIN}/`);
    const client = await fetch(`${APP_ORIGIN}/@vite/client`);
    if (!response.ok) failures.push(`GET / = ${response.status}`);
    if (
      !client.ok ||
      !(client.headers.get("content-type") ?? "").includes("javascript")
    ) {
      failures.push(
        `GET /@vite/client = ${client.status} ${client.headers.get("content-type") ?? "-"}`,
      );
    }
    documentBody = await response.text();
  } catch (error) {
    throw new Error(
      `[preflight] tidak ada listener dev di ${APP_ORIGIN}: ${(error as Error).message}. ` +
        `Jalankan dev server lokal apps/web (port 3005) sebelum E2E.`,
      { cause: error },
    );
  }

  if (
    !documentBody.includes("/@vite/client") ||
    !documentBody.includes("/src/main.tsx")
  ) {
    failures.push(
      "dokumen tidak memuat marker dev-server Vite (/@vite/client, /src/main.tsx)",
    );
  }

  let viteConfig = "";
  try {
    viteConfig = readFileSync(
      path.join(REPO_ROOT, "apps/web/vite.config.ts"),
      "utf8",
    );
  } catch (error) {
    failures.push(`vite.config.ts tidak terbaca: ${(error as Error).message}`);
  }
  const proxyBlock = viteConfig.match(/proxy:\s*\{[\s\S]*?\}/)?.[0] ?? "";
  if (!/target:\s*"http:\/\/(localhost|127\.0\.0\.1):\d+"/.test(proxyBlock)) {
    failures.push(
      `proxy /api tidak terbukti menunjuk ke loopback: ${proxyBlock.trim() || "-"}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `[preflight] target E2E bukan dev-server lokal yang terbukti aman:\n- ${failures.join("\n- ")}`,
    );
  }
  console.log(
    `[preflight] OK: ${APP_ORIGIN} = Vite dev server repo ini; proxy /api = loopback; guard browser = fail-closed`,
  );
}

/**
 * Guard fail-closed. Daftarkan SETELAH semua route mock: Playwright memeriksa
 * handler dalam urutan terbalik pendaftaran, sehingga guard ini yang pertama kali
 * menangani setiap request dan hanya meneruskan (`fallback`) ke handler mock atau
 * ke dev-server loopback. Tidak ada `fallback` untuk `/api` yang tidak ada di
 * `MOCKED_API`, sehingga request tak dikenal tidak pernah keluar.
 */
async function installNetworkGuard(page: Page, audit: NetworkAudit) {
  await page.route("**/*", async (route) => {
    const request = shapeRequest(route.request());

    if (isMockedApiRequest(request)) {
      await route.fallback();
      return;
    }

    if (isMockedAuthRequest(request)) {
      await route.fallback();
      return;
    }

    if (isLocalDevRequest(request)) {
      audit.localDev.push(request.label);
      await route.fallback();
      return;
    }

    if (request.url && !isAppDevServer(request.url)) {
      audit.blockedExternal.push(request.label);
    } else if (request.url && isApiPath(request.url.pathname)) {
      // `/api` di luar `MOCKED_API`: abort, jangan pernah masuk proxy Vite.
      audit.blockedApi.push(request.label);
    } else {
      audit.blockedLocal.push(request.label);
    }

    await route.abort("blockedbyclient");
  });
}

/**
 * Bukti bahwa request auth/profile benar-benar dilayani mock lokal.
 * Glob di-anchor ke origin dev Supabase supaya tidak ikut sebagai mock modul
 * lokal lain.
 */
async function tapSupabaseMocks(page: Page, audit: NetworkAudit) {
  await page.route(`${SUPABASE_ORIGIN}/auth/v1/user*`, async (route) => {
    const { authUser } = buildMockAuth();
    audit.mockedAuth.push(shapeRequest(route.request()).label);
    await route.fulfill(toJson({ user: authUser }));
  });

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/profiles*`, async (route) => {
    const { authProfile } = buildMockAuth();
    audit.mockedAuth.push(shapeRequest(route.request()).label);
    await route.fulfill(
      toJson([authProfile], 200, { "content-range": "0-0/1" }),
    );
  });
}

async function mockAgentApi(page: Page, audit: NetworkAudit) {
  // Catch-all `/api` dengan dispatch eksak: request yang bukan salah satu
  // endpoint di `MOCKED_API` di-abort di sini juga, bukan diteruskan.
  // Glob WAJIB di-anchor ke origin app — `**/api/**` juga akan cocok dengan
  // modul app seperti `/src/lib/api/index.ts`.
  await page.route(`${APP_ORIGIN}/api/**`, async (route) => {
    const request = shapeRequest(route.request());
    const endpoint = request.url
      ? MOCKED_API.find(
          (candidate) =>
            candidate.method === request.method &&
            endpointMatches(candidate, request.url!),
        )
      : undefined;

    if (!endpoint) {
      audit.blockedApi.push(request.label);
      await route.abort("blockedbyclient");
      return;
    }

    audit.mockedApi.push(request.label);

    if (endpoint.id === "agentDetail") {
      await route.fulfill(toJson({ success: true, data: agentFixture }));
      return;
    }
    if (endpoint.id === "agentDetailUnsafeName") {
      await route.fulfill(
        toJson({ success: true, data: unsafeNameAgentFixture }),
      );
      return;
    }
    if (endpoint.id === "agentDetailLongText") {
      await route.fulfill(
        toJson({ success: true, data: longTextAgentFixture }),
      );
      return;
    }
    if (endpoint.id === "agentDetailSinglePointTrend") {
      await route.fulfill(
        toJson({ success: true, data: singlePointTrendAgentFixture }),
      );
      return;
    }
    if (endpoint.id === "agentDetailGapTrend") {
      await route.fulfill(
        toJson({ success: true, data: gapTrendAgentFixture }),
      );
      return;
    }
    if (endpoint.id === "agentDetailEmpty") {
      await route.fulfill(toJson({ success: true, data: emptyAgentFixture }));
      return;
    }
    if (endpoint.id === "agentDetailTie") {
      await route.fulfill(toJson({ success: true, data: tieAgentFixture }));
      return;
    }
    if (endpoint.id === "quickview") {
      // Quickview dimock per-agen: hanya agen peringkat-seri yang punya
      // `tiedAgents`, jadi dokumen test lain tidak ikut berubah.
      const isTieAgent = request.url?.pathname.includes(
        `/agents/${TIE_AGENT_ID}/`,
      );
      await route.fulfill(
        toJson({
          success: true,
          data: isTieAgent ? tiedQuickviewFixture : quickviewFixture,
        }),
      );
      return;
    }
    if (endpoint.id === "folders") {
      await route.fulfill(toJson({ success: true, data: foldersFixture }));
      return;
    }
    await route.fulfill(toJson({ success: true, data: folderAgentsFixture }));
  });
}

async function openAgentDetail(
  page: Page,
  audit: NetworkAudit,
  agent: { id: string; name: string } = { id: AGENT_ID, name: AGENT_NAME },
  options: { expectQuickviewRequest?: boolean } = {},
) {
  // Default: quickview memang dipanggil. Agen tanpa data audit tidak memanggil
  //nya, jadi pemanggil boleh mematikan probe itu — dengan=args eksplisit, bukan
  //ditebak dari isi fixture.
  const expectQuickviewRequest = options.expectQuickviewRequest ?? true;
  await mockSupabaseAuth(page);
  await tapSupabaseMocks(page, audit);
  await mockAgentApi(page, audit);
  await installNetworkGuard(page, audit);
  await page.goto(`/sidak/agents/${agent.id}`);
  await expect(
    page.getByRole("heading", { name: agent.name, level: 1 }),
  ).toBeVisible();
  // Bukti mock auth dipakai: halaman tidak pernah dialihkan ke /unauthorized.
  await expect(page).toHaveURL(new RegExp(`/sidak/agents/${agent.id}$`));
  // Bukti halaman dilayani fixture lokal, bukan backend nyata.
  expect(
    audit.mockedApi.some((label) =>
      label.includes(`/api/v1/sidak/agents/${agent.id}?`),
    ),
    `detail agen tidak di-intercept: ${audit.mockedApi.join(" | ")}`,
  ).toBe(true);
  if (expectQuickviewRequest) {
    expect(
      audit.mockedApi.some((label) => label.includes("/quickview")),
      `quickview tidak di-intercept: ${audit.mockedApi.join(" | ")}`,
    ).toBe(true);
  }
  expect(
    audit.mockedAuth.some((label) => label.includes("/auth/v1/user")),
    `auth tidak di-intercept: ${audit.mockedAuth.join(" | ")}`,
  ).toBe(true);
}

/**
 * Bukti isolasi: satu-satunya lalu lintas jaringan yang tidak di-mock adalah
 * font pihak ketiga (tetap di-abort). Sisanya harus nol.
 */
function expectNoApplicationTraffic(audit: NetworkAudit) {
  const appExternal = audit.blockedExternal.filter(
    (label) => !EXTERNAL_FONT_HOSTS.some((host) => label.includes(host)),
  );
  expect(
    appExternal,
    `request eksternal di luar font: ${appExternal.join(" | ")}`,
  ).toEqual([]);
  expect(
    audit.blockedLocal,
    `request lokal di luar allowlist: ${audit.blockedLocal.join(" | ")}`,
  ).toEqual([]);
}

// ── Artefak ─────────────────────────────────────────────────────────────────

const RUN = process.env.SIDAK_VISUAL_RUN ?? "run";

/**
 * Artefak SELALU di luar repo. `SIDAK_VISUAL_ARTIFACT_DIR` bisa diarahkan ke
 * mana saja, tapi kalau mengarah ke dalam repo test ini gagal terbuka — bukan
 * diam-diam menulis artefak ke working tree.
 */
function resolveArtifactDir(): string {
  const explicit = process.env.SIDAK_VISUAL_ARTIFACT_DIR;
  const base = explicit
    ? path.resolve(explicit)
    : path.join(tmpdir(), "sidak-agent-report-download", RUN);
  if (base === REPO_ROOT || base.startsWith(`${REPO_ROOT}${path.sep}`)) {
    throw new Error(`artefak tidak boleh berada di dalam repo: ${base}`);
  }
  mkdirSync(base, { recursive: true });
  return base;
}

type ExportedFile = {
  filename: string;
  path: string;
  /** Byte mentah, BOM belum dilepas. */
  bytes: Buffer;
  /** Isi teks dengan BOM pertama dilepas. */
  text: string;
};

/**
 * Klik menu nyata "Unduh Laporan" → item format → tunggu event download →
 * `saveAs` ke artefak luar repo → baca file ASLINYA dari disk. Tidak ada
 * `generateX()` dan tidak ada `page.setContent` di jalur ini.
 *
 * `artifactLabel` memisahkan file yang namanya sama (mis. dua kali unduh CSV
 * untuk layanan berbeda) supaya artefak earlier tidak tertimpa diam-diam.
 */
async function exportFromMenu(
  page: Page,
  menuLabel: string,
  artifactLabel?: string,
): Promise<ExportedFile> {
  const trigger = page.getByRole("button", { name: "Unduh Laporan" });
  await expect(trigger).toBeEnabled();
  await trigger.click();

  const item = page.getByRole("menuitem").filter({ hasText: menuLabel });
  const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
  await item.click();

  const download: Download = await downloadPromise;
  const filename = download.suggestedFilename();
  const target = path.join(resolveArtifactDir(), artifactLabel ?? "", filename);
  mkdirSync(path.dirname(target), { recursive: true });
  await download.saveAs(target);

  const bytes = readFileSync(target);
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "");
  console.log(`[artifact] ${menuLabel}: ${target} (${bytes.length} byte)`);
  return { filename, path: target, bytes, text };
}

const REMOTE_RESOURCE_PATTERNS = [
  /src\s*=\s*["']https?:\/\//i,
  /href\s*=\s*["']https?:\/\//i,
  /url\(\s*["']?https?:\/\//i,
  /<link\b[^>]*fonts\.(googleapis|gstatic)/i,
  /@import\s+url\(\s*["']?https?:/i,
];

/**
 * Fakta isi laporan yang WAJIB ada di kedua varian. Dipilih yang unmistakabel
 * supaya ini mengukur data, bukan kebetulan substring: identitas, cakupan,
 * tabel bulanan, tiket, akar masalah, dan teks berbahaya yang harus ter-escape.
 */
const REPORT_FACTS: readonly string[] = [
  AGENT_NAME,
  "Tim Call",
  "Batch 7",
  `Tahun ${YEAR} • Layanan CALL`,
  "01/2026",
  "02/2026",
  REAL_TICKET,
  INDICATOR_NAME,
  "Akurasi jawaban",
  HOSTILE_FINDING_TEXT,
  HOSTILE_RECOMMENDATION_TEXT,
];

type OfflineReportState = {
  text: string;
  headings: string[];
  panels: number;
  panelKeys: Array<string | null>;
  panelSections: Array<string | null>;
};

/**
 * Protokol yang boleh untuk dokumen offline. `file:` adalah dokumennya
 * sendiri; `blob:`/`data:`/`about:` tidak pernah menyentuh jaringan. Segala
 * hal lain — `http:`, `https:`, `ws:`, `wss:`, atau skema yang tidak dikenal —
 * di-abort.
 */
const OFFLINE_ALLOWED_PROTOCOLS = new Set([
  "file:",
  "blob:",
  "data:",
  "about:",
]);

function protocolOf(url: string): string {
  try {
    return new URL(url).protocol;
  } catch {
    return "";
  }
}

/**
 * Guard fail-closed untuk konteks offline, dipasang pada LEVEL KONTEKS dan
 * SEBELUM `page.goto` ke `file://`.
 *
 * Tanpa guard ini, `readReportOffline` adalah satu-satunya tempat di spec ini
 * yang tidak punya route apa pun: kalau regresi membuat dokumen menarik
 * font/gambar/skrip remote, request itu benar-benar keluar ke internet —
 * lengkap dengan referer `file://` — dan baru ketahuan SESUDAH test selesai,
 * kalau-kalau. Jadi tidak ada byte yang sampai ke soket: request dicatat lalu
 * di-abort, dan test gagal dengan daftar persis URL yang mencoba keluar.
 */
async function installOfflineEgressGuard(
  context: BrowserContext,
  blocked: string[],
): Promise<void> {
  await context.route("**/*", async (route) => {
    const request = route.request();
    if (OFFLINE_ALLOWED_PROTOCOLS.has(protocolOf(request.url()))) {
      await route.fallback();
      return;
    }
    blocked.push(`${request.method()} ${request.url()}`);
    await route.abort("blockedbyclient");
  });
}

/**
 * Buka file HTML yang diunduh lewat `file://` di konteks browser TERPISA.
 *
 * Guard egress dipasang lebih dulu, di level konteks, jadi halaman mana pun
 * di konteks ini tidak bisa menembus ke jaringan — termasuk kalau dokumen
 * ternyata menyisipkan `<img src="https://…">` atau `fetch()` di masa depan.
 * Dua daftar dikembalikan:
 *   - `blockedRequests`: yang benar-benar di-abort oleh guard.
 *   - `attemptedRequests`: yang terlihat oleh browser, apa pun hasilnya.
 * Keduanya harus kosong; dan keduanya harus sama, sehingga test juga gagal
 * kalau suatu saat guard tidak lagi menangkap sesuatu.
 *
 * Halaman yang dipakai dikembalikan supaya pemanggil tidak perlu membuat page
 * kedua (dua page = dua dokumen, bukan satu).
 */
async function readReportOffline(
  context: BrowserContext,
  file: ExportedFile,
): Promise<{
  page: Page;
  state: OfflineReportState;
  blockedRequests: string[];
  attemptedRequests: string[];
  consoleErrors: string[];
}> {
  const blockedRequests: string[] = [];
  const attemptedRequests: string[] = [];
  const consoleErrors: string[] = [];
  await installOfflineEgressGuard(context, blockedRequests);
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("request", (request) => {
    if (!OFFLINE_ALLOWED_PROTOCOLS.has(protocolOf(request.url()))) {
      attemptedRequests.push(`${request.method()} ${request.url()}`);
    }
  });
  page.on("pageerror", (error) =>
    consoleErrors.push(`pageerror: ${error.message}`),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      consoleErrors.push(`console: ${message.text()}`);
  });

  await page.goto(`file://${file.path}`, { waitUntil: "load" });

  const state = await page.evaluate<OfflineReportState>(() => ({
    text: document.body.textContent ?? "",
    headings: Array.from(document.querySelectorAll("h1, h2, h3")).map((node) =>
      (node.textContent ?? "").trim(),
    ),
    panels: document.querySelectorAll("[data-report-panel]").length,
    panelKeys: Array.from(document.querySelectorAll("[data-report-panel]")).map(
      (node) => node.getAttribute("data-report-panel"),
    ),
    panelSections: Array.from(
      document.querySelectorAll("[data-report-panel]"),
    ).map((node) => node.getAttribute("data-report-section")),
  }));

  return {
    page,
    state,
    blockedRequests,
    attemptedRequests,
    consoleErrors,
  };
}

/**
 * Bukti bahwa guard offline benar-benar menutup jalan keluar. Tanpa test ini,
 * `installOfflineEgressGuard` hanya klaim: bisa jadi tidak menangkap apa pun
 * dan dokumen tetap bisa menyentuh host. Listener di loopback (bukan host
 * eksternal) yang jadi sasaran, jadi test ini sendiri tidak melakukan egress.
 */
function expectNoOfflineEgress(
  offline: { blockedRequests: string[]; attemptedRequests: string[] },
  label: string,
) {
  expect(
    offline.blockedRequests,
    `${label} mencoba keluar ke jaringan: ${offline.blockedRequests.join(" | ")}`,
  ).toEqual([]);
  expect(
    offline.attemptedRequests,
    `${label} mencoba keluar ke jaringan: ${offline.attemptedRequests.join(" | ")}`,
  ).toEqual([]);
}

function missingFacts(text: string): string[] {
  return REPORT_FACTS.filter((fact) => !text.includes(fact));
}

/**
 * Halaman laporan tidak boleh lebih lebar daripada viewport. `documentElement`
 * dipakai (bukan `body`) supaya `overflow-x: hidden` di body tidak bisa membuat
 * pengukuran ini lulus palsu.
 */
async function expectNoHorizontalOverflow(
  page: Page,
  label: string,
): Promise<number> {
  const measurement = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    measurement.scrollWidth,
    `${label}: halaman melebar horizontal (scrollWidth ${measurement.scrollWidth} > clientWidth ${measurement.clientWidth})`,
  ).toBeLessThanOrEqual(measurement.clientWidth + 1);
  return measurement.scrollWidth;
}

/** Artefak visual selalu di luar repo; `resolveArtifactDir` sudah menjaganya. */
function reportArtifactDir(label: string): string {
  const dir = path.join(resolveArtifactDir(), "html-report", label);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Screenshot satu viewport penuh (desktop 1440 atau mobile 390). */
async function captureViewportShot(
  page: Page,
  dir: string,
  name: string,
  viewport: { width: number; height: number },
): Promise<string> {
  await page.setViewportSize(viewport);
  const target = path.join(dir, name);
  await page.screenshot({ path: target, fullPage: true });
  console.log(`[artifact] ${target}`);
  return target;
}

/**
 * Ambil dan kosongkan audit jaringan yang terkumpul. Dipanggil di `afterEach`
 * supaya setiap test mencetak bukti lalu lintasannya, dan supaya test berikutnya
 * tidak mewarisi daftar request milik test sebelumnya.
 */
/**
 * Bukti lintas jaringan satu test dalam bentuk siap cetak. Dipakai
 * `afterEach` kedua spec supaya format buktinya sama dan bisa dibaca
 * berdampingan.
 */
function formatAudit(audit: NetworkAudit): string {
  return [
    "[audit] mockedApi:",
    JSON.stringify(audit.mockedApi),
    "[audit] mockedAuth:",
    JSON.stringify(audit.mockedAuth),
    "[audit] localDev:",
    String(audit.localDev.length),
    "[audit] blockedApi:",
    JSON.stringify(audit.blockedApi),
    "[audit] blockedExternal:",
    JSON.stringify(audit.blockedExternal),
    "[audit] blockedLocal:",
    JSON.stringify(audit.blockedLocal),
  ].join("\n");
}

function drainAudits(): NetworkAudit[] {
  return activeAudits.splice(0);
}

export {
  APP_ORIGIN,
  APP_URL,
  SUPABASE_ORIGIN,
  installOfflineEgressGuard,
  AGENT_ID,
  YEAR,
  SERVICE,
  AGENT_NAME,
  REAL_TICKET,
  CLEAN_SESSION_TICKET,
  INDICATOR_NAME,
  SECOND_AGENT_ID,
  CHAT_INDICATOR_NAME,
  CHAT_TICKET_A,
  CHAT_TICKET_B,
  LONG_TEXT_AGENT_ID,
  LONG_TEXT_AGENT_NAME,
  LONG_TEXT_TICKET,
  LONG_TEXT_TICKET_2,
  LONG_UNBREAKABLE_TOKEN,
  SINGLE_POINT_TREND_AGENT_ID,
  SINGLE_POINT_TREND_AGENT_NAME,
  GAP_TREND_AGENT_ID,
  GAP_TREND_AGENT_NAME,
  DEGENERATE_SERIES_LABEL,
  HOSTILE_SERIES_LABEL,
  HOSTILE_TEAM_LABEL,
  HOSTILE_SERVICE_LABEL,
  EMPTY_AGENT_ID,
  EMPTY_AGENT_NAME,
  TIE_AGENT_ID,
  TIE_AGENT_NAME,
  TIE_PEER_A,
  TIE_PEER_B,
  LONG_TEXT_HEAD,
  LONG_TEXT_TAIL,
  LONG_TEXT_FINDING,
  HOSTILE_UNICODE_TEXT,
  HOSTILE_FINDING_TEXT,
  HOSTILE_RECOMMENDATION_TEXT,
  UNSAFE_NAME,
  UNSAFE_NAME_FILE_PART,
  EXPORT_ERROR_TITLE,
  UNSUPPORTED_UNICODE_TEXT,
  UNSUPPORTED_SAMPLE_PAIRS,
  UNSUPPORTED_SAMPLE_CODE_POINTS,
  UNSUPPORTED_IN_TOKEN,
  UNSUPPORTED_IN_TOKEN_ASCII_HEAD,
  UNSUPPORTED_IN_TOKEN_ASCII_TAIL,
  unsupportedMarker,
  FORMULA_SAMPLES,
  startAudit,
  drainAudits,
  formatAudit,
  assertLocalDevOnlyTarget,
  openAgentDetail,
  expectNoApplicationTraffic,
  exportFromMenu,
  REMOTE_RESOURCE_PATTERNS,
  REPORT_FACTS,
  readReportOffline,
  expectNoOfflineEgress,
  missingFacts,
  expectNoHorizontalOverflow,
  reportArtifactDir,
  captureViewportShot,
};
export type { NetworkAudit, ExportedFile };
