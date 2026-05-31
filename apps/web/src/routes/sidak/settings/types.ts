import type { Category, ScoringMode } from "@trainers/types";

export type IndicatorCategory = Category;

export interface IndicatorFormState {
  name: string;
  category: IndicatorCategory;
  bobot: string;
  has_na: boolean;
  threshold: string;
  sort_order: string;
}

export interface IndicatorPayload {
  name: string;
  category: Category;
  bobot: number;
  has_na: boolean;
  threshold: number | undefined;
  sort_order: number;
}

export type RuleScoringMode = ScoringMode;
