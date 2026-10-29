import type {
  EfekChartPoint,
  EfekMonth,
  EfekParticipantStatus,
  EfekSessionSummary,
} from "@trainers/types";
import type { EfekReportSearch } from "../../router";

/** Formatting shared by the EFEK report pages (and the phase 3 export). */

const MONTHS = [
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
export const monthLabel = (m: EfekMonth) => `${MONTHS[m.month - 1]} ${m.year}`;
export const monthShort = (m: EfekMonth) =>
  `${MONTHS[m.month - 1]!.slice(0, 3)} ${m.year}`;

export const one = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const signed = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
export const fmt = (n: number | null) => (n === null ? "–" : one.format(n));
export const fmtDelta = (n: number | null) =>
  n === null ? "–" : signed.format(n).replace("-", "−");
export const deltaClass = (n: number | null) =>
  n === null || Math.abs(n) < 1
    ? "text-muted-foreground"
    : n > 0
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-destructive";
export const reportQuery = (s: EfekReportSearch) => {
  const q = new URLSearchParams();
  if (s.window) q.set("window", String(s.window));
  if (s.year) q.set("year", String(s.year));
  if (s.tim) q.set("tim", s.tim);
  if (s.session) q.set("session", s.session);
  if (s.proper_input === "include") q.set("proper_input", "include");
  if (s.exclusions) q.set("exclusions", s.exclusions);
  const text = q.toString();
  return text ? `?${text}` : "";
};

export const STATUS_LABELS: Record<EfekParticipantStatus, string> = {
  naik: "Naik",
  stabil: "Stabil",
  turun: "Turun",
  menunggu: "Menunggu",
  tanpa_data: "Tidak ada data",
};
export const offsetLabel = (offset: number) =>
  offset === 0 ? "Pelatihan" : offset > 0 ? `+${offset}` : `−${-offset}`;
export const offsetText = (offset: number) =>
  offset === 0
    ? "Bulan pelatihan"
    : offset < 0
      ? `${-offset} bulan sebelum`
      : `${offset} bulan sesudah`;

export function sessionStatusLabel(s: EfekSessionSummary) {
  if (s.status === "menunggu") return `Menunggu ${monthLabel(s.first_after)}`;
  if (s.status === "sebagian")
    return `Sesudah baru ${s.months_after_closed} bulan`;
  return "Terukur";
}

/**
 * Geometry of a two-series chart by month relative to training, shared by the
 * on-screen SVG and the exported HTML so both draw the same picture.
 */
export function chartGeometry(
  points: EfekChartPoint[],
  pick: (p: EfekChartPoint) => [number | null, number | null],
) {
  const width = 480;
  const height = 200;
  const pad = { left: 36, right: 12, top: 14, bottom: 26 };
  const values = points
    .flatMap((p) => pick(p))
    .filter((v): v is number => v !== null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = max - min || 1;
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const step = (width - pad.left - pad.right) / Math.max(1, points.length - 1);
  const x = (i: number) => pad.left + i * step;
  const y = (v: number) =>
    pad.top + ((hi - v) * (height - pad.top - pad.bottom)) / (hi - lo);
  const line = (series: 0 | 1) => {
    let d = "";
    let pen = false;
    points.forEach((p, i) => {
      const v = pick(p)[series];
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const zero = points.findIndex((p) => p.offset === 0);
  return {
    width,
    height,
    band:
      zero >= 0
        ? {
            x: x(zero) - step / 2,
            y: pad.top,
            width: step,
            height: height - pad.top - pad.bottom,
          }
        : null,
    grid: [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15].map(
      (v) => ({
        y: y(v),
        x1: pad.left,
        x2: width - pad.right,
        label: one.format(v),
        labelX: pad.left - 6,
      }),
    ),
    ticks: points.map((p, i) => ({
      key: p.offset,
      x: x(i),
      y: height - 8,
      label: offsetLabel(p.offset),
    })),
    participants: line(0),
    comparison: line(1),
    dots: points.flatMap((p, i) => {
      const v = pick(p)[0];
      return v === null ? [] : [{ key: p.offset, x: x(i), y: y(v) }];
    }),
  };
}
