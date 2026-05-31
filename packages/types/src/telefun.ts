export interface SpeechSegment {
  startMs: number;
  endMs: number;
  durationMs: number;
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

export type CommunicationMetricMode =
  | "higher_better"
  | "lower_better"
  | "optimal_range";

export interface CommunicationMetric {
  key: "speakingRate" | "intonation" | "articulation" | "fillers" | "tone";
  label: string;
  value: number;
  benchmarkValue: number;
  evaluationMode: CommunicationMetricMode;
  idealMin?: number;
  idealMax?: number;
  goodMin?: number;
  goodMax?: number;
  status: "good" | "needs_improvement" | "poor";
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
  messages?: any[] | null;
  ai_summary?: string | null;
  strengths?: string[] | null;
  weaknesses?: string[] | null;
  coaching_focus?: string[] | null;
  recording_path?: string | null;
  agent_recording_path?: string | null;
  voice_assessment?: VoiceQualityAssessment | null;
  session_metrics?: SessionMetrics | null;
  voice_dashboard_metrics?: any | null;
  disruption_config?: any | null;
  disruption_results?: any | null;
  persona_config?: any | null;
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
