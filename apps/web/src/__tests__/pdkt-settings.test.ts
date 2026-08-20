import { describe, it, expect } from "vitest";
import {
  coercePdktModelId,
  resolveConsumerNameMentionPattern,
  generatePdktSessionConfig,
  resolvePdktScenarioIdentity,
  type PdktAppSettings,
} from "../routes/pdkt/pdktSettings";
import {
  pdktPromptScenarioSchema,
  type PdktScenario,
  type PdktConsumerType,
  type PdktIdentity,
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

  it("coerces legacy model IDs to supported direct models", () => {
    expect(coercePdktModelId("invalid-model")).toBe("gemini-3.7-flash");
    expect(coercePdktModelId("gemini-3.1-pro-preview")).toBe(
      "gemini-3.1-pro-preview",
    );
    expect(coercePdktModelId("gpt-5.4-mini")).toBe("gpt-5.4-mini");
    expect(coercePdktModelId("deepseek-v4-pro")).toBe("gpt-5.4-mini");
    expect(coercePdktModelId("deepseek-v4-flash")).toBe("gpt-5.4-mini");
    expect(coercePdktModelId("openai/gpt-4o-mini")).toBe("gpt-5.4-mini");
    expect(coercePdktModelId("openrouter/gpt-4o-mini")).toBe("gpt-5.4-mini");
    expect(coercePdktModelId("deepseek/deepseek-v3")).toBe("gpt-5.4-mini");
    expect(coercePdktModelId("legacy-provider/gpt-4o-mini")).toBe(
      "gpt-5.4-mini",
    );
  });

  it("resolves random name mention to a valid pattern", () => {
    const pattern = resolveConsumerNameMentionPattern("random");
    expect(["upfront", "middle", "late", "none"]).toContain(pattern);

    expect(resolveConsumerNameMentionPattern("upfront")).toBe("upfront");
  });

  it("resolves scenario identity fields before global and fallback values", () => {
    const config = generatePdktSessionConfig(
      {
        ...mockSettings,
        customIdentity: {
          senderName: " Global Name ",
          email: "global@test.com",
          city: "Global City",
          bodyName: "Global Body",
        },
      },
      {
        ...mockScenario,
        title: "Scenario Title",
        identity: {
          name: " Scenario Name ",
          email: "",
          city: "   ",
          bodyName: "",
        },
      },
      mockFallbackIdentity,
    );

    expect(config.identity).toEqual({
      name: "Scenario Name",
      email: "global@test.com",
      city: "Global City",
      bodyName: "Scenario Name",
    });
  });

  it("uses each fallback when scenario and global fields are blank", () => {
    expect(
      resolvePdktScenarioIdentity({
        scenario: { ...mockScenario, identity: { name: "  " } },
        customIdentity: {
          senderName: " ",
          email: "",
          city: "  ",
          bodyName: "",
        },
        fallbackIdentity: mockFallbackIdentity,
      }),
    ).toEqual(mockFallbackIdentity);
  });

  it("omits raw scenario identity at the prompt boundary", () => {
    const promptScenario = pdktPromptScenarioSchema.parse({
      ...mockScenario,
      identity: { name: "Scenario Name" },
    });

    expect(promptScenario).not.toHaveProperty("identity");
  });

  it("preserves legacy scenario identity behavior", () => {
    const config = generatePdktSessionConfig(
      {
        ...mockSettings,
        customIdentity: {
          senderName: "Custom Name",
          email: "custom@test.com",
          city: "Bandung",
          bodyName: "Custom",
        },
      },
      mockScenario,
      mockFallbackIdentity,
    );

    expect(config.identity).toEqual({
      name: "Custom Name",
      email: "custom@test.com",
      city: "Bandung",
      bodyName: "Custom",
    });
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
