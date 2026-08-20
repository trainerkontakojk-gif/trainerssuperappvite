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

  it("keeps OpenAI voice metadata historical while active selectors use Gemini", () => {
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
      Object.values(GEMINI_LIVE_VOICES_BY_GENDER).flat(),
    );
    expect(getVoicesForModel("gpt-realtime-2.1", "male")).toEqual(
      GEMINI_LIVE_VOICES_BY_GENDER.male,
    );
    expect(getVoicesForModel("gpt-realtime-2.1", "female")).toEqual(
      GEMINI_LIVE_VOICES_BY_GENDER.female,
    );
    expect(getDefaultVoiceForModel("gpt-realtime-2.1-mini")).toBe(
      DEFAULT_GEMINI_LIVE_VOICE,
    );
    expect(isVoiceValidForModel("gpt-realtime-2.1", "cedar")).toBe(false);
    expect(isVoiceValidForModel("gpt-realtime-2.1", "Kore")).toBe(true);
  });

  it("normalizes historical OpenAI voices to the resolved Gemini gender", () => {
    expect(
      resolveVoiceForModel({
        modelId: "gpt-realtime-2.1",
        requestedVoice: "marin",
        gender: "male",
        random: () => 0,
      }),
    ).toBe(GEMINI_LIVE_VOICES_BY_GENDER.male[0]);
    expect(
      resolveVoiceForModel({
        modelId: "gpt-realtime-2.1",
        requestedVoice: "alloy",
        gender: "female",
        random: () => 0,
      }),
    ).toBe(GEMINI_LIVE_VOICES_BY_GENDER.female[0]);
    expect(isVoiceValidForModel("gpt-realtime-2.1", "alloy")).toBe(false);
  });

  it("falls unknown models back through the canonical Gemini model", () => {
    expect(getVoicesForModel("unknown-model", "female")).toEqual(
      GEMINI_LIVE_VOICES_BY_GENDER.female,
    );
    expect(isVoiceValidForModel("unknown-model", "marin")).toBe(false);
  });
});
