import type { SessionMetrics } from "@trainers/types";

export type AnnotationCategory = "strength" | "improvement_area" | "critical_moment" | "technique_used";
export type AnnotationMoment = "missed_empathy" | "good_de_escalation" | "long_pause" | "interruption" | "technique_usage";

export interface ReplayAnnotation {
  id: string;
  timestampMs: number;
  category: AnnotationCategory;
  moment: AnnotationMoment;
  text: string;
  isManual: boolean;
  createdBy?: string;
}

export interface CoachingRecommendation {
  text: string;
  priority: number;
}

export interface ReplayAnnotationResult {
  annotations: ReplayAnnotation[];
  summary: CoachingRecommendation[];
}

export type SpeakingSpeedClassification = "too_slow" | "normal" | "too_fast";
export type SpeakingDominanceClassification = "dominated" | "balanced" | "passive";

export interface VoiceDashboardMetrics {
  speechClarity: number;
  speakingSpeed: { wpm: number; classification: SpeakingSpeedClassification };
  speakingDominance: { ratio: number; classification: SpeakingDominanceClassification };
  intonationVariability?: number;
}

export interface TurnTakingEvent {
  timestampMs: number;
  silenceDurationMs: number;
  wasMultiClause: boolean;
  confidence: number;
}

export interface DisruptionInstance {
  type: string;
  triggeredAtExchange: number;
  resolved: boolean;
  attempts: number;
}

export interface PersonaIntensitySnapshot {
  exchangeIndex: number;
  intensity: number;
}

export interface RealisticModeMetrics {
  turnTakingEvents: TurnTakingEvent[];
  fallbackCount: number;
  fallbackRecoveryCount: number;
  backchannelCount: number;
  personaIntensityHistory: PersonaIntensitySnapshot[];
  disruptionOutcomes: DisruptionInstance[];
}

export interface SessionMetricsExtended extends SessionMetrics {
  turnTakingEvents: TurnTakingEvent[];
  fallbackCount: number;
  fallbackRecoveryCount: number;
  backchannelCount: number;
  personaIntensityHistory: PersonaIntensitySnapshot[];
  disruptionOutcomes: DisruptionInstance[];
  speakingDominanceRatio: number;
  estimatedWpm: number;
  realisticModeMetrics?: RealisticModeMetrics;
}
