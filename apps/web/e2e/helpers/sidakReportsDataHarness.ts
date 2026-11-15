// Shared by the sidak-reports-data-*.spec.ts files.
import { mockTnaDueCount } from "./hermeticShell";
import {
  expect,
  type Download,
  type Locator,
  type Page,
} from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMockAuth, mockSupabaseAuth } from "./mockAuth";
import {
  closeSelect,
  openSelect,
  selectedLabel,
  selectOptionLabels,
  selectTrigger,
  selectValue,
} from "./pickSelect";
import { E2E_SUPABASE_URL } from "./e2eTargets";
import { assertLocalDevOnlyTargetAt } from "./sidakJadwalShiftingHarness";

export const APP_ORIGIN = "http://localhost:3005";

export const APP_URL = new URL(APP_ORIGIN);

/**
 * Origin Supabase dev yang diizuinkan. Kalau env berubah, guard tetap
 * fail-closed: request di-`abort` dan test gagal terbuka, bukan diam-diam.
 */
export const SUPABASE_ORIGIN = E2E_SUPABASE_URL;

/**
 * Satu-satunya endpoint yang boleh menerima mock. Method + path di sini adalah
 * allowlist milik guard DAN kunci dispatch mock, jadi tidak bisa berbeda.
 */
export const MOCKED_API = [
  { id: "periods", method: "GET", path: "/api/v1/sidak/periods" },
  { id: "agents", method: "GET", path: "/api/v1/sidak/agents" },
  { id: "indicators", method: "GET", path: "/api/v1/sidak/indicators" },
  { id: "reportsData", method: "POST", path: "/api/v1/sidak/reports/data" },
] as const;

/** Mock auth/profile dari `helpers/mockAuth.ts`; hanya dua path ini. */
export const MOCKED_SUPABASE = [
  { id: "authUser", path: "/auth/v1/user" },
  { id: "profiles", path: "/rest/v1/profiles" },
] as const;

/** Host pihak ketiga yang memang dipanggil index.html; tetap diblokir, hanya dicatat. */
export const EXTERNAL_FONT_HOSTS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

export const FINDING_ACTIONABLE_CALL =
  "Agent tidak menyebutkan tenor, bunga, dan total angsuran secara lengkap sehingga konsumen tidak dapat memahami keseluruhan kewajiban pembayaran.";

export const RECOMMENDATION_ACTIONABLE_CALL =
  "Sebutkan tenor, bunga, dan total angsuran secara berurutan, lalu minta konfirmasi ulang eksplisit sebelum menutup tiket.";

export const FINDING_ACTIONABLE_EMAIL =
  "Email konfirmasi tidak mencantumkan nomor polis yang diverifikasi sehingga pelanggan tidak dapat mencocokkan dokumen.";

export const RECOMMENDATION_ACTIONABLE_EMAIL =
  "Tambahkan nomor polis dan ringkasan proteksi pada email konfirmasi, lalu lampirkan bukti pada audit trail.";

export const FINDING_PHANTOM =
  "Sesi tanpa temuan riil ini adalah padding phantom dan tidak boleh dihitung sebagai temuan.";

export const RECOMMENDATION_PHANTOM =
  "Rekomendasi phantom tidak boleh muncul di workspace data mana pun.";

export const FINDING_WITHOUT_RECOMMENDATION =
  "Nomor rekening tujuan tidak dicocokkan dengan data nasabah sebelum transfer dilakukan.";

export const RECOMMENDATION_WITHOUT_FINDING =
  "Tambahkan konfirmasi wajib sebelum menutup tiket agar compliance terdokumentasi.";

export type ReportRow = Record<string, unknown>;

