import { describe, it, expect } from "vitest";
import { normalizeAgentsResponse } from "../routes/sidak/input";
import { scoreColor, scoreBg, scoreLabel } from "../lib/scoring";

describe("SidakInputPage — normalizeAgentsResponse", () => {
  it("extracts agents array from object shape", () => {
    const payload = {
      agents: [
        { id: "a1", nama: "Alice", batch_name: "Alpha" },
        { id: "a2", nama: "Bob", batch_name: "Beta" },
      ],
      batches: ["Alpha", "Beta"],
    };
    expect(normalizeAgentsResponse(payload)).toEqual(payload.agents);
  });

  it("passes through legacy array shape", () => {
    const payload = [
      { id: "a1", nama: "Alice" },
      { id: "a2", nama: "Bob" },
    ];
    expect(normalizeAgentsResponse(payload)).toEqual(payload);
  });

  it("returns empty array for null", () => {
    expect(normalizeAgentsResponse(null)).toEqual([]);
  });
});

describe("scoring utility helper", () => {
  it("scoreColor returns green for high scores", () => {
    expect(scoreColor(85)).toContain("green");
    expect(scoreColor(100)).toContain("green");
  });

  it("scoreColor returns amber for medium scores", () => {
    expect(scoreColor(70)).toContain("amber");
    expect(scoreColor(84)).toContain("amber");
  });

  it("scoreColor returns red for low scores", () => {
    expect(scoreColor(0)).toContain("red");
    expect(scoreColor(69)).toContain("red");
  });

  it("scoreBg returns appropriate background colors", () => {
    expect(scoreBg(90)).toContain("green");
    expect(scoreBg(75)).toContain("amber");
    expect(scoreBg(50)).toContain("red");
  });

  it("scoreLabel returns correct Indonesian labels", () => {
    expect(scoreLabel(85)).toBe("Baik");
    expect(scoreLabel(72)).toBe("Cukup");
    expect(scoreLabel(0)).toBe("Perlu Perhatian");
  });
});
