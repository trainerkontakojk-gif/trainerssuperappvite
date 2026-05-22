import type { TelefunSessionState } from "../../types";

export interface ContextualSignals {
  hasFallingIntonation: boolean;
  hasSentenceFinalParticle: boolean;
  hasConjunction: boolean;
  hasRisingIntonation: boolean;
  lastTranscriptionChunk: string;
}

export interface TurnTakingState {
  silenceStartMs: number | null;
  lastAudioRms: number;
  isMultiClause: boolean;
  contextualSignals: ContextualSignals;
  pendingEndOfTurn: boolean;
  responseDelayUntil: number | null;
}

export interface TurnTakingInput {
  now: number;
  isSilent: boolean;
  rms: number;
  transcriptionChunk?: string;
  pitchHz?: number;
  sessionState: TelefunSessionState;
}

export type TurnTakingAction =
  | "none"
  | "end_of_turn"
  | "extend_threshold"
  | "suppress_non_speech";

export interface TurnTakingResult {
  state: TurnTakingState;
  action: TurnTakingAction;
  silenceThresholdMs: number;
  confidence: number;
}

const DEFAULT_SILENCE_THRESHOLD_MS = 1500;
const EXTENDED_SILENCE_THRESHOLD_MS = 2000;
const RESPONSE_DELAY_MS = 400;
const NON_SPEECH_MAX_DURATION_MS = 300;
const SPEECH_RMS_THRESHOLD = 0.02;
const SENTENCE_FINAL_PARTICLES = ["ya", "kan", "lho", "sih"];
const CONJUNCTIONS = ["dan", "tapi", "karena", "jadi", "atau"];
const FALLING_INTONATION_THRESHOLD_HZ = 150;
const RISING_INTONATION_THRESHOLD_HZ = 250;

export function createInitialTurnTakingState(): TurnTakingState {
  return {
    silenceStartMs: null,
    lastAudioRms: 0,
    isMultiClause: false,
    contextualSignals: {
      hasFallingIntonation: false,
      hasSentenceFinalParticle: false,
      hasConjunction: false,
      hasRisingIntonation: false,
      lastTranscriptionChunk: "",
    },
    pendingEndOfTurn: false,
    responseDelayUntil: null,
  };
}

function normalizeChunk(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/, "");
}

function detectSentenceFinalParticle(text: string): boolean {
  const words = normalizeChunk(text).split(/\s+/);
  const lastWord = words[words.length - 1] ?? "";
  return SENTENCE_FINAL_PARTICLES.includes(lastWord);
}

function detectConjunction(text: string): boolean {
  const words = normalizeChunk(text).split(/\s+/);
  const lastWord = words[words.length - 1] ?? "";
  return CONJUNCTIONS.includes(lastWord);
}

function analyzeIntonation(pitchHz: number | undefined): {
  falling: boolean;
  rising: boolean;
} {
  if (pitchHz == null) {
    return { falling: false, rising: false };
  }

  return {
    falling: pitchHz <= FALLING_INTONATION_THRESHOLD_HZ,
    rising: pitchHz >= RISING_INTONATION_THRESHOLD_HZ,
  };
}

function hasCompletenessSignal(signals: ContextualSignals): boolean {
  return signals.hasFallingIntonation || signals.hasSentenceFinalParticle;
}

function hasAmbiguousSignals(signals: ContextualSignals): boolean {
  const hasCompletionSignal = hasCompletenessSignal(signals);
  const hasContinuationSignal =
    signals.hasConjunction || signals.hasRisingIntonation;
  return !hasCompletionSignal && !hasContinuationSignal;
}

export function evaluateTurnTaking(
  state: TurnTakingState,
  input: TurnTakingInput,
): TurnTakingResult {
  if (input.sessionState === "ended") {
    return {
      state,
      action: "none",
      silenceThresholdMs: DEFAULT_SILENCE_THRESHOLD_MS,
      confidence: 0,
    };
  }

  const nextState: TurnTakingState = {
    ...state,
    contextualSignals: { ...state.contextualSignals },
  };

  const intonation = analyzeIntonation(input.pitchHz);

  if (input.transcriptionChunk) {
    const chunk = input.transcriptionChunk;
    nextState.contextualSignals = {
      ...nextState.contextualSignals,
      hasSentenceFinalParticle: detectSentenceFinalParticle(chunk),
      hasConjunction: detectConjunction(chunk),
      hasFallingIntonation: intonation.falling,
      hasRisingIntonation: intonation.rising,
      lastTranscriptionChunk: chunk,
    };
  } else {
    nextState.contextualSignals = {
      ...nextState.contextualSignals,
      hasFallingIntonation: intonation.falling,
      hasRisingIntonation: intonation.rising,
    };
  }

  nextState.isMultiClause =
    nextState.contextualSignals.hasConjunction ||
    nextState.contextualSignals.hasRisingIntonation;

  nextState.lastAudioRms = input.rms;

  const silenceThresholdMs = nextState.isMultiClause
    ? EXTENDED_SILENCE_THRESHOLD_MS
    : DEFAULT_SILENCE_THRESHOLD_MS;

  if (!input.isSilent && input.rms < SPEECH_RMS_THRESHOLD) {
    if (
      state.silenceStartMs !== null &&
      input.now - state.silenceStartMs < NON_SPEECH_MAX_DURATION_MS
    ) {
      return {
        state: nextState,
        action: "suppress_non_speech",
        silenceThresholdMs,
        confidence: 0.9,
      };
    }

    if (state.silenceStartMs === null) {
      nextState.silenceStartMs = input.now;
      nextState.pendingEndOfTurn = true;
      return {
        state: nextState,
        action: "suppress_non_speech",
        silenceThresholdMs,
        confidence: 0.75,
      };
    }
  }

  if (!input.isSilent) {
    nextState.silenceStartMs = null;
    nextState.pendingEndOfTurn = false;
    nextState.responseDelayUntil = null;
    return {
      state: nextState,
      action: "none",
      silenceThresholdMs,
      confidence: 0,
    };
  }

  if (nextState.silenceStartMs === null) {
    nextState.silenceStartMs = input.now;
    nextState.pendingEndOfTurn = true;
    return {
      state: nextState,
      action: "none",
      silenceThresholdMs,
      confidence: 0.1,
    };
  }

  const silenceDuration = input.now - nextState.silenceStartMs;

  if (
    hasCompletenessSignal(nextState.contextualSignals) &&
    silenceDuration >= silenceThresholdMs
  ) {
    nextState.pendingEndOfTurn = false;
    nextState.responseDelayUntil = input.now + RESPONSE_DELAY_MS;
    return {
      state: nextState,
      action: "end_of_turn",
      silenceThresholdMs,
      confidence: 0.86,
    };
  }

  if (
    hasAmbiguousSignals(nextState.contextualSignals) &&
    silenceDuration >= EXTENDED_SILENCE_THRESHOLD_MS
  ) {
    nextState.pendingEndOfTurn = false;
    nextState.responseDelayUntil = input.now + RESPONSE_DELAY_MS;
    return {
      state: nextState,
      action: "end_of_turn",
      silenceThresholdMs: EXTENDED_SILENCE_THRESHOLD_MS,
      confidence: 0.62,
    };
  }

  if (silenceDuration >= silenceThresholdMs && nextState.isMultiClause) {
    return {
      state: nextState,
      action: "extend_threshold",
      silenceThresholdMs: EXTENDED_SILENCE_THRESHOLD_MS,
      confidence: 0.4,
    };
  }

  return {
    state: nextState,
    action: "none",
    silenceThresholdMs,
    confidence: 0.15,
  };
}
