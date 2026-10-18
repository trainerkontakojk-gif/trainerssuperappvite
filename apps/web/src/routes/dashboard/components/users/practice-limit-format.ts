import {
  LIMITED_PRACTICE_ROLES,
  PRACTICE_MODULES,
  PRACTICE_MODULE_LABELS,
  formatPracticeLimit,
  formatWibDay,
  wibToday,
  type ManagedUser,
  type PracticeLimitsOverview,
  type PracticeModule,
} from "@trainers/types";

/** "31 Okt 2026" for a YYYY-MM-DD WIB date. */
export const formatLimitDay = formatWibDay;

/** How a role rule reads in a sentence: "3 per hari", "tidak bisa mulai". */
export function describeRule(limit: number | null): string {
  if (limit === 0) return "tidak bisa mulai";
  if (limit === null) return "tanpa batas";
  return `${limit} per hari`;
}

/** The approve dialogs' line: what limits the chosen role starts with. */
export function roleRuleLine(
  role: string,
  rules: PracticeLimitsOverview["rules"],
): string | null {
  if (!(LIMITED_PRACTICE_ROLES as readonly string[]).includes(role))
    return "Trainer dan admin tanpa batas latihan.";
  if (!rules.length) return null;
  return `Batas latihan mengikuti aturan ${role}: ${PRACTICE_MODULES.map(
    (module) =>
      `${PRACTICE_MODULE_LABELS[module]} ${describeRule(
        rules.find((rule) => rule.module === module && rule.role === role)
          ?.daily_limit ?? 0,
      )}`,
  ).join(", ")}.`;
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

export { wibToday };

export const COUNTED_ACTION: Record<PracticeModule, string> = {
  ketik: "Mulai simulasi",
  pdkt: "Buat email baru",
  telefun: "Mulai panggilan",
};
