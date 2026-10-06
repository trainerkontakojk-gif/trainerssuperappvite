/**
 * Laporan HTML agen SIDAK — satu stylesheet, satu kerangka markup, satu dataset
 * untuk KEDUA varian: `static` (dokumen baca, semua bagian terbuka) dan
 * `interactive` (tab dan disclosure). Perbedaannya hanya perilaku, tidak isi.
 *
 * Urutan baca: identitas → **Kesimpulan Utama** → Ringkasan (posisi, skor bulan
 * terpilih, rekap bulanan, tiket, akar masalah) → Perkembangan Skor → Tren
 * Temuan (total, tabel per parameter, perbandingan) → Detail Temuan (per
 * parameter) → catatan kaki.
 *
 * Aturan yang dijaga di sini:
 *  - Label, cakupan, kesimpulan, dan arah baik/buruk berasal dari
 *    `agentReportModel.ts` — satu definisi untuk HTML, PDF, dan Excel.
 *  - Cakupan ditulis sekali di header; seksi hanya menulis cakupan yang berbeda.
 *  - Satu metrik skor satu grafik, dengan sumbu yang di-zoom dan garis target.
 *    Jumlah temuan per parameter ditampilkan sebagai tabel, bukan garis yang
 *    saling menimpa.
 *  - Varian statis tidak punya kontrol yang tidak bisa bekerja offline. Varian
 *    interaktif hanya memakai tab (APG, roving tabindex) dan `<details>`.
 *    `@media print` membuka kembali semua panel dan semua disclosure.
 *  - Dokumen offline: CSS inline, tanpa font/link/script/gambar remote. Semua
 *    teks data di-escape, termasuk di atribut.
 */

import type { AgentPeriodSummary } from "@trainers/types";
import {
  QA_TARGET,
  SCORE_EMPTY_NOTE,
  SCORE_UNIT_LABEL,
  TREND_EMPTY_NOTE,
  TREND_UNIT_LABEL,
  buildHighlights,
  comparisonDelta,
  computeTenure,
  countAxis,
  finiteNumber,
  findingDeltaTone,
  findingTrend,
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
  type AgentReportSnapshot,
  type TrendSeries,
} from "./agentReportModel";
import { sidakScoreLabel, sidakScoreTone } from "./sidakScoreStatus";

export type {
  AgentHtmlExportContext,
  TemuanDisplayItemExport,
  TicketScoreExport,
} from "./agentReportModel";

export type AgentHtmlVariant = "interactive" | "static";

export interface AgentReportHtmlInput extends AgentReportSnapshot {
  variant: AgentHtmlVariant;
}

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// Stylesheet dokumen (inline, self-contained)
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
  margin: 0; padding: 2.5rem 1.25rem 4rem;
  background: var(--canvas); color: var(--ink-body);
  font-family: var(--sans); font-size: 15px; line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.report { max-width: 64rem; margin: 0 auto; min-width: 0; }
img, svg { max-width: 100%; }
h1, h2, h3, h4 { margin: 0; color: var(--ink); font-family: var(--display); font-weight: 700; letter-spacing: -0.02em; text-wrap: balance; }
p { margin: 0; }
dl, dd, dt, ul, li, figure, table, caption { margin: 0; padding: 0; }
ul { list-style: none; }

