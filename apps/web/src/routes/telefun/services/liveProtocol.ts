export function normalizeTelefunWebSocketUrl(rawUrl: string | undefined): string {
  if (!rawUrl?.trim()) {
    throw new Error("VITE_TELEFUN_WS_URL belum dikonfigurasi.");
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:") url.protocol = "wss:";
    if (url.protocol === "http:") url.protocol = "ws:";
    if (url.protocol !== "wss:" && url.protocol !== "ws:") {
      throw new Error("Invalid WebSocket protocol");
    }
    return url.toString();
  } catch {
    throw new Error("VITE_TELEFUN_WS_URL harus berupa URL WebSocket yang valid.");
  }
}

export function mapTelefunCloseEvent(event: {
  code: number;
  reason?: string;
}): { code: number; message: string; severity: "auth" | "config" | "network" | "upstream" | "unknown" } {
  if (event.code === 4001) {
    return {
      code: event.code,
      severity: "auth",
      message: "Koneksi WebSocket ditolak: sesi login tidak valid. Silakan login ulang.",
    };
  }
  if (event.code === 4003) {
    return {
      code: event.code,
      severity: "config",
      message: "Koneksi WebSocket ditolak: origin Web belum diizinkan di Telefun Railway.",
    };
  }
  if (event.code === 1006) {
    return {
      code: event.code,
      severity: "network",
      message: "Koneksi WebSocket terputus mendadak (1006). Pastikan service Telefun Railway aktif dan URL WebSocket benar.",
    };
  }
  if (event.code === 1011) {
    return {
      code: event.code,
      severity: "upstream",
      message: "Koneksi WebSocket gagal: server Telefun tidak bisa terhubung ke Gemini.",
    };
  }
  return {
    code: event.code,
    severity: "unknown",
    message: event.reason
      ? `Koneksi WebSocket ditutup: ${event.reason}`
      : `Koneksi WebSocket ditutup dengan kode ${event.code}.`,
  };
}

export function buildTelefunLiveSetupMessage(params: {
  telefunModelId: string;
  voiceName: string;
  systemInstruction: string;
}) {
  return {
    setup: {
      model: `models/${params.telefunModelId}`,
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: params.voiceName },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: params.systemInstruction }],
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 300,
          silenceDurationMs: 950,
        },
        turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY",
      },
      inputAudioTranscription: {},
    },
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function float32ToPcm16Buffer(inputData: Float32Array): ArrayBuffer {
  const pcm16 = new Int16Array(inputData.length);
  for (let i = 0; i < inputData.length; i += 1) {
    pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
  }
  return pcm16.buffer;
}

export function buildRealtimeAudioMessage(buffer: ArrayBuffer) {
  return {
    realtimeInput: {
      audio: {
        mimeType: "audio/pcm;rate=16000",
        data: arrayBufferToBase64(buffer),
      },
    },
  };
}

export function buildAudioStreamEndMessage() {
  return {
    realtimeInput: {
      audioStreamEnd: true,
    },
  };
}

export function parsePcmSampleRate(mimeType: string | undefined, fallback = 24000): number {
  const match = mimeType?.match(/rate=(\d+)/i);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const decodeBase64 =
  typeof atob === "function"
    ? atob
    : (value: string) => Buffer.from(value, "base64").toString("binary");

export function base64ToUint8Array(value: string): Uint8Array {
  const binary = decodeBase64(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function extractGeminiInlineAudioChunks(message: unknown): Array<{
  data: Uint8Array;
  sampleRate: number;
}> {
  const parts = (message as any)?.serverContent?.modelTurn?.parts;
  if (!Array.isArray(parts)) return [];

  return parts
    .map((part) => {
      const inlineData = part?.inlineData;
      if (!inlineData?.data || typeof inlineData.data !== "string") return null;
      return {
        data: base64ToUint8Array(inlineData.data),
        sampleRate: parsePcmSampleRate(inlineData.mimeType),
      };
    })
    .filter(Boolean) as Array<{ data: Uint8Array; sampleRate: number }>;
}

export function shouldSendRealtimeAudio(params: {
  wsReady: boolean;
  setupComplete: boolean;
  muted: boolean;
  held: boolean;
}): boolean {
  return params.wsReady && params.setupComplete && !params.muted && !params.held;
}

