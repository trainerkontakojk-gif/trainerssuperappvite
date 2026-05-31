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

export function indicatorToFormState(indicator: QARuleIndicator): IndicatorFormState {
  return {
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
    name: form.name,
    category: normalizeIndicatorCategory(form.category, scoringMode),
    bobot: parseFloat(form.bobot) / 100,
    has_na: form.has_na,
    threshold: form.threshold ? parseFloat(form.threshold) : undefined,
    sort_order: parseInt(form.sort_order) || 0,
  };
}
