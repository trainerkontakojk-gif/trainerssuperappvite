/**
 * Realistic Mode Orchestrator
 *
 * Coordinates all real-time engines (Turn-Taking, Fallback Response Manager,
 * Prolonged Silence Handler, Persona State Machine, Hold State Manager,
 * Backchannel Controller, Disruption Scenario Engine, Short Response Classifier)
 * within the LiveSession.
 *
 * @module RealisticModeOrchestrator
 */

import type {
  ConsumerPersonaType,
  ConversationPhase,
  TelefunSessionState,
  TurnTakingEvent,
  PersonaIntensitySnapshot,
  RealisticModeConfig,
  DisruptionInstance,
  HoldState,
  ConsentContext,
  BackchannelState,
  DisruptionState,
  ClassificationInput,
  ClassificationResult,
} from "./types";

export type { RealisticModeConfig } from "./types";

import {
  evaluateTurnTaking,
  createInitialTurnTakingState,
  type TurnTakingState,
} from "./turnTakingEngine";

import {
  evaluateFallback,
  createInitialFallbackState,
  type FallbackState,
} from "./fallbackResponseManager";

import {
  evaluateProlongedSilence,
  createInitialSilenceState,
  type ProlongedSilenceState,
} from "./prolongedSilenceHandler";

import {
  initializePersona,
  reducePersonaState,
  type PersonaState,
} from "./personaStateMachine";

import {
  initializeHoldState,
  createInitialConsentContext,
  evaluateHoldState,
} from "./holdStateManager";

import {
  createInitialBackchannelState,
  evaluateBackchannel,
} from "./backchannelController";

import {
  initializeDisruptions,
  evaluateDisruption,
} from "./disruptionScenarioEngine";

import { classifyShortResponse } from "./shortResponseClassifier";

// ---------------------------------------------------------------------------
// Orchestrator Actions (emitted to LiveSession)
// ---------------------------------------------------------------------------

export type OrchestratorAction =
  | { type: "none" }
  | { type: "inject_prompt"; text: string; source: string }
  | { type: "session_recovery" }
  | { type: "end_session"; source: string }
  | {
      type: "hold_state_changed";
      suppressMicAudio: boolean;
      suppressGeminiAudio: boolean;
      suspendEngines: boolean;
      isRudeHold: boolean;
      rudeHoldReason: string | null;
    }
  | { type: "emit_backchannel"; utterance: string; maxDurationMs: number }
  | { type: "trigger_disruption"; disruption: string; prompt: string }
  | { type: "mark_disruption_resolved"; disruptionIndex: number }
  | { type: "classify_short_response"; result: ClassificationResult };

// ---------------------------------------------------------------------------
// Orchestrator Class
// ---------------------------------------------------------------------------

export class RealisticModeOrchestrator {
  private enabled: boolean;
  private personaType: ConsumerPersonaType;

  // Engine states
  private turnTakingState: TurnTakingState;
  private fallbackState: FallbackState;
  private silenceState: ProlongedSilenceState;
  private personaState: PersonaState;
  private holdState: HoldState;
  private consentContext: ConsentContext;
  private backchannelState: BackchannelState;
  private disruptionState: DisruptionState | null = null;

  // Coordination flags
  private _suspendEngines: boolean = false;
  private _suppressMicAudio: boolean = false;
  private _suppressGeminiAudio: boolean = false;

  // Tracking
  private conversationPhase: ConversationPhase = "greeting";
  private exchangeCount: number = 0;
  private agentStoppedSpeakingAt: number | null = null;
  private holdStartTime: number | null = null;
  private holdTimerDuration: number | null = null;

  // Metrics
  private turnTakingEvents: TurnTakingEvent[] = [];
  private fallbackCount: number = 0;
  private fallbackRecoveryCount: number = 0;
  private backchannelCount: number = 0;
  private personaIntensityHistory: PersonaIntensitySnapshot[] = [];
  private disruptionOutcomes: DisruptionInstance[] = [];
  private isRudeHold: boolean = false;

