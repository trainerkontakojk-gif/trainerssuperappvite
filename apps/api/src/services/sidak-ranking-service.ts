import type { TopAgentData } from "@trainers/types";
import { supabaseAdmin } from "../lib/supabase";
import * as sidakService from "./sidak-service";
import { assignRanks, comparePriority } from "./sidak/agent-rank-order";
import { applyPesertaScope, pesertaScopeFromIds } from "./access/scope";

/** `range` = rentang bulan cakupan bersama (`startMonth`..`endMonth`). */
export type RankingPeriodMode = "ytd" | "alltime" | "range" | string;

export type GetRankingDataParams = {
  period: RankingPeriodMode;
  service_type: string;
  year: number;
  /** Wajib untuk `period=range`; 1..12 dan `startMonth <= endMonth`. */
  startMonth?: number;
  endMonth?: number;
  folder: string;
  accessibleIds: string[] | null;
  filterScope: sidakService.SidakFilterScope | null;
};

export type RankingData = {
  rankings: TopAgentData[];
  periods: any[];
  folders: Array<{ id: string; name: string; parent_id: string | null }>;
  availableYears: number[];
  availableServices: string[];
  /**
   * Rentang pembanding "Perubahan posisi" (`period=range`), mis. "Jan–Sep
   * 2026". `null` bila tidak ada periode pembanding.
   */
  comparison: { label: string } | null;
};

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function comparisonLabel(periods: PeriodRow[]): string {
  const first = periods[0]!;
  const last = periods[periods.length - 1]!;
  const end = `${MONTH_SHORT[last.month - 1]} ${last.year}`;
  if (first.id === last.id) return end;
  return first.year === last.year
    ? `${MONTH_SHORT[first.month - 1]}–${end}`
    : `${MONTH_SHORT[first.month - 1]} ${first.year}–${end}`;
}

/** ID periode QA tahun itu yang punya temuan (untuk mencari periode aktif terakhir). */
async function fetchActivePeriodIds(
  year: number,
  serviceType: string | undefined,
  accessibleIds: string[] | null,
): Promise<Set<string>> {
  const PAGE_SIZE = 1000;
  const temuanPeriods: { period_id: string }[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    let temuanQuery = supabaseAdmin
      .from("qa_temuan")
      .select("period_id")
      .eq("tahun", year)
      .order("period_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (serviceType && serviceType !== "all") {
      temuanQuery = temuanQuery.eq("service_type", serviceType);
    }
    temuanQuery = applyPesertaScope(temuanQuery, pesertaScopeFromIds(accessibleIds));
    const { data: page, error: pageError } = await temuanQuery;
    if (pageError) throw new Error(pageError.message);
    if (!page || page.length === 0) {
      hasMore = false;
    } else {
      temuanPeriods.push(...page);
      hasMore = page.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }
  }
  return new Set(temuanPeriods.map((t) => t.period_id));
}

type PeriodRow = { id: string; year: number; month: number };

/** ID periode QA untuk bulan `start..end` di `year`; bulan < 1 mundur ke tahun lalu. */
export function periodIdsForMonths(
  periods: PeriodRow[],
  year: number,
  start: number,
  end: number,
): string[] {
  const wanted = new Set<string>();
  for (let m = start; m <= end; m++) {
    const y = m < 1 ? year - 1 : year;
    const month = m < 1 ? m + 12 : m;
    wanted.add(`${y}-${month}`);
  }
  return periods
    .filter((p) => wanted.has(`${p.year}-${p.month}`))
    .map((p) => p.id);
}

/** Input ranking yang tidak valid; route memetakannya ke 400. */
export class RankingInputError extends Error {}

function withRankChange(
  current: TopAgentData[],
  previous?: TopAgentData[],
): TopAgentData[] {
  const prevRankMap = assignRanks(previous ?? [], comparePriority);
  const currentRankMap = assignRanks(current, comparePriority);
  return current.map((agent) => {
    const currentRank = currentRankMap.get(agent.agentId)!;
    const previousRank = prevRankMap.get(agent.agentId);
    return {
      ...agent,
      rank: currentRank,
      rankChange:
        previous === undefined
          ? undefined
          : previousRank !== undefined
            ? previousRank - currentRank
            : null,
    };
  });
}

