import type { TelefunSessionState } from "../types";

// ── Timing Guards ──────────────────────────────────────────

export interface TelefunLongSpeechState {
  nonSilentStartTime: number | null;
  lastInterruptionTime: number;
}

export interface TelefunLongSpeechInput {
  now: number;
  isSilent: boolean;
  isDisconnected: boolean;
  isHeld: boolean;
  isMuted: boolean;
  isAiSpeaking: boolean;
  hasSession: boolean;
  thresholdMs?: number;
  cooldownMs?: number;
}

export function updateTelefunLongSpeechState(
  state: TelefunLongSpeechState,
  input: TelefunLongSpeechInput,
): { state: TelefunLongSpeechState; shouldInterrupt: boolean } {
  const thresholdMs = input.thresholdMs ?? 60000;
  const cooldownMs = input.cooldownMs ?? 60000;

  if (
    input.isDisconnected ||
    input.isHeld ||
    input.isMuted ||
    input.isAiSpeaking ||
    !input.hasSession
  ) {
    return {
      state: { ...state, nonSilentStartTime: null },
      shouldInterrupt: false,
    };
  }

  if (input.isSilent) {
    return {
      state: { ...state, nonSilentStartTime: null },
      shouldInterrupt: false,
    };
  }

  if (state.nonSilentStartTime === null) {
    return {
      state: { ...state, nonSilentStartTime: input.now },
      shouldInterrupt: false,
    };
  }

  const speechDuration = input.now - state.nonSilentStartTime;
  if (
    speechDuration >= thresholdMs &&
    input.now - state.lastInterruptionTime >= cooldownMs
  ) {
    return {
      state: {
        nonSilentStartTime: null,
        lastInterruptionTime: input.now,
      },
      shouldInterrupt: true,
    };
  }

  return { state, shouldInterrupt: false };
}

// ── Interruption Guards ─────────────────────────────────────

export type InterruptionClassification =
  | "noise"
  | "short_acknowledgment_candidate"
  | "valid_interruption_candidate";

export interface InterruptionGuardState {
  aiSpeakingStartedAt: number | null;
  nonSilentStartedAt: number | null;
  cooldownUntil: number;
}

export interface InterruptionGuardInput {
  now: number;
  isAiSpeaking: boolean;
  isSilent: boolean;
  rms: number;
  noiseFloor?: number;
  minDurationMs?: number;
  aiGracePeriodMs?: number;
  cooldownMs?: number;
}

export interface InterruptionGuardResult {
  state: InterruptionGuardState;
  classification: InterruptionClassification;
  shouldInterrupt: boolean;
}

const DEFAULT_NOISE_FLOOR = 0.01;
const DEFAULT_MIN_DURATION_MS = 550;
const DEFAULT_AI_GRACE_PERIOD_MS = 350;
const DEFAULT_COOLDOWN_MS = 2000;

