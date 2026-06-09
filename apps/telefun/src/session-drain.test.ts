import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  DrainCoordinator,
  QUIET_WINDOW_MS,
  HARD_TIMEOUT_MS,
  type DrainOutcome,
} from "./session-drain.js";

describe("DrainCoordinator", () => {
  let coordinator: DrainCoordinator;
  let finalizedOutcome: DrainOutcome | null;

  beforeEach(() => {
    vi.useFakeTimers();
    finalizedOutcome = null;
    coordinator = new DrainCoordinator({
      onFinalize: (outcome: DrainOutcome) => {
        finalizedOutcome = outcome;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in open state", () => {
    expect(coordinator.getState()).toBe("open");
    expect(coordinator.isDraining()).toBe(false);
    expect(coordinator.isFinalized()).toBe(false);
  });

  it("transitions open -> draining on startDrain", () => {
    coordinator.startDrain();
    expect(coordinator.getState()).toBe("draining");
    expect(coordinator.isDraining()).toBe(true);
  });

  it("waits for the quiet window after notifyTurnComplete", () => {
    coordinator.startDrain();
    coordinator.notifyTurnComplete();
    expect(coordinator.getState()).toBe("draining");
    vi.advanceTimersByTime(QUIET_WINDOW_MS - 1);
    expect(coordinator.getState()).toBe("draining");
    vi.advanceTimersByTime(1);
    expect(coordinator.getState()).toBe("finalized");
    expect(coordinator.isDraining()).toBe(false);
    expect(coordinator.isFinalized()).toBe(true);
  });

  it("calls onFinalize with turn_complete after the post-boundary quiet window", () => {
    coordinator.startDrain();
    coordinator.notifyTurnComplete();
    expect(finalizedOutcome).toBeNull();
    vi.advanceTimersByTime(QUIET_WINDOW_MS);
    expect(finalizedOutcome).toBe("turn_complete");
  });

  it("does not start the quiet timer before a Gemini boundary", () => {
    coordinator.startDrain();
    vi.advanceTimersByTime(QUIET_WINDOW_MS + 100);
    expect(coordinator.getState()).toBe("draining");
    expect(finalizedOutcome).toBeNull();
  });

  it("uses quiet_timeout after an interruption boundary", () => {
    coordinator.startDrain();
    coordinator.notifyInterrupted();
    vi.advanceTimersByTime(QUIET_WINDOW_MS);
    expect(finalizedOutcome).toBe("quiet_timeout");
  });

  it("calls onFinalize with hard_timeout after HARD_TIMEOUT_MS", () => {
    let hardFinalized: DrainOutcome | null = null;
    const c = new DrainCoordinator({
      onFinalize: (outcome: DrainOutcome) => {
        hardFinalized = outcome;
      },
    });
    c.startDrain();
    const interval = setInterval(() => c.notifyActivity(), QUIET_WINDOW_MS - 500);
    vi.advanceTimersByTime(HARD_TIMEOUT_MS);
    clearInterval(interval);
    expect(c.getState()).toBe("finalized");
    expect(hardFinalized).toBe("hard_timeout");
  });

  it("notifyActivity resets quiet timer", () => {
    coordinator.startDrain();
    coordinator.notifyTurnComplete();
    vi.advanceTimersByTime(QUIET_WINDOW_MS - 500);
    coordinator.notifyActivity();
    vi.advanceTimersByTime(QUIET_WINDOW_MS - 500);
    expect(coordinator.getState()).toBe("draining");
    vi.advanceTimersByTime(600);
    expect(coordinator.getState()).toBe("finalized");
  });

  it("is idempotent when startDrain is called twice", () => {
    coordinator.startDrain();
    coordinator.startDrain();
    expect(coordinator.getState()).toBe("draining");
  });

  it("notifyActivity is no-op after finalized", () => {
    coordinator.startDrain();
    coordinator.notifyTurnComplete();
    vi.advanceTimersByTime(QUIET_WINDOW_MS);
    expect(coordinator.getState()).toBe("finalized");
    coordinator.notifyActivity();
    expect(coordinator.getState()).toBe("finalized");
  });

  it("notifyTurnComplete is no-op after finalized", () => {
    coordinator.startDrain();
    coordinator.notifyTurnComplete();
    vi.advanceTimersByTime(QUIET_WINDOW_MS);
    expect(coordinator.getState()).toBe("finalized");
    coordinator.notifyTurnComplete();
    expect(coordinator.getState()).toBe("finalized");
  });

  it("notifyTurnComplete is no-op in open state", () => {
    coordinator.notifyTurnComplete();
    expect(coordinator.getState()).toBe("open");
  });
});
