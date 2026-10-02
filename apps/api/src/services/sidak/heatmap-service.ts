/**
 * Agregasi heatmap ketidaksesuaian SIDAK.
 *
 * Aturan yang harus selalu benar dan karena itu tidak diserahkan ke SQL:
 *   - Hanya baris COUNTABLE yang dihitung, memakai `isCountableFinding()` —
 *     helper yang sama dengan dipakai SIDAK di tempat lain, supaya heatmap
 *     tidak menghitung sesi yang memang complies.
 *   - Satuan `parameter` menghitung satu baris = satu temuan. Satuan `tiket`
 *     menghitung distinct `no_tiket` per hari; baris tanpa nomor tiket tetap
 *     dihitung per baris karena tidak bisa dikelompokkan.
 *
 * Phantom padding SELALU dikeluarkan: sesi tanpa temuan adalah artefak
 * penskoran, bukan ketidaksesuaian.
 *
 * Query memakai client yang diberikan pemanggil. Admin/trainer memakai user JWT
 * (`createUserClient`) supaya RLS berlaku; leader memakai service-role PLUS
 * `scope` app-side karena RLS memang menolak leader. Tidak ada fallback diam
 * dari RLS ke service-role: pemanggil yang menentukan, dan kegagalan query
 * selalu menjadi error, bukan daftar kosong.
 */

import {
  HEATMAP_DATE_COLUMN,
  type SidakHeatmapCountBy,
  type SidakHeatmapResponse,
} from "@trainers/types";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { isCountableFinding } from "./shared-constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SidakHeatmapMode, ServiceType } from "@trainers/types";

/** Kolom yang benar-benar dibutuhkan agregasi — jangan `select("*")`. */
const SELECT_COLUMNS = "id, service_type, nilai, ketidaksesuaian, sebaiknya, no_tiket";

/**
 * Batas akses app-side untuk leader. `null` berarti tanpa batas (admin/trainer).
 * `agentIds: []` berarti tidak ada agent yang boleh dilihat → respons nol.
 */
export type HeatmapScope = {
  agentIds: string[] | null;
  serviceTypes: string[] | null;
};

type TemuanRow = {
  id: string;
  service_type: string;
  nilai: number | null;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  no_tiket: string | null;
  tanggal: string | null;
};

/** Deret semua tanggal satu tahun, termasuk 29 Februari bila tahun itu leap. */
export function buildYearDays(year: number): string[] {
  const days: string[] = [];
  const daysInMonth = (month: number) =>
    new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let month = 1; month <= 12; month++) {
    const last = daysInMonth(month);
    for (let day = 1; day <= last; day++) {
      days.push(
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      );
    }
  }
  return days;
}

type CountableRow = {
  nilai: number | null;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  no_tiket?: string | null;
  tanggal?: string | null;
};

function isCountable(row: CountableRow): boolean {
  return isCountableFinding({
    nilai: row.nilai,
    ketidaksesuaian: row.ketidaksesuaian,
    sebaiknya: row.sebaiknya,
  });
}

