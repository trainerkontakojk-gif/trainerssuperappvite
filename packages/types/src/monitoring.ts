import type { ChatMessage } from "./ketik";
import type {
  EmailMessage,
  PdktEvaluationResult,
  PdktSessionConfig,
} from "./pdkt";
import type { VoiceQualityAssessment } from "./telefun-assessment";
import type { TelefunTranscriptEntry } from "./telefun-transcript";

export type MonitoringReviewStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface MonitoringConsumerMetadata {
  consumer_name?: string | null;
  consumer_phone?: string | null;
  consumer_city?: string | null;
  consumer_gender?: string | null;
  consumer_type?: string | null;
  recipient?: string | null;
  contact?: string | null;
}

export interface MonitoringLegacyKetikMessage {
  role: "user" | "ai" | "agent" | "consumer" | "system";
  text: string;
  timestamp?: string;
  sender?: string;
  content?: string;
}

export type MonitoringKetikMessage = ChatMessage & {
  role?: "user" | "ai" | "agent" | "consumer" | "system";
  content?: string;
};

export type MonitoringEmailMessage = EmailMessage & {
  type?: "received" | "sent";
  content?: string;
  role?: string;
  sender?: string;
  text?: string;
};

export type MonitoringTelefunTranscriptEntry = TelefunTranscriptEntry & {
  role?: string;
  content?: string;
  sender?: string;
};

export interface MonitoringEmailPreview {
  type?: "received" | "sent";
  subject: string;
  body: string;
  role?: string;
  sender?: string;
  text?: string;
  content?: string;
}

export type MonitoringHistoryPayload =
  | MonitoringKetikMessage[]
  | MonitoringLegacyKetikMessage[]
  | MonitoringEmailMessage[]
  | MonitoringEmailPreview[]
  | MonitoringTelefunTranscriptEntry[]
  | string
  | null;

export interface MonitoringScoreSummary {
  final?: number;
  empathy?: number;
  probing?: number;
  resolution?: number;
  typo?: number;
  compliance?: number;
}

export type MonitoringPdktEvaluation = PdktEvaluationResult & {
  typos_count: number;
  clarity_issues_count: number;
  content_gaps_count: number;
};

export type MonitoringPdktEvaluationSummary = {
  score?: number;
  feedback?: string;
  typos_count: number;
  clarity_issues_count: number;
  content_gaps_count: number;
  typos?: string[];
  clarityIssues?: string[];
  contentGaps?: string[];
};

export interface MonitoringKetikSession {
  consumer_name: string | null;
  consumer_phone: string | null;
  consumer_city: string | null;
  simulation_duration: number | null;
  messages: MonitoringKetikMessage[];
}

export interface MonitoringPdktSession extends MonitoringConsumerMetadata {
  config: PdktSessionConfig | null;
  emails: MonitoringEmailMessage[];
  evaluation: PdktEvaluationResult | null;
  evaluation_error: string | null;
  evaluation_status: MonitoringReviewStatus;
  time_taken: number | null;
}

export type MonitoringTelefunAssessment = VoiceQualityAssessment & {
  overall_score: number;
  speaking_rate_wpm: number;
  intonation_score: number;
  articulation_score: number;
  filler_words_count: number;
  emotional_tone: string;
  highlights: string[];
};

export interface MonitoringTelefunCoaching {
  recommendations: Array<{ text: string; priority: number }>;
  generated_at: string | null;
}

export interface MonitoringHistoryEntry extends MonitoringConsumerMetadata {
  id: string;
  user_id: string;
  module: "ketik" | "pdkt" | "telefun";
  scenario_title: string;
  created_at: string;
  duration_seconds: number;
  score: number | null;
  history: MonitoringHistoryPayload;
  user_email?: string;
  user_role?: string;
  review_status: MonitoringReviewStatus;
  scores?: MonitoringScoreSummary;
  ketik_session?: MonitoringKetikSession;
  pdkt_session?: MonitoringPdktSession;
  pdkt_evaluation?: MonitoringPdktEvaluationSummary;
  telefun_assessment?: MonitoringTelefunAssessment;
  telefun_coaching?: MonitoringTelefunCoaching;
  telefun_legacy?: boolean;
}

export interface KetikMonitoringReview {
  module: "ketik";
  review_status: MonitoringReviewStatus;
  scores: MonitoringScoreSummary;
  session: {
    consumerName: string | null;
    consumerPhone: string | null;
    consumerCity: string | null;
    simulationDuration: number | null;
    messages: MonitoringKetikMessage[];
  } | null;
  review: {
    id: string;
    sessionId: string;
    aiSummary: string;
    strengths: string[];
    weaknesses: string[];
    coachingFocus: string[];
    createdAt: string;
  } | null;
  typos: Array<{
    id: string;
    sessionId: string;
    messageId: string;
    originalWord: string;
    correctedWord: string;
    severity: string;
  }>;
}

export interface PdktMonitoringReview {
  module: "pdkt";
  review_status: MonitoringReviewStatus;
  session: (Pick<MonitoringPdktSession, "config" | "emails" | "consumer_name" | "consumer_type" | "recipient" | "contact"> & {
    created_at: string | null;
  }) | null;
  evaluation: PdktEvaluationResult | null;
  emails: MonitoringEmailMessage[];
  evaluation_error: string | null;
  time_taken: number | null;
}

export interface TelefunMonitoringReview {
  module: "telefun";
  review_status: MonitoringReviewStatus;
  score: number | null;
  recording_path: string | null;
  agent_recording_path: string | null;
  recording_url: string | null;
  scenario_title: string | null;
  duration_seconds: number | null;
  voice_assessment: VoiceQualityAssessment | null;
  transcript: MonitoringTelefunTranscriptEntry[];
  ai_summary: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  coaching_focus: string[] | null;
  consumer_name: string | null;
  consumer_phone: string | null;
  consumer_city: string | null;
  consumer_gender: string | null;
  persona_config: { consumerType: string } | null;
  coaching_recommendations: Array<{ text: string; priority: number }>;
  coaching_generated_at: string | null;
  telefun_legacy: boolean;
}

export interface MonitoringReviewByModule {
  ketik: KetikMonitoringReview;
  pdkt: PdktMonitoringReview;
  telefun: TelefunMonitoringReview;
}
