export type SessionPhase = "active" | "expired" | "closed";

export function classifyTextBand(textLength: number): "short" | "normal" | "long" {
  if (textLength <= 25) return "short";
  if (textLength <= 90) return "normal";
  return "long";
}

export function isAgentGivingSolution(lastAgentText: string | undefined): boolean {
  if (!lastAgentText) return false;
  return lastAgentText.length > 90;
}

export function isSlowEligible(_params: {
  consumerTurnIndex: number;
  consecutiveSlowCount: number;
  totalSlowCount: number;
  sessionDurationMinutes: number;
  remainingSeconds: number;
  elapsedSeconds?: number;
  totalDurationSeconds?: number;
}): boolean {
  // Deprecated: minute-aware pacing replaces slow injection with fast/delayed distribution.
  // Kept for backward compat; always false so legacy slow path is not taken.
  return false;
}

export const FAST_CHANCE = 0.18;

export function shouldUseFastSameMinute(params: { remainingSeconds: number }): boolean {
  if (!Number.isFinite(params.remainingSeconds) || params.remainingSeconds < 30) return false;
  return Math.random() < FAST_CHANCE;
}

export const REALISTIC_RANGES: Record<string, { minMs: number; maxMs: number }> = {
  short: { minMs: 45000, maxMs: 65000 },
  normal: { minMs: 60000, maxMs: 85000 },
  long: { minMs: 75000, maxMs: 95000 },
  slow: { minMs: 45000, maxMs: 65000 },
  follow_up: { minMs: 1200, maxMs: 2500 },
  greeting_reply: { minMs: 35000, maxMs: 60000 },
};

export const FAST_SAME_MINUTE_RANGES: Record<string, { minMs: number; maxMs: number }> = {
  short: { minMs: 5000, maxMs: 12000 },
  normal: { minMs: 10000, maxMs: 18000 },
  long: { minMs: 15000, maxMs: 25000 },
  slow: { minMs: 5000, maxMs: 12000 },
  follow_up: { minMs: 1200, maxMs: 2500 },
  greeting_reply: { minMs: 7000, maxMs: 15000 },
};

export function getRealisticRange(band: string, isFast: boolean): { minMs: number; maxMs: number } {
  const source = isFast ? FAST_SAME_MINUTE_RANGES : REALISTIC_RANGES;
  return source[band] ?? source.normal;
}

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
