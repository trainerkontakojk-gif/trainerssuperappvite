/**
 * Sumber tunggal desain laporan HTML agen (SIDAK).
 *
 * Satu stylesheet, satu kerangka markup, satu dataset untuk KEDUA varian:
 * `static` (dokumen baca, semua bagian terbuka) dan `interactive` (tab, filter
 * tren, disclosure opsional). Perbedaannya hanya perilaku, tidak pernah isi.
 *
 * Aturan yang dijaga di sini (bukan di|format|*):
 *  - Varian statis tidak punya kontrol apa pun yang tidak bisa bekerja pada file
 *    offline: tidak ada tombol "Unduh Laporan"/"Input Audit"/"Muat ulang", tidak
 *    ada `<select>` mati, dan tidak ada ARIA tab palsu. Pembaca cukup membuka
 *    file itu dan membacanya.
 *  - Varian interaktif hanya memakai kontrol yang benar-benar berfungsi: tab
 *    dengan navigasi keyboard + roving tabindex, filter seri tren, dan
 *    `<details>` opsional. `@media print` membuka kembali semua panel, semua
 *    seri grafik, dan SEMUA disclosure yang tadinya tertutup — termasuk isi
 *    `<details>` yang disembunyikan mesin lewat `::details-content`, yang
 *    hilang dari cetak kalau hanya `display` yang dipaksa.
 *  - Cetak A4: laporan ini muat dalam lima halaman untuk fixture standar dan
 *    tidak pernah menyisakan halaman terakhir yang isinya hanya colophon. Jarak
 *    panel/seksi dikecilkan HANYA untuk `@media print` supaya seluruh isi
 *    ikut tercetak; tampilan layar tidak berubah.
 *  - Setiap seksi menyatakan cakupannya sendiri. Helper `*ScopeLabel` di file ini
 *    dipakai bersama oleh CSV/MD, jadi "cakupan seksi" hanya punya satu definisi.
 *  - **Dua keluarga tren, dua seksi.** `personalTrend` berisi **jumlah temuan**
 *    per periode — itu hitungan temuan, BUKAN skor — jadi grafiknya hidup di
 *    seksi "Tren Temuan". Seksi "Perkembangan Skor" memakai skor yang benar-benar
 *    dihitung backend (`periodSummaries`: `finalScore`, `nonCriticalScore`,
 *    `criticalScore`) untuk tahun + layanan yang sama, jadi tidak ada skor yang
 *    pernah diturunkan dari jumlah temuan dan tidak ada perhitungan ulang.
 *  - **Satu metrik satu grafik.** Di seksi skor, `Skor Final`, `Skor
 *    Non-Critical`, dan `Skor Critical` masing-masing punya grafik sendiri; di
 *    seksi temuan, `Total Temuan` (agregat) dan rincian per parameter
 *    (komponen) tidak pernah digabung dalam satu trendline karena keduanya
 *    memiliki satuan yang sama tetapi semantik yang berbeda. Tiap grafik punya
 *    judul, satuan, legenda, dan tabel data lengkapnya sendiri; angka yang
 *    digambar tidak pernah dikarang atau dibulatkan ulang.
 *  - **Nomor tiket adalah identifier utama.** Ia tampil lebih besar, lebih
 *    tebal, dan lebih berkontras daripada nama parameter maupun nilai, supaya
 *    pembaca bisa memindai tiket yang diaudit tanpa kehilangan posisinya di
 *    antara angka.
 *  - Dokumen offline: CSS inline, tanpa font/link/script/gambar remote. Avatar
 *    memakai inisial, bukan `<img>`.
 *  - Semua teks dari data pengguna di-escape; tidak ada nilai yang bisa
 *    menyuntikkan markup, termasuk ke dalam atribut SVG dan `aria-label`.
 */

import type {
  AgentDetailData,
  AgentPeriodSummary,
  RootCauseResult,
  SidakAgentQuickviewResponse,
} from "@trainers/types";
import { sidakScoreLabel, sidakScoreTone } from "./sidakScoreStatus";

// ---------------------------------------------------------------------------
// Kontrak bersama (di-re-export oleh `exportAgentReport.ts`)
// ---------------------------------------------------------------------------

export type AgentHtmlVariant = "interactive" | "static";

export interface TicketScoreExport {
  no_tiket: string;
  scoreDeduction: number;
  findingCount: number;
  heaviestParam: string;
  isSamplingQa: boolean;
}

export interface TemuanDisplayItemExport {
  id: string;
  month: number;
  year: number;
  indicatorName: string;
  category: string;
  nilai: number;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  no_tiket: string | null;
}

export interface AgentHtmlExportContext {
  selectedMonth?: number | null;
  trendStartMonth?: number;
  trendEndMonth?: number;
  quickview?: SidakAgentQuickviewResponse | null;
  isStaff?: boolean;
}

export interface AgentReportHtmlInput {
  data: AgentDetailData;
  monthlySummaries: AgentPeriodSummary[];
  temuanDisplayItems: TemuanDisplayItemExport[];
  topTickets: TicketScoreExport[];
  activeRootCauses: RootCauseResult[];
  selectedYear: number;
  selectedService: string;
  variant: AgentHtmlVariant;
  context: AgentHtmlExportContext;
}

// ---------------------------------------------------------------------------
// Nilai & pelabelan
// ---------------------------------------------------------------------------

export const MONTHS_FULL = [
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
];

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agt",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

/** Ambang QA yang sama dengan `MonthRail`/`AgentAuditDossier` di aplikasi. */
const QA_TARGET = 95;

const TREND_COLORS = [
  "#0f172a",
  "#0f766e",
  "#b45309",
  "#be123c",
  "#4338ca",
  "#0891b2",
  "#7c3aed",
];

/**
 * Pola garis per seri. Warna saja tidak boleh menjadi pembeda seri: tiap seri
 * non-total memakai pola garis berbeda supaya laporan tetap terbaca saat
 * dicetak hitam-putih atau oleh pembaca dengan buta warna.
 */
