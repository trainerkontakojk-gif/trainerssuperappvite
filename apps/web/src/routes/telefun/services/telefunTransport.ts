import type { SessionMetrics, TelefunTransport } from "@trainers/types";
import type { TelefunSessionState, TelefunTimelineEvent } from "../types";
import type { TelefunAppSettings } from "../telefunSettings";
import { LiveSession } from "./liveSession";
import {
  buildOpenAiResponseCreate,
  buildOpenAiSystemInputItem,
} from "./liveProtocol";
import { getTimeCueInstruction } from "./promptBuilder";
import { deleteOpenAIWebRtcBrokerCall } from "./openaiWebRtc/brokerApi";
import {
  OpenAIWebRtcSession,
  type OpenAIWebRtcSession as OpenAIWebRtcSessionType,
} from "./openaiWebRtc/openaiWebRtcSession";
import { OPENAI_WEBRTC_DEFAULT_DELETE_TIMEOUT_MS } from "./openaiWebRtc/contracts";
import type {
  OpenAIWebRtcControlEvent,
  OpenAIWebRtcDependencies,
  OpenAIWebRtcEvent,
  OpenAIWebRtcRecordingCallbackResult,
  OpenAIWebRtcState,
} from "./openaiWebRtc/contracts";
import type { WebRtcRecoveryPlan } from "./openaiWebRtc/recovery-policy";

export type TelefunEndReason =
  | "user"
  | "timeout"
  | "cleanup"
  | "provider_error"
  | "network_lost";

export interface TelefunTransportSession {
  connect(accessToken: string): Promise<void>;
  setMute(muted: boolean): void;
  setHold(held: boolean): void;
  sendTimeCue?(remainingSeconds: number): void;
  sendControlEvent?(event: OpenAIWebRtcControlEvent): boolean;
  disconnect(reason: TelefunEndReason): Promise<void>;

  onStatusChange: (status: string) => void;
  onStateChange: (state: TelefunSessionState) => void;
  onError: (error: Error) => void;
  onCleanupConfirmed?: () => void;
  onRecoveryRequired?: (plan: WebRtcRecoveryPlan) => void;
  onAiSpeaking: (speaking: boolean) => void;
  onVolumeChange: (volume: number) => void;
  onTimelineEvent: (event: TelefunTimelineEvent) => void;
  onSessionCreated: (sessionId: string) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onPlaybackBlocked: () => void;
  retryPlayback(): Promise<boolean>;
  onProviderEvent?: (event: OpenAIWebRtcEvent) => void;
  onRecordingComplete?: (
    url: string | null,
    fullBlob: Blob | null,
    agentBlob: Blob | null,
    metrics: SessionMetrics,
    captureStatus?: "ready" | "failed",
  ) =>
    | OpenAIWebRtcRecordingCallbackResult
    | Promise<OpenAIWebRtcRecordingCallbackResult>;
}

export interface TelefunWebRtcFactoryEnvironment extends Pick<
  OpenAIWebRtcDependencies,
  | "RTCPeerConnection"
  | "fetch"
  | "mediaDevices"
  | "audioElement"
  | "audioContextFactory"
  | "mediaRecorderFactory"
  | "mediaRecorderIsTypeSupported"
  | "createObjectURL"
  | "revokeObjectURL"
> {
  websocketUrl: string;
  mediaStreamFactory?: OpenAIWebRtcDependencies["mediaStreamFactory"];
}

export interface CreateTelefunTransportOptions {
  accessToken: string;
  env?: TelefunWebRtcFactoryEnvironment;
  isObjectUrlRetained?: (url: string) => boolean;
}

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
      reject(
        createTransportError(
          "OpenAI WebRTC cleanup timed out.",
          "cleanup_pending",
        ),
      );
    }, timeoutMs);
  });

  try {
    await Promise.race([request, deadline]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    input.signal?.removeEventListener("abort", forwardAbort);
  }
}

