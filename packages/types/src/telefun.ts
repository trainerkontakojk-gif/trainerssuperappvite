import type { JsonObject, JsonValue } from "./common";
import type { TelefunTransport } from "./ai-models";
import type { VoiceQualityAssessment } from "./telefun-assessment";
import type { TelefunTranscriptEntry } from "./telefun-transcript";

export interface TelefunSessionConfigure {
  type: "telefun_session_configure";
  modelId: string;
  transport: "gemini-live" | "openai-audio" | "openai-webrtc";
  voice: string;
  instructions: string;
  inputAudio: {
    format: "pcm16";
    sampleRate: 16000 | 24000;
  };
  responsePacingMode: "realistic" | "training_fast";
}

export const TELEFUN_CONFIGURATION_CLOSE_CODE = 4002;

export type TelefunRecordingStatus =
  | "pending"
  | "uploaded"
  | "partial"
  | "ready"
  | "failed";

export type TelefunScoringStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type TelefunRealtimeAttemptState =
  | "claimed"
  | "brokered"
  | "sideband_connected"
  | "ending"
  | "ended";

export type TelefunRealtimeUsageStatus =
  | "pending"
  | "persisted"
  | "incomplete"
  | "failed";

export interface TelefunRecordingReadiness {
  recordingStatus: TelefunRecordingStatus;
  recordingReady: boolean;
  scoringReady: boolean;
  scoringReadyAt?: string | null;
  scoringStatus: TelefunScoringStatus;
}

export interface SpeechSegment {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export interface TelefunMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
  [key: string]: JsonValue | undefined;
}

export const TELEFUN_FIRST_HOLD_LIMIT_MS = 60_000;
export const TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS = 180_000;

export interface TelefunHoldInterval {
  sequence: number;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  limitMs: number;
  exceededByMs: number;
}

export interface TelefunHoldMetrics {
  count: number;
  totalDurationMs: number;
  longestDurationMs: number;
  exceededCount: number;
  intervals: TelefunHoldInterval[];
}

export interface SessionMetrics {
  speechSegments: SpeechSegment[];
  totalSpeakingMs: number;
  totalSilenceMs: number;
  deadAirCount: number;
  interruptionCount: number;
  volumeSamples: number[];
  volumeConsistency: number;
  inputTranscriptionChunks: string[];
  sessionDurationMs: number;
  hold?: TelefunHoldMetrics;
}

export * from "./telefun-assessment";
export * from "./telefun-transcript";

export interface TelefunHistory {
  id: string;
  user_id: string;
  scenario_title: string;
  consumer_name: string;
  consumer_gender: string;
  duration_seconds: number;
  status: "pending" | "active" | "completed" | "failed";
  score?: number | null;
  messages?: TelefunTranscriptEntry[] | null;
  ai_summary?: string | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  coaching_focus?: string[] | null;
  recording_path?: string | null;
  agent_recording_path?: string | null;
  recording_status?: TelefunRecordingStatus;
  recording_ready_at?: string | null;
  recording_error?: string | null;
  scoring_ready_at?: string | null;
  scoring_status?: TelefunScoringStatus;
  scoring_claimed_at?: string | null;
  scoring_completed_at?: string | null;
  scoring_attempt_count?: number | null;
  scoring_last_error?: string | null;
  scoring_next_attempt_at?: string | null;
  voice_assessment?: VoiceQualityAssessment | null;
  session_metrics?: SessionMetrics | null;
  voice_dashboard_metrics?: JsonObject | null;
  disruption_config?: JsonObject | null;
  disruption_results?: JsonObject | null;
  persona_config?: JsonObject | null;
  realistic_mode_enabled: boolean;
  configured_duration?: number | null;
  response_pacing_mode?: string | null;
  telefun_model_id?: string | null;
  telefun_transport?: TelefunTransport | null;
  created_at: string;
}

export interface TelefunCoachingSummary {
  id: string;
  session_id: string;
  user_id: string;
  recommendations: Array<{ text: string; priority: number }>;
  generated_at: string;
}

export interface TelefunReplayAnnotation {
  id: string;
  session_id: string;
  user_id: string;
  timestamp_ms: number;
  category:
    | "strength"
    | "improvement_area"
    | "critical_moment"
    | "technique_used";
  moment: string;
  text: string;
  is_manual: boolean;
  created_at: string;
}
