import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEFUN_LIVE_MODEL_ID,
  GEMINI_LIVE_VOICES_BY_GENDER as SHARED_GEMINI_LIVE_VOICES_BY_GENDER,
  OPENAI_REALTIME_VOICES as SHARED_OPENAI_REALTIME_VOICES,
  OPENAI_REALTIME_VOICES_BY_GENDER as SHARED_OPENAI_REALTIME_VOICES_BY_GENDER,
  DEFAULT_GEMINI_LIVE_VOICE as SHARED_DEFAULT_GEMINI_LIVE_VOICE,
  DEFAULT_OPENAI_REALTIME_VOICE as SHARED_DEFAULT_OPENAI_REALTIME_VOICE,
} from "@trainers/types";
import {
  DEFAULT_GEMINI_LIVE_VOICE,
  DEFAULT_OPENAI_REALTIME_VOICE,
  GEMINI_LIVE_VOICES_BY_GENDER,
  OPENAI_REALTIME_VOICES,
  OPENAI_REALTIME_VOICES_BY_GENDER,
  getDefaultVoiceForModel,
  getVoicesForModel,
  isVoiceValidForModel,
  resolveVoiceForModel,
} from "../routes/telefun/telefunVoiceRegistry";

describe("Telefun provider-aware voice registry", () => {
  it("re-exports the canonical shared voice arrays and defaults", () => {
    expect(GEMINI_LIVE_VOICES_BY_GENDER).toBe(
      SHARED_GEMINI_LIVE_VOICES_BY_GENDER,
    );
    expect(OPENAI_REALTIME_VOICES).toBe(SHARED_OPENAI_REALTIME_VOICES);
    expect(OPENAI_REALTIME_VOICES_BY_GENDER).toBe(
      SHARED_OPENAI_REALTIME_VOICES_BY_GENDER,
    );
    expect(DEFAULT_GEMINI_LIVE_VOICE).toBe(SHARED_DEFAULT_GEMINI_LIVE_VOICE);
    expect(DEFAULT_OPENAI_REALTIME_VOICE).toBe(
      SHARED_DEFAULT_OPENAI_REALTIME_VOICE,
    );
  });

  it("keeps Gemini voices gender-aware and normalizes an incompatible voice", () => {
    expect(getVoicesForModel(DEFAULT_TELEFUN_LIVE_MODEL_ID, "male")).toEqual(
      GEMINI_LIVE_VOICES_BY_GENDER.male,
    );
    expect(getVoicesForModel(DEFAULT_TELEFUN_LIVE_MODEL_ID, "female")).toEqual(
      GEMINI_LIVE_VOICES_BY_GENDER.female,
    );

    const voice = resolveVoiceForModel({
      modelId: DEFAULT_TELEFUN_LIVE_MODEL_ID,
      requestedVoice: "Kore",
      gender: "male",
      random: () => 0,
    });

    expect(voice).toBe("Puck");
  });

  it("exposes all official OpenAI voices with marin as the explicit default", () => {
    expect(OPENAI_REALTIME_VOICES).toEqual([
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "sage",
      "shimmer",
      "verse",
      "marin",
      "cedar",
    ]);
    expect(getVoicesForModel("gpt-realtime-2.1")).toEqual(
      OPENAI_REALTIME_VOICES,
    );
    expect(getVoicesForModel("gpt-realtime-2.1", "male")).toEqual([
      "ash",
      "ballad",
      "echo",
      "verse",
      "cedar",
    ]);
    expect(getVoicesForModel("gpt-realtime-2.1", "female")).toEqual([
      "coral",
      "sage",
      "shimmer",
      "marin",
    ]);
    expect(getDefaultVoiceForModel("gpt-realtime-2.1-mini")).toBe("marin");
    expect(isVoiceValidForModel("gpt-realtime-2.1", "cedar")).toBe(true);
    expect(isVoiceValidForModel("gpt-realtime-2.1", "Kore")).toBe(false);
    expect(
      resolveVoiceForModel({
        modelId: "gpt-realtime-2.1",
        requestedVoice: "Kore",
        gender: "female",
        random: () => 0,
      }),
    ).toBe("coral");
  });

  it("normalizes OpenAI voices to the resolved persona gender", () => {
    expect(
      resolveVoiceForModel({
        modelId: "gpt-realtime-2.1",
        requestedVoice: "marin",
        gender: "male",
        random: () => 0,
      }),
    ).toBe("ash");
    expect(
      resolveVoiceForModel({
        modelId: "gpt-realtime-2.1",
        requestedVoice: "alloy",
        gender: "female",
        random: () => 0,
      }),
    ).toBe("coral");
    expect(isVoiceValidForModel("gpt-realtime-2.1", "alloy")).toBe(true);
  });

  it("falls unknown models back through the canonical Gemini model", () => {
    expect(getVoicesForModel("unknown-model", "female")).toEqual(
      GEMINI_LIVE_VOICES_BY_GENDER.female,
    );
    expect(isVoiceValidForModel("unknown-model", "marin")).toBe(false);
  });
});