function getDefaultEnvironment(): TelefunWebRtcFactoryEnvironment {
  const websocketUrl = import.meta.env.VITE_TELEFUN_WS_URL;
  if (!websocketUrl) {
    throw new Error("VITE_TELEFUN_WS_URL is required for OpenAI WebRTC.");
  }
  if (typeof RTCPeerConnection === "undefined") {
    throw createTransportError(
      "Browser WebRTC is unavailable.",
      "browser_webrtc_unavailable",
    );
  }
  if (!navigator.mediaDevices) {
    throw createTransportError(
      "Browser microphone access is unavailable.",
      "browser_webrtc_unavailable",
    );
  }
  const audioElement = document.createElement("audio");
  audioElement.autoplay = true;
  audioElement.setAttribute("aria-hidden", "true");
  return {
    websocketUrl,
    RTCPeerConnection:
      RTCPeerConnection as unknown as OpenAIWebRtcDependencies["RTCPeerConnection"],
    fetch,
    mediaDevices: navigator.mediaDevices,
    audioElement,
    mediaStreamFactory: (tracks) =>
      new MediaStream(tracks as MediaStreamTrack[]),
  };
}

function mapWebRtcState(state: OpenAIWebRtcState): {
  status?: string;
  sessionState?: TelefunSessionState;
} {
  switch (state) {
    case "acquiring_media":
    case "creating_offer":
    case "brokering_sdp":
    case "connecting":
      return { status: "Menghubungkan...", sessionState: "connecting" };
    case "connected":
      return { status: "Tersambung", sessionState: "ready" };
    case "ending":
      return { status: "Mengakhiri panggilan..." };
    case "ended":
      return { status: "Selesai", sessionState: "ended" };
    case "failed":
      return { status: "Gagal", sessionState: "ended" };
    default:
      return {};
  }
}

export const TELEFUN_MIC_ERROR_MESSAGE =
  "Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.";
export const OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE =
  "Terjadi kesalahan pada layanan suara. Silakan coba lagi.";
export const TELEFUN_NETWORK_ERROR_MESSAGE =
  "Koneksi terputus. Sesi ini ditutup; buat sesi baru untuk melanjutkan.";
export const TELEFUN_CLEANUP_ERROR_MESSAGE =
  "Panggilan belum tersimpan. Coba lagi untuk mengakhiri.";
export const TELEFUN_CONNECTION_TIMEOUT_MESSAGE =
  "Waktu menghubungkan panggilan habis. Periksa koneksi internet dan coba lagi.";
export const TELEFUN_UNKNOWN_ERROR_MESSAGE =
  "Panggilan belum dapat dimulai. Silakan coba lagi.";

type TelefunTransportErrorCategory =
  | "mic"
  | "provider"
  | "network"
  | "cleanup"
  | "timeout"
  | "unknown";

type TransportErrorDetails = {
  code?: unknown;
  name?: unknown;
  message?: unknown;
  status?: unknown;
  cause?: unknown;
};

function createTransportError(
  message: string,
  code: string,
  cause?: unknown,
): Error {
  const error = new Error(message, { cause }) as Error & { code: string };
  error.code = code;
  return error;
}

function getErrorDetails(error: unknown): TransportErrorDetails[] {
  const details: TransportErrorDetails[] = [];
  const seen = new Set<object>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as TransportErrorDetails;
    details.push(value);
    current = value.cause;
  }

  return details;
}

function hasCode(
  details: TransportErrorDetails[],
  ...codes: string[]
): boolean {
  return details.some(
    (value) => typeof value.code === "string" && codes.includes(value.code),
  );
}

function hasName(
  details: TransportErrorDetails[],
  ...names: string[]
): boolean {
  return details.some(
    (value) => typeof value.name === "string" && names.includes(value.name),
  );
}

function hasSafeMessage(
  details: TransportErrorDetails[],
  predicate: (message: string) => boolean,
): boolean {
  return details.some(
    (value) =>
      typeof value.message === "string" &&
      predicate(value.message.toLowerCase()),
  );
}

