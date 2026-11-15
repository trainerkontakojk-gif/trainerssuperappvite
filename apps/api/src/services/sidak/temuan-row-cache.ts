import { pesertaScopeFromIds, scopePesertaIds } from "../access/scope";
import { supabaseAdmin } from "../../lib/supabase";
import {
  fetchAllByIdPartitions,
  fetchAllPages,
} from "../../lib/supabase-pagination";
import { createTtlCache } from "../../lib/ttl-cache";
import type { DashboardTemuanRow } from "./dashboard-types";

/**
 * Every `qa_temuan` column the dashboard, the trend, and the agent directory
 * read. One year of rows serves all three, so the year is scanned once per TTL
 * per instance instead of once per request.
 */
export const TEMUAN_ROW_COLUMNS =
  "id, peserta_id, period_id, indicator_id, rule_indicator_id, service_type, tahun, nilai, no_tiket, created_at, is_phantom_padding, is_countable";

export type CachedTemuanRow = Omit<DashboardTemuanRow, "profiler_peserta">;
export type CachedPeserta = NonNullable<
  DashboardTemuanRow["profiler_peserta"]
> & { id: string };

// A year far above today's size (~12k rows) is read uncached rather than held
// in every instance's memory.
const MAX_CACHED_ROWS = 150_000;

/**
 * Unscoped, unfiltered rows per year: every service, peserta, and phantom row.
 * Callers apply scope, service, period, folder, and exclusion per request;
 * access scope is never part of the key or the value.
 */
const rowCache = createTtlCache<number, CachedTemuanRow[]>(
  (rows) => rows.length <= MAX_CACHED_ROWS,
);
const pesertaCache = createTtlCache<"all", CachedPeserta[]>();

/** Rows of one year in ascending `id` order. */
export function getYearTemuanRows(year: number): Promise<CachedTemuanRow[]> {
  return rowCache.get(year, () =>
    fetchAllByIdPartitions<CachedTemuanRow>({
      build: ({ fromId, beforeId, afterId, limit }) => {
        let query = supabaseAdmin
          .from("qa_temuan")
          .select(TEMUAN_ROW_COLUMNS)
          .eq("tahun", year)
          .gte("id", fromId)
          .order("id", { ascending: true })
          .limit(limit);
        if (beforeId) query = query.lt("id", beforeId);
        if (afterId) query = query.gt("id", afterId);
        return query as unknown as PromiseLike<{
          data: CachedTemuanRow[] | null;
          error: { message: string } | null;
        }>;
      },
    }),
  );
}

/** The peserta columns the dashboard attaches to each row. */
export function getDashboardPeserta(): Promise<CachedPeserta[]> {
  return pesertaCache.get("all", () =>
    fetchAllPages<CachedPeserta>({
      build: ({ from, to }) =>
        supabaseAdmin
          .from("profiler_peserta")
          .select("id, nama, batch_name, tim, jabatan")
          .order("id", { ascending: true })
          .range(from, to),
    }),
  );
}

/**
 * `applyPesertaScope` for rows in memory: true for every peserta when
 * `agentIds` is undefined, none when it is empty.
 */
export function pesertaScopeFilter(
  agentIds: readonly string[] | undefined,
): (pesertaId: string) => boolean {
  const ids = scopePesertaIds(pesertaScopeFromIds(agentIds));
  if (ids === null) return () => true;
  const allowed = new Set(ids);
  return (pesertaId) => allowed.has(pesertaId);
}

/** Call after any write to `qa_temuan` or `profiler_peserta`. */
export function invalidateTemuanRowCache(): void {
  rowCache.invalidate();
  pesertaCache.invalidate();
}
