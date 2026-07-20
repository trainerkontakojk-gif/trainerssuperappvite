import { describe, expect, it } from "vitest";
import {
  isGeminiForwardableMessage,
  isGeminiSetupMessage,
  hasGeminiSetupComplete,
  getGeminiGoAwayTimeLeftSeconds,
  getSessionResumptionHandle,
  buildGeminiReconnectSetupMessage,
  isCurrentGeminiSocket,
  extractGeminiTranscriptionChunks,
  parseControlMessage,
  isTelefunControlEnvelope,
  isSessionEndRequest,
  isSessionEndComplete,
  parseTelefunAuthMessage,
  parseTelefunSessionConfigure,
  TELEFUN_MAX_INSTRUCTIONS_LENGTH,
} from "./server-protocol.js";
import { TELEFUN_CONFIGURATION_CLOSE_CODE } from "@trainers/types";

const validGeminiConfigure = {
  type: "telefun_session_configure",
  modelId: "gemini-3.1-flash-live-preview",
  transport: "gemini-live",
  voice: "Kore",
  instructions: "Layani nasabah secara natural.",
  inputAudio: { format: "pcm16", sampleRate: 16000 },
  responsePacingMode: "realistic",
} as const;

describe("telefun proxy protocol", () => {
  describe("provider-neutral session configure", () => {
    it("accepts a canonical Gemini configure and returns typed model metadata", () => {
      const result = parseTelefunSessionConfigure(validGeminiConfigure);

      expect(result).toMatchObject({
        ok: true,
        value: {
          configure: validGeminiConfigure,
          model: {
            id: "gemini-3.1-flash-live-preview",
            provider: "gemini",
            realtime: {
              transport: "gemini-live",
              inputSampleRateHz: 16000,
            },
          },
        },
      });
      expect(TELEFUN_CONFIGURATION_CLOSE_CODE).toBe(4002);
    });

    it.each([
      [
        "unknown model",
        { ...validGeminiConfigure, modelId: "gemini-live-unknown" },
        "unknown_model",
      ],
      [
        "transport mismatch",
        { ...validGeminiConfigure, transport: "openai-audio" },
        "model_transport_mismatch",
      ],
      [
        "provider-incompatible voice",
        { ...validGeminiConfigure, voice: "marin" },
        "invalid_voice",
      ],
      [
        "audio format",
        {
          ...validGeminiConfigure,
          inputAudio: { format: "opus", sampleRate: 16000 },
        },
        "invalid_audio_format",
      ],
      [
        "non-canonical sample rate",
        {
          ...validGeminiConfigure,
          inputAudio: { format: "pcm16", sampleRate: 24000 },
        },
        "invalid_sample_rate",
      ],
      [
        "pacing mode",
        { ...validGeminiConfigure, responsePacingMode: "turbo" },
        "invalid_response_pacing_mode",
      ],
      [
        "empty instructions",
        { ...validGeminiConfigure, instructions: "   " },
        "invalid_instructions",
      ],
      [
        "oversized instructions",
        {
          ...validGeminiConfigure,
          instructions: "x".repeat(TELEFUN_MAX_INSTRUCTIONS_LENGTH + 1),
        },
        "invalid_instructions",
      ],
    ])("rejects %s with a stable reason", (_label, value, reason) => {
      expect(parseTelefunSessionConfigure(value)).toEqual({
        ok: false,
        reason,
      });
    });

    it("accepts only the canonical OpenAI pair, voice, and 24 kHz rate", () => {
      expect(
        parseTelefunSessionConfigure({
          ...validGeminiConfigure,
          modelId: "gpt-realtime-2.1-mini",
          transport: "openai-audio",
          voice: "cedar",
          inputAudio: { format: "pcm16", sampleRate: 24000 },
          responsePacingMode: "training_fast",
        }),
      ).toMatchObject({
        ok: true,
        value: {
          model: { id: "gpt-realtime-2.1-mini", provider: "openai" },
        },
      });
    });

    it.each([
      null,
      [],
      {},
      { type: "telefun_session_configure" },
      { ...validGeminiConfigure, inputAudio: null },
    ])("rejects malformed envelope %#", (value) => {
      expect(parseTelefunSessionConfigure(value)).toEqual({
        ok: false,
        reason: "invalid_envelope",
      });
    });
  });

  it("parses a valid first-message authentication frame", () => {
    expect(
      parseTelefunAuthMessage({
        type: "authenticate",
        token: "token-1",
        sessionId: "session-1",
      }),
    ).toEqual({
      type: "authenticate",
      token: "token-1",
      sessionId: "session-1",
    });
  });

  it("rejects malformed, empty, or non-authentication frames", () => {
    expect(
      parseTelefunAuthMessage({ type: "authenticate", token: "" }),
    ).toBeNull();
    expect(
      parseTelefunAuthMessage({
        type: "authenticate",
        token: "token-1",
        sessionId: "",
      }),
    ).toBeNull();
    expect(parseTelefunAuthMessage({ setup: {} })).toBeNull();
    expect(parseTelefunAuthMessage(null)).toBeNull();
  });

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

  it("builds reconnect setup with latest resumable handle and preserves setup fields", () => {
    const cachedSetup = JSON.stringify({
      setup: {
        model: "models/gemini-3.1-flash-live-preview",
        generationConfig: { responseModalities: ["AUDIO"] },
        systemInstruction: { parts: [{ text: "ROLEPLAY" }] },
        sessionResumption: {},
        contextWindowCompression: { slidingWindow: {} },
      },
    });

    const reconnect = buildGeminiReconnectSetupMessage(
      cachedSetup,
      "handle-latest",
    );

    expect(reconnect).not.toBeNull();
    const parsed = JSON.parse(reconnect!);
    expect(parsed.setup.model).toBe("models/gemini-3.1-flash-live-preview");
    expect(parsed.setup.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(parsed.setup.systemInstruction.parts[0].text).toBe("ROLEPLAY");
    expect(parsed.setup.contextWindowCompression).toEqual({
      slidingWindow: {},
    });
    expect(parsed.setup.sessionResumption).toEqual({
      handle: "handle-latest",
    });
  });

  it("ignores events emitted by a stale Gemini socket after reconnect", () => {
    const staleSocket = {};
    const currentSocket = {};

    expect(isCurrentGeminiSocket(currentSocket, currentSocket)).toBe(true);
    expect(isCurrentGeminiSocket(currentSocket, staleSocket)).toBe(false);
  });

  it("extracts input transcription as agent speaker", () => {
    const chunks = extractGeminiTranscriptionChunks({
      serverContent: {
        inputTranscription: { text: "Selamat pagi" },
        turnComplete: false,
      },
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].speaker).toBe("agent");
    expect(chunks[0].text).toBe("Selamat pagi");
  });

  it("extracts output transcription as consumer speaker", () => {
    const chunks = extractGeminiTranscriptionChunks({
      serverContent: {
        outputTranscription: {
          text: "Selamat pagi mas, ada yang bisa dibantu?",
        },
        turnComplete: true,
      },
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].speaker).toBe("consumer");
    expect(chunks[0].text).toBe("Selamat pagi mas, ada yang bisa dibantu?");
  });

  it("extracts input and output transcription together when both present", () => {
    const chunks = extractGeminiTranscriptionChunks({
      serverContent: {
        inputTranscription: { text: "Halo" },
        outputTranscription: { text: "Halo, ada yang bisa dibantu?" },
        turnComplete: false,
      },
    });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].speaker).toBe("agent");
    expect(chunks[1].speaker).toBe("consumer");
  });

  it("returns empty array for malformed payload", () => {
    expect(extractGeminiTranscriptionChunks(null)).toEqual([]);
    expect(extractGeminiTranscriptionChunks("string")).toEqual([]);
    expect(extractGeminiTranscriptionChunks({})).toEqual([]);
  });

  it("ignores empty or whitespace-only transcription text", () => {
    const chunks = extractGeminiTranscriptionChunks({
      serverContent: {
        inputTranscription: { text: "" },
        outputTranscription: { text: "   " },
      },
    });
    expect(chunks).toHaveLength(0);
  });

  it("preserves significant whitespace in streaming fragments", () => {
    const chunks = extractGeminiTranscriptionChunks({
      serverContent: {
        outputTranscription: { text: " pagi" },
      },
    });

    expect(chunks[0].text).toBe(" pagi");
  });

  it("ignores modelTurn text as it is not transcription", () => {
    const chunks = extractGeminiTranscriptionChunks({
      serverContent: {
        modelTurn: {
          parts: [{ text: "some text" }],
        },
      },
    });
    expect(chunks).toHaveLength(0);
  });

  describe("control messages", () => {
    it("parses a valid session_end_request", () => {
      const msg = parseControlMessage({
        type: "session_end_request",
        reason: "user",
      });
      expect(msg).not.toBeNull();
      if (msg) {
        expect(isSessionEndRequest(msg)).toBe(true);
        expect(msg.type).toBe("session_end_request");
        expect((msg as any).reason).toBe("user");
      }
    });

    it("parses a valid session_end_complete", () => {
      const msg = parseControlMessage({
        type: "session_end_complete",
        outcome: "turn_complete",
      });
      expect(msg).not.toBeNull();
      if (msg) {
        expect(isSessionEndComplete(msg)).toBe(true);
        expect(msg.type).toBe("session_end_complete");
        expect((msg as any).outcome).toBe("turn_complete");
      }
    });

    it("returns null for unknown message type", () => {
      expect(
        parseControlMessage({ type: "realtimeInput", realtimeInput: {} }),
      ).toBeNull();
      expect(
        parseControlMessage({ type: "serverContent", serverContent: {} }),
      ).toBeNull();
      expect(parseControlMessage({ type: "unknown" })).toBeNull();
    });

    it("returns null for invalid session_end_request reason", () => {
      expect(
        parseControlMessage({
          type: "session_end_request",
          reason: "invalid",
        }),
      ).toBeNull();
      expect(parseControlMessage({ type: "session_end_request" })).toBeNull();
    });

    it("returns null for invalid session_end_complete outcome", () => {
      expect(
        parseControlMessage({
          type: "session_end_complete",
          outcome: "invalid",
        }),
      ).toBeNull();
    });

    it("detects malformed Telefun control envelopes for fail-closed handling", () => {
      expect(
        isTelefunControlEnvelope({
          type: "session_end_request",
          reason: "invalid",
        }),
      ).toBe(true);
      expect(
        isTelefunControlEnvelope({
          type: "session_end_complete",
          outcome: "invalid",
        }),
      ).toBe(true);
      expect(isTelefunControlEnvelope({ realtimeInput: { audio: {} } })).toBe(
        false,
      );
    });

    it("returns null for non-object input", () => {
      expect(parseControlMessage(null)).toBeNull();
      expect(parseControlMessage("string")).toBeNull();
      expect(parseControlMessage(42)).toBeNull();
    });

    it("isSessionEndRequest and isSessionEndComplete type guards", () => {
      const req = parseControlMessage({
        type: "session_end_request",
        reason: "timeout",
      });
      const complete = parseControlMessage({
        type: "session_end_complete",
        outcome: "quiet_timeout",
      });

      expect(req).not.toBeNull();
      expect(complete).not.toBeNull();

      if (req) {
        expect(isSessionEndRequest(req)).toBe(true);
        expect(isSessionEndComplete(req)).toBe(false);
      }
      if (complete) {
        expect(isSessionEndComplete(complete)).toBe(true);
        expect(isSessionEndRequest(complete)).toBe(false);
      }
    });

    it("accepts all valid reasons for session_end_request", () => {
      for (const reason of ["user", "timeout", "cleanup"] as const) {
        const msg = parseControlMessage({
          type: "session_end_request",
          reason,
        });
        expect(msg).not.toBeNull();
        if (msg) {
          expect(isSessionEndRequest(msg)).toBe(true);
          expect((msg as any).reason).toBe(reason);
        }
      }
    });

    it("accepts all valid outcomes for session_end_complete", () => {
      for (const outcome of [
        "turn_complete",
        "quiet_timeout",
        "hard_timeout",
      ] as const) {
        const msg = parseControlMessage({
          type: "session_end_complete",
          outcome,
        });
        expect(msg).not.toBeNull();
        if (msg) {
          expect(isSessionEndComplete(msg)).toBe(true);
          expect((msg as any).outcome).toBe(outcome);
        }
      }
    });
  });
});
