/** Practice modules whose starts are limited per day (Asia/Jakarta date). */
export const PRACTICE_MODULES = ["ketik", "pdkt", "telefun"] as const;
export type PracticeModule = (typeof PRACTICE_MODULES)[number];

export const PRACTICE_MODULE_LABELS: Record<PracticeModule, string> = {
  ketik: "KETIK",
  pdkt: "PDKT",
  telefun: "Telefun",
};

/** Error codes the API returns when a start is refused by the daily limit. */
export type PracticeQuotaErrorCode =
  | "PRACTICE_LIMIT_REACHED"
  | "PRACTICE_NOT_ALLOWED";
