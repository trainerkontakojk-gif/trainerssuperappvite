/**
 * Agent Detail Report Export Utility
 *
 * Generates CSV, Markdown (.md), and HTML (.html) reports from AgentDetailData.
 * All formats include the full dataset: profile, monthly summaries, findings,
 * top tickets, root causes, trend data, and comparison table.
 */

import type {
  AgentDetailData,
  AgentPeriodSummary,
  RootCauseResult,
  SidakAgentQuickviewResponse,
} from "@trainers/types";
import {
  buildInteractiveReportScript,
  buildTrendReportHtml,
  type AgentHtmlVariant,
} from "./agentReportHtml";

// ---------------------------------------------------------------------------
// Re-exported types used by the generators
// ---------------------------------------------------------------------------

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

export type AgentReportFormat =
  | "csv"
  | "md"
  | "html-interactive"
  | "html-static";

export interface AgentHtmlExportContext {
  selectedMonth?: number | null;
  trendStartMonth?: number;
  trendEndMonth?: number;
  quickview?: SidakAgentQuickviewResponse | null;
  isStaff?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS_FULL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agt", "Sep", "Okt", "Nov", "Des",
];

function computeTenure(bergabungDate: string | null): string {
  if (!bergabungDate) return "-";
  const start = new Date(bergabungDate);
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  if (months < 12) return months + " bln";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? years + " thn " + rem + " bln" : years + " thn";
}

function nilaiLabel(nilai: number): string {
  const labels: Record<number, string> = {
    3: "SESUAI",
    2: "PERBAIKAN",
    1: "TIDAK SESUAI",
    0: "KRITIS",
  };
  return labels[nilai] ?? "?";
}

function formatNilai(nilai: number): string {
  return nilai + " (" + nilaiLabel(nilai) + ")";
}

// ---------------------------------------------------------------------------
// CSV Helpers
// ---------------------------------------------------------------------------

function csvEscape(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  // Also protect against formula injection
  if (/^[=+\-@\t]/.test(str)) {
    return '"' + str + '"';
  }
  return str;
}

function csvRow(values: unknown[]): string {
  return values.map(csvEscape).join(",") + "\n";
}

function csvSection(
  rows: string[],
  sectionName: string,
  headerRow?: unknown[],
): void {
  rows.push("\n");
  rows.push("# " + sectionName + "\n");
  if (headerRow) {
    rows.push(csvRow(headerRow));
  }
}

// ---------------------------------------------------------------------------
// generateCSV
// ---------------------------------------------------------------------------