function classifyTelefunTransportError(
  error: unknown,
): TelefunTransportErrorCategory {
  const details = getErrorDetails(error);

  // Cleanup wins over generic timeout/network markers because it is a
  // finalization context and remains retryable in the UI.
  if (
    hasCode(details, "cleanup_pending", "broker_finalization") ||
    hasSafeMessage(
      details,
      (message) =>
        message.includes("cleanup request failed") ||
        message.includes("cleanup timed out") ||
        message.includes("broker delete failed") ||
        message.includes("broker finalization"),
    )
  ) {
    return "cleanup";
  }

  if (
    hasCode(details, "microphone_access_failed", "device_unplugged") ||
    hasName(
      details,
      "NotAllowedError",
      "NotFoundError",
      "NotReadableError",
      "OverconstrainedError",
    ) ||
    hasSafeMessage(details, (message) =>
      message.includes("microphone track ended"),
    )
  ) {
    return "mic";
  }

  if (
    hasCode(details, "provider_error") ||
    (!hasCode(details, "broker_network_failed") &&
      hasSafeMessage(
        details,
        (message) =>
          message === OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE.toLowerCase() ||
          message.includes("broker request failed"),
      ))
  ) {
    return "provider";
  }

  if (
    hasCode(details, "network_lost", "broker_network_failed") ||
    hasSafeMessage(
      details,
      (message) =>
        message.includes("peer connection failed") ||
        message.includes("ice connection failed") ||
        message.includes("data channel closed") ||
        message === "network lost",
    )
  ) {
    return "network";
  }

  if (
    hasCode(details, "connection_timeout") ||
    hasSafeMessage(details, (message) =>
      message.includes("webrtc connection timed out"),
    )
  ) {
    return "timeout";
  }

  return "unknown";
}

export function mapTelefunTransportError(error: unknown): string {
  switch (classifyTelefunTransportError(error)) {
    case "mic":
      return TELEFUN_MIC_ERROR_MESSAGE;
    case "provider":
      return OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE;
    case "network":
      return TELEFUN_NETWORK_ERROR_MESSAGE;
    case "cleanup":
      return TELEFUN_CLEANUP_ERROR_MESSAGE;
    case "timeout":
      return TELEFUN_CONNECTION_TIMEOUT_MESSAGE;
    default:
      return TELEFUN_UNKNOWN_ERROR_MESSAGE;
  }
}

function safeProviderError(_event: OpenAIWebRtcEvent): Error {
  return createTransportError(
    OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE,
    "provider_error",
  );
}

const PROVIDER_DIAGNOSTIC_MAX_LENGTH = 200;

