import type {
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
