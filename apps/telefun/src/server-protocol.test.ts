import { describe, expect, it } from "vitest";
import {
  isGeminiForwardableMessage,
  isGeminiSetupMessage,
  hasGeminiSetupComplete,
  getGeminiGoAwayTimeLeftSeconds,
  getSessionResumptionHandle,
  isCurrentGeminiSocket,
} from "./server-protocol.js";

describe("telefun proxy protocol", () => {
  it("accepts setup, realtimeInput, and clientContent messages only", () => {
    expect(isGeminiForwardableMessage({ setup: { model: "models/x" } })).toBe(
      true,
    );
    expect(
      isGeminiForwardableMessage({ realtimeInput: { audioStreamEnd: true } }),
    ).toBe(true);
    expect(isGeminiForwardableMessage({ clientContent: { turns: [] } })).toBe(
      true,
    );
    expect(isGeminiForwardableMessage({ random: true })).toBe(false);
  });

  it("detects setup messages", () => {
    expect(
      isGeminiSetupMessage({
        setup: { model: "models/gemini-3.1-flash-live-preview" },
      }),
    ).toBe(true);
    expect(isGeminiSetupMessage({ realtimeInput: { text: "halo" } })).toBe(
      false,
    );
  });

  it("detects setupComplete messages", () => {
    expect(hasGeminiSetupComplete({ setupComplete: {} })).toBe(true);
    expect(hasGeminiSetupComplete({ serverContent: {} })).toBe(false);
  });

  it("accepts realtimeInput with user audio payload", () => {
    expect(
      isGeminiForwardableMessage({
        realtimeInput: {
          audio: {
            mimeType: "audio/pcm;rate=16000",
            data: "AAAA",
          },
        },
      }),
    ).toBe(true);
  });

  it("keeps current forwardable message contract", () => {
    expect(isGeminiForwardableMessage({ setup: {} })).toBe(true);
    expect(
      isGeminiForwardableMessage({ realtimeInput: { audioStreamEnd: true } }),
    ).toBe(true);
    expect(isGeminiForwardableMessage({ unknown: true })).toBe(false);
  });

  it("extracts Gemini GoAway timeLeft seconds", () => {
    expect(
      getGeminiGoAwayTimeLeftSeconds({ goAway: { timeLeft: "60s" } }),
    ).toBe(60);
    expect(
      getGeminiGoAwayTimeLeftSeconds({ goAway: { timeLeft: "5.5s" } }),
    ).toBe(5.5);
    expect(
      getGeminiGoAwayTimeLeftSeconds({ goAway: { timeLeft: "bad" } }),
    ).toBeNull();
    expect(getGeminiGoAwayTimeLeftSeconds({ serverContent: {} })).toBeNull();
  });

  it("extracts resumable Gemini session handles only when valid", () => {
    expect(
      getSessionResumptionHandle({
        sessionResumptionUpdate: { resumable: true, newHandle: "handle-1" },
      }),
    ).toBe("handle-1");
    expect(
      getSessionResumptionHandle({
        sessionResumptionUpdate: { resumable: false, newHandle: "handle-2" },
      }),
    ).toBeNull();
    expect(
      getSessionResumptionHandle({
        sessionResumptionUpdate: { resumable: true, newHandle: "" },
      }),
    ).toBeNull();
  });

  it("ignores events emitted by a stale Gemini socket after reconnect", () => {
    const staleSocket = {};
    const currentSocket = {};

    expect(isCurrentGeminiSocket(currentSocket, currentSocket)).toBe(true);
    expect(isCurrentGeminiSocket(currentSocket, staleSocket)).toBe(false);
  });
});
