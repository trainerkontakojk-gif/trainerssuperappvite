import { describe, expect, it } from "vitest";
import { buildSidakInputRuleModel } from "../routes/sidak/hooks/useSidakInputRuleModel";

describe("buildSidakInputRuleModel", () => {
  it("uses global indicators when no rule version indicators are loaded", () => {
    const globalIndicators = [
      { id: "i1", service_type: "call", name: "Salam", category: "none" as const, bobot: 1, has_na: false },
    ];

    const result = buildSidakInputRuleModel({
      ruleIndicatorsRaw: [],
      globalIndicators,
      selectedService: "call",
    });

    expect(result.activeIndicators).toEqual(globalIndicators);
    expect([...result.unlinkedIndicatorIds]).toEqual([]);
  });

  it("maps rule indicators and tracks unlinked ids exactly once", () => {
    const result = buildSidakInputRuleModel({
      selectedService: "email",
      globalIndicators: [],
      ruleIndicatorsRaw: [
        {
          ruleIndicatorId: "r1",
          legacyIndicatorId: "i1",
          name: "Parameter Linked",
          category: "critical" as const,
          bobot: 2,
          has_na: false,
        },
        {
          ruleIndicatorId: "r2",
          legacyIndicatorId: undefined,
          name: "Parameter Belum Link",
          category: "none" as const,
          bobot: 1,
          has_na: true,
        },
      ],
    });

    expect(result.activeIndicators.map((item) => item.id)).toEqual(["i1", "r2"]);
    expect(result.activeIndicators[0].service_type).toBe("email");
    expect([...result.unlinkedIndicatorIds]).toEqual(["r2"]);
  });
});
