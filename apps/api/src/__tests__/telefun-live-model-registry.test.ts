import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEFUN_LIVE_MODEL_ID,
  TELEFUN_LIVE_MODELS,
  getTelefunLiveModel,
  isValidTelefunModelTransportPair,
  normalizeTelefunLiveModelSelection,
} from "@trainers/types";

describe("canonical Telefun live model registry", () => {
  it("describes every supported model without inferring provider metadata from its id", () => {
    expect(DEFAULT_TELEFUN_LIVE_MODEL_ID).toBe("gemini-3.1-flash-live-preview");
    expect(
      TELEFUN_LIVE_MODELS.map((model) => ({
        id: model.id,
        provider: model.provider,
        realtime: model.realtime,
      })),
    ).toEqual([
      {
        id: "gemini-3.1-flash-live-preview",
        provider: "gemini",
        realtime: {
          transport: "gemini-live",
          inputSampleRateHz: 16_000,
          outputSampleRateHz: 24_000,
          voiceProvider: "gemini",
          supportsAudio: true,
        },
      },
      {
        id: "gemini-3.0-flash-live-preview",
        provider: "gemini",
        realtime: {
          transport: "gemini-live",
          inputSampleRateHz: 16_000,
          outputSampleRateHz: 24_000,
          voiceProvider: "gemini",
          supportsAudio: true,
        },
      },
      {
        id: "gpt-realtime-2.1",
        provider: "openai",
        realtime: {
          transport: "openai-audio",
          inputSampleRateHz: 24_000,
          outputSampleRateHz: 24_000,
          voiceProvider: "openai",
          maxSessionMinutes: 60,
          supportsAudio: true,
        },
      },
      {
        id: "gpt-realtime-2.1-mini",
        provider: "openai",
        realtime: {
          transport: "openai-audio",
          inputSampleRateHz: 24_000,
          outputSampleRateHz: 24_000,
          voiceProvider: "openai",
          maxSessionMinutes: 60,
          supportsAudio: true,
        },
      },
    ]);
  });

  it("validates only canonical model and transport pairs", () => {
    expect(
      isValidTelefunModelTransportPair(
        "gemini-3.1-flash-live-preview",
        "gemini-live",
      ),
    ).toBe(true);
    expect(
      isValidTelefunModelTransportPair("gpt-realtime-2.1-mini", "openai-audio"),
    ).toBe(true);
    expect(
      isValidTelefunModelTransportPair("gpt-realtime-2.1", "gemini-live"),
    ).toBe(false);
    expect(
      isValidTelefunModelTransportPair("unknown-live-model", "gemini-live"),
    ).toBe(false);
  });

  it("normalizes defaults, missing transports, unknown models, and mismatches", () => {
    expect(normalizeTelefunLiveModelSelection()).toMatchObject({
      model: getTelefunLiveModel(DEFAULT_TELEFUN_LIVE_MODEL_ID),
      transport: "gemini-live",
      didFallback: false,
      warningReason: undefined,
    });

    expect(
      normalizeTelefunLiveModelSelection("gpt-realtime-2.1-mini"),
    ).toMatchObject({
      model: getTelefunLiveModel("gpt-realtime-2.1-mini"),
      transport: "openai-audio",
      didFallback: false,
      warningReason: undefined,
    });

    expect(
      normalizeTelefunLiveModelSelection("unknown-live-model", "openai-audio"),
    ).toMatchObject({
      model: getTelefunLiveModel(DEFAULT_TELEFUN_LIVE_MODEL_ID),
      transport: "gemini-live",
      didFallback: true,
      warningReason: "unknown-model",
    });

    expect(
      normalizeTelefunLiveModelSelection(
        "gemini-3.0-flash-live-preview",
        "openai-audio",
      ),
    ).toMatchObject({
      model: getTelefunLiveModel("gemini-3.0-flash-live-preview"),
      transport: "gemini-live",
      didFallback: false,
      warningReason: "transport-mismatch",
    });
  });
});
