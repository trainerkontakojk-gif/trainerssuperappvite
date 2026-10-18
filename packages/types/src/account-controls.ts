import { z } from "zod";
import { ROLES } from "./access";
import type { LinkedPesertaSummary } from "./admin";
import { PRACTICE_MODULES, setPracticeOverrideSchema } from "./practice-quota";

/**
 * Masa aktif akun and bulk user actions (plans/markdown/kontrol-user-fase-5b.md).
 * Days are Asia/Jakarta dates written as YYYY-MM-DD.
 */

/** Most accounts one bulk action may change. */
export const BULK_USER_MAX = 100;

/** Today's Asia/Jakarta date as YYYY-MM-DD. */
export function wibToday(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}

/** "31 Des 2026" for a YYYY-MM-DD day. */
export function formatWibDay(day: string, withYear = true): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** True once the account's last day has passed (it works through that day). */
export function isAccountExpired(
  activeUntil: string | null | undefined,
  today = wibToday(),
): boolean {
  return Boolean(activeUntil) && activeUntil! < today;
}

/**
 * A dialog's masa aktif choice: null (no limit) or a day not yet past.
 * "" means a date was wanted but not picked.
 */
export function activeUntilValid(value: string | null): boolean {
  return value === null || (value !== "" && value >= wibToday());
}

export function accountExpiredMessage(activeUntil: string): string {
  return `Masa aktif akun Anda berakhir ${formatWibDay(activeUntil)}. Hubungi trainer Anda untuk memperpanjang.`;
}

/** Days from today to the last day: 0 on the last day itself. */
export function daysLeft(activeUntil: string, today = wibToday()): number {
  return Math.round(
    (Date.parse(`${activeUntil}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
}

export const wibDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const setActiveUntilSchema = z.object({
  active_until: wibDaySchema.nullable(),
});

const userIds = z
  .array(z.string().uuid())
  .min(1)
  .max(BULK_USER_MAX)
  .refine((ids) => new Set(ids).size === ids.length, "Akun tidak boleh dobel");

export const bulkUserIdsSchema = z.object({ user_ids: userIds });

export const bulkApproveSchema = z.object({
  user_ids: userIds,
  role: z.enum(ROLES),
  active_until: wibDaySchema.nullable(),
  /** Participants to link, chosen from the email suggestions. */
  links: z
    .array(
      z.object({ user_id: z.string().uuid(), peserta_id: z.string().uuid() }),
    )
    .max(BULK_USER_MAX),
});

export const bulkActiveUntilSchema = z.object({
  user_ids: userIds,
  active_until: wibDaySchema.nullable(),
});

export const bulkPracticeLimitSchema = z.object({
  user_ids: userIds,
  module: z.enum(PRACTICE_MODULES),
  /** null = follow the role rule again (removes the exception). */
  limit: setPracticeOverrideSchema.nullable(),
});

export interface BulkUserResult {
  user_id: string;
  name: string;
  ok: boolean;
  /** Why this person was not changed; null when ok. */
  error: string | null;
}

export interface BulkUserResponse {
  results: BulkUserResult[];
}

/** The participant whose Email OJK equals the account email, if any. */
export interface PesertaSuggestion {
  user_id: string;
  peserta: LinkedPesertaSummary | null;
}
