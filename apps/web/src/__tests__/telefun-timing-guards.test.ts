import { describe, expect, it } from "vitest";
import { getTelefunTimeCueThreshold } from "../routes/telefun/services/timingGuards";

describe("getTelefunTimeCueThreshold", () => {
  it("fires 30s and 20s cues once", () => {
    expect(getTelefunTimeCueThreshold({
      totalSeconds: 300,
      elapsedSeconds: 270,
      cue30Sent: false,
      cue20Sent: false,
    })).toBe("30s");
    expect(getTelefunTimeCueThreshold({
      totalSeconds: 300,
      elapsedSeconds: 280,
      cue30Sent: true,
      cue20Sent: false,
    })).toBe("20s");
  });
});
