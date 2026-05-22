import type { TelefunSessionState } from "../../types";

export interface ProlongedSilenceState {
  deadAirStartMs: number | null;
  escalationLevel: "none" | "check_in" | "closing_prompt" | "session_end";
  uiHoldActive: boolean;
  uiHoldDetectedAt: number | null;
  uiTimerDurationMs: number | null;
  lastAgentAudioAt: number | null;
}

export interface ProlongedSilenceInput {
  now: number;
  agentSpeaking: boolean;
  agentAudioDurationMs: number;
  sessionState: TelefunSessionState;
  uiHoldActive: boolean;
  uiHoldTimerExpired: boolean;
  uiTimerDurationMs?: number;
}

export interface ProlongedSilenceThresholds {
  checkInMs: number;
  closingPromptMs: number;
  sessionEndMs: number;
}

export type ProlongedSilenceAction =
  | "none"
  | "check_in"
  | "closing_prompt"
  | "end_session"
  | "reset_timers"
  | "activate_hold_ui"
  | "deactivate_hold";

export interface ProlongedSilenceResult {
  state: ProlongedSilenceState;
  action: ProlongedSilenceAction;
  thresholds: ProlongedSilenceThresholds;
}

const NORMAL_THRESHOLDS: ProlongedSilenceThresholds = {
  checkInMs: 8000,
  closingPromptMs: 20000,
  sessionEndMs: 35000,
};

const AGENT_SPEECH_RESET_THRESHOLD_MS = 300;
const DEFAULT_UI_TIMER_MS = 60000;

export function createInitialSilenceState(): ProlongedSilenceState {
  return {
    deadAirStartMs: null,
    escalationLevel: "none",
    uiHoldActive: false,
    uiHoldDetectedAt: null,
    uiTimerDurationMs: null,
    lastAgentAudioAt: null,
  };
}

function getThresholds(
  uiHoldActive: boolean,
  uiTimerDurationMs: number | null,
): ProlongedSilenceThresholds {
  if (uiHoldActive) {
    return {
      checkInMs: Infinity,
      closingPromptMs: Infinity,
      sessionEndMs: uiTimerDurationMs ?? DEFAULT_UI_TIMER_MS,
    };
  }

  return NORMAL_THRESHOLDS;
}

export function evaluateProlongedSilence(
  state: ProlongedSilenceState,
  input: ProlongedSilenceInput,
): ProlongedSilenceResult {
  if (input.sessionState === "ended") {
    return {
      state,
      action: "none",
      thresholds: getThresholds(state.uiHoldActive, state.uiTimerDurationMs),
    };
  }

  let nextState: ProlongedSilenceState = { ...state };

  if (nextState.uiHoldActive !== input.uiHoldActive) {
    nextState = {
      ...nextState,
      uiHoldActive: input.uiHoldActive,
      uiHoldDetectedAt: input.uiHoldActive ? input.now : null,
      uiTimerDurationMs: input.uiHoldActive
        ? (input.uiTimerDurationMs ?? DEFAULT_UI_TIMER_MS)
        : null,
      escalationLevel: "none",
    };
  } else if (
    input.uiHoldActive &&
    input.uiTimerDurationMs != null &&
    nextState.uiTimerDurationMs !== input.uiTimerDurationMs
  ) {
    nextState = {
      ...nextState,
      uiTimerDurationMs: input.uiTimerDurationMs,
    };
  }

  if (input.agentSpeaking) {
    nextState.lastAgentAudioAt = input.now;

    if (input.agentAudioDurationMs >= AGENT_SPEECH_RESET_THRESHOLD_MS) {
      nextState = {
        ...nextState,
        deadAirStartMs: null,
        escalationLevel: "none",
      };
    }

    return {
      state: nextState,
      action: "none",
      thresholds: getThresholds(
        nextState.uiHoldActive,
        nextState.uiTimerDurationMs,
      ),
    };
  }

  if (nextState.deadAirStartMs === null) {
    nextState.deadAirStartMs = input.now;
  }

  const thresholds = getThresholds(
    nextState.uiHoldActive,
    nextState.uiTimerDurationMs,
  );
  const deadAirDuration = input.now - nextState.deadAirStartMs;

  if (input.uiHoldActive && input.uiHoldTimerExpired) {
    return {
      state: {
        ...nextState,
        escalationLevel: "session_end",
      },
      action: "end_session",
      thresholds,
    };
  }

  if (
    deadAirDuration >= thresholds.sessionEndMs &&
    nextState.escalationLevel !== "session_end"
  ) {
    return {
      state: { ...nextState, escalationLevel: "session_end" },
      action: "end_session",
      thresholds,
    };
  }

  if (
    deadAirDuration >= thresholds.closingPromptMs &&
    nextState.escalationLevel !== "closing_prompt" &&
    nextState.escalationLevel !== "session_end"
  ) {
    return {
      state: { ...nextState, escalationLevel: "closing_prompt" },
      action: "closing_prompt",
      thresholds,
    };
  }

  if (
    deadAirDuration >= thresholds.checkInMs &&
    nextState.escalationLevel === "none"
  ) {
    return {
      state: { ...nextState, escalationLevel: "check_in" },
      action: "check_in",
      thresholds,
    };
  }

  return {
    state: nextState,
    action: "none",
    thresholds,
  };
}
