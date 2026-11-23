import { pesertaScopeFromIds, scopePesertaIds } from "../access/scope";
import { env } from "../../lib/env";
import { supabaseAdmin } from "../../lib/supabase";
import {
  fetchAllByIdPartitions,
  fetchAllPages,
} from "../../lib/supabase-pagination";
import { createTtlCache } from "../../lib/ttl-cache";
import type { DashboardTemuanRow } from "./dashboard-types";

/**
 * Every `qa_temuan` column the dashboard, the trend, and the agent directory
 * read. One year of rows serves all three, and a compact per-year version check
 * avoids rescanning unchanged rows.
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
type CachedYearRows = {
  rows: CachedTemuanRow[];
  version: number;
  checkedAt: number;
};

const rowCache = new Map<number, CachedYearRows>();
const pendingYearRows = new Map<number, Promise<CachedTemuanRow[]>>();
let rowCacheGeneration = 0;
let versionCheckFailureLogged = false;
const pesertaCache = createTtlCache<"all", CachedPeserta[]>();

async function readYearVersion(year: number): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc(
    "get_qa_temuan_year_version",
    { p_tahun: year },
  );
  if (error) throw error;
  if (typeof data !== "number" || !Number.isSafeInteger(data) || data < 0) {
    throw new Error("get_qa_temuan_year_version returned an invalid version");
  }
  return data;
}

async function fetchYearTemuanRows(year: number): Promise<CachedTemuanRow[]> {
  return fetchAllByIdPartitions<CachedTemuanRow>({
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
  });
}

function shouldCacheYear(rows: CachedTemuanRow[]): boolean {
  return rows.length <= MAX_CACHED_ROWS;
}

/** Rows of one year in ascending `id` order. */
export function getYearTemuanRows(year: number): Promise<CachedTemuanRow[]> {
  const cached = rowCache.get(year);
  if (
    cached &&
    Date.now() - cached.checkedAt < env.SIDAK_TEMUAN_VERSION_CHECK_MS
  ) {
    return Promise.resolve(structuredClone(cached.rows));
  }

  let pending = pendingYearRows.get(year);
  if (!pending) {
    const startedGeneration = rowCacheGeneration;
    pending = Promise.resolve().then(async () => {
      let version: number;
      try {
        version = await readYearVersion(year);
      } catch (error) {
        if (rowCacheGeneration === startedGeneration) rowCache.delete(year);
        if (!versionCheckFailureLogged) {
          versionCheckFailureLogged = true;
          console.error(
            "[SIDAK] qa_temuan year-version check failed; rescanning this year without caching. The version migration may not be applied.",
            error,
          );
        }
        return fetchYearTemuanRows(year);
      }

      const current = rowCache.get(year);
      if (current && current.version === version) {
        if (rowCacheGeneration === startedGeneration) {
          rowCache.set(year, { ...current, checkedAt: Date.now() });
        }
        return current.rows;
      }

      if (rowCacheGeneration === startedGeneration) rowCache.delete(year);
      const rows = await fetchYearTemuanRows(year);
      if (rowCacheGeneration === startedGeneration && shouldCacheYear(rows)) {
        rowCache.set(year, {
          rows: structuredClone(rows),
          version,
          checkedAt: Date.now(),
        });
      }
      return rows;
    });
    pendingYearRows.set(year, pending);
    const currentPending = pending;
    void pending
      .finally(() => {
        if (pendingYearRows.get(year) === currentPending)
          pendingYearRows.delete(year);
      })
      .catch(() => {});
  }

  return pending.then((rows) =>
    shouldCacheYear(rows) ? structuredClone(rows) : rows,
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
  rowCacheGeneration++;
  rowCache.clear();
  pendingYearRows.clear();
  pesertaCache.invalidate();
}
