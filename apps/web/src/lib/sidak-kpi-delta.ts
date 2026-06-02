export type KpiDeltaUnit = "relative-percent" | "percentage-point";
export type KpiDirection = "up" | "down" | "flat";
export type KpiDeltaTone = "good" | "bad" | "neutral";

export interface KpiDeltaInput {
  current: number;
  previous: number;
  previousLabel: string;
  unit: KpiDeltaUnit;
  lowerIsBetter: boolean;
}

export interface KpiDeltaViewModel {
  direction: KpiDirection;
  magnitude: number;
  unitLabel: "%" | "poin";
  tone: KpiDeltaTone;
  text: string;
  comparisonLabel: string;
  current: number;
  previous: number;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

export function buildKpiDelta(input: KpiDeltaInput): KpiDeltaViewModel | null {
  const diff = input.current - input.previous;
  const direction: KpiDirection = diff > 0 ? "up" : diff < 0 ? "down" : "flat";

  if (input.unit === "relative-percent" && input.previous === 0) {
    return null;
  }

  const magnitude = roundOne(
    input.unit === "relative-percent" ? Math.abs((diff / input.previous) * 100) : Math.abs(diff),
  );
  const unitLabel = input.unit === "relative-percent" ? "%" : "poin";
  const verb = direction === "up" ? "Naik" : direction === "down" ? "Turun" : "Tetap";
  const good =
    direction === "flat" ? null : input.lowerIsBetter ? direction === "down" : direction === "up";

  return {
    direction,
    magnitude,
    unitLabel,
    tone: good === null ? "neutral" : good ? "good" : "bad",
    text: `${verb} ${magnitude.toFixed(1)}${unitLabel === "%" ? "%" : " poin"}`,
    comparisonLabel: `vs ${input.previousLabel}`,
    current: input.current,
    previous: input.previous,
  };
}
