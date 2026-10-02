/**
 * Agregasi heatmap ketidaksesuaian SIDAK.
 *
 * Dua aturan yang harus selalu benar dan karena itu tidak diserahkan ke SQL:
 *   1. Satu baris = satu temuan. Satu tiket dengan tiga parameter bermasalah
 *      dihitung TIGA, bukan satu. Tidak ada deduplikasi nomor tiket.
 *   2. Hanya baris COUNTABLE yang dihitung, memakai `isCountableFinding()` —
 *      helper yang sama dengan dipakai SIDAK di tempat lain, supaya heatmap
 *      tidak menghitung sesi yang memang complies.
 *
 * Phantom padding SELALU dikeluarkan: sesi tanpa temuan adalah artefak
 * penskoran, bukan ketidaksesuaian.
 *
 * Query memakai user JWT (`createUserClient`) supaya RLS benar-benar berlaku.
 * Tidak ada fallback ke service-role: kalau RLS menolak, hasilnya adalah
 * kesalahan, bukan daftar kosong.
 */

import { HEATMAP_DATE_COLUMN, type SidakHeatmapResponse } from "@trainers/types";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { isCountableFinding } from "./shared-constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SidakHeatmapMode, ServiceType } from "@trainers/types";

/** Kolom yang benar-benar dibutuhkan agregasi — jangan `select("*")`. */
const SELECT_COLUMNS = "id, service_type, nilai, ketidaksesuaian, sebaiknya";

type TemuanRow = {
  id: string;
  service_type: string;
  nilai: number | null;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
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
  tanggal: string | null;
};

function isCountable(row: CountableRow): boolean {
  return isCountableFinding({
    nilai: row.nilai,
    ketidaksesuaian: row.ketidaksesuaian,
    sebaiknya: row.sebaiknya,
  });
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
}): Promise<TemuanRow[]> {
  const { supabase, mode, year, serviceType } = args;
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
      return query as never;
    },
  });
}

/**
 * Hitung temuan COUNTABLE tanpa tanggal mode terpilih pada SELURUH periode.
 * Sengaja tanpa filter tanggal: ruang lingkupnya adalah "sejak dulu".
 *
 * Memakai `fetchAllPages` + predikat `isCountable` yang SAMA dengan kalender,
 * BUKAN `count: "exact"` PostgREST. `count` mentah menghitung SEMUA baris
 * non-phantom bertanggal-null, termasuk baris `nilai=3` tanpa catatan yang
 * sebenarnya complies — itu membuat kartu "Tanggal belum diisi" tidak sepakat
 * dengan kalender. Paging lengkap + `order("id")` juga wajib supaya hitungan
 * tidak terpotong di plafon default 1.000 baris, dan tidak ada fallback
 * "hitung semua" yang memperkenalkan kembali baris complies.
 */
async function countMissingDates(args: {
  supabase: SupabaseClient;
  mode: SidakHeatmapMode;
  serviceType?: ServiceType;
}): Promise<number> {
  const { supabase, mode, serviceType } = args;
  const column = HEATMAP_DATE_COLUMN[mode];

  const rows = await fetchAllPages<CountableRow>({
    build: ({ from, to }) => {
      let query = supabase
        .from("qa_temuan")
        .select("id, nilai, ketidaksesuaian, sebaiknya")
        .eq("is_phantom_padding", false)
        .is(column, null)
        .order("id", { ascending: true })
        .range(from, to);
      if (serviceType) query = query.eq("service_type", serviceType);
      return query as never;
    },
  });

  return rows.filter((row) => isCountable(row)).length;
}

export async function getSidakHeatmap(args: {
  supabase: SupabaseClient;
  mode: SidakHeatmapMode;
  year: number;
  serviceType?: ServiceType;
}): Promise<SidakHeatmapResponse> {
  const { supabase, mode, year, serviceType } = args;

  const [rows, missingDateFindingsAllPeriods] = await Promise.all([
    fetchCountableRows({ supabase, mode, year, serviceType }),
    countMissingDates({ supabase, mode, serviceType }),
  ]);

  const counts = new Map<string, number>();
  let totalFindings = 0;
  for (const row of rows) {
    // Baris tanpa tanggal tidak boleh masuk kalender; sudah dihitung terpisah.
    if (!row.tanggal) continue;
    if (!isCountable(row)) continue;
    counts.set(row.tanggal, (counts.get(row.tanggal) ?? 0) + 1);
    totalFindings += 1;
  }

  return {
    mode,
    year,
    serviceType: serviceType ?? null,
    dateBasis: HEATMAP_DATE_COLUMN[mode],
    days: buildYearDays(year).map((date) => ({
      date,
      count: counts.get(date) ?? 0,
    })),
    totalFindings,
    missingDateFindingsAllPeriods,
  };
}