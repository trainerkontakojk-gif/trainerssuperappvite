import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { getSoftDeletedPesertaIds } from "./agent-directory";
import { getIndicators } from "./period-indicator";

export async function getDataReportRows(params: {
  serviceType?: string;
  year?: number;
  startMonth?: number;
  endMonth?: number;
  folderId?: string;
  pesertaId?: string;
  indicatorId?: string;
  agent_ids?: string[];
  showArchived?: boolean;
}): Promise<any[]> {
  // Get soft-deleted peserta IDs for exclusion (unless showing archived)
  const excludedIds = params.showArchived
    ? []
    : await getSoftDeletedPesertaIds();

  const rows = await fetchAllPages<any>({
    build: async ({ from, to }) => {
      let q = supabaseAdmin
        .from("qa_temuan")
        .select(
          "*, profiler_peserta!inner(id, nama, batch_name, tim, jabatan), qa_indicators!inner(id, name, category), qa_periods!inner(id, month, year)",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (params.serviceType) q = q.eq("service_type", params.serviceType);
      if (params.year) q = q.eq("tahun", params.year);
      if (params.pesertaId) q = q.eq("peserta_id", params.pesertaId);
      if (params.indicatorId) q = q.eq("indicator_id", params.indicatorId);
      if (params.agent_ids && params.agent_ids.length > 0)
        q = q.in("peserta_id", params.agent_ids);

      if (excludedIds.length > 0) {
        q = q.not("peserta_id", "in", `(${excludedIds.join(",")})`);
      }

      if (params.startMonth && params.year) {
        const startPeriod = await supabaseAdmin
          .from("qa_periods")
          .select("id")
          .eq("month", params.startMonth)
          .eq("year", params.year)
          .single();
        if (startPeriod.data) q = q.gte("period_id", startPeriod.data.id);
      }

      if (params.endMonth && params.year) {
        const endPeriod = await supabaseAdmin
          .from("qa_periods")
          .select("id")
          .eq("month", params.endMonth)
          .eq("year", params.year)
          .single();
        if (endPeriod.data) q = q.lte("period_id", endPeriod.data.id);
      }

      return q;
    },
  });
  return rows;
}

export async function getReportChartData(params: {
  serviceType?: string;
  year?: number;
  startMonth?: number;
  endMonth?: number;
  folderId?: string;
  pesertaId?: string;
  agent_ids?: string[];
}): Promise<{
  donutData: { critical: number; nonCritical: number; total: number };
  paretoData: { name: string; count: number; cumulative: number }[];
  trendData: { month: string; total: number }[];
}> {
  const rows = await getDataReportRows(params);
  if (rows.length === 0) {
    return {
      donutData: { critical: 0, nonCritical: 0, total: 0 },
      paretoData: [],
      trendData: [],
    };
  }

  const indicators = await getIndicators(params.serviceType);
  const paretoMap = new Map<string, number>();
  let criticalCount = 0;
  let nonCriticalCount = 0;

  for (const row of rows) {
    const ind = indicators.find((i) => i.id === row.indicator_id);
    if (ind) {
      const key = ind.name;
      paretoMap.set(key, (paretoMap.get(key) ?? 0) + 1);
      if (ind.category === "critical") criticalCount++;
      else if (ind.category === "non_critical") nonCriticalCount++;
    }
  }

  const paretoArray = Array.from(paretoMap.entries())
    .map(([name, count]) => ({ name, count, cumulative: 0 }))
    .sort((a, b) => b.count - a.count);

  let cumulative = 0;
  for (const p of paretoArray) {
    cumulative += p.count;
    p.cumulative = cumulative;
  }

  const periodMap = new Map<string, number>();
  for (const row of rows) {
    const period = row.qa_periods as
      | { month?: number; year?: number }
      | undefined;
    if (period?.month && period?.year) {
      const key = `${String(period.month).padStart(2, "0")}/${period.year}`;
      periodMap.set(key, (periodMap.get(key) ?? 0) + 1);
    }
  }

  const sortedPeriods = Array.from(periodMap.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const trendData = sortedPeriods.map(([month, total]) => ({ month, total }));

  return {
    donutData: {
      critical: criticalCount,
      nonCritical: nonCriticalCount,
      total: criticalCount + nonCriticalCount,
    },
    paretoData: paretoArray.slice(0, 15),
    trendData,
  };
}

export async function getServiceWeights(): Promise<any[]> {
  const { data, error } = await supabaseAdmin.from("qa_service_weights").select("*");
  if (error) throw new Error(`Gagal mengambil service weight: ${error.message}`);
  return data ?? [];
}

export async function updateServiceWeight(
  serviceType: string,
  updates: {
    critical_weight?: number;
    non_critical_weight?: number;
    scoring_mode?: string;
  },
) {
  const { data, error } = await supabaseAdmin
    .from("qa_service_weights")
    .update(updates)
    .eq("service_type", serviceType)
    .select()
    .single();
  if (error) throw new Error(`Gagal update service weight: ${error.message}`);
  return data;
}
