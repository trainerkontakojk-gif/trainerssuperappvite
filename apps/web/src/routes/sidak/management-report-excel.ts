import { isSidakActionableReportRow, type SidakManagementReportResponse } from "@trainers/types";
import { toRowFacts } from "./reports-data-utils";

const SERVICE_LABELS: Record<string, string> = {
  call: "Call", chat: "Chat", email: "Email", cso: "CSO",
  pencatatan: "Pencatatan", bko: "BKO", slik: "SLIK",
};
const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;
const DASH = "–";
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

function appendMetadata(
  sheet: import("exceljs").Worksheet,
  data: SidakManagementReportResponse,
) {
  const { year, startMonth, endMonth, serviceType, generatedAtJakarta, temporaryMonths } = data.metadata;
  const serviceLabel = serviceType ? SERVICE_LABELS[serviceType] ?? serviceType : "Semua layanan";
  const mode = data.metadata.mode === "individu" ? "Per Individu" : "Per Layanan";
  const allowed = data.metadata.allowedServiceTypes?.map((service) => SERVICE_LABELS[service] ?? service).join(", ") ?? "semua sesuai akses";
  const agent = data.metadata.agentName ?? data.metadata.agentId ?? "-";
  const parameter = data.metadata.indicatorName ?? data.metadata.indicatorId ?? "semua";
  const monthsLabel = `${MONTH_NAMES[startMonth - 1]}–${MONTH_NAMES[endMonth - 1]} ${year}`;
  sheet.addRow([`Filter: ${mode} · Layanan ${serviceLabel} · Agen ${agent} · Parameter ${parameter} (${data.metadata.indicatorScope}) · showArchived ${data.metadata.showArchived ? "ya" : "tidak"} · Akses layanan ${allowed} · Tahun ${year} · Bulan ${monthsLabel}`]);
  sheet.addRow([`data ditarik pada ${generatedAtJakarta} (Asia/Jakarta)`]);
  if (temporaryMonths.length) {
    sheet.addRow([`Bulan berjalan — data sementara: ${temporaryMonths.map((month) => MONTH_NAMES[month - 1]).join(", ")}`]);
  }
  if (data.metadata.mixedRuleVersions) sheet.addRow(["Catatan: versi aturan berbeda di beberapa layanan/bulan pada rentang ini."]);
  sheet.addRow([]);
}