function hasTicketNumber(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Terapkan batas agent + layanan secara konsisten ke setiap query. */
function applyScope<T extends { eq: Function; in: Function }>(
  query: T,
  agentId: string | undefined,
  scope: HeatmapScope | undefined,
): T {
  let q = query;
  if (agentId) q = q.eq("peserta_id", agentId) as T;
  if (scope?.agentIds && scope.agentIds.length > 0) {
    q = q.in("peserta_id", scope.agentIds) as T;
  }
  if (scope?.serviceTypes && scope.serviceTypes.length > 0) {
    q = q.in("service_type", scope.serviceTypes) as T;
  }
  return q;
}

/**
 * Ambil seluruh baris countable untuk mode + tahun terpilih.
 *
 * `order("id")` dipakai bertingkat supaya paging `fetchAllPages` deterministik;
 * tanpa order stabil, baris bisa terlewat atau terduplikasi antar halaman.
 */
async function fetchCountableRows(args: {
  supabase: SupabaseClient;
  mode: SidakHeatmapMode;
  year: number;
  serviceType?: ServiceType;
  agentId?: string;
  scope?: HeatmapScope;
}): Promise<TemuanRow[]> {
  const { supabase, mode, year, serviceType, agentId, scope } = args;
  const column = HEATMAP_DATE_COLUMN[mode];

  return fetchAllPages<TemuanRow>({
    build: ({ from, to }) => {
      let query = supabase
        .from("qa_temuan")
        // Alias kolom tanggal menjadi `tanggal` supaya pembacaan di bawah tidak
        // bergantung pada mode. PostgREST mengembalikan key sesuai nama kolom.
        .select(`${SELECT_COLUMNS}, tanggal:${column}`)
        .eq("is_phantom_padding", false)
        .gte(column, `${year}-01-01`)
        .lte(column, `${year}-12-31`)
        .order("id", { ascending: true })
        .range(from, to);
      if (serviceType) query = query.eq("service_type", serviceType);
      query = applyScope(query, agentId, scope) as never;
      return query as never;
    },
  });
}

/**
 * Hitung temuan COUNTABLE tanpa tanggal mode terpilih pada SELURUH periode.
 * Sengaja tanpa filter tanggal: ruang lingkupnya adalah "sejak dulu".
 *
 * Memakai `fetchAllPages` + predikat `isCountable` yang SAMA dengan kalender,
 * BUKAN `count: "exact"` PostgREST. Paging lengkap + `order("id")` juga wajib
 * supaya hitungan tidak terpotong di plafon default 1.000 baris.
 */
async function fetchMissingDateRows(args: {
  supabase: SupabaseClient;
  mode: SidakHeatmapMode;
  serviceType?: ServiceType;
  agentId?: string;
  scope?: HeatmapScope;
}): Promise<CountableRow[]> {
  const { supabase, mode, serviceType, agentId, scope } = args;
  const column = HEATMAP_DATE_COLUMN[mode];

  return fetchAllPages<CountableRow>({
    build: ({ from, to }) => {
      let query = supabase
        .from("qa_temuan")
        .select("id, nilai, ketidaksesuaian, sebaiknya, no_tiket")
        .eq("is_phantom_padding", false)
        .is(column, null)
        .order("id", { ascending: true })
        .range(from, to);
      if (serviceType) query = query.eq("service_type", serviceType);
      query = applyScope(query, agentId, scope) as never;
      return query as never;
    },
  });
}

/** Kelompokkan baris kalender menjadi hitungan per tanggal sesuai satuan. */
function aggregateByDay(
  rows: TemuanRow[],
  countBy: SidakHeatmapCountBy,
): { counts: Map<string, number>; total: number } {
  const counts = new Map<string, number>();

  if (countBy === "parameter") {
    for (const row of rows) {
      if (!row.tanggal || !isCountable(row)) continue;
      counts.set(row.tanggal, (counts.get(row.tanggal) ?? 0) + 1);
    }
  } else {
    // `tiket`: distinct `no_tiket` per hari + baris tanpa nomor per baris.
    const ticketsByDay = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.tanggal || !isCountable(row)) continue;
      if (hasTicketNumber(row.no_tiket)) {
        const set = ticketsByDay.get(row.tanggal) ?? new Set<string>();
        set.add(row.no_tiket);
        ticketsByDay.set(row.tanggal, set);
      } else {
        counts.set(row.tanggal, (counts.get(row.tanggal) ?? 0) + 1);
      }
    }
    for (const [date, set] of ticketsByDay) {
      counts.set(date, (counts.get(date) ?? 0) + set.size);
    }
  }

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return { counts, total };
}

/** Hitung temuan tanpa tanggal pada seluruh periode sesuai satuan. */
function countMissingByUnit(
  rows: CountableRow[],
  countBy: SidakHeatmapCountBy,
): number {
  const countable = rows.filter((row) => isCountable(row));
  if (countBy === "parameter") return countable.length;
  const tickets = new Set<string>();
  let withoutTicket = 0;
  for (const row of countable) {
    if (hasTicketNumber(row.no_tiket)) tickets.add(row.no_tiket);
    else withoutTicket += 1;
  }
  return tickets.size + withoutTicket;
}

function emptyResponse(args: {
  mode: SidakHeatmapMode;
  year: number;
  serviceType?: ServiceType;
  countBy: SidakHeatmapCountBy;
  agentId?: string;
}): SidakHeatmapResponse {
  return {
    mode: args.mode,
    year: args.year,
    serviceType: args.serviceType ?? null,
    dateBasis: HEATMAP_DATE_COLUMN[args.mode],
    countBy: args.countBy,
    agentId: args.agentId ?? null,
    days: buildYearDays(args.year).map((date) => ({ date, count: 0 })),
    totalFindings: 0,
    missingDateFindingsAllPeriods: 0,
  };
}

export async function getSidakHeatmap(args: {
  supabase: SupabaseClient;
  mode: SidakHeatmapMode;
  year: number;
  serviceType?: ServiceType;
  countBy?: SidakHeatmapCountBy;
  agentId?: string;
  scope?: HeatmapScope;
}): Promise<SidakHeatmapResponse> {
  const {
    supabase,
    mode,
    year,
    serviceType,
    countBy = "parameter",
    agentId,
    scope,
  } = args;

  // Scope kosong = tidak ada agent yang boleh dilihat. Respons nol yang sah,
  // bukan error, dan tidak perlu query.
  if (scope?.agentIds && scope.agentIds.length === 0) {
    return emptyResponse({ mode, year, serviceType, countBy, agentId });
  }

  const [rows, missingRows] = await Promise.all([
    fetchCountableRows({ supabase, mode, year, serviceType, agentId, scope }),
    fetchMissingDateRows({ supabase, mode, serviceType, agentId, scope }),
  ]);

  const { counts, total } = aggregateByDay(rows, countBy);

  return {
    mode,
    year,
    serviceType: serviceType ?? null,
    dateBasis: HEATMAP_DATE_COLUMN[mode],
    countBy,
    agentId: agentId ?? null,
    days: buildYearDays(year).map((date) => ({
      date,
      count: counts.get(date) ?? 0,
    })),
    totalFindings: total,
    missingDateFindingsAllPeriods: countMissingByUnit(missingRows, countBy),
  };
}
