import type { SidakManagementReportMetricRow, SidakManagementReportResponse } from "@trainers/types";
import { PdfDocument } from "./agentReportPdfLayout";
import { createMeasurer } from "./agentReportPdfText";
import {
  INK,
  INK_FAINT,
} from "./agentReportPdfTheme";

const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;
const DASH = "–";
const numberText = (value: number | null | undefined): string =>
  value === null || value === undefined ? DASH : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
const percentText = (value: number | null | undefined): string => value === null || value === undefined ? DASH : `${numberText(value)}%`;
const pointText = (value: number | null | undefined): string => value === null || value === undefined ? DASH : `${numberText(value)} poin`;

function metricValue(row: SidakManagementReportMetricRow, key: "agentsAudited" | "sessionsAudited" | "findingsCount" | "ticketsWithFindings" | "avgAgentScore" | "complianceRate" | "zeroErrorRate"): string {
  const value = row[key];
  return key === "complianceRate" || key === "avgAgentScore" || key === "zeroErrorRate" ? percentText(value) : numberText(value);
}

function writeFilter(pdf: PdfDocument, data: SidakManagementReportResponse): void {
  const { metadata } = data;
  const mode = metadata.mode === "individu" ? `Per Individu · ${metadata.agentName ?? "Agen"}` : "Per Layanan";
  const service = metadata.serviceType ? SERVICE_LABELS[metadata.serviceType] ?? metadata.serviceType : "Semua layanan";
  const parameter = metadata.indicatorName ? `${metadata.indicatorName} (hanya berlaku untuk Detail Temuan)` : "Semua (filter parameter hanya berlaku untuk Detail Temuan)";
  const allowed = metadata.allowedServiceTypes?.map((service) => SERVICE_LABELS[service] ?? service).join(", ") ?? "semua sesuai akses";
  const monthLabel = `${MONTH_NAMES[metadata.startMonth - 1]}–${MONTH_NAMES[metadata.endMonth - 1]} ${metadata.year}`;
  pdf.paragraph("LAPORAN MANAJEMEN SIDAK", { font: "bold", size: 7, color: INK_FAINT });
  pdf.paragraph("Ringkasan Eksekutif", { font: "bold", size: 18, color: INK, lineHeight: 8 });
  pdf.paragraph(`Filter: ${mode} · Layanan ${service} · Agen ${metadata.agentName ?? "Semua"} · Parameter ${parameter} · showArchived ${metadata.showArchived ? "ya" : "tidak"} · Akses layanan ${allowed} · Tahun ${metadata.year} · Bulan ${monthLabel}`, { size: 8 });
  pdf.paragraph(`data ditarik pada ${metadata.generatedAtJakarta} (Asia/Jakarta)`, { size: 7, color: INK_FAINT });
  if (metadata.temporaryMonths.length) {
    pdf.paragraph(`Bulan berjalan — data sementara: ${metadata.temporaryMonths.map((month) => MONTH_NAMES[month - 1]).join(", ")}`, { size: 7, color: INK_FAINT });
  }
  if (metadata.mixedRuleVersions) pdf.paragraph("Catatan: versi aturan berbeda pada sebagian layanan atau bulan dalam rentang ini.", { size: 7, color: INK_FAINT });
  pdf.rule(INK, 2, 4);
}

function comparisonPeriodLabel(data: SidakManagementReportResponse): string {
  const { year, startMonth, endMonth, temporaryMonths } = data.metadata;
  const isYtd = startMonth === 1 && temporaryMonths.includes(endMonth);
  const length = endMonth - startMonth + 1;
  const previousEnd = isYtd ? { year: year - 1, month: endMonth } : { year, month: startMonth };
  const endSerial = previousEnd.year * 12 + previousEnd.month - 1 - (isYtd ? 0 : 1);
  const startSerial = endSerial - length + 1;
  const startYear = Math.floor(startSerial / 12);
  const startMonthValue = startSerial % 12 + 1;
  const endYear = Math.floor(endSerial / 12);
  const endMonthValue = endSerial % 12 + 1;
  return `${MONTH_NAMES[startMonthValue - 1]} ${startYear}–${MONTH_NAMES[endMonthValue - 1]} ${endYear}`;
}

