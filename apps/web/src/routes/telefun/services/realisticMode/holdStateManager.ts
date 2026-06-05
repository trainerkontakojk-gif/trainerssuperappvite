/**
 * Hold State Manager — Pure Function Guard
 *
 * Coordinates hold state exclusively from the UI Hold button. Tracks consent
 * context for rude-hold detection. Instruction phrases from the Short Response
 * Classifier are treated only as consent requests and never activate hold.
 *
 * Key behaviors:
 * - UI button press is the exclusive source of hold activation
 * - Consent context tracks hold requests and consumer responses
 * - Hold activation is never blocked; consent determines rude hold
 * - During active hold: mic audio suppressed, Gemini audio blocked,
 *   all engines suspended
 * - Hold music and Gemini audio are mutually exclusive
 * - Timer limits are assessment thresholds. Only explicit UI release or session
 *   finalization deactivates hold.
 * - Hold release resets all engine timers and resumes normal processing
 */

import type {
  HoldState,
  HoldInput,
  HoldResult,
  ConsentContext,
  RudeHoldReason,
} from "./types";
import {
  TELEFUN_FIRST_HOLD_LIMIT_MS,
  TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS,
} from "@trainers/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max age of a hold request (ms) for valid consent. */
const CONSENT_REQUEST_TTL_MS = 15000;

// ---------------------------------------------------------------------------
// Initial State Factories
// ---------------------------------------------------------------------------

/**
 * Creates the initial hold state with no active hold and zero hold count.
 */
export function initializeHoldState(): HoldState {
  return {
    source: "none",
    activeSince: null,
    uiTimerDurationMs: null,
    holdCount: 0,
  };
}

/**
 * Creates an initial consent context with no requests or responses.
 */
export function createInitialConsentContext(): ConsentContext {
  return {
    lastHoldRequestAt: null,
    lastConsumerResponseAt: null,
  };
}

// ---------------------------------------------------------------------------
// Consent Validation
// ---------------------------------------------------------------------------

/**
 * Validates whether the current consent context represents valid consent
 * for a hold activation.
 *
 * Returns (isRudeHold, rudeHoldReason) pair.
 */
export function validateHoldConsent(
  now: number,
  consent: ConsentContext,
): { isRudeHold: boolean; rudeHoldReason: RudeHoldReason } {
  if (consent.lastHoldRequestAt === null) {
    return { isRudeHold: true, rudeHoldReason: "no_request" };
  }

  if (now - consent.lastHoldRequestAt > CONSENT_REQUEST_TTL_MS) {
    return { isRudeHold: true, rudeHoldReason: "stale_request" };
  }

  if (
    consent.lastConsumerResponseAt === null ||
    consent.lastConsumerResponseAt <= consent.lastHoldRequestAt
  ) {
    return { isRudeHold: true, rudeHoldReason: "no_consumer_response" };
  }

  return { isRudeHold: false, rudeHoldReason: null };
}

// ---------------------------------------------------------------------------
// Pure Function Guard
// ---------------------------------------------------------------------------

/**
 * Evaluates the current hold state and determines the next action to take.
 * This is a pure function — no side effects.
 *
 * The UI button is the exclusive source of hold activation. NLP/phrase-based
 * hold detection is removed — instruction phrases are recorded as consent
 * requests in the consent context, not as hold activation triggers.
 */
export function evaluateHoldState(
  state: HoldState,
  input: HoldInput,
): HoldResult {
  // --- UI button released: deactivate hold ---
  if (input.uiButtonReleased && state.source !== "none") {
    return buildDeactivateResult(state);
  }

  // --- UI button pressed: always activates UI hold ---
  if (input.uiButtonPressed) {
    return buildActivateUiResult(state, input);
  }

  // --- Maintain current state ---
  if (state.source !== "none") {
    return buildActiveResult(state);
  }

  return buildInactiveResult(state);
}

// ---------------------------------------------------------------------------
// Result Builders (internal helpers)
// ---------------------------------------------------------------------------

/**
 * Builds a result for UI hold activation.
 * Increments holdCount, computes timer duration, and validates consent.
 */
function buildActivateUiResult(state: HoldState, input: HoldInput): HoldResult {
  const newHoldCount =
    state.source === "none" ? state.holdCount + 1 : state.holdCount;
  const timerDuration =
    newHoldCount === 1
      ? TELEFUN_FIRST_HOLD_LIMIT_MS
      : TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS;

  const { isRudeHold, rudeHoldReason } = validateHoldConsent(
    input.now,
    input.consentContext,
  );

  return {
    state: {
      source: "ui",
      activeSince: input.now,
      uiTimerDurationMs: timerDuration,
      holdCount: newHoldCount,
    },
    action: "activate_ui_hold",
    suppressMicAudio: true,
    suppressGeminiAudio: true,
    suspendEngines: true,
    isRudeHold,
    rudeHoldReason,
  };
}

/**
 * Builds a result for hold deactivation.
 * Resets source to 'none' and all suppress flags to false.
 * Rude hold flags are reset on deactivation.
 */
function buildDeactivateResult(state: HoldState): HoldResult {
  return {
    state: {
      source: "none",
      activeSince: null,
      uiTimerDurationMs: null,
      holdCount: state.holdCount,
    },
    action: "deactivate_hold",
    suppressMicAudio: false,
    suppressGeminiAudio: false,
    suspendEngines: false,
    isRudeHold: false,
    rudeHoldReason: null,
  };
}

/**
 * Builds a result for maintaining an active hold state (no action change).
 */
function buildActiveResult(state: HoldState): HoldResult {
  return {
    state,
    action: "none",
    suppressMicAudio: true,
    suppressGeminiAudio: true,
    suspendEngines: true,
    isRudeHold: false,
    rudeHoldReason: null,
  };
}

/**
 * Builds a result for maintaining an inactive state (no hold active).
 */
function buildInactiveResult(state: HoldState): HoldResult {
  return {
    state,
    action: "none",
    suppressMicAudio: false,
    suppressGeminiAudio: false,
    suspendEngines: false,
    isRudeHold: false,
    rudeHoldReason: null,
  };
}
