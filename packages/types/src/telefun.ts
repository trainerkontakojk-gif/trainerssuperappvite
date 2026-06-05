import type { JsonObject, JsonValue } from "./common";

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

export type {
  VoiceAspectScore,
  TelefunHoldAssessment,
  TelefunScoreResult,
  VoiceQualityAssessment,
  TelefunVoiceMetricKey,
  TelefunMetricStatus,
  CommunicationMetricMode,
  CommunicationMetric,
  TelefunCommunicationProfile,
} from "./telefun-assessment";

export interface TelefunHistory {
  id: string;
  user_id: string;
  scenario_title: string;
  consumer_name: string;
  consumer_gender: string;
  duration_seconds: number;
  status: "pending" | "active" | "completed" | "failed";
  score?: number | null;
  messages?: TelefunMessage[] | null;
  ai_summary?: string | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  coaching_focus?: string[] | null;
  recording_path?: string | null;
  agent_recording_path?: string | null;
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
  telefun_transport?: string | null;
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