function writeKpis(pdf: PdfDocument, data: SidakManagementReportResponse): void {
  pdf.heading("KPI vs periode pembanding", undefined, 20);
  pdf.paragraph(`Periode pembanding: ${comparisonPeriodLabel(data)}`, { size: 7, color: INK_FAINT, gapAfter: 2 });
  const totals = data.monthly.filter((row) => row.rowType === "total");
  pdf.table({
    columns: [
      { header: "Layanan", weight: 1.2, minWidth: 24 },
      { header: "Agen", weight: 0.6, minWidth: 14, align: "right" },
      { header: "Sesi", weight: 0.6, minWidth: 14, align: "right" },
      { header: "Temuan", weight: 0.7, minWidth: 16, align: "right" },
      { header: "Tiket", weight: 0.6, minWidth: 14, align: "right" },
      { header: "Rata-rata skor", weight: 0.9, minWidth: 20, align: "right" },
      { header: "Compliance", weight: 0.8, minWidth: 18, align: "right" },
      { header: "Zero-error", weight: 0.8, minWidth: 18, align: "right" },
    ],
    rows: totals.map((row) => [
      SERVICE_LABELS[row.serviceType] ?? row.serviceType,
      metricValue(row, "agentsAudited"), metricValue(row, "sessionsAudited"),
      metricValue(row, "findingsCount"), metricValue(row, "ticketsWithFindings"),
      metricValue(row, "avgAgentScore"), metricValue(row, "complianceRate"), metricValue(row, "zeroErrorRate"),
    ]),
  });
  if (totals.length === 0) pdf.paragraph("Belum ada audit pada rentang ini.", { size: 8 });
  else {
    pdf.heading("Perubahan terhadap pembanding", undefined, 18);
    pdf.table({
      columns: [
        { header: "Layanan", weight: 1.2, minWidth: 24 },
        { header: "Delta temuan", weight: 0.9, minWidth: 20, align: "right" },
        { header: "Delta tiket", weight: 0.8, minWidth: 18, align: "right" },
        { header: "Delta skor (poin)", weight: 0.9, minWidth: 20, align: "right" },
        { header: "Delta compliance (poin)", weight: 1, minWidth: 23, align: "right" },
        { header: "Delta zero-error (poin)", weight: 1, minWidth: 23, align: "right" },
      ],
      rows: totals.map((row) => [
        SERVICE_LABELS[row.serviceType] ?? row.serviceType,
        percentText(row.delta?.findings), percentText(row.delta?.tickets),
        pointText(row.delta?.avgAgentScore), pointText(row.delta?.complianceRate),
        pointText(row.delta?.zeroErrorRate),
      ]),
    });
  }
}

function writeSixMonthTrend(pdf: PdfDocument, data: SidakManagementReportResponse): void {
  pdf.heading("Tren 6 Bulan", undefined, 22);
  const services = [...new Set(data.trendMonthly.map((row) => row.serviceType))];
  for (const serviceType of services) {
    const rows = data.trendMonthly.filter((row) => row.serviceType === serviceType);
    pdf.table({
      caption: SERVICE_LABELS[serviceType] ?? serviceType,
      columns: [
        { header: "Bulan", weight: 1.3, minWidth: 28 },
        { header: "Agen diaudit", weight: 0.8, minWidth: 18, align: "right" },
        { header: "Temuan", weight: 0.7, minWidth: 16, align: "right" },
        { header: "Skor", weight: 0.7, minWidth: 16, align: "right" },
        { header: "Compliance", weight: 0.8, minWidth: 18, align: "right" },
      ],
      rows: rows.map((row) => [row.label, numberText(row.agentsAudited), metricValue(row, "findingsCount"), metricValue(row, "avgAgentScore"), metricValue(row, "complianceRate")]),
    });
  }
}

