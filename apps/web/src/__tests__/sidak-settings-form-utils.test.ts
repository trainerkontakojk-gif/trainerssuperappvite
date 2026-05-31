import { describe, expect, it } from "vitest";
import {
  createEmptyIndicatorForm,
  indicatorFormToPayload,
  indicatorToFormState,
  normalizeIndicatorCategory,
  parseIndicatorCategory,
} from "../routes/sidak/settings/utils";
import type { QARuleIndicator } from "@trainers/types";

describe("sidak settings form utils", () => {
  it("creates default add form values matching current UI defaults", () => {
    expect(createEmptyIndicatorForm()).toEqual({
      name: "",
      category: "non_critical",
      bobot: "10",
      has_na: false,
      threshold: "",
      sort_order: "0",
    });
  });

  it("forces category none for no_category scoring mode", () => {
    expect(normalizeIndicatorCategory("critical", "no_category")).toBe("none");
    expect(normalizeIndicatorCategory("non_critical", "weighted")).toBe("non_critical");
  });

  it("parses select values into typed indicator categories", () => {
    expect(parseIndicatorCategory("critical")).toBe("critical");
    expect(parseIndicatorCategory("non_critical")).toBe("non_critical");
    expect(parseIndicatorCategory("none")).toBe("none");
    expect(parseIndicatorCategory("unexpected")).toBe("non_critical");
  });

  it("maps add form state to the existing API payload shape", () => {
    expect(
      indicatorFormToPayload(
        {
          name: "Greeting sesuai skrip",
          category: "critical",
          bobot: "25",
          has_na: true,
          threshold: "2",
          sort_order: "7",
        },
        "weighted",
      ),
    ).toEqual({
      name: "Greeting sesuai skrip",
      category: "critical",
      bobot: 0.25,
      has_na: true,
      threshold: 2,
      sort_order: 7,
    });
  });

  it("converts blank numeric fields the same way current settings page does", () => {
    expect(
      indicatorFormToPayload(
        {
          name: "Blank threshold",
          category: "non_critical",
          bobot: "10",
          has_na: false,
          threshold: "",
          sort_order: "",
        },
        "weighted",
      ),
    ).toEqual({
      name: "Blank threshold",
      category: "non_critical",
      bobot: 0.1,
      has_na: false,
      threshold: undefined,
      sort_order: 0,
    });
  });

  it("maps an existing indicator into edit form state without casts", () => {
    const indicator: QARuleIndicator = {
      id: "11111111-1111-4111-8111-111111111111",
      rule_version_id: "22222222-2222-4222-8222-222222222222",
      service_type: "call",
      name: "Product knowledge",
      category: "non_critical",
      bobot: 0.35,
      has_na: true,
      threshold: null,
      sort_order: 3,
    };

    expect(indicatorToFormState(indicator)).toEqual({
      name: "Product knowledge",
      category: "non_critical",
      bobot: "35",
      has_na: true,
      threshold: "",
      sort_order: "3",
    });
  });
});
