import { describe, expect, it } from "vitest";
import { buildKpiDelta } from "../lib/sidak-kpi-delta";

describe("buildKpiDelta", () => {
  it("formats lower-is-better count metrics as relative percent", () => {
    expect(
      buildKpiDelta({
        current: 80,
        previous: 100,
        previousLabel: "Apr 26",
        unit: "relative-percent",
        lowerIsBetter: true,
      }),
    ).toMatchObject({
      direction: "down",
      magnitude: 20,
      unitLabel: "%",
      tone: "good",
      text: "Turun 20.0%",
      comparisonLabel: "vs Apr 26",
    });
  });

  it("formats percentage metrics as point changes instead of relative percent", () => {
    expect(
      buildKpiDelta({
        current: 97.6,
        previous: 96.9,
        previousLabel: "Apr 26",
        unit: "percentage-point",
        lowerIsBetter: false,
      }),
    ).toMatchObject({
      direction: "up",
      magnitude: 0.7,
      unitLabel: "poin",
      tone: "good",
      text: "Naik 0.7 poin",
      comparisonLabel: "vs Apr 26",
    });
  });

  it("returns null for relative percent when previous is zero", () => {
    expect(
      buildKpiDelta({
        current: 10,
        previous: 0,
        previousLabel: "Apr 26",
        unit: "relative-percent",
        lowerIsBetter: true,
      }),
    ).toBeNull();
  });
});
