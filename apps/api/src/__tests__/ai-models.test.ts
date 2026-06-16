import { describe, expect, it } from "vitest";
import { KETIK_PDKT_MODELS, TEXT_MODELS } from "@trainers/types";
import { getModelsForModule, resolveModelProvider } from "../lib/ai-models";

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
    expect(models.every((model) => model.capabilities?.supportsText)).toBe(true);
    expect(models.some((model) => model.capabilities?.supportsText === false)).toBe(false);
  });

  it("exposes DeepSeek direct models only for ketik and pdkt", () => {
    expect(
      KETIK_PDKT_MODELS.some((model) => model.id === "deepseek-v4-pro"),
    ).toBe(true);
    expect(
      getModelsForModule("ketik").some((model) => model.id === "deepseek-v4-flash"),
    ).toBe(true);
    expect(
      getModelsForModule("qa-analyzer").some((model) => model.id === "deepseek-v4-pro"),
    ).toBe(false);
  });

  it("routes DeepSeek direct models to the DeepSeek provider", () => {
    expect(resolveModelProvider("deepseek-v4-pro")).toMatchObject({
      modelId: "deepseek-v4-pro",
      provider: "deepseek",
      isFallback: false,
    });
  });
});
