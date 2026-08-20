import { describe, expect, it } from "vitest";
import {
  AI_MODELS,
  DEFAULT_TELEFUN_LIVE_MODEL_ID,
  DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
  TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS,
  TELEFUN_LIVE_MODELS,
  TELEFUN_OPENAI_WEBRTC_MODEL_IDS,
  getHistoricalTelefunRealtimeModel,
  getTelefunLiveModel,
  isHistoricalTelefunOpenAiRealtimeModelId,
  isValidTelefunModelTransportPair,
  normalizePersistedTelefunSettings,
  normalizeTelefunLiveModelSelection,
  parseTelefunOpenAiWebRtcAllowedModelIds,
} from "@trainers/types";

describe("Telefun live model registry", () => {
  it("exposes exactly the two active Gemini Live models", () => {
    expect(DEFAULT_TELEFUN_LIVE_MODEL_ID).toBe(
      "gemini-3.1-flash-live-preview",
    );
    expect(
      TELEFUN_LIVE_MODELS.map((model) => ({
        id: model.id,
        provider: model.provider,
        transport: model.realtime?.transport,
        voiceProvider: model.realtime?.voiceProvider,
      })),
    ).toEqual([
      {
        id: "gemini-3.1-flash-live-preview",
        provider: "gemini",
        transport: "gemini-live",
        voiceProvider: "gemini",
      },
      {
        id: "gemini-3.0-flash-live-preview",
        provider: "gemini",
        transport: "gemini-live",
        voiceProvider: "gemini",
      },
    ]);
  });

  it("keeps the two GPT Realtime records in a historical-only registry", () => {
    expect(
      TELEFUN_HISTORICAL_OPENAI_REALTIME_MODELS.map((model) => ({
        id: model.id,
        provider: model.provider,
        transport: model.realtime?.transport,
        supportedTransports: model.realtime?.supportedTransports,
      })),
    ).toEqual([
      {
        id: "gpt-realtime-2.1",
        provider: "openai",
        transport: "openai-audio",
        supportedTransports: ["openai-audio", "openai-webrtc"],
      },
      {
        id: "gpt-realtime-2.1-mini",
        provider: "openai",
        transport: "openai-audio",
        supportedTransports: ["openai-audio", "openai-webrtc"],
      },
    ]);
    expect(TELEFUN_LIVE_MODELS.map((model) => model.id)).not.toContain(
      "gpt-realtime-2.1",
    );
    expect(AI_MODELS.map((model) => model.id)).not.toContain(
      "gpt-realtime-2.1-mini",
    );
  });

  it("offers exact historical lookup without making historical IDs active", () => {
    expect(getHistoricalTelefunRealtimeModel("gpt-realtime-2.1")).toMatchObject({
      id: "gpt-realtime-2.1",
      provider: "openai",
    });
    expect(
      getHistoricalTelefunRealtimeModel("gpt-realtime-2.1-mini"),
    ).toMatchObject({ id: "gpt-realtime-2.1-mini" });
    expect(getHistoricalTelefunRealtimeModel("gpt-realtime-unknown")).toBe(
      undefined,
    );
    expect(isHistoricalTelefunOpenAiRealtimeModelId("gpt-realtime-2.1")).toBe(
      true,
    );
    expect(
      isHistoricalTelefunOpenAiRealtimeModelId("gpt-realtime-unknown"),
    ).toBe(false);
    expect(getTelefunLiveModel("gpt-realtime-2.1")).toBe(undefined);
  });

  it("normalizes a historical GPT selection to the default Gemini model with a legacy warning", () => {
    expect(
      normalizeTelefunLiveModelSelection(
        "gpt-realtime-2.1",
        "openai-webrtc",
      ),
    ).toMatchObject({
      model: getTelefunLiveModel(DEFAULT_TELEFUN_LIVE_MODEL_ID),
      transport: "gemini-live",
      didFallback: true,
      warningReason: "legacy-model",
    });
    expect(
      isValidTelefunModelTransportPair("gpt-realtime-2.1", "openai-webrtc"),
    ).toBe(false);
  });

  it("projects a persisted historical selection to Gemini without mutating its input", () => {
    const persisted = {
      telefunModelId: "gpt-realtime-2.1",
      telefunTransport: "openai-audio",
      selectedModel: "gpt-realtime-2.1",
      voiceName: "marin",
      identitySettings: { voiceName: "cedar", city: "Bandung" },
      scenarioTitle: "Preserved",
    };

    const normalized = normalizePersistedTelefunSettings(persisted);

    expect(normalized).toEqual({
      didNormalize: true,
      settings: {
        telefunModelId: DEFAULT_TELEFUN_LIVE_MODEL_ID,
        telefunTransport: "gemini-live",
        selectedModel: DEFAULT_TELEFUN_LIVE_MODEL_ID,
        voiceName: "",
        identitySettings: { voiceName: "", city: "Bandung" },
        scenarioTitle: "Preserved",
      },
    });
    expect(persisted.telefunModelId).toBe("gpt-realtime-2.1");
    expect(persisted.identitySettings.voiceName).toBe("cedar");
  });

  it("retains deprecated WebRTC IDs for historical cleanup but ignores every retired allowlist input", () => {
    expect(TELEFUN_OPENAI_WEBRTC_MODEL_IDS).toEqual([
      "gpt-realtime-2.1",
      "gpt-realtime-2.1-mini",
    ]);
    expect(DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS).toEqual([]);
    expect(
      parseTelefunOpenAiWebRtcAllowedModelIds(
        "gpt-realtime-2.1,gpt-realtime-2.1-mini",
      ),
    ).toEqual([]);
  });
});
