import { describe, expect, it } from "vitest";
import { buildParetoViewModel } from "../components/sidak/pareto-view-model";

describe("buildParetoViewModel", () => {
  it("selects focus parameters through the item that crosses 80 percent", () => {
    const result = buildParetoViewModel([
      { name: "B", fullName: "B", count: 30, cumulative: 70, category: "non_critical" },
      { name: "A", fullName: "A", count: 40, cumulative: 40, category: "critical" },
      { name: "C", fullName: "C", count: 15, cumulative: 85, category: "critical" },
      { name: "D", fullName: "D", count: 15, cumulative: 100, category: "non_critical" },
    ]);

    expect(result.insight?.primary).toMatchObject({ name: "A", count: 40, share: 40 });
    expect(result.insight?.focusItems.map((item) => item.name)).toEqual(["A", "B", "C"]);
    expect(result.insight?.focusShare).toBe(85);
    expect(result.chartData.map((item) => item.cumulative)).toEqual([40, 70, 85, 100]);
  });

  it("uses all parameters as denominator before limiting chart bars", () => {
    const source = Array.from({ length: 13 }, (_, index) => ({
      name: `P${index + 1}`,
      fullName: `Parameter ${index + 1}`,
      count: 1,
      cumulative: index + 1,
      category: "non_critical" as const,
    }));

    const result = buildParetoViewModel(source, { displayLimit: 12 });

    expect(result.chartData).toHaveLength(12);
    expect(result.chartData.at(-1)?.cumulative).toBe(92);
    expect(result.insight?.totalCount).toBe(13);
  });

  it("returns empty chartData and null insight for undefined source", () => {
    const result = buildParetoViewModel(undefined);
    expect(result.chartData).toEqual([]);
    expect(result.insight).toBeNull();
  });

  it("returns empty chartData and null insight for empty array", () => {
    const result = buildParetoViewModel([]);
    expect(result.chartData).toEqual([]);
    expect(result.insight).toBeNull();
  });

  it("returns empty chartData and null insight for null source", () => {
    const result = buildParetoViewModel(null);
    expect(result.chartData).toEqual([]);
    expect(result.insight).toBeNull();
  });

  it("ignores items with count <= 0", () => {
    const result = buildParetoViewModel([
      { name: "A", fullName: "A", count: 0, cumulative: 0, category: "critical" },
      { name: "B", fullName: "B", count: -5, cumulative: 0, category: "critical" },
      { name: "C", fullName: "C", count: 10, cumulative: 10, category: "non_critical" },
    ]);

    expect(result.chartData).toHaveLength(1);
    expect(result.chartData[0].name).toBe("C");
    expect(result.insight?.primary.name).toBe("C");
    expect(result.insight?.totalCount).toBe(10);
  });

  it("produces single focus item when first parameter already >= 80%", () => {
    const result = buildParetoViewModel([
      { name: "Dominant", fullName: "Dominant", count: 85, cumulative: 85, category: "critical" },
      { name: "Minor", fullName: "Minor", count: 15, cumulative: 100, category: "non_critical" },
    ]);

    expect(result.insight?.focusItems).toHaveLength(1);
    expect(result.insight?.focusItems[0].name).toBe("Dominant");
    expect(result.insight?.focusShare).toBe(85);
  });

  it("does not mutate the input array", () => {
    const input = [
      { name: "B", fullName: "B", count: 30, cumulative: 60, category: "non_critical" as const },
      { name: "A", fullName: "A", count: 20, cumulative: 100, category: "critical" as const },
    ];
    const copy = input.map((item) => ({ ...item }));

    buildParetoViewModel(input);

    expect(input).toEqual(copy);
  });

  it("uses fallback name when name and fullName are blank", () => {
    const result = buildParetoViewModel([
      { name: "  ", fullName: "", count: 5, cumulative: 5, category: "critical" },
      { name: "B", fullName: "B Full", count: 3, cumulative: 8, category: "non_critical" },
    ]);

    expect(result.chartData[0].name).toBe("Parameter tanpa nama");
    expect(result.insight?.primary.name).toBe("Parameter tanpa nama");
  });

  it("clamps threshold to 1..100 range", () => {
    const source = [
      { name: "A", fullName: "A", count: 50, cumulative: 50, category: "critical" as const },
      { name: "B", fullName: "B", count: 50, cumulative: 100, category: "non_critical" as const },
    ];

    const resultLow = buildParetoViewModel(source, { threshold: -10 });
    expect(resultLow.insight?.threshold).toBe(1);

    const resultHigh = buildParetoViewModel(source, { threshold: 200 });
    expect(resultHigh.insight?.threshold).toBe(100);
  });

  it("sorts by count descending with alphabetical tiebreaker", () => {
    const result = buildParetoViewModel([
      { name: "C", fullName: "C", count: 10, cumulative: 30, category: "non_critical" },
      { name: "A", fullName: "A", count: 10, cumulative: 10, category: "critical" },
      { name: "B", fullName: "B", count: 10, cumulative: 20, category: "critical" },
    ]);

    expect(result.chartData.map((item) => item.name)).toEqual(["A", "B", "C"]);
  });

  it("clamps cumulative percentage to 0..100", () => {
    const result = buildParetoViewModel([
      { name: "A", fullName: "A", count: 100, cumulative: 100, category: "critical" },
    ]);

    expect(result.chartData[0].cumulative).toBe(100);
    expect(result.insight?.focusShare).toBeLessThanOrEqual(100);
  });

  it("includes the crossing item that pushes cumulative past threshold", () => {
    const result = buildParetoViewModel([
      { name: "A", fullName: "A", count: 45, cumulative: 45, category: "critical" },
      { name: "B", fullName: "B", count: 35, cumulative: 80, category: "critical" },
      { name: "C", fullName: "C", count: 20, cumulative: 100, category: "non_critical" },
    ]);

    expect(result.insight?.focusItems.map((item) => item.name)).toEqual(["A", "B"]);
    expect(result.insight?.focusShare).toBe(80);
  });

  it("computes share as percentage of total, not sliced total", () => {
    const source = Array.from({ length: 15 }, (_, i) => ({
      name: `P${String(i + 1).padStart(2, "0")}`,
      fullName: `Parameter ${i + 1}`,
      count: 10 - Math.min(i, 8),
      cumulative: 0,
      category: "non_critical" as const,
    }));

    const result = buildParetoViewModel(source, { displayLimit: 12 });

    const totalCount = source.reduce((s, x) => s + x.count, 0);
    expect(result.insight?.totalCount).toBe(totalCount);
    expect(result.chartData).toHaveLength(12);

    const firstItemTotal = source.reduce((s, x) => s + x.count, 0);
    const firstCount = result.chartData[0].count;
    expect(result.chartData[0].cumulative).toBe(
      Math.round((firstCount / firstItemTotal) * 100),
    );
  });
});