export async function getRankingData(params: GetRankingDataParams): Promise<RankingData> {
  const { period, service_type, year, folder, accessibleIds, filterScope } = params;
  const effectiveServiceType = sidakService.resolveScopedServiceType(
    service_type,
    filterScope,
  );

  const isRange = period === "range";
  if (
    isRange &&
    !(
      Number.isInteger(params.startMonth) &&
      Number.isInteger(params.endMonth) &&
      params.startMonth! >= 1 &&
      params.endMonth! <= 12 &&
      params.startMonth! <= params.endMonth!
    )
  ) {
    throw new RankingInputError("Rentang bulan tidak valid.");
  }
  const isPeriodUuid =
    period && period !== "ytd" && period !== "alltime" && !isRange;

  // Rentang bulan dipetakan ke periode QA. Tanpa periode di rentang itu,
  // ranking kosong — jangan jatuh ke "semua periode".
  const allPeriods = isRange ? await sidakService.getPeriods() : null;
  const rangePeriodIds = isRange
    ? periodIdsForMonths(allPeriods ?? [], year, params.startMonth!, params.endMonth!)
    : undefined;

  const [dashboardData, periods, folders, availableYears] =
    await Promise.all([
      sidakService.getDashboardData({
        period_ids: isPeriodUuid ? [period] : rangePeriodIds,
        service_type: effectiveServiceType,
        folder_ids: folder !== "ALL" ? [folder] : undefined,
        year: period === "alltime" ? undefined : year,
        agent_ids: accessibleIds ?? undefined,
        allowedServiceTypes: filterScope?.allowedServices ?? undefined,
        limit: 0,
      }),
      allPeriods ? Promise.resolve(allPeriods) : sidakService.getPeriods(),
      supabaseAdmin
        .from("profiler_folders")
        .select("id, name, parent_id")
        .order("name"),
      sidakService.getAvailableYears(accessibleIds ?? undefined),
    ]);

  if (folders.error) throw new Error(folders.error.message);

  const scopedFolders = filterScope
    ? filterScope.allowedFolders
    : (folders?.data ?? []).map((f: any) => ({
        id: f.id,
        name: f.name,
        parent_id: f.parent_id ?? null,
      }));

  const availableServices = filterScope && filterScope.serviceTypeLocked
    ? filterScope.allowedServices.filter((svc) =>
        dashboardData.availableServices.includes(svc),
      )
    : dashboardData.availableServices;

  let finalRankings =
    rangePeriodIds && rangePeriodIds.length === 0
      ? []
      : withRankChange(dashboardData.topAgents);
  let comparison: RankingData["comparison"] = null;

  if (isRange && rangePeriodIds && rangePeriodIds.length > 0) {
    // Pembanding sama seperti YTD lama: rentang ini sebelum periode aktif
    // terakhirnya. Bila periode aktif terakhir adalah bulan pertama rentang
    // (atau rentang satu bulan), pembandingnya bulan sebelumnya.
    const rangeSet = new Set(rangePeriodIds);
    const rangePeriods = ((periods ?? []) as PeriodRow[])
      .filter((p) => rangeSet.has(p.id))
      .sort((a, b) => a.month - b.month);
    const active = await fetchActivePeriodIds(
      year,
      effectiveServiceType,
      accessibleIds,
    );
    let latestIdx = -1;
    for (let i = rangePeriods.length - 1; i >= 0; i--) {
      if (active.has(rangePeriods[i]!.id)) {
        latestIdx = i;
        break;
      }
    }
    let prevPeriods: PeriodRow[] = [];
    if (latestIdx > 0) {
      prevPeriods = rangePeriods.slice(0, latestIdx);
    } else if (latestIdx === 0) {
      const month = rangePeriods[0]!.month;
      const prevIds = new Set(
        periodIdsForMonths((periods ?? []) as PeriodRow[], year, month - 1, month - 1),
      );
      prevPeriods = ((periods ?? []) as PeriodRow[]).filter((p) => prevIds.has(p.id));
    }
    const prevPeriodIds = prevPeriods.map((p) => p.id);
    if (prevPeriodIds.length > 0) {
      comparison = { label: comparisonLabel(prevPeriods) };
      const prevDashboardData = await sidakService.getDashboardData({
        period_ids: prevPeriodIds,
        service_type: effectiveServiceType,
        folder_ids: folder !== "ALL" ? [folder] : undefined,
        agent_ids: accessibleIds ?? undefined,
        allowedServiceTypes: filterScope?.allowedServices ?? undefined,
        limit: 0,
      });
      finalRankings = withRankChange(
        dashboardData.topAgents ?? [],
        prevDashboardData.topAgents ?? [],
      );
    }
  } else if (periods && period !== "alltime") {
    const periodsForYearAsc = periods
      .filter((p: any) => p.year === year)
      .sort((a: any, b: any) => (a.month ?? 0) - (b.month ?? 0));

    let prevPeriodIds: string[] | undefined = undefined;

    if (period === "ytd" && periodsForYearAsc.length > 1) {
      const activePeriodIds = await fetchActivePeriodIds(
        year,
        effectiveServiceType,
        accessibleIds,
      );

      let latestIdx = -1;
      for (let i = periodsForYearAsc.length - 1; i >= 0; i--) {
        if (activePeriodIds.has(periodsForYearAsc[i].id)) {
          latestIdx = i;
          break;
        }
      }

      if (latestIdx > 0) {
        prevPeriodIds = periodsForYearAsc.slice(0, latestIdx).map((p: any) => p.id);
      }
    } else if (isPeriodUuid) {
      const selectedIdx = periodsForYearAsc.findIndex((p: any) => p.id === period);
      if (selectedIdx > 0) {
        prevPeriodIds = [periodsForYearAsc[selectedIdx - 1].id];
      }
    }

    if (prevPeriodIds && prevPeriodIds.length > 0) {
      const prevDashboardData = await sidakService.getDashboardData({
        period_ids: prevPeriodIds,
        service_type: effectiveServiceType,
        folder_ids: folder !== "ALL" ? [folder] : undefined,
        year,
        agent_ids: accessibleIds ?? undefined,
        allowedServiceTypes: filterScope?.allowedServices ?? undefined,
        limit: 0,
      });

      finalRankings = withRankChange(
        dashboardData.topAgents ?? [],
        prevDashboardData.topAgents ?? [],
      );
    }
  }

  return {
    rankings: finalRankings,
    periods,
    folders: scopedFolders,
    availableYears,
    availableServices,
    comparison,
  };
}
