import { describe, expect, it } from "vitest";
import {
  IMAGE_GENERATION_MODELS,
  KETIK_PDKT_MODELS,
  TEXT_MODELS,
} from "@trainers/types";
import {
  DEFAULT_AI_MODEL_ID,
  getModelsForModule,
  normalizeModelId,
  resolveModelProvider,
  supportsTemperature,
} from "../lib/ai-models";

describe("ai model registry", () => {
  it("exposes Gemini 3.5 Flash as a Gemini text simulation model", () => {
    const model = TEXT_MODELS.find((item) => item.id === "gemini-3.5-flash");

    expect(model).toMatchObject({
      id: "gemini-3.5-flash",
      name: "Gemini 3.5 Flash",
      provider: "gemini",
      capabilities: expect.objectContaining({
        supportsText: true,
      }),
    });
  });

  it("routes Gemini 3.5 Flash to the Gemini provider", () => {
    expect(resolveModelProvider("gemini-3.5-flash")).toMatchObject({
      modelId: "gemini-3.5-flash",
      provider: "gemini",
      isFallback: false,
    });
  });

  it("returns text models for qa-analyzer", () => {
    const models = getModelsForModule("qa-analyzer");

    expect(models.some((model) => model.id === "gemini-3.5-flash")).toBe(true);
    expect(models.every((model) => model.capabilities?.supportsText)).toBe(
      true,
    );
    expect(
      models.some((model) => model.capabilities?.supportsText === false),
    ).toBe(false);
  });

  it("returns only canonical live models for the Telefun module", () => {
    const models = getModelsForModule("telefun");

    expect(models.map((model) => model.id)).toEqual([
      "gemini-3.1-flash-live-preview",
      "gemini-3.0-flash-live-preview",
    ]);
    expect(models.every((model) => model.provider === "gemini")).toBe(true);
    expect(models.every((model) => model.realtime?.supportsAudio)).toBe(true);
  });

  it("exposes only direct Gemini and OpenAI active text models", () => {
    expect(
      [
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
        "gpt-5.6-luna",
        "gpt-5.4-mini",
      ].every((id) => KETIK_PDKT_MODELS.some((model) => model.id === id)),
    ).toBe(true);
    expect(
      KETIK_PDKT_MODELS.some((model) => model.id === "gemini-3.7-flash"),
    ).toBe(false);
    expect(resolveModelProvider("gpt-5.6-luna")).toMatchObject({
      modelId: "gpt-5.6-luna",
      provider: "openai",
      isFallback: false,
    });
    expect(resolveModelProvider("gpt-5.4-mini")).toMatchObject({
      modelId: "gpt-5.4-mini",
      provider: "openai",
      isFallback: false,
    });
    expect(
      KETIK_PDKT_MODELS.every((model) =>
        ["gemini", "openai"].includes(model.provider),
      ),
    ).toBe(true);
  });

  it("keeps the active provider contract limited to Gemini and OpenAI", () => {
    expect(
      [...TEXT_MODELS, ...IMAGE_GENERATION_MODELS].every((model) =>
        ["gemini", "openai"].includes(model.provider),
      ),
    ).toBe(true);
    expect(
      IMAGE_GENERATION_MODELS.every(
        (model) => model.capabilities?.imageGenerationMode !== "none",
      ),
    ).toBe(true);
  });

  it("marks gpt-5.6-luna as a reasoning model without temperature support", () => {
    const luna = TEXT_MODELS.find((model) => model.id === "gpt-5.6-luna");
    expect(luna?.supportsTemperature).toBe(false);
    expect(supportsTemperature("gpt-5.6-luna")).toBe(false);
    expect(supportsTemperature("gpt-5.4-mini")).toBe(true);
    expect(supportsTemperature("gemini-3.8-flash")).toBe(true);
  });

  it("defaults text generation to Gemini 3.8 Flash", () => {
    expect(DEFAULT_AI_MODEL_ID).toBe("gemini-3.8-flash");
    expect(normalizeModelId()).toBe("gemini-3.8-flash");
  });

  it("normalizes legacy provider selections while preserving supported and unknown IDs", () => {
    expect(normalizeModelId("gpt-5.4-mini")).toBe("gpt-5.4-mini");
    expect(normalizeModelId("gemini-3.7-flash")).toBe("gemini-3.8-flash");
    expect(normalizeModelId("gemini-3.6-flash")).toBe("gemini-3.8-flash");
    expect(normalizeModelId("openrouter/gpt-4o-mini")).toBe("gpt-5.4-mini");
    expect(normalizeModelId("legacy-provider/gpt-4o-mini")).toBe(
      "gpt-5.4-mini",
    );
    expect(normalizeModelId("deepseek-v4-pro")).toBe("gpt-5.4-mini");
    expect(resolveModelProvider("unknown-model")).toMatchObject({
      modelId: DEFAULT_AI_MODEL_ID,
      provider: "gemini",
      isFallback: true,
    });
  });
});
