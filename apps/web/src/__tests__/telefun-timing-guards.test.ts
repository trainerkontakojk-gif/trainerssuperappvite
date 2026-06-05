import { describe, expect, it } from "vitest";
import { getTelefunTimeCueThreshold } from "../routes/telefun/services/timingGuards";

describe("getTelefunTimeCueThreshold", () => {
  it("returns null when totalSeconds is zero", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 0,
        elapsedSeconds: 0,
        sentCues: new Set(),
      }),
    ).toBeNull();
  });

  it("returns null when totalSeconds is negative", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: -1,
        elapsedSeconds: 0,
        sentCues: new Set(),
      }),
    ).toBeNull();
  });

  it("sends 2 minute cue only for calls at least 5 minutes long", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 180,
        sentCues: new Set(),
      }),
    ).toBe("2min");
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 180,
        elapsedSeconds: 60,
        sentCues: new Set(),
      }),
    ).toBeNull();
  });

  it("sends 1 minute cue only for calls at least 3 minutes long", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 240,
        sentCues: new Set(),
      }),
    ).toBe("1min");
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 120,
        elapsedSeconds: 60,
        sentCues: new Set(),
      }),
    ).toBeNull();
  });

  it("sends 30s cue only for calls at least 51 seconds long", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 270,
        sentCues: new Set(),
      }),
    ).toBe("30s");
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 50,
        elapsedSeconds: 20,
        sentCues: new Set(),
      }),
    ).toBeNull();
  });

  it("sends 20s cue only for calls at least 21 seconds long", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 280,
        sentCues: new Set(),
      }),
    ).toBe("20s");
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 20,
        elapsedSeconds: 10,
        sentCues: new Set(),
      }),
    ).toBeNull();
  });

  it("returns the most urgent unsent cue when thresholds are crossed", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 281,
        sentCues: new Set(["2min", "1min", "30s"]),
      }),
    ).toBe("20s");
  });

  it("returns null when all cues already sent", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 300,
        sentCues: new Set(["2min", "1min", "30s", "20s"]),
      }),
    ).toBeNull();
  });

  it("returns null when no remaining time", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 300,
        sentCues: new Set(),
      }),
    ).toBeNull();
  });

  it("does not send any cue for very short call (10s)", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 10,
        elapsedSeconds: 5,
        sentCues: new Set(),
      }),
    ).toBeNull();
  });

  it("sends 2min only once", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 180,
        sentCues: new Set(["2min"]),
      }),
    ).toBeNull();
  });

  it("does not send a less urgent cue after the 20 second cue was sent", () => {
    expect(
      getTelefunTimeCueThreshold({
        totalSeconds: 300,
        elapsedSeconds: 282,
        sentCues: new Set(["20s"]),
      }),
    ).toBeNull();
  });
});
