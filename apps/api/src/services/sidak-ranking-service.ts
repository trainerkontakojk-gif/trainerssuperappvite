import type { TopAgentData } from "@trainers/types";
import { supabaseAdmin } from "../lib/supabase";
import * as sidakService from "./sidak-service";

export type RankingPeriodMode = "ytd" | "alltime" | string;

export type GetRankingDataParams = {
  period: RankingPeriodMode;
  service_type: string;
  year: number;
  folder: string;
  accessibleIds: string[] | null;
  filterScope: sidakService.SidakFilterScope | null;
};

export type RankingData = {
  rankings: TopAgentData[];
  periods: any[];
  folders: Array<{ id: string; name: string }>;
  availableYears: number[];
  availableServices: string[];
};

export async function getRankingData(params: GetRankingDataParams): Promise<RankingData> {
  const { period, service_type, year, folder, accessibleIds, filterScope } = params;

  const isPeriodUuid = period && period !== "ytd" && period !== "alltime";

  const [dashboardData, periods, folders, availableYears] =
    await Promise.all([
      sidakService.getDashboardData({
        period_ids: isPeriodUuid ? [period] : undefined,
        service_type,
        folder_ids: folder !== "ALL" ? [folder] : undefined,
        year: period === "alltime" ? undefined : year,
        agent_ids: accessibleIds ?? undefined,
        allowedServiceTypes: filterScope?.allowedServices ?? undefined,
        limit: 0,
      }),
      sidakService.getPeriods(),
      supabaseAdmin.from("profiler_folders").select("id, name").order("name"),
      sidakService.getAvailableYears(accessibleIds ?? undefined),
    ]);

  if (folders.error) throw new Error(folders.error.message);

  const scopedFolders = filterScope
    ? filterScope.allowedFolders
    : (folders?.data ?? []).map((f: any) => ({ id: f.id, name: f.name }));

  const availableServices = filterScope && filterScope.serviceTypeLocked
    ? filterScope.allowedServices.filter((svc) =>
        dashboardData.availableServices.includes(svc),
      )
    : dashboardData.availableServices;

  let finalRankings = dashboardData.topAgents;

  if (periods && period !== "alltime") {
    const periodsForYearAsc = periods
      .filter((p: any) => p.year === year)
      .sort((a: any, b: any) => (a.month ?? 0) - (b.month ?? 0));

    let prevPeriodIds: string[] | undefined = undefined;

    if (period === "ytd" && periodsForYearAsc.length > 1) {
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
        if (service_type && service_type !== "all") {
          temuanQuery = temuanQuery.eq("service_type", service_type);
        }
        if (accessibleIds && accessibleIds.length > 0) {
          temuanQuery = temuanQuery.in("peserta_id", accessibleIds);
        }
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
      const activePeriodIds = new Set(temuanPeriods.map((t) => t.period_id));

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
        service_type,
        folder_ids: folder !== "ALL" ? [folder] : undefined,
        year,
        agent_ids: accessibleIds ?? undefined,
        allowedServiceTypes: filterScope?.allowedServices ?? undefined,
        limit: 0,
      });

      const prevRankMap = new Map<string, number>();
      (prevDashboardData.topAgents ?? []).forEach((agent: any, index: number) => {
        prevRankMap.set(agent.agentId, index + 1);
      });

      finalRankings = (dashboardData.topAgents ?? []).map((agent: any, index: number) => {
        const currentRank = index + 1;
        const previousRank = prevRankMap.get(agent.agentId);
        const rankChange = previousRank !== undefined ? (previousRank - currentRank) : null;
        return {
          ...agent,
          rankChange,
        };
      });
    }
  }

  return {
    rankings: finalRankings,
    periods,
    folders: scopedFolders,
    availableYears,
    availableServices,
  };
}
