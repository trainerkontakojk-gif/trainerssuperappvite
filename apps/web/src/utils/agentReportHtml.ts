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
import {
  MINI_CHART,
  WIDE_CHART,
  buildChartFigure,
  escHtml,
} from "./agentReportHtmlChart";
import { REPORT_CSS } from "./agentReportHtmlStyles";
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
    return [
      '<div class="standing-item">',
      "<dt>" + escHtml(label) + "</dt>",
      "<dd>" +
        (hasRank
          ? "#" + formatNumber(metric?.rank) + " dari " + formatNumber(metric?.total)
          : "—") +
        "</dd>",
      "<small>" + escHtml(supporting) + "</small>",
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
      ? '<p class="standing-note">Semakin tinggi peringkat, semakin sedikit temuan YTD. Bila jumlah temuan sama, yang lebih sedikit temuan kritikal lalu skor QA lebih tinggi berada di atas. Bila semua angka kinerja sama, nama A–Z lalu ID agen menentukan urutan; nama bukan ukuran kinerja.</p>'
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
