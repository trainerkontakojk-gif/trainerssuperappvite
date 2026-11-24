import { isSidakActionableReportRow, type AgentDirectoryEntry, type AgentDirectoryResponse } from "@trainers/types";

export function normalizeReportAgents(raw: unknown): AgentDirectoryEntry[] {
  if (!raw || typeof raw !== "object") return [];

  const response = raw as Partial<AgentDirectoryResponse>;
  return Array.isArray(response.agents) ? response.agents : [];
}

export function validateReportFilters(params: {
  mode: "layanan" | "individu";
  pesertaId: string;
  startMonth: number;
  endMonth: number;
}): string | null {
  if (params.mode === "individu" && !params.pesertaId) {
    return "Pilih agen terlebih dahulu.";
  }
  if (params.startMonth > params.endMonth) {
    return "Bulan awal tidak boleh setelah bulan akhir.";
  }
  return null;
}

export function getReportFindingText(row: {
  ketidaksesuaian?: unknown;
}): string {
  return typeof row.ketidaksesuaian === "string" && row.ketidaksesuaian.trim()
    ? row.ketidaksesuaian.trim()
    : "-";
}

export function getReportRecommendationText(row: {
  sebaiknya?: unknown;
}): string {
  return typeof row.sebaiknya === "string" && row.sebaiknya.trim()
    ? row.sebaiknya.trim()
    : "-";
}

/**
 * Kontrak Workspace Data (`docs/SIDAK_LOGIC_AND_SCORING.md`): hanya temuan
 * riil dengan Temuan DAN Rekomendasi yang boleh ditampilkan maupun diekspor.
 * Seleksi ini dipakai sekali pada respons halaman agar count, tabel,
 * pagination, dan Excel memakai satu sumber hasil yang sama.
 */
export function isActionableReportRow(row: {
  is_phantom_padding?: unknown;
  ketidaksesuaian?: unknown;
  sebaiknya?: unknown;
}): boolean {
  return isSidakActionableReportRow(row);
}

export function getReportTicketText(row: { no_tiket?: unknown }): string {
  return typeof row.no_tiket === "string" && row.no_tiket.trim()
    ? row.no_tiket.trim()
    : "-";
}

export type ReportRowFacts = {
  service: string;
  period: string;
  agent: string;
  batch: string;
  ticket: string;
  parameter: string;
  finding: string;
  recommendation: string;
  score: string;
};

type ReportRowInput = {
  service_type?: unknown;
  qa_periods?: { month?: unknown; year?: unknown } | null;
  profiler_peserta?: { nama?: unknown; batch_name?: unknown } | null;
  qa_indicators?: { name?: unknown } | null;
  no_tiket?: unknown;
  ketidaksesuaian?: unknown;
  sebaiknya?: unknown;
  nilai?: unknown;
};

function reportText(value: unknown, fallback: string): string {
  return typeof value === "string" && value ? value : fallback;
}

export function toRowFacts(
  row: ReportRowInput,
  serviceLabels: Record<string, string>,
): ReportRowFacts {
  const serviceType = reportText(row.service_type, "");
  const month = row.qa_periods?.month || "";
  const year = row.qa_periods?.year || "";
  return {
    service: serviceLabels[serviceType] || serviceType || "-",
    period: `${String(month).padStart(2, "0")}/${year}`,
    agent: reportText(row.profiler_peserta?.nama, "-"),
    batch: reportText(row.profiler_peserta?.batch_name, ""),
    ticket: getReportTicketText(row),
    parameter: reportText(row.qa_indicators?.name, "-"),
    finding: getReportFindingText(row),
    recommendation: getReportRecommendationText(row),
    score: row.nilai === null || row.nilai === undefined ? "-" : String(row.nilai),
  };
}
