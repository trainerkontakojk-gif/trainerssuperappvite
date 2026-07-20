import { describe, expect, it, vi, beforeEach } from "vitest";
import { LiveSession } from "../routes/telefun/services/liveSession";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";
import type { SessionMetrics } from "@trainers/types";

function createMockConfig(): TelefunAppSettings {
  return {
    scenarios: [],
    consumerTypes: [],
    identitySettings: undefined,
    sessionId: undefined,
    consumerName: "Test",
    consumerGender: "male",
    voiceName: "Kore",
    telefunModelId: "gemini-3.1-flash-live-preview",
    telefunTransport: "gemini-live",
    maxCallDuration: 0,
    responsePacingMode: "realistic",
    simulationChallengeTypes: [],
    activeScenario: undefined,
    activeConsumerType: undefined,
    resolvedIdentity: undefined,
  } as unknown as TelefunAppSettings;
}

describe("LiveSession hold metrics integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("setHold(true) then setHold(false) records one interval", () => {
    const session = new LiveSession(createMockConfig());
    (session as any).sessionStartTime = Date.now();

    session.setHold(true);
    vi.advanceTimersByTime(61_000);
    session.setHold(false);

    const metrics = (session as any).buildSessionMetrics().hold;
    expect(metrics.count).toBe(1);
    expect(metrics.totalDurationMs).toBeGreaterThanOrEqual(60_000);
    expect(metrics.exceededCount).toBe(1);
  });

  it("first hold limit 60s, subsequent 180s", () => {
    const session = new LiveSession(createMockConfig());
    (session as any).sessionStartTime = Date.now();

    session.setHold(true);
    vi.advanceTimersByTime(10_000);
    session.setHold(false);

    session.setHold(true);
    expect((session as any).holdTracker.active.limitMs).toBe(180_000);
    session.setHold(false);

    const metrics = (session as any).buildSessionMetrics().hold;
    expect(metrics.count).toBe(2);
  });

  it("repeated resume is idempotent", () => {
    const session = new LiveSession(createMockConfig());
    (session as any).sessionStartTime = Date.now();

    session.setHold(true);
    vi.advanceTimersByTime(5_000);
    session.setHold(false);
    session.setHold(false);
    session.setHold(false);

    const metrics = (session as any).buildSessionMetrics().hold;
    expect(metrics.count).toBe(1);
    expect(metrics.intervals).toHaveLength(1);
  });

  it("emitRecording includes hold in SessionMetrics", () => {
    const session = new LiveSession(createMockConfig());
    (session as any).sessionStartTime = Date.now();

    session.setHold(true);
    vi.advanceTimersByTime(30_000);
    session.setHold(false);

    const metrics = (session as any).buildSessionMetrics();
    expect(metrics.hold).toBeDefined();
    expect(metrics.hold.count).toBe(1);
  });

  it("disconnect while held finalizes the interval", () => {
    const session = new LiveSession(createMockConfig());
    const startTime = Date.now();
    (session as any).sessionStartTime = startTime;
    const onRecordingComplete = vi.fn();
    session.onRecordingComplete = onRecordingComplete;

    session.setHold(true);
    vi.advanceTimersByTime(40_000);
    session.disconnect();
    vi.advanceTimersByTime(500);

    const capturedMetrics = onRecordingComplete.mock.calls[0]?.[3] as
      | SessionMetrics
      | undefined;
    expect(capturedMetrics?.hold?.count).toBe(1);
    expect(
      capturedMetrics?.hold?.intervals[0].durationMs,
    ).toBeGreaterThanOrEqual(40_000);
  });
});
