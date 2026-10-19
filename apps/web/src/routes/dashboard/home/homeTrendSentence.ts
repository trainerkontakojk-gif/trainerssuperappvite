/**
 * Kalimat "apa yang terjadi" untuk kartu Tren temuan QA di Beranda.
 *
 * Aturannya sama dengan ringkasan dashboard SIDAK
 * (`apps/api/src/services/sidak/dashboard-insights.ts`): persentase hanya
 * dihitung bila periode pembanding punya temuan, dan temuan **per agen
 * diaudit** yang membedakan kenaikan nyata dari kenaikan yang ikut jumlah
 * audit. Fungsi ini sengaja pure dan disalin ke web (bukan diimpor dari
 * `apps/api`) supaya bundle web tidak menarik kode server; angka yang
 * ditampilkan berasal dari respons `/sidak/dashboard/trend` yang sama dengan
 * grafiknya.
 */

export type TrendTone = "good" | "bad" | "neutral";

/** Satu periode pada grafik: temuan dan jumlah agen yang diaudit. */
export interface TrendPeriod {
  label: string;
  total: number;
  /** Agen diaudit pada periode itu (bukan agen aktif). */
  audited: number;
}

export interface TrendSentence {
  text: string;
  tone: TrendTone;
}

const NUMBER = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** Angka gaya Indonesia dengan maksimal satu desimal, mis. "1,1". */
export function formatTrendNumber(value: number): string {
  return NUMBER.format(value);
}

const signed = (value: number) =>
  `${value < 0 ? "−" : "+"}${NUMBER.format(Math.abs(value))}`;

/** Temuan per agen diaudit; null bila tidak ada agen diaudit. */
export function perAudited(period: TrendPeriod): number | null {
  return period.audited > 0 ? period.total / period.audited : null;
}

/**
 * `latest` = periode terakhir di grafik, `previous` = periode sebelumnya.
 * Null bila belum ada periode sama sekali (kartu sudah menampilkan keadaan
 * kosongnya sendiri).
 */
export function homeTrendSentence(
  latest: TrendPeriod | undefined,
  previous: TrendPeriod | undefined,
): TrendSentence | null {
  if (!latest) return null;
  if (!previous)
    return {
      text: "Belum ada periode pembanding untuk filter ini.",
      tone: "neutral",
    };

  if (previous.total === 0)
    return {
      text: `${NUMBER.format(latest.total)} temuan di ${latest.label}; ${previous.label} tanpa temuan, jadi persentase tidak dihitung.`,
      tone: "neutral",
    };

  const changePct = ((latest.total - previous.total) / previous.total) * 100;
  if (Math.abs(changePct) < 5)
    return {
      text: `Temuan ${latest.label} relatif tetap (${signed(changePct)}%) dibanding ${previous.label}.`,
      tone: "neutral",
    };

  const up = changePct > 0;
  const direction = up ? "naik" : "turun";
  const prefix = `Temuan ${latest.label} ${direction} ${NUMBER.format(Math.abs(changePct))}%`;
  const now = perAudited(latest);
  const before = perAudited(previous);

  if (now === null || before === null)
    return {
      text: `${prefix}, tetapi jumlah agen diaudit belum tersedia untuk membandingkan laju temuan.`,
      tone: "neutral",
    };

  if (up ? now > before : now < before)
    return {
      text: `${prefix} dan temuan per agen diaudit juga ${direction} (${NUMBER.format(before)} → ${NUMBER.format(now)}).${up ? " Kenaikan ini nyata." : ""}`,
      tone: up ? "bad" : "good",
    };

  return {
    text: `${prefix}, tetapi temuan per agen diaudit tidak ${direction} (${NUMBER.format(before)} → ${NUMBER.format(now)}). ${up ? "Kenaikan ikut jumlah audit, belum tentu memburuk." : "Penurunan ikut jumlah audit."}`,
    tone: "neutral",
  };
}
