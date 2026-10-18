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

/** Today's limit for one module, as GET /me/practice-quota returns it. */
export interface PracticeQuotaStatus {
  module: PracticeModule;
  /** null = unlimited, 0 = cannot start. */
  limit: number | null;
  used: number;
  /** "override" when a per-user exception is in force. */
  source: "role" | "override";
  ends_on: string | null;
  /** Next 00.00 WIB. */
  resets_at: string;
}
