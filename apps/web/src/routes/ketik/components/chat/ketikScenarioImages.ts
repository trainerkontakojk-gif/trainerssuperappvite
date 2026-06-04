import type { KetikScenario } from "@trainers/types";

export function getKetikScenarioImages(scenario: KetikScenario): string[] {
  return Array.isArray(scenario.images) ? scenario.images : [];
}