function writePeriodMonthlyTrend(pdf: PdfDocument, data: SidakManagementReportResponse): void {
  if (data.metadata.endMonth - data.metadata.startMonth < 2) return;
  pdf.heading("Tren Bulanan Periode", undefined, 20);
  pdf.table({
    columns: [
      { header: "Bulan", weight: 1.3, minWidth: 28 },
      { header: "Layanan", weight: 0.9, minWidth: 20 },
      { header: "Temuan", weight: 0.7, minWidth: 16, align: "right" },
      { header: "Skor", weight: 0.7, minWidth: 16, align: "right" },
      { header: "Compliance", weight: 0.8, minWidth: 18, align: "right" },
    ],
    rows: data.monthly.filter((row) => row.rowType === "month").map((row) => [
      row.label, SERVICE_LABELS[row.serviceType] ?? row.serviceType,
      metricValue(row, "findingsCount"), metricValue(row, "avgAgentScore"), metricValue(row, "complianceRate"),
    ]),
  });
}

function writeParameterSections(pdf: PdfDocument, data: SidakManagementReportResponse): void {
  const top = [...data.pareto].sort((a, b) => b.total - a.total || a.parameter.localeCompare(b.parameter, "id")).slice(0, 10);
  pdf.heading("Top 10 Parameter", undefined, 20);
  pdf.table({
    columns: [
      { header: "Parameter", weight: 2, minWidth: 48 },
      { header: "Layanan", weight: 0.9, minWidth: 20 },
      { header: "Kategori", weight: 0.9, minWidth: 20 },
      { header: "Temuan", weight: 0.6, minWidth: 14, align: "right" },
      { header: "Kontribusi", weight: 0.8, minWidth: 18, align: "right" },
    ],
    rows: top.map((row) => [row.parameter, SERVICE_LABELS[row.serviceType] ?? row.serviceType, row.category === "critical" ? "Critical" : "Non-critical", numberText(row.total), percentText(row.contribution)]),
  });
  if (data.metadata.endMonth - data.metadata.startMonth < 2) return;
  const firstMonth = data.metadata.startMonth;
  const lastMonth = data.metadata.endMonth;
  const movement = data.pareto.map((row) => {
    const first = row.monthlyCounts.find((item) => item.month === firstMonth)?.count ?? 0;
    const last = row.monthlyCounts.find((item) => item.month === lastMonth)?.count ?? 0;
    return { ...row, change: last - first };
  }).filter((row) => row.change !== 0).sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.parameter.localeCompare(b.parameter, "id"));
  pdf.heading("Parameter Membaik / Memburuk", undefined, 18);
  pdf.table({
    columns: [
      { header: "Parameter", weight: 2, minWidth: 48 },
      { header: "Layanan", weight: 0.9, minWidth: 20 },
      { header: "Perubahan temuan", weight: 1, minWidth: 24, align: "right" },
      { header: "Arah", weight: 1, minWidth: 22 },
    ],
    rows: movement.slice(0, 10).map((row) => [row.parameter, SERVICE_LABELS[row.serviceType] ?? row.serviceType, numberText(row.change), row.change < 0 ? "Membaik" : "Memburuk"]),
  });
}

