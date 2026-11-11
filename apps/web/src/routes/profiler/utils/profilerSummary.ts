import { labelJabatan, type ProfilerPeserta } from "@trainers/types";
import { getDaysUntilBirthday } from "./birthday";
import { hitungMasaDinas, hitungUsia } from "./profilerFormatters";

/** One-line role · team · tenure · age (· birthday soon) under a name. */
export function summaryLine(p: ProfilerPeserta) {
  const parts = [
    p.jabatan ? labelJabatan[p.jabatan] || p.jabatan : null,
    p.tim,
    p.bergabung_date ? `Masa dinas ${hitungMasaDinas(p.bergabung_date)}` : null,
    p.tgl_lahir ? `${hitungUsia(p.tgl_lahir)} tahun` : null,
  ];
  if (p.tgl_lahir) {
    const days = getDaysUntilBirthday(p.tgl_lahir);
    if (days === 0) parts.push("ulang tahun hari ini");
    else if (days <= 7) parts.push(`ulang tahun ${days} hari lagi`);
  }
  return parts.filter(Boolean).join(" · ");
}
