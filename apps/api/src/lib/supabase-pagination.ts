type QueryExecutor<T> = (range: {
  from: number;
  to: number;
}) => PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

/**
 * Paginate a Supabase query by walking the entire result set in 1000-row pages.
 *
 * Supabase REST API auto-caps `.from().select()` at 1000 rows when no
 * `.range()` / `.limit()` / `.single()` is present. This helper loops
 * `.range(from, to)` until the underlying query returns fewer than `pageSize`
 * rows (i.e. we've hit the end).
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
}: {
  build: QueryExecutor<T>;
  pageSize?: number;
}): Promise<T[]> {
  const allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await build({ from, to: from + pageSize - 1 });
    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData.push(...data);
      hasMore = data.length === pageSize;
      from += pageSize;
    }
  }

  return allData;
}
