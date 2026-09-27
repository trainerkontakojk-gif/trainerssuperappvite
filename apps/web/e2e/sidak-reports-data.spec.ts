import { expect, test, type Download, type Locator, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMockAuth, mockSupabaseAuth } from "./helpers/mockAuth";

/**
 * E2E untuk workspace `/sidak/reports-data`.
 *
 * Kontrak yang dibuktikan (docs/SIDAK_LOGIC_AND_SCORING.md — "Logika Workspace Data"):
 *   - Eksklusi phantom: `is_phantom_padding = true` tidak pernah tampil.
 *   - Findings-only: hanya baris dengan Temuan (`ketidaksesuaian`) DAN
 *     Rekomendasi (`sebaiknya`) yang tampil, lengkap utuh.
 *   - Count, isi tabel, dan export memakai satu sumber hasil terpilih; file
 *     `.xlsx` yang benar-benar diunduh dibaca dengan `exceljs` (dependensi app
 *     yang sudah ada) dan harus memuat dua baris actionable yang sama.
 *
 * Isolasi (WAJIB — jangan dihapus, jangan longgarkan):
 *   1. Semua respons API dimock; tidak ada proses backend yang dijalankan.
 *   2. `assertLocalDevOnlyTarget` (preflight) membuktikan listener
 *      `localhost:3005` adalah dev-server Vite repo ini dan proxy `/api`-nya
 *      hanya menunjuk ke loopback — bukan build produksi atau backend lain.
 *   3. `installNetworkGuard` adalah fail-closed allowlist. Satu-satunya request
 *      yang boleh menyentuh jaringan adalah:
 *        - endpoint yang PERSIS dimock (method + path dari `MOCKED_API`),
 *        - endpoint auth/profile yang PERSIS dimock (`MOCKED_SUPABASE`),
 *        - document/aset/HMR dev-server lokal pada origin app, tanpa `/api`.
 *      Setiap request lain di-`abort`, termasuk `/api/v1/*` yang tidak dimock —
 *      ini mencegah Vite mem-proxy path tak dikenal ke backend non-test
 *      (`server.proxy` hanya `/api` → `http://localhost:3001`) dan mencegah
 *      host eksternal mana pun tersentuh.
 *   4. Bukti isolasi diuji oleh test "Guard memblokir ..." di bawah, bukan
 *      hanya diklaim.
 */

const APP_ORIGIN = "http://localhost:3005";
const APP_URL = new URL(APP_ORIGIN);
/**
 * Origin Supabase dev yang diizuinkan. Kalau env berubah, guard tetap
 * fail-closed: request di-`abort` dan test gagal terbuka, bukan diam-diam.
 */
const SUPABASE_ORIGIN = "https://ruosnjmtywcrghjgqugz.supabase.co";

/**
 * Satu-satunya endpoint yang boleh menerima mock. Method + path di sini adalah
 * allowlist milik guard DAN kunci dispatch mock, jadi tidak bisa berbeda.
 */
const MOCKED_API = [
  { id: "periods", method: "GET", path: "/api/v1/sidak/periods" },
  { id: "agents", method: "GET", path: "/api/v1/sidak/agents" },
  { id: "indicators", method: "GET", path: "/api/v1/sidak/indicators" },
  { id: "reportsData", method: "POST", path: "/api/v1/sidak/reports/data" },
] as const;

/** Mock auth/profile dari `helpers/mockAuth.ts`; hanya dua path ini. */
const MOCKED_SUPABASE = [
  { id: "authUser", path: "/auth/v1/user" },
  { id: "profiles", path: "/rest/v1/profiles" },
] as const;

/** Host pihak ketiga yang memang dipanggil index.html; tetap diblokir, hanya dicatat. */
const EXTERNAL_FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

const FINDING_ACTIONABLE_CALL =
  "Agent tidak menyebutkan tenor, bunga, dan total angsuran secara lengkap sehingga konsumen tidak dapat memahami keseluruhan kewajiban pembayaran.";
const RECOMMENDATION_ACTIONABLE_CALL =
  "Sebutkan tenor, bunga, dan total angsuran secara berurutan, lalu minta konfirmasi ulang eksplisit sebelum menutup tiket.";
const FINDING_ACTIONABLE_EMAIL =
  "Email konfirmasi tidak mencantumkan nomor polis yang diverifikasi sehingga pelanggan tidak dapat mencocokkan dokumen.";
const RECOMMENDATION_ACTIONABLE_EMAIL =
  "Tambahkan nomor polis dan ringkasan proteksi pada email konfirmasi, lalu lampirkan bukti pada audit trail.";
const FINDING_PHANTOM =
  "Sesi tanpa temuan riil ini adalah padding phantom dan tidak boleh dihitung sebagai temuan.";
const RECOMMENDATION_PHANTOM =
  "Rekomendasi phantom tidak boleh muncul di workspace data mana pun.";
const FINDING_WITHOUT_RECOMMENDATION =
  "Nomor rekening tujuan tidak dicocokkan dengan data nasabah sebelum transfer dilakukan.";
const RECOMMENDATION_WITHOUT_FINDING =
  "Tambahkan konfirmasi wajib sebelum menutup tiket agar compliance terdokumentasi.";

type ReportRow = Record<string, unknown>;

