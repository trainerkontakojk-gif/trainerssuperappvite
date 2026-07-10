import { describe, expect, it } from "vitest";
import {
  sortReplayAnnotationsByTimestamp,
  truncateAnnotationsByPriority,
  validateRecommendations,
  isValidAnnotation,
  isValidManualAnnotationText,
  createReplayAnnotationChecksum,
  hasCompleteAiAnnotationSet,
} from "../lib/replayAnnotationHelpers";
import type {
  ReplayAnnotation,
  CoachingRecommendation,
} from "../routes/telefun/services/reviewTypes";

function makeAnnotation(
  overrides: Partial<ReplayAnnotation> & { timestampMs: number },
): ReplayAnnotation {
  return {
    id: crypto.randomUUID(),
    timestampMs: overrides.timestampMs,
    category: overrides.category ?? "strength",
    moment: overrides.moment ?? "good_de_escalation",
    text: overrides.text ?? "Test annotation",
    isManual: overrides.isManual ?? false,
  };
}

describe("sortReplayAnnotationsByTimestamp", () => {
  it("sorts by timestamp ascending", () => {
    const anns = [
      makeAnnotation({ timestampMs: 3000 }),
      makeAnnotation({ timestampMs: 1000 }),
      makeAnnotation({ timestampMs: 2000 }),
    ];
    const sorted = sortReplayAnnotationsByTimestamp(anns);
    expect(sorted.map((a) => a.timestampMs)).toEqual([1000, 2000, 3000]);
  });

  it("does not mutate original array", () => {
    const anns = [makeAnnotation({ timestampMs: 3000 }), makeAnnotation({ timestampMs: 1000 })];
    const sorted = sortReplayAnnotationsByTimestamp(anns);
    expect(sorted).not.toBe(anns);
    expect(anns[0].timestampMs).toBe(3000);
  });
});

describe("truncateAnnotationsByPriority", () => {
  it("keeps all when under limit", () => {
    const anns = [makeAnnotation({ timestampMs: 1000, category: "strength" })];
    expect(truncateAnnotationsByPriority(anns)).toHaveLength(1);
  });
});

describe("validateRecommendations", () => {
  it("truncates to max recommendations", () => {
    const recs: CoachingRecommendation[] = Array.from({ length: 10 }, (_, i) => ({
      text: `Rec ${i}`,
      priority: i + 1,
    }));
    expect(validateRecommendations(recs)).toHaveLength(5);
  });

  it("clamps priority to 1-5 range", () => {
    const recs: CoachingRecommendation[] = [
      { text: "Low", priority: 0 },
      { text: "High", priority: 10 },
      { text: "NaN", priority: NaN },
    ];
    const result = validateRecommendations(recs);
    expect(result[0].priority).toBe(1);
    expect(result[1].priority).toBe(5);
    expect(result[2].priority).toBe(1);
  });

  it("truncates text to max chars", () => {
    const recs: CoachingRecommendation[] = [
      { text: "x".repeat(300), priority: 3 },
    ];
    const result = validateRecommendations(recs);
    expect(result[0].text.length).toBeLessThanOrEqual(200);
  });
});

describe("isValidAnnotation", () => {
  it("accepts valid annotation", () => {
    expect(
      isValidAnnotation({
        timestampMs: 1000,
        category: "strength",
        moment: "good_de_escalation",
        text: "Test",
      }),
    ).toBe(true);
  });

  it("rejects invalid category", () => {
    expect(
      isValidAnnotation({
        timestampMs: 1000,
        category: "invalid",
        moment: "good_de_escalation",
        text: "Test",
      }),
    ).toBe(false);
  });

  it("rejects invalid moment", () => {
    expect(
      isValidAnnotation({
        timestampMs: 1000,
        category: "strength",
        moment: "invalid",
        text: "Test",
      }),
    ).toBe(false);
  });

  it("rejects negative timestamp", () => {
    expect(
      isValidAnnotation({
        timestampMs: -1,
        category: "strength",
        moment: "good_de_escalation",
        text: "Test",
      }),
    ).toBe(false);
  });

  it("rejects empty text", () => {
    expect(
      isValidAnnotation({
        timestampMs: 1000,
        category: "strength",
        moment: "good_de_escalation",
        text: "",
      }),
    ).toBe(false);
  });
});

describe("isValidManualAnnotationText", () => {
  it("accepts valid text", () => {
    expect(isValidManualAnnotationText("Valid text")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidManualAnnotationText("")).toBe(false);
  });

  it("rejects text exceeding max chars", () => {
    expect(isValidManualAnnotationText("x".repeat(501))).toBe(false);
  });
});

describe("createReplayAnnotationChecksum", () => {
  it("creates deterministic checksum", () => {
    const anns = [makeAnnotation({ timestampMs: 1000, text: "A", isManual: false })];
    const cs1 = createReplayAnnotationChecksum(anns);
    const cs2 = createReplayAnnotationChecksum(anns);
    expect(cs1).toBe(cs2);
  });

  it("ignores manual annotations", () => {
    const manual = makeAnnotation({ timestampMs: 1000, isManual: true });
    const ai = makeAnnotation({ timestampMs: 2000, isManual: false });
    const cs1 = createReplayAnnotationChecksum([ai]);
    const cs2 = createReplayAnnotationChecksum([manual, ai]);
    expect(cs1).toBe(cs2);
  });
});

describe("hasCompleteAiAnnotationSet", () => {
  it("returns false when metadata is null", () => {
    const anns = [makeAnnotation({ timestampMs: 1000 })];
    expect(
      hasCompleteAiAnnotationSet(anns, {
        aiAnnotationCount: null,
        aiAnnotationChecksum: null,
      }),
    ).toBe(false);
  });

  it("returns false when count mismatch", () => {
    const anns = [makeAnnotation({ timestampMs: 1000, isManual: false })];
    expect(
      hasCompleteAiAnnotationSet(anns, {
        aiAnnotationCount: 5,
        aiAnnotationChecksum: "abc",
      }),
    ).toBe(false);
  });
});
