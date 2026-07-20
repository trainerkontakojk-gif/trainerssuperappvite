import {
  getTelefunLiveModel,
  normalizeTelefunLiveModelSelection,
  TELEFUN_CONFIGURATION_CLOSE_CODE,
} from "@trainers/types";
import type { TelefunSessionConfigure } from "@trainers/types";
import { isVoiceValidForModel } from "../../telefunVoiceRegistry";

export function getTelefunAudioConfiguration(
  modelId: string | null | undefined,
) {
  const selected = normalizeTelefunLiveModelSelection(modelId).model;
  return {
    transport: selected.realtime.transport,
    inputSampleRateHz: selected.realtime.inputSampleRateHz,
    outputSampleRateHz: selected.realtime.outputSampleRateHz,
  };
}

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

export interface TelefunAuthMessage {
  type: "authenticate";
  token: string;
  sessionId?: string;
}

export function buildTelefunAuthMessage(
  token: string,
  sessionId?: string,
): TelefunAuthMessage {
  return {
    type: "authenticate",
    token,
    ...(sessionId ? { sessionId } : {}),
  };
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
        "Koneksi WebSocket ditutup tanpa status dari server (1005). Cek service Telefun, Railway proxy, dan koneksi layanan suara.",
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
  if (event.code === TELEFUN_CONFIGURATION_CLOSE_CODE) {
    return {
      code: event.code,
      severity: "config",
      message: event.reason
        ? `Konfigurasi sesi Telefun ditolak: ${event.reason}`
        : "Konfigurasi sesi Telefun ditolak oleh server.",
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
        "Koneksi WebSocket gagal: server Telefun tidak bisa terhubung ke provider realtime.",
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
  if (!isRecord(value)) return false;
  return (
    value.type === "session_end_complete" &&
    (value.outcome === "turn_complete" ||
      value.outcome === "quiet_timeout" ||
      value.outcome === "hard_timeout")
  );
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
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

export function buildTelefunSessionConfigure(params: {
  modelId: string;
  voice: string;
  instructions: string;
  responsePacingMode: TelefunSessionConfigure["responsePacingMode"];
}): TelefunSessionConfigure {
  const model = getTelefunLiveModel(params.modelId);
  if (!model) {
    throw new Error(`Model Telefun tidak dikenal: ${params.modelId}`);
  }
  if (!isVoiceValidForModel(model.id, params.voice)) {
    throw new Error(
      `Voice ${params.voice} tidak kompatibel dengan model ${model.id}`,
    );
  }
  const sampleRate = model.realtime.inputSampleRateHz;
  if (sampleRate !== 16000 && sampleRate !== 24000) {
    throw new Error(`Sample rate model Telefun tidak didukung: ${sampleRate}`);
  }

  return {
    type: "telefun_session_configure",
    modelId: model.id,
    transport: model.realtime.transport,
    voice: params.voice,
    instructions: params.instructions,
    inputAudio: { format: "pcm16", sampleRate },
    responsePacingMode: params.responsePacingMode,
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function normalizeNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

export type NormalizedOpenAiRealtimeEvent =
  | {
      kind: "session_created" | "session_updated";
      sessionId: string;
      model?: string;
    }
  | {
      kind: "speech_started";
      audioStartMs: number;
      itemId?: string;
    }
  | {
      kind: "speech_stopped";
      audioEndMs: number;
      itemId?: string;
    }
  | {
      kind: "response_created";
      responseId: string;
      status: string;
    }
  | {
      kind: "audio_delta";
      data: Uint8Array;
      sampleRate: 24000;
      responseId?: string;
      itemId?: string;
    }
  | {
      kind: "transcript_delta";
      delta: string;
      responseId?: string;
      itemId?: string;
    }
  | {
      kind: "transcript_done";
      transcript: string;
      responseId?: string;
      itemId?: string;
    }
  | {
      kind: "turn_complete";
      responseId: string;
      status: string;
      usage?: unknown;
    }
  | { kind: "response_cancelled"; responseId?: string }
  | {
      kind: "error";
      errorType?: string;
      code?: string;
      message: string;
    }
  | { kind: "unknown"; eventType: string }
  | { kind: "invalid" };
