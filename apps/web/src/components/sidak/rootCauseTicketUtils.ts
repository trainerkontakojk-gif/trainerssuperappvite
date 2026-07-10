import type { RootCauseTicketReference } from "@trainers/types";

const MONTH_NAMES = [
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

const MONTH_ALIASES = new Map<string, string>([
  ["jan", "Januari"], ["januari", "Januari"], ["january", "Januari"],
  ["feb", "Februari"], ["februari", "Februari"], ["february", "Februari"],
  ["mar", "Maret"], ["maret", "Maret"], ["march", "Maret"],
  ["apr", "April"], ["april", "April"], ["mei", "Mei"], ["may", "Mei"],
  ["jun", "Juni"], ["juni", "Juni"], ["june", "Juni"],
  ["jul", "Juli"], ["juli", "Juli"], ["july", "Juli"],
  ["agu", "Agustus"], ["agt", "Agustus"], ["agustus", "Agustus"], ["aug", "Agustus"], ["august", "Agustus"],
  ["sep", "September"], ["sept", "September"], ["september", "September"],
  ["okt", "Oktober"], ["oct", "Oktober"], ["oktober", "Oktober"], ["october", "Oktober"],
  ["nov", "November"], ["november", "November"], ["des", "Desember"], ["dec", "Desember"], ["desember", "Desember"], ["december", "Desember"],
]);

export function formatTicketLabel(ref: RootCauseTicketReference): string {
  const numericMonth = ref.periodLabel.match(/^(\d{1,2})[/-]\d{4}$/);
  const isoMonth = ref.periodLabel.match(/^\d{4}-(\d{1,2})/);
  const monthIndex = numericMonth
    ? Number(numericMonth[1]) - 1
    : isoMonth
      ? Number(isoMonth[1]) - 1
      : -1;
  const firstWord = ref.periodLabel.trim().split(/\s+/)[0]?.toLowerCase();
  const month =
    MONTH_NAMES[monthIndex] ??
    (firstWord && MONTH_ALIASES.get(firstWord)) ??
    ref.periodLabel;
  return `${ref.no_tiket} (${month})`;
}
