/**
 * Backchannel Controller - Pure Function Guard
 *
 * Generates natural listening signals (backchannels) during agent speech
 * to simulate an engaged listener on the other end of the phone call.
 *
 * Key behaviors:
 * - Backchannel ONLY emits when ALL conditions met:
 *   agentSpeakingDurationMs > 5000, isMicroPause=true,
 *   (now - lastBackchannelAt) >= 3000, turnTakingEvaluating=false,
 *   agentSpeaking=true
 * - When agentSpeaking=false -> action is never 'emit_backchannel'
 * - Instructional content detection reduces interval to 4000-8000ms
 * - Max backchannel duration 800ms
 * - Suppress when turnTakingEvaluating=true
 */

import type {
  ConsumerPersonaType,
  BackchannelState,
  BackchannelInput,
  BackchannelResult,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum agent speaking duration before backchannel can emit (ms). */
const MIN_SPEAKING_DURATION_MS = 5000;

/** Minimum interval between consecutive backchannels (ms). */
const MIN_BACKCHANNEL_INTERVAL_MS = 3000;

/** Maximum duration of a backchannel utterance (ms). */
const MAX_BACKCHANNEL_DURATION_MS = 800;

/** Normal backchannel interval range (ms). */
const NORMAL_INTERVAL_MIN_MS = 5000;
const NORMAL_INTERVAL_MAX_MS = 12000;

/** Instructional content backchannel interval range (ms). */
const INSTRUCTIONAL_INTERVAL_MIN_MS = 4000;
const INSTRUCTIONAL_INTERVAL_MAX_MS = 8000;

/** Threshold for instructional content detection (agent speaking > 15s). */
const INSTRUCTIONAL_CONTENT_THRESHOLD_MS = 15000;

/**
 * Sequential markers in Indonesian that indicate instructional/multi-step content.
 * Used to detect when the agent is giving step-by-step instructions.
 */
const INSTRUCTIONAL_MARKERS: string[] = [
  "pertama",
  "kedua",
  "ketiga",
  "keempat",
  "kelima",
  "selanjutnya",
  "kemudian",
  "lalu",
  "langkah",
  "nomor satu",
  "nomor dua",
  "nomor tiga",
  "poin pertama",
  "poin kedua",
  "yang pertama",
  "yang kedua",
];

// ---------------------------------------------------------------------------
// Backchannel Utterance Pools (Indonesian)
// ---------------------------------------------------------------------------

/**
 * Persona-specific backchannel utterance pools.
 * Each persona has a distinct set of brief verbal signals.
 * Exported for testing.
 */
export const BACKCHANNEL_POOLS: Record<ConsumerPersonaType, string[]> = {
  angry: ["Terus?", "Lalu?", "Iya terus?", "Hmm.", "Trus?"],
  cooperative: ["Iya.", "Saya dengarkan.", "Oh begitu.", "Hmm.", "Baik."],
  confused: ["Hmm?", "Oh?", "Iya?", "Terus?", "Lalu?"],
  rushed: ["Iya.", "Hmm.", "Terus?", "Oke.", "Lanjut."],
  passive: ["Hmm.", "Iya.", "Oh.", "Ya."],
  critical: ["Hmm.", "Iya.", "Lalu?", "Terus?", "Oh begitu."],
};

// ---------------------------------------------------------------------------
// Initial State Factory
// ---------------------------------------------------------------------------

/**
 * Creates the initial backchannel state.
 */
export function createInitialBackchannelState(): BackchannelState {
  return {
    agentSpeakingStartMs: null,
    lastBackchannelAt: null,
    nextBackchannelAt: null,
    suppressedUntil: null,
    isInstructionalContent: false,
  };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Detects instructional/multi-step content in a transcription chunk.
 * Looks for sequential markers like "pertama", "kedua", "selanjutnya",
 * or enumeration patterns.
 */
function detectInstructionalContent(transcriptionChunk?: string): boolean {
  if (!transcriptionChunk) return false;

  const lowerChunk = transcriptionChunk.toLowerCase();

  // Check for sequential markers
  for (const marker of INSTRUCTIONAL_MARKERS) {
    if (lowerChunk.includes(marker)) {
      return true;
    }
  }

  // Check for enumeration patterns (e.g., "1.", "2.", "1)", "2)")
  if (/\b\d+[.)]\s/.test(transcriptionChunk)) {
    return true;
  }

  return false;
}

/**
 * Computes the next backchannel interval based on whether content is instructional.
 * Uses a deterministic midpoint for testability.
 */
function computeNextInterval(isInstructional: boolean): number {
  if (isInstructional) {
    return Math.floor(
      (INSTRUCTIONAL_INTERVAL_MIN_MS + INSTRUCTIONAL_INTERVAL_MAX_MS) / 2,
    );
  }
  return Math.floor((NORMAL_INTERVAL_MIN_MS + NORMAL_INTERVAL_MAX_MS) / 2);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluates whether a backchannel signal should be emitted given the
 * current state and input conditions.
 *
 * Backchannel emits ONLY when ALL conditions are met:
 * 1. agentSpeaking === true
 * 2. agentSpeakingDurationMs > 5000
 * 3. isMicroPause === true
 * 4. (now - lastBackchannelAt) >= 3000 (or lastBackchannelAt is null)
 * 5. turnTakingEvaluating === false
 *
 * When agentSpeaking === false, action is NEVER 'emit_backchannel'.
 * When turnTakingEvaluating === true, action is 'suppress'.
 */
export function evaluateBackchannel(
  state: BackchannelState,
  input: BackchannelInput,
): BackchannelResult {
  // --- Agent not speaking: suppress and reset ---
  if (!input.agentSpeaking) {
    return {
      state: {
        agentSpeakingStartMs: null,
        lastBackchannelAt: state.lastBackchannelAt,
        nextBackchannelAt: null,
        suppressedUntil: null,
        isInstructionalContent: false,
      },
      action: "suppress",
    };
  }

  // --- Turn-taking is evaluating: suppress backchannel ---
  if (input.turnTakingEvaluating) {
    return {
      state: {
        ...state,
        suppressedUntil: input.now,
      },
      action: "suppress",
    };
  }

  // --- Update instructional content detection ---
  const hasInstructionalContent =
    state.isInstructionalContent ||
    (input.agentSpeakingDurationMs >= INSTRUCTIONAL_CONTENT_THRESHOLD_MS &&
      detectInstructionalContent(input.transcriptionChunk));

  // --- Track agent speaking start ---
  const agentSpeakingStartMs =
    state.agentSpeakingStartMs ?? input.now - input.agentSpeakingDurationMs;

  // --- Check all emission conditions ---
  const speakingLongEnough =
    input.agentSpeakingDurationMs > MIN_SPEAKING_DURATION_MS;
  const isMicroPause = input.isMicroPause;
  const intervalRespected =
    state.lastBackchannelAt === null ||
    input.now - state.lastBackchannelAt >= MIN_BACKCHANNEL_INTERVAL_MS;

  const shouldEmit = speakingLongEnough && isMicroPause && intervalRespected;

  if (shouldEmit) {
    const utterance = getBackchannelUtterance(input.personaType, 5);
    const nextInterval = computeNextInterval(hasInstructionalContent);

    return {
      state: {
        agentSpeakingStartMs,
        lastBackchannelAt: input.now,
        nextBackchannelAt: input.now + nextInterval,
        suppressedUntil: null,
        isInstructionalContent: hasInstructionalContent,
      },
      action: "emit_backchannel",
      utterance,
      maxDurationMs: MAX_BACKCHANNEL_DURATION_MS,
    };
  }

  // --- No emission, update state ---
  const nextBackchannelAt =
    state.nextBackchannelAt ??
    input.now + computeNextInterval(hasInstructionalContent);

  return {
    state: {
      agentSpeakingStartMs,
      lastBackchannelAt: state.lastBackchannelAt,
      nextBackchannelAt,
      suppressedUntil: state.suppressedUntil,
      isInstructionalContent: hasInstructionalContent,
    },
    action: "none",
  };
}

/**
 * Selects a backchannel utterance from the persona-specific pool.
 * Uses emotional intensity to bias selection toward more assertive
 * or passive utterances within the pool.
 *
 * @param personaType - The active consumer persona type
 * @param emotionalIntensity - Current emotional intensity (1-10)
 * @returns A backchannel utterance string from the persona's pool
 */
export function getBackchannelUtterance(
  personaType: ConsumerPersonaType,
  emotionalIntensity: number,
): string {
  const pool = BACKCHANNEL_POOLS[personaType];

  if (!pool || pool.length === 0) {
    return "Hmm.";
  }

  // Use emotional intensity to bias index selection.
  // Higher intensity -> earlier items in pool (more assertive).
  // Lower intensity -> later items in pool (more passive).
  const normalizedIntensity = Math.max(1, Math.min(10, emotionalIntensity));
  const ratio = (normalizedIntensity - 1) / 9;
  const index = Math.floor(ratio * (pool.length - 1));

  return pool[index];
}
