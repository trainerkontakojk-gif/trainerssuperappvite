/**
 * humanize.ts — port mini dari perilaku Humanizer (humanizr/humanizer, .NET)
 * Dipakai untuk menyajikan teks yang lebih manusiawi di UI SIDAK.
 *
 * Prinsip Humanizer yang diport:
 *  - Titleize: mengubah "some_title"/"SOME TITLE" → "Some Title"
 *  - Humanize enum/label: kode status (atRisk/compliant) → frasa Indonesia natural
 */

/** Title-case satu kata: huruf pertama kapital, sisanya lowercase. */
function titleizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Titleize ala Humanizer: setiap kata jadi Title Case.
 * "ADHITYA WISNUWADHANA" → "Adhitya Wisnuwadhana"
 * "TIM CALL" → "Tim Call"
 */
export function titleize(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => titleizeWord(word))
    .join(" ");
}

export type RiskStatusKey = "atRisk" | "compliant" | "none";

/** Humanize status risiko agent → frasa Indonesia. */
export function humanizeRiskStatus(key: RiskStatusKey): string {
  switch (key) {
    case "atRisk":
      return "Perlu Perhatian";
    case "compliant":
      return "Sesuai";
    case "none":
      return "Belum Diaudit";
  }
}

/** Humanize kode trend → label Indonesia. */
export function humanizeTrend(
  trend: "up" | "down" | "same" | "none",
): string {
  switch (trend) {
    case "up":
      return "Naik";
    case "down":
      return "Turun";
    case "same":
      return "Stabil";
    case "none":
      return "Belum Ada Tren";
  }
}
