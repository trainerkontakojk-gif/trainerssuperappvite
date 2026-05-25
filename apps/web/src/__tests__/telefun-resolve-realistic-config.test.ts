import { describe, expect, it } from "vitest";
import { resolveTelefunRealisticModeConfig } from "../routes/telefun/services/guards";

describe("resolveTelefunRealisticModeConfig", () => {
  it("returns disabled when config is null/undefined", () => {
    expect(resolveTelefunRealisticModeConfig(null)).toEqual({
      enabled: false,
      personaType: "cooperative",
    });
    expect(resolveTelefunRealisticModeConfig(undefined)).toEqual({
      enabled: false,
      personaType: "cooperative",
    });
  });

  it("returns disabled when realisticModeEnabled is false", () => {
    expect(
      resolveTelefunRealisticModeConfig({ realisticModeEnabled: false }),
    ).toEqual({ enabled: false, personaType: "cooperative" });
  });

  it("returns disabled when realisticModeEnabled is missing", () => {
    expect(resolveTelefunRealisticModeConfig({})).toEqual({
      enabled: false,
      personaType: "cooperative",
    });
  });

  it("maps marah consumer type to angry persona", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        consumerType: { id: "marah" },
      }),
    ).toMatchObject({ enabled: true, personaType: "angry" });
  });

  it("maps bingung consumer type to confused persona", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        consumerType: { id: "bingung" },
      }),
    ).toMatchObject({ enabled: true, personaType: "confused" });
  });

  it("maps kritis consumer type to critical persona", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        consumerType: { id: "kritis" },
      }),
    ).toMatchObject({ enabled: true, personaType: "critical" });
  });

  it("maps ramah consumer type to cooperative persona", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        consumerType: { id: "ramah" },
      }),
    ).toMatchObject({ enabled: true, personaType: "cooperative" });
  });

  it("maps terburu-buru consumer type to rushed persona", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        consumerType: { id: "terburu-buru" },
      }),
    ).toMatchObject({ enabled: true, personaType: "rushed" });
  });

  it("maps pasrah consumer type to passive persona", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        consumerType: { id: "pasrah" },
      }),
    ).toMatchObject({ enabled: true, personaType: "passive" });
  });

  it("falls back to cooperative for unknown consumer type", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        consumerType: { id: "unknown-type" },
      }),
    ).toMatchObject({ enabled: true, personaType: "cooperative" });
  });

  it("uses activeConsumerType as fallback when consumerType is missing", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        activeConsumerType: { id: "bingung" },
      }),
    ).toMatchObject({ enabled: true, personaType: "confused" });
  });

  it("passes through disruptionTypes", () => {
    const result = resolveTelefunRealisticModeConfig({
      realisticModeEnabled: true,
      consumerType: { id: "ramah" },
      realisticModeDisruptionTypes: [
        "technical_term_confusion",
        "repeated_question",
      ],
    });
    expect(result.disruptionTypes).toEqual([
      "technical_term_confusion",
      "repeated_question",
    ]);
  });

  it("defaults disruptionTypes to empty array", () => {
    expect(
      resolveTelefunRealisticModeConfig({
        realisticModeEnabled: true,
        consumerType: { id: "ramah" },
      }),
    ).toMatchObject({ disruptionTypes: [] });
  });
});
