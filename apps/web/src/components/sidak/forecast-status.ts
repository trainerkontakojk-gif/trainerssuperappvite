/**
 * Satu sumber status Forecast SIDAK: label, ikon, dan warna untuk arah layanan,
 * kelompok agen, dan baris agen. Warna mengikuti pasangan terang/gelap yang
 * sama dengan `SIDAK_SCORE_TEXT` / `SIDAK_SCORE_FILL` (utils/sidakScoreStatus.ts).
 */

import {
  Minus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { SidakAgentForecastEntry } from "@trainers/types";
import { SIDAK_SCORE_FILL, SIDAK_SCORE_TEXT } from "../../utils/sidakScoreStatus";

export type ForecastStatusKey =
  | "improving"
  | "declining"
  | "stable"
  | "watchlist";

export interface ForecastStatusMeta {
  label: string;
  icon: LucideIcon;
  textClass: string;
  dotClass: string;
  /** Kalimat pendek tentang arti status untuk layanan. */
  hint: string;
  /** Deskripsi kelompok agen di header kelompok. */
  groupHint: string;
}

export const FORECAST_STATUS: Record<ForecastStatusKey, ForecastStatusMeta> = {
  improving: {
    label: "Membaik",
    icon: TrendingDown,
    textClass: SIDAK_SCORE_TEXT.ok,
    dotClass: SIDAK_SCORE_FILL.ok,
    hint: "Temuan diproyeksikan turun",
    groupHint: "Skor naik atau temuan turun.",
  },
  declining: {
    label: "Memburuk",
    icon: TrendingUp,
    textClass: SIDAK_SCORE_TEXT.bad,
    dotClass: SIDAK_SCORE_FILL.bad,
    hint: "Temuan diproyeksikan naik",
    groupHint: "Skor turun atau temuan naik.",
  },
  stable: {
    label: "Stabil/stagnan",
    icon: Minus,
    textClass: "text-foreground",
    dotClass: "bg-slate-500 dark:bg-slate-400",
    hint: "Perubahan belum signifikan",
    groupHint: "Perubahan belum signifikan.",
  },
  watchlist: {
    label: "Pantauan",
    icon: ShieldAlert,
    textClass: SIDAK_SCORE_TEXT.warn,
    dotClass: SIDAK_SCORE_FILL.warn,
    hint: "Data belum cukup untuk proyeksi",
    groupHint: "Data belum cukup untuk proyeksi.",
  },
};

/** Arah temuan layanan: temuan turun = membaik. */
export function statusFromDirection(
  direction: "up" | "down" | "stable",
): ForecastStatusKey {
  if (direction === "down") return "improving";
  if (direction === "up") return "declining";
  return "stable";
}

export function statusFromAgent(
  status: SidakAgentForecastEntry["forecastStatus"],
): ForecastStatusKey {
  if (status === "improving") return "improving";
  if (status === "declining") return "declining";
  if (status === "stable") return "stable";
  return "watchlist";
}

export const FORECAST_CONFIDENCE: Record<
  "low" | "medium" | "high",
  { label: string; textClass: string }
> = {
  high: { label: "Tinggi", textClass: SIDAK_SCORE_TEXT.ok },
  medium: { label: "Sedang", textClass: SIDAK_SCORE_TEXT.warn },
  low: { label: "Rendah", textClass: SIDAK_SCORE_TEXT.bad },
};
