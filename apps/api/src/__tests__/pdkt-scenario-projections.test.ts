import { describe, expect, it } from "vitest";
import {
  toPdktSimulationConfig,
  toPdktSimulationScenario,
} from "../services/pdkt/scenario-projections";

describe("PDKT simulation data projections", () => {
  it("removes evaluation-only references from scenario and config views", () => {
    const reference = "Do not reveal this evaluation-only reference.";
    const scenario = {
      id: "scenario-1",
      title: "Refund",
      expectedAnswer: reference,
    };
    const config = {
      scenarios: [scenario],
      consumerType: { id: "ramah" },
    };

    expect(toPdktSimulationScenario(scenario)).toEqual({
      id: "scenario-1",
      title: "Refund",
    });
    expect(toPdktSimulationConfig(config)).toEqual({
      scenarios: [{ id: "scenario-1", title: "Refund" }],
      consumerType: { id: "ramah" },
    });
    expect(scenario.expectedAnswer).toBe(reference);
  });
});
