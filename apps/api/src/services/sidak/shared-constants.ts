import type { QAPeriod, DashboardData } from "@trainers/types";

export const TRAINER_ROLES = ["admin", "trainer"] as const;
export const LEADER_ROLES = ["leader"] as const;

export const EXCLUDED_FOLDERS = ["tim om", "tim qa", "tim spv", "tim da & konten"];
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

export function emptyDashboardResponse(periods: QAPeriod[]): DashboardData {
  return {
    periods,
    folders: [],
    summary: {
      totalDefects: 0,
      avgDefectsPerAudit: 0,
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
    sparklines: {},
    availableYears: [],
    currentYear: new Date().getFullYear(),
    availableServices: [],
  };
}
