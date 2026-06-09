export function normalizeTelefunWebSocketUrl(
  rawUrl: string | undefined,
): string {
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
    throw new Error(
      "VITE_TELEFUN_WS_URL harus berupa URL WebSocket yang valid.",
    );
  }
}

export const TELEFUN_CLIENT_CLOSE_CODE = 1000;
export const TELEFUN_CLIENT_CLOSE_REASON = "Client ended Telefun session";

export function mapTelefunCloseEvent(event: {
  code: number;
  reason?: string;
}): {
  code: number;
  message: string;
  severity: "normal" | "auth" | "config" | "network" | "upstream" | "unknown";
} {
  if (event.code === 1000) {
    return {
      code: event.code,
      severity: "normal",
      message: "Panggilan Telefun selesai.",
    };
  }
  if (event.code === 1005) {
    return {
      code: event.code,
      severity: "network",
      message:
        "Koneksi WebSocket ditutup tanpa status dari server (1005). Cek service Telefun, Railway proxy, dan koneksi ke Gemini.",
    };
  }
  if (event.code === 4001) {
    return {
      code: event.code,
      severity: "auth",
      message:
        "Koneksi WebSocket ditolak: sesi login tidak valid. Silakan login ulang.",
    };
  }
  if (event.code === 4003) {
    return {
      code: event.code,
      severity: "config",
      message:
        "Koneksi WebSocket ditolak: origin Web belum diizinkan di Telefun Railway.",
    };
  }
  if (event.code === 1006) {
    return {
      code: event.code,
      severity: "network",
      message:
        "Koneksi WebSocket terputus mendadak (1006). Pastikan service Telefun Railway aktif dan URL WebSocket benar.",
    };
  }
  if (event.code === 1011) {
    return {
      code: event.code,
      severity: "upstream",
      message:
        "Koneksi WebSocket gagal: server Telefun tidak bisa terhubung ke Gemini.",
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

export function shouldReportTelefunCloseError(params: {
  intentionalClose: boolean;
  severity: ReturnType<typeof mapTelefunCloseEvent>["severity"];
}): boolean {
  return !params.intentionalClose && params.severity !== "normal";
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
      outputAudioTranscription: {},
      sessionResumption: {},
      contextWindowCompression: {
        slidingWindow: {},
      },
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

export type SessionEndReason = "user" | "timeout" | "cleanup";
export type SessionEndOutcome =
  | "turn_complete"
  | "quiet_timeout"
  | "hard_timeout";

export function buildSessionEndRequest(reason: SessionEndReason) {
  return { type: "session_end_request" as const, reason };
}

export function isSessionEndCompleteMessage(
  value: unknown,
): value is { type: "session_end_complete"; outcome: SessionEndOutcome } {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "session_end_complete" &&
    (message.outcome === "turn_complete" ||
      message.outcome === "quiet_timeout" ||
      message.outcome === "hard_timeout")
  );
}

export function buildAudioStreamEndMessage() {
  return {
    realtimeInput: {
      audioStreamEnd: true,
    },
  };
}

export function parsePcmSampleRate(
  mimeType: string | undefined,
  fallback = 24000,
): number {
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

export function processInputAudioFrame(inputData: Float32Array): {
  volume: number;
  volumeBucket: number;
  isSilent: boolean;
  pcm16Buffer: ArrayBuffer;
} {
  let sum = 0;
  for (let i = 0; i < inputData.length; i += 1) {
    sum += inputData[i] * inputData[i];
  }
  const rms = Math.sqrt(sum / inputData.length);
  const volume = Math.min(100, Math.floor(rms * 200));
  return {
    volume,
    volumeBucket: Math.floor(volume / 10),
    isSilent: volume <= 10,
    pcm16Buffer: float32ToPcm16Buffer(inputData),
  };
}

export function shouldSendRealtimeAudio(params: {
  wsReady: boolean;
  setupComplete: boolean;
  muted: boolean;
  held: boolean;
}): boolean {
  return (
    params.wsReady && params.setupComplete && !params.muted && !params.held
  );
}
