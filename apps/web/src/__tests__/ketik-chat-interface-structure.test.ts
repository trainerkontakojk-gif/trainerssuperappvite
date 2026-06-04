import { describe, expect, it } from "vitest";
import type { KetikScenario } from "@trainers/types";
import { getKetikScenarioImages } from "../routes/ketik/components/chat/ketikScenarioImages";

describe("KETIK chat structure helpers", () => {
  it("returns scenario images without requiring caller casts", () => {
    const scenario: KetikScenario = {
      id: "scenario-1",
      category: "Test",
      title: "Scenario",
      description: "Description",
      isActive: true,
      images: ["data:image/png;base64,one"],
    };

    expect(getKetikScenarioImages(scenario)).toEqual(["data:image/png;base64,one"]);
  });

  it("returns an empty image list when scenario images are absent", () => {
    const scenario: KetikScenario = {
      id: "scenario-2",
      category: "Test",
      title: "Scenario",
      description: "Description",
      isActive: true,
    };

    expect(getKetikScenarioImages(scenario)).toEqual([]);
  });
});
