export type SessionPhase = "active" | "expired" | "closed";

export function classifyTextBand(textLength: number): "short" | "normal" | "long" {
  if (textLength <= 25) return "short";
  if (textLength <= 90) return "normal";
  return "long";
}

/**
 * How long the consumer takes to read the agent's messages since its last
 * reply, before it starts typing. Counted from the agent's last send.
 */
export function readingMs(
  agentTexts: string[],
  mode: "realistic" | "training_fast",
): number {
  const chars = agentTexts.reduce((sum, text) => sum + text.length, 0);
  return mode === "training_fast"
    ? Math.min(5000, chars * 12)
    : Math.min(20000, chars * 45);
}

/** Pause after the agent's last send before the turn goes out, so back-to-back messages are answered once. */
export const QUIET_WINDOW_MS = { realistic: 3000, training_fast: 1200 } as const;

/** Reading and typing speed per built-in consumer type; custom types use 1. */
const SPEED_FACTORS: Record<string, number> = {
  "terburu-buru": 0.6,
  marah: 0.75,
  bingung: 1.3,
  pasrah: 1.3,
};

export function consumerSpeedFactor(consumerTypeId: string): number {
  return SPEED_FACTORS[consumerTypeId] ?? 1;
}

export function isSlowEligible(params: {
  consumerTurnIndex: number;
  consecutiveSlowCount: number;
  totalSlowCount: number;
  sessionDurationMinutes: number;
  remainingSeconds: number;
  elapsedSeconds?: number;
  totalDurationSeconds?: number;
}): boolean {
  const {
    consumerTurnIndex,
    consecutiveSlowCount,
    totalSlowCount,
    sessionDurationMinutes,
    remainingSeconds,
    elapsedSeconds,
    totalDurationSeconds,
  } = params;
  if (consumerTurnIndex < 4) return false;
  if (consecutiveSlowCount >= 1) return false;
  if (remainingSeconds < 45) return false;
  if (
    elapsedSeconds !== undefined &&
    totalDurationSeconds !== undefined &&
    totalDurationSeconds > 0
  ) {
    const elapsedRatio = elapsedSeconds / totalDurationSeconds;
    if (elapsedRatio < 0.25) return false;
  }
  const maxSlow =
    sessionDurationMinutes <= 5 ? 1 : sessionDurationMinutes <= 15 ? 2 : 2;
  if (totalSlowCount >= maxSlow) return false;
  return Math.random() < 0.15;
}

export const REALISTIC_RANGES: Record<string, { minMs: number; maxMs: number }> = {
  short: { minMs: 1000, maxMs: 3000 },
  normal: { minMs: 5000, maxMs: 10000 },
  long: { minMs: 10000, maxMs: 20000 },
  slow: { minMs: 20000, maxMs: 30000 },
  follow_up: { minMs: 1200, maxMs: 2500 },
  greeting_reply: { minMs: 2000, maxMs: 6000 },
};

export const TRAINING_FAST_RANGES: Record<string, { minMs: number; maxMs: number }> = {
  short: { minMs: 800, maxMs: 1500 },
  normal: { minMs: 2000, maxMs: 4000 },
  long: { minMs: 4000, maxMs: 7000 },
  slow: { minMs: 800, maxMs: 1500 },
  follow_up: { minMs: 800, maxMs: 1500 },
  greeting_reply: { minMs: 500, maxMs: 1500 },
};

export function boundedRandom(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
