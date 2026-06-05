import type { SessionMetrics } from "@trainers/types";

export type { TelefunSessionState } from "../../types";

// ---------------------------------------------------------------------------
// Core Enums / Union Types
// ---------------------------------------------------------------------------

export type ConsumerPersonaType =
  | "angry"
  | "confused"
  | "rushed"
  | "passive"
  | "critical"
  | "cooperative";

export type ConversationPhase =
  | "greeting"
  | "problem_statement"
  | "explanation"
  | "negotiation"
  | "closing";

export type ShortResponseCategory =
  | "acknowledgement"
  | "instruction"
  | "question"
  | "closing";

export type DisruptionType =
  | "technical_term_confusion"
  | "repeated_question"
  | "misunderstanding"
  | "interruption"
  | "incomplete_data"
  | "unclear_voice"
  | "emotional_escalation";

// ---------------------------------------------------------------------------
// Existing Interfaces
// ---------------------------------------------------------------------------

export interface PersonaLanguagePatterns {
  toneMarkers: string[];
  preferredFillers: string[];
  responseLength: "short" | "medium" | "long";
  interruptionLikelihood: number;
}

export interface TurnTakingEvent {
  timestampMs: number;
  silenceDurationMs: number;
  wasMultiClause: boolean;
  confidence: number;
}

export interface DisruptionInstance {
  type: DisruptionType;
  triggeredAtExchange: number;
  resolved: boolean;
  attempts: number;
}

export interface PersonaIntensitySnapshot {
  exchangeIndex: number;
  intensity: number;
}

export interface RealisticModeConfig {
  enabled: boolean;
  personaType: ConsumerPersonaType;
  disruptionTypes?: string[];
}

export type AnnotationCategory =
  | "strength"
  | "improvement_area"
  | "critical_moment"
  | "technique_used";
export type AnnotationMoment =
  | "missed_empathy"
  | "good_de_escalation"
  | "long_pause"
  | "interruption"
  | "technique_usage";

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
export type SpeakingDominanceClassification =
  | "dominated"
  | "balanced"
  | "passive";

export interface VoiceDashboardMetrics {
  speechClarity: number;
  speakingSpeed: {
    wpm: number;
    classification: SpeakingSpeedClassification;
  };
  speakingDominance: {
    ratio: number;
    classification: SpeakingDominanceClassification;
  };
  intonationVariability?: number;
}

export interface PersonaConfig {
  personaType: ConsumerPersonaType;
  initialIntensity: number;
  finalIntensity: number;
}

// ---------------------------------------------------------------------------
// Extended Session Metrics (realistic mode)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Hold State Manager Types
// ---------------------------------------------------------------------------

export type HoldSource = "none" | "ui";
export type RudeHoldReason =
  | "no_request"
  | "stale_request"
  | "no_consumer_response"
  | null;

export interface HoldState {
  source: HoldSource;
  activeSince: number | null;
  uiTimerDurationMs: number | null;
  holdCount: number;
}

export interface ConsentContext {
  lastHoldRequestAt: number | null;
  lastConsumerResponseAt: number | null;
}

export interface HoldInput {
  now: number;
  uiButtonPressed: boolean;
  uiButtonReleased: boolean;
  consentContext: ConsentContext;
  currentHoldActive: boolean;
}

export type HoldAction = "activate_ui_hold" | "deactivate_hold" | "none";

export interface HoldResult {
  state: HoldState;
  action: HoldAction;
  suppressMicAudio: boolean;
  suppressGeminiAudio: boolean;
  suspendEngines: boolean;
  isRudeHold: boolean;
  rudeHoldReason: RudeHoldReason;
}

// ---------------------------------------------------------------------------
// Backchannel Controller Types
// ---------------------------------------------------------------------------

export interface BackchannelState {
  agentSpeakingStartMs: number | null;
  lastBackchannelAt: number | null;
  nextBackchannelAt: number | null;
  suppressedUntil: number | null;
  isInstructionalContent: boolean;
}

export interface BackchannelInput {
  now: number;
  agentSpeaking: boolean;
  agentSpeakingDurationMs: number;
  isMicroPause: boolean;
  turnTakingEvaluating: boolean;
  transcriptionChunk?: string;
  personaType: ConsumerPersonaType;
}

export type BackchannelAction = "none" | "emit_backchannel" | "suppress";

export interface BackchannelResult {
  state: BackchannelState;
  action: BackchannelAction;
  utterance?: string;
  maxDurationMs?: number;
}

// ---------------------------------------------------------------------------
// Disruption Scenario Engine Types
// ---------------------------------------------------------------------------

export interface DisruptionState {
  activeDisruptions: DisruptionType[];
  exchangeCount: number;
  disruptionHistory: DisruptionInstance[];
  nextDisruptionAfterExchange: number;
}

export interface DisruptionInput {
  exchangeCount: number;
  agentResponse?: string;
  personaType: ConsumerPersonaType;
}

export type DisruptionAction =
  | "none"
  | { type: "trigger_disruption"; disruption: DisruptionType; prompt: string }
  | { type: "mark_resolved"; disruptionIndex: number };

export interface DisruptionResult {
  state: DisruptionState;
  action: DisruptionAction;
}

// ---------------------------------------------------------------------------
// Short Response Classifier Types
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  category: ShortResponseCategory;
  confidence: number;
  fallbackToAcknowledgement: boolean;
}

export interface ClassificationInput {
  transcription: string;
  durationMs: number;
  maxDurationMs?: number;
}
