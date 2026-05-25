import { describe, expect, it } from "vitest";
import {
  normalizeTelefunWebSocketUrl,
  mapTelefunCloseEvent,
  buildTelefunLiveSetupMessage,
  buildRealtimeAudioMessage,
  extractGeminiInlineAudioChunks,
  parsePcmSampleRate,
  shouldSendRealtimeAudio,
} from "../routes/telefun/services/liveProtocol";

describe("telefun live protocol", () => {
  it("normalizes http(s) URLs to ws(s) URLs", () => {
    expect(normalizeTelefunWebSocketUrl("https://telefun.up.railway.app")).toBe(
      "wss://telefun.up.railway.app/",
    );
    expect(normalizeTelefunWebSocketUrl("http://localhost:3002")).toBe(
      "ws://localhost:3002/",
    );
    expect(normalizeTelefunWebSocketUrl("wss://telefun.up.railway.app/ws")).toBe(
      "wss://telefun.up.railway.app/ws",
    );
  });

  it("maps known close codes to Indonesian messages", () => {
    expect(mapTelefunCloseEvent({ code: 4001, reason: "" }).message).toContain(
      "sesi login",
    );
    expect(mapTelefunCloseEvent({ code: 4003, reason: "" }).message).toContain(
      "origin",
    );
    expect(mapTelefunCloseEvent({ code: 1006, reason: "" }).message).toContain(
      "terputus mendadak",
    );
    expect(mapTelefunCloseEvent({ code: 1011, reason: "" }).message).toContain(
      "Gemini",
    );
  });

  it("builds Gemini Live setup with telefunModelId and realtime input config", () => {
    const message = buildTelefunLiveSetupMessage({
      telefunModelId: "gemini-2.0-flash-exp",
      voiceName: "Aoede",
      systemInstruction: "ROLEPLAY TEST",
    });

    expect(message.setup.model).toBe("models/gemini-2.0-flash-exp");
    expect(message.setup.systemInstruction.parts[0].text).toBe("ROLEPLAY TEST");
    expect(message.setup.realtimeInputConfig.automaticActivityDetection.disabled).toBe(false);
    expect(message.setup.inputAudioTranscription).toEqual({});
  });

  it("builds realtime audio JSON with base64 pcm16 data", () => {
    const pcm16 = new Int16Array([1, -1, 32767]);
    const message = buildRealtimeAudioMessage(pcm16.buffer);

    expect(message.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
    expect(typeof message.realtimeInput.audio.data).toBe("string");
    expect(message.realtimeInput.audio.data.length).toBeGreaterThan(0);
  });

  it("does not use selectedModel as live voice model", () => {
    const message = buildTelefunLiveSetupMessage({
      telefunModelId: "gemini-2.0-flash-exp",
      voiceName: "Aoede",
      systemInstruction: "test",
    });
    expect(message.setup.model).not.toBe("models/openai-audio");
  });

  it("extracts Gemini inline audio chunks from JSON server messages", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const b64 = Buffer.from(bytes).toString("base64");

    const chunks = extractGeminiInlineAudioChunks({
      serverContent: {
        modelTurn: {
          parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: b64 } }],
        },
      },
    });

    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0].data)).toEqual([1, 2, 3, 4]);
    expect(chunks[0].sampleRate).toBe(24000);
  });

  it("defaults Gemini output PCM sample rate to 24000", () => {
    expect(parsePcmSampleRate(undefined)).toBe(24000);
    expect(parsePcmSampleRate("audio/pcm;rate=16000")).toBe(16000);
  });

  it("does not send realtime audio before setupComplete", () => {
    expect(
      shouldSendRealtimeAudio({
        wsReady: true,
        setupComplete: false,
        muted: false,
        held: false,
      }),
    ).toBe(false);

    expect(
      shouldSendRealtimeAudio({
        wsReady: true,
        setupComplete: true,
        muted: false,
        held: false,
      }),
    ).toBe(true);
  });
});
