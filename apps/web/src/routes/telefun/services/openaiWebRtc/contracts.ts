export type OpenAIWebRtcState =
  | "idle"
  | "acquiring_media"
  | "creating_offer"
  | "brokering_sdp"
  | "connecting"
  | "connected"
  | "ending"
  | "ended"
  | "failed";

export type OpenAIWebRtcEvent =
  | {
      kind: "event";
      type: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "invalid";
      reason: "malformed_json" | "invalid_shape" | "oversized_message";
    };

/** Browser controls are intentionally a closed set. Server-owned session config
 * is never sent through this seam. */
export type OpenAIWebRtcResponseMetadata = {
  telefun_response_create: string;
};

export type OpenAIWebRtcControlEvent =
  | { type: "response.cancel"; response_id: string; event_id?: string }
  | { type: "output_audio_buffer.clear"; event_id?: string }
  | {
      type: "response.create";
      event_id?: string;
      response?: { metadata?: OpenAIWebRtcResponseMetadata };
    }
  | {
      type: "conversation.item.truncate";
      item_id: string;
      content_index: 0;
      audio_end_ms: number;
      event_id?: string;
    }
  | {
      type: "conversation.item.create";
      event_id?: string;
      item: {
        type: "message";
        role: "system";
        content: Array<{ type: "input_text"; text: string }>;
      };
    };

export interface OpenAIWebRtcSessionConfig {
  sessionId: string;
  accessToken: string;
  brokerHttpBaseUrl: string;
  connectTimeoutMs?: number;
  deleteTimeoutMs?: number;
  requireSecureTransport?: boolean;
}

export type OpenAIWebRtcCallOutcome = "failed" | "network_lost" | "orphaned";

export interface OpenAIWebRtcStateCallbacks {
  onStateChange?: (state: OpenAIWebRtcState) => void;
  onEvent?: (event: OpenAIWebRtcEvent) => void;
  onError?: (error: Error) => void;
  onLocalStream?: (stream: OpenAIWebRtcStreamLike | null) => void;
  onPlaybackBlocked?: () => void;
  onRecoveryRequired?: (
    plan: import("./recovery-policy").WebRtcRecoveryPlan,
  ) => void;
}

export interface OpenAIWebRtcMediaDeviceLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
}

export interface OpenAIWebRtcAudioElementLike {
  srcObject: MediaProvider | null;
  muted?: boolean;
  autoplay?: boolean;
  currentTime?: number;
  paused?: boolean;
  ended?: boolean;
  readyState?: number;
  onplaying?: ((event: Event) => void) | null;
  onpause?: ((event: Event) => void) | null;
  onended?: ((event: Event) => void) | null;
  ontimeupdate?: ((event: Event) => void) | null;
  onwaiting?: ((event: Event) => void) | null;
  onstalled?: ((event: Event) => void) | null;
  play(): Promise<void>;
  pause?(): void;
}

export interface OpenAIWebRtcAudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect?(): void;
}

export interface OpenAIWebRtcAnalyserLike extends OpenAIWebRtcAudioNodeLike {
  fftSize: number;
  frequencyBinCount: number;
  getByteTimeDomainData(data: Uint8Array): void;
}

export interface OpenAIWebRtcAudioContextLike {
  state?: string;
  createMediaStreamSource(
    stream: OpenAIWebRtcStreamLike,
  ): OpenAIWebRtcAudioNodeLike;
  createMediaStreamDestination(): {
    stream: OpenAIWebRtcStreamLike;
  };
  createAnalyser(): OpenAIWebRtcAnalyserLike;
  resume?(): Promise<void>;
  close(): Promise<void> | void;
}

export interface OpenAIWebRtcMediaRecorderLike {
  state: string;
  mimeType?: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

export type OpenAIWebRtcRecordingCallbackResult = void | {
  retainObjectUrl?: boolean;
};

export interface OpenAIWebRtcTrackLike {
  stop(): void;
  enabled?: boolean;
  onended?: ((event: Event) => void) | null;
}

export interface OpenAIWebRtcStreamLike {
  getTracks(): OpenAIWebRtcTrackLike[];
  getAudioTracks(): OpenAIWebRtcTrackLike[];
  addTrack?(track: OpenAIWebRtcTrackLike): void;
}

export interface OpenAIWebRtcDataChannelLike {
  label: string;
  readyState: string;
  onmessage: ((event: { data: string }) => void) | null;
  onclose: (() => void) | null;
  close(): void;
  send?(data: string): void;
}

export interface OpenAIWebRtcPeerConnectionLike {
  addTrack(track: OpenAIWebRtcTrackLike, stream: OpenAIWebRtcStreamLike): void;
  createDataChannel(label: string): OpenAIWebRtcDataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  close(): void;
  ontrack:
    | ((event: {
        track: OpenAIWebRtcTrackLike;
        streams: OpenAIWebRtcStreamLike[];
      }) => void)
    | null;
  onconnectionstatechange: (() => void) | null;
  oniceconnectionstatechange: (() => void) | null;
  connectionState?: string;
  iceConnectionState?: string;
}

export interface OpenAIWebRtcDependencies {
  RTCPeerConnection: new () => OpenAIWebRtcPeerConnectionLike;
  fetch: typeof fetch;
  mediaDevices: OpenAIWebRtcMediaDeviceLike;
  mediaStreamFactory?: (
    tracks: OpenAIWebRtcTrackLike[],
  ) => OpenAIWebRtcStreamLike;
  audioElement: OpenAIWebRtcAudioElementLike;
  audioContextFactory?: () => OpenAIWebRtcAudioContextLike;
  mediaRecorderFactory?: (
    stream: OpenAIWebRtcStreamLike,
    options?: { mimeType: string },
  ) => OpenAIWebRtcMediaRecorderLike;
  mediaRecorderIsTypeSupported?: (mimeType: string) => boolean;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  onStateChange?: (state: OpenAIWebRtcState) => void;
  onEvent?: (event: OpenAIWebRtcEvent) => void;
  onError?: (error: Error) => void;
  onLocalStream?: (stream: OpenAIWebRtcStreamLike | null) => void;
  onPlaybackBlocked?: () => void;
  onRemotePlaybackChange?: (audible: boolean) => void;
  onRecoveryRequired?: OpenAIWebRtcStateCallbacks["onRecoveryRequired"];
  onCleanupConfirmed?: () => void;
  isObjectUrlRetained?: (url: string) => boolean;
  onVolumeChange?: (volume: number) => void;
  onRecordingComplete?: (
    url: string | null,
    fullBlob: Blob | null,
    agentBlob: Blob | null,
    metrics: import("@trainers/types").SessionMetrics,
    captureStatus?: "ready" | "failed",
  ) =>
    | OpenAIWebRtcRecordingCallbackResult
    | Promise<OpenAIWebRtcRecordingCallbackResult>;
}

export const OPENAI_WEBRTC_PATH_PREFIX =
  "/telefun/realtime/openai/webrtc/sessions";
export const OPENAI_WEBRTC_DATA_CHANNEL_LABEL = "oai-events";
export const OPENAI_WEBRTC_DEFAULT_TIMEOUT_MS = 15_000;
export const OPENAI_WEBRTC_DEFAULT_DELETE_TIMEOUT_MS = 5_000;
export const OPENAI_WEBRTC_MAX_SDP_CHARS = 64_000;
export const OPENAI_WEBRTC_MAX_DATA_CHANNEL_MESSAGE_CHARS = 32_768;

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
