import type { QAPeriod, DashboardData } from "@trainers/types";

export const EXCLUDED_FOLDERS = [
  "tim om",
  "tim qa",
  "tim spv",
  "tim da & konten",
];
export const EXCLUDED_JABATAN = [
  "qa",
  "trainer",
  "wfm",
  "team leader",
  "team_leader",
  "supervisor",
  "spv",
  "operational manager",
  "operation_manager",
  "operation manager",
];

export function hasMeaningfulNote(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function isCountableFinding(
  item:
    | {
        nilai?: number | null;
        ketidaksesuaian?: string | null;
        sebaiknya?: string | null;
      }
    | null
    | undefined,
): boolean {
  if (!item) return false;
  return (
    Number(item.nilai ?? 3) < 3 ||
    hasMeaningfulNote(item.ketidaksesuaian) ||
    hasMeaningfulNote(item.sebaiknya)
  );
}

export function hasTicketNumber(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Satuan `tiket` SIDAK: nomor tiket yang sama dihitung sekali; baris tanpa
 * nomor tiket dihitung per baris karena tidak bisa dikelompokkan. Pemanggil
 * hanya mengirim baris yang sudah lolos `isCountableFinding`.
 */
export function countFindingTickets(
  rows: Iterable<{ no_tiket?: string | null }>,
): number {
  const tickets = new Set<string>();
  let withoutTicket = 0;
  for (const row of rows) {
    if (hasTicketNumber(row.no_tiket)) tickets.add(row.no_tiket);
    else withoutTicket += 1;
  }
  return tickets.size + withoutTicket;
}

export function emptyDashboardResponse(periods: QAPeriod[]): DashboardData {
  return {
    periods,
    folders: [],
    summary: {
      totalDefects: 0,
      totalTickets: 0,
      zeroErrorRate: 0,
      avgAgentScore: 0,
      complianceRate: 0,
      complianceCount: 0,
      totalAgents: 0,
    },
    serviceData: [],
    topAgents: [],
    paretoData: [],
    donutData: { critical: 0, nonCritical: 0, total: 0 },
    paramTrend: { labels: [], datasets: [] },
    periodMetrics: [],
    sparklines: {},
    availableYears: [],
    currentYear: new Date().getFullYear(),
    availableServices: [],
  };
}