export const PERIODS_FIXTURE = [
  { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
  { id: "period-2026-03", month: 3, year: 2026, label: "03/2026" },
  { id: "period-2025-12", month: 12, year: 2025, label: "12/2025" },
];

export const AGENT_DIRECTORY_FIXTURE = {
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
export const ROW_ACTIONABLE_CALL: ReportRow = {
  id: "row-actionable-call",
  service_type: "call",
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: "TKT-2026-0142",
  nilai: 2,
  ketidaksesuaian: FINDING_ACTIONABLE_CALL,
  sebaiknya: RECOMMENDATION_ACTIONABLE_CALL,
  profiler_peserta: {
    id: "agent-1",
    nama: "Alya Pranoto",
    batch_name: "Batch 7",
  },
  qa_indicators: { id: "indicator-akurasi", name: "Akurasi informasi produk" },
  qa_periods: { id: "period-2026-03", month: 3, year: 2026, label: "03/2026" },
};

/** (b) phantom: dua teks terisi, tetapi tidak boleh tampil. */
export const ROW_PHANTOM: ReportRow = {
  id: "row-phantom",
  service_type: "call",
  tahun: 2026,
  is_phantom_padding: true,
  no_tiket: "TKT-2026-9001",
  nilai: 3,
  ketidaksesuaian: FINDING_PHANTOM,
  sebaiknya: RECOMMENDATION_PHANTOM,
  profiler_peserta: {
    id: "agent-2",
    nama: "Bima Saputra",
    batch_name: "Batch 7",
  },
  qa_indicators: { id: "indicator-akurasi", name: "Akurasi informasi produk" },
  qa_periods: { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
};

/** (c) Temuan kosong (whitespace), Rekomendasi terisi → bukan temuan actionable. */
export const ROW_WITHOUT_FINDING: ReportRow = {
  id: "row-without-finding",
  service_type: "call",
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: "TKT-2026-0201",
  nilai: 1,
  ketidaksesuaian: "   ",
  sebaiknya: RECOMMENDATION_WITHOUT_FINDING,
  profiler_peserta: {
    id: "agent-2",
    nama: "Bima Saputra",
    batch_name: "Batch 7",
  },
  qa_indicators: { id: "indicator-kepatuhan", name: "Kepatuhan prosedur" },
  qa_periods: { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
};

/** (d) Rekomendasi kosong, Temuan terisi → bukan temuan actionable. */
export const ROW_WITHOUT_RECOMMENDATION: ReportRow = {
  id: "row-without-recommendation",
  service_type: "email",
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: "TKT-2026-0202",
  nilai: 1,
  ketidaksesuaian: FINDING_WITHOUT_RECOMMENDATION,
  sebaiknya: "  ",
  profiler_peserta: {
    id: "agent-1",
    nama: "Alya Pranoto",
    batch_name: "Batch 7",
  },
  qa_indicators: { id: "indicator-dokumen", name: "Kelengkapan dokumen" },
  qa_periods: { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
};

/**
 * Fixture pagination: 28 baris actionable. `pageSize` default halaman adalah 25,
 * jadi fixture ini memaksa `Pagination` benar-benar dirender dan memotong hasil
 * menjadi 25 + 3. Dipasangkan dengan 2 baris non-actionable supaya test ini
 * sekaligus membuktikan urutan kontrak: seleksi dulu, baru pagination.
 */
export const PAGINATION_TOTAL = 28;

export const PAGINATION_PAGE_SIZE = 25;

/** Teks fixture pagination dibangkitkan, bukan di-hardcode 28 kali. */
export const paginationFinding = (n: number) =>
  `Temuan pagination baris ${n} — agent tidak menjelaskan syarat layanan secara lengkap.`;

export const paginationRecommendation = (n: number) =>
  `Rekomendasi pagination baris ${n} — latih kembali alur penjelasan syarat layanan.`;

export const paginationTicket = (n: number) => `TKT-2026-${5000 + n}`;

export const PAGINATION_ROWS: ReportRow[] = Array.from(
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
export const PAGINATION_NON_ACTIONABLE: ReportRow[] = [
  ROW_PHANTOM,
  ROW_WITHOUT_FINDING,
];

/** Row actionable kedua agar filter dan hitungan tidak trivial. */
export const ROW_ACTIONABLE_EMAIL: ReportRow = {
  id: "row-actionable-email",
  service_type: "email",
  tahun: 2026,
  is_phantom_padding: false,
  no_tiket: "TKT-2026-0310",
  nilai: 3,
  ketidaksesuaian: FINDING_ACTIONABLE_EMAIL,
  sebaiknya: RECOMMENDATION_ACTIONABLE_EMAIL,
  profiler_peserta: {
    id: "agent-2",
    nama: "Bima Saputra",
    batch_name: "Batch 7",
  },
  qa_indicators: { id: "indicator-dokumen", name: "Kelengkapan dokumen" },
  qa_periods: { id: "period-2026-03", month: 3, year: 2026, label: "03/2026" },
};

export const ALL_ROWS = [
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

export type IndicatorFixture = {
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
export const DUPLICATE_PARAMETER_NAME = "Akurasi informasi produk";

export const IND_CALL_AKURASI = {
  id: "11111111-1111-4111-8111-111111111111",
  service_type: "call",
  name: DUPLICATE_PARAMETER_NAME,
  parameter_group: null,
  category: "critical",
  bobot: 0.2,
  sort_order: 1,
  is_active: true,
} as const satisfies IndicatorFixture;

export const IND_CHAT_AKURASI = {
  id: "22222222-2222-4222-8222-222222222222",
  service_type: "chat",
  name: DUPLICATE_PARAMETER_NAME,
  parameter_group: null,
  category: "critical",
  bobot: 0.2,
  sort_order: 1,
  is_active: true,
} as const satisfies IndicatorFixture;

export const IND_CALL_KEPATUHAN = {
  id: "33333333-3333-4333-8333-333333333333",
  service_type: "call",
  name: "Kepatuhan prosedur",
  parameter_group: "Compliance",
  category: "non_critical",
  bobot: 0.1,
  sort_order: 2,
  is_active: true,
} as const satisfies IndicatorFixture;

export const IND_EMAIL_DOKUMEN = {
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
export const INDICATOR_CATALOG: IndicatorFixture[] = [
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
export const INDICATORS_BY_SERVICE: Record<string, IndicatorFixture[]> = {
  call: [IND_CALL_AKURASI, IND_CALL_KEPATUHAN],
  chat: [IND_CHAT_AKURASI],
  email: [IND_EMAIL_DOKUMEN],
};

export const FINDING_PARAM_CALL_AKURASI =
  "Nomor polis yang diberikan agen tidak cocok dengan data nasabah sehingga verifikasi lanjutan tidak dapat dilanjutkan.";

export const RECOMMENDATION_PARAM_CALL_AKURASI =
  "Cocokkan nomor polis dengan data nasabah sebelum melanjutkan layanan, lalu catat hasil pencocokan pada audit trail.";

export const FINDING_PARAM_CHAT_AKURASI =
  "Identitas nasabah dikonfirmasi dari nomor yang tidak terdaftar sehingga hasil verifikasi tidak dapat dicatat pada sesi.";

export const RECOMMENDATION_PARAM_CHAT_AKURASI =
  "Tolak konfirmasi dari nomor tidak terdaftar dan minta identitas resmi sebelum membuka sesi.";

export const FINDING_PARAM_CALL_KEPATUHAN =
  "Agen menutup sesi tanpa membaca ulang syarat layanan sehingga prosedur yang disepakati tidak terdokumentasi.";

export const RECOMMENDATION_PARAM_CALL_KEPATUHAN =
  "Baca ulang syarat layanan dan minta konfirmasi eksplisit sebelum menutup sesi.";

export const FINDING_PARAM_EMAIL_DOKUMEN =
  "Email konfirmasi tidak mencantumkan nomor polis sehingga pelanggan tidak dapat mencocokkan dokumen.";

export const RECOMMENDATION_PARAM_EMAIL_DOKUMEN =
  "Tambahkan nomor polis dan ringkasan proteksi pada email konfirmasi sebelum dikirim.";

export const parameterRow = (
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
  qa_indicators: {
    id: indicator.id,
    name: indicator.name,
    category: indicator.category,
  },
  qa_periods: {
    month,
    year: 2026,
    label: `${String(month).padStart(2, "0")}/2026`,
  },
});

export const ROW_PARAM_CALL_AKURASI = parameterRow(
  "row-param-call-akurasi",
  "call",
  IND_CALL_AKURASI,
  { id: "agent-1", nama: "Alya Pranoto" },
  3,
  "TKT-2026-1101",
  FINDING_PARAM_CALL_AKURASI,
  RECOMMENDATION_PARAM_CALL_AKURASI,
);

export const ROW_PARAM_CHAT_AKURASI = parameterRow(
  "row-param-chat-akurasi",
  "chat",
  IND_CHAT_AKURASI,
  { id: "agent-1", nama: "Alya Pranoto" },
  3,
  "TKT-2026-1102",
  FINDING_PARAM_CHAT_AKURASI,
  RECOMMENDATION_PARAM_CHAT_AKURASI,
);

export const ROW_PARAM_CALL_KEPATUHAN = parameterRow(
  "row-param-call-kepatuhan",
  "call",
  IND_CALL_KEPATUHAN,
  { id: "agent-2", nama: "Bima Saputra" },
  2,
  "TKT-2026-1103",
  FINDING_PARAM_CALL_KEPATUHAN,
  RECOMMENDATION_PARAM_CALL_KEPATUHAN,
);

export const ROW_PARAM_EMAIL_DOKUMEN = parameterRow(
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
export const ROW_PARAM_CALL_AKURASI_PHANTOM: ReportRow = {
  ...ROW_PARAM_CALL_AKURASI,
  id: "row-param-call-akurasi-phantom",
  no_tiket: "TKT-2026-1199",
  is_phantom_padding: true,
  ketidaksesuaian:
    "Padding phantom pada parameter terpilih tidak boleh tampil.",
  sebaiknya: "Rekomendasi phantom tidak boleh ikut terfilter.",
};

export const ROW_PARAM_CALL_AKURASI_NO_RECOMMENDATION: ReportRow = {
  ...ROW_PARAM_CALL_AKURASI,
  id: "row-param-call-akurasi-tanpa-rekomendasi",
  no_tiket: "TKT-2026-1198",
  is_phantom_padding: false,
  ketidaksesuaian: "Temuannya ada, tetapi Rekomendasi kosong.",
  sebaiknya: "   ",
};

/** 4 actionable + 1 phantom + 1 tanpa Rekomendasi = 6 baris respons. */
export const PARAMETER_ROWS: ReportRow[] = [
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
export const PARAMETER_NON_ACTIONABLE_TEXTS = [
  "Padding phantom pada parameter terpilih tidak boleh tampil.",
  "Rekomendasi phantom tidak boleh ikut terfilter.",
  "Temuannya ada, tetapi Rekomendasi kosong.",
  "TKT-2026-1199",
  "TKT-2026-1198",
];

/** Temuan per parameter, untuk membuktikan hanya parameter terpilih yang tampil. */
export const PARAMETER_FINDINGS = [
  FINDING_PARAM_CALL_AKURASI,
  FINDING_PARAM_CHAT_AKURASI,
  FINDING_PARAM_CALL_KEPATUHAN,
  FINDING_PARAM_EMAIL_DOKUMEN,
];

/** Semua temuan KECUALI milik parameter yang sedang dipilih. */
export const otherParameterFindings = (selected: string): string[] =>
  PARAMETER_FINDINGS.filter((finding) => finding !== selected);

/**
 * Fixture khusus bukti visual: 8 baris actionable + 1 phantom, supaya halaman
 * benar-benar tergulir di desktop dan kepadatan tabel bisa dibaca dari
 * screenshot top/bottom. Field persis sama dengan fixture kontrak di atas —
 * tidak ada field, metrik, atau skor turunan yang dikarang untuk visual.
 */
export const VISUAL_SEEDS: Array<{
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

export const VISUAL_ROWS: ReportRow[] = [
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

export const NON_ACTIONABLE_TEXTS = [
  FINDING_PHANTOM,
  RECOMMENDATION_PHANTOM,
  RECOMMENDATION_WITHOUT_FINDING,
  FINDING_WITHOUT_RECOMMENDATION,
];

export type DataRequest = { method: string; body: Record<string, unknown> };

/**
 * Penahanan respons: request sudah sampai ke handler mock tapi `route.fulfill`
 * belum dipanggil, jadi test bisa Mielihat keadaan "menunggu" yang sesaat.
 */
export type DeferredResponseGate = {
  /** Dipanggil handler mock saat request sudah ditahan (belum di-`fulfill`). */
  arrive: () => void;
  /** Dipanggil test untuk melepas penahanan; `route.fulfill` menyusul. */
  release: () => void;
  /** Resolusi setelah handler mock selesai ditahan. */
  held: Promise<void>;
};

export type ReportResponseGate = DeferredResponseGate;

export const activeReportResponseGate: { current: ReportResponseGate | null } =
  {
    current: null,
  };

/**
 * Mock katalog parameter yang boleh diubah SAAT test berjalan. Kontrak
 * "katalog gagal → fail-closed → coba lagi" butuh katalog yang gagal lebih
 * dulu lalu berhasil setelah retry, jadi mode tidak boleh dibekukan di dalam
 * `mockSidakApi`. `gate` sengaja jadi field milik mock ini (bukan variabel
 * modul) supaya tidak bisa bocor ke test berikutnya, dan supaya test yang sama
 * bisa menahan request katalog yang BERBEDA pada langkah berbeda.
 */
export type IndicatorMock = {
  mode: "ok" | "error";
  message: string;
  gate: DeferredResponseGate | null;
};

export function okIndicatorMock(): IndicatorMock {
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
export type AgentDirectoryMock = {
  /** Badan `data` per `year`; key = nilai query `year`. */
  byYear: Record<string, unknown>;
};

export function okAgentDirectoryMock(): AgentDirectoryMock {
  return { byYear: {} };
}

/**
 * Tahan respons katalog parameter berikutnya: dipakai untuk membuktikan keadaan
 * `pending` benar-benar terlihat (tanpa penahanan, seluruh assertion transisi
 * bisa lolos dalam satu frame), dan untuk melepas respons cakupan LAMA setelah
 * user sudah pindah cakupan. Satu kali pakai (self-clearing).
 */
export function createDeferredIndicatorResponse(indicators: IndicatorMock): {
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
export function createDeferredReportResponse(): {
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
  activeReportResponseGate.current = {
    arrive: markArrived,
    release: markReleased,
    held,
  };
  return { arrived, release: markReleased };
}

/**
 * Bukti jaringan per test. Semua request harus jatuh ke tepat satu kategori.
 */
export type NetworkAudit = {
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

export type RequestShape = { label: string; method: string; url: URL | null };

export function emptyAudit(): NetworkAudit {
  return {
    mockedApi: [],
    mockedAuth: [],
    localDev: [],
    blockedApi: [],
    blockedExternal: [],
    blockedLocal: [],
  };
}

export function toJson(
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

export function shapeRequest(request: {
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
export function isApiPath(path: string): boolean {
  return path === "/api" || path.startsWith("/api/");
}

export function isAppDevServer(url: URL): boolean {
  return url.hostname === APP_URL.hostname && url.port === APP_URL.port;
}

/**
 * Mock API hanya sah pada `APP_ORIGIN`. Tanpa gerbang origin, request dengan
 * method + path yang sama dari origin mana pun akan lolos `fallback`; handler
 * mock di bawah di-anchor ke origin app, jadi tidak ada yang menanganinya dan
 * request tersebut keluar ke jaringan nyata.
 */
export function isMockedApiRequest(request: RequestShape): boolean {
  if (!request.url) return false;
  if (request.url.origin !== APP_ORIGIN) return false;
  return MOCKED_API.some(
    (endpoint) =>
      endpoint.method === request.method &&
      endpoint.path === request.url!.pathname,
  );
}

export function isMockedAuthRequest(request: RequestShape): boolean {
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
export function isLocalDevRequest(request: RequestShape): boolean {
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
export function assertLocalDevOnlyTarget(): Promise<void> {
  return assertLocalDevOnlyTargetAt(APP_ORIGIN);
}

/**
 * Guard fail-closed. Daftarkan SETELAH semua route mock: Playwright memeriksa
 * handler dalam urutan terbalik pendaftaran, sehingga guard ini yang pertama
 * kali menangani setiap request dan hanya meneruskan (`fallback`) ke handler
 * mock atau ke dev-server loopback. Tidak ada `fallback` untuk `/api` yang
 * tidak ada di `MOCKED_API`, sehingga request tak dikenal tidak pernah keluar.
 */
export async function installNetworkGuard(page: Page, audit: NetworkAudit) {
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
  // After the guard, so it runs first (TNA phase 6 P-5).
  await mockTnaDueCount(page);
}

/**
 * Bukti bahwa request auth/profile benar-benar dilayani mock lokal.
 * Glob di-anchor ke origin dev Supabase supaya tidak bisacca modul lokal lain.
 */
export async function tapSupabaseMocks(page: Page, audit: NetworkAudit) {
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

export async function mockSidakApi(
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
            candidate.method === request.method &&
            candidate.path === request.url!.pathname,
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
          toJson(
            { success: false, error: { message: indicatorMock.message } },
            500,
          ),
        );
        return;
      }
      // Katalog AKTIF saja, dan narrowed oleh query `service_type` persis
      // seperti `getIndicators()` di backend. Tanpa query, semua aktif dikirim.
      const scope = request.url?.searchParams.get("service_type") ?? "";
      await route.fulfill(
        toJson({
          success: true,
          data:
            scope === ""
              ? INDICATOR_CATALOG
              : (INDICATORS_BY_SERVICE[scope] ?? []),
        }),
      );
      return;
    }

    const body = JSON.parse(route.request().postData() || "{}") as Record<
      string,
      unknown
    >;
    dataRequests.push({ method: request.method, body });
    // Respons yang secara eksplisit ditahan test: `route.fulfill` baru dipanggil
    // setelah `release()`, jadi test bisa mengubah filter di tengah request.
    const gate = activeReportResponseGate.current;
    if (gate) {
      activeReportResponseGate.current = null;
      gate.arrive();
      await gate.held;
    }
    // Baris dihitung dari body yang benar-benar terkirim, jadi UI dan Excel
    // hanya bisa mencerminkan `indicatorId` kalau payload-nya benar-benar
    // berisi ID itu — tidak ada jalan pintas "UI benar, request salah".
    await route.fulfill(
      toJson({
        success: true,
        data: typeof rows === "function" ? rows(body) : rows,
      }),
    );
  });
}

export async function openReportsData(
  page: Page,
  audit: NetworkAudit,
  dataRequests: DataRequest[],
  rows: ReportRow[] | ((body: Record<string, unknown>) => ReportRow[]),
  indicatorMock?: IndicatorMock,
  agentDirectoryMock?: AgentDirectoryMock,
  path = "/sidak/reports-data",
) {
  await mockSupabaseAuth(page);
  await tapSupabaseMocks(page, audit);
  await mockSidakApi(
    page,
    audit,
    dataRequests,
    rows,
    indicatorMock,
    agentDirectoryMock,
  );
  await installNetworkGuard(page, audit);
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Laporan data", level: 1 }),
  ).toBeVisible();
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
export function expectNoApplicationTraffic(audit: NetworkAudit) {
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

export function resultRows(page: Page) {
  return page.getByRole("rowgroup").nth(1).getByRole("row");
}

// ── Kontrak label bulan ─────────────────────────────────────────────────────
// Opsi bulan ditampilkan sebagai nama bulan penuh bahasa Indonesia
// (Januari..Desember), bukan angka `01`..`12`. Yang berubah HANYA label:
// `value` tetap angka 1..12, default tetap Januari..Desember (1..12), dan
// payload POST tetap angka. Kontrak ini digabung ke test filter bulan yang
// sudah ada supaya tidak ada suite paralel untuk filter yang sama.

/** Label aksesibel 12 opsi bulan, urutan = nilai 1..12. */
export const MONTH_OPTION_LABELS = [
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
export const MIDDLE_FROM_MONTH = { label: "Maret", value: "3" } as const;

export const MIDDLE_TO_MONTH = { label: "Mei", value: "5" } as const;

/**
 * Pembacaan opsi/nilai `ui/select` (Base UI) lewat `helpers/pickSelect`.
 *
 * Opsi dibaca dari popup yang dibuka (nama aksesibel = teks yang dibaca user dan
 * assistive tech). Nilai terpilih dibaca dari teks pemicu; nilai yang benar-benar
 * dikirim tetap dibuktikan lewat body request (`dataRequests`), karena Base UI
 * tidak mengekspos `value` di DOM.
 */
/**
 * Jumlah opsi sebuah select (polling, seperti `toHaveCount`). Pemicu yang
 * `disabled` tidak bisa dibuka (juga oleh user), jadi yang tampil hanya satu
 * opsi terpilih: untuk Parameter itu harus "Semuanya", bukan daftar lama.
 */
export async function expectOptionCount(select: Locator, count: number) {
  await expect
    .poll(async () => {
      if (await select.isDisabled()) {
        return [await selectedLabel(select)].length;
      }
      return (await selectOptionLabels(select)).length;
    })
    .toBe(count);
  if (count === 1 && (await select.isDisabled())) {
    await expect(selectValue(select)).toHaveText("Semuanya");
  }
}

/**
 * Kedua select bulan harus offering 12 nama Indonesia yang persis sama, dan
 * tidak boleh menyisakan label angka `01`..`12` lama.
 */
export async function assertIndonesianMonthOptions(page: Page) {
  const from = selectTrigger(page, "Dari bulan");
  const to = selectTrigger(page, "Ke bulan");

  for (const [label, select] of [
    ["Dari bulan", from],
    ["Ke bulan", to],
  ] as const) {
    // Popup dibuka sekali; semua pembacaan opsi terjadi di listbox yang sama.
    const listbox = await openSelect(select);
    await expect(listbox.getByRole("option"), label).toHaveCount(12);
    expect(
      await listbox
        .getByRole("option")
        .evaluateAll((nodes) =>
          nodes.map((node) => (node.textContent ?? "").trim()),
        ),
      `label opsi ${label}`,
    ).toEqual([...MONTH_OPTION_LABELS]);

    // Tiga titik yang diminta kontrak: awal, tengah, akhir — lewat ROLE
    // `option` supaya yang diperiksa benar-benar accessible name.
    for (const name of ["Januari", "Maret", "Mei", "Desember"]) {
      await expect(
        listbox.getByRole("option", { name, exact: true }),
        `opsi aksesibel "${name}" di ${label}`,
      ).toHaveCount(1);
    }

    // Label angka lama tidak boleh bocor lewat nama lain yang bisa dipilih.
    for (const legacy of ["01", "02", "03", "05", "12"]) {
      await expect(
        listbox.getByRole("option", { name: legacy, exact: true }),
        `label lama "${legacy}" masih ada di ${label}`,
      ).toHaveCount(0);
    }
    await closeSelect(select);
  }

  // Default tetap setahun penuh: Januari..Desember. Nilai angka 1..12 yang
  // dikirim dibuktikan oleh body POST di test pemanggil (startMonth/endMonth).
  expect(await selectedLabel(from), "default Dari bulan").toBe("Januari");
  expect(await selectedLabel(to), "default Ke bulan").toBe("Desember");
}

// ── Bukti visual & responsif ────────────────────────────────────────────────
// Halaman ini punya dua representasi hasil (tabel desktop + daftar ringkas
// mobile). Semua locator di bawah sengaja memakai ROLE atau testid, karena
// role tidak pernah menghitung elemen `display:none` — jadi "tepat satu
// representasi terlihat" bisa dibuktikan, bukan diasumsikan.

export const PAGE_SCROLL = "reports-data-scroll";

export const RESULTS_SURFACE = "results-surface";

export const RESULTS_COUNT = "results-count";

export const RESULTS_TABLE = "results-table";

export const RESULTS_LIST = "results-list";

/** Label unik untuk setiap sel Temuan/Rekomendasi, dipakai desktop & mobile. */
export const CELL_LABELS = ["Temuan", "Rekomendasi"];

/**
 * Representasi hasil yang harus tampil di viewport default Playwright
 * (Desktop Chrome 1280px ≥ 896px): tabel. Semua assertion isi hasil di test
 * kontrak di-scope ke sini supaya tidak ikut menghitung salinan mobile.
 */
export function desktopResults(page: Page) {
  return page.getByTestId(RESULTS_TABLE);
}

export const VISUAL_RUN = process.env.SIDAK_VISUAL_RUN ?? "run";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

/**
 * Artefak visual SELALU di luar repo. `SIDAK_VISUAL_ARTIFACT_DIR` bisa
 * diarahkan ke mana saja, tapi kalau mengarah ke dalam repo test ini gagal
 * terbuka — bukan diam-diam menulis artefak ke working tree.
 */
export function resolveArtifactDir(): string {
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

export type VisualViewport = { label: string; width: number; height: number };

/** Breakpoint tabel `lg` = 64rem; `html { font-size: 14px }` → 896px. */
export const DESKTOP_MIN_WIDTH = 896;

export const VISUAL_VIEWPORTS: VisualViewport[] = [
  { label: "320", width: 320, height: 720 },
  { label: "390", width: 390, height: 844 },
  { label: "768", width: 768, height: 1024 },
  { label: "1440", width: 1440, height: 900 },
];

export const MOBILE_VIEWPORTS = VISUAL_VIEWPORTS.filter(
  (v) => v.width < DESKTOP_MIN_WIDTH,
);

export const DARK_VIEWPORTS = ["390", "1440"];

export async function setTheme(page: Page, theme: "light" | "dark") {
  // Dipasang sebelum app boot: `useThemeMode` membaca localStorage saat mount.
  await page.addInitScript((value) => {
    localStorage.setItem("theme", value);
  }, theme);
}

export async function openPopulatedResults(
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
export async function readPageLayout(
  page: Page,
  action: "none" | "top" | "bottom" = "none",
) {
  return page.evaluate(
    ({ testid, action: mode }) => {
      const root = document.documentElement;
      const region = document.querySelector<HTMLElement>(
        'section[role="region"]',
      );
      const tagged = document.querySelector<HTMLElement>(
        `[data-testid="${testid}"]`,
      );
      const canScroll = (el: HTMLElement) =>
        el.scrollHeight - el.clientHeight > 1;

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
        const deepest = (
          region ? Array.from(region.querySelectorAll<HTMLElement>("div")) : []
        )
          .filter(canScroll)
          .pop();
        scroller = deepest ?? tagged ?? region;
      }
      if (!scroller) return null;

      if (mode !== "none")
        scroller.scrollTop = mode === "top" ? 0 : scroller.scrollHeight;

      // "Konten terakhir" = elemen terdalam yang benar-benar isi, bukan wrapper
      // yang hanya menempel ke tepi container (padding container ikut terukur
      // sebagai jarak, jadi wrapper tepi harus dikecualikan).
      const scrollerBottom = scroller.getBoundingClientRect().bottom;
      const boxes = Array.from(scroller.querySelectorAll<HTMLElement>("*"))
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter((entry) => entry.rect.height > 0 && entry.rect.width > 0);
      const content = boxes.filter(
        (entry) => entry.rect.bottom <= scrollerBottom - 1,
      );
      let lastBottom = -Infinity;
      let lastTag = "none";
      for (const { el, rect } of content.length > 0 ? content : boxes) {
        if (rect.bottom > lastBottom) {
          lastBottom = rect.bottom;
          lastTag = `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""}`;
        }
      }
      // Sidebar dan tab bar sama-sama "Navigasi utama"; tab bar yang `fixed`.
      const nav =
        Array.from(
          document.querySelectorAll<HTMLElement>(
            'nav[aria-label="Navigasi utama"]',
          ),
        ).find((el) => getComputedStyle(el).position === "fixed") ?? null;
      // `lg:hidden` tetap ada di DOM, jadi "tampil" harus diukur dari box,
      // bukan dari keberadaan elemen.
      const navVisible = Boolean(nav && nav.getBoundingClientRect().height > 0);
      const navTop = navVisible
        ? nav!.getBoundingClientRect().top
        : window.innerHeight;
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
        navHeight: navVisible
          ? Math.round(nav!.getBoundingClientRect().height)
          : 0,
        contentPaddingBottom: firstChild
          ? getComputedStyle(firstChild).paddingBottom
          : "n/a",
        lastTag,
      };
    },
    { testid: PAGE_SCROLL, action },
  );
}

export async function scrollPageTo(page: Page, position: "top" | "bottom") {
  const layout = await readPageLayout(page, position);
  expect(
    layout,
    `scroll container halaman tidak ditemukan (${position})`,
  ).not.toBeNull();
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
export async function captureViewportPair(
  page: Page,
  dir: string,
  label: string,
  viewport: VisualViewport,
) {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await scrollPageTo(page, "top");
  const top = path.join(dir, `${label}-${viewport.width}-top.png`);
  await page.screenshot({ path: top });
  await scrollPageTo(page, "bottom");
  const bottom = path.join(dir, `${label}-${viewport.width}-bottom.png`);
  await page.screenshot({ path: bottom });
  console.log(
    `[artifact] screenshot: ${top}\n[artifact] screenshot: ${bottom}`,
  );
  return { top, bottom };
}

/** Kontrol milik halaman ini saja; navigasi shared di luar scope. */
export function inScopeControls(page: Page) {
  return [
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

export async function assertTouchTargets(page: Page) {
  const sizes: Record<string, string> = {};
  for (const control of inScopeControls(page)) {
    const box = await control.boundingBox();
    const name = (await control.getAttribute("aria-label")) ?? control;
    sizes[String(name)] = box
      ? `${Math.round(box.width)}x${Math.round(box.height)}`
      : "hidden";
    expect(box, `kontrol "${String(name)}" tidak punya box`).not.toBeNull();
    expect(
      box!.height,
      `target sentuh "${String(name)}" = ${Math.round(box!.height)}px`,
    ).toBeGreaterThanOrEqual(44);
  }
  return sizes;
}

/** Cincin fokus (box-shadow) atau outline harus benar-benar terlihat. */
export async function readFocusIndicator(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body)
      return { ring: false, outline: false, tag: "none" };
    const style = getComputedStyle(el);
    return {
      ring: style.boxShadow !== "none",
      outline:
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
      tag: `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 24)}`,
    };
  });
}

/**
 * Satu representasi per breakpoint: tepat satu dari tabel/daftar yang terlihat,
 * dan representasi itu yang memuat Temuan + Rekomendasi lengkap serta tiket.
 */
export async function assertSingleRepresentation(
  page: Page,
  viewport: VisualViewport,
) {
  const table = page.getByTestId(RESULTS_TABLE);
  const list = page.getByTestId(RESULTS_LIST);
  const expectTable = viewport.width >= DESKTOP_MIN_WIDTH;

  if (expectTable) {
    await expect(
      table,
      `${viewport.label}px: tabel harus tampil`,
    ).toBeVisible();
    await expect(
      list,
      `${viewport.label}px: daftar mobile harus tersembunyi`,
    ).toBeHidden();
  } else {
    await expect(
      list,
      `${viewport.label}px: daftar ringkas harus tampil`,
    ).toBeVisible();
    await expect(
      table,
      `${viewport.label}px: tabel harus tersembunyi`,
    ).toBeHidden();
  }

  // Permukaan hasil ikut dibuktikan: state populated selalu punya container
  // data, bukan teks telanjang.
  await expect(page.getByTestId(RESULTS_SURFACE)).toBeVisible();

  const visible = expectTable ? table : list;
  for (const label of CELL_LABELS) {
    await expect(
      visible.getByText(label, { exact: true }).first(),
    ).toBeVisible();
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
  const clipped = await visible.locator("p, dd, td").evaluateAll((nodes) =>
    nodes
      .filter((node) => (node.textContent ?? "").length > 80)
      .map((node) => ({
        text: (node.textContent ?? "").slice(0, 40),
        clipped: node.scrollWidth - node.clientWidth,
      }))
      .filter((entry) => entry.clipped > 1),
  );
  expect(clipped, `teks panjang terpotong: ${JSON.stringify(clipped)}`).toEqual(
    [],
  );
}

/**
 * Baca file `.xlsx` yang benar-benar diunduh browser dan kembalikan grid teks
 * per sheet. Memakai `exceljs` yang sudah menjadi dependency `@trainers/web`
 * (path baca yang sama dengan `src/lib/excel-utils.ts`), tanpa menambah
 * dependency baru. Semua cell ikut dibaca, bukan hanya sheet pertama.
 */
export async function readDownloadedWorkbook(
  download: Download,
): Promise<Record<string, string[][]>> {
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
      for (let c = 1; c <= Math.max(row.cellCount, 1); c++)
        cells.push(row.getCell(c).text);
      rows.push(cells);
    });
    sheets[sheet.name] = rows;
  });
  return sheets;
}

/** Baris data (tanpa header) dari sheet "Data Laporan" pada file .lsx. */
export async function exportedDataRows(
  download: Download,
): Promise<string[][]> {
  const workbook = await readDownloadedWorkbook(download);
  expect(Object.keys(workbook), "sheet export berubah").toContain(
    "Data Laporan",
  );
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
export const ALL_SCOPE_PARAMETER_LABELS = [
  "Semuanya",
  "Call · Akurasi informasi produk",
  "Call · Compliance — Kepatuhan prosedur",
  "Chat · Akurasi informasi produk",
  "Email · Kelengkapan dokumen",
];

export function parameterSelect(page: Page) {
  return page.getByRole("combobox", { name: "Parameter" });
}

/** Tombol submit laporan; teks berubah ke "Memuat..." saat request berjalan. */
export function cariDataButton(page: Page) {
  return page.getByRole("button", { name: /Cari Data|Memuat/ });
}

/**
 * Status aksesibel katalog parameter. `role="status"` tidak punya accessible
 * name dari konten, jadipencocokan lewat `hasText` — dan di-filter supaya
 * panel status lain di halaman (mis. "Memuat data temuan") tidak ikut kena.
 */
export function parameterPendingStatus(page: Page) {
  return page
    .getByRole("status")
    .filter({ hasText: "Memuat daftar parameter" });
}

export function parameterErrorAlert(page: Page) {
  return page
    .getByRole("alert")
    .filter({ hasText: "Gagal memuat daftar parameter" });
}

/** Label request katalog persis seperti yang tercatat audit (query ikut). */
export function indicatorRequestLabels(audit: NetworkAudit): string[] {
  return audit.mockedApi.filter((label) =>
    label.includes("/api/v1/sidak/indicators"),
  );
}

/** Katalog tanpa query: seluruh indikator aktif. */
export const INDICATORS_ALL_SCOPE = `GET ${APP_ORIGIN}/api/v1/sidak/indicators`;

/** Katalog satu layanan: query `service_type` persis, tanpa param lain. */
export const indicatorsForService = (service: string) =>
  `${INDICATORS_ALL_SCOPE}?service_type=${service}`;

export function lastDataRequest(
  dataRequests: DataRequest[],
): Record<string, unknown> {
  expect(
    dataRequests.length,
    "tidak ada request data yang terkirim",
  ).toBeGreaterThan(0);
  return dataRequests[dataRequests.length - 1].body;
}

export async function exportDataWorkbook(
  page: Page,
  name: string,
): Promise<string[][]> {
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
export const activeAudits: NetworkAudit[] = [];

export function startAudit(): NetworkAudit {
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
export const TICKET_CELL_INDEX = 3;

/** Indeks sel "Temuan" pada `<tr>` yang sama (Parameter ada di indeks 4). */
export const FINDING_CELL_INDEX = 5;

/** Indeks sel "Rekomendasi" pada `<tr>` yang sama. */
export const RECOMMENDATION_CELL_INDEX = 6;

/** Nomor tiket ber-spasi yang harus tampil tanpa spasi tepi. */
export const PADDED_TICKET_VALUE = "TKT-2026-0777";

export const PADDED_TICKET_RAW = `  ${PADDED_TICKET_VALUE}  `;

/** (a) actionable, nomor tiket dikelilingi spasi. */
export const ROW_ACTIONABLE_PADDED_TICKET: ReportRow = {
  ...ROW_ACTIONABLE_EMAIL,
  id: "row-actionable-padded-ticket",
  no_tiket: PADDED_TICKET_RAW,
};

/** (b) actionable, `no_tiket` ada tapi bernilai `null`. */
export const ROW_ACTIONABLE_TICKET_NULL: ReportRow = {
  ...ROW_ACTIONABLE_CALL,
  id: "row-actionable-ticket-null",
  no_tiket: null,
};

/**
 * (c) actionable, field `no_tiket` TIDAK ADA sama sekali — ditulis literal,
 * bukan spreading lalu menghapus key, supaya "tidak ada field" terlihat langsung
 * di fixture dan bukan hasil tebakan.
 */
export const ROW_ACTIONABLE_TICKET_ABSENT: ReportRow = {
  id: "row-actionable-ticket-absent",
  service_type: "email",
  tahun: 2026,
  is_phantom_padding: false,
  nilai: 1,
  ketidaksesuaian: FINDING_ACTIONABLE_EMAIL,
  sebaiknya: RECOMMENDATION_ACTIONABLE_EMAIL,
  profiler_peserta: {
    id: "agent-2",
    nama: "Bima Saputra",
    batch_name: "Batch 7",
  },
  qa_indicators: { id: "indicator-dokumen", name: "Kelengkapan dokumen" },
  qa_periods: { id: "period-2026-01", month: 1, year: 2026, label: "01/2026" },
};

/**
 * Nilai mentah fixture tiket ber-spasi. Dipakai test sebagai bukti bahwa
 * fixture-nya memang punya spasi tepi — kalau ini sama dengan nilai yang
 * diharapkan, test tidak membuktikan apa pun.
 */
export const RAW_TICKET_PAD = PADDED_TICKET_RAW;

// ── Paritas format sel: Excel vs UI ─────────────────────────────────────────
// `exportExcel` harus menulis SEL yang sama persis dengan yang dirender UI:
//   - `No. Tiket`: dipangkas spasi tepinya, dan `null`/kosong menjadi `-`
//     (bukan sel kosong, supaya "tiket tidak ada" tidak tertukar dengan
//     "sel tidak terisi").
//   - `Temuan` dan `Seharusnya`: dipangkas spasi tepinya.
// Ketiga aturan itu sudah hidup di `getReportTicketText`,
// `getReportFindingText`, dan `getReportRecommendationText`; bukti di bawah
// membandingkan file Excel hasil unduhan sungguhan dengan teks yang benar-benar
// terlihat di layar, bukan dengan nilai mentah dari respons mock.
//
// Nama agen dipakai sebagai kunci penyambung baris UI ↔ baris file karena
// `Agen` BUKAN salah satu dari tiga sel yang diuji — jadi kolom itu tidak bisa
// ikut "selalu cocok" hanya karena kedua sisi membaca sumber yang sama.

/**
 * (1) actionable: nomor tiket, Temuan, dan Rekomendasi dikelilingi spasi tepi.
 * Nilai yang sudah ada di atas dipakai apa adanya supaya nilai yang diharapkan
 * di file sama persis dengan konstanta yang dipakai UI.
 */
export const ROW_EXPORT_PADDED_TICKET: ReportRow = {
  ...ROW_ACTIONABLE_CALL,
  id: "row-export-padded-ticket",
  profiler_peserta: { nama: "Sari Prasetya", batch_name: "Batch 7" },
  no_tiket: PADDED_TICKET_RAW,
  ketidaksesuaian: `  ${FINDING_ACTIONABLE_CALL}  `,
  sebaiknya: `  ${RECOMMENDATION_ACTIONABLE_CALL}  `,
};

/** (2) actionable, `no_tiket: null` → UI menulis `-`, bukan sel kosong. */
export const ROW_EXPORT_NULL_TICKET: ReportRow = {
  ...ROW_ACTIONABLE_CALL,
  id: "row-export-null-ticket",
  profiler_peserta: { nama: "Bima Saputra", batch_name: "Batch 7" },
  no_tiket: null,
  ketidaksesuaian: `  ${FINDING_ACTIONABLE_CALL}  `,
  sebaiknya: `  ${RECOMMENDATION_ACTIONABLE_CALL}  `,
};

/** (3) actionable, `no_tiket` hanya berisi spasi → juga `-` di UI. */
export const ROW_EXPORT_BLANK_TICKET: ReportRow = {
  ...ROW_ACTIONABLE_EMAIL,
  id: "row-export-blank-ticket",
  profiler_peserta: { nama: "Citra Lestari", batch_name: "Batch 7" },
  no_tiket: "   ",
  ketidaksesuaian: `  ${FINDING_ACTIONABLE_EMAIL}  `,
  sebaiknya: `  ${RECOMMENDATION_ACTIONABLE_EMAIL}  `,
};

/** Tiga baris paritas; semua tetap actionable, jadi hitungan UI = 3. */
export const EXPORT_PARITY_ROWS = [
  ROW_EXPORT_PADDED_TICKET,
  ROW_EXPORT_NULL_TICKET,
  ROW_EXPORT_BLANK_TICKET,
];

/**
 * Baris yang HARUS dibuang, ikut dilayani supaya "tidak ikut di file" ikut
 * terbukti, bukan hanya diasumsikan. Urutannya sengaja tidak sama dengan
 * `EXPORT_PARITY_ROWS` supaya tidak ada asumsi posisi.
 */
export const EXPORT_PARITY_NON_ACTIONABLE = [
  ROW_WITHOUT_RECOMMENDATION,
  ROW_PHANTOM,
  ROW_WITHOUT_FINDING,
];

/** Kunci baris (nama agen) untuk penyambung UI ↔ file Excel. */
export const EXPORT_PARITY_AGENTS = [
  "Sari Prasetya",
  "Bima Saputra",
  "Citra Lestari",
] as const;

/** Nilai mentah ber-spasi yang tidak boleh ikut ke file Excel. */
export const EXPORT_PARITY_RAW_TEXTS = [
  PADDED_TICKET_RAW,
  `  ${FINDING_ACTIONABLE_CALL}  `,
  `  ${RECOMMENDATION_ACTIONABLE_CALL}  `,
  `  ${FINDING_ACTIONABLE_EMAIL}  `,
  `  ${RECOMMENDATION_ACTIONABLE_EMAIL}  `,
];

/**
 * `textContent` mentah satu elemen — TANPA normalisasi whitespace.
 * Inilah satu-satunya cara melihat apakah `.trim()` benar-benar berjalan pada
 * nilai yang dirender.
 */
export async function rawText(locator: Locator): Promise<string> {
  return locator.evaluate((node) => node.textContent ?? "");
}

/** Satu `<tr>` tabel desktop, dicari lewat Temuan yang unik pada baris itu. */
export function desktopRowFor(page: Page, finding: string): Locator {
  return desktopResults(page).getByRole("row").filter({ hasText: finding });
}

/** Sel "No. Tiket" pada baris tabel desktop tertentu. */
export function desktopTicketCell(page: Page, finding: string): Locator {
  return desktopRowFor(page, finding).getByRole("cell").nth(TICKET_CELL_INDEX);
}

/** Satu `<li>` daftar mobile, dicari lewat Temuan yang unik pada item itu. */
export function mobileItemFor(page: Page, finding: string): Locator {
  return page
    .getByTestId(RESULTS_LIST)
    .getByRole("listitem")
    .filter({ hasText: finding });
}

/** Escape meta-karakter regex supaya nilai tiket tidak mengubah pola. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Baris "Tiket <value>" pada item daftar mobile. `^Tiket` di-anchor supaya
 * paragraf agen/periode/Skor tidak ikut tercocok; teks yang sudah dinormalisasi
 * dipakai untuk pencocokan, sementara pembuktian padding tetap lewat `rawText`.
 */
export function mobileTicketLine(
  page: Page,
  finding: string,
  rendered: string,
): Locator {
  return mobileItemFor(page, finding).getByText(
    new RegExp(`^Tiket ${escapeRegExp(rendered)}$`),
  );
}

/** Viewport yang dipakai untuk membuktikan KEDUA representasi secara terlihat. */
export const TICKET_DESKTOP_VIEWPORT = { width: 1440, height: 900 };

export const TICKET_MOBILE_VIEWPORT = { width: 390, height: 844 };

/**
 * Placeholder select Agen hanya berubah dari "Memuat agen..." ke "Pilih Agen"
 * setelah respons selesai. `toHaveText` menunggu perubahan itu; begitu berubah,
 * daftar opsi sudah final karena `data` dan `loading` di-commit bersama — jadi
 * pembacaan daftar penuh berikutnya tidak bisa menangkap keadaan setengah jalan.
 */
export async function settledAgentOptions(
  agentSelect: Locator,
): Promise<string[]> {
  await expect(selectValue(agentSelect)).toHaveText("Pilih Agen");
  return selectOptionLabels(agentSelect);
}

/**
 * Bukti bahwa tepat satu representasi yang tampil pada viewport tertentu, dan
 * nilai yang diuji ada di representation itu (bukan di copy yang tersembunyi).
 */
export async function expectActiveRepresentation(
  page: Page,
  viewport: { width: number; height: number },
): Promise<Locator> {
  await page.setViewportSize(viewport);
  const table = page.getByTestId(RESULTS_TABLE);
  const list = page.getByTestId(RESULTS_LIST);
  if (viewport.width >= DESKTOP_MIN_WIDTH) {
    await expect(
      table,
      `${viewport.width}px: tabel harus tampil`,
    ).toBeVisible();
    await expect(
      list,
      `${viewport.width}px: daftar mobile harus tersembunyi`,
    ).toBeHidden();
    return table;
  }
  await expect(
    list,
    `${viewport.width}px: daftar ringkas harus tampil`,
  ).toBeVisible();
  await expect(
    table,
    `${viewport.width}px: tabel harus tersembunyi`,
  ).toBeHidden();
  return list;
}