export function updateInterruptionGuard(
  state: InterruptionGuardState,
  input: InterruptionGuardInput,
): InterruptionGuardResult {
  const noiseFloor = input.noiseFloor ?? DEFAULT_NOISE_FLOOR;
  const minDurationMs = input.minDurationMs ?? DEFAULT_MIN_DURATION_MS;
  const aiGracePeriodMs = input.aiGracePeriodMs ?? DEFAULT_AI_GRACE_PERIOD_MS;
  const cooldownMs = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;

  const nextState: InterruptionGuardState = { ...state };

  if (input.isAiSpeaking) {
    if (nextState.aiSpeakingStartedAt === null) {
      nextState.aiSpeakingStartedAt = input.now;
    }
  } else {
    nextState.aiSpeakingStartedAt = null;
    nextState.nonSilentStartedAt = null;
    return {
      state: nextState,
      classification: "noise",
      shouldInterrupt: false,
    };
  }

  if (input.now < nextState.cooldownUntil) {
    if (input.isSilent || input.rms <= noiseFloor) {
      nextState.nonSilentStartedAt = null;
      return {
        state: nextState,
        classification: "noise",
        shouldInterrupt: false,
      };
    }
    return {
      state: nextState,
      classification: "short_acknowledgment_candidate",
      shouldInterrupt: false,
    };
  }

  if (input.isSilent || input.rms <= noiseFloor) {
    nextState.nonSilentStartedAt = null;
    return {
      state: nextState,
      classification: "noise",
      shouldInterrupt: false,
    };
  }

  if (
    nextState.aiSpeakingStartedAt !== null &&
    input.now - nextState.aiSpeakingStartedAt < aiGracePeriodMs
  ) {
    return {
      state: nextState,
      classification: "short_acknowledgment_candidate",
      shouldInterrupt: false,
    };
  }

  if (nextState.nonSilentStartedAt === null) {
    nextState.nonSilentStartedAt = input.now;
    return {
      state: nextState,
      classification: "short_acknowledgment_candidate",
      shouldInterrupt: false,
    };
  }

  const durationMs = input.now - nextState.nonSilentStartedAt;
  if (durationMs < minDurationMs) {
    return {
      state: nextState,
      classification: "short_acknowledgment_candidate",
      shouldInterrupt: false,
    };
  }

  nextState.nonSilentStartedAt = null;
  nextState.cooldownUntil = input.now + cooldownMs;

  return {
    state: nextState,
    classification: "valid_interruption_candidate",
    shouldInterrupt: true,
  };
}

// ── Stalled Response Guards ────────────────────────────────

export interface StalledResponseState {
  waitingForModelSince: number | null;
  lastModelEventAt: number | null;
  recoveryLevel: 0 | 1 | 2 | 3;
}

export interface StalledResponseInput {
  now: number;
  sessionState: TelefunSessionState;
  responseStartTimeoutMs?: number;
  midResponseTimeoutMs?: number;
}

export type StalledResponseAction =
  | "none"
  | "mark_recovering"
  | "soft_nudge"
  | "terminate";

export interface StalledResponseResult {
  state: StalledResponseState;
  isStalled: boolean;
  action: StalledResponseAction;
  timeoutType: "none" | "response_start" | "mid_response";
}

const DEFAULT_RESPONSE_START_TIMEOUT_MS = 12000;
const DEFAULT_MID_RESPONSE_TIMEOUT_MS = 15000;

export function markWaitingForModel(
  state: StalledResponseState,
  now: number,
): StalledResponseState {
  return {
    ...state,
    waitingForModelSince: now,
    recoveryLevel: 0,
  };
}

export function markModelActivity(
  state: StalledResponseState,
  now: number,
): StalledResponseState {
  return {
    ...state,
    waitingForModelSince: null,
    lastModelEventAt: now,
    recoveryLevel: 0,
  };
}

// ── Realistic Mode Resolution ─────────────────────────────

export interface RealisticModeConfig {
  enabled: boolean;
  personaType:
    | "angry"
    | "confused"
    | "rushed"
    | "passive"
    | "critical"
    | "cooperative";
  disruptionTypes?: string[];
}

const CONSUMER_TYPE_ID_TO_PERSONA: Record<
  string,
  RealisticModeConfig["personaType"]
> = {
  marah: "angry",
  bingung: "confused",
  kritis: "critical",
  ramah: "cooperative",
  "terburu-buru": "rushed",
  pasrah: "passive",
};

const FALLBACK_PERSONA: RealisticModeConfig["personaType"] = "cooperative";

export function resolveTelefunRealisticModeConfig(
  config: any,
): RealisticModeConfig {
  if (!config || !config.realisticModeEnabled) {
    return { enabled: false, personaType: FALLBACK_PERSONA };
  }

  const consumerTypeId: string | undefined =
    config.consumerType?.id || config.activeConsumerType?.id;

  return {
    enabled: true,
    personaType:
      CONSUMER_TYPE_ID_TO_PERSONA[consumerTypeId ?? ""] ?? FALLBACK_PERSONA,
    disruptionTypes: config.realisticModeDisruptionTypes || [],
  };
}