const TREND_DASHES = ["", "7 4", "2 3", "11 3 2 3", "5 3", "13 4"];

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function finiteNumber(
  value: unknown,
  fallback = 0,
  min = -Infinity,
  max = Infinity,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function numberText(value: unknown, fallback = 0): string {
  return String(finiteNumber(value, fallback));
}

function yearText(value: unknown, fallback = 0): string {
  return String(Math.trunc(finiteNumber(value, fallback)));
}

export function nilaiLabel(nilai: number): string {
  const labels: Record<number, string> = {
    3: "SESUAI",
    2: "PERBAIKAN",
    1: "TIDAK SESUAI",
    0: "KRITIS",
  };
  return labels[Math.trunc(finiteNumber(nilai))] ?? "?";
}

type Tone = "ok" | "warn" | "bad";

/** Ambang status sama dengan halaman detail agent (`sidakScoreStatus`). */
function scoreTone(score: number): Tone {
  return sidakScoreTone(finiteNumber(score));
}

function scoreLabel(score: number): string {
  return sidakScoreLabel(finiteNumber(score));
}

function deltaTone(delta: number | null): Tone | "flat" {
  if (delta === null) return "flat";
  if (delta > 0) return "ok";
  if (delta < 0) return "bad";
  return "flat";
}

export function computeTenure(bergabungDate: string | null): string {
  if (!bergabungDate) return "-";
  const start = new Date(bergabungDate);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (months < 12) return months + " bulan";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? years + " tahun " + rem + " bulan" : years + " tahun";
}

// ---------------------------------------------------------------------------
// Label cakupan seksi — definisi tunggal untuk HTML, CSV, dan MD
//
// HTML memakai helper yang sama persis dengan CSV/MD untuk cakupan tahun +
// layanan, bulan terpilih, YTD akar masalah, dan rentang tren, supaya "cakupan
// seksi" tidak punya dua definisi. Cakupan benchmark punya format kalimat yang
// berbeda per format (kontrak CSV/MD dikunci di docs dan diuji E2E), jadi
// `comparisonScopeLabel` tetap hidup di `exportAgentReport.ts`; keduanya
// membaca sumber yang sama, yaitu `comparisonTable.scope` dari backend.
// ---------------------------------------------------------------------------

/** `Februari 2026`, atau `null` kalau bulan tidak dalam 1–12. */
function monthYearLabel(month: number | null, year: number): string | null {
  if (month == null || !Number.isFinite(month)) return null;
  const index = Math.trunc(month);
  if (index < 1 || index > 12) return null;
  return MONTHS_FULL[index - 1] + " " + year;
}

function servicePrefix(service: string): string {
  return service ? "Layanan " + service.toUpperCase() : "Layanan";
}

export function yearServiceScopeLabel(service: string, year: number): string {
  return `${servicePrefix(service)} • Tahun ${year}`;
}

export function monthScopeLabel(
  service: string,
  year: number,
  month: number | null,
): string {
  const base = yearServiceScopeLabel(service, year);
  const monthLabel = monthYearLabel(month, year);
  return monthLabel ? `${base} • Bulan terpilih ${monthLabel}` : base;
}

export function yearToDateScopeLabel(
  service: string,
  year: number,
  month: number | null,
): string {
  const prefix = servicePrefix(service);
  const monthLabel = monthYearLabel(month, year);
  return monthLabel
    ? `${prefix} • Tahun berjalan s.d. ${monthLabel}`
    : `${prefix} • Tahun berjalan ${year}`;
}

export function trendScopeLabel(
  service: string,
  year: number,
  labels: string[],
): string {
  const base = yearServiceScopeLabel(service, year);
  if (labels.length === 0) return base;
  return `${base} • Periode ${labels[0]} - ${labels[labels.length - 1]}`;
}

function comparisonScopeLine(data: AgentDetailData): {
  text: string;
  peerText: string;
} {
  const scope = data.comparisonTable?.scope;
  if (!scope) return { text: "", peerText: "" };
  const startLabel = MONTHS_SHORT[(scope.startMonth ?? 1) - 1] ?? "";
  const endLabel = MONTHS_SHORT[(scope.endMonth ?? 12) - 1] ?? "";
  const totalRow = data.comparisonTable?.rows.find(
    (row) => row.key === "total",
  );
  return {
    text:
      (startLabel && endLabel ? `Periode ${startLabel}-${endLabel} ` : "") +
      yearText(scope.year) +
      " • Layanan " +
      (scope.serviceLabel || scope.serviceType) +
      " • " +
      scope.teamLabel,
    peerText:
      numberText(totalRow?.teamAgentCount) +
      " agen tim / " +
      numberText(totalRow?.serviceAgentCount) +
      " agen layanan sama",
  };
}

// ---------------------------------------------------------------------------
// Stylesheet dokumen (inline, self-contained, tanpa token aplikasi)
// ---------------------------------------------------------------------------

const REPORT_CSS = `
:root {
  --ink: #0f172a;
  --ink-body: #334155;
  --ink-mute: #475569;
  --ink-faint: #64748b;
  --paper: #ffffff;
  --canvas: #f8fafc;
  --line: #e2e8f0;
  --line-strong: #cbd5e1;
  --wash: #f1f5f9;
  --ok: #047857;
  --warn: #b45309;
  --bad: #be123c;
  --sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --display: Outfit, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  padding: 2.5rem 1.25rem 4rem;
  background: var(--canvas);
  color: var(--ink-body);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.report { max-width: 64rem; margin: 0 auto; min-width: 0; }
img, svg { max-width: 100%; }
h1, h2, h3, h4 { margin: 0; color: var(--ink); font-family: var(--display); font-weight: 700; letter-spacing: -0.02em; text-wrap: balance; }
p { margin: 0; }
dl, dd, dt, ul, li, figure, table, caption { margin: 0; padding: 0; }
ul { list-style: none; }

/* ── Masthead ─────────────────────────────────────────────────────────── */
.masthead { padding-bottom: 1.75rem; border-bottom: 2px solid var(--ink); }
.masthead-id { display: flex; align-items: center; gap: 1rem; min-width: 0; }
.masthead-text { min-width: 0; }
.masthead-initial {
  display: flex; flex: none; align-items: center; justify-content: center;
  width: 3.5rem; height: 3.5rem; border: 1px solid var(--line-strong);
  border-radius: 12px; background: var(--wash);
  color: var(--ink); font-family: var(--display); font-size: 1.5rem; font-weight: 700;
}
.masthead-name { font-size: 2rem; font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; overflow-wrap: anywhere; }
.masthead-context { margin-top: 0.35rem; color: var(--ink-mute); font-size: 0.875rem; font-weight: 500; }
.masthead-meta {
  display: grid; gap: 0.75rem 1.75rem; margin-top: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
}
.meta-item dt { color: var(--ink-faint); font-size: 0.75rem; font-weight: 600; letter-spacing: 0.02em; }
.meta-item dd { margin-top: 0.15rem; color: var(--ink); font-size: 0.9375rem; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }

/* ── Panel & seksi ────────────────────────────────────────────────────── */
.panel { margin-top: 2.75rem; }
.panel + .panel { margin-top: 2.5rem; padding-top: 2.5rem; border-top: 1px solid var(--line); }
.panel-title { font-size: 1.375rem; font-weight: 800; letter-spacing: -0.03em; }
.report-tabs {
  display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 1.5rem;
  border-bottom: 1px solid var(--line); padding-bottom: 0.5rem;
}
.report-tab {
  min-height: 2.75rem; border: 0; border-bottom: 2px solid transparent;
  background: transparent; color: var(--ink-mute); padding: 0.5rem 0.85rem;
  font: inherit; font-size: 0.875rem; font-weight: 600; cursor: pointer;
  transition: color 160ms ease-out, border-color 160ms ease-out;
}
.report-tab:hover { color: var(--ink); }
.report-tab[aria-selected="true"] { border-bottom-color: var(--ink); color: var(--ink); }
.report-tab:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
.section { margin-top: 2.25rem; }
.panel > .section:first-child { margin-top: 0.85rem; }
.section-title { font-size: 1.125rem; font-weight: 700; }
.section-scope { margin-top: 0.3rem; color: var(--ink-faint); font-size: 0.8125rem; font-weight: 500; }
.section-note { margin-top: 0.6rem; max-width: 68ch; color: var(--ink-mute); font-size: 0.875rem; }
.empty-state { margin-top: 0.75rem; color: var(--ink-mute); font-size: 0.9375rem; }

/* ── Skor periode aktif ───────────────────────────────────────────────── */
.score-block {
  display: grid; gap: 1.25rem 2rem; margin-top: 1rem; align-items: start;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}
.score-figure { min-width: 0; }
.score-period { color: var(--ink-faint); font-size: 0.8125rem; font-weight: 600; }
.score-value {
  margin-top: 0.35rem; color: var(--ink); font-family: var(--display);
  font-size: 3rem; font-weight: 800; line-height: 1; letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
}
.score-value span { margin-left: 0.15rem; color: var(--ink-faint); font-size: 1.125rem; font-weight: 600; }
.score-status { display: inline-block; margin-top: 0.6rem; font-size: 0.8125rem; font-weight: 700; }
.tone-ok { color: var(--ok); }
.tone-warn { color: var(--warn); }
.tone-bad { color: var(--bad); }
.tone-flat { color: var(--ink-mute); }
.score-meter { height: 0.5rem; margin-top: 1rem; border-radius: 9999px; background: var(--wash); overflow: hidden; }
.score-meter span { display: block; height: 100%; border-radius: 9999px; background: var(--ink); }
.score-stats { display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: center; }
.score-stats dt { color: var(--ink-faint); font-size: 0.75rem; font-weight: 600; }
.score-stats dd { margin-top: 0.2rem; color: var(--ink); font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }

/* ── Tabel ────────────────────────────────────────────────────────────── */
.table-scroll { max-width: 100%; margin-top: 1rem; overflow-x: auto; overscroll-behavior-inline: contain; }
caption {
  padding: 0 0 0.5rem; color: var(--ink); text-align: left;
  font-family: var(--display); font-size: 0.9375rem; font-weight: 700;
  white-space: normal;
}
table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
thead th {
  padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--line-strong);
  color: var(--ink-mute); font-size: 0.75rem; font-weight: 700;
  text-align: left; letter-spacing: 0.02em; white-space: nowrap;
}
tbody td { padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--line); color: var(--ink-body); vertical-align: top; }
tbody th { padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--line); color: var(--ink); font-size: 0.875rem; font-weight: 600; text-align: left; }
tbody tr:nth-child(even) td, tbody tr:nth-child(even) th { background: #fbfcfe; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.total-row td, .total-row th { border-top: 1px solid var(--line-strong); color: var(--ink); font-weight: 700; }

/* ── Posisi performa (quickview) ──────────────────────────────────────── */
/* Tiga sel tetap (Tim Gabungan, Tim Leader, Forecast) — jumlah kolom pasti
   supaya tidak pernah muncul track kosong di ujung grid. */
.standing { display: grid; gap: 1px; margin-top: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.standing-item { min-width: 0; padding: 1rem 1.15rem; background: var(--paper); }
.standing-item dt { color: var(--ink-faint); font-size: 0.8125rem; font-weight: 600; }
.standing-item dd { margin-top: 0.3rem; color: var(--ink); font-size: 1.375rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.standing-item small { display: block; margin-top: 0.3rem; color: var(--ink-mute); font-size: 0.8125rem; }
.standing-note { padding: 0.85rem 1.15rem; background: var(--paper); color: var(--ink-mute); font-size: 0.8125rem; grid-column: 1 / -1; }
.tie-list { margin-top: 0.4rem; color: var(--ink-mute); font-size: 0.8125rem; }
.tie-list li { padding-left: 0.9rem; text-indent: -0.9rem; }

/* ── Akar masalah ─────────────────────────────────────────────────────── */
.cause { padding: 1.1rem 0; border-bottom: 1px solid var(--line); }
.cause:last-child { border-bottom: 0; }
.cause-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.35rem 1rem; }
.cause-label { color: var(--ink); font-family: var(--display); font-size: 1rem; font-weight: 700; overflow-wrap: anywhere; }
.cause-facts { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; color: var(--ink-mute); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
.cause-recommendation { margin-top: 0.5rem; max-width: 72ch; color: var(--ink-body); font-size: 0.9375rem; }
.cause-caption { margin-top: 0.4rem; color: var(--ink-faint); font-size: 0.75rem; font-weight: 600; }
.cause-refs { margin-top: 0.75rem; }
.disclosure { color: var(--ink-mute); font-size: 0.8125rem; }
.disclosure > summary { min-height: 2.25rem; padding: 0.4rem 0; color: var(--ink-mute); font-weight: 600; cursor: pointer; }
.disclosure > summary:hover { color: var(--ink); }
.disclosure > summary:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.evidence-list { margin-top: 0.4rem; padding-left: 1rem; list-style: disc; }
.evidence-list li { padding: 0.15rem 0; color: var(--ink-body); font-variant-numeric: tabular-nums; }

/* ── Tren ─────────────────────────────────────────────────────────────── */
.trend-filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 1.25rem; }
.trend-filter {
  display: inline-flex; min-height: 2.75rem; align-items: center; gap: 0.45rem;
  border: 1px solid var(--line-strong); border-radius: 8px; background: var(--paper);
  color: var(--ink-body); padding: 0.4rem 0.8rem; font: inherit; font-size: 0.8125rem;
  font-weight: 600; cursor: pointer;
  transition: border-color 160ms ease-out, color 160ms ease-out;
}
.trend-filter:hover { border-color: var(--ink-faint); color: var(--ink); }
.trend-filter[aria-pressed="true"] { border-color: var(--ink); background: var(--ink); color: var(--paper); }
.trend-filter:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.legend-swatch { display: inline-block; width: 1.25rem; height: 0.4rem; flex: none; border-radius: 2px; }
.trend-figure { margin-top: 1.25rem; padding: 0.9rem 1rem 0.75rem; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
/* Tiap grafik punya judul, catatan satuan, dan legenda sendiri: dua metrik
   yang tidak sebanding (agregat vs rincian) tidak pernah digabung dalam satu
   sumbu, jadi grafik kedua selalu punya judulnya sendiri. */
.chart-title { margin-top: 0; color: var(--ink); font-family: var(--display); font-size: 0.9375rem; font-weight: 700; letter-spacing: -0.01em; }
.chart-note { margin-top: 0.2rem; max-width: 72ch; color: var(--ink-mute); font-size: 0.8125rem; }
.chart-unit { fill: var(--ink-mute); font-size: 13px; font-weight: 700; }
.chart-value { fill: var(--ink); font-size: 13px; font-weight: 700; }
.trend-chart { display: block; margin-top: 0.35rem; width: 100%; height: auto; }
.chart-grid { stroke: var(--line); stroke-width: 1; }
.chart-axis-label { fill: var(--ink-faint); font-size: 12px; font-weight: 600; }
/* Legenda duduk DI DALAM figure, tepat di bawah grafik — jauh lebih dekat
   dengan garisnya daripada blok terpisah di bawah tabel. */
.chart-legend { display: flex; flex-wrap: wrap; gap: 0.35rem 1.25rem; margin-top: 0.6rem; color: var(--ink-body); font-size: 0.8125rem; font-weight: 600; }
.chart-legend-item { display: inline-flex; align-items: center; gap: 0.4rem; }
.trend-caption { margin-top: 0.6rem; color: var(--ink-faint); font-size: 0.75rem; }
.trend-table { font-size: 0.8125rem; }
.trend-foot { display: grid; gap: 1.5rem; margin-top: 1.5rem; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
.trend-foot dt { color: var(--ink-faint); font-size: 0.75rem; font-weight: 600; }
.trend-foot dd { margin-top: 0.25rem; color: var(--ink-mute); font-size: 0.875rem; }
.trend-periods { margin-right: 0.35rem; color: var(--ink); font-family: var(--display); font-size: 1.5rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.trend-summary { max-width: 68ch; }

/* ── Temuan ───────────────────────────────────────────────────────────── */
.findings-period { border-top: 1px solid var(--line); }
.findings-period > summary {
  display: flex; min-height: 2.75rem; align-items: center; gap: 1rem;
  padding: 0.7rem 0.25rem; cursor: pointer; list-style: none;
  transition: background 160ms ease-out;
}
.findings-period > summary::-webkit-details-marker { display: none; }
.findings-period > summary:hover { background: var(--wash); }
.findings-period > summary:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
.findings-period-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.findings-period-copy strong { color: var(--ink); font-family: var(--display); font-size: 1rem; font-weight: 700; }
.findings-period-copy small { margin-top: 0.1rem; color: var(--ink-mute); font-size: 0.8125rem; }
.disclosure-caret { width: 0.5rem; height: 0.5rem; flex: none; border-right: 2px solid var(--ink-faint); border-bottom: 2px solid var(--ink-faint); transform: rotate(45deg); transition: transform 160ms ease-out; }
.findings-period[open] > summary .disclosure-caret { transform: rotate(225deg); }
.findings-body { padding-bottom: 1.5rem; }
/* Nomor tiket adalah IDENTIFIER laporan, jadi elemen terkuat di dalam blok
   temuan: pita berlabel dengan latar penuh, kontras penuh (--ink), dan ukuran
   lebih besar dari nama parameter maupun nilai. Sebelumnya ia hanya span kecil bernada pucat
   dengan    nama parameter yang lebih besar, sehingga pembaca laporan mudah kehilangan
   tiket yang sebenarnya diaudit. */
.finding-ticket { margin-top: 1.5rem; }
.finding-ticket-head {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.2rem 0.6rem;
  padding: 0.5rem 0.75rem; border: 1px solid var(--line-strong); border-radius: 8px;
  background: var(--wash);
}
.ticket-label { color: var(--ink-mute); font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.ticket-code { color: var(--ink); font-family: var(--display); font-size: 1.125rem; font-weight: 800; line-height: 1.2; letter-spacing: 0.01em; overflow-wrap: anywhere; }
.ticket-meta { margin-left: auto; color: var(--ink-mute); font-size: 0.75rem; font-weight: 600; }
/* Bentuk tabel: identifier tetap bold kontras penuh, tapi tidak memperbesar
   baris tabel yang padat. */
.ticket-code-cell { font-family: var(--sans); font-size: 0.875rem; font-weight: 700; letter-spacing: 0.02em; }
.finding { display: grid; gap: 0.35rem 1.25rem; padding: 0.9rem 0 1rem 0.75rem; border-bottom: 1px solid var(--line); grid-template-columns: 5.5rem minmax(0, 1fr); }
.finding:last-child { border-bottom: 0; }
.finding-value { font-variant-numeric: tabular-nums; }
.finding-value strong { display: block; color: var(--ink); font-size: 1rem; font-weight: 700; line-height: 1.1; }
.finding-value span { display: block; margin-top: 0.25rem; color: var(--ink-mute); font-size: 0.75rem; font-weight: 600; }
.finding-name { color: var(--ink); font-family: var(--display); font-size: 0.9375rem; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
.finding-copy { display: grid; gap: 0.85rem; margin-top: 0.6rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.finding-copy dt { color: var(--ink-faint); font-size: 0.75rem; font-weight: 700; }
.finding-copy dd { margin-top: 0.25rem; color: var(--ink-body); font-size: 0.875rem; overflow-wrap: anywhere; }
.finding-copy .finding-fix dt { color: var(--ink); }
.finding-copy .finding-fix dd { color: var(--ink); font-weight: 500; }

/* ── Colophon ─────────────────────────────────────────────────────────── */
.colophon { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--ink-faint); font-size: 0.75rem; }
.colophon p + p { margin-top: 0.35rem; }

/* ── Petunjuk tabel lebar ─────────────────────────────────────────────── */
/* Tabel lebar menggulir di dalam .table-scroll, bukan melebarkan halaman, jadi
   pembaca layar sempit tidak selalu sadar masih ada kolom di sebelah kanan.
   Petunjuk ini hanya muncul di layar sempit, tidak di desktop, dan tidak ikut
   tercetak. */
.table-hint { display: none; }
@media (max-width: 40rem) {
  .table-hint { display: block; margin-top: 0.5rem; color: var(--ink-faint); font-size: 0.75rem; }
}

.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
[hidden] { display: none !important; }

@media (max-width: 40rem) {
  body { padding: 1.5rem 1rem 2.5rem; }
  .masthead-name { font-size: 1.5rem; }
  .panel-title { font-size: 1.1875rem; }
  .score-block, .trend-foot, .finding-copy, .standing { grid-template-columns: 1fr; }
  .score-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
  .finding { grid-template-columns: 3.75rem minmax(0, 1fr); }
  /* Sumbu SVG diskalakan bersama viewBox, jadi labelnya harus ikut membesar
     agar tetap terbaca pada layar 390px. */
  .chart-axis-label { font-size: 26px; }
  .chart-unit, .chart-value { font-size: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .report-tab, .trend-filter, .findings-period > summary, .disclosure-caret { transition: none; }
}

@page { size: A4 portrait; margin: 14mm 12mm; }
@media print {
  body { padding: 0; background: #ffffff; line-height: 1.5; }
  .report { max-width: none; }
  /* Navigasi layar hilang; isinya tetap utuh. */
  .report-tabs, .trend-filters, .disclosure-caret { display: none !important; }
  /* Petunjuk "geser tabel" hanya untuk layar; di atas kertas tabel tidak
     menggulir, jadi mencetaknya hanya menambah ruang kosong. */
  .table-hint { display: none !important; }
  [data-report-panel][hidden] { display: block !important; }
  [data-chart-series][hidden] { display: inline !important; }
  /* Grafik yang disembunyikan filter seri di layar ikut dibuka lagi saat
     cetak: kalau tidak, cetakan bisa kehilangan salah satu grafik tren. */
  [data-chart-figure][hidden] { display: block !important; }
  /* Isi <details> yang tertutup disembunyikan mesin lewat
     ::details-content { content-visibility: hidden }, BUKAN lewat display,
     jadi display: block pada anaknya saja tidak cukup — tanpa dua aturan ini
     seluruh temuan dan bukti akar masalah hilang dari hasil cetak. */
  details > *:not(summary) { display: block !important; }
  details::details-content { content-visibility: visible !important; }
  .findings-period > summary, .disclosure > summary { cursor: default; }
  .findings-period > summary:hover, .disclosure > summary:hover { background: transparent; }
  .table-scroll { overflow: visible; }
  /* Header tabel boleh membungkus di atas kertas. Tanpa aturan ini, label
     seri/parameter yang panjang (nowrap di layar) membuat tabel lebih lebar
     dari halaman dan kolom terakhir terpotong di tepi kanan. */
  thead th { white-space: normal; }
  tbody td, tbody th, thead th { overflow-wrap: anywhere; }
  .trend-table { font-size: 0.75rem; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, .score-block, .score-figure, .cause, .finding, .masthead, .standing-item, .trend-foot, .colophon { break-inside: avoid; }
  /* Grafik, legenda, dan kepala blok temuan adalah unit yang harus utuh di
     atas kertas: judul grafik tidak boleh terpisah dari plot-nya, dan pita
     nomor tiket tidak boleh tertinggal di halaman sebelumnya. */
  .trend-figure, .chart-legend, .finding-ticket-head, figcaption { break-inside: avoid; }
  .finding-ticket-head { break-after: avoid; }
  h1, h2, h3, h4, caption, .section-title, .section-scope, .chart-title { break-after: avoid; }
  .panel { break-before: auto; }
  .section { break-inside: auto; }
  /* Kalimat penjelasan per grafik dan keterangan grafik tidak ikut dicetak: di
     kertas, judul grafik dan satuan sumbu sudah menyebut apa yang diukur, dan
     tiap kalimat tambahan hanya mendorong isi ke halaman tambahan. */
  /* Ritme vertikal khusus cetak. Tanpa pemadatan ini, halaman A4 terakhir
     hanya berisi colophon dan tabel benchmark terpotong di awal halaman.
     Nilai layar (desktop dan mobile) tidak tersentuh — semua aturan di dalam
     blok cetak ini. */
  .masthead { padding-bottom: 1.25rem; }
  .masthead-meta { margin-top: 1rem; }
  .panel { margin-top: 1.5rem; }
  .panel + .panel { margin-top: 1.25rem; padding-top: 1.25rem; }
  .section { margin-top: 1.25rem; }
  .panel > .section:first-child { margin-top: 0.5rem; }
  .section-note { margin-top: 0.4rem; }
  .standing { margin-top: 0.75rem; }
  .score-block { margin-top: 0.75rem; }
  .table-scroll { margin-top: 0.75rem; }
  .cause { padding: 0.75rem 0; }
  .trend-figure { margin-top: 0.75rem; padding: 0.6rem 0.75rem 0.5rem; }
  .chart-note { display: none; }
  .trend-caption { display: none; }
  .chart-legend { margin-top: 0.35rem; }
  .trend-foot { margin-top: 1rem; }
  .finding-ticket { margin-top: 0.9rem; }
  .finding { padding: 0.75rem 0; }
  .findings-body { padding-bottom: 0.75rem; }
  .colophon { margin-top: 1.25rem; padding-top: 0.75rem; }
}
`;

// ---------------------------------------------------------------------------
// Grafik tren
// ---------------------------------------------------------------------------

export interface TrendSeries {
  key: string;
  label: string;
  data: Array<number | null>;
  isTotal: boolean;
  isSummary: boolean;
  /**
   * Seri utama grafik: garis solid tebal tanpa arsir. Milik keluarga jumlah
   * temuan hanya `Total Temuan`; tiap metrik skor punya satu seri, jadi
   * serinya adalah serinya yang utama. Dipisah dari `isTotal` karena
   * `isTotal` hanya makna untuk filter seri keluarga temuan — memakai ulang
   * atribut itu untuk skor akan membuat filter "Total Temuan" ikut
   * menyorot/menyembunyikan garis skor.
   */
  emphasis: boolean;
  color: string;
  dash: string;
}

export function normalizeTrend(data: AgentDetailData): {
  labels: string[];
  series: TrendSeries[];
} {
  const labels = data.personalTrend?.labels ?? [];
  const source = data.personalTrend?.datasets ?? [];
  const ranked = source
    .map((dataset, index) => ({ dataset, index }))
    .filter(({ dataset }) => !dataset.isTotal)
    .map(({ dataset, index }) => ({
      index,
      total: dataset.data.reduce((sum, value) => sum + finiteNumber(value), 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(({ index }) => index);
  const summaryIndexes = new Set(ranked);

  return {
    labels,
    series: source.map((dataset, index) => ({
      key: "series-" + index,
      label: dataset.label,
      data: labels.map((_, valueIndex) => {
        const value = dataset.data[valueIndex];
        return typeof value === "number" && Number.isFinite(value)
          ? value
          : null;
      }),
      isTotal: dataset.isTotal,
      isSummary: dataset.isTotal || summaryIndexes.has(index),
      emphasis: dataset.isTotal,
      color: dataset.isTotal
        ? TREND_COLORS[0]
        : TREND_COLORS[(index % (TREND_COLORS.length - 1)) + 1],
      dash: dataset.isTotal
        ? ""
        : TREND_DASHES[1 + ((index - 1) % (TREND_DASHES.length - 1))],
    })),
  };
}

/**
 * Dua kelompok seri yang TIDAK boleh digabung dalam satu trendline.
 *
 * `Total Temuan` adalah agregat: nilainya selalu >= setiap parameternya, jadi
 * meletakkannya di garis yang sama dengan rincian membuat pembaca salah
 * membaca kurva parameter sebagai "turun whilst total naik" dan sebaliknya.
 * Satu-satunya cara grafik ini jujur adalah dua grafik dengan satuan yang
 * dinyatakan, masing-masing dengan tabel datanya sendiri. Keduanya membaca
 * `personalTrend` yang sama, jadi tidak ada angka baru dan cakupan tidak berubah.
 */
export interface TrendGroups {
  labels: string[];
  total: TrendSeries | null;
  parameters: TrendSeries[];
}

export function groupTrendSeries(data: AgentDetailData): TrendGroups {
  const { labels, series } = normalizeTrend(data);
  const total = series.find((item) => item.isTotal) ?? null;
  return {
    labels,
    total,
    parameters: series.filter((item) => !item.isTotal),
  };
}

/** Satuan yang dinyatakan di judul grafik dan sumbu Y. */
export const TREND_UNIT_LABEL = "Jumlah temuan";
/** Caption tabel data yang menyertai tiap grafik tren temuan. */
export const TREND_TOTAL_TABLE_CAPTION = "Data tren — Total Temuan per Periode";
export const TREND_PARAMETER_TABLE_CAPTION = "Data tren — Temuan per Parameter";

// ---------------------------------------------------------------------------
// Tren skor — sumbernya `periodSummaries`, bukan `personalTrend`
// ---------------------------------------------------------------------------

/** Metrik skor yang digambar; masing-masing jadi satu grafik + satu tabel. */
export type ScoreMetric = "final" | "nonCritical" | "critical";

/**
 * Satuan sumbu Y untuk semua grafik skor.
 *
 * Skor QA dihitung pada skala 0–100 (ambang `QA_TARGET` 95), jadi satuan
 * ditulis eksplisit: pembaca tidak boleh salah membaca angka skor sebagai
 * jumlah temuan, yang satuan dan rentangnya sama sekali berbeda.
 */
export const SCORE_UNIT_LABEL = "Skor (0-100)";

export const SCORE_FINAL_TABLE_CAPTION = "Data skor — Skor Final per Periode";
export const SCORE_NON_CRITICAL_TABLE_CAPTION =
  "Data skor — Skor Non-Critical (NC) per Periode";
export const SCORE_CRITICAL_TABLE_CAPTION =
  "Data skor — Skor Critical (CR) per Periode";
/** Kalimat untuk seksi skor yang tidak punya satu pun periode terskor. */
export const SCORE_EMPTY_NOTE =
  "Riwayat skor belum tersedia untuk konteks ini.";

/** Kontrak tiap metrik skor: judul, catatan, nama aksesibel, sumber angka. */
const SCORE_METRICS: ReadonlyArray<{
  metric: ScoreMetric;
  label: string;
  title: string;
  note: string;
  accessibleName: string;
  tableCaption: string;
}> = [
  {
    metric: "final",
    label: "Skor Final",
    title: "Skor Final per Periode",
    note: "Skor akhir tiap periode penilaian — angka yang sama dengan tabel Ringkasan Skor Bulanan, bukan jumlah temuan.",
    accessibleName: "Grafik tren skor final: skor akhir per periode",
    tableCaption: SCORE_FINAL_TABLE_CAPTION,
  },
  {
    metric: "nonCritical",
    label: "Skor Non-Critical (NC)",
    title: "Skor Non-Critical (NC) per Periode",
    note: "Skor kategori non-critical tiap periode. Digeser sebagai satu grafik supaya tidak pernah tercampur dengan skor critical pada satu trendline.",
    accessibleName:
      "Grafik tren skor non-critical: skor kategori non-critical per periode",
    tableCaption: SCORE_NON_CRITICAL_TABLE_CAPTION,
  },
  {
    metric: "critical",
    label: "Skor Critical (CR)",
    title: "Skor Critical (CR) per Periode",
    note: "Skor kategori critical tiap periode. Skor terendah biasanya yang paling menentukan skor akhir.",
    accessibleName:
      "Grafik tren skor critical: skor kategori critical per periode",
    tableCaption: SCORE_CRITICAL_TABLE_CAPTION,
  },
];

/** Satu grafik skor mandiri: satu metrik, satu sumbu, satu tabel. */
export interface ScoreTrendChart {
  metric: ScoreMetric;
  title: string;
  note: string;
  accessibleName: string;
  /** Caption tabel data milik grafik ini (bukan milik metrik lain). */
  tableCaption: string;
  series: TrendSeries;
}

export interface ScoreTrend {
  labels: string[];
  charts: ScoreTrendChart[];
}

function scoreValue(summary: AgentPeriodSummary, metric: ScoreMetric) {
  const value =
    metric === "final"
      ? summary.finalScore
      : metric === "nonCritical"
        ? summary.nonCriticalScore
        : summary.criticalScore;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `Jan 26` — bentuk label yang sama dengan label sumbu tren temuan. */
function scorePeriodLabel(month: number, year: number): string {
  const name = MONTHS_SHORT[Math.trunc(month) - 1] ?? String(month);
  return `${name} ${String(Math.trunc(year)).slice(-2)}`;
}

/**
 * Riwayat skor untuk seksi "Perkembangan Skor".
 *
 * Sumbernya `monthlySummaries` — ringkasan periode yang dihitung backend dan
 * sudah dipakai tabel "Ringkasan Skor Bulanan" — jadi angka grafik ini persis
 * angka tabel itu, untuk tahun dan layanan yang sama. `personalTrend` TIDAK
 * dipakai di sini: isinya jumlah temuan per periode, dan mengubahnya menjadi
 * "skor" akan mengarang metrik yang tidak pernah dihitung.
 *
 * Ringkasan di luar tahun laporan dibuang supaya sumbu X tidak pernah
 * mencampur dua tahun. Satu ringkasan per bulan untuk satu layanan: pilihan
 * layanan di UI selalu layanan nyata (`VALID_SERVICE_TYPES`), bukan "semua",
 * jadi tidak ada dua titik untuk bulan yang sama.
 */
export function buildScoreTrend(input: {
  monthlySummaries: AgentPeriodSummary[];
  selectedYear: number;
}): ScoreTrend {
  const periods = input.monthlySummaries
    .filter((summary) => summary.year === input.selectedYear)
    .slice()
    .sort((a, b) => a.year - b.year || a.month - b.month);
  if (periods.length === 0) return { labels: [], charts: [] };

  const labels = periods.map((period) =>
    scorePeriodLabel(period.month, period.year),
  );
  const charts = SCORE_METRICS.map((definition) => ({
    metric: definition.metric,
    title: definition.title,
    note: definition.note,
    accessibleName: definition.accessibleName,
    tableCaption: definition.tableCaption,
    series: {
      key: "score-" + definition.metric,
      label: definition.label,
      data: periods.map((period) => scoreValue(period, definition.metric)),
      // Skor tidak pernah jadi filter "Total Temuan": ia bukan jumlah temuan.
      isTotal: false,
      isSummary: true,
      emphasis: true,
      color: TREND_COLORS[0],
      dash: "",
    },
  }));

  return { labels, charts };
}

function buildLinePath(
  values: Array<number | null>,
  xFor: (index: number) => number,
  yFor: (value: number) => number,
): string {
  const commands: string[] = [];
  let segment: Array<{ x: number; y: number }> = [];
  const flush = () => {
    if (segment.length === 1) {
      commands.push(
        `M${segment[0].x.toFixed(2)} ${segment[0].y.toFixed(2)} L${segment[0].x.toFixed(2)} ${segment[0].y.toFixed(2)}`,
      );
    }
    if (segment.length > 1) {
      commands.push(`M${segment[0].x.toFixed(2)} ${segment[0].y.toFixed(2)}`);
      for (let index = 1; index < segment.length; index += 1) {
        const previous = segment[index - 1];
        const current = segment[index];
        const midpoint = (previous.x + current.x) / 2;
        commands.push(
          `Q${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midpoint.toFixed(2)} ${((previous.y + current.y) / 2).toFixed(2)}`,
        );
        commands.push(`T${current.x.toFixed(2)} ${current.y.toFixed(2)}`);
      }
    }
    segment = [];
  };
  values.forEach((value, index) => {
    if (value === null) {
      flush();
      return;
    }
    segment.push({ x: xFor(index), y: yFor(value) });
  });
  flush();
  return commands.join(" ");
}

/**
 * Luas di bawah garis, dipecah pada celah `null` supaya satu periode tanpa
 * data tidak pernah disambung ke periode berikutnya.
 */
function buildAreaPath(
  values: Array<number | null>,
  xFor: (index: number) => number,
  yFor: (value: number) => number,
  baseline: number,
): string {
  const segments: string[] = [];
  let points: Array<{ x: number; y: number }> = [];
  const flush = () => {
    if (points.length >= 2) {
      const line = points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
        )
        .join(" ");
      const first = points[0];
      const last = points[points.length - 1];
      segments.push(
        `${line} L${last.x.toFixed(2)} ${baseline.toFixed(2)} L${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`,
      );
    }
    points = [];
  };
  values.forEach((value, index) => {
    if (value === null) {
      flush();
      return;
    }
    points.push({ x: xFor(index), y: yFor(value) });
  });
  flush();
  return segments.join(" ");
}

// ---------------------------------------------------------------------------
// Potongan dokumen
// ---------------------------------------------------------------------------

/**
 * Panel laporan, berurutan seperti dokumen yang dibaca.
 *
 * `trend` dan `temuanTren` sengaja dua panel, bukan satu: yang pertama
 * mengukur skor (`periodSummaries`), yang kedua mengukur jumlah temuan
 * (`personalTrend`). Menggabungkannya membuat judul "Perkembangan Skor"
 * memuat grafik yang bukan skor.
 */
type ReportPanel = "summary" | "trend" | "temuanTren" | "temuan";

function panelAttributes(
  variant: AgentHtmlVariant,
  panel: ReportPanel,
  section: string,
  hidden: boolean,
): string {
  const parts = [
    'class="panel"',
    'id="report-panel-' + panel + '"',
    'data-report-panel="' + panel + '"',
    'data-report-section="' + section + '"',
  ];
  if (variant === "interactive") {
    parts.push('role="tabpanel"', 'aria-labelledby="report-tab-' + panel + '"');
  } else {
    parts.push('aria-labelledby="report-panel-' + panel + '-title"');
  }
  if (hidden) parts.push("hidden");
  return parts.join(" ");
}

/**
 * Judul panel. Id-nya selalu `report-panel-<panel>-title` — TIDAK pernah memakai
 * id tab, karena di varian interaktif tab memakai `report-tab-<panel>` pada
 * elemen yang sama dan dua elemen berkolom id yang sama akan merusak
 * resolusi `aria-labelledby`.
 */
function panelHeading(
  variant: AgentHtmlVariant,
  panel: ReportPanel,
  title: string,
): string {
  void variant;
  return `<h2 class="panel-title" id="report-panel-${panel}-title">${escHtml(title)}</h2>`;
}

function sectionHeading(id: string, title: string): string {
  return `<h3 class="section-title" id="${id}">${escHtml(title)}</h3>`;
}

function scopeLine(label: string): string {
  return label ? `<p class="section-scope">${escHtml(label)}</p>` : "";
}

function buildMasthead(input: AgentReportHtmlInput, masaKerja: string): string {
  const peserta = input.data.peserta;
  const initial = (peserta.nama.trim().charAt(0) || "?").toUpperCase();
  const meta: Array<[string, string]> = [
    ["Tim", peserta.tim],
    ["Batch", peserta.batch_name],
    ["Jabatan", peserta.jabatan || "Agent"],
    ["Masa kerja", masaKerja],
    ["Tahun audit", yearText(input.selectedYear)],
    [
      "Layanan audit",
      input.selectedService ? input.selectedService.toUpperCase() : "—",
    ],
  ];
  return [
    '<header class="masthead">',
    '<div class="masthead-id">',
    // Inisial, bukan `<img>`: dokumen offline tidak pernah menarik aset remote.
    '<span class="masthead-initial" aria-hidden="true">' +
      escHtml(initial) +
      "</span>",
    '<div class="masthead-text">',
    '<h1 class="masthead-name">' + escHtml(peserta.nama) + "</h1>",
    '<p class="masthead-context">Tahun ' +
      yearText(input.selectedYear) +
      " &bull; Layanan " +
      escHtml(input.selectedService.toUpperCase()) +
      "</p>",
    "</div>",
    "</div>",
    '<dl class="masthead-meta">',
    ...meta.map(
      ([term, value]) =>
        '<div class="meta-item"><dt>' +
        escHtml(term) +
        "</dt><dd>" +
        escHtml(value) +
        "</dd></div>",
    ),
    "</dl>",
    "</header>",
  ].join("");
}

function buildStandingHtml(
  quickview: SidakAgentQuickviewResponse | null | undefined,
  selectedYear: number,
  selectedService: string,
  variant: AgentHtmlVariant,
): string {
  if (!quickview) return "";
  const open = variant === "static" ? " open" : "";
  const sameScope =
    quickview.combinedTeam?.scopeId != null &&
    quickview.combinedTeam.scopeId === quickview.leaderTeam?.scopeId;

  const rankItem = (
    label: string,
    metric: SidakAgentQuickviewResponse["combinedTeam"],
    sameAsCombined = false,
  ): string => {
    const hasRank = metric?.rank != null;
    const supporting = !metric
      ? "Peringkat belum tersedia"
      : sameAsCombined
        ? "Cakupan sama dengan Tim Gabungan"
        : hasRank
          ? metric.scopeLabel
          : finiteNumber(metric.total) > 0
            ? "Belum masuk peringkat pada cakupan ini"
            : "Belum ada agen pembanding";
    const peers = metric?.tiedAgents ?? null;
    const tie =
      peers && peers.length > 0 && hasRank
        ? `<details class="disclosure quickview-ties"${open}><summary>Berbagi peringkat ${numberText(metric?.rank)} dengan ${escHtml(peers[0].nama)}${
            peers.length === 2
              ? " dan " + escHtml(peers[1].nama)
              : " dan " + (peers.length - 1) + " agen lain"
          }</summary><ul class="tie-list">${peers
            .map((peer) => `<li>${escHtml(peer.nama)}</li>`)
            .join("")}</ul></details>`
        : "";
    return [
      '<div class="standing-item">',
      "<dt>" + escHtml(label) + "</dt>",
      "<dd>" +
        (hasRank
          ? "#" +
            numberText(metric?.rank) +
            " dari " +
            numberText(metric?.total)
          : "—") +
        "</dd>",
      "<small>" + escHtml(supporting) + "</small>",
      tie,
      "</div>",
    ].join("");
  };

  const completeRanking =
    quickview.combinedTeam?.rank != null && quickview.leaderTeam?.rank != null;
  const forecast = quickview.forecast;

  return [
    '<div class="section">',
    sectionHeading("sec-standing", "Posisi Performa"),
    scopeLine(
      "Tahun " +
        yearText(selectedYear) +
        " • Layanan " +
        selectedService.toUpperCase(),
    ),
    '<dl class="standing" aria-label="Peringkat performa agent">',
    rankItem("Tim Gabungan", quickview.combinedTeam),
    rankItem("Tim Leader", quickview.leaderTeam, sameScope),
    '<div class="standing-item">',
    "<dt>Forecast 3 bulan</dt>",
    "<dd>" + escHtml(forecast?.label ?? "—") + "</dd>",
    "<small>" +
      escHtml(forecast?.supportingText ?? "Forecast belum tersedia") +
      "</small>",
    "</div>",
    completeRanking
      ? '<p class="standing-note">Semakin tinggi peringkat, semakin sedikit temuan YTD. Peringkat terakhir menunjukkan jumlah temuan terbanyak. Jumlah yang sama mendapat peringkat yang sama.</p>'
      : "",
    "</dl>",
    "</div>",
  ].join("");
}

function buildActiveScoreHtml(
  input: AgentReportHtmlInput,
  activeMonth: number | null,
): string {
  const summaries = input.monthlySummaries;
  if (summaries.length === 0) return "";
  const latest =
    (activeMonth
      ? summaries.find((summary) => summary.month === activeMonth)
      : null) ?? summaries[summaries.length - 1];
  const index = summaries.findIndex((summary) => summary.id === latest.id);
  const previous = index > 0 ? summaries[index - 1] : null;
  const delta = previous ? latest.finalScore - previous.finalScore : null;
  const safeScore = finiteNumber(latest.finalScore, 0, 0, 100);
  const safeMonth = Math.trunc(finiteNumber(latest.month, 1, 1, 12));
  const periodLabel =
    (MONTHS_FULL[safeMonth - 1]?.slice(0, 3) ?? "") +
    " " +
    numberText(latest.year);
  const deltaText =
    delta === null
      ? "—"
      : (delta > 0 ? "+" : "") + finiteNumber(delta).toFixed(1) + "%";
  const deltaClass = deltaTone(delta);

  return [
    '<div class="section">',
    sectionHeading("sec-active-score", "Skor Periode Aktif"),
    scopeLine(
      monthScopeLabel(input.selectedService, input.selectedYear, activeMonth),
    ),
    '<div class="score-block">',
    '<div class="score-figure">',
    '<p class="score-period">' + escHtml(periodLabel) + "</p>",
    '<p class="score-value">' + safeScore.toFixed(1) + "<span>%</span></p>",
    '<p class="score-status tone-' +
      scoreTone(latest.finalScore) +
      '">' +
      escHtml(scoreLabel(latest.finalScore)) +
      "</p>",
    '<div class="score-meter" role="img" aria-label="Skor ' +
      safeScore.toFixed(1) +
      " persen pada " +
      escHtml(periodLabel) +
      '"><span style="width:' +
      safeScore +
      '%"></span></div>',
    "</div>",
    '<dl class="score-stats">',
    "<div><dt>Sesi</dt><dd>" + numberText(latest.sessionCount) + "</dd></div>",
    "<div><dt>Temuan</dt><dd>" +
      numberText(latest.findingsCount) +
      "</dd></div>",
    '<div><dt>Selisih periode sebelumnya</dt><dd class="tone-' +
      deltaClass +
      '">' +
      deltaText +
      "</dd></div>",
    "</dl>",
    "</div>",
    "</div>",
  ].join("");
}

function buildMonthlyTableHtml(input: AgentReportHtmlInput): string {
  if (input.monthlySummaries.length === 0) return "";
  const rows = input.monthlySummaries
    .map((summary) => {
      const score = finiteNumber(summary.finalScore);
      const belowTarget = score < QA_TARGET;
      return [
        "<tr>",
        '<th scope="row">' + escHtml(summary.label) + "</th>",
        '<td class="num">' + numberText(summary.finalScore) + "</td>",
        '<td class="num">' + numberText(summary.nonCriticalScore) + "</td>",
        '<td class="num">' + numberText(summary.criticalScore) + "</td>",
        '<td class="num">' + numberText(summary.sessionCount) + "</td>",
        '<td class="num">' + numberText(summary.findingsCount) + "</td>",
        "<td>" +
          (belowTarget
            ? '<span class="tone-warn">Di bawah target ' +
              QA_TARGET +
              "%</span>"
            : '<span class="tone-ok">Sesuai target ' + QA_TARGET + "%</span>") +
          "</td>",
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    '<div class="section">',
    // Cakupan ditulis sebelum judul tabel, sama seperti baris `// Cakupan:` pada CSV.
    scopeLine(yearServiceScopeLabel(input.selectedService, input.selectedYear)),
    '<div class="table-scroll">',
    "<table>",
    "<caption>Ringkasan Skor Bulanan</caption>",
    '<thead><tr><th scope="col">Bulan</th><th scope="col" class="num">Skor Final</th><th scope="col" class="num">NC Score</th><th scope="col" class="num">CR Score</th><th scope="col" class="num">Sesi</th><th scope="col" class="num">Temuan</th><th scope="col">Status QA</th></tr></thead>',
    "<tbody>" + rows + "</tbody>",
    "</table>",
    "</div>",
    "</div>",
    "</div>",
  ].join("");
}

function buildTicketsTableHtml(
  input: AgentReportHtmlInput,
  activeMonth: number | null,
): string {
  const rows = input.topTickets
    .map((ticket, position) =>
      [
        "<tr>",
        '<td class="num">' + (position + 1) + "</td>",
        '<th scope="row" class="ticket-code ticket-code-cell">' +
          escHtml(ticket.no_tiket) +
          "</th>",
        "<td>" + escHtml(ticket.heaviestParam) + "</td>",
        '<td class="num">' +
          finiteNumber(ticket.scoreDeduction).toFixed(1) +
          "</td>",
        '<td class="num">' + numberText(ticket.findingCount) + "</td>",
        "</tr>",
      ].join(""),
    )
    .join("");

  return [
    '<div class="section">',
    scopeLine(
      monthScopeLabel(input.selectedService, input.selectedYear, activeMonth),
    ),
    input.topTickets.length === 0
      ? '<p class="empty-state">Tidak ada tiket yang menurunkan skor pada cakupan ini.</p>'
      : [
          '<div class="table-scroll">',
          "<table>",
          "<caption>Tiket Pengurang Skor Terbesar</caption>",
          '<thead><tr><th scope="col" class="num">#</th><th scope="col">No Tiket</th><th scope="col">Parameter Terberat</th><th scope="col" class="num">Score Deduction</th><th scope="col" class="num">Jumlah Temuan</th></tr></thead>',
          "<tbody>" + rows + "</tbody>",
          "</table>",
          "</div>",
        ].join(""),
    "</div>",
  ].join("");
}

function buildRootCausesHtml(
  input: AgentReportHtmlInput,
  activeMonth: number | null,
): string {
  const variant = input.variant;
  const open = variant === "static" ? " open" : "";
  const items = input.activeRootCauses
    .map((cause) => {
      const critical = finiteNumber(cause.criticalFindingsCount);
      const keyword = cause.matchedKeywords?.[0]
        ? "Keyword: " + cause.matchedKeywords[0]
        : "";
      const references = cause.ticketReferences ?? [];
      return [
        '<div class="cause">',
        '<div class="cause-head">',
        '<p class="cause-label">' + escHtml(cause.label) + "</p>",
        '<p class="cause-facts"><span>' +
          numberText(cause.findingsCount) +
          " temuan</span>",
        "<span>" + numberText(cause.affectedTickets) + " tiket</span>",
        critical > 0
          ? '<span class="tone-bad">' +
            numberText(critical) +
            " critical</span>"
          : "",
        "</p>",
        "</div>",
        keyword ? '<p class="cause-caption">' + escHtml(keyword) + "</p>" : "",
        '<p class="cause-recommendation">' +
          escHtml(cause.recommendation) +
          "</p>",
        references.length > 0
          ? [
              '<div class="cause-refs">',
              '<details class="disclosure"' + open + ">",
              "<summary>Tiket terkait (" +
                numberText(references.length) +
                ")</summary>",
              '<ul class="evidence-list">',
              ...references.map(
                (reference) =>
                  "<li>" +
                  [
                    escHtml(reference.no_tiket),
                    escHtml(reference.periodLabel),
                    numberText(reference.findingsCount) + " temuan",
                    reference.criticalFindingsCount > 0
                      ? '<span class="tone-bad">' +
                        numberText(reference.criticalFindingsCount) +
                        " critical</span>"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") +
                  "</li>",
              ),
              "</ul>",
              "</details>",
              "</div>",
            ].join("")
          : "",
        "</div>",
      ].join("");
    })
    .join("");

  return [
    '<div class="section">',
    sectionHeading("sec-root-causes", "Akar Masalah"),
    scopeLine(
      yearToDateScopeLabel(
        input.selectedService,
        input.selectedYear,
        activeMonth,
      ),
    ),
    items === ""
      ? '<p class="empty-state">Belum ditemukan pola akar masalah yang dominan pada cakupan ini.</p>'
      : items,
    "</div>",
  ].join("");
}

function buildComparisonTableHtml(input: AgentReportHtmlInput): string {
  const table = input.data.comparisonTable;
  if (!table || table.rows.length === 0) return "";
  const scope = comparisonScopeLine(input.data);
  const rows = table.rows
    .map((row) => {
      const teamDelta = comparisonDelta(row.agentCount, row.teamAverage);
      const serviceDelta = comparisonDelta(row.agentCount, row.serviceAverage);
      const totalClass = row.key === "total" ? ' class="total-row"' : "";
      return [
        "<tr" + totalClass + ">",
        '<th scope="row">' + escHtml(row.label) + "</th>",
        '<td class="num">' + numberText(row.agentCount) + "</td>",
        '<td class="num">' + finiteNumber(row.teamAverage).toFixed(1) + "</td>",
        '<td class="num">' +
          finiteNumber(row.serviceAverage).toFixed(1) +
          "</td>",
        '<td class="num tone-' +
          deltaTone(teamDelta) +
          '">' +
          formatDelta(teamDelta) +
          "</td>",
        '<td class="num tone-' +
          deltaTone(serviceDelta) +
          '">' +
          formatDelta(serviceDelta) +
          "</td>",
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    '<div class="section">',
    scopeLine(scope.text + (scope.peerText ? " • " + scope.peerText : "")),
    // Satu-satunya tabel yang kolomnya melting di 390px: lima parameter
    // perbandingan tidak muat, jadi ia punya petunjuk gulir sendiri.
    '<p class="table-hint">Geser tabel ke samping untuk melihat seluruh kolom.</p>',
    '<div class="table-scroll">',
    "<table>",
    "<caption>Perbandingan Temuan</caption>",
    '<thead><tr><th scope="col">Parameter</th><th scope="col" class="num">Agen Ini</th><th scope="col" class="num">Rata-rata Tim</th><th scope="col" class="num">Rata-rata Service</th><th scope="col" class="num">% vs Tim</th><th scope="col" class="num">% vs Service</th></tr></thead>',
    "<tbody>" + rows + "</tbody>",
    "</table>",
    "</div>",
    "</div>",
  ].join("");
}

/**
 * Langkah sumbu "bulat" (1/2/5/10/…) sehingga label sumbu tidak pernah
 * memotong sebagian besar tinggi plot.
 */
function niceScale(max: number): { step: number } {
  const safe = Math.max(1, max);
  for (const step of [
    1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000,
  ]) {
    if (Math.ceil(safe / step) <= 5) return { step };
  }
  return { step: Math.ceil(safe / 5 / 1000) * 1000 };
}

function comparisonDelta(agentCount: number, average: number): number | null {
  const safeAgent = finiteNumber(agentCount);
  const safeAverage = finiteNumber(average);
  if (safeAverage === 0) return safeAgent === 0 ? 0 : null;
  return finiteNumber(((safeAgent - safeAverage) / safeAverage) * 100);
}

function formatDelta(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(finiteNumber(value) * 10) / 10;
  if (rounded === 0) return "0%";
  const sign = rounded > 0 ? "+" : "-";
  return (
    sign +
    new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(
      Math.abs(rounded),
    ) +
    "%"
  );
}

/**
 * Satu grafik tren mandiri untuk PDF maupun HTML statis.
 *
 * Setiap grafik punya judul, satuan sumbu Y, label periode pada sumbu X, nilai
 * di atas tiap titik, dan legenda yang menempel di bawah plot. Nilai di atas
 * titik membuat grafik terbaca tanpa harus mengukur garis dengan mata, dan
 * karena masih berupa `<text>`, nilainya tetap bisa dicari di dokumen.
 */
interface TrendChartSpec {
  /** Judul yang dilihat pembaca: metrik + satuan, bukan "Grafik". */
  title: string;
  /** Satu kalimat yang menjelaskan apa yang diukur grafik ini. */
  note: string;
  /** Nama yang bisa dianounce pembaca layar. */
  accessibleName: string;
  /** Satuan sumbu Y, ditulis di atas plot ("Jumlah temuan" / "Skor (0-100)"). */
  unit: string;
  /** Kunci figure untuk filter seri varian interaktif. */
  figure: string;
  series: TrendSeries[];
  labels: string[];
}

const CHART_WIDTH = 960;
const CHART_HEIGHT = 320;
/** Ruang kiri untuk angka sumbu Y + label satuan. */
const CHART_PLOT_LEFT = 64;
/** Ruang kanan supaya label periode terakhir tidak menyentuh tepi. */
const CHART_PLOT_RIGHT = 28;
/** Ruang atas untuk label satuan. */
const CHART_PLOT_TOP = 34;
/** Ruang bawah untuk label periode. */
const CHART_PLOT_BOTTOM = 44;

function trendChartGeometry(labels: readonly string[], series: TrendSeries[]) {
  const plotWidth = CHART_WIDTH - CHART_PLOT_LEFT - CHART_PLOT_RIGHT;
  const plotHeight = CHART_HEIGHT - CHART_PLOT_TOP - CHART_PLOT_BOTTOM;
  const values = series.flatMap((item) =>
    item.data.filter((value): value is number => value !== null),
  );
  // Skala "bulat": tanpa ini nilai maximum 1 akan digambar di 20% tinggi plot
  // saja, dan garis tren tampak datar tanpa alasan.
  const { step: tickStep } = niceScale(Math.max(1, ...values));
  const tickMax =
    tickStep * Math.max(1, Math.ceil(Math.max(1, ...values) / tickStep));
  return {
    plotWidth,
    plotHeight,
    tickStep,
    tickMax,
    xFor: (index: number) =>
      labels.length === 1
        ? CHART_PLOT_LEFT + plotWidth / 2
        : CHART_PLOT_LEFT + (index / (labels.length - 1)) * plotWidth,
    yFor: (value: number) =>
      CHART_PLOT_TOP + plotHeight - (value / tickMax) * plotHeight,
  };
}

function trendAxisText(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(
    value,
  );
}

function buildTrendChartSvg(spec: TrendChartSpec): string {
  const { labels, series } = spec;
  const { plotWidth, plotHeight, tickStep, tickMax, xFor, yFor } =
    trendChartGeometry(labels, series);

  // Garis kisi hanya digambar sampai nilai tertinggi sumbu. Tanpa ini, langkah
  // sumbu yang kecil membuat garis ke-3 dan seterusnya digambar di luar area
  // plot (terklip atau terpotong).
  const gridCount = Math.max(1, Math.round(tickMax / tickStep));
  const grid = Array.from({ length: gridCount + 1 }, (_, index) => {
    const value = tickStep * index;
    const y = yFor(value);
    return (
      `<line x1="${CHART_PLOT_LEFT}" y1="${y.toFixed(2)}" x2="${
        CHART_WIDTH - CHART_PLOT_RIGHT
      }" y2="${y.toFixed(2)}" class="chart-grid" />` +
      `<text x="${CHART_PLOT_LEFT - 10}" y="${(y + 4).toFixed(
        2,
      )}" class="chart-axis-label" text-anchor="end">${escHtml(
        trendAxisText(value),
      )}</text>`
    );
  }).join("");

  // Label periode: tepi kiri/dengan rata kiri dan tepi kanan rata kanan supaya
  // tidak pernah melewati batas viewBox.
  const xLabels = labels
    .map((label, index) => {
      const anchor =
        index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle";
      return `<text x="${xFor(index).toFixed(2)}" y="${
        CHART_HEIGHT - 16
      }" class="chart-axis-label" text-anchor="${anchor}">${escHtml(
        label,
      )}</text>`;
    })
    .join("");

  const spacing =
    labels.length > 1 ? plotWidth / (labels.length - 1) : plotWidth;
  // Label nilai hanya digambar kalau jaraknya cukup lega; kalau tidak, angka-
  // angka itu saling tumpang tindih dan membuat grafik makin sulit dibaca.
  const showValues = spacing >= 26;
  const chartSeries = series
    .map((item) => {
      const line = buildLinePath(item.data, xFor, yFor);
      const area = buildAreaPath(
        item.data,
        xFor,
        yFor,
        CHART_PLOT_TOP + plotHeight,
      );
      const points = item.data
        .map((value, index) => {
          if (value === null) return "";
          const x = xFor(index);
          const y = yFor(value);
          // Nilai di puncak plot digambar di BAWAH titik supaya tidak menabrak
          // label satuan di atas area plot.
          const valueY = showValues
            ? y <= CHART_PLOT_TOP + 4
              ? y + 16
              : y - 9
            : null;
          return (
            `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="#ffffff" stroke="${item.color}" stroke-width="2"><title>${escHtml(
              item.label,
            )} · ${escHtml(labels[index])}: ${escHtml(String(value))}</title></circle>` +
            (valueY === null
              ? ""
              : `<text x="${x.toFixed(2)}" y="${valueY.toFixed(
                  2,
                )}" class="chart-value" text-anchor="middle">${escHtml(
                  trendAxisText(value),
                )}</text>`)
          );
        })
        .join("");
      return [
        `<g data-chart-series data-series="${escHtml(item.label)}" data-series-key="${escHtml(item.key)}" data-series-total="${item.isTotal}" data-series-summary="${item.isSummary}">`,
        area && !item.emphasis
          ? `<path d="${area}" fill="${item.color}" fill-opacity="0.06" stroke="none" />`
          : "",
        line
          ? `<path d="${line}" fill="none" stroke="${item.color}" stroke-width="${item.emphasis ? 3 : 2}"${item.dash ? ` stroke-dasharray="${item.dash}"` : ""} stroke-linecap="round" stroke-linejoin="round" />`
          : "",
        points,
        "</g>",
      ].join("");
    })
    .join("");

  return [
    `<svg class="trend-chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="${escHtml(
      spec.accessibleName,
    )}">`,
    `<title>${escHtml(spec.title)}</title>`,
    // Satuan yang dinyatakan di atas sumbu Y: tanpa ini pembaca hanya tahu
    // "angka", bukan apa yang diukur. Rata-kiri di x=0, bukan rata-kanan di
    // gutter sumbu: label satuan lebih lebar dari gutter itu, jadi rata-kanan
    // akan mendorongnya keluar dari viewBox dan memotong sebagian teksnya.
    `<text x="0" y="16" class="chart-unit">${escHtml(spec.unit)}</text>`,
    grid,
    xLabels,
    chartSeries,
    "</svg>",
  ].join("");
}

/** Legenda melekat di bawah plot; seri total dan rincian tidak pernah dicampur. */
function buildChartLegend(series: TrendSeries[]): string {
  return series
    .map(
      (item) =>
        '<span class="chart-legend-item" data-chart-series data-series="' +
        escHtml(item.label) +
        '" data-series-key="' +
        escHtml(item.key) +
        '" data-series-total="' +
        item.isTotal +
        '" data-series-summary="' +
        item.isSummary +
        '"><span class="legend-swatch" style="background:' +
        escHtml(item.color) +
        (item.dash
          ? `;background-image:repeating-linear-gradient(90deg,${escHtml(item.color)} 0 4px,transparent 4px 7px)`
          : "") +
        '"></span>' +
        escHtml(item.label) +
        "</span>",
    )
    .join("");
}

/**
 * Tabel data lengkap milik satu grafik: satu baris per periode, satu kolom per
 * seri, dan nilai `null` ditulis sebagai "—" supaya pembaca bisa membedakan
 * "tidak ada data" dari "nol".
 */
function buildTrendDataTableHtml(
  labels: readonly string[],
  series: TrendSeries[],
  caption: string,
): string {
  return [
    '<div class="table-scroll trend-table">',
    "<table>",
    `<caption>${escHtml(caption)}</caption>`,
    '<thead><tr><th scope="col">Periode</th>' +
      series
        .map(
          (item) =>
            '<th scope="col" class="num">' + escHtml(item.label) + "</th>",
        )
        .join("") +
      "</tr></thead>",
    "<tbody>" +
      labels
        .map(
          (label, index) =>
            '<tr><th scope="row">' +
            escHtml(label) +
            "</th>" +
            series
              .map(
                (item) =>
                  '<td class="num">' +
                  (item.data[index] === null
                    ? "—"
                    : numberText(item.data[index])) +
                  "</td>",
              )
              .join("") +
            "</tr>",
        )
        .join("") +
      "</tbody>",
    "</table>",
    "</div>",
  ].join("");
}

function buildTrendGroupHtml(
  spec: TrendChartSpec & { caption: string; tableCaption: string },
): string {
  const { labels, series } = spec;
  return [
    // `data-chart-figure` dipakai filter seri varian interaktif: grafik yang
    // tidak punya seri terpilih disembunyikan, dan `@media print` membukanya
    // kembali.
    `<figure class="trend-figure" data-chart-figure="${escHtml(spec.figure)}">`,
    `<h4 class="chart-title">${escHtml(spec.title)}</h4>`,
    '<p class="chart-note">' + escHtml(spec.note) + "</p>",
    buildTrendChartSvg(spec),
    '<div class="chart-legend">' + buildChartLegend(series) + "</div>",
    '<figcaption class="trend-caption">Grafik menampilkan ' +
      labels.length +
      " periode dan " +
      series.length +
      " seri data. Nilai lengkapnya ada pada tabel " +
      escHtml(spec.caption) +
      ".</figcaption>",
    "</figure>",
    buildTrendDataTableHtml(labels, series, spec.tableCaption),
  ].join("");
}

/**
 * Seksi "Perkembangan Skor" — skor yang benar-benar dihitung backend.
 *
 * Tiga metrik (final, non-critical, critical) masing-masing satu grafik dengan
 * tabelnya sendiri: menggabungkannya menjadi satu trendline membuat pembaca
 * salah membandingkan tiga satuan yang memang sama-sama poin, tetapi sumbernya
 * berbeda. Angka grafik = angka `monthlySummaries` apa adanya.
 */
function buildScorePanelHtml(input: AgentReportHtmlInput): string {
  const { labels, charts } = buildScoreTrend({
    monthlySummaries: input.monthlySummaries,
    selectedYear: input.selectedYear,
  });

  if (labels.length === 0) {
    return [
      '<div class="section">',
      scopeLine(
        yearServiceScopeLabel(input.selectedService, input.selectedYear),
      ),
      `<p class="empty-state">${escHtml(SCORE_EMPTY_NOTE)}</p>`,
      "</div>",
    ].join("");
  }

  return [
    '<div class="section">',
    scopeLine(
      trendScopeLabel(input.selectedService, input.selectedYear, labels),
    ),
    '<p class="section-note">Perkembangan Skor &bull; ' +
      escHtml(labels[0] + " - " + labels[labels.length - 1]) +
      ". Skor akhir, non-critical, dan critical digambar terpisah karena ketiganya sumber hitungannya berbeda; angkanya sama persis dengan tabel Ringkasan Skor Bulanan di seksi Ringkasan.</p>",
    ...charts.map((chart) =>
      buildTrendGroupHtml({
        title: chart.title,
        note: chart.note,
        accessibleName: chart.accessibleName,
        unit: SCORE_UNIT_LABEL,
        figure: "score-" + chart.metric,
        series: [chart.series],
        labels,
        caption: chart.tableCaption,
        tableCaption: chart.tableCaption,
      }),
    ),
    '<dl class="trend-foot">',
    '<div><dt>Periode Terskor</dt><dd><span class="trend-periods">' +
      labels.length +
      "</span> periode penilaian</dd></div>",
    "<div><dt>Cara Membaca</dt><dd>Skor final dipengaruhi temuan critical dan non-critical sekaligus; dua grafik kategori membuat selisihnya terlihat tanpa menebak.</dd></div>",
    "</dl>",
    "</div>",
  ].join("");
}

/**
 * Seksi "Tren Temuan" — jumlah temuan per periode dari `personalTrend`.
 *
 * Dipisah dari seksi skor karena satuan dan maknanya berbeda: ini hitungan
 * temuan, bukan skor. `Total Temuan` (agregat) dan rincian per parameter
 * (komponen) tetap dua grafik, masing-masing dengan tabelnya sendiri, dan tabel
 * perbandingan temuan ikut di sini karena isinya juga hitungan temuan.
 */
function buildFindingsTrendPanelHtml(input: AgentReportHtmlInput): string {
  const variant = input.variant;
  const { labels, total, parameters } = groupTrendSeries(input.data);
  const comparisonHtml = buildComparisonTableHtml(input);
  const scope = trendScopeLabel(
    input.selectedService,
    input.selectedYear,
    labels,
  );

  if (labels.length === 0 || (total === null && parameters.length === 0)) {
    return [
      '<div class="section">',
      scopeLine(
        yearServiceScopeLabel(input.selectedService, input.selectedYear),
      ),
      '<p class="empty-state">Data tren belum tersedia untuk konteks ini.</p>',
      comparisonHtml,
      "</div>",
    ].join("");
  }

  // Filter seri hanya ada di varian interaktif: di statis ia tidak bisa dipakai.
  // Hanya keluarga jumlah temuan yang punya filter — tiap grafik skor punya
  // satu seri, jadi tidak ada yang bisa disaring.
  const filters =
    variant === "interactive"
      ? [
          '<div class="trend-filters" role="group" aria-label="Filter seri grafik">',
          '<button type="button" class="trend-filter" data-trend-filter="summary" aria-pressed="true">Ringkasan</button>',
          ...(total
            ? [
                '<button type="button" class="trend-filter" data-trend-filter="total" aria-pressed="false"><span class="legend-swatch" style="background:' +
                  escHtml(total.color) +
                  '"></span>' +
                  escHtml(total.label) +
                  "</button>",
              ]
            : []),
          ...parameters.map(
            (item) =>
              '<button type="button" class="trend-filter" data-trend-filter="' +
              escHtml(item.key) +
              '" aria-pressed="false"><span class="legend-swatch" style="background:' +
              escHtml(item.color) +
              '"></span>' +
              escHtml(item.label) +
              "</button>",
          ),
          "</div>",
        ].join("")
      : "";

  const groups = [
    total
      ? buildTrendGroupHtml({
          title: "Jumlah Total Temuan per Periode",
          note: "Agregat seluruh temuan pada cakupan ini, satu titik per periode.",
          accessibleName:
            "Grafik tren total temuan: jumlah seluruh temuan per periode",
          unit: TREND_UNIT_LABEL,
          figure: "total",
          series: [total],
          labels,
          caption: TREND_TOTAL_TABLE_CAPTION,
          tableCaption: TREND_TOTAL_TABLE_CAPTION,
        })
      : "",
    parameters.length > 0
      ? buildTrendGroupHtml({
          title: "Jumlah Temuan per Parameter",
          note:
            "Satu seri per parameter penilaian. Semua seri memakai satuan yang sama (" +
            TREND_UNIT_LABEL.toLowerCase() +
            " per periode), jadi boleh dibaca sebagai pembanding langsung.",
          accessibleName:
            "Grafik tren temuan per parameter: jumlah temuan tiap parameter per periode",
          unit: TREND_UNIT_LABEL,
          figure: "parameter",
          series: parameters,
          labels,
          caption: TREND_PARAMETER_TABLE_CAPTION,
          tableCaption: TREND_PARAMETER_TABLE_CAPTION,
        })
      : "",
  ].join("");

  return [
    '<div class="section">',
    scopeLine(scope),
    '<p class="section-note">Tren Kinerja' +
      (labels.length > 0
        ? " &bull; " + escHtml(labels[0] + " - " + labels[labels.length - 1])
        : "") +
      ". Pantau tren temuan agen setiap periode penilaian pada tahun yang dipilih. Grafik di bawah menghitung JUMLAH TEMUAN, bukan skor — skor ada di seksi Perkembangan Skor. Total temuan dan rincian per parameter memakai satuan yang sama tetapi berbeda makna, jadi keduanya digambar pada grafik terpisah.</p>",
    filters,
    groups,
    '<dl class="trend-foot">',
    '<div><dt>Total Periode</dt><dd><span class="trend-periods">' +
      labels.length +
      "</span> periode aktif</dd></div>",
    "<div><dt>Ringkasan Tren</dt><dd>Gunakan pola naik-turun setiap parameter pada grafik rincian untuk menentukan fokus coaching pada periode berikutnya.</dd></div>",
    "</dl>",
    comparisonHtml,
    "</div>",
  ].join("");
}

function buildFindingsPanelHtml(input: AgentReportHtmlInput): string {
  const variant = input.variant;
  const open = variant === "static" ? " open" : "";
  const items = input.temuanDisplayItems;
  if (items.length === 0) {
    return [
      '<div class="section">',
      scopeLine(
        yearServiceScopeLabel(input.selectedService, input.selectedYear),
      ),
      '<p class="empty-state">Tidak ada temuan untuk cakupan ini.</p>',
      "</div>",
    ].join("");
  }

  const grouped = new Map<string, TemuanDisplayItemExport[]>();
  items.forEach((item) => {
    const key = item.year + "-" + String(item.month).padStart(2, "0");
    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  });

  const periods = Array.from(grouped.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, monthItems]) => {
      const first = monthItems[0];
      const tickets = new Map<
        string,
        { label: string; items: TemuanDisplayItemExport[] }
      >();
      monthItems.forEach((item) => {
        const raw = (item.no_tiket ?? "").trim();
        const key = raw ? raw.toUpperCase() : "audit-" + item.id;
        const ticket = tickets.get(key) ?? {
          label: raw ? raw.toUpperCase() : "AUDIT INTERNAL",
          items: [],
        };
        ticket.items.push(item);
        tickets.set(key, ticket);
      });

      const ticketBlocks = Array.from(tickets.values())
        .map((ticket) =>
          [
            '<div class="finding-ticket">',
            // Label, nomor, lalu jumlah parameter: identifier dibaca lebih dulu
            // dan tidak pernah tenggelam di antara nama parameter.
            '<div class="finding-ticket-head">',
            '<p class="ticket-label">No Tiket</p>',
            '<p class="ticket-code">' + escHtml(ticket.label) + "</p>",
            '<p class="ticket-meta">' +
              numberText(ticket.items.length) +
              " parameter</p></div>",
            ...ticket.items.map((item) =>
              [
                '<article class="finding">',
                '<div class="finding-value"><strong>' +
                  numberText(item.nilai) +
                  "</strong><span>" +
                  escHtml(nilaiLabel(item.nilai)) +
                  "</span></div>",
                "<div>",
                '<p class="finding-name">' +
                  escHtml(item.indicatorName) +
                  "</p>",
                '<dl class="finding-copy">',
                "<div><dt>Ketidaksesuaian</dt><dd>" +
                  escHtml(item.ketidaksesuaian ?? "—") +
                  "</dd></div>",
                '<div class="finding-fix"><dt>Sebaiknya</dt><dd>' +
                  escHtml(item.sebaiknya ?? "—") +
                  "</dd></div>",
                "</dl>",
                "</div>",
                "</article>",
              ].join(""),
            ),
            "</div>",
          ].join(""),
        )
        .join("");

      const monthLabel =
        (MONTHS_FULL[first.month - 1] ?? String(first.month)) +
        " " +
        first.year;
      return [
        '<details class="findings-period"' + open + ">",
        "<summary>",
        '<span class="findings-period-copy"><strong>' +
          escHtml(monthLabel) +
          "</strong><small>" +
          numberText(monthItems.length) +
          " temuan · " +
          numberText(tickets.size) +
          " tiket</small></span>",
        '<span class="disclosure-caret" aria-hidden="true"></span>',
        "</summary>",
        '<div class="findings-body">' + ticketBlocks + "</div>",
        "</details>",
      ].join("");
    })
    .join("");

  return [
    '<div class="section">',
    scopeLine(yearServiceScopeLabel(input.selectedService, input.selectedYear)),
    periods,
    "</div>",
  ].join("");
}

function buildTabs(variant: AgentHtmlVariant): string {
  if (variant !== "interactive") return "";
  // Label tab sengaja lebih pendek daripada judul panel, tapi tidak pernah
  // ambigu: "Skor" (Perkembangan Skor) dan "Tren" (Tren Temuan) mengukur dua
  // hal yang berbeda, jadi keduanya punya tab sendiri.
  const tabs: Array<[ReportPanel, string]> = [
    ["summary", "Ringkasan"],
    ["trend", "Skor"],
    ["temuanTren", "Tren"],
    ["temuan", "Temuan"],
  ];
  return [
    '<div class="report-tabs" role="tablist" aria-label="Bagian laporan">',
    ...tabs.map(
      ([panel, label], index) =>
        '<button type="button" class="report-tab" role="tab" id="report-tab-' +
        panel +
        '" data-report-tab="' +
        panel +
        '" aria-selected="' +
        (index === 0 ? "true" : "false") +
        '" aria-controls="report-panel-' +
        panel +
        '" tabindex="' +
        (index === 0 ? "0" : "-1") +
        '">' +
        label +
        "</button>",
    ),
    "</div>",
  ].join("");
}

function buildColophon(input: AgentReportHtmlInput, dateStr: string): string {
  return [
    '<footer class="colophon">',
    "<p>Laporan Audit SIDAK &bull; " +
      escHtml(input.data.peserta.nama) +
      " &bull; Tahun " +
      yearText(input.selectedYear) +
      " &bull; Layanan " +
      escHtml(input.selectedService.toUpperCase()) +
      "</p>",
    "<p>Dihasilkan pada " +
      escHtml(dateStr) +
      " dari halaman SIDAK saat laporan diunduh. Tiap bagian menyatakan cakupan periodenya sendiri di bawah judulnya.</p>",
    "<p>Angka agregat sesi berasal dari penilaian backend dan tidak dihitung ulang oleh laporan ini.</p>",
    "</footer>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Script interaktif
// ---------------------------------------------------------------------------

function buildInteractiveReportScript(variant: AgentHtmlVariant): string {
  if (variant !== "interactive") return "";

  return `<script>
(() => {
  const report = document.querySelector('[data-report-variant="interactive"]');
  if (!report) return;
  const tabs = Array.from(report.querySelectorAll('[data-report-tab]'));
  const panels = Array.from(report.querySelectorAll('[data-report-panel]'));
  const filters = Array.from(report.querySelectorAll('[data-trend-filter]'));

  const applyTab = (tab) => {
    tabs.forEach((button) => {
      const active = button.getAttribute('data-report-tab') === tab;
      button.setAttribute('aria-selected', String(active));
      button.setAttribute('tabindex', active ? '0' : '-1');
    });
    panels.forEach((panel) => {
      panel.toggleAttribute('hidden', panel.getAttribute('data-report-panel') !== tab);
    });
  };

  const applyFilter = (filter, group) => {
    // Filter hanya berlaku pada panel yang memuat tombolnya. Tanpa batas ini,
    // klik "Total Temuan" di seksi Tren Temuan ikut menyaring garis skor di
    // panel lain — yang bukan jumlah temuan sama sekali.
    const scope = group ? [group] : report.querySelectorAll('[data-report-panel]');
    const visible = (node) => {
      if (filter === null) return true;
      if (filter === 'total') return node.getAttribute('data-series-total') === 'true';
      return node.getAttribute('data-series-key') === filter;
    };
    const groups = new Set();
    scope.forEach((panel) => {
      Array.from(panel.querySelectorAll('[data-chart-series]')).forEach((node) => {
        node.toggleAttribute('hidden', !visible(node));
        groups.add(node.closest('[data-chart-figure]') || panel);
      });
    });
    filters.forEach((button) => {
      const key = button.getAttribute('data-trend-filter');
      button.setAttribute(
        'aria-pressed',
        String(filter === null ? key === 'summary' : key === filter),
      );
    });
    // Grafik tanpa seri yang tersisa disembunyikan: menyisakan sumbu kosong
    // lebih buruk daripada tidak menampilkannya. Aturan cetakan membukanya
    // kembali supaya cetakan tetap memuat setiap grafik.
    groups.forEach((figure) => {
      const own = Array.from(figure.querySelectorAll('[data-chart-series]'));
      figure.toggleAttribute('hidden', !own.some((node) => !node.hasAttribute('hidden')));
    });
  };

  tabs.forEach((button) => {
    button.addEventListener('click', () => {
      applyTab(button.getAttribute('data-report-tab') || 'summary');
    });
  });

  // Pola tab APG: roving tabindex, Arrow/Home/End memindahkannya.
  report.addEventListener('keydown', (event) => {
    const active = event.target;
    if (!active || !tabs.includes(active)) return;
    const key = event.key;
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const index = tabs.indexOf(active);
    const nextIndex = key === 'Home'
      ? 0
      : key === 'End'
        ? tabs.length - 1
        : (index + (key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (!next) return;
    next.focus();
    applyTab(next.getAttribute('data-report-tab') || 'summary');
  });

  filters.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.getAttribute('data-trend-filter') || 'summary';
      const pressed = button.getAttribute('aria-pressed') === 'true';
      applyFilter(
        pressed || filter === 'summary' ? null : filter,
        button.closest('[data-report-panel]'),
      );
    });
  });

  applyTab('summary');
  applyFilter(null);
})();
</script>`;
}

// ---------------------------------------------------------------------------
// Dokumen
// ---------------------------------------------------------------------------

export function buildAgentReportHtml(input: AgentReportHtmlInput): string {
  const variant = input.variant;
  const peserta = input.data.peserta;
  const masaKerja = computeTenure(peserta.bergabung_date);
  const dateStr = new Date().toLocaleDateString("id-ID", {
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

  return [
    "<!DOCTYPE html>",
    '<html lang="id">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Laporan Audit - " + escHtml(peserta.nama) + "</title>",
    "<style>" + REPORT_CSS + "</style>",
    "</head>",
    "<body>",
    '<article class="report" data-report-variant="' + variant + '">',
    buildMasthead(input, masaKerja),
    buildTabs(variant),
    "",
    "<section " +
      panelAttributes(variant, "summary", "performance", false) +
      ">",
    panelHeading(variant, "summary", "Ringkasan"),
    buildStandingHtml(
      input.context.quickview,
      input.selectedYear,
      input.selectedService,
      variant,
    ),
    buildActiveScoreHtml(input, activeMonth),
    buildMonthlyTableHtml(input),
    buildTicketsTableHtml(input, activeMonth),
    buildRootCausesHtml(input, activeMonth),
    "</section>",
    "",
    "<section " +
      panelAttributes(
        variant,
        "trend",
        "score-trend",
        variant === "interactive",
      ) +
      ">",
    panelHeading(variant, "trend", "Perkembangan Skor"),
    buildScorePanelHtml(input),
    "</section>",
    "",
    "<section " +
      panelAttributes(
        variant,
        "temuanTren",
        "findings-trend",
        variant === "interactive",
      ) +
      ">",
    panelHeading(variant, "temuanTren", "Tren Temuan"),
    buildFindingsTrendPanelHtml(input),
    "</section>",
    "",
    "<section " +
      panelAttributes(
        variant,
        "temuan",
        "findings",
        variant === "interactive",
      ) +
      ">",
    panelHeading(variant, "temuan", "Riwayat Temuan"),
    buildFindingsPanelHtml(input),
    "</section>",
    "",
    buildColophon(input, dateStr),
    "</article>",
    buildInteractiveReportScript(variant),
    "</body>",
    "</html>",
  ].join("\n");
}
