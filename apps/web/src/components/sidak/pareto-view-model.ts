import type { ParetoData } from "@trainers/types";

export interface ParetoChartItem {
  name: string;
  fullName: string;
  count: number;
  cumulative: number;
  category: string;
}

export interface ParetoFocusItem {
  name: string;
  count: number;
  share: number;
}

export interface ParetoImprovementInsightModel {
  primary: ParetoFocusItem;
  focusItems: ParetoFocusItem[];
  focusCount: number;
  focusShare: number;
  totalCount: number;
  threshold: number;
}

export interface ParetoViewModel {
  chartData: ParetoChartItem[];
  insight: ParetoImprovementInsightModel | null;
}

const DEFAULT_DISPLAY_LIMIT = 12;
const DEFAULT_THRESHOLD = 80;

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_THRESHOLD;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function resolveName(item: ParetoData): string {
  const trimmed = item.name?.trim();
  if (trimmed) return trimmed;
  const fullTrimmed = item.fullName?.trim();
  if (fullTrimmed) return fullTrimmed;
  return "Parameter tanpa nama";
}

export function buildParetoViewModel(
  source: ParetoData[] | null | undefined,
  options?: { displayLimit?: number; threshold?: number },
): ParetoViewModel {
  const displayLimit = options?.displayLimit ?? DEFAULT_DISPLAY_LIMIT;
  const threshold = clampThreshold(options?.threshold ?? DEFAULT_THRESHOLD);

  const normalized = (source ?? [])
    .filter((item) => Number.isFinite(item.count) && item.count > 0)
    .map((item) => ({
      ...item,
      name: resolveName(item),
      fullName: item.fullName?.trim() || item.name?.trim() || "Parameter tanpa nama",
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  if (normalized.length === 0) {
    return { chartData: [], insight: null };
  }

  const totalCount = normalized.reduce((sum, item) => sum + item.count, 0);

  if (totalCount <= 0) {
    return { chartData: [], insight: null };
  }

  const focusItems: ParetoFocusItem[] = [];
  const chartData: ParetoChartItem[] = [];
  let runningTotal = 0;
  let crossedThreshold = false;

  for (const item of normalized) {
    runningTotal += item.count;
    const cumulative = Math.max(0, Math.min(100, Math.round((runningTotal / totalCount) * 100)));

    chartData.push({
      name: item.name,
      fullName: item.fullName,
      count: item.count,
      cumulative,
      category: item.category,
    });

    if (!crossedThreshold) {
      const share = Math.max(0, Math.min(100, Math.round((item.count / totalCount) * 100)));
      focusItems.push({ name: item.name, count: item.count, share });

      if (cumulative >= threshold) {
        crossedThreshold = true;
      }
    }
  }

  const focusCount = focusItems.reduce((sum, item) => sum + item.count, 0);
  const focusShare = Math.max(0, Math.min(100, Math.round((focusCount / totalCount) * 100)));

  const insight: ParetoImprovementInsightModel = {
    primary: focusItems[0],
    focusItems,
    focusCount,
    focusShare,
    totalCount,
    threshold,
  };

  return {
    chartData: chartData.slice(0, displayLimit),
    insight,
  };
}
