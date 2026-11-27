import { z } from "zod";
import type { ServiceType, SidakHeatmapCountBy } from "./sidak";

export const jamSchema = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
    "Isi jam dengan format 24 jam, misalnya 08:30 atau 08:30:15.",
  );
const durasiError = "Isi durasi dalam detik, dari 0 sampai 86.399.";
export const durasiDetikSchema = z
  .number(durasiError)
  .int(durasiError)
  .min(0, durasiError)
  .max(86399, durasiError);
export const temuanWaktuSchema = z.object({
  jam_layanan: jamSchema.nullable().optional(),
  durasi_detik: durasiDetikSchema.nullable().optional(),
});
export type TemuanWaktu = z.infer<typeof temuanWaktuSchema>;

type SidakTimeSource =
  | { kind: "jam"; label: string; meaning: string }
  | { kind: "durasi"; label: string }
  | { kind: "none"; reason: string };

export const SIDAK_TIME_SOURCE: Record<ServiceType, SidakTimeSource> = {
  chat: {
    kind: "jam",
    label: "Jam interaksi dimulai",
    meaning: "saat interaksi chat dimulai",
  },
  pencatatan: {
    kind: "jam",
    label: "Jam tiket dibuat",
    meaning: "saat tiket layanan dibuat",
  },
  slik: {
    kind: "jam",
    label: "Jam layanan",
    meaning: "saat layanan SLIK berlangsung",
  },
  call: { kind: "durasi", label: "Durasi panggilan" },
  email: {
    kind: "none",
    reason: "JAM email diisi dengan arti berbeda antar petugas QA",
  },
  cso: {
    kind: "none",
    reason: "jam tiket dibuat tidak mewakili kondisi layanan CSO",
  },
  bko: { kind: "none", reason: "layanan BKO tidak mencatat jam maupun durasi" },
};

export const SIDAK_JAM_BUCKETS = {
  pagi: { label: "Pagi", range: "07:00–10:59", from: 7 * 60, to: 11 * 60 },
  siang: { label: "Siang", range: "11:00–13:59", from: 11 * 60, to: 14 * 60 },
  sore: { label: "Sore", range: "14:00–16:59", from: 14 * 60, to: 17 * 60 },
  luar: { label: "Di luar jam", range: "00:00–06:59 dan 17:00–23:59" },
} as const;

export const SIDAK_DURASI_BUCKETS = {
  singkat: { label: "Singkat", range: "< 5 menit", to: 5 * 60 },
  sedang: { label: "Sedang", range: "5 sampai < 10 menit", to: 10 * 60 },
  panjang: {
    label: "Panjang",
    range: "10 sampai < 15 menit",
    to: 15 * 60,
  },
  sangat_panjang: { label: "Sangat panjang", range: "≥ 15 menit" },
} as const;
export const SIDAK_DURASI_REVIEW_BELOW_SECONDS = 60;

export function classifyJam(jam: string): keyof typeof SIDAK_JAM_BUCKETS {
  const minutes = Number(jam.slice(0, 2)) * 60 + Number(jam.slice(3, 5));
  for (const bucket of ["pagi", "siang", "sore"] as const) {
    const { from, to } = SIDAK_JAM_BUCKETS[bucket];
    if (minutes >= from && minutes < to) return bucket;
  }
  return "luar";
}

export function classifyDurasi(
  seconds: number,
): keyof typeof SIDAK_DURASI_BUCKETS {
  if (seconds < SIDAK_DURASI_BUCKETS.singkat.to) return "singkat";
  if (seconds < SIDAK_DURASI_BUCKETS.sedang.to) return "sedang";
  if (seconds < SIDAK_DURASI_BUCKETS.panjang.to) return "panjang";
  return "sangat_panjang";
}

export type SidakJamBuckets = Record<keyof typeof SIDAK_JAM_BUCKETS, number>;
export type SidakDurasiBuckets = Record<
  keyof typeof SIDAK_DURASI_BUCKETS,
  number
>;

interface SidakHeatmapHoursSummary {
  label: string;
  buckets: SidakJamBuckets;
  total: number;
  missingTime: number;
}

export interface SidakHeatmapTimeProfileResponse {
  year: number;
  serviceType: ServiceType | null;
  countBy: SidakHeatmapCountBy;
  agentId: string | null;
  hours:
    | (SidakHeatmapHoursSummary & {
        cells: Array<{
          weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
          hour: number;
          count: number;
        }>;
      })
    | null;
  hoursByService: Array<
    SidakHeatmapHoursSummary & { serviceType: ServiceType }
  > | null;
  durations: {
    buckets: SidakDurasiBuckets;
    reviewBelowOneMinute: number;
    total: number;
    missingDuration: number;
  } | null;
  notApplicable: number;
}