/* ── Masthead ─────────────────────────────────────────────────────────── */
.masthead { padding-bottom: 1.5rem; border-bottom: 2px solid var(--ink); }
.masthead-id { display: flex; align-items: center; gap: 1rem; min-width: 0; }
.masthead-text { min-width: 0; }
.masthead-initial {
  display: flex; flex: none; align-items: center; justify-content: center;
  width: 3.5rem; height: 3.5rem; border: 1px solid var(--line-strong);
  border-radius: 12px; background: var(--wash);
  color: var(--ink); font-family: var(--display); font-size: 1.5rem; font-weight: 700;
}
.masthead-kicker { color: var(--ink-faint); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.masthead-name { margin-top: 0.15rem; font-size: 2rem; font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; overflow-wrap: anywhere; }
.masthead-context { margin-top: 0.35rem; color: var(--ink-mute); font-size: 0.9375rem; font-weight: 500; }
.masthead-meta { display: grid; gap: 0.75rem 1.75rem; margin-top: 1.25rem; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.meta-item dt { color: var(--ink-faint); font-size: 0.75rem; font-weight: 600; }
.meta-item dd { margin-top: 0.15rem; color: var(--ink); font-size: 0.9375rem; font-weight: 600; overflow-wrap: anywhere; }

/* ── Kesimpulan ───────────────────────────────────────────────────────── */
.highlights { margin-top: 1.75rem; padding: 1.25rem 1.5rem; border: 1px solid var(--line-strong); border-left: 4px solid var(--ink); border-radius: 12px; background: var(--paper); }
.highlights-title { font-size: 1.125rem; font-weight: 800; }
.highlight-list { margin-top: 0.75rem; display: grid; gap: 0.5rem; }
.highlight-list li { position: relative; padding-left: 1.25rem; color: var(--ink); font-size: 0.9375rem; max-width: 75ch; }
.highlight-list li::before { content: ""; position: absolute; left: 0.2rem; top: 0.6em; width: 0.4rem; height: 0.4rem; border-radius: 9999px; background: var(--ink-faint); }

/* ── Panel & seksi ────────────────────────────────────────────────────── */
.panel { margin-top: 2.75rem; }
.panel + .panel { margin-top: 2.5rem; padding-top: 2.5rem; border-top: 1px solid var(--line); }
.panel-title { font-size: 1.375rem; font-weight: 800; letter-spacing: -0.03em; }
.report-tabs { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 1.75rem; border-bottom: 1px solid var(--line); padding-bottom: 0.5rem; }
.report-tab {
  min-height: 2.75rem; border: 0; border-bottom: 2px solid transparent;
  background: transparent; color: var(--ink-mute); padding: 0.5rem 0.85rem;
  font: inherit; font-size: 0.875rem; font-weight: 600; cursor: pointer;
  transition: color 160ms ease-out, border-color 160ms ease-out;
}
.report-tab:hover { color: var(--ink); }
.report-tab[aria-selected="true"] { border-bottom-color: var(--ink); color: var(--ink); }
.report-tab:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
.section { margin-top: 2rem; }
.panel > .section:first-of-type { margin-top: 1rem; }
.section-title { font-size: 1.0625rem; font-weight: 700; }
.section-scope { margin-top: 0.2rem; color: var(--ink-faint); font-size: 0.8125rem; font-weight: 500; }
.section-note { margin-top: 0.5rem; max-width: 70ch; color: var(--ink-mute); font-size: 0.875rem; }
.empty-state { margin-top: 0.75rem; color: var(--ink-mute); font-size: 0.9375rem; }
.tone-ok { color: var(--ok); }
.tone-warn { color: var(--warn); }
.tone-bad { color: var(--bad); }
.tone-flat { color: var(--ink-mute); }

/* ── Skor bulan terpilih ──────────────────────────────────────────────── */
.score-block { display: grid; gap: 1.25rem 2rem; margin-top: 0.75rem; align-items: end; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.score-period { color: var(--ink-faint); font-size: 0.8125rem; font-weight: 600; }
.score-value { margin-top: 0.25rem; color: var(--ink); font-family: var(--display); font-size: 3rem; font-weight: 800; line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.score-status { display: inline-block; margin-top: 0.5rem; font-size: 0.8125rem; font-weight: 700; }
.score-stats { display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.score-stats dt { color: var(--ink-faint); font-size: 0.75rem; font-weight: 600; }
.score-stats dd { margin-top: 0.2rem; color: var(--ink); font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; }

/* ── Tabel ────────────────────────────────────────────────────────────── */
.table-scroll { max-width: 100%; margin-top: 0.75rem; overflow-x: auto; overscroll-behavior-inline: contain; }
caption { padding: 0 0 0.5rem; color: var(--ink); text-align: left; font-family: var(--display); font-size: 1.0625rem; font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
thead th { padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--line-strong); color: var(--ink-mute); font-size: 0.75rem; font-weight: 700; text-align: left; white-space: nowrap; }
tbody td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line); color: var(--ink-body); vertical-align: top; }
tbody th { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--line); color: var(--ink); font-weight: 600; text-align: left; }
tbody tr:nth-child(even) td, tbody tr:nth-child(even) th { background: #fbfcfe; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.total-row td, .total-row th { color: var(--ink); font-weight: 700; }
.ticket-code { color: var(--ink); font-weight: 700; letter-spacing: 0.02em; overflow-wrap: anywhere; }
.table-legend { margin-top: 0.5rem; color: var(--ink-faint); font-size: 0.75rem; }

/* ── Posisi performa ──────────────────────────────────────────────────── */
.standing { display: grid; gap: 1px; margin-top: 0.75rem; grid-template-columns: repeat(3, minmax(0, 1fr)); background: var(--line); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.standing-item { min-width: 0; padding: 1rem 1.15rem; background: var(--paper); }
.standing-item dt { color: var(--ink-faint); font-size: 0.8125rem; font-weight: 600; }
.standing-item dd { margin-top: 0.3rem; color: var(--ink); font-size: 1.375rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.standing-item small { display: block; margin-top: 0.3rem; color: var(--ink-mute); font-size: 0.8125rem; }
.standing-note { padding: 0.85rem 1.15rem; background: var(--paper); color: var(--ink-mute); font-size: 0.8125rem; grid-column: 1 / -1; }
.tie-list { margin-top: 0.4rem; color: var(--ink-mute); font-size: 0.8125rem; }

/* ── Akar masalah ─────────────────────────────────────────────────────── */
.cause { padding: 1rem 0; border-bottom: 1px solid var(--line); }
.cause:last-child { border-bottom: 0; }
.cause-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.35rem 1rem; }
.cause-label { color: var(--ink); font-family: var(--display); font-size: 1rem; font-weight: 700; overflow-wrap: anywhere; }
.cause-facts { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; color: var(--ink-mute); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }
.cause-recommendation { white-space: pre-line; margin-top: 0.4rem; max-width: 72ch; color: var(--ink-body); font-size: 0.9375rem; }
.disclosure { margin-top: 0.4rem; color: var(--ink-mute); font-size: 0.8125rem; }
.disclosure > summary { min-height: 2.25rem; padding: 0.4rem 0; color: var(--ink-mute); font-weight: 600; cursor: pointer; }
.disclosure > summary:hover { color: var(--ink); }
.disclosure > summary:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.evidence-list { margin-top: 0.25rem; padding-left: 1rem; list-style: disc; }
.evidence-list li { padding: 0.15rem 0; color: var(--ink-body); font-variant-numeric: tabular-nums; }

/* ── Grafik ───────────────────────────────────────────────────────────── */
.score-grid { display: grid; gap: 1rem; margin-top: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.chart-figure { min-width: 0; padding: 0.9rem 1rem 0.75rem; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); }
.chart-figure + .table-scroll, .chart-figure + .section { margin-top: 1.5rem; }
.section > .chart-figure { margin-top: 1rem; }
.chart-title { color: var(--ink); font-family: var(--display); font-size: 0.9375rem; font-weight: 700; }
.trend-chart { display: block; margin-top: 0.4rem; width: 100%; height: auto; }
.chart-grid { stroke: var(--line); stroke-width: 1; }
.chart-axis-label { fill: var(--ink-faint); font-size: 12px; font-weight: 600; }
.chart-unit { fill: var(--ink-mute); font-size: 12px; font-weight: 700; }
.chart-value { fill: var(--ink); font-size: 12px; font-weight: 700; }
.chart-target { stroke: var(--warn); stroke-width: 1.5; stroke-dasharray: 6 4; }
.chart-target-label { fill: var(--warn); font-size: 11px; font-weight: 700; }

/* ── Detail temuan ────────────────────────────────────────────────────── */
.finding-group { border-top: 1px solid var(--line); }
.finding-group:last-child { border-bottom: 1px solid var(--line); }
.finding-group > summary { display: flex; min-height: 2.75rem; align-items: center; gap: 1rem; padding: 0.75rem 0.25rem; cursor: pointer; list-style: none; transition: background 160ms ease-out; }
.finding-group > summary::-webkit-details-marker { display: none; }
.finding-group > summary:hover { background: var(--wash); }
.finding-group > summary:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
.finding-group-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.finding-group-copy strong { color: var(--ink); font-family: var(--display); font-size: 1rem; font-weight: 700; overflow-wrap: anywhere; }
.finding-group-copy small { margin-top: 0.1rem; color: var(--ink-mute); font-size: 0.8125rem; }
.disclosure-caret { width: 0.5rem; height: 0.5rem; flex: none; border-right: 2px solid var(--ink-faint); border-bottom: 2px solid var(--ink-faint); transform: rotate(45deg); transition: transform 160ms ease-out; }
.finding-group[open] > summary .disclosure-caret { transform: rotate(225deg); }
.finding-group-body { padding: 0 0.25rem 1rem; }
.finding { padding: 0.85rem 0; border-top: 1px dashed var(--line); }
.finding:first-child { border-top: 0; }
.finding-copy { display: grid; gap: 0.85rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.finding-copy dt { color: var(--ink-faint); font-size: 0.75rem; font-weight: 700; }
.finding-copy dd { margin-top: 0.2rem; color: var(--ink-body); font-size: 0.875rem; overflow-wrap: anywhere; white-space: pre-line; }
.finding-copy .finding-fix dd { color: var(--ink); font-weight: 500; }
.occurrences { margin-top: 0.6rem; display: grid; gap: 0.25rem; }
.occurrences li { color: var(--ink-mute); font-size: 0.8125rem; font-variant-numeric: tabular-nums; }

/* ── Catatan kaki ─────────────────────────────────────────────────────── */
.colophon { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--ink-faint); font-size: 0.75rem; }
.colophon p + p { margin-top: 0.35rem; }

.table-hint { display: none; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
[hidden] { display: none !important; }

@media (max-width: 40rem) {
  body { padding: 1.5rem 1rem 2.5rem; }
  .masthead-name { font-size: 1.5rem; }
  .masthead-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .panel-title { font-size: 1.1875rem; }
  .highlights { padding: 1rem; }
  .score-block, .finding-copy, .standing, .score-grid { grid-template-columns: 1fr; }
  .table-hint { display: block; margin-top: 0.5rem; color: var(--ink-faint); font-size: 0.75rem; }
  /* Grafik lebar (viewBox 960) diskalakan ~0,4× di layar 390px. */
  .trend-chart--wide .chart-axis-label, .trend-chart--wide .chart-unit, .trend-chart--wide .chart-value, .trend-chart--wide .chart-target-label { font-size: 26px; }
}
@media (prefers-reduced-motion: reduce) {
  .report-tab, .finding-group > summary, .disclosure-caret { transition: none; }
}

@page { size: A4 portrait; margin: 14mm 12mm; }
@media print {
  body { padding: 0; background: #ffffff; line-height: 1.5; }
  .report { max-width: none; }
  .report-tabs, .disclosure-caret, .table-hint { display: none !important; }
  [data-report-panel][hidden] { display: block !important; }
  /* Isi <details> tertutup disembunyikan lewat ::details-content, bukan
     display; tanpa dua aturan ini temuan tertutup hilang dari cetakan. */
  details > *:not(summary) { display: block !important; }
  details::details-content { content-visibility: visible !important; }
  .finding-group > summary, .disclosure > summary { cursor: default; }
  .table-scroll { overflow: visible; }
  thead th { white-space: normal; }
  tbody td, tbody th, thead th { overflow-wrap: anywhere; }
  thead { display: table-header-group; }
  tr, .score-block, .cause, .finding, .masthead, .highlights, .standing-item, .chart-figure, .colophon { break-inside: avoid; }
  .finding-group > summary, .panel-title, .section-note { break-after: avoid; }
  h1, h2, h3, h4, caption, .section-title, .section-scope, .chart-title { break-after: avoid; }
  .score-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .panel { margin-top: 1.5rem; }
  .panel + .panel { margin-top: 1.25rem; padding-top: 1.25rem; }
  .section { margin-top: 1.25rem; }
  .highlights { margin-top: 1rem; }
  .colophon { margin-top: 1.25rem; padding-top: 0.75rem; }
}
`;

// ---------------------------------------------------------------------------
// Grafik
// ---------------------------------------------------------------------------

interface ChartGeometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const MINI_CHART: ChartGeometry = {
  width: 320,
  height: 210,
  left: 40,
  right: 14,
  top: 28,
  bottom: 28,
};

const WIDE_CHART: ChartGeometry = {
  width: 960,
  height: 280,
  left: 56,
  right: 24,
  top: 32,
  bottom: 36,
};

interface ChartSpec {
  title: string;
  accessibleName: string;
  unit: string;
  figure: string;
  labels: string[];
  series: TrendSeries;
  axis: { min: number; max: number; step: number };
  target?: number;
  geometry: ChartGeometry;
  wide?: boolean;
}

/**
 * Satu grafik garis satu seri: kisi + angka sumbu, label periode, nilai di atas
 * tiap titik, dan (untuk skor) garis target putus-putus. Semua angka tetap
 * `<text>`, jadi bisa dicari di dokumen.
 */
function buildChartSvg(spec: ChartSpec): string {
  const g = spec.geometry;
  const plotWidth = g.width - g.left - g.right;
  const plotHeight = g.height - g.top - g.bottom;
  const { min, max, step } = spec.axis;
  const span = Math.max(1, max - min);
  // Titik pertama/terakhir diberi jarak dari tepi plot supaya label nilainya
  // tidak menabrak angka sumbu Y.
  const inset = 16;
  const xFor = (index: number) =>
    spec.labels.length === 1
      ? g.left + plotWidth / 2
      : g.left + inset + (index / (spec.labels.length - 1)) * (plotWidth - inset * 2);
  const yFor = (value: number) =>
    g.top + plotHeight - ((Math.min(max, Math.max(min, value)) - min) / span) * plotHeight;

  const ticks: string[] = [];
  for (let value = min; value <= max + 0.0001; value += step) {
    const y = yFor(value).toFixed(2);
    ticks.push(
      `<line x1="${g.left}" y1="${y}" x2="${g.width - g.right}" y2="${y}" class="chart-grid" />` +
        `<text x="${g.left - 8}" y="${(Number(y) + 4).toFixed(2)}" class="chart-axis-label" text-anchor="end">${escHtml(formatNumber(value))}</text>`,
    );
  }

  // Label periode berselang bila terlalu rapat; ujung kanan selalu dicetak.
  const labelSpacing =
    spec.labels.length > 1
      ? (plotWidth - inset * 2) / (spec.labels.length - 1)
      : plotWidth;
  const labelStride = labelSpacing < 30 ? 2 : 1;
  const xLabels = spec.labels
    .map((label, index) => {
      const last = spec.labels.length - 1;
      const onStride = index % labelStride === 0 && last - index >= labelStride;
      if (index !== last && index !== 0 && !onStride) return "";
      return `<text x="${xFor(index).toFixed(2)}" y="${g.height - 8}" class="chart-axis-label" text-anchor="middle">${escHtml(label)}</text>`;
    })
    .join("");

  const target =
    spec.target === undefined
      ? ""
      : (() => {
          const y = yFor(spec.target).toFixed(2);
          // Keterangan target di pojok kanan atas, DI LUAR area plot, supaya
          // tidak pernah menimpa titik data yang dekat dengan target.
          const legendRight = g.width - g.right;
          return (
            `<g data-target-line="${spec.target}">` +
            `<line x1="${g.left}" y1="${y}" x2="${legendRight}" y2="${y}" class="chart-target" />` +
            `<line x1="${legendRight - 86}" y1="10" x2="${legendRight - 64}" y2="10" class="chart-target" />` +
            `<text x="${legendRight}" y="14" class="chart-target-label" text-anchor="end">Target ${spec.target}</text>` +
            "</g>"
          );
        })();

  // Garis lurus antar titik, terputus pada periode tanpa data.
  const segments: string[] = [];
  let current: string[] = [];
  spec.series.data.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(
      `${current.length === 0 ? "M" : "L"}${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`,
    );
  });
  if (current.length > 1) segments.push(current.join(" "));

  const spacing = labelSpacing;
  const showValues = spacing >= 26;
  const points = spec.series.data
    .map((value, index) => {
      if (value === null) return "";
      const x = xFor(index).toFixed(2);
      const y = yFor(value);
      const labelY = y <= g.top + 14 ? y + 18 : y - 9;
      return (
        `<circle cx="${x}" cy="${y.toFixed(2)}" r="4" fill="#ffffff" stroke="#0f172a" stroke-width="2"><title>${escHtml(spec.series.label)} · ${escHtml(spec.labels[index])}: ${escHtml(formatNumber(value))}</title></circle>` +
        (showValues
          ? `<text x="${x}" y="${labelY.toFixed(2)}" class="chart-value" text-anchor="middle">${escHtml(formatNumber(value))}</text>`
          : "")
      );
    })
    .join("");

  return [
    `<svg class="trend-chart${spec.wide ? " trend-chart--wide" : ""}" viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="${escHtml(spec.accessibleName)}">`,
    `<title>${escHtml(spec.title)}</title>`,
    `<text x="0" y="14" class="chart-unit">${escHtml(spec.unit)}</text>`,
    ticks.join(""),
    target,
    xLabels,
    segments.length > 0
      ? `<path d="${segments.join(" ")}" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`
      : "",
    points,
    "</svg>",
  ].join("");
}

function buildChartFigure(spec: ChartSpec): string {
  return [
    `<figure class="chart-figure" data-chart-figure="${escHtml(spec.figure)}">`,
    `<h4 class="chart-title">${escHtml(spec.title)}</h4>`,
    buildChartSvg(spec),
    "</figure>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Potongan dokumen
// ---------------------------------------------------------------------------

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

/** Id judul panel tidak pernah sama dengan id tab (`report-tab-<panel>`). */
function panelHeading(panel: ReportPanel, title: string): string {
  return `<h2 class="panel-title" id="report-panel-${panel}-title">${escHtml(title)}</h2>`;
}

function sectionHeading(id: string, title: string): string {
  return `<h3 class="section-title" id="${id}">${escHtml(title)}</h3>`;
}

function scopeLine(label: string): string {
  return label ? `<p class="section-scope">${escHtml(label)}</p>` : "";
}

function buildMasthead(input: AgentReportHtmlInput, header: string): string {
  const peserta = input.data.peserta;
  const initial = (peserta.nama.trim().charAt(0) || "?").toUpperCase();
  const meta: Array<[string, string]> = [
    ["Tim", peserta.tim],
    ["Batch", peserta.batch_name],
    ["Jabatan", jabatanLabel(peserta.jabatan)],
    ["Masa kerja", computeTenure(peserta.bergabung_date)],
  ];
  return [
    '<header class="masthead">',
    '<div class="masthead-id">',
    // Inisial, bukan `<img>`: dokumen offline tidak pernah menarik aset remote.
    '<span class="masthead-initial" aria-hidden="true">' +
      escHtml(initial) +
      "</span>",
    '<div class="masthead-text">',
    '<p class="masthead-kicker">Laporan Audit Agent</p>',
    '<h1 class="masthead-name">' + escHtml(peserta.nama) + "</h1>",
    '<p class="masthead-context">' + escHtml(header) + "</p>",
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

function buildHighlightsHtml(input: AgentReportHtmlInput): string {
  return [
    '<section class="highlights" data-report-highlights aria-labelledby="report-highlights-title">',
    '<h2 class="highlights-title" id="report-highlights-title">Kesimpulan Utama</h2>',
    '<ul class="highlight-list">',
    ...buildHighlights(input).map((line) => "<li>" + escHtml(line) + "</li>"),
    "</ul>",
    "</section>",
  ].join("");
}

function buildStandingHtml(input: AgentReportHtmlInput): string {
  const quickview = input.context.quickview;
  if (!quickview) return "";
  const open = input.variant === "static" ? " open" : "";
  const sameScope =
    quickview.combinedTeam?.scopeId != null &&
    quickview.combinedTeam.scopeId === quickview.leaderTeam?.scopeId;

  const rankItem = (
    label: string,
    metric: NonNullable<AgentReportHtmlInput["context"]["quickview"]>["combinedTeam"],
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
        ? `<details class="disclosure quickview-ties"${open}><summary>Berbagi peringkat ${formatNumber(metric?.rank)} dengan ${escHtml(peers[0].nama)}${
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
          ? "#" + formatNumber(metric?.rank) + " dari " + formatNumber(metric?.total)
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
    '<dl class="standing" aria-label="Peringkat performa agent">',
    rankItem("Tim Gabungan", quickview.combinedTeam),
    rankItem("Tim Leader", quickview.leaderTeam, sameScope),
    '<div class="standing-item">',
    "<dt>Perkiraan 3 bulan</dt>",
    "<dd>" + escHtml(forecast?.label ?? "—") + "</dd>",
    "<small>" +
      escHtml(forecast?.supportingText ?? "Perkiraan belum tersedia") +
      "</small>",
    "</div>",
    completeRanking
      ? '<p class="standing-note">Peringkat 1 = temuan paling sedikit sejak awal tahun. Jumlah temuan yang sama mendapat peringkat yang sama.</p>'
      : "",
    "</dl>",
    "</div>",
  ].join("");
}

function buildActiveScoreHtml(input: AgentReportHtmlInput): string {
  const active = resolveActiveScore(
    input.monthlySummaries,
    resolveActiveMonth(input),
  );
  if (!active) return "";
  const { current, previous, delta } = active;
  const score = finiteNumber(current.finalScore, 0, 0, 100);
  return [
    '<div class="section">',
    sectionHeading("sec-active-score", "Skor Bulan Terpilih"),
    '<div class="score-block">',
    "<div>",
    '<p class="score-period">' +
      escHtml(monthLabel(current.month, current.year)) +
      "</p>",
    '<p class="score-value">' + escHtml(formatNumber(score)) + "</p>",
    '<p class="score-status tone-' +
      sidakScoreTone(score) +
      '">' +
      escHtml(sidakScoreLabel(score)) +
      " (target " +
      QA_TARGET +
      ")</p>",
    "</div>",
    '<dl class="score-stats">',
    "<div><dt>Sesi diaudit</dt><dd>" +
      formatNumber(current.sessionCount) +
      "</dd></div>",
    "<div><dt>Temuan</dt><dd>" +
      formatNumber(current.findingsCount) +
      "</dd></div>",
    "<div><dt>" +
      escHtml(
        previous
          ? "Dibanding " + monthLabel(previous.month, previous.year)
          : "Dibanding bulan sebelumnya",
      ) +
      '</dt><dd class="tone-' +
      scoreDeltaTone(delta) +
      '">' +
      escHtml(delta === null ? "—" : formatPointDelta(delta)) +
      "</dd></div>",
    "</dl>",
    "</div>",
    "</div>",
  ].join("");
}

function monthlyRowLabel(summary: AgentPeriodSummary): string {
  return monthLabel(summary.month, summary.year);
}

function buildMonthlyTableHtml(input: AgentReportHtmlInput): string {
  if (input.monthlySummaries.length === 0) return "";
  const rows = input.monthlySummaries
    .map((summary) => {
      const score = finiteNumber(summary.finalScore);
      return [
        "<tr>",
        '<th scope="row">' + escHtml(monthlyRowLabel(summary)) + "</th>",
        '<td class="num">' + formatNumber(summary.finalScore) + "</td>",
        '<td class="num">' + formatNumber(summary.nonCriticalScore) + "</td>",
        '<td class="num">' + formatNumber(summary.criticalScore) + "</td>",
        '<td class="num">' + formatNumber(summary.sessionCount) + "</td>",
        '<td class="num">' + formatNumber(summary.findingsCount) + "</td>",
        '<td class="' +
          (score >= QA_TARGET ? "tone-ok" : "tone-warn") +
          '">' +
          escHtml(qaStatusLabel(score)) +
          "</td>",
        "</tr>",
      ].join("");
    })
    .join("");
  return [
    '<div class="section">',
    '<div class="table-scroll">',
    "<table>",
    "<caption>Rekap Skor Bulanan</caption>",
    '<thead><tr><th scope="col">Bulan</th><th scope="col" class="num">Skor Final</th><th scope="col" class="num">Skor Non-Critical</th><th scope="col" class="num">Skor Critical</th><th scope="col" class="num">Sesi</th><th scope="col" class="num">Temuan</th><th scope="col">Status</th></tr></thead>',
    "<tbody>" + rows + "</tbody>",
    "</table>",
    "</div>",
    "</div>",
  ].join("");
}

function buildTicketsTableHtml(input: AgentReportHtmlInput, scope: string): string {
  const rows = input.topTickets
    .map((ticket, position) =>
      [
        "<tr>",
        '<td class="num">' + (position + 1) + "</td>",
        '<th scope="row" class="ticket-code">' +
          escHtml(ticket.no_tiket) +
          "</th>",
        "<td>" + escHtml(ticket.heaviestParam) + "</td>",
        '<td class="num">' +
          escHtml(formatNumber(ticket.scoreDeduction, 1)) +
          "</td>",
        '<td class="num">' + formatNumber(ticket.findingCount) + "</td>",
        "</tr>",
      ].join(""),
    )
    .join("");
  return [
    '<div class="section">',
    sectionHeading("sec-tickets", "Tiket Pengurang Skor Terbesar"),
    scopeLine(scope),
    input.topTickets.length === 0
      ? '<p class="empty-state">Tidak ada tiket yang menurunkan skor pada bulan ini.</p>'
      : [
          '<div class="table-scroll">',
          "<table>",
          '<thead><tr><th scope="col" class="num">#</th><th scope="col">No Tiket</th><th scope="col">Parameter Terberat</th><th scope="col" class="num">Pengurangan Skor</th><th scope="col" class="num">Jumlah Temuan</th></tr></thead>',
          "<tbody>" + rows + "</tbody>",
          "</table>",
          "</div>",
        ].join(""),
    "</div>",
  ].join("");
}

function buildRootCausesHtml(input: AgentReportHtmlInput, scope: string): string {
  const open = input.variant === "static" ? " open" : "";
  const items = input.activeRootCauses
    .map((cause) => {
      const critical = finiteNumber(cause.criticalFindingsCount);
      const references = cause.ticketReferences ?? [];
      return [
        '<div class="cause">',
        '<div class="cause-head">',
        '<p class="cause-label">' + escHtml(cause.label) + "</p>",
        '<p class="cause-facts"><span>' +
          formatNumber(cause.findingsCount) +
          " temuan</span>",
        "<span>" + formatNumber(cause.affectedTickets) + " tiket</span>",
        critical > 0
          ? '<span class="tone-bad">' + formatNumber(critical) + " critical</span>"
          : "",
        "</p>",
        "</div>",
        '<p class="cause-recommendation">' +
          escHtml(cause.recommendation) +
          "</p>",
        references.length > 0
          ? [
              '<details class="disclosure"' + open + ">",
              "<summary>Tiket terkait (" +
                formatNumber(references.length) +
                ")</summary>",
              '<ul class="evidence-list">',
              ...references.map(
                (reference) =>
                  "<li>" +
                  [
                    '<span class="ticket-code">' +
                      escHtml(reference.no_tiket) +
                      "</span>",
                    escHtml(reference.periodLabel),
                    formatNumber(reference.findingsCount) + " temuan",
                    finiteNumber(reference.criticalFindingsCount) > 0
                      ? '<span class="tone-bad">' +
                        formatNumber(reference.criticalFindingsCount) +
                        " critical</span>"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") +
                  "</li>",
              ),
              "</ul>",
              "</details>",
            ].join("")
          : "",
        "</div>",
      ].join("");
    })
    .join("");
  return [
    '<div class="section">',
    sectionHeading("sec-root-causes", "Akar Masalah"),
    scopeLine(scope),
    items === ""
      ? '<p class="empty-state">Belum ada pola akar masalah yang menonjol.</p>'
      : items,
    "</div>",
  ].join("");
}

function buildScorePanelHtml(input: AgentReportHtmlInput): string {
  const { labels, charts } = scoreTrend(input);
  if (labels.length === 0) {
    return `<div class="section"><p class="empty-state">${escHtml(SCORE_EMPTY_NOTE)}</p></div>`;
  }
  return [
    '<div class="section">',
    `<p class="section-note">Satu grafik per jenis skor. Garis putus-putus menandai target ${QA_TARGET}; angka lengkapnya ada di tabel Rekap Skor Bulanan.</p>`,
    '<div class="score-grid">',
    ...charts.map((chart) =>
      buildChartFigure({
        title: chart.title,
        accessibleName: `Grafik ${chart.title.toLowerCase()} per bulan terhadap target ${QA_TARGET}`,
        unit: SCORE_UNIT_LABEL,
        figure: "score-" + chart.metric,
        labels,
        series: chart.series,
        axis: scoreAxis(chart.series.data),
        target: QA_TARGET,
        geometry: MINI_CHART,
      }),
    ),
    "</div>",
    "</div>",
  ].join("");
}

function buildParameterTableHtml(
  labels: string[],
  total: TrendSeries | null,
  parameters: Array<TrendSeries & { sum: number }>,
): string {
  const cell = (value: number | null) =>
    '<td class="num">' + (value === null ? "—" : formatNumber(value)) + "</td>";
  const sum = (series: TrendSeries) =>
    series.data.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  const row = (series: TrendSeries, isTotal: boolean) =>
    "<tr" +
    (isTotal ? ' class="total-row"' : "") +
    '><th scope="row">' +
    escHtml(series.label) +
    "</th>" +
    series.data.map(cell).join("") +
    '<td class="num">' +
    formatNumber(sum(series)) +
    "</td></tr>";
  return [
    '<div class="table-scroll">',
    "<table>",
    "<caption>Temuan per Parameter</caption>",
    '<thead><tr><th scope="col">Parameter</th>' +
      labels
        .map((label) => '<th scope="col" class="num">' + escHtml(label) + "</th>")
        .join("") +
      '<th scope="col" class="num">Total</th></tr></thead>',
    "<tbody>" +
      (total ? row(total, true) : "") +
      parameters.map((series) => row(series, false)).join("") +
      "</tbody>",
    "</table>",
    "</div>",
  ].join("");
}

function buildComparisonTableHtml(
  input: AgentReportHtmlInput,
  scope: string,
): string {
  const table = input.data.comparisonTable;
  if (!table || table.rows.length === 0) return "";
  const rows = table.rows
    .map((row) => {
      const teamDelta = comparisonDelta(row.agentCount, row.teamAverage);
      const serviceDelta = comparisonDelta(row.agentCount, row.serviceAverage);
      return [
        "<tr" + (row.key === "total" ? ' class="total-row"' : "") + ">",
        '<th scope="row">' + escHtml(row.label) + "</th>",
        '<td class="num">' + formatNumber(row.agentCount) + "</td>",
        '<td class="num">' + formatNumber(row.teamAverage, 1) + "</td>",
        '<td class="num">' + formatNumber(row.serviceAverage, 1) + "</td>",
        '<td class="num tone-' +
          findingDeltaTone(row.agentCount, teamDelta) +
          '">' +
          escHtml(formatPercentDelta(teamDelta)) +
          "</td>",
        '<td class="num tone-' +
          findingDeltaTone(row.agentCount, serviceDelta) +
          '">' +
          escHtml(formatPercentDelta(serviceDelta)) +
          "</td>",
        "</tr>",
      ].join("");
    })
    .join("");
  return [
    '<div class="section">',
    sectionHeading("sec-comparison", "Perbandingan dengan Tim dan Layanan"),
    scopeLine(scope),
    '<p class="table-hint">Geser tabel ke samping untuk melihat seluruh kolom.</p>',
    '<div class="table-scroll">',
    "<table>",
    '<caption class="sr-only">Perbandingan jumlah temuan dengan tim dan layanan</caption>',
    '<thead><tr><th scope="col">Parameter</th><th scope="col" class="num">Agen ini</th><th scope="col" class="num">Rata-rata tim</th><th scope="col" class="num">Rata-rata layanan</th><th scope="col" class="num">Selisih vs tim</th><th scope="col" class="num">Selisih vs layanan</th></tr></thead>',
    "<tbody>" + rows + "</tbody>",
    "</table>",
    "</div>",
    '<p class="table-legend">Hijau = temuan lebih sedikit dari rata-rata (lebih baik). Merah = lebih banyak.</p>',
    "</div>",
  ].join("");
}

function buildFindingsTrendPanelHtml(
  input: AgentReportHtmlInput,
  comparisonScope: string,
): string {
  const { labels, total, parameters } = findingTrend(input.data);
  const comparison = buildComparisonTableHtml(input, comparisonScope);
  if (labels.length === 0 || (total === null && parameters.length === 0)) {
    return [
      `<div class="section"><p class="empty-state">${escHtml(TREND_EMPTY_NOTE)}</p></div>`,
      comparison,
    ].join("");
  }
  return [
    '<div class="section">',
    total
      ? buildChartFigure({
          title: "Total Temuan per Bulan",
          accessibleName: "Grafik jumlah seluruh temuan per bulan",
          unit: TREND_UNIT_LABEL,
          figure: "total",
          labels,
          series: total,
          axis: countAxis(total.data),
          geometry: WIDE_CHART,
          wide: true,
        })
      : "",
    buildParameterTableHtml(labels, total, parameters),
    "</div>",
    comparison,
  ].join("");
}

function buildFindingsPanelHtml(input: AgentReportHtmlInput): string {
  const groups = groupFindingsByParameter(input.temuanDisplayItems);
  if (groups.length === 0) {
    return '<div class="section"><p class="empty-state">Tidak ada temuan pada tahun dan layanan ini.</p></div>';
  }
  const open = input.variant === "static" ? " open" : "";
  const blocks = groups
    .map((group) => {
      const facts = [
        formatNumber(group.count) + " temuan",
        group.category,
        group.criticalCount > 0 && group.category !== "Critical"
          ? formatNumber(group.criticalCount) + " critical"
          : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const entries = group.entries
        .map((entry) =>
          [
            '<article class="finding">',
            '<dl class="finding-copy">',
            "<div><dt>Ketidaksesuaian</dt><dd>" +
              escHtml(entry.ketidaksesuaian) +
              "</dd></div>",
            '<div class="finding-fix"><dt>Sebaiknya</dt><dd>' +
              escHtml(entry.sebaiknya) +
              "</dd></div>",
            "</dl>",
            '<ul class="occurrences">',
            ...entry.occurrences.map(
              (occurrence) =>
                '<li><span class="ticket-code">' +
                escHtml(occurrence.ticket) +
                "</span> · " +
                escHtml(monthLabel(occurrence.month, occurrence.year)) +
                " · Nilai " +
                escHtml(nilaiText(occurrence.nilai)) +
                "</li>",
            ),
            "</ul>",
            "</article>",
          ].join(""),
        )
        .join("");
      return [
        '<details class="finding-group" data-finding-group="' +
          escHtml(group.parameter) +
          '"' +
          open +
          ">",
        "<summary>",
        '<span class="finding-group-copy"><strong>' +
          escHtml(group.parameter) +
          "</strong><small>" +
          escHtml(facts) +
          "</small></span>",
        '<span class="disclosure-caret" aria-hidden="true"></span>',
        "</summary>",
        '<div class="finding-group-body">' + entries + "</div>",
        "</details>",
      ].join("");
    })
    .join("");
  return [
    '<div class="section">',
    '<p class="section-note">' +
      escHtml(
        `${formatNumber(input.temuanDisplayItems.length)} temuan di ${formatNumber(groups.length)} parameter, paling sering lebih dulu. Temuan dengan catatan yang sama digabung dan daftar tiketnya ditulis di bawahnya.`,
      ) +
      "</p>",
    blocks,
    "</div>",
  ].join("");
}

function buildTabs(variant: AgentHtmlVariant): string {
  if (variant !== "interactive") return "";
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

function buildColophon(
  input: AgentReportHtmlInput,
  header: string,
  dateStr: string,
): string {
  return [
    '<footer class="colophon">',
    "<p>Laporan Audit SIDAK &bull; " +
      escHtml(input.data.peserta.nama) +
      " &bull; " +
      escHtml(header) +
      "</p>",
    "<p>Dibuat " +
      escHtml(dateStr) +
      " dari SIDAK. Sesi tanpa temuan dihitung pada kolom Sesi, tetapi tidak ditampilkan sebagai temuan.</p>",
    "</footer>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Script interaktif (tab saja)
// ---------------------------------------------------------------------------

function buildInteractiveReportScript(variant: AgentHtmlVariant): string {
  if (variant !== "interactive") return "";
  return `<script>
(() => {
  const report = document.querySelector('[data-report-variant="interactive"]');
  if (!report) return;
  const tabs = Array.from(report.querySelectorAll('[data-report-tab]'));
  const panels = Array.from(report.querySelectorAll('[data-report-panel]'));
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
  applyTab('summary');
})();
</script>`;
}

// ---------------------------------------------------------------------------
// Dokumen
// ---------------------------------------------------------------------------

export function buildAgentReportHtml(input: AgentReportHtmlInput): string {
  const variant = input.variant;
  const peserta = input.data.peserta;
  const scopes = reportScopes(input);
  const dateStr = new Date().toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const hiddenInInteractive = variant === "interactive";

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
    buildMasthead(input, scopes.header),
    buildHighlightsHtml(input),
    buildTabs(variant),
    "<section " + panelAttributes(variant, "summary", "performance", false) + ">",
    panelHeading("summary", "Ringkasan"),
    buildStandingHtml(input),
    buildActiveScoreHtml(input),
    buildMonthlyTableHtml(input),
    buildTicketsTableHtml(input, scopes.tickets),
    buildRootCausesHtml(input, scopes.rootCauses),
    "</section>",
    "<section " +
      panelAttributes(variant, "trend", "score-trend", hiddenInInteractive) +
      ">",
    panelHeading("trend", "Perkembangan Skor"),
    buildScorePanelHtml(input),
    "</section>",
    "<section " +
      panelAttributes(
        variant,
        "temuanTren",
        "findings-trend",
        hiddenInInteractive,
      ) +
      ">",
    panelHeading("temuanTren", "Tren Temuan"),
    buildFindingsTrendPanelHtml(input, scopes.comparison),
    "</section>",
    "<section " +
      panelAttributes(variant, "temuan", "findings", hiddenInInteractive) +
      ">",
    panelHeading("temuan", "Detail Temuan"),
    buildFindingsPanelHtml(input),
    "</section>",
    buildColophon(input, scopes.header, dateStr),
    "</article>",
    buildInteractiveReportScript(variant),
    "</body>",
    "</html>",
  ].join("\n");
}
