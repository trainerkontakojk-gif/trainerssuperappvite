import { describe, expect, it } from "vitest";
import {
  POC_TRANSPORT,
  TELEFUN_OPENAI_WEBRTC_MODEL_IDS,
  assertTelefunWebRtcModelId,
  isHistoricalTelefunOpenAiWebRtcModelId,
  parseSessionId,
} from "./contracts.js";

describe("historical OpenAI WebRTC cleanup contracts", () => {
  it("recognizes only the two historical realtime ids for compatibility cleanup", () => {
    expect(TELEFUN_OPENAI_WEBRTC_MODEL_IDS).toEqual([
      "gpt-realtime-2.1",
      "gpt-realtime-2.1-mini",
    ]);
    expect(isHistoricalTelefunOpenAiWebRtcModelId("gpt-realtime-2.1")).toBe(
      true,
    );
    expect(
      isHistoricalTelefunOpenAiWebRtcModelId("gpt-realtime-2.1-mini"),
    ).toBe(true);
    expect(isHistoricalTelefunOpenAiWebRtcModelId("gpt-realtime-4")).toBe(
      false,
    );
    expect(
      isHistoricalTelefunOpenAiWebRtcModelId(
        "gemini-3.1-flash-live-preview",
      ),
    ).toBe(false);
    expect(isHistoricalTelefunOpenAiWebRtcModelId(undefined)).toBe(false);
  });

  it("keeps the transport and model assertion available only for exact historical ownership checks", () => {
    expect(POC_TRANSPORT).toBe("openai-webrtc");
    expect(assertTelefunWebRtcModelId("gpt-realtime-2.1-mini")).toBe(
      "gpt-realtime-2.1-mini",
    );
    expect(() => assertTelefunWebRtcModelId("gpt-realtime-4")).toThrow(
      /model/i,
    );
  });

  it("continues to validate the historical cleanup session path identifier", () => {
    expect(parseSessionId("019f45e3-5fac-7cd2-afeb-8069c2f813b3")).toBe(
      "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
    );
    expect(parseSessionId("not-a-session")).toBeNull();
  });
});
