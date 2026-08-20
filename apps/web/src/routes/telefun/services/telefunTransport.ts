import type { SessionMetrics } from "@trainers/types";
import type { TelefunAppSettings } from "../telefunSettings";
import { normalizeTelefunBrowserSelection } from "../telefunSettings";
import type { TelefunSessionState, TelefunTimelineEvent } from "../types";
import { LiveSession } from "./liveSession";
import { deleteOpenAIWebRtcBrokerCall } from "./openaiWebRtc/brokerApi";
import { OPENAI_WEBRTC_DEFAULT_DELETE_TIMEOUT_MS } from "./openaiWebRtc/contracts";

export type TelefunEndReason = "user" | "timeout" | "cleanup";

export type GeminiRecordingCompleteCallback = (
  url: string | null,
  fullBlob: Blob | null,
  agentBlob: Blob | null,
  metrics: SessionMetrics,
) => void;

/** Explicit active transport surface implemented by the Gemini Live session. */
export interface GeminiTelefunTransportSession {
  connect(accessToken: string): Promise<void>;
  setMute(muted: boolean): void;
  setHold(held: boolean): void;
  sendTimeCue(remainingSeconds: number): void;
  disconnect(reason: TelefunEndReason): Promise<void>;
  onStatusChange: (status: string) => void;
  onStateChange: (state: TelefunSessionState) => void;
  onError: (error: Error) => void;
  onAiSpeaking: (speaking: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onTimelineEvent: (event: TelefunTimelineEvent) => void;
  onSessionCreated: (sessionId: string) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onPlaybackBlocked: () => void;
  onRecordingComplete: GeminiRecordingCompleteCallback;
  retryPlayback(): Promise<boolean>;
}

export type TelefunTransportSession = GeminiTelefunTransportSession;

export function deriveTelefunBrokerHttpBaseUrl(websocketUrl: string): string {
  const url = new URL(websocketUrl);
  if (url.protocol === "ws:") url.protocol = "http:";
  else if (url.protocol === "wss:") url.protocol = "https:";
  else throw new Error("VITE_TELEFUN_WS_URL must use ws or wss.");
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/ws\/?$/, "").replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

class TelefunCleanupPendingError extends Error {
  readonly code = "cleanup_pending";

  constructor() {
    super("OpenAI WebRTC cleanup timed out.");
  }
}

/** DELETE-only compatibility for an already owner-bound historical call. */
export async function cleanupOpenAIWebRtcSession(input: {
  websocketUrl: string;
  sessionId: string;
  accessToken: string;
  fetch: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<void> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  if (input.signal?.aborted) controller.abort();
  input.signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeoutMs = Number.isFinite(input.timeoutMs)
    ? Math.max(100, Math.floor(input.timeoutMs!))
    : OPENAI_WEBRTC_DEFAULT_DELETE_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const request = deleteOpenAIWebRtcBrokerCall({
    fetch: input.fetch,
    brokerHttpBaseUrl: deriveTelefunBrokerHttpBaseUrl(input.websocketUrl),
    sessionId: input.sessionId,
    accessToken: input.accessToken,
    outcome: "failed",
    signal: controller.signal,
  });
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new TelefunCleanupPendingError());
    }, timeoutMs);
  });
  try {
    await Promise.race([request, deadline]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", forwardAbort);
  }
}

export const TELEFUN_MIC_ERROR_MESSAGE =
  "Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.";
export const TELEFUN_CLEANUP_ERROR_MESSAGE =
  "Panggilan belum tersimpan. Coba lagi untuk mengakhiri.";
export const TELEFUN_CONNECTION_TIMEOUT_MESSAGE =
  "Waktu menghubungkan panggilan habis. Periksa koneksi internet dan coba lagi.";
export const TELEFUN_UNKNOWN_ERROR_MESSAGE =
  "Panggilan belum dapat dimulai. Silakan coba lagi.";

type TelefunTransportErrorDetails = {
  name?: string;
  code?: string;
  message: string;
};

function readStringProperty(value: object, key: string): string | undefined {
  try {
    const property = Reflect.get(value, key);
    return typeof property === "string" ? property : undefined;
  } catch {
    return undefined;
  }
}

function readTransportError(error: unknown): TelefunTransportErrorDetails {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: readStringProperty(error, "code"),
    };
  }
  if (error && typeof error === "object") {
    return {
      name: readStringProperty(error, "name"),
      message: readStringProperty(error, "message") ?? "",
      code: readStringProperty(error, "code"),
    };
  }
  return { message: "" };
}

export function mapTelefunTransportError(error: unknown): string {
  const details = readTransportError(error);
  if (
    [
      "NotAllowedError",
      "NotFoundError",
      "NotReadableError",
      "OverconstrainedError",
    ].includes(details.name ?? "") ||
    details.code === "microphone_access_failed" ||
    details.code === "device_unplugged"
  ) {
    return TELEFUN_MIC_ERROR_MESSAGE;
  }
  if (
    details.code === "cleanup_pending" ||
    details.code === "broker_finalization" ||
    details.message.toLowerCase().includes("cleanup")
  ) {
    return TELEFUN_CLEANUP_ERROR_MESSAGE;
  }
  if (
    details.code === "connection_timeout" ||
    details.message.toLowerCase().includes("timed out")
  ) {
    return TELEFUN_CONNECTION_TIMEOUT_MESSAGE;
  }
  return TELEFUN_UNKNOWN_ERROR_MESSAGE;
}

export function createTelefunTransport(
  config: TelefunAppSettings,
  _options: { accessToken: string },
): GeminiTelefunTransportSession {
  const selection = normalizeTelefunBrowserSelection(
    config.telefunModelId,
    config.telefunTransport,
  );
  const session: GeminiTelefunTransportSession = new LiveSession({
    ...config,
    telefunModelId: selection.model.id,
    telefunTransport: "gemini-live",
  });
  return session;
}