function writeComparisons(pdf: PdfDocument, data: SidakManagementReportResponse): void {
  if (data.metadata.endMonth - data.metadata.startMonth >= 2) {
    pdf.heading("Perbandingan Layanan", undefined, 20);
    const services = data.monthly.filter((row) => row.rowType === "total");
    pdf.table({
      columns: [
        { header: "Layanan", weight: 1.2, minWidth: 26 },
        { header: "Agen", weight: 0.6, minWidth: 14, align: "right" },
        { header: "Temuan", weight: 0.7, minWidth: 16, align: "right" },
        { header: "Skor rata-rata", weight: 0.9, minWidth: 20, align: "right" },
        { header: "Compliance", weight: 0.8, minWidth: 18, align: "right" },
      ],
      rows: services.map((row) => [SERVICE_LABELS[row.serviceType] ?? row.serviceType, numberText(row.agentsAudited), metricValue(row, "findingsCount"), metricValue(row, "avgAgentScore"), metricValue(row, "complianceRate")]),
    });
  }

  pdf.heading("Perbandingan Tim", undefined, 20);
  const teams = data.teams.filter((row) => row.rowType === "total" && row.batchName === "Semua batch");
  pdf.table({
    columns: [
      { header: "Tim", weight: 1.3, minWidth: 30 },
      { header: "Layanan", weight: 0.9, minWidth: 20 },
      { header: "Temuan", weight: 0.7, minWidth: 16, align: "right" },
      { header: "Skor rata-rata", weight: 0.9, minWidth: 20, align: "right" },
      { header: "Compliance", weight: 0.8, minWidth: 18, align: "right" },
    ],
    rows: teams.map((row) => [row.team, SERVICE_LABELS[row.serviceType] ?? row.serviceType, metricValue(row, "findingsCount"), metricValue(row, "avgAgentScore"), metricValue(row, "complianceRate")]),
  });

  pdf.heading("Perbandingan Leader", undefined, 20);
  const leaderEntries = data.leaders.flatMap((leader) => leader.monthly
    .filter((row) => row.rowType === "total")
    .map((row) => ({ leader, row })));
  const leaders = leaderEntries.length ? leaderEntries : data.leaders.filter((leader) => leader.scopeEmpty).map((leader) => ({ leader, row: null }));
  pdf.table({
    columns: [
      { header: "Leader", weight: 1.3, minWidth: 30 },
      { header: "Agen dalam scope", weight: 0.8, minWidth: 18, align: "right" },
      { header: "Layanan", weight: 0.8, minWidth: 18 },
      { header: "Temuan", weight: 0.7, minWidth: 16, align: "right" },
      { header: "Skor rata-rata", weight: 0.9, minWidth: 20, align: "right" },
    ],
    rows: leaders.map(({ leader, row }) => [leader.leaderName, numberText(leader.agentsInScope), row ? SERVICE_LABELS[row.serviceType] ?? row.serviceType : "scope kosong", row ? metricValue(row, "findingsCount") : DASH, row ? metricValue(row, "avgAgentScore") : DASH]),
  });
}

function writeFollowUps(pdf: PdfDocument, data: SidakManagementReportResponse): void {
  pdf.heading("Tindak Lanjut", undefined, 22);
  pdf.table({
    columns: [
      { header: "Agen", weight: 1.1, minWidth: 28, emphasis: true },
      { header: "Tim / Batch", weight: 1.1, minWidth: 30 },
      { header: "Pemicu", weight: 1.6, minWidth: 42 },
      { header: "Parameter terburuk", weight: 1.4, minWidth: 36 },
      { header: "Bulan berulang", weight: 0.8, minWidth: 18, align: "right" },
    ],
    rows: data.followUps.map((row) => [
      row.name,
      `${row.team} / ${row.batchName}`,
      row.reasons.map((reason) => reason === "score_below_target" ? "Skor rentang di bawah 95" : reason === "consecutive_decline" ? "Skor turun dua bulan berurutan" : "Parameter countable berulang").join("; "),
      row.worstParameters.map((item) => `${item.parameter} (${item.count}${item.category === "critical" ? ", critical" : ""})`).join("; ") || DASH,
      numberText(row.repeatMonthCount),
    ]),
  });
  if (data.followUps.length === 0) pdf.paragraph("Tidak ada agen yang memenuhi kriteria tindak lanjut pada rentang ini.", { size: 8 });
}

export async function downloadSidakManagementReportPdf(data: SidakManagementReportResponse): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pdf = new PdfDocument(doc, {
    left: "SIDAK · LAPORAN MANAJEMEN",
    right: data.metadata.generatedAtJakarta,
  }, createMeasurer(doc));
  pdf.begin();
  writeFilter(pdf, data);
  writeKpis(pdf, data);
  writeSixMonthTrend(pdf, data);
  writePeriodMonthlyTrend(pdf, data);
  writeParameterSections(pdf, data);
  writeComparisons(pdf, data);
  writeFollowUps(pdf, data);
  pdf.finalize();
  const safeYear = String(data.metadata.year);
  doc.save(`laporan-manajemen-sidak-${safeYear}-${data.metadata.startMonth}-${data.metadata.endMonth}.pdf`);
}
