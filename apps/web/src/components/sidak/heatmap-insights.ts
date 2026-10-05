import type { HeatmapDay } from "./SidakHeatmapCalendar";

/**
 * Insight heatmap SIDAK — dihitung murni dari `days`.
 *
 * Semua angka adalah **volume temuan**, bukan rate atau defect-rate: tidak ada
 * denominator jumlah layanan/audit, jadi jangan menurunkan metrik rasio dari
 * sini. Dipakai bersama oleh halaman heatmap utama dan heatmap per-agent agar
 * definisinya tidak bercabang.
 */

const WEEKDAY_FULL = [
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
  "Minggu",
];

const MONTH_FULL = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

/** Senin = 0 … Minggu = 6 (UTC agar tidak terpengaruh timezone). */
function weekdayIndex(iso: string) {
  const { y, m, d } = parts(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function formatInsightDateLong(iso: string) {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTH_FULL[m - 1]} ${y}`;
}

export function formatInsightDateShort(iso: string) {
  const { m, d } = parts(iso);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

export interface HeatmapInsights {
  total: number;
  activeDays: number;
  emptyDays: number;
  averagePerActiveDay: number | null;
  averagePerCalendarDay: number | null;
  busiestDay: { date: string; count: number } | null;
  quietestActiveDay: { date: string; count: number } | null;
  busiestWeekday: { label: string; total: number } | null;
  busiestMonth: { label: string; total: number } | null;
  activeRange: { from: string; to: string } | null;
}

export function buildHeatmapInsights(
  days: readonly HeatmapDay[],
): HeatmapInsights {
  const active = days.filter((day) => day.count > 0);
  const total = days.reduce((sum, day) => sum + day.count, 0);

  if (active.length === 0) {
    return {
      total: 0,
      activeDays: 0,
      emptyDays: days.length,
      averagePerActiveDay: null,
      averagePerCalendarDay: null,
      busiestDay: null,
      quietestActiveDay: null,
      busiestWeekday: null,
      busiestMonth: null,
      activeRange: null,
    };
  }

  let busiest = active[0]!;
  let quietest = active[0]!;
  const weekdayTotals = new Array<number>(7).fill(0);
  const monthTotals = new Array<number>(12).fill(0);
  let from = active[0]!.date;
  let to = active[0]!.date;

  for (const day of active) {
    if (day.count > busiest.count) busiest = day;
    if (day.count < quietest.count) quietest = day;
    weekdayTotals[weekdayIndex(day.date)] += day.count;
    const { m } = parts(day.date);
    monthTotals[m - 1] += day.count;
    if (day.date < from) from = day.date;
    if (day.date > to) to = day.date;
  }

  const busiestWeekdayIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));
  const busiestMonthIndex = monthTotals.indexOf(Math.max(...monthTotals));

  return {
    total,
    activeDays: active.length,
    emptyDays: days.length - active.length,
    averagePerActiveDay: total / active.length,
    averagePerCalendarDay: days.length > 0 ? total / days.length : null,
    busiestDay: { date: busiest.date, count: busiest.count },
    quietestActiveDay: { date: quietest.date, count: quietest.count },
    busiestWeekday: {
      label: WEEKDAY_FULL[busiestWeekdayIndex]!,
      total: weekdayTotals[busiestWeekdayIndex]!,
    },
    busiestMonth: {
      label: MONTH_FULL[busiestMonthIndex]!,
      total: monthTotals[busiestMonthIndex]!,
    },
    activeRange: { from, to },
  };
}
