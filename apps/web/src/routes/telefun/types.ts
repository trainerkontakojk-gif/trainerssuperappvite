import type { SessionMetrics, VoiceQualityAssessment } from "@trainers/types";

export interface CallRecord {
  id: string;
  date: string;
  url: string;
  consumerName: string;
  scenarioTitle: string;
  duration: number;
  configuredDuration?: number;
  recordingPath?: string;
  agentRecordingPath?: string;
  score?: number;
  feedback?: string;
  voiceAssessment?: VoiceQualityAssessment | null;
  sessionMetrics?: SessionMetrics | null;
  /** Realistic mode fields */
  realisticModeEnabled?: boolean;
  voiceDashboardMetrics?: any | null;
  personaConfig?: any | null;
  disruptionConfig?: string[] | null;
  disruptionResults?: any[] | null;
}

export type TelefunSessionState =
  | "idle"
  | "connecting"
  | "ready"
  | "user_speaking"
  | "ai_thinking"
  | "ai_speaking"
  | "interruption_candidate"
  | "recovering"
  | "ended";

export type TelefunTimelineEventName =
  | "connect_start"
  | "mic_ready"
  | "ws_open"
  | "ws_close"
  | "setup_sent"
  | "setup_complete_received"
  | "audio_chunk_send"
  | "audio_stream_end_sent"
  | "audio_stream_resumed"
  | "mute_changed"
  | "first_model_audio_chunk"
  | "turn_complete_received"
  | "local_user_turn_end_detected"
  | "input_transcription_seen"
  | "interrupted_received"
  | "playback_start"
  | "playback_end"
  | "dead_air_prompt_sent"
  | "interruption_prompt_sent"
  | "stalled_response_detected"
  | "no_model_response_after_audio_end"
  | "recovering"
  | "disconnect"
  | "realistic_mode_prompt"
  | "realistic_mode_session_recovery"
  | "realistic_mode_end_session"
  | "hold_state_changed";

export interface TelefunTimelineEvent {
  event: TelefunTimelineEventName;
  ts: number;
  sessionId: string;
  turnId?: string;
  state?: TelefunSessionState;
  meta?: Record<string, unknown>;
}
