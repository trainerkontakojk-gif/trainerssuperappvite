/** Modul yang mencatat pemakaian AI di `ai_usage_logs`. */
export const USAGE_MODULE_LABELS = {
  ketik: "KETIK",
  pdkt: "PDKT",
  telefun: "Telefun",
  "qa-analyzer": "Analisis QA",
} as const;

export type UsageModule = keyof typeof USAGE_MODULE_LABELS;

/** Filter Biaya AI yang tersimpan di alamat, mis. `?bulan=2026-10&modul=pdkt`. */
export interface BiayaSearch {
  /** YYYY-MM, bulan WIB. Kosong berarti bulan ini. */
  bulan?: string;
  modul?: UsageModule;
  q?: string;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** Catatan biaya pertama ada di 2025; bulan sebelum itu tidak ditawarkan. */
const FIRST_MONTH = "2025-01";

function text(value: unknown): string | undefined {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Bulan berjalan menurut jam WIB, YYYY-MM. */
export function currentUsageMonth(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
}

/** Nilai yang tidak dikenal dibuang, supaya alamat lama atau rusak tetap terbuka. */
export function validateBiayaSearch(
  search: Record<string, unknown>,
): BiayaSearch {
  const bulan = text(search.bulan);
  const modul = text(search.modul);
  const q = text(search.q)?.slice(0, 100);
  return {
    ...(bulan &&
    MONTH.test(bulan) &&
    bulan >= FIRST_MONTH &&
    bulan <= currentUsageMonth()
      ? { bulan }
      : {}),
    ...(modul && modul in USAGE_MODULE_LABELS
      ? { modul: modul as UsageModule }
      : {}),
    ...(q ? { q } : {}),
  };
}

export function usageMonth(search: BiayaSearch): string {
  return search.bulan ?? currentUsageMonth();
}

export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** "2026-10" menjadi "Oktober 2026". */
export function formatUsageMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 15)).toLocaleString("id-ID", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Bulan yang bisa dipilih, terbaru dulu. */
export function usageMonthOptions(): string[] {
  const months: string[] = [];
  for (
    let month = currentUsageMonth();
    month >= FIRST_MONTH;
    month = shiftMonth(month, -1)
  ) {
    months.push(month);
  }
  return months;
}

export function isFirstUsageMonth(month: string): boolean {
  return month <= FIRST_MONTH;
}

export function isCurrentUsageMonth(month: string): boolean {
  return month >= currentUsageMonth();
}

/** Bulan di alamat dikirim ke API sebagai tahun dan bulan. */
export function usageQuery(search: BiayaSearch) {
  const [year, month] = usageMonth(search).split("-");
  return {
    year,
    month: String(Number(month)),
    ...(search.modul ? { module: search.modul } : {}),
  };
}

let rememberedSearch: BiayaSearch = {};

/** Filter Biaya AI terakhir, supaya "Kembali ke Biaya AI" menjaganya. */
export function rememberBiayaSearch(search: BiayaSearch): void {
  rememberedSearch = search;
}

export function lastBiayaSearch(): BiayaSearch {
  return rememberedSearch;
}
