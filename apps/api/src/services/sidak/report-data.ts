import { applyPesertaScope, pesertaScopeFromIds } from "../access/scope";
import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { getSoftDeletedPesertaIds } from "./agent-directory";
import { getPeriods } from "./period-indicator";

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
  if (params.agent_ids && params.agent_ids.length === 0) {
    return [];
  }

  const hasMonthRangeFilter =
    params.year !== undefined &&
    (params.startMonth !== undefined || params.endMonth !== undefined);

  const periodIdsInRange = hasMonthRangeFilter
    ? (await getPeriods())
        .filter((period) => period.year === params.year)
        .filter(
          (period) =>
            params.startMonth === undefined ||
            period.month >= params.startMonth,
        )
        .filter(
          (period) =>
            params.endMonth === undefined || period.month <= params.endMonth,
        )
        .map((period) => period.id)
    : [];

  if (hasMonthRangeFilter && periodIdsInRange.length === 0) {
    return [];
  }

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
      q = applyPesertaScope(
        q,
        pesertaScopeFromIds(params.agent_ids),
        "peserta_id",
      );

      if (excludedIds.length > 0) {
        q = q.not("peserta_id", "in", `(${excludedIds.join(",")})`);
      }

      if (hasMonthRangeFilter) {
        q = q.in("period_id", periodIdsInRange);
      }

      return q;
    },
  });
  return rows;
}

export async function getServiceWeights(): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from("qa_service_weights")
    .select("*");
  if (error)
    throw new Error(`Gagal mengambil service weight: ${error.message}`);
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
