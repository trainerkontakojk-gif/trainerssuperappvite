import { describe, expect, it } from "vitest";
import {
  normalizeTelefunHoldMetrics,
  evaluateTelefunHoldAssessment,
  applyHoldAssessmentToOverallScore,
} from "../lib/telefun-hold-assessment";
import type { TelefunHoldMetrics } from "@trainers/types";

function makeMetrics(
  overrides?: Partial<TelefunHoldMetrics>,
): TelefunHoldMetrics {
  return {
    count: 0,
    totalDurationMs: 0,
    longestDurationMs: 0,
    exceededCount: 0,
    intervals: [],
    ...overrides,
  };
}

describe("normalizeTelefunHoldMetrics", () => {
  it("returns empty metrics for null", () => {
    const m = normalizeTelefunHoldMetrics(null);
    expect(m.count).toBe(0);
    expect(m.intervals).toHaveLength(0);
  });

  it("normalizes valid intervals", () => {
    const m = normalizeTelefunHoldMetrics({
      intervals: [
        {
          sequence: 1,
          startedAtMs: 0,
          endedAtMs: 30_000,
          limitMs: 60_000,
          durationMs: 30_000,
          exceededByMs: 0,
        },
      ],
    });
    expect(m.count).toBe(1);
    expect(m.totalDurationMs).toBe(30_000);
    expect(m.longestDurationMs).toBe(30_000);
    expect(m.exceededCount).toBe(0);
  });

  it("ignores malformed intervals", () => {
    const m = normalizeTelefunHoldMetrics({
      intervals: [null, { sequence: 0 }, "bad"],
    });
    expect(m.count).toBe(0);
  });

  it("ignores intervals whose end precedes their start", () => {
    const m = normalizeTelefunHoldMetrics({
      intervals: [
        {
          sequence: 1,
          startedAtMs: 60_000,
          endedAtMs: 30_000,
          limitMs: 60_000,
        },
      ],
    });

    expect(m.count).toBe(0);
    expect(m.intervals).toHaveLength(0);
  });
});

describe("evaluateTelefunHoldAssessment", () => {
  it("returns N/A without hold usage", () => {
    const result = evaluateTelefunHoldAssessment(makeMetrics());
    expect(result).toMatchObject({
      status: "not_used",
      score: null,
      verdict: "N/A",
      feedback: "User tidak menggunakan hold pada sesi ini.",
    });
  });

  it("returns Baik when every interval is within its own limit", () => {
    const result = evaluateTelefunHoldAssessment(
      makeMetrics({
        count: 2,
        totalDurationMs: 60_000,
        longestDurationMs: 30_000,
        exceededCount: 0,
        intervals: [
          {
            sequence: 1,
            startedAtMs: 0,
            endedAtMs: 30_000,
            durationMs: 30_000,
            limitMs: 60_000,
            exceededByMs: 0,
          },
          {
            sequence: 2,
            startedAtMs: 40_000,
            endedAtMs: 70_000,
            durationMs: 30_000,
            limitMs: 180_000,
            exceededByMs: 0,
          },
        ],
      }),
    );
    expect(result.verdict).toBe("Baik");
    expect(result.score).toBe(10);
  });

  it("returns Kurang when any interval exceeds its limit", () => {
    const result = evaluateTelefunHoldAssessment(
      makeMetrics({
        count: 1,
        totalDurationMs: 61_000,
        longestDurationMs: 61_000,
        exceededCount: 1,
        intervals: [
          {
            sequence: 1,
            startedAtMs: 0,
            endedAtMs: 61_000,
            durationMs: 61_000,
            limitMs: 60_000,
            exceededByMs: 1_000,
          },
        ],
      }),
    );
    expect(result.verdict).toBe("Kurang");
    expect(result.score).toBe(4);
    expect(result.feedback).toContain("melewati batas");
  });

  it("does not trust inconsistent exceededCount from stored JSON", () => {
    // exceededCount=1 but intervals are all within limit
    const result = evaluateTelefunHoldAssessment(
      makeMetrics({
        count: 1,
        totalDurationMs: 30_000,
        longestDurationMs: 30_000,
        exceededCount: 1, // lies!
        intervals: [
          {
            sequence: 1,
            startedAtMs: 0,
            endedAtMs: 30_000,
            durationMs: 30_000,
            limitMs: 60_000,
            exceededByMs: 0,
          },
        ],
      }),
    );
    expect(result.verdict).toBe("Baik"); // recomputed from intervals
    expect(result.score).toBe(10);
  });
});

describe("applyHoldAssessmentToOverallScore", () => {
  it("does not alter overall score for N/A", () => {
    const hold = evaluateTelefunHoldAssessment(makeMetrics());
    expect(applyHoldAssessmentToOverallScore(8.5, hold)).toBe(8.5);
  });

  it("adds hold as the sixth aspect when used and within limit", () => {
    const hold = evaluateTelefunHoldAssessment(
      makeMetrics({
        count: 1,
        totalDurationMs: 30_000,
        longestDurationMs: 30_000,
        exceededCount: 0,
        intervals: [
          {
            sequence: 1,
            startedAtMs: 0,
            endedAtMs: 30_000,
            durationMs: 30_000,
            limitMs: 60_000,
            exceededByMs: 0,
          },
        ],
      }),
    );
    // (8*5 + 10) / 6 = 50/6 = 8.3
    expect(applyHoldAssessmentToOverallScore(8, hold)).toBe(8.3);
  });

  it("lowers score when hold exceeded", () => {
    const hold = evaluateTelefunHoldAssessment(
      makeMetrics({
        count: 1,
        totalDurationMs: 61_000,
        longestDurationMs: 61_000,
        exceededCount: 1,
        intervals: [
          {
            sequence: 1,
            startedAtMs: 0,
            endedAtMs: 61_000,
            durationMs: 61_000,
            limitMs: 60_000,
            exceededByMs: 1_000,
          },
        ],
      }),
    );
    // (8*5 + 4) / 6 = 44/6 = 7.3
    expect(applyHoldAssessmentToOverallScore(8, hold)).toBe(7.3);
  });

  it("clamps AI score to 0-10 before adjustment", () => {
    const hold = evaluateTelefunHoldAssessment(
      makeMetrics({
        count: 1,
        totalDurationMs: 30_000,
        longestDurationMs: 30_000,
        exceededCount: 0,
        intervals: [
          {
            sequence: 1,
            startedAtMs: 0,
            endedAtMs: 30_000,
            durationMs: 30_000,
            limitMs: 60_000,
            exceededByMs: 0,
          },
        ],
      }),
    );
    // clamped: 10, (10*5 + 10)/6 = 10
    expect(applyHoldAssessmentToOverallScore(15, hold)).toBe(10);
  });
});
