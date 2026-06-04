import { describe, expect, it } from "vitest";
import {
  isGeminiForwardableMessage,
  isGeminiSetupMessage,
  hasGeminiSetupComplete,
} from "./server-protocol.js";

describe("telefun proxy protocol", () => {
  it("accepts setup, realtimeInput, and clientContent messages only", () => {
    expect(isGeminiForwardableMessage({ setup: { model: "models/x" } })).toBe(true);
    expect(isGeminiForwardableMessage({ realtimeInput: { audioStreamEnd: true } })).toBe(true);
    expect(isGeminiForwardableMessage({ clientContent: { turns: [] } })).toBe(true);
    expect(isGeminiForwardableMessage({ random: true })).toBe(false);
  });

  it("detects setup messages", () => {
    expect(isGeminiSetupMessage({ setup: { model: "models/gemini-3.1-flash-live-preview" } })).toBe(true);
    expect(isGeminiSetupMessage({ realtimeInput: { text: "halo" } })).toBe(false);
  });

  it("detects setupComplete messages", () => {
    expect(hasGeminiSetupComplete({ setupComplete: {} })).toBe(true);
    expect(hasGeminiSetupComplete({ serverContent: {} })).toBe(false);
  });

  it("accepts realtimeInput with user audio payload", () => {
    expect(isGeminiForwardableMessage({
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
          data: "AAAA",
        },
      },
    })).toBe(true);
  });

  it("keeps current forwardable message contract", () => {
    expect(isGeminiForwardableMessage({ setup: {} })).toBe(true);
    expect(isGeminiForwardableMessage({ realtimeInput: { audioStreamEnd: true } })).toBe(true);
    expect(isGeminiForwardableMessage({ unknown: true })).toBe(false);
  });
});
