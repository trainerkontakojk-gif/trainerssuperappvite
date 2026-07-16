import type { Category, QARuleIndicator, ScoringMode } from "@trainers/types";
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