export type OpenAIWebRtcProviderDiagnostic = {
  type?: string;
  code?: string;
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Fail-safe, bounded diagnostic for a provider error event. Only `type`,
 * `code`, and `message` are extracted defensively, each capped at
 * PROVIDER_DIAGNOSTIC_MAX_LENGTH characters. The raw event payload — tokens,
 * SDP, prompts, or any other field — is never included.
 */
export function buildSafeProviderDiagnostic(
  event: OpenAIWebRtcEvent,
): OpenAIWebRtcProviderDiagnostic {
  const payload =
    event.kind === "event" && isRecord(event.payload) ? event.payload : null;
  const error = payload && isRecord(payload.error) ? payload.error : null;
  const bounded = (value: unknown): string | undefined => {
    if (typeof value !== "string" || value.length === 0) return undefined;
    return value.length > PROVIDER_DIAGNOSTIC_MAX_LENGTH
      ? value.slice(0, PROVIDER_DIAGNOSTIC_MAX_LENGTH)
      : value;
  };
  const diagnostic: OpenAIWebRtcProviderDiagnostic = {};
  const type = bounded(event.kind === "event" ? event.type : undefined);
  const code = bounded(error?.code);
  const message = bounded(error?.message);
  if (type !== undefined) diagnostic.type = type;
  if (code !== undefined) diagnostic.code = code;
  if (message !== undefined) diagnostic.message = message;
  return diagnostic;
}

export function mapOpenAIWebRtcSpeakingEvent(type: string): boolean | null {
  if (
    type === "response.created" ||
    type === "response.output_audio.delta" ||
    type === "response.audio.delta" ||
    type === "output_audio_buffer.started"
  ) {
    return true;
  }
  if (
    type === "response.done" ||
    type === "response.output_audio.done" ||
    type === "response.audio.done" ||
    type === "output_audio_buffer.stopped"
  ) {
    return false;
  }
  return null;
}

export class OpenAIWebRtcTransport implements TelefunTransportSession {
  private readonly session: OpenAIWebRtcSessionType;
  private providerFailureFinalization: Promise<void> | null = null;
  public onStatusChange = (_status: string) => {};
  public onStateChange = (_state: TelefunSessionState) => {};
  public onError = (_error: Error) => {};
  public onCleanupConfirmed = () => {};
  public onRecoveryRequired = (_plan: WebRtcRecoveryPlan) => {};
  public onAiSpeaking = (_speaking: boolean) => {};
  public onVolumeChange = (_volume: number) => {};
  public onTimelineEvent = (_event: TelefunTimelineEvent) => {};
  public onSessionCreated = (_sessionId: string) => {};
  public onLocalStream = (_stream: MediaStream | null) => {};
  public onPlaybackBlocked = () => {};
  public onRecordingComplete: NonNullable<
    TelefunTransportSession["onRecordingComplete"]
  > = () => {};
  public onProviderEvent = (_event: OpenAIWebRtcEvent) => {};

  constructor(
    private readonly config: TelefunAppSettings,
    accessToken: string,
    env: TelefunWebRtcFactoryEnvironment,
    private readonly isObjectUrlRetained?: (url: string) => boolean,
  ) {
    if (!config.sessionId) {
      throw new Error("OpenAI WebRTC requires a pre-created session.");
    }
    const deps: OpenAIWebRtcDependencies = {
      ...env,
      onStateChange: (state) => {
        const mapped = mapWebRtcState(state);
        if (mapped.status) this.onStatusChange(mapped.status);
        if (mapped.sessionState) this.onStateChange(mapped.sessionState);
      },
      onLocalStream: (stream) => {
        this.onLocalStream(stream as unknown as MediaStream | null);
      },
      onPlaybackBlocked: () => this.onPlaybackBlocked(),
      onRemotePlaybackChange: (audible) => this.onAiSpeaking(audible),
      onCleanupConfirmed: () => this.onCleanupConfirmed(),
      onRecoveryRequired: (plan) => this.onRecoveryRequired(plan),
      isObjectUrlRetained: (url) => this.isObjectUrlRetained?.(url) ?? false,
      onVolumeChange: (volume) => this.onVolumeChange(volume),
      onRecordingComplete: (url, fullBlob, agentBlob, metrics, captureStatus) =>
        this.onRecordingComplete?.(
          url,
          fullBlob,
          agentBlob,
          metrics,
          captureStatus,
        ),
      onEvent: (event) => this.handleProviderEvent(event),
      onError: (error) => this.onError(this.boundError(error)),
    };
    this.session = new OpenAIWebRtcSession(
      {
        sessionId: config.sessionId,
        accessToken,
        brokerHttpBaseUrl: deriveTelefunBrokerHttpBaseUrl(env.websocketUrl),
        requireSecureTransport: import.meta.env.PROD === true,
      },
      deps,
    );
  }

  public connect(accessToken: string): Promise<void> {
    if (!accessToken.trim())
      return Promise.reject(new Error("Access token is required."));
    this.onSessionCreated(this.config.sessionId!);
    return this.session.connect();
  }

  public retryPlayback(): Promise<boolean> {
    return this.session.retryPlayback();
  }

  public setMute(muted: boolean): void {
    this.session.setMute(muted);
  }

  public setHold(held: boolean): void {
    this.session.setHold(held);
  }

  public sendTimeCue(remainingSeconds: number): void {
    const activeConsumer =
      this.config.activeConsumerType ?? this.config.consumerTypes[0];
    const text = getTimeCueInstruction(activeConsumer, remainingSeconds);
    const item = buildOpenAiSystemInputItem(text);
    if (!this.session.sendControlEvent(item)) return;
    this.session.sendControlEvent(buildOpenAiResponseCreate());
  }

  public sendControlEvent(event: OpenAIWebRtcControlEvent): boolean {
    return this.session.sendControlEvent(event);
  }

  public disconnect(reason: TelefunEndReason): Promise<void> {
    if (reason === "provider_error" || reason === "cleanup") {
      return this.session.end(
        "failed",
        reason === "cleanup" ? "unmount" : "provider_error",
      );
    }
    if (reason === "network_lost") {
      return this.session.end("network_lost", "peer_state");
    }
    if (reason === "timeout") return this.session.end(undefined, "timeout");
    return this.session.end(undefined, "user");
  }

  private handleProviderEvent(event: OpenAIWebRtcEvent): void {
    if (event.kind !== "event") {
      this.onProviderEvent(event);
      return;
    }
    if (event.type === "error") {
      const recoverableControlError =
        this.session.isRecoverableControlError(event);
      const safeEvent: OpenAIWebRtcEvent = {
        kind: "event",
        type: "error",
        payload: {
          type: "error",
          error: {
            code: recoverableControlError
              ? "interruption_control_rejected"
              : "provider_error",
          },
        },
      };
      try {
        this.onProviderEvent(safeEvent);
      } catch {
        // UI observers are not lifecycle authorities.
      }
      try {
        if (!recoverableControlError) this.onError(safeProviderError(event));
      } catch {
        // UI observers are not lifecycle authorities.
      }
      try {
        // One fail-safe, bounded diagnostic; never the raw event payload,
        // tokens, SDP, or prompts.
        console.warn(
          "[Telefun] OpenAI WebRTC provider error",
          buildSafeProviderDiagnostic(event),
        );
      } catch {
        // Observability is never a lifecycle authority.
      }
      if (recoverableControlError) return;
      this.finalizeProviderFailure();
      return;
    }

    this.onProviderEvent(event);
  }

  private finalizeProviderFailure(): void {
    if (this.providerFailureFinalization) return;
    try {
      this.providerFailureFinalization = this.session
        .end("failed", "provider_error")
        .catch(() => undefined);
    } catch {
      // Provider cleanup is best effort; the UI error has already been reported.
    }
  }

  private boundError(error: Error): Error {
    const category = classifyTelefunTransportError(error);
    switch (category) {
      case "mic":
        return createTransportError(
          TELEFUN_MIC_ERROR_MESSAGE,
          hasCode(getErrorDetails(error), "device_unplugged")
            ? "device_unplugged"
            : "microphone_access_failed",
          error,
        );
      case "provider":
        return createTransportError(
          OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE,
          "provider_error",
          error,
        );
      case "network":
        return createTransportError(
          TELEFUN_NETWORK_ERROR_MESSAGE,
          "network_lost",
          error,
        );
      case "cleanup":
        return createTransportError(
          TELEFUN_CLEANUP_ERROR_MESSAGE,
          "cleanup_pending",
          error,
        );
      case "timeout":
        return createTransportError(
          TELEFUN_CONNECTION_TIMEOUT_MESSAGE,
          "connection_timeout",
          error,
        );
      default:
        return createTransportError(
          TELEFUN_UNKNOWN_ERROR_MESSAGE,
          "unknown",
          error,
        );
    }
  }
}

export function createTelefunTransport(
  config: TelefunAppSettings,
  options: CreateTelefunTransportOptions,
): TelefunTransportSession {
  const transport: TelefunTransport = config.telefunTransport ?? "gemini-live";
  if (transport === "openai-webrtc") {
    const env = options.env ?? getDefaultEnvironment();
    return new OpenAIWebRtcTransport(
      config,
      options.accessToken,
      env,
      options.isObjectUrlRetained,
    );
  }
  return new LiveSession(config) as unknown as TelefunTransportSession;
}
