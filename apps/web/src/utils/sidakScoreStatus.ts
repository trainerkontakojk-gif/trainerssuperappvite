/**
 * Status skor QA SIDAK untuk detail agent dan laporannya (HTML/PDF).
 *
 * Satu sumber ambang supaya halaman dan ekspor tidak berbeda. Ambang mengikuti
 * target QA 95%: skor di bawah target tidak boleh tampil "baik".
 */

export const SIDAK_QA_TARGET = 95;
const NEAR_TARGET = 85;

export type SidakScoreTone = "ok" | "warn" | "bad";

export function sidakScoreTone(score: number): SidakScoreTone {
  const safe = Number.isFinite(score) ? score : 0;
  if (safe >= SIDAK_QA_TARGET) return "ok";
  if (safe >= NEAR_TARGET) return "warn";
  return "bad";
}

const LABELS: Record<SidakScoreTone, string> = {
  ok: "Memenuhi target",
  warn: "Mendekati target",
  bad: "Perlu perhatian",
};

export function sidakScoreLabel(score: number): string {
  return LABELS[sidakScoreTone(score)];
}

/** Kelas warna teks per status, aman untuk mode terang dan gelap. */
export const SIDAK_SCORE_TEXT: Record<SidakScoreTone, string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-rose-700 dark:text-rose-400",
};

/** Kelas warna isian (batang grafik) per status. */
export const SIDAK_SCORE_FILL: Record<SidakScoreTone, string> = {
  ok: "bg-emerald-600 dark:bg-emerald-500",
  warn: "bg-amber-500 dark:bg-amber-400",
  bad: "bg-rose-600 dark:bg-rose-500",
};

/**
 * Kalimat perubahan skor antarbulan, mis. "Naik 4.3 poin dari Mei". Selisih
 * dua persentase dinyatakan dalam poin, bukan persen.
 */
export function describeScoreChange(
  delta: number,
  previousMonth: string,
): string {
  const amount = Math.abs(delta).toFixed(1);
  if (amount === "0.0") return `Sama dengan ${previousMonth}`;
  return `${delta > 0 ? "Naik" : "Turun"} ${amount} poin dari ${previousMonth}`;
}
