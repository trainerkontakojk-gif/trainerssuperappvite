import { describe, expect, it } from "vitest";
import { buildSafeCloseMetadata } from "./server-close.js";

describe("buildSafeCloseMetadata", () => {
  it("keeps valid WebSocket close code and reason", () => {
    expect(buildSafeCloseMetadata(1011, "Gemini API Error")).toEqual({
      code: 1011,
      reason: "Gemini API Error",
    });
  });

  it("falls back with provider-neutral copy when upstream closes without reason", () => {
    expect(buildSafeCloseMetadata(1000, Buffer.from(""))).toEqual({
      code: 1000,
      reason: "Provider realtime upstream closed without reason",
    });
  });

  it("normalizes invalid upstream close code to 1011", () => {
    expect(buildSafeCloseMetadata(1005, "")).toEqual({
      code: 1011,
      reason: "Provider realtime upstream closed without reason",
    });
  });
});