const PERIODS_FIXTURE = [
  { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
  { id: "period-2026-03", month: 3, year: 2026, label: "03/2026" },
  { id: "period-2025-12", month: 12, year: 2025, label: "12/2025" },
];

const AGENT_DIRECTORY_FIXTURE = {
  agents: [
    {
      id: "agent-1",
      nama: "Alya Pranoto",
      tim: "Tim Call",
      batch: "Batch 7",
      batch_name: "Batch 7",
      jabatan: "Agent",
      foto_url: null,
      avgScore: 82,
      trend: "up",
      trendValue: 3,
      atRisk: false,
    },
    {
      id: "agent-2",
      nama: "Bima Saputra",
      tim: "Tim Call",
      batch: "Batch 7",
      batch_name: "Batch 7",
      jabatan: "Agent",
      foto_url: null,
      avgScore: 91,
      trend: "same",
      trendValue: 0,
      atRisk: false,
    },
  ],
  batches: ["Batch 7"],
};

/** (a) actionable, dua teks panjang, punya tiket. */
const ROW_ACTIONABLE_CALL: ReportRow = {
  id: "row-actionable-call",
  service_type: "call",
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: "TKT-2026-0142",
  nilai: 2,
  ketidaksesuaian: FINDING_ACTIONABLE_CALL,
  sebaiknya: RECOMMENDATION_ACTIONABLE_CALL,
  profiler_peserta: { id: "agent-1", nama: "Alya Pranoto", batch_name: "Batch 7" },
  qa_indicators: { id: "indicator-akurasi", name: "Akurasi informasi produk" },
  qa_periods: { id: "period-2026-03", month: 3, year: 2026, label: "03/2026" },
};

/** (b) phantom: dua teks terisi, tetapi tidak boleh tampil. */
const ROW_PHANTOM: ReportRow = {
  id: "row-phantom",
  service_type: "call",
  tahun: 2026,
  is_phantom_padding: true,
  no_tiket: "TKT-2026-9001",
  nilai: 3,
  ketidaksesuaian: FINDING_PHANTOM,
  sebaiknya: RECOMMENDATION_PHANTOM,
  profiler_peserta: { id: "agent-2", nama: "Bima Saputra", batch_name: "Batch 7" },
  qa_indicators: { id: "indicator-akurasi", name: "Akurasi informasi produk" },
  qa_periods: { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
};

/** (c) Temuan kosong (whitespace), Rekomendasi terisi → bukan temuan actionable. */
const ROW_WITHOUT_FINDING: ReportRow = {
  id: "row-without-finding",
  service_type: "call",
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: "TKT-2026-0201",
  nilai: 1,
  ketidaksesuaian: "   ",
  sebaiknya: RECOMMENDATION_WITHOUT_FINDING,
  profiler_peserta: { id: "agent-2", nama: "Bima Saputra", batch_name: "Batch 7" },
  qa_indicators: { id: "indicator-kepatuhan", name: "Kepatuhan prosedur" },
  qa_periods: { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
};

/** (d) Rekomendasi kosong, Temuan terisi → bukan temuan actionable. */
const ROW_WITHOUT_RECOMMENDATION: ReportRow = {
  id: "row-without-recommendation",
  service_type: "email",
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: "TKT-2026-0202",
  nilai: 1,
  ketidaksesuaian: FINDING_WITHOUT_RECOMMENDATION,
  sebaiknya: "  ",
  profiler_peserta: { id: "agent-1", nama: "Alya Pranoto", batch_name: "Batch 7" },
  qa_indicators: { id: "indicator-dokumen", name: "Kelengkapan dokumen" },
  qa_periods: { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
};

/**
 * Fixture pagination: 28 baris actionable. `pageSize` default halaman adalah 25,
 * jadi fixture ini memaksa `Pagination` benar-benar dirender dan memotong hasil
 * menjadi 25 + 3. Dipasangkan dengan 2 baris non-actionable supaya test ini
 * sekaligus membuktikan urutan kontrak: seleksi dulu, baru pagination.
 */
const PAGINATION_TOTAL = 28;
const PAGINATION_PAGE_SIZE = 25;

/** Teks fixture pagination dibangkitkan, bukan di-hardcode 28 kali. */
const paginationFinding = (n: number) =>
  `Temuan pagination baris ${n} — agent tidak menjelaskan syarat layanan secara lengkap.`;
const paginationRecommendation = (n: number) =>
  `Rekomendasi pagination baris ${n} — latih kembali alur penjelasan syarat layanan.`;
const paginationTicket = (n: number) => `TKT-2026-${5000 + n}`;

const PAGINATION_ROWS: ReportRow[] = Array.from(
  { length: PAGINATION_TOTAL },
  (_, index): ReportRow => {
    const n = index + 1;
    return {
      id: `row-page-${n}`,
      service_type: index % 2 === 0 ? "call" : "email",
      tahun: 2026,
      is_phantom_padding: false,
      no_tiket: paginationTicket(n),
      nilai: (index % 3) + 1,
      ketidaksesuaian: paginationFinding(n),
      sebaiknya: paginationRecommendation(n),
      profiler_peserta: { nama: `Agen Uji ${n}`, batch_name: "Batch Uji" },
      qa_indicators: { name: "Parameter Uji" },
      qa_periods: { month: 3, year: 2026 },
    };
  },
);

/** Non-actionable ikut dilayani agar total respons (30) beda dari hasil (28). */
const PAGINATION_NON_ACTIONABLE: ReportRow[] = [ROW_PHANTOM, ROW_WITHOUT_FINDING];

/** Row actionable kedua agar filter dan hitungan tidak trivial. */
const ROW_ACTIONABLE_EMAIL: ReportRow = {
  id: "row-actionable-email",
  service_type: "email",
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: "TKT-2026-0310",
  nilai: 3,
  ketidaksesuaian: FINDING_ACTIONABLE_EMAIL,
  sebaiknya: RECOMMENDATION_ACTIONABLE_EMAIL,
  profiler_peserta: { id: "agent-2", nama: "Bima Saputra", batch_name: "Batch 7" },
  qa_indicators: { id: "indicator-dokumen", name: "Kelengkapan dokumen" },
  qa_periods: { id: "period-2026-03", month: 3, year: 2026, label: "03/2026" },
};

const ALL_ROWS = [
  ROW_ACTIONABLE_CALL,
  ROW_PHANTOM,
  ROW_WITHOUT_FINDING,
  ROW_WITHOUT_RECOMMENDATION,
  ROW_ACTIONABLE_EMAIL,
];

// ── Fixture filter Parameter (QA indicator) ──────────────────────────────────
// Katalog di bawah hanya berisi indikator AKTIF, seperti `getIndicators()` di
// backend (`is_active = true`). Dua parameter sengaja bernama sama di layanan
// berbeda supaya label wajib dibedakan, dan satu punya `parameter_group` supaya
// `formatQAIndicatorName` ikut teruji. `id` = UUID asli dari katalog, bukan
// nama — nilai select adalah UUID itu.

type IndicatorFixture = {
  id: string;
  service_type: string;
  name: string;
  parameter_group: string | null;
  category: "critical" | "non_critical" | "none";
  bobot: number;
  sort_order: number;
  is_active: true;
};

/** Nama yang sama di dua layanan: tanpa pembeda, keduanya tidak terbaca. */
const DUPLICATE_PARAMETER_NAME = "Akurasi informasi produk";

const IND_CALL_AKURASI = {
  id: "11111111-1111-4111-8111-111111111111",
  service_type: "call",
  name: DUPLICATE_PARAMETER_NAME,
  parameter_group: null,
  category: "critical",
  bobot: 0.2,
  sort_order: 1,
  is_active: true,
} as const satisfies IndicatorFixture;

const IND_CHAT_AKURASI = {
  id: "22222222-2222-4222-8222-222222222222",
  service_type: "chat",
  name: DUPLICATE_PARAMETER_NAME,
  parameter_group: null,
  category: "critical",
  bobot: 0.2,
  sort_order: 1,
  is_active: true,
} as const satisfies IndicatorFixture;

const IND_CALL_KEPATUHAN = {
  id: "33333333-3333-4333-8333-333333333333",
  service_type: "call",
  name: "Kepatuhan prosedur",
  parameter_group: "Compliance",
  category: "non_critical",
  bobot: 0.1,
  sort_order: 2,
  is_active: true,
} as const satisfies IndicatorFixture;

const IND_EMAIL_DOKUMEN = {
  id: "44444444-4444-4444-8444-444444444444",
  service_type: "email",
  name: "Kelengkapan dokumen",
  parameter_group: null,
  category: "non_critical",
  bobot: 0.15,
  sort_order: 1,
  is_active: true,
} as const satisfies IndicatorFixture;

/** Urutan = urutan backend (`service_type`, lalu `sort_order`, lalu `name`). */
const INDICATOR_CATALOG: IndicatorFixture[] = [
  IND_CALL_AKURASI,
  IND_CALL_KEPATUHAN,
  IND_CHAT_AKURASI,
  IND_EMAIL_DOKUMEN,
];

/**
 * Katalog per layanan. Dipakai mock `GET /indicators` supaya setiap request
 * di-narrow dari map yang sama dengan katalog utuh — bukan dari daftar
 * hardcode per test.
 */
const INDICATORS_BY_SERVICE: Record<string, IndicatorFixture[]> = {
  call: [IND_CALL_AKURASI, IND_CALL_KEPATUHAN],
  chat: [IND_CHAT_AKURASI],
  email: [IND_EMAIL_DOKUMEN],
};

const FINDING_PARAM_CALL_AKURASI =
  "Nomor polis yang diberikan agen tidak cocok dengan data nasabah sehingga verifikasi lanjutan tidak dapat dilanjutkan.";
const RECOMMENDATION_PARAM_CALL_AKURASI =
  "Cocokkan nomor polis dengan data nasabah sebelum melanjutkan layanan, lalu catat hasil pencocokan pada audit trail.";
const FINDING_PARAM_CHAT_AKURASI =
  "Identitas nasabah dikonfirmasi dari nomor yang tidak terdaftar sehingga hasil verifikasi tidak dapat dicatat pada sesi.";
const RECOMMENDATION_PARAM_CHAT_AKURASI =
  "Tolak konfirmasi dari nomor tidak terdaftar dan minta identitas resmi sebelum membuka sesi.";
const FINDING_PARAM_CALL_KEPATUHAN =
  "Agen menutup sesi tanpa membaca ulang syarat layanan sehingga prosedur yang disepakati tidak terdokumentasi.";
const RECOMMENDATION_PARAM_CALL_KEPATUHAN =
  "Baca ulang syarat layanan dan minta konfirmasi eksplisit sebelum menutup sesi.";
const FINDING_PARAM_EMAIL_DOKUMEN =
  "Email konfirmasi tidak mencantumkan nomor polis sehingga pelanggan tidak dapat mencocokkan dokumen.";
const RECOMMENDATION_PARAM_EMAIL_DOKUMEN =
  "Tambahkan nomor polis dan ringkasan proteksi pada email konfirmasi sebelum dikirim.";

const parameterRow = (
  id: string,
  service: string,
  indicator: IndicatorFixture,
  agent: { id: string; nama: string },
  month: number,
  ticket: string,
  finding: string,
  recommendation: string,
): ReportRow => ({
  id,
  indicator_id: indicator.id,
  service_type: service,
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: ticket,
  nilai: 2,
  ketidaksesuaian: finding,
  sebaiknya: recommendation,
  profiler_peserta: { id: agent.id, nama: agent.nama, batch_name: "Batch 7" },
  qa_indicators: { id: indicator.id, name: indicator.name, category: indicator.category },
  qa_periods: { month, year: 2026, label: `${String(month).padStart(2, "0")}/2026` },
});

const ROW_PARAM_CALL_AKURASI = parameterRow(
  "row-param-call-akurasi",
  "call",
  IND_CALL_AKURASI,
  { id: "agent-1", nama: "Alya Pranoto" },
  3,
  "TKT-2026-1101",
  FINDING_PARAM_CALL_AKURASI,
  RECOMMENDATION_PARAM_CALL_AKURASI,
);

const ROW_PARAM_CHAT_AKURASI = parameterRow(
  "row-param-chat-akurasi",
  "chat",
  IND_CHAT_AKURASI,
  { id: "agent-1", nama: "Alya Pranoto" },
  3,
  "TKT-2026-1102",
  FINDING_PARAM_CHAT_AKURASI,
  RECOMMENDATION_PARAM_CHAT_AKURASI,
);

const ROW_PARAM_CALL_KEPATUHAN = parameterRow(
  "row-param-call-kepatuhan",
  "call",
  IND_CALL_KEPATUHAN,
  { id: "agent-2", nama: "Bima Saputra" },
  2,
  "TKT-2026-1103",
  FINDING_PARAM_CALL_KEPATUHAN,
  RECOMMENDATION_PARAM_CALL_KEPATUHAN,
);

const ROW_PARAM_EMAIL_DOKUMEN = parameterRow(
  "row-param-email-dokumen",
  "email",
  IND_EMAIL_DOKUMEN,
  { id: "agent-2", nama: "Bima Saputra" },
  3,
  "TKT-2026-1104",
  FINDING_PARAM_EMAIL_DOKUMEN,
  RECOMMENDATION_PARAM_EMAIL_DOKUMEN,
);

/**
 * Baris non-actionable pada parameter yang SAMA. Kalau filter Parameter
 * memakai jalur sendiri, baris phantom ini akan ikut masuk hitungan —
 * jadi fixture ini membuktikan seleksi actionable tetap berlaku di bawah
 * filter baru.
 */
const ROW_PARAM_CALL_AKURASI_PHANTOM: ReportRow = {
  ...ROW_PARAM_CALL_AKURASI,
  id: "row-param-call-akurasi-phantom",
  no_tiket: "TKT-2026-1199",
  is_phantom_padding: true,
  ketidaksesuaian: "Padding phantom pada parameter terpilih tidak boleh tampil.",
  sebaiknya: "Rekomendasi phantom tidak boleh ikut terfilter.",
};

const ROW_PARAM_CALL_AKURASI_NO_RECOMMENDATION: ReportRow = {
  ...ROW_PARAM_CALL_AKURASI,
  id: "row-param-call-akurasi-tanpa-rekomendasi",
  no_tiket: "TKT-2026-1198",
  is_phantom_padding: false,
  ketidaksesuaian: "Temuannya ada, tetapi Rekomendasi kosong.",
  sebaiknya: "   ",
};

/** 4 actionable + 1 phantom + 1 tanpa Rekomendasi = 6 baris respons. */
const PARAMETER_ROWS: ReportRow[] = [
  ROW_PARAM_CALL_AKURASI,
  ROW_PARAM_CHAT_AKURASI,
  ROW_PARAM_CALL_KEPATUHAN,
  ROW_PARAM_EMAIL_DOKUMEN,
  ROW_PARAM_CALL_AKURASI_PHANTOM,
  ROW_PARAM_CALL_AKURASI_NO_RECOMMENDATION,
];

/**
 * Teks yang TIDAK boleh muncul di layar maupun file Excel pada filter apa pun:
 * phantom dan baris tanpa Rekomendasi tetap tidak boleh lolos di bawah filter
 * Parameter baru.
 */
const PARAMETER_NON_ACTIONABLE_TEXTS = [
  "Padding phantom pada parameter terpilih tidak boleh tampil.",
  "Rekomendasi phantom tidak boleh ikut terfilter.",
  "Temuannya ada, tetapi Rekomendasi kosong.",
  "TKT-2026-1199",
  "TKT-2026-1198",
];

/** Temuan per parameter, untuk membuktikan hanya parameter terpilih yang tampil. */
const PARAMETER_FINDINGS = [
  FINDING_PARAM_CALL_AKURASI,
  FINDING_PARAM_CHAT_AKURASI,
  FINDING_PARAM_CALL_KEPATUHAN,
  FINDING_PARAM_EMAIL_DOKUMEN,
];

/** Semua temuan KECUALI milik parameter yang sedang dipilih. */
const otherParameterFindings = (selected: string): string[] =>
  PARAMETER_FINDINGS.filter((finding) => finding !== selected);

/**
 * Fixture khusus bukti visual: 8 baris actionable + 1 phantom, supaya halaman
 * benar-benar tergulir di desktop dan kepadatan tabel bisa dibaca dari
 * screenshot top/bottom. Field persis sama dengan fixture kontrak di atas —
 * tidak ada field, metrik, atau skor turunan yang dikarang untuk visual.
 */
const VISUAL_SEEDS: Array<{
  service: string;
  agent: string;
  batch: string;
  ticket: string;
  month: number;
  parameter: string;
  nilai: number;
  finding: string;
  recommendation: string;
}> = [
  {
    service: "chat",
    agent: "Citra Wulandari",
    batch: "Batch 4",
    ticket: "TKT-2026-0417",
    month: 2,
    parameter: "Konfirmasi identitas nasabah",
    nilai: 2,
    finding:
      "Agen menerima konfirmasi identitas lewat nomor telepon yang tidak terdaftar pada account, sehingga verifikasi identitas tidak dapat dicatat pada audit trail.",
    recommendation:
      "Tolak konfirmasi identitas dari nomor yang tidak terdaftar, lalu minta nomor polis dan identitas resmi sebelum melanjutkan layanan.",
  },
  {
    service: "cso",
    agent: "Dimas Ardianto",
    batch: "Batch 7",
    ticket: "TKT-2026-0522",
    month: 2,
    parameter: "Kesesuaian produk",
    nilai: 3,
    finding:
      "Penawaran produk kartu kredit tidak menjelaskan total biaya tahunan secara lisan sehingga calon nasabah tidak dapat membandingkan biaya dengan kartu lain.",
    recommendation:
      "Sampaikan total biaya tahunan beserta simulasi cicilan sebelum meminta konfirmasi, lalu catat persetujuan calon nasabah pada kolom disposition.",
  },
  {
    service: "pencatatan",
    agent: "Alya Pranoto",
    batch: "Batch 7",
    ticket: "TKT-2026-0603",
    month: 3,
    parameter: "Kelengkapan Berkas",
    nilai: 1,
    finding:
      "Berkas pencatatan dikirim tanpa salinan KTP sedangkan checklist pada sistem tetap ditandai lengkap, sehingga verifikasi berkas tidak dapat diulang.",
    recommendation:
      "Kembalikan berkas yang tidak lengkap kepada agen dengan daftar field yang kurang, lalu terapkan checklist berkas sebelum pengajuan.",
  },
  {
    service: "bko",
    agent: "Reza Mahendra",
    batch: "Batch 2",
    ticket: "TKT-2026-0711",
    month: 3,
    parameter: "Follow-up komitmen",
    nilai: 2,
    finding:
      "Agen menutup sesi tanpa menanyakan ulang apakah calon nasabah sudah memahami angsuran, sehingga komitmen pembayaran belum terkonfirmasi secara eksplisit.",
    recommendation:
      "Akhiri sesi dengan pertanyaan penutup yang meminta konfirmasi pemahaman, lalu simpan jawaban nasabah sebagai bukti pada catatan sesi.",
  },
  {
    service: "slik",
    agent: "Bima Saputra",
    batch: "Batch 7",
    ticket: "TKT-2026-0820",
    month: 3,
    parameter: "Kepatuhan SLIK",
    nilai: 3,
    finding:
      "Permintaan Checking SLIK dijawab sebelum tanggal dan disclaimer disampaikan, sehingga urutan penjelasan belum sesuai ketentuan layanan.",
    recommendation:
      "Sampaikan disclaimer sebelum hasil Checking dan catat waktu penyampaian agar urutan penjelasan dapat diaudit.",
  },
  {
    service: "call",
    agent: "Nadia Puspita",
    batch: "Batch 4",
    ticket: "TKT-2026-0934",
    month: 3,
    parameter: "Empati dan komunikasi",
    nilai: 1,
    finding:
      "Keluhan pelanggan mengenai proses yang lambat ditolak tanpa penjelasan ulang sehingga pelanggan merasa didiamkan dan meneruskan keluhan ke supervisor.",
    recommendation:
      "Akui keluhan pelanggan, jelaskan tahap yang sedang berjalan, lalu tawarkan estimasi waktu yang dapat dipertanggungjawabkan.",
  },
];

const VISUAL_ROWS: ReportRow[] = [
  ROW_ACTIONABLE_CALL,
  ROW_ACTIONABLE_EMAIL,
  ...VISUAL_SEEDS.map((seed, index): ReportRow => ({
    id: `row-visual-${index + 1}`,
    service_type: seed.service,
    tahun: 2026,
    is_phantom_padding: false,
    no_tiket: seed.ticket,
    nilai: seed.nilai,
    ketidaksesuaian: seed.finding,
    sebaiknya: seed.recommendation,
    profiler_peserta: { nama: seed.agent, batch_name: seed.batch },
    qa_indicators: { name: seed.parameter },
    qa_periods: { month: seed.month, year: 2026 },
  })),
  // Phantom ikut dilayani supaya terlihat bahwa baris ini tetap tersaring.
  ROW_PHANTOM,
];

const NON_ACTIONABLE_TEXTS = [
  FINDING_PHANTOM,
  RECOMMENDATION_PHANTOM,
  RECOMMENDATION_WITHOUT_FINDING,
  FINDING_WITHOUT_RECOMMENDATION,
];

type DataRequest = { method: string; body: Record<string, unknown> };

/**
 * Penahanan respons: request sudah sampai ke handler mock tapi `route.fulfill`
 * belum dipanggil, jadi test bisa Mielihat keadaan "menunggu" yang sesaat.
 */
type DeferredResponseGate = {
  /** Dipanggil handler mock saat request sudah ditahan (belum di-`fulfill`). */
  arrive: () => void;
  /** Dipanggil test untuk melepas penahanan; `route.fulfill` menyusul. */
  release: () => void;
  /** Resolusi setelah handler mock selesai ditahan. */
  held: Promise<void>;
};

type ReportResponseGate = DeferredResponseGate;

let activeReportResponseGate: ReportResponseGate | null = null;

/**
 * Mock katalog parameter yang boleh diubah SAAT test berjalan. Kontrak
 * "katalog gagal → fail-closed → coba lagi" butuh katalog yang gagal lebih
 * dulu lalu berhasil setelah retry, jadi mode tidak boleh dibekukan di dalam
 * `mockSidakApi`. `gate` sengaja jadi field milik mock ini (bukan variabel
 * modul) supaya tidak bisa bocor ke test berikutnya, dan supaya test yang sama
 * bisa menahan request katalog yang BERBEDA pada langkah berbeda.
 */
type IndicatorMock = {
  mode: "ok" | "error";
  message: string;
  gate: DeferredResponseGate | null;
};

function okIndicatorMock(): IndicatorMock {
  return { mode: "ok", message: "", gate: null };
}

/**
 * Override respons `GET /sidak/agents` untuk membuktikan `normalizeReportAgents`
 * bersifat defensif terhadap BENTUK respons yang salah, bukan hanya respons
 * yang benar. Default-nya kosong supaya test lain tetap memakai
 * `AGENT_DIRECTORY_FIXTURE` yang sekarang.
 *
 * Kunci = nilai query `year` yang benar-benar dikirim, jadi dua bentuk
 * malformed bisa dilayani dari satu alur user (ganti Tahun) alih-alih
 * mengarang endpoint baru.
 */
type AgentDirectoryMock = {
  /** Badan `data` per `year`; key = nilai query `year`. */
  byYear: Record<string, unknown>;
};

function okAgentDirectoryMock(): AgentDirectoryMock {
  return { byYear: {} };
}

/**
 * Tahan respons katalog parameter berikutnya: dipakai untuk membuktikan keadaan
 * `pending` benar-benar terlihat (tanpa penahanan, seluruh assertion transisi
 * bisa lolos dalam satu frame), dan untuk melepas respons cakupan LAMA setelah
 * user sudah pindah cakupan. Satu kali pakai (self-clearing).
 */
function createDeferredIndicatorResponse(indicators: IndicatorMock): {
  arrived: Promise<void>;
  release: () => void;
} {
  let markArrived: () => void = () => {};
  let markReleased: () => void = () => {};
  const arrived = new Promise<void>((resolve) => {
    markArrived = resolve;
  });
  const held = new Promise<void>((resolve) => {
    markReleased = resolve;
  });
  indicators.gate = { arrive: markArrived, release: markReleased, held };
  return { arrived, release: markReleased };
}

/**
 * Tahan respons POST data berikutnya secara eksplisit: `arrived` memberi tahu
 * test bahwa request benar-benar sudah sampai dan sedang ditahan, `release()`
 * melepasnya. Satu kali pakai (self-clearing) supaya request berikutnya tetap
 * dilayani normal — itu yang membuktikan flow kedua tidak ikut lumpuh.
 */
function createDeferredReportResponse(): { arrived: Promise<void>; release: () => void } {
  let markArrived: () => void = () => {};
  let markReleased: () => void = () => {};
  const arrived = new Promise<void>((resolve) => {
    markArrived = resolve;
  });
  const held = new Promise<void>((resolve) => {
    markReleased = resolve;
  });
  activeReportResponseGate = { arrive: markArrived, release: markReleased, held };
  return { arrived, release: markReleased };
}

/**
 * Bukti jaringan per test. Semua request harus jatuh ke tepat satu kategori.
 */
type NetworkAudit = {
  /** Request yang DIMOCK handler lokal (fixture, tanpa jaringan). */
  mockedApi: string[];
  /** Request auth/profile yang DIMOCK handler lokal. */
  mockedAuth: string[];
  /** Document, modul Vite, dan HMR pada dev-server loopback. */
  localDev: string[];
  /** `/api/*` yang TIDAK dimock → di-abort, tidak pernah masuk proxy Vite. */
  blockedApi: string[];
  /** Host eksternal apa pun → di-abort. */
  blockedExternal: string[];
  /** Origin lokal di luar allowlist (mis. `/api` dengan method lain) → di-abort. */
  blockedLocal: string[];
};

type RequestShape = { label: string; method: string; url: URL | null };

function emptyAudit(): NetworkAudit {
  return {
    mockedApi: [],
    mockedAuth: [],
    localDev: [],
    blockedApi: [],
    blockedExternal: [],
    blockedLocal: [],
  };
}

function toJson(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    status,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  };
}

function shapeRequest(request: { method(): string; url(): string }): RequestShape {
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

/**
 * Mock API hanya sah pada `APP_ORIGIN`. Tanpa gerbang origin, request dengan
 * method + path yang sama dari origin mana pun akan lolos `fallback`; handler
 * mock di bawah di-anchor ke origin app, jadi tidak ada yang menanganinya dan
 * request tersebut keluar ke jaringan nyata.
 */
function isMockedApiRequest(request: RequestShape): boolean {
  if (!request.url) return false;
  if (request.url.origin !== APP_ORIGIN) return false;
  return MOCKED_API.some(
    (endpoint) => endpoint.method === request.method && endpoint.path === request.url!.pathname,
  );
}

function isMockedAuthRequest(request: RequestShape): boolean {
  if (!request.url) return false;
  if (request.url.origin !== SUPABASE_ORIGIN) return false;
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
  if (url.protocol === "ws:" || url.protocol === "wss:") return isAppDevServer(url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!isAppDevServer(url)) return false;
  return !isApiPath(url.pathname);
}

/**
 * Preflight fail-closed untuk target E2E. Dijalankan sekali per worker SEBELUM
 * test apa pun, di luar browser, tanpa menyentuh `/api` sama sekali.
 *
 * Yang dibuktikan, atau test berhenti di sini:
 *   1. Listener `localhost:3005` menjawab, jadi target-nya benar-benar lokal
 *      dan tidak ada proses yang diam-diam diarahkan ke host lain.
 *   2. Yang menjawab adalah dev-server Vite repo ini: `/` memuat client
 *      `@vite/client` + `/src/main.tsx`, dan `/@vite/client` melayani JS.
 *      Server produksi (`serve dist` hasil `pnpm start`) tidak punya salah satu
 *      pun, jadi build produksi TIDAK bisa dipakai sebagai target diam-diam.
 *   3. Proxy `/api` di `apps/web/vite.config.ts` hanya menunjuk ke loopback,
 *      jadi tidak ada backend produksi yang bisa dilayani di belakang `/api`
 *      walau guard browser dilewati.
 *
 * Sengaja tidak memanggil `http://localhost:3005/api/...` dari sini: request
 * itu akan masuk proxy Vite dan menyentuh proses apa pun yang memegang 3001.
 * Bukti "tidak ada backend yang tersentuh" datang dari log canary port dan
 * dari `audit.blockedApi` per test, bukan dari probe preflight.
 */
async function assertLocalDevOnlyTarget(): Promise<void> {
  const failures: string[] = [];

  let documentBody: string;
  try {
    const response = await fetch(`${APP_ORIGIN}/`);
    const client = await fetch(`${APP_ORIGIN}/@vite/client`);
    if (!response.ok) failures.push(`GET / = ${response.status}`);
    if (!client.ok || !(client.headers.get("content-type") ?? "").includes("javascript")) {
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

  if (!documentBody.includes("/@vite/client") || !documentBody.includes("/src/main.tsx")) {
    failures.push("dokumen tidak memuat marker dev-server Vite (/@vite/client, /src/main.tsx)");
  }

  let viteConfig = "";
  try {
    viteConfig = readFileSync(path.join(REPO_ROOT, "apps/web/vite.config.ts"), "utf8");
  } catch (error) {
    failures.push(`vite.config.ts tidak terbaca: ${(error as Error).message}`);
  }
  const proxyBlock = viteConfig.match(/proxy:\s*\{[\s\S]*?\}/)?.[0] ?? "";
  if (!/target:\s*"http:\/\/(localhost|127\.0\.0\.1):\d+"/.test(proxyBlock)) {
    failures.push(`proxy /api tidak terbukti menunjuk ke loopback: ${proxyBlock.trim() || "-"}`);
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
 * handler dalam urutan terbalik pendaftaran, sehingga guard ini yang pertama
 * kali menangani setiap request dan hanya meneruskan (`fallback`) ke handler
 * mock atau ke dev-server loopback. Tidak ada `fallback` untuk `/api` yang
 * tidak ada di `MOCKED_API`, sehingga request tak dikenal tidak pernah keluar.
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
 * Glob di-anchor ke origin dev Supabase supaya tidak bisacca modul lokal lain.
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
    await route.fulfill(toJson([authProfile], 200, { "content-range": "0-0/1" }));
  });
}

async function mockSidakApi(
  page: Page,
  audit: NetworkAudit,
  dataRequests: DataRequest[],
  rows: ReportRow[] | ((body: Record<string, unknown>) => ReportRow[]),
  indicatorMock: IndicatorMock = okIndicatorMock(),
  agentDirectoryMock: AgentDirectoryMock = okAgentDirectoryMock(),
) {
  // Catch-all `/api` dengan dispatch eksak: request yang bukan salah satu
  // endpoint di `MOCKED_API` di-abort di sini juga, bukan diteruskan.
  // Glob WAJIB di-anchor ke origin app — `**/api/**` juga akan cocok dengan
  // modul app seperti `/src/lib/api/index.ts`.
  await page.route(`${APP_ORIGIN}/api/**`, async (route) => {
    const request = shapeRequest(route.request());
    const endpoint = request.url
      ? MOCKED_API.find(
          (candidate) =>
            candidate.method === request.method && candidate.path === request.url!.pathname,
        )
      : undefined;

    if (!endpoint) {
      audit.blockedApi.push(request.label);
      await route.abort("blockedbyclient");
      return;
    }

    audit.mockedApi.push(request.label);

    if (endpoint.id === "periods") {
      await route.fulfill(toJson({ success: true, data: PERIODS_FIXTURE }));
      return;
    }

    if (endpoint.id === "agents") {
      // Success HTTP dengan badan `data` apa adanya. `data: null` dan
      // `agents` yang bukan array adalah dua bentuk malformed yang berbeda:
      // yang satu gagal di guard `!raw`, yang lain di guard array.
      const year = request.url?.searchParams.get("year") ?? "";
      const override = agentDirectoryMock.byYear[year];
      await route.fulfill(
        toJson({
          success: true,
          data: override === undefined ? AGENT_DIRECTORY_FIXTURE : override,
        }),
      );
      return;
    }

    if (endpoint.id === "indicators") {
      // Penahanan ditebak dari state yang SEDANG berlaku, bukan dari saat
      // request masuk: test boleh clickskip dan mengubah mode sebelum melepas.
      const gate = indicatorMock.gate;
      if (gate) {
        indicatorMock.gate = null;
        gate.arrive();
        await gate.held;
      }
      if (indicatorMock.mode === "error") {
        // 500 dengan badan kontrak API: `fetchApi` melempar `error.message`.
        await route.fulfill(
          toJson({ success: false, error: { message: indicatorMock.message } }, 500),
        );
        return;
      }
      // Katalog AKTIF saja, dan narrowed oleh query `service_type` persis
      // seperti `getIndicators()` di backend. Tanpa query, semua aktif dikirim.
      const scope = request.url?.searchParams.get("service_type") ?? "";
      await route.fulfill(
        toJson({
          success: true,
          data: scope === "" ? INDICATOR_CATALOG : (INDICATORS_BY_SERVICE[scope] ?? []),
        }),
      );
      return;
    }

    const body = JSON.parse(route.request().postData() || "{}") as Record<string, unknown>;
    dataRequests.push({ method: request.method, body });
    // Respons yang secara eksplisit ditahan test: `route.fulfill` baru dipanggil
    // setelah `release()`, jadi test bisa mengubah filter di tengah request.
    const gate = activeReportResponseGate;
    if (gate) {
      activeReportResponseGate = null;
      gate.arrive();
      await gate.held;
    }
    // Baris dihitung dari body yang benar-benar terkirim, jadi UI dan Excel
    // hanya bisa mencerminkan `indicatorId` kalau payload-nya benar-benar
    // berisi ID itu — tidak ada jalan pintas "UI benar, request salah".
    await route.fulfill(
      toJson({ success: true, data: typeof rows === "function" ? rows(body) : rows }),
    );
  });
}

async function openReportsData(
  page: Page,
  audit: NetworkAudit,
  dataRequests: DataRequest[],
  rows: ReportRow[] | ((body: Record<string, unknown>) => ReportRow[]),
  indicatorMock?: IndicatorMock,
  agentDirectoryMock?: AgentDirectoryMock,
) {
  await mockSupabaseAuth(page);
  await tapSupabaseMocks(page, audit);
  await mockSidakApi(page, audit, dataRequests, rows, indicatorMock, agentDirectoryMock);
  await installNetworkGuard(page, audit);
  await page.goto("/sidak/reports-data");
  await expect(page.getByRole("heading", { name: "Laporan Data", level: 1 })).toBeVisible();
  // Bukti mock auth dipakai: halaman tidak pernah dialihkan ke /unauthorized.
  await expect(page).toHaveURL(/\/sidak\/reports-data/);
  expect(
    audit.mockedAuth.some((label) => label.includes("/auth/v1/user")),
    `auth tidak di-intercept: ${audit.mockedAuth.join(" | ")}`,
  ).toBe(true);
  expect(
    audit.mockedAuth.some((label) => label.includes("/rest/v1/profiles")),
    `profil tidak di-intercept: ${audit.mockedAuth.join(" | ")}`,
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

function resultRows(page: Page) {
  return page.getByRole("rowgroup").nth(1).getByRole("row");
}

// ── Kontrak label bulan ─────────────────────────────────────────────────────
// Opsi bulan ditampilkan sebagai nama bulan penuh bahasa Indonesia
// (Januari..Desember), bukan angka `01`..`12`. Yang berubah HANYA label:
// `value` tetap angka 1..12, default tetap Januari..Desember (1..12), dan
// payload POST tetap angka. Kontrak ini digabung ke test filter bulan yang
// sudah ada supaya tidak ada suite paralel untuk filter yang sama.

/** Label aksesibel 12 opsi bulan, urutan = nilai 1..12. */
const MONTH_OPTION_LABELS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

/** Bulan tengah yang dipakai test: Maret = 3, Mei = 5. */
const MIDDLE_FROM_MONTH = { label: "Maret", value: "3" } as const;
const MIDDLE_TO_MONTH = { label: "Mei", value: "5" } as const;

/**
 * Nama aksesibel setiap `<option>` di dalam satu `<select>`.
 *
 * Dibaca lewat accessible name (untuk `<option>` itu isi teksnya), bukan lewat
 * `value` — supaya test ini benar-benar membuktikan apa yang dibaca user dan
 * assistive tech, bukan format angka yang tersembunyi di DOM.
 */
async function optionLabels(select: Locator): Promise<string[]> {
  return select
    .locator("option")
    .evaluateAll((nodes) => nodes.map((node) => (node.textContent ?? "").trim()));
}

/** Opsi terpilih satu `<select>`: label yang terlihat + nilai yang dikirim. */
async function selectedOption(select: Locator): Promise<{ label: string; value: string }> {
  return select.evaluate((node: HTMLSelectElement) => {
    const option = node.options[node.selectedIndex];
    return { label: (option?.textContent ?? "").trim(), value: node.value };
  });
}

async function monthOptionNames(select: Locator): Promise<string[]> {
  return optionLabels(select);
}

/** Nama bulan + nilai yang sedang dipilih satu `<select>`. */
async function selectedMonth(select: Locator): Promise<{ label: string; value: string }> {
  return selectedOption(select);
}

/**
 * Kedua select bulan harus offering 12 nama Indonesia yang persis sama, dan
 * tidak boleh menyisakan label angka `01`..`12` lama.
 */
async function assertIndonesianMonthOptions(page: Page) {
  const from = page.getByRole("combobox", { name: "Dari bulan" });
  const to = page.getByRole("combobox", { name: "Ke bulan" });

  for (const [label, select] of [
    ["Dari bulan", from],
    ["Ke bulan", to],
  ] as const) {
    await expect(select.locator("option"), label).toHaveCount(12);
    expect(await monthOptionNames(select), `label opsi ${label}`).toEqual([
      ...MONTH_OPTION_LABELS,
    ]);

    // Tiga titik yang diminta kontrak: awal, tengah, akhir — lewat ROLE
    // `option` supaya yang diperiksa benar-benar accessible name.
    for (const name of ["Januari", "Maret", "Mei", "Desember"]) {
      await expect(
        select.getByRole("option", { name, exact: true }),
        `opsi aksesibel "${name}" di ${label}`,
      ).toHaveCount(1);
    }

    // Label angka lama tidak boleh bocor lewat nama lain yang bisa dipilih.
    for (const legacy of ["01", "02", "03", "05", "12"]) {
      await expect(
        select.getByRole("option", { name: legacy, exact: true }),
        `label lama "${legacy}" masih ada di ${label}`,
      ).toHaveCount(0);
    }
  }

  // Default tetap setahun penuh: Januari..Desember (1..12). Tidak ada
  // inferensi periode berjalan/latest.
  expect(await selectedMonth(from), "default Dari bulan").toEqual({
    label: "Januari",
    value: "1",
  });
  expect(await selectedMonth(to), "default Ke bulan").toEqual({
    label: "Desember",
    value: "12",
  });
}

// ── Bukti visual & responsif ────────────────────────────────────────────────
// Halaman ini punya dua representasi hasil (tabel desktop + daftar ringkas
// mobile). Semua locator di bawah sengaja memakai ROLE atau testid, karena
// role tidak pernah menghitung elemen `display:none` — jadi "tepat satu
// representasi terlihat" bisa dibuktikan, bukan diasumsikan.

const PAGE_SCROLL = "reports-data-scroll";
const RESULTS_SURFACE = "results-surface";
const RESULTS_COUNT = "results-count";
const RESULTS_TABLE = "results-table";
const RESULTS_LIST = "results-list";
const BACK_LINK = "Kembali ke Laporan";

/** Label unik untuk setiap sel Temuan/Rekomendasi, dipakai desktop & mobile. */
const CELL_LABELS = ["Temuan", "Rekomendasi"];

/**
 * Representasi hasil yang harus tampil di viewport default Playwright
 * (Desktop Chrome 1280px ≥ 896px): tabel. Semua assertion isi hasil di test
 * kontrak di-scope ke sini supaya tidak ikut menghitung salinan mobile.
 */
function desktopResults(page: Page) {
  return page.getByTestId(RESULTS_TABLE);
}


const VISUAL_RUN = process.env.SIDAK_VISUAL_RUN ?? "run";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Artefak visual SELALU di luar repo. `SIDAK_VISUAL_ARTIFACT_DIR` bisa
 * diarahkan ke mana saja, tapi kalau mengarah ke dalam repo test ini gagal
 * terbuka — bukan diam-diam menulis artefak ke working tree.
 */
function resolveArtifactDir(): string {
  const explicit = process.env.SIDAK_VISUAL_ARTIFACT_DIR;
  const base = explicit
    ? path.resolve(explicit)
    : path.join(tmpdir(), "sidak-reports-data-phase2", VISUAL_RUN);
  if (base === REPO_ROOT || base.startsWith(`${REPO_ROOT}${path.sep}`)) {
    throw new Error(`artefak visual tidak boleh berada di dalam repo: ${base}`);
  }
  mkdirSync(base, { recursive: true });
  return base;
}

type VisualViewport = { label: string; width: number; height: number };

/** Breakpoint tabel `lg` = 64rem; `html { font-size: 14px }` → 896px. */
const DESKTOP_MIN_WIDTH = 896;

const VISUAL_VIEWPORTS: VisualViewport[] = [
  { label: "320", width: 320, height: 720 },
  { label: "390", width: 390, height: 844 },
  { label: "768", width: 768, height: 1024 },
  { label: "1440", width: 1440, height: 900 },
];

const MOBILE_VIEWPORTS = VISUAL_VIEWPORTS.filter((v) => v.width < DESKTOP_MIN_WIDTH);
const DARK_VIEWPORTS = ["390", "1440"];

async function setTheme(page: Page, theme: "light" | "dark") {
  // Dipasang sebelum app boot: `useThemeMode` membaca localStorage saat mount.
  await page.addInitScript((value) => {
    localStorage.setItem("theme", value);
  }, theme);
}

async function openPopulatedResults(
  page: Page,
  audit: NetworkAudit,
  dataRequests: DataRequest[],
  rows: ReportRow[],
) {
  await openReportsData(page, audit, dataRequests, rows);
  await page.getByRole("button", { name: "Cari Data" }).click();
  // Sinyal hasil yang ada di sebelum DAN sesudah polish visual, supaya run RED
  // tetap bisa menyimpan screenshot baseline halaman yang sedang berjalan.
  await expect(
    page.getByText(FINDING_ACTIONABLE_CALL, { exact: false }).first(),
  ).toBeVisible();
}

/**
 * Menggulir + mengukur halaman dalam satu evaluate.
 *
 * Scroll container efektif tidak selalu elemen milik halaman: shell app membuat
 * `section[role="region"]` sebagai scroll container, dan `overflow-hidden` pada
 * root halaman tidak pernah jadi pemotong. Jadi scroller dicari berurutan —
 * testid halaman → ancestor yang benar-benar bisa menggulir → scrollable
 * terdalam di dalam region → region itu sendiri. Dengan begitu pengukuran tetap valid untuk baseline (sebelum
 * ada testid) maupun setelah polish.
 */
async function readPageLayout(
  page: Page,
  action: "none" | "top" | "bottom" = "none",
) {
  return page.evaluate(
    ({ testid, action: mode }) => {
      const root = document.documentElement;
      const region = document.querySelector<HTMLElement>('section[role="region"]');
      const tagged = document.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
      const canScroll = (el: HTMLElement) => el.scrollHeight - el.clientHeight > 1;

      let scroller: HTMLElement | null = null;
      if (tagged && canScroll(tagged)) scroller = tagged;
      if (!scroller && tagged) {
        let ancestor = tagged.parentElement;
        while (ancestor) {
          if (canScroll(ancestor)) {
            scroller = ancestor;
            break;
          }
          ancestor = ancestor.parentElement;
        }
      }
      if (!scroller) {
        const deepest = (region ? Array.from(region.querySelectorAll<HTMLElement>("div")) : [])
          .filter(canScroll)
          .pop();
        scroller = deepest ?? tagged ?? region;
      }
      if (!scroller) return null;

      if (mode !== "none") scroller.scrollTop = mode === "top" ? 0 : scroller.scrollHeight;

      // "Konten terakhir" = elemen terdalam yang benar-benar isi, bukan wrapper
      // yang hanya menempel ke tepi container (padding container ikut terukur
      // sebagai jarak, jadi wrapper tepi harus dikecualikan).
      const scrollerBottom = scroller.getBoundingClientRect().bottom;
      const boxes = Array.from(scroller.querySelectorAll<HTMLElement>("*"))
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter((entry) => entry.rect.height > 0 && entry.rect.width > 0);
      const content = boxes.filter((entry) => entry.rect.bottom <= scrollerBottom - 1);
      let lastBottom = -Infinity;
      let lastTag = "none";
      for (const { el, rect } of content.length > 0 ? content : boxes) {
        if (rect.bottom > lastBottom) {
          lastBottom = rect.bottom;
          lastTag = `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""}`;
        }
      }
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Navigasi utama"]');
      // `lg:hidden` tetap ada di DOM, jadi "tampil" harus diukur dari box,
      // bukan dari keberadaan elemen.
      const navVisible = Boolean(nav && nav.getBoundingClientRect().height > 0);
      const navTop = navVisible ? nav!.getBoundingClientRect().top : window.innerHeight;
      const firstChild = scroller.firstElementChild as HTMLElement | null;

      return {
        scrollerTag: scroller.tagName.toLowerCase(),
        scrollerTestId: scroller.dataset.testid ?? null,
        documentOverflow: root.scrollWidth - root.clientWidth,
        containerOverflow: scroller.scrollWidth - scroller.clientWidth,
        containerWidth: scroller.clientWidth,
        maxScroll: scroller.scrollHeight - scroller.clientHeight,
        scrollTop: Math.round(scroller.scrollTop),
        clearance: Math.round(navTop - lastBottom),
        navVisible,
        navHeight: navVisible ? Math.round(nav!.getBoundingClientRect().height) : 0,
        contentPaddingBottom: firstChild
          ? getComputedStyle(firstChild).paddingBottom
          : "n/a",
        lastTag,
      };
    },
    { testid: PAGE_SCROLL, action },
  );
}

async function scrollPageTo(page: Page, position: "top" | "bottom") {
  const layout = await readPageLayout(page, position);
  expect(layout, `scroll container halaman tidak ditemukan (${position})`).not.toBeNull();
  if (position === "bottom") {
    // Scroller harus benar-benar sampai dasar; kalau tidak, pengukuran
    // ruang aman bawah tidak berarti apa-apa.
    expect(
      layout!.scrollTop,
      `halaman tidak tergulir ke bawah (max ${layout!.maxScroll}px)`,
    ).toBeGreaterThan(0);
  }
  // Satu frame untuk mensettle scroll + screenshot.
  await page.waitForTimeout(150);
  return layout!;
}

/**
 * Screenshot atas + bawah untuk satu viewport. Dipanggil SEBELUM assertion
 * apa pun supaya run RED tetap menyimpan bukti visual halaman saat ini.
 */
async function captureViewportPair(
  page: Page,
  dir: string,
  label: string,
  viewport: VisualViewport,
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await scrollPageTo(page, "top");
  const top = path.join(dir, `${label}-${viewport.width}-top.png`);
  await page.screenshot({ path: top });
  await scrollPageTo(page, "bottom");
  const bottom = path.join(dir, `${label}-${viewport.width}-bottom.png`);
  await page.screenshot({ path: bottom });
  console.log(`[artifact] screenshot: ${top}\n[artifact] screenshot: ${bottom}`);
  return { top, bottom };
}

/** Kontrol milik halaman ini saja; navigasi shared di luar scope. */
function inScopeControls(page: Page) {
  return [
    page.getByRole("link", { name: BACK_LINK }),
    page.getByRole("button", { name: "Per Layanan" }),
    page.getByRole("button", { name: "Per Individu" }),
    page.getByRole("combobox", { name: "Layanan" }),
    page.getByRole("combobox", { name: "Tahun" }),
    page.getByRole("combobox", { name: "Dari bulan" }),
    page.getByRole("combobox", { name: "Ke bulan" }),
    page.getByRole("combobox", { name: "Parameter" }),
    page.getByRole("button", { name: "Cari Data" }),
    page.getByRole("button", { name: "Export Excel" }),
  ];
}

async function assertTouchTargets(page: Page) {
  const sizes: Record<string, string> = {};
  for (const control of inScopeControls(page)) {
    const box = await control.boundingBox();
    const name = (await control.getAttribute("aria-label")) ?? control;
    sizes[String(name)] = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "hidden";
    expect(box, `kontrol "${String(name)}" tidak punya box`).not.toBeNull();
    expect(
      box!.height,
      `target sentuh "${String(name)}" = ${Math.round(box!.height)}px`,
    ).toBeGreaterThanOrEqual(44);
  }
  return sizes;
}

/** Cincin fokus (box-shadow) atau outline harus benar-benar terlihat. */
async function readFocusIndicator(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ring: false, outline: false, tag: "none" };
    const style = getComputedStyle(el);
    return {
      ring: style.boxShadow !== "none",
      outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
      tag: `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 24)}`,
    };
  });
}

/**
 * Satu representasi per breakpoint: tepat satu dari tabel/daftar yang terlihat,
 * dan representasi itu yang memuat Temuan + Rekomendasi lengkap serta tiket.
 */
async function assertSingleRepresentation(page: Page, viewport: VisualViewport) {
  const table = page.getByTestId(RESULTS_TABLE);
  const list = page.getByTestId(RESULTS_LIST);
  const expectTable = viewport.width >= DESKTOP_MIN_WIDTH;

  if (expectTable) {
    await expect(table, `${viewport.label}px: tabel harus tampil`).toBeVisible();
    await expect(list, `${viewport.label}px: daftar mobile harus tersembunyi`).toBeHidden();
  } else {
    await expect(list, `${viewport.label}px: daftar ringkas harus tampil`).toBeVisible();
    await expect(table, `${viewport.label}px: tabel harus tersembunyi`).toBeHidden();
  }

  // Permukaan hasil ikut dibuktikan: state populated selalu punya container
  // data, bukan teks telanjang.
  await expect(page.getByTestId(RESULTS_SURFACE)).toBeVisible();

  const visible = expectTable ? table : list;
  for (const label of CELL_LABELS) {
    await expect(visible.getByText(label, { exact: true }).first()).toBeVisible();
  }
  for (const text of [
    FINDING_ACTIONABLE_CALL,
    RECOMMENDATION_ACTIONABLE_CALL,
    FINDING_ACTIONABLE_EMAIL,
    RECOMMENDATION_ACTIONABLE_EMAIL,
  ]) {
    // Teks penuh, bukan ringkasan: atribut text harus persis sama dengan fixture.
    await expect(visible.getByText(text, { exact: false })).toHaveText(text);
  }
  await expect(visible.getByText("TKT-2026-0142")).toBeVisible();
  await expect(visible.getByText("TKT-2026-0310")).toBeVisible();
  // Panjang teks panjang tidak boleh dipotong jadi ellipsis.
  const clipped = await visible
    .locator("p, dd, td")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => (node.textContent ?? "").length > 80)
        .map((node) => ({
          text: (node.textContent ?? "").slice(0, 40),
          clipped: node.scrollWidth - node.clientWidth,
        }))
        .filter((entry) => entry.clipped > 1),
    );
  expect(clipped, `teks panjang terpotong: ${JSON.stringify(clipped)}`).toEqual([]);
}

/**
 * Baca file `.xlsx` yang benar-benar diunduh browser dan kembalikan grid teks
 * per sheet. Memakai `exceljs` yang sudah menjadi dependency `@trainers/web`
 * (path baca yang sama dengan `src/lib/excel-utils.ts`), tanpa menambah
 * dependency baru. Semua cell ikut dibaca, bukan hanya sheet pertama.
 */
async function readDownloadedWorkbook(download: Download): Promise<Record<string, string[][]>> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const file = await download.path();
  expect(file, "download tidak menghasilkan file sementara").not.toBeNull();
  await workbook.xlsx.readFile(file!);

  const sheets: Record<string, string[][]> = {};
  workbook.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= Math.max(row.cellCount, 1); c++) cells.push(row.getCell(c).text);
      rows.push(cells);
    });
    sheets[sheet.name] = rows;
  });
  return sheets;
}

