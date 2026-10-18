import type {
  MonitoringHistoryStatusFilter,
  MonitoringSessionRow,
} from "@trainers/types";

type Module = MonitoringSessionRow["module"];

/** Status di alamat memakai kata yang dibaca orang, mis. `?status=gagal`. */
export const STATUS_SLUGS = {
  selesai: "completed",
  diproses: "processing",
  gagal: "failed",
  belum: "not_started",
} as const satisfies Record<string, MonitoringHistoryStatusFilter>;

export type HistoryStatusSlug = keyof typeof STATUS_SLUGS;

/** Filter Riwayat yang tersimpan di alamat `/monitoring`. */
export interface HistorySearch {
  modul?: Module;
  status?: HistoryStatusSlug;
  dari?: string;
  sampai?: string;
  q?: string;
  hal?: number;
}

const MODULES: readonly Module[] = ["ketik", "pdkt", "telefun"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string | undefined {
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Nilai yang tidak dikenal dibuang, supaya alamat lama atau rusak tetap terbuka. */
export function validateHistorySearch(
  search: Record<string, unknown>,
): HistorySearch {
  const modul = text(search.modul);
  const status = text(search.status);
  const dari = text(search.dari);
  const sampai = text(search.sampai);
  const q = text(search.q)?.slice(0, 100);
  const hal = Number(search.hal);
  return {
    ...(modul && MODULES.includes(modul as Module)
      ? { modul: modul as Module }
      : {}),
    ...(status && status in STATUS_SLUGS
      ? { status: status as HistoryStatusSlug }
      : {}),
    ...(dari && DATE.test(dari) ? { dari } : {}),
    ...(sampai && DATE.test(sampai) ? { sampai } : {}),
    ...(q ? { q } : {}),
    ...(Number.isInteger(hal) && hal > 1 ? { hal } : {}),
  };
}

export function hasHistoryFilters(search: HistorySearch): boolean {
  return Boolean(
    search.modul || search.status || search.dari || search.sampai || search.q,
  );
}

export const MODULE_LABELS: Record<MonitoringSessionRow["module"], string> = {
  ketik: "KETIK",
  pdkt: "PDKT",
  telefun: "Telefun",
};

export const STATUS_LABELS: Record<
  MonitoringSessionRow["review_status"],
  string
> = {
  completed: "Selesai",
  pending: "Diproses",
  processing: "Diproses",
  failed: "Gagal",
  not_started: "Belum dinilai",
};

let rememberedSearch: HistorySearch = {};

/** Filter Riwayat terakhir, supaya "Kembali ke Riwayat" dari detail menjaganya. */
export function rememberHistorySearch(search: HistorySearch): void {
  rememberedSearch = search;
}

export function lastHistorySearch(): HistorySearch {
  return rememberedSearch;
}
