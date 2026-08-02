import type { SessionMetrics, TelefunTransport } from "@trainers/types";
import type { TelefunSessionState, TelefunTimelineEvent } from "../types";
import type { TelefunAppSettings } from "../telefunSettings";
import { LiveSession } from "./liveSession";
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
      reject(new Error("OpenAI WebRTC cleanup timed out."));
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
    throw new Error("Browser WebRTC is unavailable.");
  }
  if (!navigator.mediaDevices) {
    throw new Error("Browser microphone access is unavailable.");
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

export const OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE =
  "Terjadi kesalahan pada layanan suara. Silakan coba lagi.";

export function mapTelefunTransportError(_error: unknown): string {
  return "Panggilan belum dapat dimulai. Periksa mikrofon dan coba lagi.";
}

function safeProviderError(_event: OpenAIWebRtcEvent): Error {
  return new Error(OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE);
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

  // Browser time-cue prompt authority is intentionally deferred for WebRTC.
  public sendTimeCue(_remainingSeconds: number): void {}

  public sendControlEvent(event: OpenAIWebRtcControlEvent): boolean {
    return this.session.sendControlEvent(event);
  }

  public disconnect(reason: TelefunEndReason): Promise<void> {
    if (reason === "provider_error" || reason === "cleanup") {
      return this.session.end("failed");
    }
    if (reason === "network_lost") return this.session.end("network_lost");
    return this.session.end();
  }

  private handleProviderEvent(event: OpenAIWebRtcEvent): void {
    if (event.kind !== "event") {
      this.onProviderEvent(event);
      return;
    }
    if (event.type === "error") {
      const safeEvent: OpenAIWebRtcEvent = {
        kind: "event",
        type: "error",
        payload: { type: "error", error: { code: "provider_error" } },
      };
      try {
        this.onProviderEvent(safeEvent);
      } catch {
        // UI observers are not lifecycle authorities.
      }
      try {
        this.onError(safeProviderError(event));
      } catch {
        // UI observers are not lifecycle authorities.
      }
      this.finalizeProviderFailure();
      return;
    }

    this.onProviderEvent(event);
    const speaking = mapOpenAIWebRtcSpeakingEvent(event.type);
    if (speaking !== null) {
      this.onAiSpeaking(speaking);
    }
  }

  private finalizeProviderFailure(): void {
    if (this.providerFailureFinalization) return;
    try {
      this.providerFailureFinalization = this.session
        .end("failed")
        .catch(() => undefined);
    } catch {
      // Provider cleanup is best effort; the UI error has already been reported.
    }
  }

  private boundError(_error: Error): Error {
    return new Error(OPENAI_WEBRTC_PROVIDER_ERROR_MESSAGE);
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
