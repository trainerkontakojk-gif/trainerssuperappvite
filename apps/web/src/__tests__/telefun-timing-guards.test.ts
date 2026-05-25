import { describe, expect, it } from "vitest";
import { getTelefunTimeCueThreshold } from "../routes/telefun/services/timingGuards";

describe("getTelefunTimeCueThreshold", () => {
  const base = { totalSeconds: 300, elapsedSeconds: 0, cue30Sent: false, cue20Sent: false };

  it("returns null when totalSeconds is zero", () => {
    expect(getTelefunTimeCueThreshold({ ...base, totalSeconds: 0 })).toBeNull();
  });

  it("returns null when totalSeconds is negative", () => {
    expect(getTelefunTimeCueThreshold({ ...base, totalSeconds: -1 })).toBeNull();
  });

  it("returns null when totalSeconds is <= 50 (too short for 30s cue)", () => {
    expect(getTelefunTimeCueThreshold({ ...base, totalSeconds: 50, elapsedSeconds: 20 })).toBeNull();
  });

  it("returns null when totalSeconds is <= 20 (too short for 20s cue)", () => {
    expect(getTelefunTimeCueThreshold({ ...base, totalSeconds: 20, elapsedSeconds: 10 })).toBeNull();
  });

  it("returns '30s' when 30s remaining and total > 50", () => {
    expect(getTelefunTimeCueThreshold({ totalSeconds: 300, elapsedSeconds: 270, cue30Sent: false, cue20Sent: false })).toBe("30s");
  });

  it("returns '20s' when 20s remaining and total > 20", () => {
    expect(getTelefunTimeCueThreshold({ totalSeconds: 300, elapsedSeconds: 280, cue30Sent: true, cue20Sent: false })).toBe("20s");
  });

  it("returns null when 30s cue already sent", () => {
    expect(getTelefunTimeCueThreshold({ totalSeconds: 300, elapsedSeconds: 270, cue30Sent: true, cue20Sent: false })).toBeNull();
  });

  it("returns null when 20s cue already sent", () => {
    expect(getTelefunTimeCueThreshold({ totalSeconds: 300, elapsedSeconds: 280, cue30Sent: true, cue20Sent: true })).toBeNull();
  });

  it("returns null when no remaining time", () => {
    expect(getTelefunTimeCueThreshold({ totalSeconds: 300, elapsedSeconds: 300, cue30Sent: false, cue20Sent: false })).toBeNull();
  });

  it("returns null for very short call (10s) even with 5s remaining", () => {
    expect(getTelefunTimeCueThreshold({ totalSeconds: 10, elapsedSeconds: 5, cue30Sent: false, cue20Sent: false })).toBeNull();
  });

  it("returns '30s' for 51s total with 21s elapsed", () => {
    expect(getTelefunTimeCueThreshold({ totalSeconds: 51, elapsedSeconds: 21, cue30Sent: false, cue20Sent: false })).toBe("30s");
  });

  it("returns '20s' for 21s total with 1s elapsed", () => {
    expect(getTelefunTimeCueThreshold({ totalSeconds: 21, elapsedSeconds: 1, cue30Sent: true, cue20Sent: false })).toBe("20s");
  });
});
