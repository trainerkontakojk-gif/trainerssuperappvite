import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  classifyScoringError,
  calculateBackoffMs,
  calculateNextAttemptAt,
  MAX_SCORING_ATTEMPTS,
  PermanentScoringError,
  TransientScoringError,
} from "../lib/telefun-scoring-errors";

describe("classifyScoringError", () => {
  it("classifies PermanentScoringError instance as permanent", () => {
    expect(classifyScoringError(new PermanentScoringError("No agent audio"))).toBe("permanent");
  });

  it("classifies TransientScoringError instance as transient", () => {
    expect(classifyScoringError(new TransientScoringError("Timeout"))).toBe("transient");
  });

  it("classifies 'not found' error messages as permanent", () => {
    expect(classifyScoringError(new Error("Session not found"))).toBe("permanent");
    expect(classifyScoringError(new Error("Recording path not found"))).toBe("permanent");
  });

  it("classifies 'no agent audio' as permanent", () => {
    expect(classifyScoringError(new Error("No agent audio available for assessment"))).toBe("permanent");
  });

  it("classifies 'unauthorized' as permanent", () => {
    expect(classifyScoringError(new Error("Unauthorized"))).toBe("permanent");
  });

  it("classifies 'invalid assessment' as permanent", () => {
    expect(classifyScoringError(new Error("Invalid assessment shape from AI"))).toBe("permanent");
    expect(classifyScoringError(new Error("Format hasil analisis tidak valid"))).toBe("permanent");
  });

  it("classifies 'bad request' as permanent", () => {
    expect(classifyScoringError(new Error("Bad request: invalid audio format"))).toBe("permanent");
  });

  it("classifies timeout errors as transient", () => {
    expect(classifyScoringError(new Error("Gemini request timed out after 120000ms"))).toBe("transient");
    expect(classifyScoringError(new Error("timeout exceeded"))).toBe("transient");
  });

  it("classifies connection errors as transient", () => {
    expect(classifyScoringError(new Error("connect ECONNREFUSED"))).toBe("transient");
    expect(classifyScoringError(new Error("socket hang up"))).toBe("transient");
    expect(classifyScoringError(new Error("econnreset"))).toBe("transient");
  });

  it("classifies rate limit errors as transient", () => {
    expect(classifyScoringError(new Error("429 Too Many Requests"))).toBe("transient");
    expect(classifyScoringError(new Error("rate limit exceeded"))).toBe("transient");
  });

  it("classifies storage download failures as transient", () => {
    expect(classifyScoringError(new Error("Failed to download audio: network error"))).toBe("transient");
    expect(classifyScoringError(new Error("download error"))).toBe("transient");
  });

  it("classifies 5xx errors as transient", () => {
    expect(classifyScoringError(new Error("503 Service Unavailable"))).toBe("transient");
    expect(classifyScoringError(new Error("500 Internal Server Error"))).toBe("transient");
  });

  it("does not classify an unrelated digit 5 as a server error", () => {
    expect(classifyScoringError(new Error("Assessment has 5 invalid fields"))).toBe(
      "permanent",
    );
  });

  it("classifies 4xx errors (except 429) as permanent", () => {
    expect(classifyScoringError(new Error("400 Bad Request"))).toBe("permanent");
    expect(classifyScoringError(new Error("403 Forbidden"))).toBe("permanent");
    expect(classifyScoringError(new Error("404 Not Found"))).toBe("permanent");
  });

  it("classifies database unavailable as transient", () => {
    expect(classifyScoringError(new Error("database unavailable"))).toBe("transient");
  });

  it("classifies string errors (non-Error) correctly", () => {
    expect(classifyScoringError("timeout: connection lost")).toBe("transient");
    expect(classifyScoringError("not found")).toBe("permanent");
  });

  it("classifies unknown errors as permanent by default", () => {
    expect(classifyScoringError(new Error("Unknown something weird"))).toBe("permanent");
  });
});

describe("calculateBackoffMs", () => {
  it("returns 30s for attempt 0 or 1", () => {
    expect(calculateBackoffMs(0)).toBe(30_000);
    expect(calculateBackoffMs(1)).toBe(30_000);
  });

  it("returns 2min for attempt 2", () => {
    expect(calculateBackoffMs(2)).toBe(120_000);
  });

  it("returns 5min for attempt 3", () => {
    expect(calculateBackoffMs(3)).toBe(300_000);
  });

  it("caps at 5min for higher attempts", () => {
    expect(calculateBackoffMs(4)).toBe(300_000);
    expect(calculateBackoffMs(10)).toBe(300_000);
  });
});

describe("calculateNextAttemptAt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-11T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns now + 30s for attempt 1", () => {
    const result = calculateNextAttemptAt(1);
    expect(result.toISOString()).toBe("2026-06-11T12:00:30.000Z");
  });

  it("returns now + 2min for attempt 2", () => {
    const result = calculateNextAttemptAt(2);
    expect(result.toISOString()).toBe("2026-06-11T12:02:00.000Z");
  });

  it("returns now + 5min for attempt 3", () => {
    const result = calculateNextAttemptAt(3);
    expect(result.toISOString()).toBe("2026-06-11T12:05:00.000Z");
  });
});

describe("MAX_SCORING_ATTEMPTS", () => {
  it("is 3", () => {
    expect(MAX_SCORING_ATTEMPTS).toBe(3);
  });
});
