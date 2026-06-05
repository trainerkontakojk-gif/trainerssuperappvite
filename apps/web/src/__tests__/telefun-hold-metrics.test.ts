import { describe, expect, it } from "vitest";
import {
  createHoldTrackerState,
  startHold,
  endHold,
  finalizeActiveHold,
  getActiveHoldSnapshot,
  summarizeHoldMetrics,
  type HoldTrackerState,
} from "../routes/telefun/services/holdMetrics";

function withActive(
  state: HoldTrackerState,
  startedAtMs: number,
): HoldTrackerState {
  const started = startHold(state, startedAtMs);
  expect(started.active).not.toBeNull();
  return started;
}

describe("HoldMetrics tracker", () => {
  it("uses 60 seconds for the first hold", () => {
    const started = withActive(createHoldTrackerState(), 0);
    const snap = getActiveHoldSnapshot(started, 60_000);
    expect(snap.remainingMs).toBe(0);
    expect(snap.overtimeMs).toBe(0);
  });

  it("uses 180 seconds for every later hold", () => {
    const oneHold = endHold(withActive(createHoldTrackerState(), 0), 10_000);
    const twoHold = withActive(oneHold, 20_000);
    expect(twoHold.active!.limitMs).toBe(180_000);
    const snap = getActiveHoldSnapshot(twoHold, 200_000);
    expect(snap.remainingMs).toBe(0);
    expect(snap.overtimeMs).toBe(0);
  });

  it("records overtime without auto releasing", () => {
    const started = withActive(createHoldTrackerState(), 0);
    const snap = getActiveHoldSnapshot(started, 61_000);
    expect(snap.elapsedMs).toBe(61_000);
    expect(snap.remainingMs).toBe(0);
    expect(snap.overtimeMs).toBe(1_000);
    expect(started.active).not.toBeNull();
  });

  it("ignores duplicate start", () => {
    const state = createHoldTrackerState();
    const s1 = startHold(state, 0);
    const s2 = startHold(s1, 5000);
    expect(s2.active).toEqual(s1.active);
  });

  it("ignores duplicate end (end when no active)", () => {
    const state = endHold(createHoldTrackerState(), 10_000);
    expect(state.intervals).toHaveLength(0);
  });

  it("summarizes count, total, longest, exceeded", () => {
    const s1 = endHold(withActive(createHoldTrackerState(), 0), 70_000);
    const s2 = startHold(s1, 100_000);
    const s3 = endHold(s2, 110_000);
    const metrics = summarizeHoldMetrics(s3);
    expect(metrics.count).toBe(2);
    expect(metrics.totalDurationMs).toBe(80_000);
    expect(metrics.longestDurationMs).toBe(70_000);
    expect(metrics.exceededCount).toBe(1);
  });

  it("end hold returns ended interval", () => {
    const started = withActive(createHoldTrackerState(), 10_000);
    const ended = endHold(started, 71_000);
    expect(ended.intervals[0]).toMatchObject({
      durationMs: 61_000,
      limitMs: 60_000,
      exceededByMs: 1_000,
    });
  });

  it("finalizeActiveHold closes active interval", () => {
    const state = createHoldTrackerState();
    const started = startHold(state, 0);
    const finalized = finalizeActiveHold(started, 30_000);
    expect(finalized.active).toBeNull();
    expect(finalized.intervals).toHaveLength(1);
  });

  it("finalizeActiveHold is no-op when no active hold", () => {
    const state = endHold(withActive(createHoldTrackerState(), 0), 5000);
    const finalized = finalizeActiveHold(state, 10_000);
    expect(finalized.intervals).toHaveLength(1);
  });

  it("summarizeHoldMetrics: empty state", () => {
    const metrics = summarizeHoldMetrics(createHoldTrackerState());
    expect(metrics.count).toBe(0);
    expect(metrics.totalDurationMs).toBe(0);
    expect(metrics.longestDurationMs).toBe(0);
    expect(metrics.exceededCount).toBe(0);
  });

  it("getActiveHoldSnapshot returns zeros when no active hold", () => {
    const snap = getActiveHoldSnapshot(createHoldTrackerState(), 1000);
    expect(snap).toEqual({ elapsedMs: 0, remainingMs: 0, overtimeMs: 0 });
  });
});
