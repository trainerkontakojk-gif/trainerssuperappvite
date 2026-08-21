import { describe, it, expect, vi, afterEach } from "vitest";
import {
  REALISTIC_RANGES,
  TRAINING_FAST_RANGES,
  FAST_SAME_MINUTE_RANGES,
  FAST_CHANCE,
  shouldUseFastSameMinute,
  getRealisticRange,
  classifyTextBand,
  boundedRandom,
} from "./pacing";

describe("KETIK pacing minute-aware (Opsi B)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("defines REALISTIC_RANGES as minute-aware (45-95s) not second-scale", () => {
    // delayed path should be 35-95s minimal
    expect(REALISTIC_RANGES.short.minMs).toBeGreaterThanOrEqual(45000);
    expect(REALISTIC_RANGES.short.maxMs).toBeGreaterThanOrEqual(45000);
    expect(REALISTIC_RANGES.normal.minMs).toBeGreaterThanOrEqual(60000);
    expect(REALISTIC_RANGES.normal.maxMs).toBeGreaterThanOrEqual(60000);
    expect(REALISTIC_RANGES.long.minMs).toBeGreaterThanOrEqual(75000);
    expect(REALISTIC_RANGES.long.maxMs).toBeGreaterThanOrEqual(75000);
    expect(REALISTIC_RANGES.greeting_reply.minMs).toBeGreaterThanOrEqual(35000);
    expect(REALISTIC_RANGES.greeting_reply.maxMs).toBeGreaterThanOrEqual(35000);
    // follow_up stays short for BREAK parts
    expect(REALISTIC_RANGES.follow_up.maxMs).toBeLessThanOrEqual(3000);
  });

  it("defines FAST_SAME_MINUTE_RANGES for occasional same-minute reply", () => {
    expect(FAST_SAME_MINUTE_RANGES).toBeDefined();
    expect(FAST_SAME_MINUTE_RANGES.short.minMs).toBeGreaterThanOrEqual(5000);
    expect(FAST_SAME_MINUTE_RANGES.short.maxMs).toBeLessThanOrEqual(25000);
    expect(FAST_SAME_MINUTE_RANGES.normal.minMs).toBeGreaterThanOrEqual(5000);
    expect(FAST_SAME_MINUTE_RANGES.long.maxMs).toBeLessThanOrEqual(25000);
    expect(FAST_SAME_MINUTE_RANGES.greeting_reply.maxMs).toBeLessThanOrEqual(25000);
    expect(FAST_SAME_MINUTE_RANGES.follow_up.maxMs).toBeLessThanOrEqual(3000);
  });

  it("defines FAST_CHANCE as ~0.18", () => {
    expect(FAST_CHANCE).toBeCloseTo(0.18, 5);
  });

  it("getRealisticRange returns delayed or fast range by flag", () => {
    expect(getRealisticRange("short", false)).toEqual(REALISTIC_RANGES.short);
    expect(getRealisticRange("short", true)).toEqual(FAST_SAME_MINUTE_RANGES.short);
    expect(getRealisticRange("normal", false)).toEqual(REALISTIC_RANGES.normal);
    expect(getRealisticRange("normal", true)).toEqual(FAST_SAME_MINUTE_RANGES.normal);
    expect(getRealisticRange("greeting_reply", false)).toEqual(REALISTIC_RANGES.greeting_reply);
    expect(getRealisticRange("greeting_reply", true)).toEqual(FAST_SAME_MINUTE_RANGES.greeting_reply);
  });

  it("shouldUseFastSameMinute returns true ~18% of calls when remaining sufficient", () => {
    // mock random to be deterministic
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValue(0.10); // <0.18 => true
    expect(shouldUseFastSameMinute({ remainingSeconds: 120 })).toBe(true);
    spy.mockReturnValue(0.30); // >0.18 => false
    expect(shouldUseFastSameMinute({ remainingSeconds: 120 })).toBe(false);
  });

  it("shouldUseFastSameMinute returns false when remaining < 30 (timer clamped)", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.01);
    expect(shouldUseFastSameMinute({ remainingSeconds: 15 })).toBe(false);
    expect(shouldUseFastSameMinute({ remainingSeconds: 25 })).toBe(false);
    expect(shouldUseFastSameMinute({ remainingSeconds: 29 })).toBe(false);
  });

  it("shouldUseFastSameMinute respects FAST_CHANCE distribution over many samples", () => {
    let fastCount = 0;
    const N = 1000;
    // Use real random without mock, count distribution
    for (let i = 0; i < N; i++) {
      if (shouldUseFastSameMinute({ remainingSeconds: 200 })) fastCount++;
    }
    // 18% ± 5% tolerance (130-230 per 1000)
    expect(fastCount).toBeGreaterThan(100);
    expect(fastCount).toBeLessThan(260);
  });

  it("classifyTextBand still works", () => {
    expect(classifyTextBand(10)).toBe("short");
    expect(classifyTextBand(50)).toBe("normal");
    expect(classifyTextBand(150)).toBe("long");
  });

  it("boundedRandom stays within range", () => {
    for (let i = 0; i < 50; i++) {
      const v = boundedRandom(1000, 3000);
      expect(v).toBeGreaterThanOrEqual(1000);
      expect(v).toBeLessThanOrEqual(3000);
    }
  });

  it("TRAINING_FAST_RANGES unchanged (<7s)", () => {
    expect(TRAINING_FAST_RANGES.short.maxMs).toBeLessThanOrEqual(7000);
    expect(TRAINING_FAST_RANGES.normal.maxMs).toBeLessThanOrEqual(7000);
    expect(TRAINING_FAST_RANGES.long.maxMs).toBeLessThanOrEqual(7000);
  });
});
