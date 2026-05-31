import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEFUN_SETTINGS,
  parseTelefunSettings,
} from "../routes/telefun/telefunSettings";

describe("parseTelefunSettings", () => {
  it("returns defaults for empty input", () => {
    const result = parseTelefunSettings({});
    expect(result.selectedModel).toBe("gemini-3.1-flash-live-preview");
    expect(result.voiceName).toBe("Kore");
    expect(result.maxCallDuration).toBe(5);
    expect(result.responsePacingMode).toBe("realistic");
  });

  it("parses realisticModeEnabled as true boolean", () => {
    const result = parseTelefunSettings({ realisticModeEnabled: true });
    expect(result.realisticModeEnabled).toBe(true);
  });

  it("parses realisticModeEnabled as false when missing", () => {
    const result = parseTelefunSettings({});
    expect(result.realisticModeEnabled).toBe(false);
  });

  it("parses realisticModeEnabled as false when non-boolean", () => {
    const result = parseTelefunSettings({ realisticModeEnabled: "yes" } as any);
    expect(result.realisticModeEnabled).toBe(false);
  });

  it("truncates realisticModeDisruptionTypes to max 3", () => {
    const result = parseTelefunSettings({
      realisticModeDisruptionTypes: ["a", "b", "c", "d", "e"],
    });
    expect(result.realisticModeDisruptionTypes).toHaveLength(3);
  });

  it("defaults realisticModeDisruptionTypes to empty array when not array", () => {
    const result = parseTelefunSettings({
      realisticModeDisruptionTypes: "not-an-array",
    } as any);
    expect(result.realisticModeDisruptionTypes).toEqual([]);
  });

  it("preserves valid model id", () => {
    const result = parseTelefunSettings({
      selectedModel: "gemini-3.0-flash-live-preview",
    });
    expect(result.selectedModel).toBe("gemini-3.0-flash-live-preview");
  });

  it("parses maxCallDuration as number", () => {
    const result = parseTelefunSettings({ maxCallDuration: 10 });
    expect(result.maxCallDuration).toBe(10);
  });

  it("falls back to default maxCallDuration when not a number", () => {
    const result = parseTelefunSettings({ maxCallDuration: "abc" } as any);
    expect(result.maxCallDuration).toBe(5);
  });

  it("parses identity settings with new format", () => {
    const result = parseTelefunSettings({
      identitySettings: {
        displayName: "Test",
        gender: "male",
        phoneNumber: "0812",
        city: "Jakarta",
        signatureName: "Agent",
        voiceName: "Fenrir",
      },
    });
    expect(result.identitySettings.displayName).toBe("Test");
    expect(result.identitySettings.gender).toBe("male");
  });

  it("parses identity settings with legacy mode format", () => {
    const result = parseTelefunSettings({
      identitySettings: {
        mode: "fixed",
        fixedName: "LegacyUser",
        fixedGender: "female",
        fixedPhone: "0813",
        fixedCity: "Bandung",
      },
    } as any);
    expect(result.identitySettings.displayName).toBe("LegacyUser");
    expect(result.identitySettings.gender).toBe("female");
    expect(result.identitySettings.phoneNumber).toBe("0813");
    expect(result.identitySettings.city).toBe("Bandung");
  });

  it("handles legacy identity random mode", () => {
    const result = parseTelefunSettings({
      identitySettings: {
        mode: "random",
      },
    } as any);
    expect(result.identitySettings.displayName).toBe("");
    expect(result.identitySettings.gender).toBe("random");
  });
});

describe("parseTelefunSettings coercion", () => {
  it("falls back to random identity gender for invalid persisted gender", () => {
    const result = parseTelefunSettings({
      identitySettings: {
        displayName: "Customer",
        gender: "invalid-gender",
        phoneNumber: "",
        city: "",
        signatureName: "",
        voiceName: "",
      },
    } as any);

    expect(result.identitySettings.gender).toBe("random");
  });

  it("falls back to default transport and pacing mode for invalid persisted values", () => {
    const result = parseTelefunSettings({
      telefunTransport: "legacy-transport",
      responsePacingMode: "slow-motion",
    } as any);

    expect(result.telefunTransport).toBe(DEFAULT_TELEFUN_SETTINGS.telefunTransport);
    expect(result.responsePacingMode).toBe(DEFAULT_TELEFUN_SETTINGS.responsePacingMode);
  });

  it("falls back to default collections when persisted collections are not arrays", () => {
    const result = parseTelefunSettings({
      scenarios: { id: "not-array" },
      consumerTypes: { id: "not-array" },
    } as any);

    expect(result.scenarios).toBe(DEFAULT_TELEFUN_SETTINGS.scenarios);
    expect(result.consumerTypes).toBe(DEFAULT_TELEFUN_SETTINGS.consumerTypes);
  });
});
