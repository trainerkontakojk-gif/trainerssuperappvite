type PageResult<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

type QueryExecutor<T> = (range: { from: number; to: number }) => PageResult<T>;

/**
 * Pages kept in flight by the year-wide SIDAK reads. Each PostgREST page is a
 * full round trip: a year of `qa_temuan` (8.3k rows in production on
 * 2026-11-03) read from a developer machine took 3.4 s page by page and 1.0 s
 * four at a time.
 */
export const PARALLEL_PAGE_CONCURRENCY = 4;

/**
 * Paginate a Supabase query by walking the entire result set in 1000-row pages.
 *
 * Supabase REST API auto-caps `.from().select()` at 1000 rows when no
 * `.range()` / `.limit()` / `.single()` is present. This helper loops
 * `.range(from, to)` until the underlying query returns fewer than `pageSize`
 * rows (i.e. we've hit the end).
 *
 * `concurrency` requests that many consecutive pages at once. Rows are kept in
 * page order up to and including the first short page, so the result is the
 * same as the one-page-at-a-time walk; a wave past the end costs only empty
 * pages. The query must have a stable total order (end with a unique column).
 *
 * Use for any code path that aggregates, counts, or processes the full
 * result set. For UI pagination, prefer `.range(from, to)` directly with
 * a known page size.
 *
 * @example
 *   const rows = await fetchAllPages<TemuanRow>({
 *     build: ({ from, to }) =>
 *       supabaseAdmin
 *         .from("qa_temuan")
 *         .select("id, tahun, service_type")
 *         .order("id")
 *         .range(from, to),
 *     pageSize: 1000,
 *   });
 */
export async function fetchAllPages<T>({
  build,
  pageSize = 1000,
  concurrency = 1,
}: {
  build: QueryExecutor<T>;
  pageSize?: number;
  concurrency?: number;
}): Promise<T[]> {
  const allData: T[] = [];
  const pagesPerWave = Math.max(1, Math.floor(concurrency));
  let from = 0;

  while (true) {
    const wave = await Promise.all(
      Array.from({ length: pagesPerWave }, (_, index) => {
        const start = from + index * pageSize;
        return build({ from: start, to: start + pageSize - 1 });
      }),
    );
    for (const { data, error } of wave) {
      if (error) throw error;
      if (!data || data.length === 0) return allData;
      allData.push(...data);
      if (data.length < pageSize) return allData;
    }
    from += pagesPerWave * pageSize;
  }
}

/** Lower bounds of four equal slices of the UUID space, in ascending order. */
const UUID_PARTITION_LOWER_BOUNDS = [
  "00000000-0000-0000-0000-000000000000",
  "40000000-0000-0000-0000-000000000000",
  "80000000-0000-0000-0000-000000000000",
  "c0000000-0000-0000-0000-000000000000",
];

type IdPartitionPage = {
  /** Inclusive lower `id` bound of this slice. */
  fromId: string;
  /** Exclusive upper `id` bound, or null for the last slice. */
  beforeId: string | null;
  /** Keyset cursor: only rows with `id` greater than this, when set. */
  afterId: string | null;
  limit: number;
};

/**
 * Read every row of a query keyed by a random UUID `id`, keyset-paged
 * (`id > lastId`, ordered by `id`) inside four `id` slices walked in parallel.
 * Slices are concatenated in order, so rows come back sorted by `id` exactly
 * as one keyset walk would return them, in about a quarter of the round trips.
 *
 * `build` must apply `id >= fromId`, `id < beforeId` (when set),
 * `id > afterId` (when set), `order("id")`, and `limit`.
 */
export async function fetchAllByIdPartitions<T extends { id?: string | null }>({
  build,
  pageSize = 1000,
}: {
  build: (page: IdPartitionPage) => PageResult<T>;
  pageSize?: number;
}): Promise<T[]> {
  const slices = await Promise.all(
    UUID_PARTITION_LOWER_BOUNDS.map(async (fromId, index) => {
      const beforeId = UUID_PARTITION_LOWER_BOUNDS[index + 1] ?? null;
      const rows: T[] = [];
      let afterId: string | null = null;
      while (true) {
        const { data, error } = await build({
          fromId,
          beforeId,
          afterId,
          limit: pageSize,
        });
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < pageSize) return rows;
        afterId = page[page.length - 1]!.id ?? null;
        if (!afterId) return rows;
      }
    }),
  );
  return slices.flat();
}
