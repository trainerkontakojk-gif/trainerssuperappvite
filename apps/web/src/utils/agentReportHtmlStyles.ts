/**
 * Inline stylesheet for the SIDAK agent HTML report (both variants). The
 * document stays offline: no remote fonts, links or images.
 */

export const REPORT_CSS = `
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