/** Baris data (tanpa header) dari sheet "Data Laporan" pada file .lsx. */
async function exportedDataRows(download: Download): Promise<string[][]> {
  const workbook = await readDownloadedWorkbook(download);
  expect(Object.keys(workbook), "sheet export berubah").toContain("Data Laporan");
  return workbook["Data Laporan"]
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

// ── Filter Parameter ─────────────────────────────────────────────────────────
// Kontrak yang dibuktikan di bawah:
//   - Satu `<select>` native berlabel "Parameter" ada di KEDUA mode; default
//     "Semuanya" = tidak ada `indicatorId` di payload.
//   - Cakupan katalog: Per Layanan memakai `?service_type=<layanan>` saat
//     satu layanan dipilih, dan seluruh katalog aktif saat "Semua Layanan";
//     Per Individu selalu seluruh katalog aktif karena tidak punya select
//     Layanan.
//   - Dua parameter bernama sama wajib berbeda label (label layanan), dan
//     `parameter_group` ikut terbaca lewat `formatQAIndicatorName`.
//   - Nilai select adalah UUID indikator dari katalog, bukan nama.
//   - UUID yang tidak ada lagi di katalog aktif (setelah layanan/cakupan
//     berubah) DIBERSIHKAN, tidak pernah terkirim sebagai filter yatim.
//   - `indicatorId` menambah satu field pada POST yang sudah ada; semua field
//     lain, count, pagination, dan Excel tetap berasal dari respons yang
//     dihitung dari payload itu sendiri.

/** Katalog aktif tanpa scope layanan: prefiks label layanan wajib ada. */
const ALL_SCOPE_PARAMETER_LABELS = [
  "Semuanya",
  "Call · Akurasi informasi produk",
  "Call · Compliance — Kepatuhan prosedur",
  "Chat · Akurasi informasi produk",
  "Email · Kelengkapan dokumen",
];

function parameterSelect(page: Page) {
  return page.getByRole("combobox", { name: "Parameter" });
}

/** Tombol submit laporan; teks berubah ke "Memuat..." saat request berjalan. */
function cariDataButton(page: Page) {
  return page.getByRole("button", { name: /Cari Data|Memuat/ });
}

/**
 * Status aksesibel katalog parameter. `role="status"` tidak punya accessible
 * name dari konten, jadipencocokan lewat `hasText` — dan di-filter supaya
 * panel status lain di halaman (mis. "Memuat data temuan") tidak ikut kena.
 */
function parameterPendingStatus(page: Page) {
  return page.getByRole("status").filter({ hasText: "Memuat daftar parameter" });
}

function parameterErrorAlert(page: Page) {
  return page.getByRole("alert").filter({ hasText: "Gagal memuat daftar parameter" });
}

/** Label request katalog persis seperti yang tercatat audit (query ikut). */
function indicatorRequestLabels(audit: NetworkAudit): string[] {
  return audit.mockedApi.filter((label) => label.includes("/api/v1/sidak/indicators"));
}

/** Katalog tanpa query: seluruh indikator aktif. */
const INDICATORS_ALL_SCOPE = `GET ${APP_ORIGIN}/api/v1/sidak/indicators`;
/** Katalog satu layanan: query `service_type` persis, tanpa param lain. */
const indicatorsForService = (service: string) =>
  `${INDICATORS_ALL_SCOPE}?service_type=${service}`;

function lastDataRequest(dataRequests: DataRequest[]): Record<string, unknown> {
  expect(dataRequests.length, "tidak ada request data yang terkirim").toBeGreaterThan(0);
  return dataRequests[dataRequests.length - 1].body;
}

async function exportDataWorkbook(page: Page, name: string): Promise<string[][]> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  const download = await downloadPromise;
  // Artefak selalu di luar repo; `resolveArtifactDir` menolak path di dalam repo.
  const artifact = path.join(resolveArtifactDir(), `${name}.xlsx`);
  await download.saveAs(artifact);
  console.log(`[artifact] xlsx export: ${artifact}`);
  return exportedDataRows(download);
}

