/**
 * Kalimat "apa yang terjadi" untuk temuan QA, dipakai bersama oleh ringkasan
 * dashboard SIDAK (`apps/api/src/services/sidak/dashboard-insights.ts`) dan
 * kartu tren Beranda (`apps/web/src/routes/dashboard/home/homeTrendSentence.ts`)
 * supaya kedua layar selalu berkata sama untuk angka yang sama.
 *
 * Pure dan deterministik: persentase hanya dihitung bila periode pembanding
 * punya temuan, dan rata-rata temuan **per agen diaudit** membedakan perubahan
 * kualitas dari perubahan yang hanya ikut volume audit.
 */

export type InsightTone = "good" | "bad" | "neutral";

/** Satu periode: temuan dan jumlah agen yang diaudit (bukan agen aktif). */
export interface FindingsPeriod {
  label: string;
  total: number;
  audited: number;
}

export interface FindingsChangeCopy {
  headline: string;
  text: string;
  tone: InsightTone;
}

/** |perubahan| di bawah ambang ini dibaca "stabil". */
export const FINDINGS_STABLE_THRESHOLD_PCT = 5;

const NUMBER = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** Angka gaya Indonesia dengan maksimal satu desimal, mis. "1,1". */
export const formatInsightNumber = (value: number): string =>
  NUMBER.format(value);

/** Tanda eksplisit dengan minus tipografis, mis. "+6" atau "−3". */
export const formatSignedInsightNumber = (value: number): string =>
  `${value < 0 ? "−" : "+"}${NUMBER.format(Math.abs(value))}`;

/** Temuan per agen diaudit; null bila tidak ada agen diaudit. */
export function findingsPerAudited(period: FindingsPeriod): number | null {
  return period.audited > 0 ? period.total / period.audited : null;
}

export function describeFindingsChange(
  latest: FindingsPeriod,
  previous: FindingsPeriod | undefined,
): FindingsChangeCopy {
  if (!previous)
    return {
      headline: "Belum ada pembanding",
      text: "Pilih rentang minimal dua bulan untuk melihat perubahan temuan.",
      tone: "neutral",
    };
  if (previous.total === 0)
    return {
      headline: `${NUMBER.format(latest.total)} temuan di ${latest.label}`,
      text: `${previous.label} tanpa temuan, jadi persentase perubahan tidak dihitung.`,
      tone: "neutral",
    };

  const changePct = ((latest.total - previous.total) / previous.total) * 100;
  if (Math.abs(changePct) < FINDINGS_STABLE_THRESHOLD_PCT)
    return {
      headline: `Temuan stabil (${formatSignedInsightNumber(changePct)}%)`,
      text: `Jumlah temuan ${latest.label} hampir sama dengan ${previous.label}.`,
      tone: "neutral",
    };

  const up = changePct > 0;
  const direction = up ? "naik" : "turun";
  const headline = `Temuan ${direction} ${NUMBER.format(Math.abs(changePct))}% dari ${previous.label}`;
  const now = findingsPerAudited(latest);
  const before = findingsPerAudited(previous);
  if (now === null || before === null)
    return {
      headline,
      text: "Jumlah agen diaudit belum tersedia, jadi belum bisa dipastikan apakah perubahan ini hanya ikut volume audit.",
      tone: "neutral",
    };

  const rates = `(${NUMBER.format(before)} → ${NUMBER.format(now)})`;
  if (up ? now > before : now < before)
    return {
      headline,
      text: `Rata-rata temuan per agen diaudit juga ${direction} ${rates}, jadi kualitas ${up ? "memang menurun" : "membaik"}.`,
      tone: up ? "bad" : "good",
    };
  // Total dan rasio berlawanan arah ⇒ jumlah agen diaudit yang berubah.
  return {
    headline,
    text: up
      ? `Rata-rata temuan per agen diaudit tidak naik ${rates}. Kenaikan ini karena lebih banyak agen diaudit, belum tentu kualitas menurun.`
      : `Rata-rata temuan per agen diaudit tidak turun ${rates}. Penurunan ini karena lebih sedikit agen diaudit, belum tentu kualitas membaik.`,
    tone: "neutral",
  };
}
