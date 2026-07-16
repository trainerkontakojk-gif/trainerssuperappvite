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

function scoreColor(score: number): string {
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#f59e0b";
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

function buildProfileHtml(peserta: AgentDetailData["peserta"], masaKerja: string): string {
  const avatarContent = peserta.foto_url
    ? '<img src="' + escHtml(peserta.foto_url) + '" alt="' + escHtml(peserta.nama) + '" />'
    : escHtml(peserta.nama.charAt(0).toUpperCase());

  return [
    '<div class="profile-bar">',
    '  <div class="profile-inner">',
    '    <div class="profile-avatar">',
    '      <div class="profile-avatar-inner">',
    '        ' + avatarContent,
    '      </div>',
    '    </div>',
    '    <div class="profile-info">',
    '      <div class="profile-name">' + escHtml(peserta.nama) + '</div>',
    '      <div class="profile-meta">',
    '        <span>&#128101; ' + escHtml(peserta.tim) + '</span>',
    '        <span>&bull;</span>',
    '        <span>&#128197; ' + escHtml(peserta.batch_name) + '</span>',
    '        <span>&bull;</span>',
    '        <span>&#128188; ' + escHtml(peserta.jabatan || "Agent") + '</span>',
    '        <span>&bull;</span>',
    '        <span>&#9201; ' + escHtml(masaKerja) + '</span>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',
  ].join("\n");
}

function buildSummaryTableHtml(monthlySummaries: AgentPeriodSummary[], _selectedYear: number, _selectedService: string): string {
  if (monthlySummaries.length === 0) {
    return '<p style="text-align:center;padding:2rem 0;color:#9ca3af;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;font-size:0.75rem;">Belum ada ringkasan skor untuk periode ini</p>';
  }

  const rows = monthlySummaries.map(function (s) {
    return [
      '<tr>',
      '  <td>' + escHtml(s.label) + '</td>',
      '  <td class="num" style="color:' + scoreColor(s.finalScore) + ';font-weight:700;">' + s.finalScore.toFixed(1) + '</td>',
      '  <td class="num">' + s.nonCriticalScore.toFixed(1) + '</td>',
      '  <td class="num">' + s.criticalScore.toFixed(1) + '</td>',
      '  <td class="num">' + s.sessionCount + '</td>',
      '  <td class="num">' + s.findingsCount + '</td>',
      '</tr>',
    ].join("\n");
  }).join("\n");

  return [
    '<table class="summary-table">',
    '  <thead>',
    '    <tr>',
    '      <th>Bulan</th>',
    '      <th class="num">Skor Final</th>',
    '      <th class="num">NC Score</th>',
    '      <th class="num">CR Score</th>',
    '      <th class="num">Sesi</th>',
    '      <th class="num">Temuan</th>',
    '    </tr>',
    '  </thead>',
    '  <tbody>',
    '    ' + rows,
    '  </tbody>',
    '</table>',
  ].join("\n");
}

function buildDossierHtml(monthlySummaries: AgentPeriodSummary[],
  topTickets: TicketScoreExport[],
  activeRootCauses: RootCauseResult[]): string {
  if (monthlySummaries.length === 0) return "";
  const latest = monthlySummaries[monthlySummaries.length - 1];
  const sColor = scoreColor(latest.finalScore);
  const sLabel = scoreLabel(latest.finalScore);
  const monthLabel = (MONTHS_FULL[latest.month - 1]?.slice(0, 3) ?? "") + " " + latest.year;
  const prev = monthlySummaries.length > 1 ? monthlySummaries[monthlySummaries.length - 2] : null;
  const delta = prev ? latest.finalScore - prev.finalScore : null;
  const pct = Math.min(100, Math.max(0, latest.finalScore));

  const deltaText = delta !== null
    ? (delta > 0 ? "+" : "") + delta.toFixed(1) + "%"
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
            t.scoreDeduction.toFixed(1) +
            "</span>",
          '      <span class="ticket-deduction-label">Poin</span>',
          "    </div>",
          '    <div class="ticket-count">' + t.findingCount + " Temuan</div>",
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
        const criticalTag =
          cause.criticalFindingsCount > 0
            ? '<span style="color:#ef4444;">' +
              cause.criticalFindingsCount +
              " critical</span>"
            : "";
        const keywordTag = cause.matchedKeywords[0]
          ? "<span>Keyword: " + escHtml(cause.matchedKeywords[0]) + "</span>"
          : "";
        return [
          '<div class="cause-box">',
          '  <div class="cause-label">' + escHtml(cause.label) + "</div>",
          '  <div class="cause-stats">',
          "    <span>" + cause.findingsCount + " temuan</span>",
          "    <span>" + cause.affectedTickets + " tiket</span>",
          "    " + criticalTag,
          "    " + keywordTag,
          "  </div>",
          '  <div class="cause-recommendation">' +
            escHtml(cause.recommendation) +
            "</div>",
          "</div>",
        ].join("\n");
      })
      .join("\n");
  }

  return [
    '<div class="score-section" style="margin-top:1rem;">',
    '  <div style="display:flex;flex-wrap:wrap;align-items:center;gap:0.25rem 0.75rem;margin-bottom:0.25rem;">',
    '    <span style="font-size:0.625rem;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">' + escHtml(monthLabel) + '</span>',
    '    <span style="font-size:0.625rem;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:' + sColor + ';">' + sLabel + '</span>',
    '  </div>',
    '  <div style="display:flex;align-items:baseline;gap:0.375rem;">',
    '    <span style="font-size:2.25rem;font-weight:900;letter-spacing:-0.03em;line-height:1;color:' + sColor + ';">' + latest.finalScore.toFixed(1) + '</span>',
    '    <span style="font-size:0.875rem;font-weight:900;color:rgba(107,114,128,0.4);">%</span>',
    '  </div>',
    '  <div class="score-bar" style="margin-top:0.5rem;">',
    '    <div class="score-bar-fill" style="width:' + pct + '%;background:' + sColor + ';"></div>',
    '  </div>',
    '  <div style="display:flex;gap:2rem;padding-top:0.75rem;border-top:1px solid #e5e7eb;margin-top:0.75rem;">',
    '    <div class="stat-cell">',
    '      <span class="stat-label">Sesi</span>',
    '      <span class="stat-value">' + latest.sessionCount + '</span>',
    '    </div>',
    '    <div class="stat-cell">',
    '      <span class="stat-label">Temuan</span>',
    '      <span class="stat-value">' + latest.findingsCount + '</span>',
    '    </div>',
    '    <div class="stat-cell">',
    '      <span class="stat-label">Delta</span>',
    '      <span class="stat-value" style="' + deltaStyle(delta) + '">' + deltaText + '</span>',
    '    </div>',
    '  </div>',
    '</div>',
    '',
    '<div class="score-section" style="margin-top:1rem;">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;padding-bottom:0.625rem;margin-bottom:0.5rem;">',
    '    <h4 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#111827;">Top 5 Pengurang Skor Terbesar</h4>',
    '    <span style="font-size:0.5625rem;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#6b7280;">' + topTickets.length + ' Tiket</span>',
    '  </div>',
    '  ' + ticketsHtml,
    '</div>',
    '',
    '<div class="score-section" style="margin-top:1rem;">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e7eb;padding-bottom:0.625rem;margin-bottom:1rem;">',
    '    <div>',
    '      <h4 style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:#111827;">Diagnosis Akar Masalah</h4>',
    '      <p style="font-size:0.75rem;font-weight:500;color:#6b7280;margin-top:0.125rem;">Berdasarkan temuan periode aktif</p>',
    '    </div>',
    '    <span style="font-size:0.625rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#6b7280;">' + activeRootCauses.length + ' Pola</span>',
    '  </div>',
    '  ' + causesHtml,
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
  const scopeLine = startLabel + "-" + endLabel + " " + scope.year +
    " &#8226; Layanan " + (scope.serviceLabel || scope.serviceType) +
    " &#8226; " + scope.teamLabel +
    " &#8226; " + (totalRow?.teamAgentCount ?? 0) + " agent tim / " +
    (totalRow?.serviceAgentCount ?? 0) + " agent layanan sama";

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
      '  <td class="num">' + row.agentCount + '</td>',
      '  <td class="num muted">' + Number(row.teamAverage).toFixed(1) + '</td>',
      '  <td class="num muted">' + Number(row.serviceAverage).toFixed(1) + '</td>',
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
    '        <th class="num">Rata-rata layanan sama</th>',
    '        <th class="num">% vs tim</th>',
    '        <th class="num">% vs layanan sama</th>',
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
  if (average === 0) return agentCount === 0 ? 0 : null;
  return ((agentCount - average) / average) * 100;
}

