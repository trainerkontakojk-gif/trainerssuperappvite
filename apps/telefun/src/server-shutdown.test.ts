import { describe, expect, it, vi } from "vitest";
import { createShutdownCoordinator } from "./shutdown-coordinator.js";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness(overrides: Partial<Parameters<typeof createShutdownCoordinator>[0]> = {}) {
  const exits: number[] = [];
  const stopAccepting = vi.fn();
  const closeHttp = vi.fn(async () => undefined);
  const shutdownManager = vi.fn(async () => undefined);
  const coordinator = createShutdownCoordinator({
    timeoutMs: 100,
    stopAccepting,
    closeHttp,
    shutdownManager,
    exit: (code) => exits.push(code),
    ...overrides,
  });
  return {
    coordinator,
    exits,
    stopAccepting,
    closeHttp: (overrides.closeHttp as typeof closeHttp) ?? closeHttp,
    shutdownManager:
      (overrides.shutdownManager as typeof shutdownManager) ?? shutdownManager,
  };
}

describe("Telefun graceful shutdown coordinator", () => {
  it("awaits manager and HTTP close before exiting successfully once", async () => {
    const manager = deferred();
    const http = deferred();
    const harness = createHarness({
      shutdownManager: vi.fn(() => manager.promise),
      closeHttp: vi.fn(() => http.promise),
    });

    const first = harness.coordinator("SIGTERM");
    const second = harness.coordinator("SIGINT");
    expect(second).toBe(first);
    expect(harness.stopAccepting).toHaveBeenCalledOnce();
    manager.resolve();
    http.resolve();

    await first;
    expect(harness.exits).toEqual([0]);
    expect(harness.shutdownManager).toHaveBeenCalledOnce();
    expect(harness.closeHttp).toHaveBeenCalledOnce();
  });

  it("exits nonzero when manager shutdown rejects", async () => {
    const harness = createHarness({
      shutdownManager: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });

    await harness.coordinator("SIGTERM");
    expect(harness.exits).toEqual([1]);
  });

  it("exits nonzero when HTTP close rejects", async () => {
    const harness = createHarness({
      closeHttp: vi.fn(async () => {
        throw new Error("http close failed");
      }),
    });

    await harness.coordinator("SIGTERM");
    expect(harness.exits).toEqual([1]);
  });

  it("exits nonzero when the finite deadline expires", async () => {
    vi.useFakeTimers();
    try {
      const manager = deferred();
      const harness = createHarness({
        timeoutMs: 100,
        shutdownManager: vi.fn(() => manager.promise),
      });
      const shutdown = harness.coordinator("SIGTERM");
      await vi.advanceTimersByTimeAsync(100);
      await shutdown;
      expect(harness.exits).toEqual([1]);
    } finally {
      vi.useRealTimers();
    }
  });
});
