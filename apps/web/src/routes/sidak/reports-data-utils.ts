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
  return (
    row.is_phantom_padding !== true &&
    typeof row.ketidaksesuaian === "string" &&
    row.ketidaksesuaian.trim().length > 0 &&
    typeof row.sebaiknya === "string" &&
    row.sebaiknya.trim().length > 0
  );
}

export function getReportTicketText(row: { no_tiket?: unknown }): string {
  return typeof row.no_tiket === "string" && row.no_tiket.trim()
    ? row.no_tiket.trim()
    : "-";
}
