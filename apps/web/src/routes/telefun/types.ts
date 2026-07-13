import type {
  SessionMetrics,
  VoiceQualityAssessment,
  TelefunTranscriptEntry,
} from "@trainers/types";

export interface CallRecord {
  id: string;
  date: string;
  url: string;
  consumerName: string;
  consumerPhone?: string;
  consumerCity?: string;
  scenarioTitle: string;
  duration: number;
  configuredDuration?: number;
  recordingPath?: string;
  agentRecordingPath?: string;
  score?: number;
  feedback?: string;
  voiceAssessment?: VoiceQualityAssessment | null;
  sessionMetrics?: SessionMetrics | null;
  /** Legacy metadata retained so historical sessions remain readable. */
  legacyRealisticModeEnabled?: boolean;
  voiceDashboardMetrics?: any | null;
  personaConfig?: any | null;
  disruptionConfig?: string[] | null;
  disruptionResults?: any[] | null;
  responsePacingMode?: string;
  telefunModelId?: string;
  telefunTransport?: string;
  transcript?: TelefunTranscriptEntry[];
}

export type TelefunSessionState =
  | "idle"
  | "connecting"
  | "ready"
  | "user_speaking"
  | "ai_thinking"
  | "ai_speaking"
  | "ended";

export type TelefunTimelineEventName =
  | "connect_start"
  | "mic_ready"
  | "ws_open"
  | "auth_complete"
  | "ws_close"
  | "setup_sent"
  | "setup_complete"
  | "setup_complete_received"
  | "first_user_audio_chunk_sent"
  | "audio_chunk_send"
  | "audio_stream_end_sent"
  | "audio_stream_resumed"
  | "mute_changed"
  | "first_model_audio_chunk"
  | "turn_complete_received"
  | "input_transcription_seen"
  | "interrupted_received"
  | "playback_start"
  | "playback_end"
  | "time_cue_prompt_sent"
  | "stalled_response_detected"
  | "stalled_response_watchdog"
  | "no_model_response_after_audio_end"
  | "disconnect"
  | "hold_state_changed"
  | "audio_worklet_enabled"
  | "audio_worklet_fallback"
  | "session_reconnecting"
  | "session_resumed";

export interface TelefunTimelineEvent {
  event: TelefunTimelineEventName;
  ts: number;
  sessionId: string;
  turnId?: string;
  state?: TelefunSessionState;
  meta?: Record<string, unknown>;
}
