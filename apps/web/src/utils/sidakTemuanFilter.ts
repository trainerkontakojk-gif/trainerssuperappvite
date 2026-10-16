/** Saringan tab Temuan di detail agen: bulan dan kata cari (tiket atau parameter). */
export interface TemuanFilter {
  /** `null` = semua bulan. */
  month: number | null;
  query: string;
}

export const EMPTY_TEMUAN_FILTER: TemuanFilter = { month: null, query: "" };

interface FilterableTemuan {
  month: number;
  year: number;
  no_tiket: string | null;
  indicatorName: string;
}

interface FilterableSession {
  month: number;
  no_tiket: string | null;
}

export function isTemuanFilterActive(filter: TemuanFilter): boolean {
  return filter.month !== null || filter.query.trim() !== "";
}

/** Bulan yang punya temuan, terbaru dulu (urutan sama dengan grup di tab). */
export function temuanMonthOptions(items: FilterableTemuan[]): number[] {
  return [...new Set(items.map((item) => item.month))].sort((a, b) => b - a);
}

/**
 * Sesi tanpa temuan tidak punya parameter, jadi kata cari hanya dicocokkan ke
 * nomor tiketnya.
 */
export function filterTemuan<
  T extends FilterableTemuan,
  S extends FilterableSession,
>(
  items: T[],
  sessions: S[],
  filter: TemuanFilter,
): { items: T[]; sessions: S[] } {
  const query = filter.query.trim().toLocaleLowerCase("id-ID");
  const inMonth = (month: number) =>
    filter.month === null || month === filter.month;
  const matches = (...values: Array<string | null>) =>
    query === "" ||
    values.some((value) =>
      (value ?? "").toLocaleLowerCase("id-ID").includes(query),
    );
  return {
    items: items.filter(
      (item) =>
        inMonth(item.month) && matches(item.no_tiket, item.indicatorName),
    ),
    sessions: sessions.filter(
      (session) => inMonth(session.month) && matches(session.no_tiket),
    ),
  };
}
