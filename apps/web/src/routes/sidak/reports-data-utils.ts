import type { AgentDirectoryEntry, AgentDirectoryResponse } from "@trainers/types";

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

export function getReportTicketText(row: { no_tiket?: unknown }): string {
  return typeof row.no_tiket === "string" && row.no_tiket.trim()
    ? row.no_tiket.trim()
    : "-";
}
