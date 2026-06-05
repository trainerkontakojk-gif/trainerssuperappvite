import {
  TELEFUN_FIRST_HOLD_LIMIT_MS,
  TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS,
  type TelefunHoldInterval,
  type TelefunHoldMetrics,
} from "@trainers/types";

export interface ActiveHold {
  sequence: number;
  startedAtMs: number;
  limitMs: number;
}

export interface HoldTrackerState {
  active: ActiveHold | null;
  intervals: TelefunHoldInterval[];
}

export function createHoldTrackerState(): HoldTrackerState {
  return { active: null, intervals: [] };
}

export function startHold(
  state: HoldTrackerState,
  startedAtMs: number,
): HoldTrackerState {
  if (state.active) return state;
  const sequence = state.intervals.length + 1;
  const limitMs =
    sequence === 1
      ? TELEFUN_FIRST_HOLD_LIMIT_MS
      : TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS;
  return {
    ...state,
    active: { sequence, startedAtMs, limitMs },
  };
}

export function endHold(
  state: HoldTrackerState,
  endedAtMs: number,
): HoldTrackerState {
  if (!state.active) return state;
  const durationMs = Math.max(0, endedAtMs - state.active.startedAtMs);
  const exceededByMs = Math.max(0, durationMs - state.active.limitMs);
  const interval: TelefunHoldInterval = {
    sequence: state.active.sequence,
    startedAtMs: state.active.startedAtMs,
    endedAtMs,
    durationMs,
    limitMs: state.active.limitMs,
    exceededByMs,
  };
  return {
    ...state,
    active: null,
    intervals: [...state.intervals, interval],
  };
}

export function finalizeActiveHold(
  state: HoldTrackerState,
  endedAtMs: number,
): HoldTrackerState {
  if (!state.active) return state;
  return endHold(state, endedAtMs);
}

export function getActiveHoldSnapshot(
  state: HoldTrackerState,
  nowMs: number,
): { elapsedMs: number; remainingMs: number; overtimeMs: number } {
  if (!state.active) {
    return { elapsedMs: 0, remainingMs: 0, overtimeMs: 0 };
  }
  const elapsedMs = Math.max(0, nowMs - state.active.startedAtMs);
  const remainingMs = Math.max(0, state.active.limitMs - elapsedMs);
  const overtimeMs = Math.max(0, elapsedMs - state.active.limitMs);
  return { elapsedMs, remainingMs, overtimeMs };
}

export function summarizeHoldMetrics(
  state: HoldTrackerState,
): TelefunHoldMetrics {
  const intervals = state.intervals;
  const count = intervals.length;
  const totalDurationMs = intervals.reduce((sum, i) => sum + i.durationMs, 0);
  const longestDurationMs = intervals.reduce(
    (max, i) => Math.max(max, i.durationMs),
    0,
  );
  const exceededCount = intervals.filter((i) => i.exceededByMs > 0).length;
  return {
    count,
    totalDurationMs,
    longestDurationMs,
    exceededCount,
    intervals,
  };
}
