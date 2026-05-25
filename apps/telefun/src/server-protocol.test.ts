import { describe, expect, it } from "vitest";
import { isGeminiForwardableMessage } from "./server-protocol.js";

describe("telefun proxy protocol", () => {
  it("accepts setup, realtimeInput, and clientContent messages only", () => {
    expect(isGeminiForwardableMessage({ setup: { model: "models/x" } })).toBe(true);
    expect(isGeminiForwardableMessage({ realtimeInput: { audioStreamEnd: true } })).toBe(true);
    expect(isGeminiForwardableMessage({ clientContent: { turns: [] } })).toBe(true);
    expect(isGeminiForwardableMessage({ random: true })).toBe(false);
  });
});