  constructor(config: RealisticModeConfig) {
    this.enabled = config.enabled;
    this.personaType = config.personaType;

    // Initialize all engine states
    this.turnTakingState = createInitialTurnTakingState();
    this.fallbackState = createInitialFallbackState();
    this.silenceState = createInitialSilenceState();
    this.personaState = initializePersona(config.personaType);
    this.holdState = initializeHoldState();
    this.consentContext = createInitialConsentContext();
    this.backchannelState = createInitialBackchannelState();

    // Initialize disruption engine if disruption types are configured
    if (config.disruptionTypes && config.disruptionTypes.length > 0) {
      this.disruptionState = initializeDisruptions(
        config.disruptionTypes as any,
        config.disruptionTypes.length,
      );
    }

    // Record initial persona intensity
    this.personaIntensityHistory.push({
      exchangeIndex: 0,
      intensity: this.personaState.emotionalIntensity,
    });
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  get isEnabled(): boolean {
    return this.enabled;
  }
  get emotionalIntensity(): number {
    return this.personaState.emotionalIntensity;
  }
  get currentPhase(): ConversationPhase {
    return this.conversationPhase;
  }
  get suspendEngines(): boolean {
    return this._suspendEngines;
  }
  get suppressMicAudio(): boolean {
    return this._suppressMicAudio;
  }
  get suppressGeminiAudio(): boolean {
    return this._suppressGeminiAudio;
  }

  // ---------------------------------------------------------------------------
  // Hold State Management
  // ---------------------------------------------------------------------------

  /**
   * Evaluates hold state input. The UI button is the exclusive source of
   * hold activation. Integrates with the pure function HoldStateManager.
   */
  evaluateHoldStateInput(input: {
    now: number;
    uiButtonPressed: boolean;
    uiButtonReleased: boolean;
  }): OrchestratorAction {
    if (!this.enabled) return { type: "none" };

    const holdResult = evaluateHoldState(this.holdState, {
      now: input.now,
      uiButtonPressed: input.uiButtonPressed,
      uiButtonReleased: input.uiButtonReleased,
      consentContext: this.consentContext,
      currentHoldActive: this.holdState.source !== "none",
    });

    this.holdState = holdResult.state;
    this._suppressMicAudio = holdResult.suppressMicAudio;
    this._suppressGeminiAudio = holdResult.suppressGeminiAudio;
    this._suspendEngines = holdResult.suspendEngines;
    this.isRudeHold = holdResult.isRudeHold;

    if (holdResult.action === "activate_ui_hold") {
      this.holdStartTime = input.now;
      this.holdTimerDuration = holdResult.state.uiTimerDurationMs;
    } else if (holdResult.action === "deactivate_hold") {
      this.holdStartTime = null;
      this.holdTimerDuration = null;
      // Reset all engine timers on hold release
      this.fallbackState = { ...this.fallbackState, waitingSince: null };
      this.silenceState = createInitialSilenceState();
      this.agentStoppedSpeakingAt = null;
    }

    return {
      type: "hold_state_changed",
      suppressMicAudio: holdResult.suppressMicAudio,
      suppressGeminiAudio: holdResult.suppressGeminiAudio,
      suspendEngines: holdResult.suspendEngines,
      isRudeHold: holdResult.isRudeHold,
      rudeHoldReason: holdResult.rudeHoldReason,
    };
  }

  /**
   * Records a consent request (e.g., "mohon ditunggu" instruction phrase)
   * into the consent context for rude-hold detection.
   */
  recordConsentRequest(now: number): void {
    this.consentContext = {
      ...this.consentContext,
      lastHoldRequestAt: now,
    };
  }

  /**
   * Records a consumer response for rude-hold detection.
   */
  recordConsumerResponse(now: number): void {
    this.consentContext = {
      ...this.consentContext,
      lastConsumerResponseAt: now,
    };
  }

  /**
   * Returns whether the current hold is considered rude.
   */
  get isCurrentHoldRude(): boolean {
    return this.isRudeHold;
  }

  // ---------------------------------------------------------------------------
  // Backchannel Management
  // ---------------------------------------------------------------------------

  /**
   * Evaluates whether to emit a backchannel signal during agent speech.
   */
  evaluateBackchannel(input: {
    now: number;
    agentSpeaking: boolean;
    agentSpeakingDurationMs: number;
    isMicroPause: boolean;
    turnTakingEvaluating: boolean;
    transcriptionChunk?: string;
  }): OrchestratorAction {
    if (!this.enabled || this._suspendEngines) return { type: "none" };

    const result = evaluateBackchannel(this.backchannelState, {
      now: input.now,
      agentSpeaking: input.agentSpeaking,
      agentSpeakingDurationMs: input.agentSpeakingDurationMs,
      isMicroPause: input.isMicroPause,
      turnTakingEvaluating: input.turnTakingEvaluating,
      transcriptionChunk: input.transcriptionChunk,
      personaType: this.personaType,
    });

    this.backchannelState = result.state;

    if (result.action === "emit_backchannel" && result.utterance) {
      this.backchannelCount++;
      return {
        type: "emit_backchannel",
        utterance: result.utterance,
        maxDurationMs: result.maxDurationMs ?? 800,
      };
    }

    return { type: "none" };
  }

  // ---------------------------------------------------------------------------
  // Disruption Management
  // ---------------------------------------------------------------------------

  /**
   * Evaluates whether to trigger or resolve a disruption based on
   * exchange count and agent response.
   */
  evaluateDisruption(input: {
    now: number;
    agentResponse?: string;
  }): OrchestratorAction {
    if (!this.enabled || this._suspendEngines || !this.disruptionState) {
      return { type: "none" };
    }

    const result = evaluateDisruption(this.disruptionState, {
      exchangeCount: this.exchangeCount,
      agentResponse: input.agentResponse,
      personaType: this.personaType,
    });

    this.disruptionState = result.state;
    this.disruptionOutcomes = result.state.disruptionHistory;

    if (
      typeof result.action === "object" &&
      result.action.type === "trigger_disruption"
    ) {
      return {
        type: "trigger_disruption",
        disruption: result.action.disruption,
        prompt: result.action.prompt,
      };
    }

    if (
      typeof result.action === "object" &&
      result.action.type === "mark_resolved"
    ) {
      return {
        type: "mark_disruption_resolved",
        disruptionIndex: result.action.disruptionIndex,
      };
    }

    return { type: "none" };
  }

  // ---------------------------------------------------------------------------
  // Short Response Classification
  // ---------------------------------------------------------------------------

  /**
   * Classifies a short agent response into a semantic category.
   */
  evaluateShortResponse(input: ClassificationInput): OrchestratorAction {
    if (!this.enabled) return { type: "none" };

    const result = classifyShortResponse(input);

    // If the response is an instruction phrase, record consent request
    if (
      result.category === "instruction" &&
      !result.fallbackToAcknowledgement
    ) {
      this.recordConsentRequest(Date.now());
    }

    return {
      type: "classify_short_response",
      result,
    };
  }

  // ---------------------------------------------------------------------------
  // Original Engine Evaluations
  // ---------------------------------------------------------------------------

  evaluateAudioFrame(input: {
    now: number;
    isSilent: boolean;
    rms: number;
    sessionState: TelefunSessionState;
  }) {
    if (!this.enabled || this._suspendEngines) {
      return { action: "none", silenceThresholdMs: 1500, confidence: 0 };
    }

    const result = evaluateTurnTaking(this.turnTakingState, {
      ...input,
      sessionState: input.sessionState,
    });
    this.turnTakingState = result.state;

    if (result.action === "end_of_turn") {
      this.turnTakingEvents.push({
        timestampMs: input.now,
        silenceDurationMs: result.silenceThresholdMs,
        wasMultiClause: this.turnTakingState.isMultiClause,
        confidence: result.confidence,
      });
    }

    return result;
  }

  evaluateFallbackResponse(input: {
    now: number;
    sessionState: TelefunSessionState;
  }): OrchestratorAction {
    if (!this.enabled || this._suspendEngines) return { type: "none" };

    const result = evaluateFallback(this.fallbackState, {
      now: input.now,
      sessionState: input.sessionState,
      agentStoppedSpeakingAt: this.agentStoppedSpeakingAt,
      personaType: this.personaType,
      conversationPhase: this.conversationPhase,
    });

    this.fallbackState = result.state;

    if (result.action === "inject_fallback" && result.utterance) {
      this.fallbackCount++;
      return {
        type: "inject_prompt",
        text: `[FALLBACK] ${result.utterance}`,
        source: "fallback_manager",
      };
    } else if (result.action === "session_recovery") {
      this.fallbackRecoveryCount++;
      return { type: "session_recovery" };
    }

    return { type: "none" };
  }

  evaluateProlongedSilence(input: {
    now: number;
    agentSpeaking: boolean;
    agentAudioDurationMs: number;
    sessionState: TelefunSessionState;
    uiHoldActive: boolean;
  }): OrchestratorAction {
    if (!this.enabled || this._suspendEngines) return { type: "none" };

    const result = evaluateProlongedSilence(this.silenceState, {
      ...input,
      uiHoldTimerExpired: false,
    });
    this.silenceState = result.state;

    if (result.action === "check_in") {
      return {
        type: "inject_prompt",
        text: "[SYSTEM] Agen sudah diam cukup lama. Tanyakan apakah agen masih di sana.",
        source: "silence_handler",
      };
    } else if (result.action === "closing_prompt") {
      return {
        type: "inject_prompt",
        text: "[SYSTEM] Sampaikan niat untuk menutup telepon karena agen diam terlalu lama.",
        source: "silence_handler",
      };
    } else if (result.action === "end_session") {
      return { type: "end_session", source: "silence_handler" };
    }

    return { type: "none" };
  }

  // ---------------------------------------------------------------------------
  // Session Lifecycle Hooks
  // ---------------------------------------------------------------------------

  onAgentStartSpeaking(_now: number): void {
    this.agentStoppedSpeakingAt = null;
    this.fallbackState = {
      ...this.fallbackState,
      waitingSince: null,
    };
  }

  onAgentStopSpeaking(now: number): void {
    this.agentStoppedSpeakingAt = now;
  }

  onConsumerResponse(now: number): void {
    this.agentStoppedSpeakingAt = null;
    this.fallbackState = {
      ...this.fallbackState,
      waitingSince: null,
    };
    // Record consumer response for consent context
    this.recordConsumerResponse(now);
  }

  onModelTurnComplete(): OrchestratorAction {
    if (!this.enabled) return { type: "none" };
    this.exchangeCount++;
    this.updateConversationPhase();

    const res = reducePersonaState(this.personaState, {
      type: "exchange_complete",
    });
    this.personaState = res.state;

    this.personaIntensityHistory.push({
      exchangeIndex: this.exchangeCount,
      intensity: this.personaState.emotionalIntensity,
    });

    // Also trigger disruption evaluation after each exchange
    return this.evaluateDisruption({ now: Date.now() });
  }

  private updateConversationPhase(): void {
    if (this.exchangeCount <= 1) {
      this.conversationPhase = "greeting";
    } else if (this.exchangeCount <= 4) {
      this.conversationPhase = "problem_statement";
    } else if (this.exchangeCount <= 6) {
      this.conversationPhase = "explanation";
    } else if (this.exchangeCount <= 8) {
      this.conversationPhase = "negotiation";
    } else {
      this.conversationPhase = "closing";
    }
  }

  // ---------------------------------------------------------------------------
  // Metrics & Config Getters
  // ---------------------------------------------------------------------------

  getMetrics() {
    return {
      turnTakingEvents: this.turnTakingEvents,
      fallbackCount: this.fallbackCount,
      fallbackRecoveryCount: this.fallbackRecoveryCount,
      backchannelCount: this.backchannelCount,
      personaIntensityHistory: this.personaIntensityHistory,
      disruptionOutcomes: this.disruptionOutcomes,
    };
  }

  getPersonaConfig() {
    return {
      personaType: this.personaType,
      initialIntensity:
        this.personaIntensityHistory[0]?.intensity ??
        this.personaState.emotionalIntensity,
      finalIntensity: this.personaState.emotionalIntensity,
    };
  }
}