/** Audit yang akan dicetak di `afterEach` sebagai bukti jaringan per test. */
const activeAudits: NetworkAudit[] = [];

function startAudit(): NetworkAudit {
  const audit = emptyAudit();
  activeAudits.push(audit);
  return audit;
}

// ── Kontrak nomor tiket ─────────────────────────────────────────────────────
// `getReportTicketText` punya dua aturan yang harus terlihat di layar, di
// KEDUA representasi hasil (tabel desktop dan daftar ringkas mobile):
//   1. Nomor tiket yang dikelilingi spasi DINORMALISASI sebelum tampil.
//   2. Nomor tiket yang kosong/tidak ada TETAP terlihat sebagai "-", bukan
//      sel kosong — kalau placeholder hilang, user tidak bisa membedakan
//      "tiket tidak ada" dari "sel tidak terisi".
//
// Bukti (1) tidak bisa diambil dari `toHaveText`: assertion itu menormalisasi
// whitespace, jadi nilai mentah `"  TKT-...  "` dan sudah-ter-trim
// `"TKT-..."` akan terbaca sama. Padding hanya terlihat di `textContent`,
// jadi `rawText` di bawah yang dipakai untuk itu.

/** Indeks sel "No. Tiket" pada `<tr>` tabel desktop (Layanan, Periode, Agen, Tiket, ...). */
const TICKET_CELL_INDEX = 3;

