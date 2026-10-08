import type { QAIndicator } from "@trainers/types";

export const MONTHS = [
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
] as const;

export const SERVICE_TYPES: QAIndicator["service_type"][] = [
  "call",
  "chat",
  "email",
  "cso",
  "pencatatan",
  "bko",
  "slik",
];

export function periodLabel(period: { month: number; year: number }): string {
  return `${MONTHS[period.month - 1]} ${period.year}`;
}
