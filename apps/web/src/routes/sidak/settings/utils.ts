import type {
  Category,
  QARuleIndicator,
  RuleVersion,
  ScoringMode,
} from "@trainers/types";
import type { IndicatorFormState, IndicatorPayload } from "./types";

export function parseIndicatorCategory(value: string): Category {
  if (value === "critical" || value === "non_critical" || value === "none") {
    return value;
  }
  return "non_critical";
}

export function createEmptyIndicatorForm(): IndicatorFormState {
  return {
    parameter_group: "",
    name: "",
    category: "non_critical",
    bobot: "10",
    has_na: false,
    threshold: "",
    sort_order: "0",
  };
}

export function normalizeIndicatorCategory(
  category: Category,
  scoringMode: ScoringMode,
): Category {
  return scoringMode === "no_category" ? "none" : category;
}

export function indicatorToFormState(
  indicator: QARuleIndicator,
): IndicatorFormState {
  return {
    parameter_group: indicator.parameter_group ?? "",
    name: indicator.name,
    category: indicator.category,
    bobot: String(Math.round(indicator.bobot * 100)),
    has_na: indicator.has_na,
    threshold: indicator.threshold != null ? String(indicator.threshold) : "",
    sort_order: String(indicator.sort_order ?? 0),
  };
}

export function indicatorFormToPayload(
  form: IndicatorFormState,
  scoringMode: ScoringMode,
): IndicatorPayload {
  return {
    parameter_group: form.parameter_group.trim() || null,
    name: form.name,
    category: normalizeIndicatorCategory(form.category, scoringMode),
    bobot: parseFloat(form.bobot) / 100,
    has_na: form.has_na,
    threshold: form.threshold ? parseFloat(form.threshold) : undefined,
    sort_order: parseInt(form.sort_order) || 0,
  };
}

export function getIndicatorCategoryTotals(
  indicators: Pick<QARuleIndicator, "category" | "bobot">[],
): { critical: number; nonCritical: number } {
  return indicators.reduce(
    (totals, indicator) => {
      if (indicator.category === "critical") {
        totals.critical += indicator.bobot;
      } else if (indicator.category === "non_critical") {
        totals.nonCritical += indicator.bobot;
      }
      return totals;
    },
    { critical: 0, nonCritical: 0 },
  );
}

export function hasValidWeightedCategoryTotals(
  indicators: Pick<QARuleIndicator, "category" | "bobot">[],
): boolean {
  const totals = getIndicatorCategoryTotals(indicators);
  return (
    Math.abs(totals.critical - 1) < 0.001 &&
    Math.abs(totals.nonCritical - 1) < 0.001
  );
}

/** Satu parameter di dalam diff publish. */
export interface RuleIndicatorChange {
  before: QARuleIndicator;
  after: QARuleIndicator;
  /** Nama field yang berubah, dalam urutan tampil. */
  fields: Array<"name" | "bobot" | "category" | "has_na" | "threshold">;
}

export interface RuleCategoryWeights {
  nonCritical: number;
  critical: number;
}

export interface RuleVersionDiff {
  added: QARuleIndicator[];
  removed: QARuleIndicator[];
  changed: RuleIndicatorChange[];
  /** `null` bila bobot kategori sama. Nilai dalam persen bulat. */
  categoryWeights: { before: RuleCategoryWeights; after: RuleCategoryWeights } | null;
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

function toPercent(weight: number): number {
  return Math.round(weight * 100);
}

/**
 * Bandingkan versi published yang berlaku (`published`) dengan draft.
 * Pencocokan per `legacy_indicator_id` bila kedua sisi memilikinya, lalu per
 * nama ternormalisasi untuk sisa yang belum cocok. Fungsi murni.
 */
export function diffRuleVersions(
  published: {
    indicators: QARuleIndicator[];
    nonCriticalWeight: number;
    criticalWeight: number;
  },
  draft: {
    indicators: QARuleIndicator[];
    nonCriticalWeight: number;
    criticalWeight: number;
  },
): RuleVersionDiff {
  const remaining = [...published.indicators];
  const take = (predicate: (item: QARuleIndicator) => boolean) => {
    const index = remaining.findIndex(predicate);
    return index === -1 ? null : remaining.splice(index, 1)[0];
  };

  const added: QARuleIndicator[] = [];
  const changed: RuleIndicatorChange[] = [];
  const unmatched: QARuleIndicator[] = [];

  // Putaran 1: legacy_indicator_id yang sama.
  const matches = new Map<QARuleIndicator, QARuleIndicator>();
  for (const item of draft.indicators) {
    const legacy = item.legacy_indicator_id;
    const match = legacy
      ? take((candidate) => candidate.legacy_indicator_id === legacy)
      : null;
    if (match) matches.set(item, match);
    else unmatched.push(item);
  }
  // Putaran 2: nama ternormalisasi untuk sisa.
  for (const item of unmatched) {
    const name = normalizeName(item.name);
    const match = take((candidate) => normalizeName(candidate.name) === name);
    if (match) matches.set(item, match);
    else added.push(item);
  }

  for (const item of draft.indicators) {
    const before = matches.get(item);
    if (!before) continue;
    const fields: RuleIndicatorChange["fields"] = [];
    if (before.name.trim() !== item.name.trim()) fields.push("name");
    if (toPercent(before.bobot) !== toPercent(item.bobot)) fields.push("bobot");
    if (before.category !== item.category) fields.push("category");
    if (before.has_na !== item.has_na) fields.push("has_na");
    if ((before.threshold ?? null) !== (item.threshold ?? null))
      fields.push("threshold");
    if (fields.length > 0) changed.push({ before, after: item, fields });
  }

  const before = {
    nonCritical: toPercent(published.nonCriticalWeight),
    critical: toPercent(published.criticalWeight),
  };
  const after = {
    nonCritical: toPercent(draft.nonCriticalWeight),
    critical: toPercent(draft.criticalWeight),
  };
  const sameWeights =
    before.nonCritical === after.nonCritical && before.critical === after.critical;

  return {
    added,
    removed: remaining,
    changed,
    categoryWeights: sameWeights ? null : { before, after },
  };
}

/**
 * Versi `published` yang menjadi pembanding diff publish: yang periode
 * efektifnya terbaru tetapi tidak setelah periode target; bila semuanya setelah
 * target, ambil yang paling awal. `null` bila belum ada versi published.
 */
export function findEffectiveBaseline(
  versions: RuleVersion[],
  periods: Array<{ id: string; month: number; year: number }>,
  targetPeriodId: string,
): RuleVersion | null {
  const order = (periodId: string) => {
    const period = periods.find((item) => item.id === periodId);
    return period ? period.year * 12 + period.month : Number.NEGATIVE_INFINITY;
  };
  const published = versions
    .filter((version) => version.status === "published")
    .sort(
      (a, b) =>
        order(b.effective_period_id) - order(a.effective_period_id) ||
        b.version_number - a.version_number,
    );
  if (published.length === 0) return null;
  const target = order(targetPeriodId);
  return (
    published.find((version) => order(version.effective_period_id) <= target) ??
    published[published.length - 1]
  );
}

/** Pilihan awal: draft, lalu published, lalu nomor versi tertinggi. */
export function pickDefaultVersion(versions: RuleVersion[]): RuleVersion | null {
  if (versions.length === 0) return null;
  return (
    versions.find((version) => version.status === "draft") ??
    versions.find((version) => version.status === "published") ??
    [...versions].sort((a, b) => b.version_number - a.version_number)[0]
  );
}
