/**
 * Kalimat "apa yang terjadi" untuk kartu Tren temuan QA di Beranda.
 *
 * Teksnya berasal dari `describeFindingsChange` di `@trainers/types`, fungsi
 * pure yang juga dipakai ringkasan dashboard SIDAK, sehingga Beranda dan SIDAK
 * selalu berkata sama untuk angka yang sama. Angka yang ditampilkan berasal
 * dari respons `/sidak/dashboard/trend` yang sama dengan grafiknya.
 */
import {
  describeFindingsChange,
  findingsPerAudited,
  formatInsightNumber,
  type FindingsChangeCopy,
  type FindingsPeriod,
} from "@trainers/types";

/** Satu periode pada grafik: temuan dan jumlah agen yang diaudit. */
export type TrendPeriod = FindingsPeriod;

/** Angka gaya Indonesia dengan maksimal satu desimal, mis. "1,1". */
export const formatTrendNumber = formatInsightNumber;

/** Temuan per agen diaudit; null bila tidak ada agen diaudit. */
export const perAudited = findingsPerAudited;

/**
 * `latest` = periode terakhir di grafik, `previous` = periode sebelumnya.
 * Null bila belum ada periode sama sekali (kartu sudah menampilkan keadaan
 * kosongnya sendiri).
 */
export function homeTrendSentence(
  latest: TrendPeriod | undefined,
  previous: TrendPeriod | undefined,
): FindingsChangeCopy | null {
  return latest ? describeFindingsChange(latest, previous) : null;
}
