import { describe, expect, it } from "vitest";
import * as protocol from "../routes/telefun/services/liveProtocol";

describe("Telefun live protocol retirement", () => {
  it("rejects historical GPT realtime configure input", () => {
    expect(() => protocol.buildTelefunSessionConfigure({
      modelId: "gpt-realtime-2.1",
      voice: "marin",
      instructions: "legacy",
      responsePacingMode: "realistic",
    })).toThrow(/model/i);
  });

  it("still builds the active Gemini configure envelope", () => {
    expect(protocol.buildTelefunSessionConfigure({
      modelId: "gemini-3.1-flash-live-preview",
      voice: "Kore",
      instructions: "active",
      responsePacingMode: "realistic",
    })).toMatchObject({
      type: "telefun_session_configure",
      modelId: "gemini-3.1-flash-live-preview",
      transport: "gemini-live",
    });
  });

  it("does not re-export retired OpenAI data-plane helpers from the active protocol barrel", () => {
    expect(protocol).not.toHaveProperty("buildOpenAiInputAudioAppend");
    expect(protocol).not.toHaveProperty("parseOpenAiRealtimeEvent");
  });
});
