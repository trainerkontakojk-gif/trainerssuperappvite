import {
  PRACTICE_MODULE_LABELS,
  formatPracticeLimit,
  type ManagedUser,
  type PracticeModule,
} from "@trainers/types";

/** "31 Okt 2026" for a YYYY-MM-DD WIB date. */
export function formatLimitDay(day: string, withYear = true): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** How a role rule reads in a sentence: "3 per hari", "tidak bisa mulai". */
export function describeRule(limit: number | null): string {
  if (limit === 0) return "tidak bisa mulai";
  if (limit === null) return "tanpa batas";
  return `${limit} per hari`;
}

/** Users list column: "Telefun 2 per hari s.d. 31 Okt", or the default. */
export function describeUserLimits(user: ManagedUser): string | null {
  const overrides = user.practice_overrides ?? [];
  if (!overrides.length) return null;
  return overrides
    .map(
      (entry) =>
        `${PRACTICE_MODULE_LABELS[entry.module]} ${formatPracticeLimit(entry.daily_limit).toLowerCase()}${entry.ends_on ? ` s.d. ${formatLimitDay(entry.ends_on, false)}` : ""}`,
    )
    .join(", ");
}

/** Today's Asia/Jakarta date as YYYY-MM-DD, for date inputs. */
export function wibToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

export const COUNTED_ACTION: Record<PracticeModule, string> = {
  ketik: "Mulai simulasi",
  pdkt: "Buat email baru",
  telefun: "Mulai panggilan",
};
