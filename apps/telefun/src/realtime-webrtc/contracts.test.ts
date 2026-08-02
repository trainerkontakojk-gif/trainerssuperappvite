import { describe, expect, it } from "vitest";
import {
  POC_MODEL_ID,
  POC_TRANSPORT,
  buildCanonicalPocSession,
  parseRawSdp,
  parseSessionId,
} from "./contracts.js";

describe("OpenAI WebRTC POC contracts", () => {
  it("builds only the server-owned canonical session configuration", () => {
    expect(buildCanonicalPocSession()).toEqual({
      type: "realtime",
      model: "gpt-realtime-2.1",
      instructions: expect.any(String),
      output_modalities: ["audio"],
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24_000 },
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          format: { type: "audio/pcm", rate: 24_000 },
          voice: "marin",
        },
      },
    });
    expect(POC_MODEL_ID).toBe("gpt-realtime-2.1");
    expect(POC_TRANSPORT).toBe("openai-webrtc");
  });

  it("accepts a bounded raw SDP offer and UUID path only", () => {
    expect(parseSessionId("019f45e3-5fac-7cd2-afeb-8069c2f813b3")).toBe(
      "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
    );
    expect(parseSessionId("not-a-session")).toBeNull();
    expect(parseRawSdp("v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n")).toBe(
      "v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n",
    );
    expect(parseRawSdp("{}")).toBeNull();
    expect(parseRawSdp("v=0\0")).toBeNull();
  });
});
