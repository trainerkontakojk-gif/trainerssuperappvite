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
}

export interface VoiceAspectScore {
  score: number;
  verdict: string;
  feedback: string;
}

export interface VoiceQualityAssessment {
  overallScore: number;
  speakingRate: VoiceAspectScore & { wordsPerMinute: number };
  intonation: VoiceAspectScore;
  articulation: VoiceAspectScore;
  fillerWords: VoiceAspectScore & { count: number; examples: string[] };
  emotionalTone: VoiceAspectScore & { dominant: string };
  transcript: string;
  highlights: string[];
  strengths: string[];
  communicationProfile?: TelefunCommunicationProfile | null;
}

export type TelefunVoiceMetricKey =
  | "speakingRate"
  | "intonation"
  | "articulation"
  | "fillers"
  | "tone";

export type TelefunMetricStatus = "good" | "needs_improvement" | "poor";

export interface TelefunMetricDisplay {
  key: TelefunVoiceMetricKey;
  label: string;
  score: number; // quality score 0-10, legacy-compatible
  displayScore: number; // normalized radar/card value 0-100
  rawValue?: number | string;
  rawUnit?: "WPM" | "filler_words" | "dominant_tone";
  targetScore: number; // QA target plotted on radar 0-100
  targetDirection: "match_target" | "higher_quality" | "lower_raw_is_better";
  verdict: string;
  status: TelefunMetricStatus;
  feedback: string;
  explanation: string;
  improvementTip?: string;
}

export type CommunicationMetricMode =
  | "higher_better"
  | "lower_better"
  | "optimal_range";

export interface CommunicationMetric {
  key: TelefunVoiceMetricKey;
  label: string;
  value: number; // alias legacy untuk displayScore
  benchmarkValue: number; // alias legacy untuk targetScore
  score: number; // quality score 0-10, legacy-compatible
  displayScore: number;
  targetScore: number;
  targetDirection: "match_target" | "higher_quality" | "lower_raw_is_better";
  rawValue?: number | string;
  rawUnit?: "WPM" | "filler_words" | "dominant_tone";
  evaluationMode: CommunicationMetricMode;
  idealMin?: number;
  idealMax?: number;
  goodMin?: number;
  goodMax?: number;
  verdict: string;
  status: TelefunMetricStatus;
  feedback: string;
  explanation: string;
  improvementTip?: string;
}

export interface TelefunCommunicationProfile {
  metrics: CommunicationMetric[];
  overallSummary: string;
  strengths: string[];
  improvementPriorities: string[];
}

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