export function generateCSV(
  data: AgentDetailData,
  monthlySummaries: AgentPeriodSummary[],
  temuanDisplayItems: TemuanDisplayItemExport[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[],
  selectedYear: number,
): string {
  const rows: string[] = [];

  const peserta = data.peserta;
  const masaKerja = computeTenure(peserta.bergabung_date);
  rows.push("# Laporan Audit Agent - " + peserta.nama + "\n");
  rows.push(csvRow(["Nama", peserta.nama]));
  rows.push(csvRow(["Tim", peserta.tim]));
  rows.push(csvRow(["Batch", peserta.batch_name]));
  rows.push(csvRow(["Jabatan", peserta.jabatan ?? "Agent"]));
  rows.push(csvRow(["Masa Kerja", masaKerja]));
  rows.push(csvRow(["Tahun Laporan", String(selectedYear)]));

  // Monthly Summaries
  csvSection(rows, "Ringkasan Skor per Bulan", [
    "Bulan", "Skor Final", "NC Score", "CR Score", "Sesi", "Temuan",
  ]);
  for (const s of monthlySummaries) {
    rows.push(
      csvRow([s.label, s.finalScore, s.nonCriticalScore, s.criticalScore, s.sessionCount, s.findingsCount]),
    );
  }

  // Detail Temuan
  csvSection(rows, "Detail Temuan", [
    "Bulan", "Tahun", "Indikator", "Kategori", "Nilai", "Ketidaksesuaian", "Sebaiknya", "No Tiket",
  ]);
  for (const t of temuanDisplayItems) {
    rows.push(
      csvRow([
        MONTHS_FULL[t.month - 1] ?? t.month,
        t.year,
        t.indicatorName,
        t.category,
        formatNilai(t.nilai),
        t.ketidaksesuaian ?? "",
        t.sebaiknya ?? "",
        t.no_tiket ?? "",
      ]),
    );
  }

  // Top Tickets
  csvSection(rows, "Top 5 Pengurang Skor Terbesar", [
    "No Tiket", "Score Deduction", "Jumlah Temuan", "Parameter Terberat",
  ]);
  for (const ticket of topTickets) {
    rows.push(
      csvRow([
        ticket.no_tiket,
        ticket.scoreDeduction.toFixed(1),
        ticket.findingCount,
        ticket.heaviestParam,
      ]),
    );
  }

  // Root Causes
  csvSection(rows, "Analisis Akar Masalah (Root Causes)", [
    "Label", "Prioritas", "Jumlah Temuan", "Tiket Terdampak",
    "Temuan Critical", "Rata-rata Nilai", "Rekomendasi",
  ]);
  for (const cause of activeRootCauses) {
    rows.push(
      csvRow([
        cause.label,
        cause.priority,
        cause.findingsCount,
        cause.affectedTickets,
        cause.criticalFindingsCount,
        cause.averageNilai.toFixed(2),
        cause.recommendation,
      ]),
    );
  }

  // Trend Data
  if (data.personalTrend && data.personalTrend.labels.length > 0) {
    csvSection(rows, "Data Tren", [
      "Periode",
      ...data.personalTrend.datasets.map((ds) => ds.label),
    ]);
    for (let i = 0; i < data.personalTrend.labels.length; i++) {
      rows.push(
        csvRow([
          data.personalTrend.labels[i],
          ...data.personalTrend.datasets.map((ds) => ds.data[i] ?? ""),
        ]),
      );
    }
  }

  // Comparison Table
  if (data.comparisonTable && data.comparisonTable.rows.length > 0) {
    csvSection(rows, "Benchmark Temuan (Comparison Table)", [
      "Parameter", "Agent Ini", "Rata-rata Tim", "Rata-rata Service",
    ]);
    for (const row of data.comparisonTable.rows) {
      rows.push(
        csvRow([row.label, row.agentCount, row.teamAverage, row.serviceAverage]),
      );
    }
  }

  return rows.join("");
}

// ---------------------------------------------------------------------------
// MD Helpers
// ---------------------------------------------------------------------------

function mdEscape(text: unknown): string {
  const str = text == null ? "" : String(text);
  return str.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function mdTable(
  header: string[],
  rows: string[][],
): string {
  const h = "| " + header.join(" | ") + " |\n";
  const sep = "| " + header.map(() => "---").join(" | ") + " |\n";
  const body = rows
    .map((r) => "| " + r.map((c) => mdEscape(c)).join(" | ") + " |")
    .join("\n");
  return "\n" + h + sep + body + "\n";
}

// ---------------------------------------------------------------------------
// generateMD
// ---------------------------------------------------------------------------

export function generateMD(
  data: AgentDetailData,
  monthlySummaries: AgentPeriodSummary[],
  temuanDisplayItems: TemuanDisplayItemExport[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[],
  selectedYear: number,
): string {
  const peserta = data.peserta;
  const masaKerja = computeTenure(peserta.bergabung_date);
  const lines: string[] = [];

  // Title
  lines.push("# Laporan Audit Agent: " + peserta.nama + "\n");

  // Profile
  lines.push("## Profil Agent\n");
  lines.push(
    mdTable(
      ["Atribut", "Nilai"],
      [
        ["Nama", peserta.nama],
        ["Tim", peserta.tim],
        ["Batch", peserta.batch_name],
        ["Jabatan", peserta.jabatan ?? "Agent"],
        ["Masa Kerja", masaKerja],
        ["Tahun Laporan", String(selectedYear)],
      ],
    ),
  );

  // Monthly Summaries
  lines.push("\n## Ringkasan Skor per Bulan\n");
  if (monthlySummaries.length === 0) {
    lines.push("_Tidak ada data ringkasan untuk periode ini._\n");
  } else {
    lines.push(
      mdTable(
        ["Bulan", "Skor Final", "NC Score", "CR Score", "Sesi", "Temuan"],
        monthlySummaries.map((s) => [
          s.label,
          String(s.finalScore),
          String(s.nonCriticalScore),
          String(s.criticalScore),
          String(s.sessionCount),
          String(s.findingsCount),
        ]),
      ),
    );
  }

  // Detail Temuan
  lines.push("\n## Detail Temuan\n");
  if (temuanDisplayItems.length === 0) {
    lines.push("_Tidak ada temuan untuk periode ini._\n");
  } else {
    lines.push(
      mdTable(
        ["Bulan", "Tahun", "Indikator", "Kategori", "Nilai", "Ketidaksesuaian", "Sebaiknya", "No Tiket"],
        temuanDisplayItems.map((t) => [
          MONTHS_FULL[t.month - 1] ?? String(t.month),
          String(t.year),
          t.indicatorName,
          t.category,
          formatNilai(t.nilai),
          t.ketidaksesuaian ?? "-",
          t.sebaiknya ?? "-",
          t.no_tiket ?? "-",
        ]),
      ),
    );
  }

  // Top Tickets
  lines.push("\n## Top 5 Pengurang Skor Terbesar\n");
  if (topTickets.length === 0) {
    lines.push("_Tidak ada tiket yang menurunkan skor._\n");
  } else {
    lines.push(
      mdTable(
        ["#", "No Tiket", "Score Deduction", "Jumlah Temuan", "Parameter Terberat"],
        topTickets.map((t, i) => [
          String(i + 1),
          t.no_tiket,
          t.scoreDeduction.toFixed(1),
          String(t.findingCount),
          t.heaviestParam,
        ]),
      ),
    );
  }

  // Root Causes
  lines.push("\n## Analisis Akar Masalah (Root Causes)\n");
  if (activeRootCauses.length === 0) {
    lines.push("_Belum ada pola akar masalah yang dominan._\n");
  } else {
    for (const cause of activeRootCauses) {
      lines.push("### " + cause.label + "\n");
      lines.push("- **Prioritas**: " + cause.priority);
      lines.push("- **Jumlah Temuan**: " + cause.findingsCount);
      lines.push("- **Tiket Terdampak**: " + cause.affectedTickets);
      lines.push("- **Temuan Critical**: " + cause.criticalFindingsCount);
      lines.push("- **Rata-rata Nilai**: " + cause.averageNilai.toFixed(2));
      lines.push("- **Rekomendasi**: " + cause.recommendation);
      lines.push("");
    }
  }

  // Trend Data
  if (data.personalTrend && data.personalTrend.labels.length > 0) {
    lines.push("\n## Data Tren\n");
    lines.push(
      mdTable(
        ["Periode", ...data.personalTrend.datasets.map((ds) => ds.label)],
        data.personalTrend.labels.map((label, i) => [
          label,
          ...data.personalTrend.datasets.map((ds) => {
            const val = ds.data[i];
            return val != null ? String(val) : "-";
          }),
        ]),
      ),
    );
  }

  // Comparison Table
  if (data.comparisonTable && data.comparisonTable.rows.length > 0) {
    const scope = data.comparisonTable.scope;
    const startLabel = MONTHS_SHORT[(scope.startMonth ?? 1) - 1];
    const endLabel = MONTHS_SHORT[(scope.endMonth ?? 12) - 1];
    lines.push("\n## Benchmark Temuan\n");
    lines.push(
      "_" + startLabel + "-" + endLabel + " " + scope.year +
      " • Layanan " + (scope.serviceLabel || scope.serviceType) +
      " • " + scope.teamLabel + "_\n",
    );
    lines.push(
      mdTable(
        ["Parameter", "Agent Ini", "Rata-rata Tim", "Rata-rata Service"],
        data.comparisonTable.rows.map((row) => [
          row.label,
          String(row.agentCount),
          String(row.teamAverage),
          String(row.serviceAverage),
        ]),
      ),
    );
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// HTML generation helpers
// ---------------------------------------------------------------------------

function escHtml(s: unknown): string {
  const str = s == null ? "" : String(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function finiteNumber(value: unknown, fallback = 0, min = -Infinity, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function numberText(value: unknown, fallback = 0): string {
  return String(finiteNumber(value, fallback));
}

function yearText(value: unknown, fallback = 0): string {
  return String(Math.trunc(finiteNumber(value, fallback)));
}

function scoreColor(score: number): string {
  if (finiteNumber(score) >= 85) return "#22c55e";
  if (finiteNumber(score) >= 70) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Baik";
  if (score >= 70) return "Cukup";
  return "Perlu Perhatian";
}

function deltaStyle(delta: number | null): string {
  if (delta === null) return "color: #6b7280;";
  return delta >= 0 ? "color: #22c55e;" : "color: #ef4444;";
}

// ---------------------------------------------------------------------------
// HTML section builders
// ---------------------------------------------------------------------------

function buildProfileHtml(
  peserta: AgentDetailData["peserta"],
  masaKerja: string,
  quickviewHtml = "",
  isStaff = true,
): string {
  const avatarContent = peserta.foto_url
    ? '<img src="' + escHtml(peserta.foto_url) + '" alt="' + escHtml(peserta.nama) + '" />'
    : escHtml(peserta.nama.charAt(0).toUpperCase());
  const downloadIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10m0 0 4-4m-4 4-4-4M5 17.5V19h14v-1.5"/></svg>';
  const chevronIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const plusIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  return [
    '<div class="profile-bar">',
    '  <div class="profile-inner">',
    '    <div class="profile-main">',
    '      <div class="profile-avatar">',
    '        <div class="profile-avatar-inner">' + avatarContent + '</div>',
    '      </div>',
    '      <div class="profile-info">',
    '        <div class="profile-name">' + escHtml(peserta.nama) + '</div>',
    '        <div class="profile-meta">',
    '          <span>&#128101; ' + escHtml(peserta.tim) + '</span>',
    '          <span>&bull;</span>',
    '          <span>&#128197; ' + escHtml(peserta.batch_name) + '</span>',
    '          <span>&bull;</span>',
    '          <span>&#128188; ' + escHtml(peserta.jabatan || "Agent") + '</span>',
    '          <span>&bull;</span>',
    '          <span>&#9201; ' + escHtml(masaKerja) + '</span>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div class="profile-actions" aria-label="Aksi laporan">',
    '      <span class="profile-action profile-action-secondary" aria-hidden="true">',
    '        <span class="profile-action-icon">' + downloadIcon + '</span>',
    '        <span>UNDUH LAPORAN</span>',
    '        <span class="profile-action-icon">' + chevronIcon + '</span>',
    '      </span>',
    isStaff
      ? '      <span class="profile-action profile-action-primary" aria-hidden="true"><span class="profile-action-icon">' + plusIcon + '</span><span>INPUT AUDIT</span></span>'
      : '',
    '    </div>',
    '  </div>',
    quickviewHtml,
    '</div>',
  ].join("\n");
}

function buildQuickviewHtml(quickview: SidakAgentQuickviewResponse | null | undefined): string {
  if (!quickview) return "";
  const sameScope = quickview.combinedTeam?.scopeId != null && quickview.combinedTeam.scopeId === quickview.leaderTeam?.scopeId;
  const rankMetric = (label: string, metric: SidakAgentQuickviewResponse["combinedTeam"], sameAsCombined = false): string => {
    const hasRank = metric?.rank != null;
    const supportingText = !metric ? "Ranking belum tersedia" : sameAsCombined ? "Cohort yang sama dengan Tim Gabungan" : hasRank ? metric.scopeLabel : finiteNumber(metric.total) > 0 ? "Agent belum masuk ranking pada konteks ini" : "Belum ada agent pembanding";
    const peers = metric?.tiedAgents ?? null;
    const tie = peers?.length && metric?.rank != null
      ? peers.length <= 2
        ? `<p class="quickview-tie">Berbagi peringkat ${numberText(metric.rank)} dengan ${peers.map((peer) => escHtml(peer.nama)).join(peers.length === 2 ? " dan " : "")}</p>`
        : `<details class="quickview-ties"><summary>Berbagi peringkat ${numberText(metric.rank)} dengan ${escHtml(peers[0].nama)} dan ${peers.length - 1} agen lain</summary><ul>${peers.map((peer) => `<li>${escHtml(peer.nama)}</li>`).join("")}</ul></details>`
      : "";
    return `<div role="group" aria-label="${escHtml(label)}: ${hasRank ? `peringkat ${numberText(metric?.rank)}` : "belum tersedia"}"><strong>${escHtml(label)}</strong><b>${hasRank ? `#${numberText(metric?.rank)} dari ${numberText(metric?.total)}` : "—"}</b><small>${escHtml(supportingText)}</small>${tie}</div>`;
  };
  const forecast = quickview.forecast;
  const completeRanking = quickview.combinedTeam?.rank != null && quickview.leaderTeam?.rank != null;
  return `<div class="quickview-rail" role="region" aria-label="Quickview performa agent">
    ${rankMetric("Tim Gabungan", quickview.combinedTeam)}
    ${rankMetric("Tim Leader", quickview.leaderTeam, sameScope)}
    <div role="group" aria-label="Forecast: ${escHtml(forecast?.label ?? "belum tersedia")}"><strong>Forecast 3 bulan</strong><b>${escHtml(forecast?.label ?? "—")}</b><small>${escHtml(forecast?.supportingText ?? "Forecast belum tersedia")}</small></div>
    ${completeRanking ? '<p>Semakin tinggi peringkat, semakin sedikit temuan YTD. Peringkat terakhir menunjukkan jumlah temuan terbanyak. Jumlah yang sama mendapat peringkat yang sama.</p>' : ""}
  </div>`;
}

function buildDossierHtml(monthlySummaries: AgentPeriodSummary[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[],
  variant: AgentHtmlVariant,
  selectedMonth: number | null): string {
  if (monthlySummaries.length === 0) return "";
  const latest = (selectedMonth
    ? monthlySummaries.find((summary) => summary.month === selectedMonth)
    : null) ?? monthlySummaries[monthlySummaries.length - 1];
  const sColor = scoreColor(latest.finalScore);
  const sLabel = scoreLabel(latest.finalScore);
  const safeMonth = Math.trunc(finiteNumber(latest.month, 1, 1, 12));
  const monthLabel = (MONTHS_FULL[safeMonth - 1]?.slice(0, 3) ?? "") + " " + numberText(latest.year);
  const latestIndex = monthlySummaries.findIndex((summary) => summary.id === latest.id);
  const prev = latestIndex > 0 ? monthlySummaries[latestIndex - 1] : null;
  const delta = prev ? latest.finalScore - prev.finalScore : null;
  const safeFinalScore = finiteNumber(latest.finalScore, 0, 0, 100);
  const pct = safeFinalScore;

  const deltaText = delta !== null
    ? (delta > 0 ? "+" : "") + finiteNumber(delta).toFixed(1) + "%"
    : "-";

  // Build tickets HTML
  let ticketsHtml: string;
  if (topTickets.length === 0) {
    ticketsHtml = '<p style="text-align:center;padding:1.5rem 0;color:#6b7280;font-size:0.75rem;font-weight:700;text-transform:uppercase;">Tidak ada tiket yang menurunkan skor</p>';
  } else {
    ticketsHtml = topTickets
      .map(function (t, i) {
        return [
          '<div class="ticket-item">',
          '  <span class="ticket-rank">#' + (i + 1) + "</span>",
          "  <div>",
          '    <div style="display:flex;align-items:center;gap:0.375rem;">',
          '      <span class="ticket-id-label">ID</span>',
          '      <span class="ticket-id">' + escHtml(t.no_tiket) + "</span>",
          "    </div>",
          '    <p class="ticket-param">"' + escHtml(t.heaviestParam) + '"</p>',
          "  </div>",
          '  <div style="text-align:right;">',
          '    <div class="ticket-deduction">',
          '      <span class="ticket-deduction-value">' +
            finiteNumber(t.scoreDeduction).toFixed(1) +
            "</span>",
          '      <span class="ticket-deduction-label">Poin</span>',
          "    </div>",
          '    <div class="ticket-count">' + numberText(t.findingCount) + " Temuan</div>",
          "  </div>",
          "</div>",
        ].join("\n");
      })
      .join("\n");
  }

  // Build root causes HTML
  let causesHtml: string;
  if (activeRootCauses.length === 0) {
    causesHtml = '<p style="text-align:center;padding:1.5rem 0;color:#6b7280;font-size:0.75rem;font-weight:700;text-transform:uppercase;">Belum ada pola akar masalah yang dominan</p>';
  } else {
    causesHtml = activeRootCauses
      .map(function (cause) {
        const keywordTag = cause.matchedKeywords[0]
          ? "<span>Keyword: " + escHtml(cause.matchedKeywords[0]) + "</span>"
          : "";
        const ticketDisclosure = cause.ticketReferences?.length
          ? '<details class="root-cause-tickets"' + (variant === "static" ? " open" : "") + '><summary>' + (variant === "static" ? "Tiket terkait" : "Tampilkan tiket") + '</summary><ul>' + cause.ticketReferences.map((ticket) => '<li><strong>' + escHtml(ticket.no_tiket) + '</strong> · ' + escHtml(ticket.periodLabel) + ' · ' + numberText(ticket.findingsCount) + ' temuan</li>').join("") + '</ul></details>'
          : "";
        return [
          '<div class="cause-box">',
          '  <div class="cause-primary-badges"><span>Utama</span>' + (finiteNumber(cause.criticalFindingsCount) > 0 ? '<span class="critical">◉ ' + numberText(cause.criticalFindingsCount) + ' critical</span>' : '') + '</div>',
          '  <div class="cause-label">' + escHtml(cause.label) + "</div>",
          '  <div class="cause-stats">',
          "    <span>" + numberText(cause.findingsCount) + " temuan</span>",
          "    <span>" + numberText(cause.affectedTickets) + " tiket</span>",
          "    " + keywordTag,
          "  </div>",
          '  <div class="cause-recommendation">' +
            escHtml(cause.recommendation) +
            "</div>",
          "  " + ticketDisclosure,
          "</div>",
        ].join("\n");
      })
      .join("\n");
  }

  return [
    '<div class="audit-dossier">',
    '  <div class="dossier-score-strip">',
    '    <div class="score-section dossier-score-panel">',
    '  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.25rem 0.75rem;margin-bottom:0.25rem;">',
    '    <span style="font-size:0.625rem;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">' + escHtml(monthLabel) + '</span>',
    '    <span style="font-size:0.625rem;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:' + sColor + ';">' + sLabel + '</span>',
    '  </div>',
    '  <div style="display:flex;align-items:baseline;gap:0.375rem;">',
    '    <span style="font-size:2.25rem;font-weight:900;letter-spacing:-0.03em;line-height:1;color:' + sColor + ';">' + safeFinalScore.toFixed(1) + '</span>',
    '    <span style="font-size:0.875rem;font-weight:900;color:rgba(107,114,128,0.4);">%</span>',
    '  </div>',
    '  <div class="score-bar" style="margin-top:0.5rem;">',
    '    <div class="score-bar-fill" style="width:' + pct + '%;background:' + sColor + ';"></div>',
    '  </div>',
    '  <div style="display:flex;gap:2rem;padding-top:0.75rem;border-top:1px solid #e5e7eb;margin-top:0.75rem;">',
    '    <div class="stat-cell">',
    '      <span class="stat-label">Sesi</span>',
    '      <span class="stat-value">' + numberText(latest.sessionCount) + '</span>',
    '    </div>',
    '    <div class="stat-cell">',
    '      <span class="stat-label">Temuan</span>',
    '      <span class="stat-value">' + numberText(latest.findingsCount) + '</span>',
    '    </div>',
    '    <div class="stat-cell">',
    '      <span class="stat-label">Delta</span>',
    '      <span class="stat-value" style="' + deltaStyle(delta) + '">' + deltaText + '</span>',
    '    </div>',
    '  </div>',
    '    </div>',
    '  </div>',
    '',
    '  <div class="dossier-lower-row">',
    '<div class="score-section dossier-ticket-column">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;padding-bottom:0.625rem;margin-bottom:0.5rem;">',
    '    <h4 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#111827;">Top 5 Pengurang Skor Terbesar</h4>',
    '    <span style="font-size:0.5625rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">' + topTickets.length + ' Tiket</span>',
    '  </div>',
    '  ' + ticketsHtml,
    '</div>',
    '',
    '<div class="score-section dossier-root-cause-column">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;padding-bottom:0.625rem;margin-bottom:1rem;">',
    '    <div>',
    '      <h4 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#111827;">Diagnosis Akar Masalah</h4>',
    '      <p style="font-size:0.75rem;font-weight:500;color:#6b7280;margin-top:0.125rem;">Berdasarkan temuan periode aktif</p>',
    '    </div>',
    '    <span style="font-size:0.625rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;">' + activeRootCauses.length + ' Pola</span>',
    '  </div>',
    '  ' + causesHtml,
    '</div>',
    '  </div>',
    '</div>',
  ].join("\n");
}

function buildComparisonHtml(data: AgentDetailData): string {
  if (!data.comparisonTable || data.comparisonTable.rows.length === 0) {
    return "";
  }
  const scope = data.comparisonTable.scope;
  const rows = data.comparisonTable.rows;
  const startLabel = MONTHS_SHORT[(scope.startMonth ?? 1) - 1];
  const endLabel = MONTHS_SHORT[(scope.endMonth ?? 12) - 1];
  const totalRow = rows.find(function (r) { return r.key === "total"; });
  const scopeLine = startLabel + "-" + endLabel + " " + yearText(scope.year) +
    " &#8226; Layanan " + escHtml(scope.serviceLabel || scope.serviceType) +
    " &#8226; " + escHtml(scope.teamLabel) +
    " &#8226; " + numberText(totalRow?.teamAgentCount) + " agent tim / " +
    numberText(totalRow?.serviceAgentCount) + " agent service sama";

  const tableRows = rows.map(function (row) {
    const cls = row.key === "total" ? ' class="total-row"' : "";
    const teamDelta = calculateComparisonDelta(row.agentCount, row.teamAverage);
    const serviceDelta = calculateComparisonDelta(
      row.agentCount,
      row.serviceAverage,
    );
    return [
      '<tr' + cls + '>',
      '  <td>' + escHtml(row.label) + '</td>',
      '  <td class="num">' + numberText(row.agentCount) + '</td>',
      '  <td class="num muted">' + finiteNumber(row.teamAverage).toFixed(1) + '</td>',
      '  <td class="num muted">' + finiteNumber(row.serviceAverage).toFixed(1) + '</td>',
      '  <td class="num ' + comparisonDeltaClass(teamDelta) + '">' +
        formatComparisonDelta(teamDelta) + '</td>',
      '  <td class="num ' + comparisonDeltaClass(serviceDelta) + '">' +
        formatComparisonDelta(serviceDelta) + '</td>',
      '</tr>',
    ].join("\n");
  }).join("\n");

  return [
    '<div class="card">',
    '  <div class="section-header">',
    '    <h4>Benchmark Temuan</h4>',
    '    <p class="section-subtitle">' + scopeLine + '</p>',
    '  </div>',
    '  <div class="table-scroll">',
    '  <table class="comparison-table">',
    '    <thead>',
    '      <tr>',
    '        <th>Parameter</th>',
    '        <th class="num">Agent ini</th>',
    '        <th class="num">Rata-rata tim</th>',
    '        <th class="num">Rata-rata service sama</th>',
    '        <th class="num">% vs tim</th>',
    '        <th class="num">% vs service sama</th>',
    '      </tr>',
    '    </thead>',
    '    <tbody>',
    '      ' + tableRows,
    '    </tbody>',
    '  </table>',
    '  </div>',
    '</div>',
  ].join("\n");
}

function calculateComparisonDelta(
  agentCount: number,
  average: number,
): number | null {
  const safeAgentCount = finiteNumber(agentCount);
  const safeAverage = finiteNumber(average);
  if (safeAverage === 0) return safeAgentCount === 0 ? 0 : null;
  return finiteNumber(((safeAgentCount - safeAverage) / safeAverage) * 100);
}

function formatComparisonDelta(value: number | null): string {
  if (value === null) return "n/a";
  const rounded = Math.round(finiteNumber(value) * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return "0%";
  const sign = rounded > 0 ? "+" : "-";
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1,
  }).format(Math.abs(rounded));
  return sign + formatted + "%";
}

function comparisonDeltaClass(value: number | null): string {
  if (value === null || value === 0) return "muted";
  return value > 0 ? "delta-adverse" : "delta-favorable";
}

function buildFindingsHtml(
  temuanDisplayItems: TemuanDisplayItemExport[],
): string {
  if (temuanDisplayItems.length === 0) {
    return '<p style="text-align:center;padding:2rem 0;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;font-size:0.75rem;">Tidak ada data temuan untuk konteks ini</p>';
  }

  const grouped = new Map<string, TemuanDisplayItemExport[]>();
  temuanDisplayItems.forEach(function (item) {
    const key = item.year + "-" + String(item.month).padStart(2, "0");
    const items = grouped.get(key) ?? [];
    items.push(item);
    grouped.set(key, items);
  });

  return Array.from(grouped.entries())
    .sort(function ([a], [b]) { return b.localeCompare(a); })
    .map(function ([, monthItems]) {
      const first = monthItems[0];
      const tickets = new Map<string, { label: string; items: TemuanDisplayItemExport[] }>();
      monthItems.forEach(function (item) {
        const rawTicket = (item.no_tiket ?? "").trim();
        const key = rawTicket ? rawTicket.toUpperCase() : "audit-" + item.id;
        const ticket = tickets.get(key) ?? {
          label: rawTicket ? rawTicket.toUpperCase() : "AUDIT INTERNAL",
          items: [],
        };
        ticket.items.push(item);
        tickets.set(key, ticket);
      });

      const ticketHtml = Array.from(tickets.values())
        .map(function (ticket, ticketIndex) {
          const itemsHtml = ticket.items.map(function (item) {
            const badgeClass = item.category === "critical"
              ? "badge-critical"
              : "badge-non-critical";
            return [
              '<article class="finding-item">',
              '<div class="finding-score"><strong>' + numberText(item.nilai) + '</strong><span>' +
                escHtml(nilaiLabel(item.nilai)) + '</span></div>',
              '<div class="finding-body">',
              '<span class="badge ' + badgeClass + '">' + escHtml(item.category) + '</span>',
              '<h5>' + escHtml(item.indicatorName) + '</h5>',
              '<div class="finding-copy-grid">',
              '<div><span>Ketidaksesuaian</span><p>' + escHtml(item.ketidaksesuaian ?? "—") + '</p></div>',
              '<div><span class="recommendation-label">Rekomendasi</span><p class="recommendation-copy">' +
                escHtml(item.sebaiknya ?? "—") + '</p></div>',
              '</div>',
              '</div>',
              '</article>',
            ].join("");
          }).join("");

          return [
            '<div class="findings-ticket">',
            '<div class="findings-ticket-head">',
            '<span class="ticket-index">#' + (ticketIndex + 1) + '</span>',
            '<div><span>No Tiket</span><strong>' + escHtml(ticket.label) + '</strong></div>',
            '<small>' + numberText(ticket.items.length) + ' Parameter</small>',
            '</div>',
            itemsHtml,
            '</div>',
          ].join("");
        }).join("");

      const monthLabel = (MONTHS_FULL[first.month - 1] ?? String(first.month)) +
        " " + first.year;
      const open = "";
      return [
        '<details class="findings-period"' + open + '>',
        '<summary>',
        '<span class="findings-month-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span>',
        '<span class="findings-period-copy"><strong>' + escHtml(monthLabel) + '</strong><small>' +
          numberText(monthItems.length) + ' Temuan &bull; ' + numberText(tickets.size) + ' Tiket</small></span>',
        '<span class="disclosure-icon" aria-hidden="true"></span>',
        '</summary>',
        '<div class="findings-period-content">' + ticketHtml + '</div>',
        '</details>',
      ].join("");
    }).join("");
}

// ---------------------------------------------------------------------------
// Live page shell
// ---------------------------------------------------------------------------

function buildLiveShellHtml(data: AgentDetailData): string {
  return `<header class="page-header">
    <div class="back-heading"><span class="back-button" aria-hidden="true">←</span><div><p>SIDAK PERSONAL AUDIT</p><h1>${escHtml(data.peserta.nama)}</h1></div></div>
    <span class="shell-refresh" aria-hidden="true">↻ Refresh</span>
  </header>`;
}

function buildLiveContextHtml(
  data: AgentDetailData,
  selectedYear: number,
  selectedService: string,
  context: AgentHtmlExportContext,
): string {
  const start = context.trendStartMonth ?? 1;
  const end = context.trendEndMonth ?? data.initialTrendRange.end;
  return `<div class="context-control-bar" aria-label="Kontrol konteks audit">
    <div class="context-primary"><label><span>Tahun</span><select disabled><option>${yearText(selectedYear)}</option></select></label><div class="service-pills"><span class="context-label">Layanan</span><span class="service-pill">${escHtml(selectedService.toUpperCase())}</span></div></div>
    <label class="trend-control"><span>Trend</span><select disabled><option>${escHtml(MONTHS_SHORT[start - 1] ?? start)}</option></select><b>→</b><select disabled><option>${escHtml(MONTHS_SHORT[end - 1] ?? end)}</option></select></label>
    <div class="agent-switchers"><select disabled><option>Folder...</option></select><select disabled><option>${escHtml(data.peserta.nama)}</option></select></div>
  </div><nav class="section-tabs" aria-label="Navigasi bagian laporan">
    <a href="#section-summary">Ringkasan Skor</a><a href="#section-trend">Grafik Tren</a><a href="#section-temuan">Daftar Temuan</a>
  </nav>`;
}

function buildMonthRailHtml(summaries: AgentPeriodSummary[], selectedMonth: number | null): string {
  if (!summaries.length) return "";
  const activeMonth = selectedMonth ?? summaries[summaries.length - 1].month;
  return `<div class="month-rail" aria-label="Bulan audit terpilih">${summaries.map((summary) => {
    const active = activeMonth === summary.month;
    const safeScore = finiteNumber(summary.finalScore, 0, 0, 100);
    const width = Math.max(20, Math.min(100, safeScore));
    const scoreMark = safeScore < 95
      ? '<span class="month-score-indicator" aria-hidden="true"></span>'
      : '';
    return `<span class="month-chip${active ? " active" : ""}" aria-current="${active ? "true" : "false"}"><span>${escHtml(MONTHS_SHORT[summary.month - 1] ?? summary.month)}</span><strong>${safeScore.toFixed(1)}%</strong>${scoreMark}<i style="width:${width}%"></i></span>`;
  }).join("")}</div>`;
}

// ---------------------------------------------------------------------------
// generateHTML
// ---------------------------------------------------------------------------

export function generateHTML(
  data: AgentDetailData,
  monthlySummaries: AgentPeriodSummary[],
  temuanDisplayItems: TemuanDisplayItemExport[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[],
  selectedYear: number,
  selectedService: string,
  variant: AgentHtmlVariant = "static",
  context: AgentHtmlExportContext = {},
): string {
  const peserta = data.peserta;
  const masaKerja = computeTenure(peserta.bergabung_date);
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const quickviewHtml = buildQuickviewHtml(context.quickview);
  const profileHtml = buildProfileHtml(peserta, masaKerja, quickviewHtml, context.isStaff ?? true);
  const activeMonth = context.selectedMonth ?? monthlySummaries[monthlySummaries.length - 1]?.month ?? null;
  const dossierHtml = buildDossierHtml(monthlySummaries, topTickets, activeRootCauses, variant, activeMonth);
  const trendHtml = buildTrendReportHtml(data, variant, selectedYear);
  const comparisonHtml = buildComparisonHtml(data);
  const findingsHtml = buildFindingsHtml(temuanDisplayItems);
  const interactiveScript = buildInteractiveReportScript(variant);
  const liveShellHtml = buildLiveShellHtml(data);
  const liveContextHtml = buildLiveContextHtml(data, selectedYear, selectedService, context);
  const monthRailHtml = buildMonthRailHtml(monthlySummaries, context.selectedMonth ?? null);
  const summaryEmptyHtml = monthlySummaries.length === 0
    ? '<div class="summary-empty"><strong>Data belum tersedia</strong><p>Belum ada ringkasan skor untuk layanan ' + escHtml(selectedService.toUpperCase()) + ' di tahun ' + yearText(selectedYear) + '.</p></div>'
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="id">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Laporan Audit - ' + escHtml(peserta.nama) + '</title>',
    '<style>',
    '  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }',
    '  html { font-size: 16px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
    '  body {',
    '    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
    '    background: #f8fafc;',
    '    color: #111827;',
    '    line-height: 1.5;',
    '    overflow-x: hidden;',
    '    padding: clamp(1rem, 3vw, 2.5rem);',
    '  }',
    '  .container { width: 100%; max-width: 1180px; margin: 0 auto; min-width: 0; }',
    '  .card {',
    '    background: #ffffff;',
    '    border: 1px solid #e2e8f0;',
    '    border-radius: 1rem;',
    '    padding: 1.5rem;',
    '    margin-bottom: 1.25rem;',
    '  }',
    '  .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }',
    '  .card-header h3 {',
    '    font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '    font-size: 1.125rem; font-weight: 700; letter-spacing: -0.02em; color: #111827;',
    '  }',
    '  .card-header p {',
    '    font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.05em;',
    '    text-transform: uppercase; color: #6b7280;',
    '  }',
    '  .report-section { margin: 0 0 2rem; min-width: 0; }',
    '  .report-section-heading { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }',
    '  .report-section-heading h2 { font-size: 1.125rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.02em; color: #0f172a; }',
    '  .report-section-heading p { margin-top: 0.25rem; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #64748b; }',
    '  .section-icon { display: inline-flex; width: 2.5rem; height: 2.5rem; flex: none; align-items: center; justify-content: center; border-radius: 0.5rem; background: #f1f5f9; color: #64748b; }',
    '  .section-icon svg, .findings-month-icon svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }',
    '  .section-header { margin-bottom: 1rem; }',
    '  .section-header h4 {',
    '    font-family: Outfit, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '    font-size: 0.875rem; font-weight: 700; color: #111827;',
    '  }',
    '  .section-subtitle { font-size: 0.6875rem; font-weight: 500; color: #6b7280; margin-top: 0.25rem; }',
    '  .table-scroll { width: 100%; max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; }',
    '  .trend-card { padding: clamp(1.25rem, 3vw, 2rem); }',
    '  .trend-intro { max-width: 48rem; }',
    '  .trend-kicker { color: #64748b; font-size: 0.625rem; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; }',
    '  .trend-intro h3 { margin-top: 0.45rem; color: #0f172a; font-size: clamp(1.35rem, 3vw, 1.875rem); font-weight: 900; line-height: 1.15; letter-spacing: -0.035em; text-wrap: balance; }',
    '  .trend-intro > p:last-child { margin-top: 0.5rem; max-width: 68ch; color: #64748b; font-size: 0.75rem; font-weight: 500; }',
    '  .trend-chart-shell { margin-top: 1.5rem; padding: clamp(0.5rem, 2vw, 1rem); border: 1px solid #e2e8f0; border-radius: 1rem; background: #fbfdff; }',
    '  .trend-chart { display: block; width: 100%; height: auto; min-width: 0; }',
    '  .trend-figure { width: 100%; min-width: 0; }',
    '  .chart-grid { stroke: #e5e7eb; stroke-width: 1; }',
    '  .chart-axis-label { fill: #6b7280; font-size: 11px; font-weight: 600; }',
    '  .chart-legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin-top: 0.875rem; color: #475569; font-size: 0.75rem; }',
    '  .chart-legend-item { display: inline-flex; align-items: center; gap: 0.375rem; }',
    '  .legend-dot { width: 0.5rem; height: 0.5rem; border-radius: 9999px; flex: none; }',
    '  .trend-filters { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.5rem; }',
    '  .trend-filter { display: inline-flex; min-height: 2.5rem; align-items: center; gap: 0.45rem; border: 1px solid #cbd5e1; border-radius: 0.75rem; background: #fff; color: #475569; padding: 0.5rem 0.8rem; font: inherit; font-size: 0.625rem; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; transition: transform 160ms ease-out, border-color 160ms ease-out, background 160ms ease-out, color 160ms ease-out; }',
    '  .trend-filter:hover { border-color: #94a3b8; color: #0f172a; }',
    '  .trend-filter[aria-pressed="true"] { border-color: #111827; background: #111827; color: #ffffff; transform: translateY(-1px); }',
    '  .trend-filter[aria-pressed="true"] .legend-dot { background: #ffffff !important; }',
    '  .trend-filter:focus-visible { outline: 3px solid rgba(37,99,235,0.3); outline-offset: 2px; }',

    '  .trend-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; margin-top:1.5rem; padding-top:1.5rem; border-top:1px solid #e2e8f0; } .trend-stat, .trend-insight { padding:1.25rem; border:1px solid #e2e8f0; border-radius:1rem; background:#fff; } .trend-insight { grid-column:span 2; display:flex; align-items:center; gap:1rem; background:rgba(37,99,235,.05); border-color:rgba(37,99,235,.1); }',
    '  .trend-stat span, .trend-insight span { display: block; color: #64748b; font-size: 0.625rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }',
    '  .trend-stat strong { display: inline-block; margin-top: 0.35rem; color: #0f172a; font-size: 2rem; font-weight: 900; line-height: 1; }',
    '  .trend-stat small { margin-left: 0.5rem; color: #64748b; font-size: 0.625rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }',
    '  .trend-insight p { margin-top: 0.5rem; max-width: 68ch; color: #475569; font-size: 0.8125rem; line-height: 1.6; }',
    '  @media (max-width: 640px) { .trend-stats { grid-template-columns:1fr; gap:1rem; } .trend-insight { grid-column:auto; } .trend-filter { width:100%; justify-content:flex-start; } }',
    '  @media (prefers-reduced-motion: reduce) { .trend-filter { transition: none; } }',
    '  .empty-state { padding: 2rem 0; text-align: center; color: #6b7280; font-size: 0.875rem; } .summary-empty { padding:3rem 1rem; text-align:center; } .summary-empty strong { color:#64748b; font-size:1.125rem; } .summary-empty p { margin-top:0.5rem; color:#64748b; font-size:0.8125rem; }',
    '  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }',
    '  [hidden] { display: none !important; }',
    '  @media print {',
    '    @page { size: A4 landscape; margin: 10mm; }',
    '    body { background: white; padding: 0.5in; }',
    '    .card { break-inside: auto; border: 1px solid #ddd; }',
    '    .profile-bar, .score-section, .trend-figure { break-inside: avoid; }',
    '    .table-scroll { overflow: visible; }',
    '    .findings-table { table-layout: fixed; }',
    '    thead { display: table-header-group; }',
    '    tr { break-inside: avoid; }',
    '  }',
    '',
    '  /* Profile Bar */',
    '  .profile-bar {',
    '    background: #ffffff; border: 1px solid #e5e7eb; border-radius: 1rem;',
    '    padding: 1.5rem 2rem; margin-bottom: 1.5rem; overflow: hidden; position: relative;',
    '  }',
    '  .profile-inner {',
    '    display: flex; flex-direction: column; align-items: stretch; justify-content: space-between; gap: 1.5rem;',
    '  }',
    '  .profile-main {',
    '    display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1.5rem; min-width: 0;',
    '  }',
    '  .profile-actions {',
    '    display: flex; flex-direction: column; gap: 0.75rem; width: 100%; align-items: stretch;',
    '  }',
    '  .profile-action {',
    '    display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 2.5rem; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 0 1rem; color: #111827; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; user-select: none;',
    '  }',
    '  .profile-action svg { width: 0.875rem; height: 0.875rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }',
    '  .profile-action-icon { display: inline-flex; align-items: center; justify-content: center; }',
    '  .profile-action-secondary { background: transparent; }',
    '  .profile-action-primary { background: #111827; color: #ffffff; }',
    '  @media (min-width: 768px) {',
    '    .profile-inner { flex-direction: row; align-items: flex-end; }',
    '    .profile-main { flex-direction: row; text-align: left; align-items: flex-end; }',
    '    .profile-actions { width: auto; flex-direction: row; align-items: center; justify-content: flex-end; }',
    '  }',
    '  .profile-avatar {',
    '    width: 6rem; height: 6rem; border-radius: 0.75rem;',
    '    border: 1px solid #e5e7eb; padding: 0.25rem; background: #ffffff; flex-shrink: 0;',
    '  }',
    '  .profile-avatar-inner {',
    '    width: 100%; height: 100%; border-radius: calc(0.75rem - 4px);',
    '    background: #f8f9fb; display: flex; align-items: center; justify-content: center;',
    '    font-size: 2.25rem; font-weight: 900; text-transform: uppercase;',
    '    color: rgba(0,0,0,0.15); overflow: hidden;',
    '  }',
    '  .profile-avatar-inner img { width: 100%; height: 100%; object-fit: cover; border-radius: calc(0.75rem - 4px); }',
    '  .profile-name {',
    '    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
    '    font-size: 1.875rem; font-weight: 900; letter-spacing: -0.02em;',
    '    line-height: 1.2; color: #111827; margin-bottom: 0.75rem;',
    '  }',
    '  .profile-meta {',
    '    display: flex; flex-wrap: wrap; justify-content: center;',
    '    gap: 0.25rem 1rem; font-size: 0.6875rem; font-weight: 600; color: #6b7280;',
    '  }',
    '  @media (min-width: 768px) { .profile-meta { justify-content: flex-start; } }',
    '',
    '  /* Score Section */',
    '  .score-section { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 1rem; padding: 1.25rem; }',
    '  .audit-dossier { overflow:hidden; background:#fff; border:1px solid #e5e7eb; border-radius:1rem; } .dossier-score-strip { padding:1.25rem; } .dossier-score-panel { border:0; padding:0; } .dossier-lower-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.4fr); border-top:1px solid #e5e7eb; } .dossier-lower-row > .score-section { border:0; border-radius:0; margin:0 !important; } .dossier-ticket-column { border-right:1px solid #e5e7eb !important; } .dossier-root-cause-column { min-width:0; }',
    '  .cause-primary-badges { display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:.75rem; } .cause-primary-badges span { display:inline-flex; align-items:center; border:1px solid #e5e7eb; border-radius:999px; padding:.3rem .6rem; font-size:.625rem; font-weight:900; text-transform:uppercase; letter-spacing:.05em; } .cause-primary-badges .critical { border-color:#fecdd3; background:#fff1f2; color:#e11d48; }',
    '  .score-bar {',
    '    height: 0.5rem; border-radius: 9999px; background: #f3f4f6; overflow: hidden;',
    '  }',
    '  .score-bar-fill { height: 100%; border-radius: 9999px; }',
    '  .stat-cell { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }',
    '  .stat-label {',
    '    font-size: 0.5625rem; font-weight: 900; letter-spacing: 0.1em;',
    '    text-transform: uppercase; color: #6b7280;',
    '  }',
    '  .stat-value { font-size: 1rem; font-weight: 900; line-height: 1; color: #111827; }',
    '',
    '  /* Tables */',
    '  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }',
    '  th {',
    '    text-align: left; font-size: 0.625rem; font-weight: 700;',
    '    letter-spacing: 0.05em; text-transform: uppercase; color: #6b7280;',
    '    padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb;',
    '  }',
    '  td {',
    '    padding: 0.625rem 1rem; border-bottom: 1px solid rgba(229,231,235,0.6); color: #111827;',
    '  }',
    '  .num { text-align: right; font-variant-numeric: tabular-nums; }',
    '  .muted { color: #6b7280; }',
    '  .delta-adverse { color: #be123c; font-weight: 700; }',
    '  .delta-favorable { color: #047857; font-weight: 700; }',
    '  .total-row td { font-weight: 600; }',
    '  .badge {',
    '    display: inline-block; padding: 0.125rem 0.5rem; border-radius: 0.375rem;',
    '    font-size: 0.625rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase;',
    '    border: 1px solid;',
    '  }',
    '  .badge-critical { background: rgba(239,68,68,0.1); color: #ef4444; border-color: rgba(239,68,68,0.2); }',
    '  .badge-non-critical { background: rgba(59,130,246,0.1); color: #3b82f6; border-color: rgba(59,130,246,0.2); }',
    '',
    '  /* Grouped Findings */',
    '  .findings-period { border-bottom: 1px solid #e2e8f0; }',
    '  .findings-period:last-child { border-bottom: 0; }',
    '  .findings-period > summary { display: flex; min-height: 4.5rem; align-items: center; gap: 1rem; border-radius: 0.75rem; padding: 0.75rem 1rem; cursor: pointer; list-style: none; transition: background 160ms ease-out; }',
    '  .findings-period > summary::-webkit-details-marker { display: none; }',
    '  .findings-period > summary:hover { background: #f8fafc; }',
    '  .findings-month-icon { display: inline-flex; width: 2.5rem; height: 2.5rem; flex: none; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 0.75rem; color: #64748b; }',
    '  .findings-period-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; }',
    '  .findings-period-copy strong { color: #0f172a; font-size: 0.9375rem; font-weight: 900; text-transform: uppercase; }',
    '  .findings-period-copy small { margin-top: 0.2rem; color: #64748b; font-size: 0.625rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }',
    '  .disclosure-icon { width: 0.55rem; height: 0.55rem; flex: none; border-right: 2px solid #64748b; border-bottom: 2px solid #64748b; transform: rotate(45deg); transition: transform 160ms ease-out; }',
    '  .findings-period[open] .disclosure-icon { transform: rotate(225deg); }',
    '  .findings-period-content { padding: 0.5rem 1rem 1.75rem 4.5rem; }',
    '  .findings-ticket + .findings-ticket { margin-top: 2rem; }',
    '  .findings-ticket-head { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto; align-items: center; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid #e2e8f0; }',
    '  .ticket-index { color: #94a3b8; font-size: 0.75rem; font-style: italic; font-weight: 900; }',
    '  .findings-ticket-head div { display: flex; flex-direction: column; }',
    '  .findings-ticket-head div span { color: #94a3b8; font-size: 0.5rem; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; }',
    '  .findings-ticket-head div strong { margin-top: 0.15rem; color: #0f172a; font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 0.6875rem; font-weight: 900; letter-spacing: 0.04em; }',
    '  .findings-ticket-head small { color: #64748b; font-size: 0.5625rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }',
    '  .finding-item { display: grid; grid-template-columns: 3.5rem minmax(0, 1fr); gap: 1.5rem; padding: 1.5rem 0 0 2.75rem; }',
    '  .finding-score { display: flex; flex-direction: column; align-items: center; padding-top: 0.15rem; }',
    '  .finding-score strong { color: #0f172a; font-size: 1.25rem; font-weight: 900; line-height: 1; }',
    '  .finding-score span { margin-top: 0.25rem; color: #64748b; font-size: 0.5rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }',
    '  .finding-body h5 { margin-top: 0.45rem; color: #0f172a; font-size: 0.9375rem; font-weight: 900; line-height: 1.35; overflow-wrap: anywhere; }',
    '  .finding-copy-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; margin-top: 1rem; }',
    '  .finding-copy-grid span { color: #64748b; font-size: 0.5625rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }',
    '  .finding-copy-grid p { margin-top: 0.35rem; color: #64748b; font-size: 0.75rem; line-height: 1.6; overflow-wrap: anywhere; }',
    '  .finding-copy-grid .recommendation-label { color: #2563eb; }',
    '  .finding-copy-grid .recommendation-copy { color: #334155; font-weight: 700; }',
    '  @media (max-width: 640px) { .findings-period-content { padding-left: 0.75rem; padding-right: 0.75rem; } .finding-item { grid-template-columns: 2.5rem minmax(0, 1fr); gap: 0.75rem; padding-left: 0; } .finding-copy-grid { grid-template-columns: 1fr; gap: 1rem; } .findings-ticket-head { grid-template-columns: 1.5rem minmax(0, 1fr); } .findings-ticket-head small { grid-column: 2; } }',
    '',
    '  /* Ticket Items */',
    '  .ticket-item {',
    '    display: grid; grid-template-columns: auto 1fr auto; align-items: start;',
    '    gap: 0.625rem; padding: 0.75rem 0; border-bottom: 1px solid #f3f4f6;',
    '  }',
    '  .ticket-item:last-child { border-bottom: none; }',
    '  .ticket-rank { font-size: 0.75rem; font-weight: 900; font-style: italic; color: rgba(107,114,128,0.4); width: 1.25rem; }',
    '  .ticket-id-label { font-size: 0.5rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(107,114,128,0.6); }',
    '  .ticket-id {',
    '    font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 0.6875rem;',
    '    font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; color: #111827;',
    '  }',
    '  .ticket-param { font-size: 0.625rem; font-weight: 500; color: #6b7280; }',
    '  .ticket-deduction { color: #f43f5e; }',
    '  .ticket-deduction-value { font-size: 0.75rem; font-weight: 900; }',
    '  .ticket-deduction-label { font-size: 0.5625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }',
    '  .ticket-count { font-size: 0.5rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; }',
    '',
    '  /* Cause Boxes */',
    '  .cause-box {',
    '    border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem;',
    '    background: rgba(248,249,251,0.7); margin-bottom: 0.75rem;',
    '  }',
    '  .cause-box:last-child { margin-bottom: 0; }',
    '  .cause-label { font-size: 0.875rem; font-weight: 900; letter-spacing: -0.01em; color: #111827; margin-bottom: 0.25rem; }',
    '  .cause-stats {',
    '    display: flex; flex-wrap: wrap; gap: 0.5rem;',
    '    font-size: 0.6875rem; font-weight: 600; color: #6b7280; margin-bottom: 0.5rem;',
    '  }',
    '  .cause-recommendation { font-size: 0.8125rem; line-height: 1.5; color: #374151; }',
    '  .root-cause-tickets { margin-top:0.75rem; color:#334155; font-size:0.6875rem; } .root-cause-tickets summary { cursor:pointer; font-weight:800; } .root-cause-tickets ul { margin-top:0.5rem; padding-left:1rem; }',
    '  .page-header { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:0 0 1.25rem; }',
    '  .back-heading { display:flex; align-items:center; gap:0.75rem; } .back-button { display:inline-flex; width:2.25rem; height:2.25rem; align-items:center; justify-content:center; border:1px solid #e5e7eb; border-radius:0.75rem; color:#64748b; font-size:1.25rem; }',
    '  .page-header p, .quickview-rail b { color:#64748b; font-size:0.625rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; } .page-header h1 { color:#111827; font-size:0.875rem; font-weight:800; }',
    '  .context-control-bar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:1rem; padding:.75rem 0; border-top:1px solid #e5e7eb; border-bottom:1px solid #e5e7eb; } .context-primary, .service-pills, .trend-control, .agent-switchers { display:flex; align-items:center; gap:.35rem; } .context-control-bar label, .context-label { color:#64748b; font-size:.5625rem; font-weight:900; letter-spacing:.1em; text-transform:uppercase; } .context-control-bar select, .service-pills .service-pill, .agent-switchers select { height:2.25rem; border:1px solid #e5e7eb; border-radius:.5rem; background:#f8fafc; color:#111827; padding:0 .65rem; font:inherit; font-size:.6875rem; font-weight:800; } .service-pills { padding:.25rem; border:1px solid #e5e7eb; border-radius:.5rem; } .service-pills .service-pill { display:inline-flex; align-items:center; justify-content:center; height:1.75rem; background:#fff; color:#111827; } .trend-control { padding:.35rem .55rem; border:1px solid #e5e7eb; border-radius:.5rem; } .trend-control select { border:0; background:transparent; padding:0; height:1.5rem; } .agent-switchers select:first-child { min-width:7rem; } .agent-switchers select:last-child { min-width:10rem; }',
    '  .quickview-rail { display:grid; grid-template-columns:repeat(3,1fr); margin:1.5rem -2rem -1.5rem; border-top:1px solid #e5e7eb; } .quickview-rail > div { padding:1rem 1.25rem; border-right:1px solid #e5e7eb; } .quickview-rail > div:last-of-type { border-right:0; } .quickview-rail strong, .quickview-rail small { display:block; color:#64748b; font-size:0.6875rem; } .quickview-rail b { display:block; margin-top:0.35rem; color:#111827; font-size:1.125rem; } .quickview-rail p { grid-column:1/-1; padding:0.5rem 1.25rem; border-top:1px solid #e5e7eb; color:#64748b; font-size:0.6875rem; }',
    '  .section-tabs { position:sticky; top:0; z-index:2; display:flex; gap:2rem; margin:0 0 3rem; border-bottom:1px solid #e5e7eb; background:rgba(250,250,250,.96); } .section-tabs a { padding:0.75rem 0; border-bottom:2px solid transparent; color:#64748b; font-size:0.6875rem; font-weight:800; letter-spacing:0.06em; text-decoration:none; text-transform:uppercase; } .section-tabs a:hover, .section-tabs a:focus-visible { border-color:#111827; color:#111827; }',
    '  .month-rail { display:flex; gap:0.375rem; overflow-x:auto; margin-bottom:1.5rem; padding-bottom:0.25rem; } .month-chip { position:relative; min-width:84px; padding:6px 8px 10px; border:1px solid transparent; border-radius:0.5rem; background:transparent; color:#64748b; text-align:left; } .month-chip.active { border-color:#e5e7eb; background:#f5f5f5; color:#111827; } .month-chip span, .month-chip strong { display:block; } .month-chip span { margin-bottom:4px; font-size:10px; font-weight:900; line-height:1; letter-spacing:0.18em; text-transform:uppercase; } .month-chip strong { font-size:16px; font-weight:900; line-height:1; letter-spacing:-0.025em; } .month-chip .month-score-indicator { position:absolute; top:8px; right:8px; width:6px; height:6px; border-radius:9999px; background:#f43f5e; } .month-chip i { position:absolute; bottom:0; left:10px; right:10px; height:3px; border-radius:9999px; background:#f3f4f6; overflow:hidden; } .month-chip i::before { content:""; display:block; width:100%; height:100%; border-radius:9999px; background:#22c55e; opacity:1; transition:opacity 160ms ease-out; } .month-chip:not(.active) { color:#6b7280; } .month-chip:not(.active):hover { color:rgba(17,24,39,0.8); } .month-chip:not(.active) i::before { opacity:0.55; } .month-chip.active i::before { opacity:1; }',
    '  .shell-refresh { display:inline-flex; align-items:center; justify-content:center; border:1px solid #e5e7eb; border-radius:0.75rem; background:transparent; color:#111827; padding:0.55rem 0.75rem; font:inherit; font-size:0.6875rem; font-weight:700; } .shell-refresh[aria-hidden="true"] { pointer-events:none; }',
    '  @media (max-width:640px) { .page-header { align-items:flex-start; flex-direction:column; } .profile-bar { padding:1rem; } .profile-main { width:100%; } .profile-actions { width:100%; } .quickview-rail { margin:1.25rem -1rem -1rem; grid-template-columns:1fr; } .quickview-rail > div { border-right:0; border-bottom:1px solid #e5e7eb; } .quickview-rail > div:last-of-type { border-bottom:0; } .dossier-lower-row { grid-template-columns:1fr; } .dossier-ticket-column { border-right:0 !important; border-bottom:1px solid #e5e7eb !important; } .context-control-bar { justify-content:center; } .context-primary, .trend-control, .agent-switchers { width:100%; justify-content:center; } .agent-switchers select { flex:1; min-width:0 !important; } .section-tabs { gap:1rem; overflow-x:auto; } .section-tabs a { white-space:nowrap; } }',
    '  @media print { .section-tabs { display:none; } .page-header { padding-bottom:0.5rem; } .quickview-rail { break-inside:avoid; } .month-chip { border-color:#e5e7eb; } }',
    '</style>',
    '</head>',
    '<body>',
    '<div class="container" data-report-variant="' + variant + '">',
    liveShellHtml,
    profileHtml,
    liveContextHtml,
    '',
    '<section class="report-section" data-report-section="performance" id="section-summary">',
    '<div class="report-section-heading">',
    '<span class="section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span>',
    '<div><h2>Analisis Performa Bulanan</h2><p>Tahun ' + yearText(selectedYear) + ' &bull; Layanan ' + escHtml(selectedService.toUpperCase()) + '</p></div>',
    '</div>',
    '<div class="card">',
    '  ' + monthRailHtml,
    '  ' + summaryEmptyHtml,
    '  ' + dossierHtml,
    '</div>',
    '</section>',
    '',
    trendHtml,
    '',
    comparisonHtml,
    '',
    '<section class="report-section" data-report-section="findings" id="section-temuan">',
    '<div class="report-section-heading">',
    '<span class="section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg></span>',
    '<div><h2>Riwayat Temuan Detil</h2><p>Dikelompokkan per bulan audit</p></div>',
    '</div>',
    '<div class="card">',
    '  ' + findingsHtml,
    '</div>',
    '</section>',
    '',
    '<div style="text-align:center;padding-top:1rem;font-size:0.6875rem;color:#9ca3af;">',
    '  <p>Laporan Audit SIDAK &mdash; Dihasilkan pada ' + escHtml(dateStr) + '</p>',
    '</div>',
    '',
    '</div>',
    interactiveScript,
    '</body>',
    '</html>',
  ].join("\n");
}