/** Nomor tiket ber-spasi yang harus tampil tanpa spasi tepi. */
const PADDED_TICKET_VALUE = "TKT-2026-0777";
const PADDED_TICKET_RAW = `  ${PADDED_TICKET_VALUE}  `;

/** (a) actionable, nomor tiket dikelilingi spasi. */
const ROW_ACTIONABLE_PADDED_TICKET: ReportRow = {
  ...ROW_ACTIONABLE_EMAIL,
  id: "row-actionable-padded-ticket",
  no_tiket: PADDED_TICKET_RAW,
};

/** (b) actionable, `no_tiket` ada tapi bernilai `null`. */
const ROW_ACTIONABLE_TICKET_NULL: ReportRow = {
  ...ROW_ACTIONABLE_CALL,
  id: "row-actionable-ticket-null",
  no_tiket: null,
};

/**
 * (c) actionable, field `no_tiket` TIDAK ADA sama sekali — ditulis literal,
 * bukan spreading lalu menghapus key, supaya "tidak ada field" terlihat langsung
 * di fixture dan bukan hasil tebakan.
 */
const ROW_ACTIONABLE_TICKET_ABSENT: ReportRow = {
  id: "row-actionable-ticket-absent",
  service_type: "email",
  tahun: 2026,
  is_phantom_padding: false,
  nilai: 1,
  ketidaksesuaian: FINDING_ACTIONABLE_EMAIL,
  sebaiknya: RECOMMENDATION_ACTIONABLE_EMAIL,
  profiler_peserta: { id: "agent-2", nama: "Bima Saputra", batch_name: "Batch 7" },
  qa_indicators: { id: "indicator-dokumen", name: "Kelengkapan dokumen" },
  qa_periods: { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
};

/**
 * Nilai mentah fixture tiket ber-spasi. Dipakai test sebagai bukti bahwa
 * fixture-nya memang punya spasi tepi — kalau ini sama dengan nilai yang
 * diharapkan, test tidak membuktikan apa pun.
 */
const RAW_TICKET_PAD = PADDED_TICKET_RAW;

/**
 * `textContent` mentah satu elemen — TANPA normalisasi whitespace.
 * Inilah satu-satunya cara melihat apakah `.trim()` benar-benar berjalan pada
 * nilai yang dirender.
 */
async function rawText(locator: Locator): Promise<string> {
  return locator.evaluate((node) => node.textContent ?? "");
}

/** Satu `<tr>` tabel desktop, dicari lewat Temuan yang unik pada baris itu. */
function desktopRowFor(page: Page, finding: string): Locator {
  return desktopResults(page).getByRole("row").filter({ hasText: finding });
}

/** Sel "No. Tiket" pada baris tabel desktop tertentu. */
function desktopTicketCell(page: Page, finding: string): Locator {
  return desktopRowFor(page, finding).getByRole("cell").nth(TICKET_CELL_INDEX);
}

/** Satu `<li>` daftar mobile, dicari lewat Temuan yang unik pada item itu. */
function mobileItemFor(page: Page, finding: string): Locator {
  return page.getByTestId(RESULTS_LIST).getByRole("listitem").filter({ hasText: finding });
}

/** Escape meta-karakter regex supaya nilai tiket tidak mengubah pola. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Baris "Tiket <value>" pada item daftar mobile. `^Tiket` di-anchor supaya
 * paragraf agen/periode/Skor tidak ikut tercocok; teks yang sudah dinormalisasi
 * dipakai untuk pencocokan, sementara pembuktian padding tetap lewat `rawText`.
 */
function mobileTicketLine(page: Page, finding: string, rendered: string): Locator {
  return mobileItemFor(page, finding).getByText(
    new RegExp(`^Tiket ${escapeRegExp(rendered)}$`),
  );
}

/** Viewport yang dipakai untuk membuktikan KEDUA representasi secara terlihat. */
const TICKET_DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const TICKET_MOBILE_VIEWPORT = { width: 390, height: 844 };

/**
 * Placeholder select Agen hanya berubah dari "Memuat agen..." ke "Pilih Agen"
 * setelah respons selesai. `toHaveText` menunggu perubahan itu; begitu berubah,
 * daftar opsi sudah final karena `data` dan `loading` di-commit bersama — jadi
 * pembacaan daftar penuh berikutnya tidak bisa menangkap keadaan setengah jalan.
 */
async function settledAgentOptions(agentSelect: Locator): Promise<string[]> {
  await expect(agentSelect.locator("option").first()).toHaveText("Pilih Agen");
  return optionLabels(agentSelect);
}

/**
 * Bukti bahwa tepat satu representasi yang tampil pada viewport tertentu, dan
 * nilai yang diuji ada di representation itu (bukan di copy yang tersembunyi).
 */
async function expectActiveRepresentation(
  page: Page,
  viewport: { width: number; height: number },
): Promise<Locator> {
  await page.setViewportSize(viewport);
  const table = page.getByTestId(RESULTS_TABLE);
  const list = page.getByTestId(RESULTS_LIST);
  if (viewport.width >= DESKTOP_MIN_WIDTH) {
    await expect(table, `${viewport.width}px: tabel harus tampil`).toBeVisible();
    await expect(list, `${viewport.width}px: daftar mobile harus tersembunyi`).toBeHidden();
    return table;
  }
  await expect(list, `${viewport.width}px: daftar ringkas harus tampil`).toBeVisible();
  await expect(table, `${viewport.width}px: tabel harus tersembunyi`).toBeHidden();
  return list;
}

test.describe("SIDAK reports data workspace", () => {
  // Fail-closed SEBELUM test pertama: target harus terbukti dev-server lokal.
  test.beforeAll(async () => {
    await assertLocalDevOnlyTarget();
  });

  test.afterEach(() => {
    // Jangan biarkan penahanan respons bocor ke test berikutnya.
    activeReportResponseGate = null;
    for (const audit of activeAudits.splice(0)) {
      console.log(
        [
          "[audit] mockedApi:", JSON.stringify(audit.mockedApi),
          "[audit] mockedAuth:", JSON.stringify(audit.mockedAuth),
          "[audit] localDev:", String(audit.localDev.length),
          "[audit] blockedApi:", JSON.stringify(audit.blockedApi),
          "[audit] blockedExternal:", JSON.stringify(audit.blockedExternal),
          "[audit] blockedLocal:", JSON.stringify(audit.blockedLocal),
        ].join("\n"),
      );
    }
  });

  test("Per Layanan hanya menampilkan temuan actionable dengan Temuan dan Rekomendasi lengkap", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    await page.getByRole("button", { name: "Cari Data" }).click();

    // Kontrak kolom: Temuan dan Rekomendasi harus dua kolom terpisah.
    await expect(page.getByRole("columnheader", { name: "Temuan" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Rekomendasi" })).toBeVisible();

    // Dua teks utuh untuk baris actionable, lengkap di representasi desktop.
    await expect(desktopResults(page).getByText(FINDING_ACTIONABLE_CALL, { exact: false })).toBeVisible();
    await expect(desktopResults(page).getByText(RECOMMENDATION_ACTIONABLE_CALL, { exact: false })).toBeVisible();
    await expect(desktopResults(page).getByText(FINDING_ACTIONABLE_EMAIL, { exact: false })).toBeVisible();
    await expect(desktopResults(page).getByText(RECOMMENDATION_ACTIONABLE_EMAIL, { exact: false })).toBeVisible();

    // Tiket riil tetap terlihat.
    await expect(desktopResults(page).getByText("TKT-2026-0142")).toBeVisible();
    await expect(desktopResults(page).getByText("TKT-2026-0310")).toBeVisible();

    // Hanya 2 dari 5 baris yang actionable: phantom dan dua baris teks kosong hilang.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");
    await expect(resultRows(page)).toHaveCount(2);
    for (const text of NON_ACTIONABLE_TEXTS) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }
    await expect(page.getByText("TKT-2026-9001")).toHaveCount(0);
    await expect(page.getByText("TKT-2026-0201")).toHaveCount(0);
    await expect(page.getByText("TKT-2026-0202")).toHaveCount(0);

    // Parity export: file .xlsx asli dari button Export Excel harus berisi
    // dua baris actionable yang sama dengan layar, lengkap dengan
    // `sebaiknya`, dan tidak boleh membocorkan baris non-actionable.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^laporan-data-\d{4}\.xlsx$/);
    // Artefak yang bisa diperiksa ulang di luar repo: file .xlsx asli dari app.
    // `resolveArtifactDir` menolak path di dalam repo, jadi working tree tidak
    // pernah dipakai tempatartefak.
    const artifact = path.join(resolveArtifactDir(), download.suggestedFilename());
    await download.saveAs(artifact);
    console.log(`[artifact] xlsx export: ${artifact}`);
    const workbook = await readDownloadedWorkbook(download);

    expect(Object.keys(workbook)).toContain("Data Laporan");
    const grid = workbook["Data Laporan"];
    // Header ekspor existing dipertahankan (`Seharusnya`, bukan `Rekomendasi`).
    expect(grid[0]).toEqual([
      "Layanan",
      "Periode",
      "Agen",
      "Batch",
      "No. Tiket",
      "Parameter",
      "Temuan",
      "Seharusnya",
      "Skor",
    ]);

    const exportedRows = grid.slice(1).filter((cells) => cells.some((cell) => cell.trim() !== ""));
    expect(exportedRows).toHaveLength(2);
    expect(exportedRows.map((cells) => cells.join(" | "))).toEqual([
      [
        "Call",
        "03/2026",
        "Alya Pranoto",
        "Batch 7",
        "TKT-2026-0142",
        "Akurasi informasi produk",
        FINDING_ACTIONABLE_CALL,
        RECOMMENDATION_ACTIONABLE_CALL,
        "2",
      ].join(" | "),
      [
        "Email",
        "03/2026",
        "Bima Saputra",
        "Batch 7",
        "TKT-2026-0310",
        "Kelengkapan dokumen",
        FINDING_ACTIONABLE_EMAIL,
        RECOMMENDATION_ACTIONABLE_EMAIL,
        "3",
      ].join(" | "),
    ]);

    const allCells = Object.values(workbook).flat(2).join("\n");
    for (const text of NON_ACTIONABLE_TEXTS) {
      expect(allCells, `ekspor membocorkan baris non-actionable: ${text}`).not.toContain(text);
    }
    for (const ticket of ["TKT-2026-9001", "TKT-2026-0201", "TKT-2026-0202"]) {
      expect(allCells, `ekspor membocorkan tiket non-actionable: ${ticket}`).not.toContain(ticket);
    }

    // Bukti isolasi: tidak ada request ke host eksternal selain font, dan
    // tidak ada endpoint yang tidak dimock.
    expectNoApplicationTraffic(audit);
  });

  test("Filter tahun, bulan, dan layanan diteruskan ke endpoint data", async ({ page }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    // Label opsi bulan = nama Indonesia penuh, default = setahun penuh, dan
    // `value` tetap angka. Dibuktikan SEBELUM request apa pun dikirim.
    await assertIndonesianMonthOptions(page);

    // Hasil pertama diambil dengan filter default, lalu dibuang saat filter
    // berubah supaya hasil lama tidak pernah diklaim sebagai filter baru.
    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");

    await page.getByRole("combobox", { name: "Layanan" }).selectOption("email");
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export Excel" })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Tahun" }).selectOption("2025");
    // Dipilih berdasarkan LABEL yang terlihat, bukan angka: ini yang membuktikan
    // label Indonesia terikat ke `value` angka yang benar.
    await page
      .getByRole("combobox", { name: "Dari bulan" })
      .selectOption({ label: MIDDLE_FROM_MONTH.label });
    await page
      .getByRole("combobox", { name: "Ke bulan" })
      .selectOption({ label: MIDDLE_TO_MONTH.label });
    await page.getByRole("button", { name: "Cari Data" }).click();

    await expect(page.getByTestId(RESULTS_COUNT)).toBeVisible();
    expect(dataRequests).toHaveLength(2);
    // Default tetap 1..12 walaupun labelnya sudah nama bulan.
    expect(dataRequests[0].body).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    expect(dataRequests[1].method).toBe("POST");
    // Payload tetap ANGKA, bukan nama bulan: 3 dan 5, bukan "Maret"/"Mei".
    expect(dataRequests[1].body).toEqual({
      serviceType: "email",
      year: 2025,
      startMonth: Number(MIDDLE_FROM_MONTH.value),
      endMonth: Number(MIDDLE_TO_MONTH.value),
    });
    expect(dataRequests[1].body.startMonth).toBe(3);
    expect(dataRequests[1].body.endMonth).toBe(5);

    // Label terpilih mengikuti nilai yang dikirim, jadi tidak ada ambigu
    // "Maret" = bulan ke berapa.
    expect(await selectedMonth(page.getByRole("combobox", { name: "Dari bulan" }))).toEqual({
      label: MIDDLE_FROM_MONTH.label,
      value: MIDDLE_FROM_MONTH.value,
    });
    expect(await selectedMonth(page.getByRole("combobox", { name: "Ke bulan" }))).toEqual({
      label: MIDDLE_TO_MONTH.label,
      value: MIDDLE_TO_MONTH.value,
    });

    expectNoApplicationTraffic(audit);
  });

  test("Respons request yang telat tidak boleh muncul sebagai hasil filter baru", async ({ page }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const deferred = createDeferredReportResponse();

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    // Nama tombol berubah jadi "Memuat..." saat loading, jadi regex ini
    // tetap menunjuk elemen yang sama pada kedua status.
    const searchButton = page.getByRole("button", { name: /Cari Data|Memuat/ });

    // (1) Request pertama DILETAK: handler mock menahan `route.fulfill`, jadi
    // respons belum ada sementara filter masih yang lama (± 2026).
    await searchButton.click();
    await deferred.arrived;
    expect(dataRequests).toHaveLength(1);
    expect(dataRequests[0].body).toEqual({ year: expect.any(Number), startMonth: 1, endMonth: 12 });
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);

    // (2) User mengubah filter (tahun → 2025) sebelum respons request pertama tiba.
    await page.getByRole("combobox", { name: "Tahun" }).selectOption("2025");
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);

    // (3) Respons request LAMA sekarang tiba dan diproses aplikasi.
    deferred.release();
    // `toBeEnabled` hanya benar setelah `setLoading(false)` ter-commit. React
    // membatch `setResults` dan `setLoading(false)` dari continuation yang sama,
    // jadi assertion di bawah tidak berlomba dengan respons yang baru diproses.
    await expect(searchButton).toBeEnabled();

    // (4) Kontrak: baris request lama tidak boleh diklaim sebagai hasil filter
    // 2025 yang sedang terlihat. Count, isi tabel, dan tombol export semuanya
    // harus tetap tersembunyi — kalau bocor, ketiganya akan terlihat bersama.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Temuan" })).toHaveCount(0);
    for (const text of [
      FINDING_ACTIONABLE_CALL,
      RECOMMENDATION_ACTIONABLE_CALL,
      FINDING_ACTIONABLE_EMAIL,
      RECOMMENDATION_ACTIONABLE_EMAIL,
    ]) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }
    for (const ticket of ["TKT-2026-0142", "TKT-2026-0310"]) {
      await expect(page.getByText(ticket)).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Export Excel" })).toHaveCount(0);

    // (5) Guard tidak mematikan flow: request kedua dengan filter baru tetap
    // normal dan mengisi hasil. Tidak ada auto refetch — total tetap 2 request.
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");
    expect(dataRequests).toHaveLength(2);
    expect(dataRequests[1].body).toEqual({ year: 2025, startMonth: 1, endMonth: 12 });

    expectNoApplicationTraffic(audit);
  });

  test("Per Individu mewajibkan Agen dan meneruskan pesertaId", async ({ page }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    const searchButton = page.getByRole("button", { name: "Cari Data" });
    await page.getByRole("button", { name: "Per Individu" }).click();

    // Direktori `{agents,batches}` diterima tanpa crash.
    await expect(page.getByRole("option", { name: /Alya Pranoto/ })).toHaveCount(1);
    await expect(page.getByRole("option", { name: /Bima Saputra/ })).toHaveCount(1);
    await expect(searchButton).toBeDisabled();

    await page.getByRole("combobox", { name: "Agen" }).selectOption("agent-1");
    await expect(searchButton).toBeEnabled();
    await searchButton.click();

    await expect(
      desktopResults(page).getByText(FINDING_ACTIONABLE_CALL, { exact: false }),
    ).toBeVisible();
    expect(dataRequests).toHaveLength(1);
    expect(dataRequests[0].body).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      pesertaId: "agent-1",
    });
    expect(dataRequests[0].body).not.toHaveProperty("serviceType");

    expectNoApplicationTraffic(audit);
  });

  test("Direktori agen yang malformed tidak menawarkan agen dan menutup pencarian", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    // HTTP 200 `success: true` dengan `data` yang salah BENTUK, bukan request
    // gagal: dua bentuk berbeda dilayani per Tahun yang dipilih, jadi keduanya
    // harus lewat alur user yang nyata: load halaman, lalu ganti Tahun.
    //   2026 → `agents` bukan array  (menolak di guard array)
    //   2025 → `data` null          (menolak di guard `!raw`)
    await openReportsData(page, audit, dataRequests, ALL_ROWS, undefined, {
      byYear: { "2026": { agents: "not-an-array" }, "2025": null },
    });

    await page.getByRole("button", { name: "Per Individu" }).click();

    const agentSelect = page.getByRole("combobox", { name: "Agen" });
    // (1) Tidak ada agen yang bisa dipilih, dan label placeholder bukan "Memuat
    // agen..." — jadi respons SUDAH sampai dan ditolak oleh normalisasi, bukan
    // sekadar masih di-flight.
    await expect(agentSelect).toHaveValue("");
    expect(await settledAgentOptions(agentSelect), "label opsi Agen saat malformed").toEqual([
      "Pilih Agen",
    ]);
    for (const agent of ["Alya Pranoto", "Bima Saputra"]) {
      await expect(
        page.getByRole("option", { name: new RegExp(agent) }),
        `agen "${agent}" tidak boleh tetap selectable`,
      ).toHaveCount(0);
    }

    // (2) Penyebab `disabled` harus terbukti JUSTRU direktori agen, bukan
    // katalog Parameter: katalog sudah selesai dan utuh saat tombol dinilai.
    const parameter = parameterSelect(page);
    await expect(parameter).toBeEnabled();
    expect(await optionLabels(parameter), "katalog Parameter belum selesai").toEqual(
      ALL_SCOPE_PARAMETER_LABELS,
    );
    await expect(parameterPendingStatus(page)).toHaveCount(0);
    await expect(parameterErrorAlert(page)).toHaveCount(0);

    const searchButton = cariDataButton(page);
    await expect(searchButton).toBeDisabled();

    // (3) "Aman" = tidak bisa mengirim apa pun dan halaman tidak rusak: hasil
    // tidak pernah ada, tidak ada request data, dan filter masih terbaca.
    expect(dataRequests, "pencarian tidak boleh jalan tanpa agen").toEqual([]);
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await expect(page.getByText("Belum ada pencarian.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Excel" })).toHaveCount(0);

    // (4) Bentuk malformed kedua, lewat Tahun yang sama: `data: null`. Request
    // direktori agen yang kedua harus benar-benar terkirim — kalau tidak, test
    // ini hanya mengulang bentuk pertama.
    await page.getByRole("combobox", { name: "Tahun" }).selectOption("2025");
    expect(
      await settledAgentOptions(agentSelect),
      "label opsi Agen saat data null",
    ).toEqual(["Pilih Agen"]);
    await expect(searchButton).toBeDisabled();
    expect(dataRequests).toEqual([]);
    expect(
      audit.mockedApi.filter((label) => label.includes("/sidak/agents?year=2025")),
      "request direktori agen untuk 2025 tidak terkirim",
    ).not.toHaveLength(0);

    // Bukti kedua bentuk malformed benar-benar dilayani mock, bukan kebetulan
    // respons default.
    const agentRequests = audit.mockedApi.filter((label) => label.includes("/sidak/agents"));
    expect(agentRequests.some((label) => label.includes("year=2026"))).toBe(true);
    expect(agentRequests.some((label) => label.includes("year=2025"))).toBe(true);

    expectNoApplicationTraffic(audit);
  });

  test("Nomor tiket ber-spasi tampil sudah dinormalisasi di desktop dan mobile", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, [ROW_ACTIONABLE_PADDED_TICKET]);
    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");

    // (1) Desktop: tabel yang tampil. `toHaveText` = bacaan user; `rawText` =
    // bukti `.trim()` benar-benar jalan pada nilai yang dirender.
    await expectActiveRepresentation(page, TICKET_DESKTOP_VIEWPORT);
    const desktopCell = desktopTicketCell(page, FINDING_ACTIONABLE_EMAIL);
    await expect(desktopCell).toBeVisible();
    await expect(desktopCell).toHaveText(PADDED_TICKET_VALUE);
    expect(
      await rawText(desktopCell),
      "spasi tepi nomor tiket bocor ke DOM tabel",
    ).toBe(PADDED_TICKET_VALUE);

    // (2) Mobile: daftar ringkas yang sama nilainya, juga tanpa spasi tepi.
    await expectActiveRepresentation(page, TICKET_MOBILE_VIEWPORT);
    const mobileLine = mobileTicketLine(page, FINDING_ACTIONABLE_EMAIL, PADDED_TICKET_VALUE);
    await expect(mobileLine).toBeVisible();
    await expect(mobileLine).toHaveText(`Tiket ${PADDED_TICKET_VALUE}`);
    expect(
      await rawText(mobileLine),
      "spasi tepi nomor tiket bocor ke DOM daftar mobile",
    ).toBe(`Tiket ${PADDED_TICKET_VALUE}`);

    // Baris ini tetap utuh: hanya nomor tiket yang dinormalisasi.
    await expect(
      mobileItemFor(page, FINDING_ACTIONABLE_EMAIL).getByText(FINDING_ACTIONABLE_EMAIL, {
        exact: false,
      }),
    ).toBeVisible();
    expect(RAW_TICKET_PAD, "fixture harus benar-benar punya spasi tepi").not.toBe(
      PADDED_TICKET_VALUE,
    );

    expectNoApplicationTraffic(audit);
  });

  test("Nomor tiket null atau tidak ada tetap terlihat sebagai - di desktop dan mobile", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, [
      ROW_ACTIONABLE_TICKET_NULL,
      ROW_ACTIONABLE_TICKET_ABSENT,
    ]);
    await page.getByRole("button", { name: "Cari Data" }).click();
    // Kedua baris tetap ACTIONABLE: Temuan + Rekomendasi lengkap. Yang berubah
    // hanya kolom nomor tiket, jadi penyingkirannya tidak boleh ikut menurunkan
    // jumlah temuan.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");
    await expect(resultRows(page)).toHaveCount(2);

    for (const finding of [FINDING_ACTIONABLE_CALL, FINDING_ACTIONABLE_EMAIL]) {
      // (1) Desktop: placeholder harus benar-benar "-" yang terlihat, bukan
      // sel kosong. `rawText` yang membuktikan itu — teks kosong menormalisasi
      // jadi `""`, jadi hanya "-" yang bisa membedakan keduanya.
      await expectActiveRepresentation(page, TICKET_DESKTOP_VIEWPORT);
      const cell = desktopTicketCell(page, finding);
      await expect(cell).toBeVisible();
      await expect(cell).toHaveText("-");
      expect(
        await rawText(cell),
        `placeholder "-" hilang pada baris "${finding.slice(0, 32)}…"`,
      ).toBe("-");

      // (2) Mobile: nilai yang sama, di representasi yang tampil di sana.
      await expectActiveRepresentation(page, TICKET_MOBILE_VIEWPORT);
      const line = mobileTicketLine(page, finding, "-");
      await expect(line).toBeVisible();
      await expect(line).toHaveText("Tiket -");
      expect(
        await rawText(line),
        `placeholder "-" hilang di daftar mobile untuk "${finding.slice(0, 32)}…"`,
      ).toBe("Tiket -");
    }

    expectNoApplicationTraffic(audit);
  });

  test("Filter Parameter meneruskan indicatorId di Per Layanan dan Per Individu", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    // Mock data dihitung DARI payload: kalau `indicatorId` tidak terkirim,
    // backend (dan karena itu layar + Excel) mengembalikan semua baris. Jadi
    // "UI benar" tidak mungkin terjadi tanpa "request benar".
    await openReportsData(page, audit, dataRequests, (body) => {
      const indicatorId = typeof body.indicatorId === "string" ? body.indicatorId : "";
      if (indicatorId === "") return PARAMETER_ROWS;
      return PARAMETER_ROWS.filter((row) => row.indicator_id === indicatorId);
    });

    const searchButton = page.getByRole("button", { name: /Cari Data|Memuat/ });
    const parameter = parameterSelect(page);

    // (1) KEDUA mode punya kontrol yang sama, default "Semuanya" = tanpa
    // filter. Di Per Layanan katalognya seluruh indikator AKTIF; dua
    // parameter bernama sama wajib terbaca berbeda lewat label layanan, dan
    // `parameter_group` ikut tampil lewat `formatQAIndicatorName`.
    await expect(parameter).toBeVisible();
    expect(await selectedOption(parameter)).toEqual({ label: "Semuanya", value: "" });
    expect(await optionLabels(parameter)).toEqual(ALL_SCOPE_PARAMETER_LABELS);
    // Katalog diambil tanpa `service_type` saat "Semua Layanan" dipilih.
    // Dev server memakai StrictMode, jadi effect mount bisa jalan dua kali;
    // yang dibuktikan adalah ISI query setiap request, bukan jumlah request.
    const catalogBeforeService = indicatorRequestLabels(audit).length;
    expect(indicatorRequestLabels(audit).slice(0, catalogBeforeService)).not.toHaveLength(0);
    expect(indicatorRequestLabels(audit).every((label) => label === INDICATORS_ALL_SCOPE)).toBe(
      true,
    );

    // (2) Tanpa filter parameter, tidak ada `indicatorId` di payload dan
    // semua baris actionable (4 dari 6) yang terlihat.
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("4 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("indicatorId");

    // (3) Per Layanan + satu layanan → katalog dipersempit dengan query PERSIS
    // `service_type`, dan label tidak perlu prefiks layanan karena sudah pasti.
    const catalogBeforeCall = indicatorRequestLabels(audit).length;
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("call");
    await expect(parameter.locator("option")).toHaveCount(3);
    expect(await optionLabels(parameter)).toEqual([
      "Semuanya",
      "Akurasi informasi produk",
      "Compliance — Kepatuhan prosedur",
    ]);
    const callScopeRequests = indicatorRequestLabels(audit).slice(catalogBeforeCall);
    expect(callScopeRequests).not.toHaveLength(0);
    expect(
      callScopeRequests.every((label) => label === indicatorsForService("call")),
      `query katalog tidak persis: ${callScopeRequests.join(" | ")}`,
    ).toBe(true);

    // (4) Ganti ke Per Individu: tidak ada select Layanan, jadi cakupannya
    // kembali ke seluruh katalog aktif — dan query `service_type` yang masih
    // tersimpan di state layanan TIDAK boleh ikut terpakai.
    const catalogBeforeModeSwitch = indicatorRequestLabels(audit).length;
    await page.getByRole("button", { name: "Per Individu" }).click();
    await expect(parameter.locator("option")).toHaveCount(5);
    expect(await optionLabels(parameter)).toEqual(ALL_SCOPE_PARAMETER_LABELS);
    const modeSwitchRequests = indicatorRequestLabels(audit).slice(catalogBeforeModeSwitch);
    expect(modeSwitchRequests).not.toHaveLength(0);
    expect(
      modeSwitchRequests.every((label) => label === INDICATORS_ALL_SCOPE),
      `Per Individu tidak boleh memakai query layanan: ${modeSwitchRequests.join(" | ")}`,
    ).toBe(true);

    // (5) Per Individu + parameter: `indicatorId` menambah satu field pada
    // POST yang sudah ada, field lain tidak berubah dan `serviceType` tetap
    // tidak ada. Nilainya UUID dari katalog, bukan nama parameter.
    await page.getByRole("combobox", { name: "Agen" }).selectOption("agent-1");
    await parameter.selectOption(IND_CHAT_AKURASI.id);
    expect(await selectedOption(parameter)).toEqual({
      label: "Chat · Akurasi informasi produk",
      value: IND_CHAT_AKURASI.id,
    });
    await searchButton.click();

    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      pesertaId: "agent-1",
      indicatorId: IND_CHAT_AKURASI.id,
    });
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("serviceType");
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CHAT_AKURASI, { exact: false }),
    ).toBeVisible();
    // Baris parameter lain, phantom, dan baris tanpa Rekomendasi harus hilang.
    for (const text of [
      ...otherParameterFindings(FINDING_PARAM_CHAT_AKURASI),
      ...PARAMETER_NON_ACTIONABLE_TEXTS,
    ]) {
      await expect(page.getByText(text, { exact: false }), text).toHaveCount(0);
    }
    await expect(resultRows(page)).toHaveCount(1);

    // (6) Excel mengikuti ID yang terkirim, bukan namanya: parameter Chat dan
    // Call sama-sama bernama "Akurasi informasi produk", jadi kolom Layanan dan
    // Temuan yang membedakan keduanya.
    const chatRows = await exportDataWorkbook(page, "export-parameter-chat");
    expect(chatRows).toHaveLength(1);
    expect(chatRows[0].join(" | ")).toBe(
      [
        "Chat",
        "03/2026",
        "Alya Pranoto",
        "Batch 7",
        "TKT-2026-1102",
        "Akurasi informasi produk",
        FINDING_PARAM_CHAT_AKURASI,
        RECOMMENDATION_PARAM_CHAT_AKURASI,
        "2",
      ].join(" | "),
    );

    // (7) Per Layanan: layanan + parameter bisa digabung, dan pilihan yang
    // masih valid setelah penyempitan cakupannya TETAP terpilih.
    await page.getByRole("button", { name: "Per Layanan" }).click();
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("call");
    await parameter.selectOption(IND_CALL_KEPATUHAN.id);
    expect(await selectedOption(parameter)).toEqual({
      label: "Compliance — Kepatuhan prosedur",
      value: IND_CALL_KEPATUHAN.id,
    });
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      serviceType: "call",
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      indicatorId: IND_CALL_KEPATUHAN.id,
    });
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CALL_KEPATUHAN, { exact: false }),
    ).toBeVisible();
    for (const text of [
      ...otherParameterFindings(FINDING_PARAM_CALL_KEPATUHAN),
      ...PARAMETER_NON_ACTIONABLE_TEXTS,
    ]) {
      await expect(page.getByText(text, { exact: false }), text).toHaveCount(0);
    }

    // (8) Cakupan berubah jadi layanan yang tidak punya parameter itu:
    // pilihan lama tidak bisa dikirim sebagai filter yatim, jadi dibersihkan
    // ke "Semuanya" dan hasil lama (count + export) langsung hilang.
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("email");
    await expect(parameter).toHaveValue("");
    expect(await selectedOption(parameter)).toEqual({ label: "Semuanya", value: "" });
    await expect(parameter.locator("option")).toHaveCount(2);
    expect(await optionLabels(parameter)).toEqual(["Semuanya", "Kelengkapan dokumen"]);
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export Excel" })).toHaveCount(0);
    await searchButton.click();
    expect(lastDataRequest(dataRequests)).toEqual({
      serviceType: "email",
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("indicatorId");

    // (9) Respons yang telat untuk parameter LAMA tidak boleh muncul sebagai
    // hasil parameter baru: request Email ditahan, filter diganti ke
    // Kepatuhan prosedur, baru responsnya dilepas.
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("");
    await parameter.selectOption(IND_EMAIL_DOKUMEN.id);
    const deferred = createDeferredReportResponse();
    await searchButton.click();
    await deferred.arrived;
    expect(lastDataRequest(dataRequests).indicatorId).toBe(IND_EMAIL_DOKUMEN.id);

    await parameter.selectOption(IND_CALL_KEPATUHAN.id);
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);

    deferred.release();
    await expect(searchButton).toBeEnabled();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    for (const text of [FINDING_PARAM_EMAIL_DOKUMEN, FINDING_PARAM_CALL_KEPATUHAN]) {
      await expect(page.getByText(text, { exact: false }), text).toHaveCount(0);
    }
    await expect(page.getByRole("button", { name: "Export Excel" })).toHaveCount(0);

    // (10) Guard tidak mematikan flow: pencarian dengan parameter baru tetap
    // mengisi hasil yang benar.
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests).indicatorId).toBe(IND_CALL_KEPATUHAN.id);
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CALL_KEPATUHAN, { exact: false }),
    ).toBeVisible();
    for (const text of [
      ...otherParameterFindings(FINDING_PARAM_CALL_KEPATUHAN),
      ...PARAMETER_NON_ACTIONABLE_TEXTS,
    ]) {
      await expect(page.getByText(text, { exact: false }), text).toHaveCount(0);
    }

    // (11) Mengosongkan filter mengembalikan hasil penuh: `indicatorId` dihapus
    // dari payload, tabel dan Excel kembali ke semua baris actionable.
    await parameter.selectOption("");
    expect(await selectedOption(parameter)).toEqual({ label: "Semuanya", value: "" });
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveCount(0);
    await searchButton.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("4 temuan");
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("indicatorId");
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("serviceType");

    const allRows = await exportDataWorkbook(page, "export-parameter-semua");
    expect(allRows).toHaveLength(4);
    expect(allRows.map((cells) => cells[0])).toEqual(["Call", "Chat", "Call", "Email"]);
    const allCells = allRows.map((cells) => cells.join(" | ")).join("\n");
    for (const text of PARAMETER_NON_ACTIONABLE_TEXTS) {
      expect(allCells, `ekspor bocor baris non-actionable: ${text}`).not.toContain(text);
    }
    for (const finding of PARAMETER_FINDINGS) {
      expect(allCells, `baris parameter tidak ikut diekspor: ${finding}`).toContain(finding);
    }

    // Bukti-kriteria katalog: hanya endpoint mock yang dilayani, dan tidak
    // ada satu pun request `/api` yang lolos ke proxy Vite.
    expect(audit.blockedApi).toEqual([]);
    expect(
      indicatorRequestLabels(audit).every((label) => label.startsWith(INDICATORS_ALL_SCOPE)),
    ).toBe(true);
    expectNoApplicationTraffic(audit);
  });

  // ── Validasi katalog pada transisi cakupan ────────────────────────────────
  // Keempat test di bawah satu kontrak yang sama: pilihan Parameter hanya boleh
  // dibuang setelah katalog BARU benar-benar selesai dan UUID itu terbukti
  // tidak ada di sana. Selama transisi, katalog lama tidak boleh dijualkan
  // sebagai daftar cakupan baru, filter basi tidak boleh terkirim, dan "Cari
  // Data" tidak boleh Claims hasil tak terfilter.

  /** Baris dihitung dari `indicatorId` yang benar-benar terkirim. */
  const parameterAwareRows = (body: Record<string, unknown>): ReportRow[] => {
    const indicatorId = typeof body.indicatorId === "string" ? body.indicatorId : "";
    if (indicatorId === "") return PARAMETER_ROWS;
    return PARAMETER_ROWS.filter((row) => row.indicator_id === indicatorId);
  };

  test("Parameter terpilih tetap terpilih saat cakupan melebar dan tidak terkirim selama transisi", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const indicators = okIndicatorMock();
    await openReportsData(page, audit, dataRequests, parameterAwareRows, indicators);

    const parameter = parameterSelect(page);
    const search = cariDataButton(page);

    // (1) Titik awal: seluruh katalog aktif, lalu cakupannya menyempit ke Call
    // dan satu parameter dipilih.
    await expect(parameter.locator("option")).toHaveCount(5);
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("call");
    await expect(parameter.locator("option")).toHaveCount(3);
    await parameter.selectOption(IND_CALL_KEPATUHAN.id);
    expect(await selectedOption(parameter)).toEqual({
      label: "Compliance — Kepatuhan prosedur",
      value: IND_CALL_KEPATUHAN.id,
    });

    // (2) Cakupan MELAR: Per Individu tidak punya select Layanan, jadi katalognya
    // seluruh katalog aktif. Respons ditahan supaya keadaan transisi benar-benar
    // terlihat — tanpa penahanan, seluruh assertion di bawah bisa lolos dalam
    // satu frame dan tidak membuktikan apa pun.
    const pending = createDeferredIndicatorResponse(indicators);
    await page.getByRole("button", { name: "Per Individu" }).click();
    await pending.arrived;

    await expect(parameter).toBeDisabled();
    // Katalog lama (2 parameter Call) tidak boleh stubbornly offering diri
    // sebagai daftar Parameter cakupan baru.
    await expect(parameter.locator("option")).toHaveCount(1);
    await expect(parameterPendingStatus(page)).toBeVisible();
    // Agen dipilih lebih dulu, jadi satu-satunya alasan "Cari Data" disabled
    // adalah katalog yang belum divalidasi.
    await page.getByRole("combobox", { name: "Agen" }).selectOption("agent-1");
    await expect(search).toBeDisabled();
    // Klik paksa ke tombol disabled tidak boleh menghasilkan request: inilah
    // fail-closed-nya, bukan sekadar tombol yang terlihat mati.
    await search.click({ force: true });
    await page.waitForTimeout(200);
    expect(dataRequests, "Cari Data mengirim request saat katalog belum tervalidasi").toEqual([]);

    // (3) Katalog baru sudah settle dan UUID itu MASIH ADA di sana, jadi
    // pilihan wajib utuh. Cakupan melebar tidak berarti pilihan dibuang.
    pending.release();
    await expect(parameter.locator("option")).toHaveCount(5);
    expect(await optionLabels(parameter)).toEqual(ALL_SCOPE_PARAMETER_LABELS);
    expect(await selectedOption(parameter)).toEqual({
      label: "Call · Compliance — Kepatuhan prosedur",
      value: IND_CALL_KEPATUHAN.id,
    });
    await expect(search).toBeEnabled();

    // (4) Yang terkirim harus sama dengan yang tampil.
    await search.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      pesertaId: "agent-1",
      indicatorId: IND_CALL_KEPATUHAN.id,
    });
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CALL_KEPATUHAN, { exact: false }),
    ).toBeVisible();

    expect(audit.blockedApi).toEqual([]);
    expectNoApplicationTraffic(audit);
  });

  test("Katalog parameter yang gagal menutup filter dan retry memulihkan pilihan yang masih valid", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const indicators = okIndicatorMock();
    await openReportsData(page, audit, dataRequests, parameterAwareRows, indicators);

    const parameter = parameterSelect(page);
    const search = cariDataButton(page);

    await expect(parameter.locator("option")).toHaveCount(5);
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("call");
    await expect(parameter.locator("option")).toHaveCount(3);
    await parameter.selectOption(IND_CALL_KEPATUHAN.id);

    // Cakupan melebar ke seluruh layanan, tapi request katalognya gagal (500).
    indicators.mode = "error";
    indicators.message = "Gagal memuat daftar parameter.";
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("");

    await expect(parameterErrorAlert(page)).toBeVisible();
    await expect(parameter).toBeDisabled();
    await expect(parameter.locator("option")).toHaveCount(1);
    // Kegagalan katalog tidak boleh dipresentasikan sebagai "Semuanya" yang
    // sah: tombol cari harus tetap tertutup supaya tidak ada laporan
    // tak terfilter yang diklaim.
    await expect(search).toBeDisabled();
    await search.click({ force: true });
    await page.waitForTimeout(200);
    expect(dataRequests, "request tak terfilter lolos saat katalog gagal").toEqual([]);

    // Retry: katalog kembali, dan UUID yang masih valid dipulihkan utuh —
    // kegagalan sesaat tidak boleh menghapus pilihan user.
    indicators.mode = "ok";
    await page.getByRole("button", { name: "Coba lagi" }).click();
    await expect(parameter.locator("option")).toHaveCount(5);
    expect(await optionLabels(parameter)).toEqual(ALL_SCOPE_PARAMETER_LABELS);
    expect(await selectedOption(parameter)).toEqual({
      label: "Call · Compliance — Kepatuhan prosedur",
      value: IND_CALL_KEPATUHAN.id,
    });
    await expect(search).toBeEnabled();

    await search.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      indicatorId: IND_CALL_KEPATUHAN.id,
    });

    expect(audit.blockedApi).toEqual([]);
    expectNoApplicationTraffic(audit);
  });

  test("Respons katalog cakupan lama yang telat diabaikan saat cakupan berubah cepat", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const indicators = okIndicatorMock();
    await openReportsData(page, audit, dataRequests, parameterAwareRows, indicators);

    const parameter = parameterSelect(page);
    const search = cariDataButton(page);

    await expect(parameter.locator("option")).toHaveCount(5);
    await parameter.selectOption(IND_CHAT_AKURASI.id);

    // Request Email ditahan: user sudah pindah cakupan sebelum responsnya tiba.
    const stale = createDeferredIndicatorResponse(indicators);
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("email");
    await stale.arrived;
    await expect(parameter).toBeDisabled();

    // Klik kedua SAAT request pertama masih tertahan: katalog seluruh layanan
    // dilayani normal dan harus menang.
    await page.getByRole("button", { name: "Per Individu" }).click();
    await expect(parameter.locator("option")).toHaveCount(5);
    expect(await selectedOption(parameter)).toEqual({
      label: "Chat · Akurasi informasi produk",
      value: IND_CHAT_AKURASI.id,
    });

    // Respons Email yang telat sekarang dilepas. Kalau tidak diabaikan, katalog
    // Email (2 opsi) akan menggantikan katalog seluruh layanan dan pilihan Chat
    // ikut terhapus.
    stale.release();
    await page.waitForTimeout(400);
    expect(await optionLabels(parameter)).toEqual(ALL_SCOPE_PARAMETER_LABELS);
    expect(await selectedOption(parameter)).toEqual({
      label: "Chat · Akurasi informasi produk",
      value: IND_CHAT_AKURASI.id,
    });

    // Bukti kedua request benar-benar terjadi, jadi test ini tidak lolos
    // karena tidak ada balasan yang perlu diabaikan.
    const catalogRequests = indicatorRequestLabels(audit);
    expect(catalogRequests).toContain(indicatorsForService("email"));
    expect(
      catalogRequests.filter((label) => label === INDICATORS_ALL_SCOPE).length,
      "katalog seluruh layanan tidak diminta ulang setelah pindah cakupan",
    ).toBeGreaterThan(1);

    await page.getByRole("combobox", { name: "Agen" }).selectOption("agent-1");
    await search.click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("1 temuan");
    expect(lastDataRequest(dataRequests)).toEqual({
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
      pesertaId: "agent-1",
      indicatorId: IND_CHAT_AKURASI.id,
    });
    await expect(
      desktopResults(page).getByText(FINDING_PARAM_CHAT_AKURASI, { exact: false }),
    ).toBeVisible();

    expect(audit.blockedApi).toEqual([]);
    expectNoApplicationTraffic(audit);
  });

  test("Pilihan yang tidak ada di katalog baru dibersihkan tanpa pernah terkirim selama transisi", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];
    const indicators = okIndicatorMock();
    await openReportsData(page, audit, dataRequests, parameterAwareRows, indicators);

    const parameter = parameterSelect(page);
    const search = cariDataButton(page);

    await expect(parameter.locator("option")).toHaveCount(5);
    await parameter.selectOption(IND_CALL_AKURASI.id);
    expect(await selectedOption(parameter)).toEqual({
      label: "Call · Akurasi informasi produk",
      value: IND_CALL_AKURASI.id,
    });

    // Cakupan menyempit ke Email dan responsnya ditahan.
    const pending = createDeferredIndicatorResponse(indicators);
    await page.getByRole("combobox", { name: "Layanan" }).selectOption("email");
    await pending.arrived;

    // Selama transisi UUID lama tidak boleh terlihat sebagai pilihan yang masih
    // berlaku...
    await expect(parameter).toBeDisabled();
    await expect(parameter).toHaveValue("");
    await expect(parameter.locator("option")).toHaveCount(1);
    await expect(parameterPendingStatus(page)).toBeVisible();
    await expect(search).toBeDisabled();
    // ...dan tidak boleh terkirim sebagai filter yatim di tengah jalan.
    await search.click({ force: true });
    await page.waitForTimeout(200);
    expect(dataRequests, "filter yatim terkirim selama transisi cakupan").toEqual([]);

    // Baru setelah katalog Email selesai dan UUID itu memang tidak ada di sana,
    // pilihan dibersihkan ke "Semuanya".
    pending.release();
    await expect(parameter.locator("option")).toHaveCount(2);
    expect(await optionLabels(parameter)).toEqual(["Semuanya", "Kelengkapan dokumen"]);
    expect(await selectedOption(parameter)).toEqual({ label: "Semuanya", value: "" });

    await search.click();
    expect(lastDataRequest(dataRequests)).toEqual({
      serviceType: "email",
      year: expect.any(Number),
      startMonth: 1,
      endMonth: 12,
    });
    expect(lastDataRequest(dataRequests)).not.toHaveProperty("indicatorId");
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("4 temuan");

    expect(audit.blockedApi).toEqual([]);
    expectNoApplicationTraffic(audit);
  });

  test("Respons tanpa temuan actionable menampilkan state kosong tanpa export", async ({ page }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, [
      ROW_PHANTOM,
      ROW_WITHOUT_FINDING,
      ROW_WITHOUT_RECOMMENDATION,
    ]);

    await page.getByRole("button", { name: "Cari Data" }).click();

    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("0 temuan");
    await expect(
      page.getByText(
        "Tidak ada temuan dengan Temuan dan Rekomendasi lengkap untuk filter yang dipilih.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Export Excel" })).toHaveCount(0);
    for (const text of NON_ACTIONABLE_TEXTS) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }

    // Bukti visual state kosong (desktop default) untuk review manual.
    const emptyShot = path.join(resolveArtifactDir(), `state-empty-${page.viewportSize()?.width}.png`);
    await page.screenshot({ path: emptyShot });
    console.log(`[artifact] screenshot: ${emptyShot}`);

    expectNoApplicationTraffic(audit);
  });

  test("Rentang bulan terbalik ditolak tanpa memanggil endpoint data", async ({ page }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    await page.getByRole("combobox", { name: "Dari bulan" }).selectOption("7");
    await page.getByRole("combobox", { name: "Ke bulan" }).selectOption("3");
    await page.getByRole("button", { name: "Cari Data" }).click();

    await expect(page.getByText("Bulan awal tidak boleh setelah bulan akhir.")).toBeVisible();
    expect(dataRequests).toEqual([]);

    // Bukti visual state error (desktop default) untuk review manual.
    const errorShot = path.join(resolveArtifactDir(), `state-error-${page.viewportSize()?.width}.png`);
    await page.screenshot({ path: errorShot });
    console.log(`[artifact] screenshot: ${errorShot}`);

    expectNoApplicationTraffic(audit);
  });

  test("Pesan error lama harus hilang begitu filter yang memicunya diperbaiki", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    // (1) Rentang terbalik ditolak, jadi tidak ada request data sama sekali.
    await page.getByRole("combobox", { name: "Dari bulan" }).selectOption("7");
    await page.getByRole("combobox", { name: "Ke bulan" }).selectOption("3");
    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(page.getByText("Bulan awal tidak boleh setelah bulan akhir.")).toBeVisible();
    expect(dataRequests).toEqual([]);

    // (2) User memperbaiki filter (7..3 → 1..12) tanpa mencari ulang. Error
    // lama tidak lagi menggambarkan filter yang sedang terlihat, jadi tidak
    // boleh terus menyalahkan filter yang sekarang sudah valid — harus kembali
    // ke prompt netral "belum ada pencarian". Kalau bocor, user akan mengira
    // rentang 1..12 juga tidak valid.
    await page.getByRole("combobox", { name: "Dari bulan" }).selectOption("1");
    await expect(
      page.getByText("Bulan awal tidak boleh setelah bulan akhir."),
    ).toHaveCount(0);
    await expect(page.getByText("Belum ada pencarian.")).toBeVisible();

    // (3) Guard tidak mematikan flow: pencarian dengan filter yang sudah valid
    // tetap mengisi hasil.
    await page.getByRole("button", { name: "Cari Data" }).click();
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText("2 temuan");
    expect(dataRequests).toHaveLength(1);

    expectNoApplicationTraffic(audit);
  });

  test("Pagination memotong hasil terseleksi dan ekspor tetap memakai seluruh hasil", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    // 28 actionable + 2 non-actionable = 30 baris respons.
    await openReportsData(page, audit, dataRequests, [
      ...PAGINATION_ROWS,
      ...PAGINATION_NON_ACTIONABLE,
    ]);

    await page.getByRole("button", { name: "Cari Data" }).click();

    // (1) Seleksi dilakukan SEBELUM pagination: count harus 28, bukan 30. Kalau
    // urannya terbalik, halaman 1 akan menampilkan 25 dari 30 dan baris
    // non-actionable ikut bocor ke layar.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText(`${PAGINATION_TOTAL} temuan`);
    for (const text of NON_ACTIONABLE_TEXTS) {
      await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    }

    // (2) Halaman 1: tepat `pageSize` baris, dan baris pertama halaman 2 belum
    // dirender di representasi mana pun.
    await expect(resultRows(page)).toHaveCount(PAGINATION_PAGE_SIZE);
    await expect(
      resultRows(page).getByText(paginationFinding(PAGINATION_PAGE_SIZE), { exact: false }),
    ).toBeVisible();
    await expect(page.getByText(paginationFinding(PAGINATION_PAGE_SIZE + 1), { exact: false })).toHaveCount(0);
    await expect(
      page.getByText(`Menampilkan 1-${PAGINATION_PAGE_SIZE} dari ${PAGINATION_TOTAL}`),
    ).toBeVisible();

    // (3) Halaman 2: hanya sisa 3 baris, dua teks lengkap per baris, dan
    // baris halaman 1 tidak ikut terulang.
    await page.getByRole("button", { name: "Halaman berikutnya" }).click();
    await expect(resultRows(page)).toHaveCount(PAGINATION_TOTAL - PAGINATION_PAGE_SIZE);
    await expect(
      page.getByText(
        `Menampilkan ${PAGINATION_PAGE_SIZE + 1}-${PAGINATION_TOTAL} dari ${PAGINATION_TOTAL}`,
      ),
    ).toBeVisible();
    for (let n = PAGINATION_PAGE_SIZE + 1; n <= PAGINATION_TOTAL; n += 1) {
      await expect(
        resultRows(page).getByText(paginationFinding(n), { exact: false }),
      ).toBeVisible();
      await expect(
        resultRows(page).getByText(paginationRecommendation(n), { exact: false }),
      ).toBeVisible();
    }
    await expect(page.getByText(paginationFinding(1), { exact: false })).toHaveCount(0);
    await expect(page.getByText(paginationRecommendation(1), { exact: false })).toHaveCount(0);
    // Count tidak boleh ikut terpotong pagination.
    await expect(page.getByTestId(RESULTS_COUNT)).toHaveText(`${PAGINATION_TOTAL} temuan`);

    // (4) Ekspor memakai seluruh hasil terseleksi, bukan hanya halaman aktif:
    // baris yang hanya ada di halaman 2 wajib ikut di file.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export Excel" }).click();
    const download = await downloadPromise;
    const workbook = await readDownloadedWorkbook(download);
    const grid = workbook["Data Laporan"];
    const exportedRows = grid.slice(1).filter((cells) => cells.some((cell) => cell.trim() !== ""));
    expect(exportedRows).toHaveLength(PAGINATION_TOTAL);
    const allCells = Object.values(workbook).flat(2).join("\n");
    expect(allCells, "baris halaman 2 tidak ikut diekspor").toContain(
      paginationTicket(PAGINATION_TOTAL),
    );
    expect(allCells, "baris halaman 1 tidak ikut diekspor").toContain(paginationFinding(1));
    for (const text of NON_ACTIONABLE_TEXTS) {
      expect(allCells, `ekspor membocorkan baris non-actionable: ${text}`).not.toContain(text);
    }

    expect(dataRequests).toHaveLength(1);
    expectNoApplicationTraffic(audit);
  });

  test("Guard memblokir /api yang tidak dimock dan host eksternal tak dikenal", async ({ page }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

    // (0) Baseline: satu-satunya lalu lintas jaringan adalah font (di-abort).
    expectNoApplicationTraffic(audit);

    // (1) Endpoint yang dimock dilayani fixture lokal, bukan proxy Vite.
    const mocked = await page.evaluate(async () => {
      const response = await fetch("/api/v1/sidak/periods");
      return { ok: response.ok, body: await response.text() };
    });
    expect(mocked.ok).toBe(true);
    expect(mocked.body).toContain(PERIODS_FIXTURE[0].id);
    expect(audit.mockedApi.some((label) => label.includes("/api/v1/sidak/periods"))).toBe(true);

    // (2) `/api/v1/*` yang tidak dimock tidak boleh sampai ke proxy `localhost:3001`.
    const unmockedApi = await page.evaluate(async () => {
      try {
        const response = await fetch("/api/v1/sidak/periods-tidak-adapter");
        return { failed: false, status: response.status };
      } catch {
        return { failed: true, status: 0 };
      }
    });
    expect(unmockedApi).toEqual({ failed: true, status: 0 });
    expect(audit.blockedApi).toContain(
      "GET http://localhost:3005/api/v1/sidak/periods-tidak-adapter",
    );

    // (3) Host eksternal yang reachable (example.com) tidak boleh keluar dari mesin.
    const externalBefore = audit.blockedExternal.length;
    const external = await page.evaluate(async () => {
      try {
        await fetch("https://example.com/probe-isolasi");
        return false;
      } catch {
        return true;
      }
    });
    expect(external).toBe(true);
    expect(audit.blockedExternal.slice(externalBefore)).toEqual([
      "GET https://example.com/probe-isolasi",
    ]);
  });

  test("Guard memblokir path yang dimock dari origin lain tanpa menyentuh jaringan", async ({
    page,
  }) => {
    const audit = startAudit();
    const dataRequests: DataRequest[] = [];

    await openReportsData(page, audit, dataRequests, ALL_ROWS);

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
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const address = listener.address();
    const foreignOrigin =
      address && typeof address === "object" ? `http://127.0.0.1:${address.port}` : null;
    expect(foreignOrigin, "listener loopback tidak siap untuk probe").not.toBeNull();

    try {
      const blockedBefore = audit.blockedExternal.length;
      const probe = await page.evaluate(async (origin) => {
        try {
          const response = await fetch(`${origin}/api/v1/sidak/periods`);
          return { failed: false, status: response.status, body: await response.text() };
        } catch {
          return { failed: true, status: 0, body: "" };
        }
      }, foreignOrigin!);

      // (1) Guard harus mengklaim request itu. `fallback` tidak pernah
      // mencatat apa pun, jadi label yang tidak muncul di sini berarti request
      // lolos ke jaringan atau dilayani handler lain.
      expect(
        audit.blockedExternal.slice(blockedBefore),
        `path yang dimock dari origin lain lolos tanpa di-abort; respons nyata: ${probe.status} ${probe.body}`,
      ).toEqual([`GET ${foreignOrigin}/api/v1/sidak/periods`]);

      // (2) Bukti terkuat: tidak ada byte yang sampai ke socket nyata.
      expect(hits, `request bocor ke jaringan: ${hits.join(" | ")}`).toEqual([]);

      // (3) Foreign origin tidak boleh dilayani fixture mock app, dan tidak
      // boleh dibiarkan menjawab sebagai sukses.
      expect(probe.body).not.toContain(PERIODS_FIXTURE[0].id);
      expect(probe.failed, `respons dari jaringan: ${probe.status} ${probe.body}`).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        listener.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  // ── Bukti visual: satu loop untuk light (4 viewport) dan dark (representatif)

  for (const theme of ["light", "dark"] as const) {
    const viewports =
      theme === "light" ? VISUAL_VIEWPORTS : VISUAL_VIEWPORTS.filter((v) => DARK_VIEWPORTS.includes(v.label));

    test(`Tampilan ${theme}: screenshot top+bottom, tanpa overflow, satu representasi per breakpoint`, async ({
      page,
    }) => {
      const audit = startAudit();
      const dataRequests: DataRequest[] = [];
      const dir = resolveArtifactDir();

      await setTheme(page, theme);
      await openPopulatedResults(page, audit, dataRequests, VISUAL_ROWS);
      // `light` tidak menambah class apa pun ke <html> (hanya `dark` yang
      // di-toggle), jadi yang dibuktikan adalah flag dark + background nyata.
      const applied = await page.evaluate(() => ({
        isDark: document.documentElement.classList.contains("dark"),
        background: getComputedStyle(document.body).backgroundColor,
        color: getComputedStyle(document.body).color,
      }));
      expect(applied.isDark, `tema ${theme} tidak diterapkan`).toBe(theme === "dark");

      const metrics: Record<string, unknown> = {
        theme: applied,
      };

      // (0) Artefak dulu, untuk SETIAP viewport, dalam satu pass. Dengan begitu
      // run RED yang gagal di assertion pertama tetap menyimpan bukti visual
      // lengkap (top + bottom, light + dark) dari halaman yang sedang berjalan.
      for (const viewport of viewports) {
        await captureViewportPair(page, dir, theme, viewport);
      }

      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        // (1) Overflow: nol di dokumen dan di scroll container efektif. App
        // shell `h-screen` membuat dokumen tidak pernah menggulir, jadi angka
        // yang benar-benar mencerminkan layout ada di container halaman.
        const layout = await scrollPageTo(page, "top");
        metrics[`${theme}-${viewport.label}-layout`] = layout;
        console.log(`[visual] ${theme} @${viewport.label}px top: ${JSON.stringify(layout)}`);
        expect(layout.documentOverflow, `overflow dokumen @${viewport.label}px`).toBe(0);
        expect(layout.containerOverflow, `overflow container @${viewport.label}px`).toBe(0);

        // (2) Tepat satu representasi aktif, dan isinya lengkap.
        await assertSingleRepresentation(page, viewport);

        // (3) Bottom-nav fixed tidak boleh menutupi konten terakhir.
        const atBottom = await scrollPageTo(page, "bottom");
        console.log(`[visual] ${theme} @${viewport.label}px bottom: ${JSON.stringify(atBottom)}`);
        if (viewport.width < DESKTOP_MIN_WIDTH) {
          expect(atBottom.navVisible, `bottom-nav tidak ada @${viewport.label}px`).toBe(true);
          expect(
            atBottom.clearance,
            `ruang aman bawah hanya ${atBottom.clearance}px (elemen terakhir: ${atBottom.lastTag}) @${viewport.label}px`,
          ).toBeGreaterThanOrEqual(35);
        } else {
          expect(atBottom.navVisible, `bottom-nav tidak boleh tampil @${viewport.label}px`).toBe(false);
        }
      }

      // (4) Target sentuh: kontrol halaman ini ≥44px di lebar sentuh.
      const targetViewport = MOBILE_VIEWPORTS[0] ?? viewports[0];
      await page.setViewportSize({ width: targetViewport.width, height: targetViewport.height });
      await scrollPageTo(page, "top");
      const sizes = await assertTouchTargets(page);
      metrics[`${theme}-touch-targets`] = sizes;

      // (5) Keyboard: semua kontrol terjangkau Tab dan fokusnya terlihat.
      const order = inScopeControls(page);
      await order[0].focus();
      for (let index = 1; index < order.length; index += 1) {
        await page.keyboard.press("Tab");
        const focused = await readFocusIndicator(page);
        metrics[`${theme}-focus-${index}`] = focused;
        await expect(order[index], `Tab ke-${index}`).toBeFocused();
        expect(
          focused.ring || focused.outline,
          `fokus tidak terlihat pada ${focused.tag} (Tab ke-${index})`,
        ).toBe(true);
      }
      // Cakupan mode terekspos ke assistive tech, bukan hanya warna.
      await expect(page.getByRole("button", { name: "Per Layanan" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.getByRole("button", { name: "Per Individu" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );

      console.log(`[visual] ${theme} metrics: ${JSON.stringify(metrics)}`);
      expectNoApplicationTraffic(audit);
    });
  }
});
