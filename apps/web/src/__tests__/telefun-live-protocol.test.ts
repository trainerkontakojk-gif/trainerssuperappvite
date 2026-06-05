import { describe, expect, it } from "vitest";
import {
  normalizeTelefunWebSocketUrl,
  mapTelefunCloseEvent,
  buildTelefunLiveSetupMessage,
  buildRealtimeAudioMessage,
  float32ToPcm16Buffer,
  extractGeminiInlineAudioChunks,
  parsePcmSampleRate,
  shouldSendRealtimeAudio,
  shouldReportTelefunCloseError,
  processInputAudioFrame,
} from "../routes/telefun/services/liveProtocol";
import { resolveFinalIdentity } from "../routes/telefun/telefunSettings";
import {
  resolveGeminiLiveVoice,
  GEMINI_LIVE_VOICES_BY_GENDER,
} from "../routes/telefun/telefunVoiceRegistry";

describe("telefun live protocol", () => {
  it("normalizes http(s) URLs to ws(s) URLs", () => {
    expect(normalizeTelefunWebSocketUrl("https://telefun.up.railway.app")).toBe(
      "wss://telefun.up.railway.app/",
    );
    expect(normalizeTelefunWebSocketUrl("http://localhost:3002")).toBe(
      "ws://localhost:3002/",
    );
    expect(
      normalizeTelefunWebSocketUrl("wss://telefun.up.railway.app/ws"),
    ).toBe("wss://telefun.up.railway.app/ws");
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

  it("maps normal client close without surfacing a WebSocket error", () => {
    const mapped = mapTelefunCloseEvent({
      code: 1000,
      reason: "Client ended Telefun session",
    });

    expect(mapped.severity).toBe("normal");
    expect(mapped.message).toContain("selesai");
  });

  it("maps browser 1005 to a diagnostic network message", () => {
    const mapped = mapTelefunCloseEvent({ code: 1005, reason: "" });

    expect(mapped.severity).toBe("network");
    expect(mapped.message).toContain("tanpa status");
    expect(mapped.message).toContain("1005");
  });

  it("does not report close errors for intentional or normal close events", () => {
    expect(
      shouldReportTelefunCloseError({
        intentionalClose: true,
        severity: "network",
      }),
    ).toBe(false);

    expect(
      shouldReportTelefunCloseError({
        intentionalClose: false,
        severity: "normal",
      }),
    ).toBe(false);

    expect(
      shouldReportTelefunCloseError({
        intentionalClose: false,
        severity: "network",
      }),
    ).toBe(true);
  });

  it("builds Gemini Live setup with telefunModelId and realtime input config", () => {
    const message = buildTelefunLiveSetupMessage({
      telefunModelId: "gemini-2.0-flash-exp",
      voiceName: "Aoede",
      systemInstruction: "ROLEPLAY TEST",
    });

    expect(message.setup.model).toBe("models/gemini-2.0-flash-exp");
    expect(message.setup.systemInstruction.parts[0].text).toBe("ROLEPLAY TEST");
    expect(
      message.setup.realtimeInputConfig.automaticActivityDetection.disabled,
    ).toBe(false);
    expect(message.setup.inputAudioTranscription).toEqual({});
  });

  it("builds realtime audio JSON with base64 pcm16 data", () => {
    const pcm16 = new Int16Array([1, -1, 32767]);
    const message = buildRealtimeAudioMessage(pcm16.buffer);

    expect(message.realtimeInput.audio.mimeType).toBe("audio/pcm;rate=16000");
    expect(typeof message.realtimeInput.audio.data).toBe("string");
    expect(message.realtimeInput.audio.data.length).toBeGreaterThan(0);
  });

  it("float32ToPcm16Buffer converts Float32 audio to PCM16 ArrayBuffer", () => {
    const input = new Float32Array([0.5, -0.5, 0.0, 1.0, -1.0]);
    const buffer = float32ToPcm16Buffer(input);
    const pcm16 = new Int16Array(buffer);

    expect(pcm16.length).toBe(5);
    expect(pcm16[0]).toBe(16383); // Math.trunc(0.5 * 32767)
    expect(pcm16[1]).toBe(-16383); // Math.trunc(-0.5 * 32767)
    expect(pcm16[2]).toBe(0); // 0.0
    expect(pcm16[3]).toBe(32767); // 1.0 * 32767
    expect(pcm16[4]).toBe(-32767); // -1.0 * 32767
  });

  it("float32ToPcm16Buffer clamps values outside [-1, 1]", () => {
    const input = new Float32Array([2.0, -2.0]);
    const buffer = float32ToPcm16Buffer(input);
    const pcm16 = new Int16Array(buffer);

    expect(pcm16[0]).toBe(32767); // clamped to 1.0 * 32767
    expect(pcm16[1]).toBe(-32767); // clamped to -1.0 * 32767
  });

  it("buildRealtimeAudioMessage with float32 input produces valid base64 that can be decoded", () => {
    const input = new Float32Array([0.25, -0.25]);
    const buffer = float32ToPcm16Buffer(input);
    const message = buildRealtimeAudioMessage(buffer);

    const base64 = message.realtimeInput.audio.data;
    const decoded = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const view = new DataView(decoded.buffer);
    expect(view.getInt16(0, true)).toBe(8191); // Math.trunc(0.25 * 32767)
    expect(view.getInt16(2, true)).toBe(-8191); // Math.trunc(-0.25 * 32767)
  });

  it("enables Gemini Live session resumption and context compression", () => {
    const message = buildTelefunLiveSetupMessage({
      telefunModelId: "gemini-3.1-flash-live-preview",
      voiceName: "Aoede",
      systemInstruction: "ROLEPLAY TEST",
    });

    expect(message.setup.sessionResumption).toEqual({});
    expect(message.setup.contextWindowCompression).toEqual({
      slidingWindow: {},
    });
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
          parts: [
            { inlineData: { mimeType: "audio/pcm;rate=24000", data: b64 } },
          ],
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

  it("uses a Gemini-valid male voice when saved settings contain Ursa", () => {
    const identity = resolveFinalIdentity({
      displayName: "Rudi",
      gender: "male",
      phoneNumber: "0811",
      city: "Jakarta",
      signatureName: "",
      voiceName: "Ursa",
    });

    const safeVoice = resolveGeminiLiveVoice({
      requestedVoice: identity.voiceName,
      gender: identity.gender as "male" | "female",
    });

    const message = buildTelefunLiveSetupMessage({
      telefunModelId: "gemini-3.1-flash-live-preview",
      voiceName: safeVoice,
      systemInstruction: "test",
    });

    expect(
      message.setup.generationConfig.speechConfig.voiceConfig
        .prebuiltVoiceConfig.voiceName,
    ).not.toBe("Ursa");
    expect(GEMINI_LIVE_VOICES_BY_GENDER.male).toContain(
      message.setup.generationConfig.speechConfig.voiceConfig
        .prebuiltVoiceConfig.voiceName,
    );
  });

  it("uses a Gemini-valid male voice when saved settings contain Dipper", () => {
    const identity = resolveFinalIdentity({
      displayName: "Budi",
      gender: "male",
      phoneNumber: "0812",
      city: "Bandung",
      signatureName: "",
      voiceName: "Dipper",
    });

    const safeVoice = resolveGeminiLiveVoice({
      requestedVoice: identity.voiceName,
      gender: identity.gender as "male" | "female",
    });

    const message = buildTelefunLiveSetupMessage({
      telefunModelId: "gemini-3.1-flash-live-preview",
      voiceName: safeVoice,
      systemInstruction: "test",
    });

    expect(
      message.setup.generationConfig.speechConfig.voiceConfig
        .prebuiltVoiceConfig.voiceName,
    ).not.toBe("Dipper");
    expect(GEMINI_LIVE_VOICES_BY_GENDER.male).toContain(
      message.setup.generationConfig.speechConfig.voiceConfig
        .prebuiltVoiceConfig.voiceName,
    );
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

  it("processes audio input frames into volume and pcm16 data", () => {
    const result = processInputAudioFrame(new Float32Array([0, 0.5, -0.5, 1]));

    expect(result.volume).toBeGreaterThan(0);
    expect(result.volumeBucket).toBeGreaterThanOrEqual(0);
    expect(result.isSilent).toBe(false);
    expect(new Int16Array(result.pcm16Buffer)).toHaveLength(4);
  });
});