function formatComparisonDelta(value: number | null): string {
  if (value === null) return "n/a";
  const rounded = Math.round(value * 10) / 10;
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
  variant: AgentHtmlVariant,
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
    .map(function ([, monthItems], monthIndex) {
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
              '<div class="finding-score"><strong>' + item.nilai + '</strong><span>' +
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
            '<small>' + ticket.items.length + ' Parameter</small>',
            '</div>',
            itemsHtml,
            '</div>',
          ].join("");
        }).join("");

      const monthLabel = (MONTHS_FULL[first.month - 1] ?? String(first.month)) +
        " " + first.year;
      const open = variant === "static" || monthIndex === 0 ? " open" : "";
      return [
        '<details class="findings-period"' + open + '>',
        '<summary>',
        '<span class="findings-month-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span>',
        '<span class="findings-period-copy"><strong>' + escHtml(monthLabel) + '</strong><small>' +
          monthItems.length + ' Temuan &bull; ' + tickets.size + ' Tiket</small></span>',
        '<span class="disclosure-icon" aria-hidden="true"></span>',
        '</summary>',
        '<div class="findings-period-content">' + ticketHtml + '</div>',
        '</details>',
      ].join("");
    }).join("");
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
): string {
  const peserta = data.peserta;
  const masaKerja = computeTenure(peserta.bergabung_date);
  const now = new Date();
  const dateStr = now.toLocaleDateString("id-ID", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const profileHtml = buildProfileHtml(peserta, masaKerja);
  const summaryTableHtml = buildSummaryTableHtml(monthlySummaries, selectedYear, selectedService);
  const dossierHtml = buildDossierHtml(monthlySummaries, topTickets, activeRootCauses);
  const trendHtml = buildTrendReportHtml(data, variant);
  const comparisonHtml = buildComparisonHtml(data);
  const findingsHtml = buildFindingsHtml(temuanDisplayItems, variant);
  const interactiveScript = buildInteractiveReportScript(variant);

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
    '    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
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
    '    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
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
    '    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;',
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
    '  .trend-filter[aria-pressed="true"] { border-color: #2563eb; background: #2563eb; color: #ffffff; transform: translateY(-1px); }',
    '  .trend-filter[aria-pressed="true"] .legend-dot { background: #ffffff !important; }',
    '  .trend-filter:focus-visible { outline: 3px solid rgba(37,99,235,0.3); outline-offset: 2px; }',
    '  .trend-data { margin-top: 1rem; }',
    '  .trend-data summary { cursor: pointer; color: #374151; font-size: 0.75rem; font-weight: 700; }',
    '  .trend-stats { display: grid; grid-template-columns: minmax(10rem, 0.7fr) minmax(0, 2fr); gap: 1.5rem; margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid #e2e8f0; }',
    '  .trend-stat span, .trend-insight span { display: block; color: #64748b; font-size: 0.625rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }',
    '  .trend-stat strong { display: inline-block; margin-top: 0.35rem; color: #0f172a; font-size: 2rem; font-weight: 900; line-height: 1; }',
    '  .trend-stat small { margin-left: 0.5rem; color: #64748b; font-size: 0.625rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }',
    '  .trend-insight p { margin-top: 0.5rem; max-width: 68ch; color: #475569; font-size: 0.8125rem; line-height: 1.6; }',
    '  @media (max-width: 640px) { .trend-stats { grid-template-columns: 1fr; gap: 1rem; } .trend-filter { width: 100%; justify-content: flex-start; } }',
    '  @media (prefers-reduced-motion: reduce) { .trend-filter { transition: none; } }',
    '  .empty-state { padding: 2rem 0; text-align: center; color: #6b7280; font-size: 0.875rem; }',
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
    '    display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1.5rem;',
    '  }',
    '  @media (min-width: 768px) {',
    '    .profile-inner { flex-direction: row; text-align: left; align-items: flex-end; }',
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
    '  .score-section {',
    '    background: #ffffff; border: 1px solid #e5e7eb; border-radius: 1rem; padding: 1.25rem;',
    '  }',
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
    '</style>',
    '</head>',
    '<body>',
    '<div class="container" data-report-variant="' + variant + '">',
    '',
    profileHtml,
    '',
    '<section class="report-section" data-report-section="performance">',
    '<div class="report-section-heading">',
    '<span class="section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg></span>',
    '<div><h2>Analisis Performa Bulanan</h2><p>Tahun ' + selectedYear + ' &bull; Layanan ' + selectedService.toUpperCase() + '</p></div>',
    '</div>',
    '<div class="card">',
    '  <div class="table-scroll">' + summaryTableHtml + '</div>',
    '  ' + dossierHtml,
    '</div>',
    '</section>',
    '',
    trendHtml,
    '',
    comparisonHtml,
    '',
    '<section class="report-section" data-report-section="findings">',
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
