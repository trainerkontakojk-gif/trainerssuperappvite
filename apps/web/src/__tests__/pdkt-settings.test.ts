import { describe, it, expect } from "vitest";
import {
  coercePdktModelId,
  resolveConsumerNameMentionPattern,
  generatePdktSessionConfig,
  type PdktAppSettings,
} from "../routes/pdkt/pdktSettings";
import type {
  PdktScenario,
  PdktConsumerType,
  PdktIdentity,
} from "@trainers/types";

describe("PDKT Settings Helpers", () => {
  const mockScenario: PdktScenario = {
    id: "s1",
    category: "Test",
    title: "Test Scenario",
    description: "Description",
    isActive: true,
  };

  const mockConsumerType: PdktConsumerType = {
    id: "c1",
    name: "Normal",
    description: "Normal character",
  };

  const mockFallbackIdentity: PdktIdentity = {
    name: "Fallback Name",
    email: "fallback@test.com",
    city: "Jakarta",
    bodyName: "Fallback",
  };

  const mockSettings: PdktAppSettings = {
    scenarios: [mockScenario],
    consumerTypes: [mockConsumerType],
    enableImageGeneration: true,
    globalConsumerTypeId: "c1",
    selectedModel: "gemini-3.1-flash-lite",
    consumerNameMentionPattern: "none",
    writingStyleMode: "training",
  };

  it("coerces invalid model to default", () => {
    expect(coercePdktModelId("invalid-model")).toBe("gemini-3.1-flash-lite");
    expect(coercePdktModelId("gemini-3.1-pro-preview")).toBe(
      "gemini-3.1-pro-preview",
    );
  });

  it("resolves random name mention to a valid pattern", () => {
    const pattern = resolveConsumerNameMentionPattern("random");
    expect(["upfront", "middle", "late", "none"]).toContain(pattern);

    expect(resolveConsumerNameMentionPattern("upfront")).toBe("upfront");
  });

  it("overrides identity with custom identity", () => {
    const settingsWithCustomIdentity: PdktAppSettings = {
      ...mockSettings,
      customIdentity: {
        senderName: "Custom Name",
        email: "custom@test.com",
        city: "Bandung",
        bodyName: "Custom",
      },
    };

    const config = generatePdktSessionConfig(
      settingsWithCustomIdentity,
      mockScenario,
      mockFallbackIdentity,
    );
    expect(config.identity.name).toBe("Custom Name");
    expect(config.identity.email).toBe("custom@test.com");
    expect(config.identity.city).toBe("Bandung");
  });

  it("uses fallback identity when no custom identity is provided", () => {
    const config = generatePdktSessionConfig(
      mockSettings,
      mockScenario,
      mockFallbackIdentity,
    );
    expect(config.identity.name).toBe("Fallback Name");
  });

  it("produces a single-scenario config from selected scenario", () => {
    const config = generatePdktSessionConfig(
      mockSettings,
      mockScenario,
      mockFallbackIdentity,
    );
    expect(config.scenarios).toHaveLength(1);
    expect(config.scenarios[0].id).toBe("s1");
  });
});