function setWidths(sheet: import("exceljs").Worksheet, widths: number[]) {
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function setHeader(sheet: import("exceljs").Worksheet, headers: string[]) {
  sheet.addRow(headers);
  const row = sheet.lastRow;
  if (!row) return;
  row.font = { bold: true };
  row.alignment = { vertical: "middle", wrapText: true };
  row.eachCell((cell) => {
    cell.border = { bottom: { style: "thin" } };
  });
}

function asBlank(value: number | null | undefined): number | string {
  return value === null || value === undefined ? DASH : value;
}

function downloadBuffer(buffer: ArrayBuffer, fileName: string) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadManagementReportExcel(
  data: SidakManagementReportResponse,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Trainers SuperApp";
  workbook.created = new Date(data.metadata.generatedAt);

  const summary = workbook.addWorksheet("Ringkasan");
  appendMetadata(summary, data);
  const metricHeaders = ["Jenis baris", "Layanan", "Periode", "Kuartal", "Agen diaudit", "Sesi diaudit", "Temuan countable", "Tiket bertemuan", "Rata-rata skor agen", "Compliance (%)", "Zero-error (%)", "Delta temuan (%)", "Delta tiket (%)", "Delta skor (poin)", "Delta compliance (poin)", "Delta zero-error (poin)"];
  setHeader(summary, metricHeaders);
  for (const row of data.monthly) {
    summary.addRow([
      row.rowType === "month" ? "Bulan" : row.rowType === "quarter" ? "Subtotal kuartal" : "Total rentang",
      SERVICE_LABELS[row.serviceType] ?? row.serviceType,
      row.label,
      row.quarter ?? DASH,
      asBlank(row.agentsAudited), asBlank(row.sessionsAudited), asBlank(row.findingsCount),
      asBlank(row.ticketsWithFindings), asBlank(row.avgAgentScore), asBlank(row.complianceRate),
      asBlank(row.zeroErrorRate), asBlank(row.delta?.findings), asBlank(row.delta?.tickets),
      asBlank(row.delta?.avgAgentScore), asBlank(row.delta?.complianceRate), asBlank(row.delta?.zeroErrorRate),
    ]);
  }
  setWidths(summary, metricHeaders.map((header) => Math.max(14, Math.min(header.length + 3, 28))));

  const teams = workbook.addWorksheet("Rekap Tim");
  appendMetadata(teams, data);
  const teamHeaders = ["Tim", "Batch", ...metricHeaders];
  setHeader(teams, teamHeaders);
  for (const row of data.teams) {
    teams.addRow([
      row.team, row.batchName,
      row.rowType === "month" ? "Bulan" : row.rowType === "quarter" ? "Subtotal kuartal" : "Total rentang",
      SERVICE_LABELS[row.serviceType] ?? row.serviceType,
      row.label,
      row.quarter ?? DASH,
      asBlank(row.agentsAudited), asBlank(row.sessionsAudited), asBlank(row.findingsCount),
      asBlank(row.ticketsWithFindings), asBlank(row.avgAgentScore), asBlank(row.complianceRate), asBlank(row.zeroErrorRate),
      asBlank(row.delta?.findings), asBlank(row.delta?.tickets), asBlank(row.delta?.avgAgentScore),
      asBlank(row.delta?.complianceRate), asBlank(row.delta?.zeroErrorRate),
    ]);
  }
  setWidths(teams, teamHeaders.map((header) => Math.max(14, Math.min(header.length + 3, 28))));

  const agents = workbook.addWorksheet("Rekap Agen");
  appendMetadata(agents, data);
  const agentHeaders = [
    "Nama Agen", "Tim", "Batch", "Layanan", "Sesi diaudit", "Temuan countable",
    ...MONTH_NAMES,
    "Q1", "Q2", "Q3", "Q4", "Skor rentang", "Bulan ≥95", "Peringkat", "Tren",
  ];
  setHeader(agents, agentHeaders);
  for (const row of data.agents) {
    agents.addRow([
      row.name, row.team, row.batchName, SERVICE_LABELS[row.serviceType] ?? row.serviceType,
      row.sessionsAudited, row.findingsCount,
      ...MONTH_NAMES.map((_, index) => asBlank(row.monthlyScores[index + 1])),
      ...QUARTERS.map((quarter) => asBlank(row.quarterScores[quarter])),
      asBlank(row.periodScore), row.monthsAtTarget, row.rank, row.trend,
    ]);
  }
  setWidths(agents, agentHeaders.map((header) => header.length > 16 ? 20 : 14));

  const pareto = workbook.addWorksheet("Pareto");
  appendMetadata(pareto, data);
  const paretoHeaders = ["Layanan", "Parameter", "Kategori", ...MONTH_NAMES.slice(data.metadata.startMonth - 1, data.metadata.endMonth), "Total", "Kontribusi (%)", "Kumulatif (%)", "Agen terdampak"];
  setHeader(pareto, paretoHeaders);
  for (const row of data.pareto) {
    const counts = new Map(row.monthlyCounts.map((item) => [item.month, item.count]));
    pareto.addRow([
      SERVICE_LABELS[row.serviceType] ?? row.serviceType,
      row.parameter, row.category === "critical" ? "Critical" : "Non-critical",
      ...Array.from({ length: data.metadata.endMonth - data.metadata.startMonth + 1 }, (_, index) => counts.get(data.metadata.startMonth + index) ?? 0),
      row.total, row.contribution, row.cumulativeContribution, row.agentsAffected,
    ]);
  }
  setWidths(pareto, paretoHeaders.map((header) => Math.max(14, Math.min(header.length + 3, 32))));

  const details = workbook.addWorksheet("Detail Temuan");
  appendMetadata(details, data);
  const detailHeaders = ["Layanan", "Periode", "Agen", "Batch", "No. Tiket", "Parameter", "Temuan", "Seharusnya", "Skor"];
  setHeader(details, detailHeaders);
  for (const row of data.details.filter(isSidakActionableReportRow)) {
    const facts = toRowFacts(row, SERVICE_LABELS);
    details.addRow([
      SERVICE_LABELS[row.service_type ?? ""] ?? row.service_type ?? DASH,
      row.qa_periods ? `${String(row.qa_periods.month ?? "").padStart(2, "0")}/${row.qa_periods.year ?? ""}` : DASH,
      row.profiler_peserta?.nama ?? DASH,
      row.profiler_peserta?.batch_name ?? "",
      facts.ticket,
      row.qa_indicators?.name ?? DASH,
      facts.finding,
      facts.recommendation,
      row.nilai ?? DASH,
    ]);
  }
  setWidths(details, [16, 14, 24, 20, 22, 36, 56, 56, 12]);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer as ArrayBuffer, `laporan-manajemen-sidak-${data.metadata.year}-${data.metadata.startMonth}-${data.metadata.endMonth}.xlsx`);
}
