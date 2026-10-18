import { z } from "zod";

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

/** Roles whose limits can be changed; trainer and admin are always unlimited. */
export const LIMITED_PRACTICE_ROLES = ["agent", "leader"] as const;
export type LimitedPracticeRole = (typeof LIMITED_PRACTICE_ROLES)[number];

/** Highest per-day limit the pages accept; more is "unlimited". */
export const PRACTICE_LIMIT_MAX = 50;

const dailyLimit = z
  .number()
  .int()
  .min(0)
  .max(PRACTICE_LIMIT_MAX)
  .nullable();

export interface PracticeLimitRule {
  module: PracticeModule;
  role: "admin" | "trainer" | LimitedPracticeRole;
  /** null = unlimited, 0 = cannot start. */
  daily_limit: number | null;
  updated_at: string;
  updated_by_name: string | null;
}

/** A per-user exception, as listed on the Batas latihan page. */
export interface PracticeLimitOverride {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  module: PracticeModule;
  daily_limit: number | null;
  /** Last WIB date it applies; null = until removed. */
  ends_on: string | null;
  note: string | null;
  updated_at: string;
  updated_by_name: string | null;
}

export interface PracticeLimitsOverview {
  rules: PracticeLimitRule[];
  /** Exceptions still in force today. */
  overrides: PracticeLimitOverride[];
  today: {
    started: Record<PracticeModule, number>;
    users_at_limit: number;
  };
}

/** One module on the user page: today's limit plus what it is made of. */
export interface UserPracticeLimit extends PracticeQuotaStatus {
  role_limit: number | null;
  note: string | null;
}

export const updatePracticeRulesSchema = z.object({
  rules: z
    .array(
      z.object({
        module: z.enum(PRACTICE_MODULES),
        role: z.enum(LIMITED_PRACTICE_ROLES),
        daily_limit: dailyLimit,
      }),
    )
    .min(1)
    .max(PRACTICE_MODULES.length * LIMITED_PRACTICE_ROLES.length),
});

export const setPracticeOverrideSchema = z.object({
  daily_limit: dailyLimit,
  ends_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  note: z.string().trim().max(200).nullable(),
});

export const practiceModuleParamSchema = z.object({
  id: z.string().uuid(),
  module: z.enum(PRACTICE_MODULES),
});

/** "3 per hari", "Tutup" (cannot start) or "Tanpa batas". */
export function formatPracticeLimit(limit: number | null): string {
  if (limit === null) return "Tanpa batas";
  if (limit === 0) return "Tutup";
  return `${limit} per hari`;
}
