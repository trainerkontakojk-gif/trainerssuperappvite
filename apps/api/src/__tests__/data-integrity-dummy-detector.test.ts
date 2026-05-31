import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  matchesTestNamePattern,
  matchesTestEmailPattern,
  matchesRepeatedCharPattern,
} from "../../../../scripts/data-integrity-checker";

/**
 * Property 5: Dummy Data Pattern Detection
 * Validates: Requirements 8.1, 8.2, 8.3, 8.6
 *
 * For any profiles row or profiler_peserta row, the Data_Integrity_Checker SHALL correctly
 * identify whether the row matches test patterns (case-insensitive "test"/"dummy"/"sample"/
 * "placeholder"/"lorem" in name fields, test email domains, repeated-character names) and
 * produce a report containing table name, row ID, matched column, and triggering pattern
 * for each match.
 */

// ─── Constants (mirroring the implementation) ─────────────────────────────────

const TEST_NAME_PATTERNS = ["test", "dummy", "sample", "placeholder", "lorem"];
const TEST_EMAIL_DOMAINS = ["@example.com", "@test.com", "@mailinator.com"];

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate a name that DOES contain one of the test patterns */
const nameWithPatternArb = fc
  .tuple(
    fc.constantFrom(...TEST_NAME_PATTERNS),
    fc
      .string({ minLength: 0, maxLength: 10 })
      .filter(
        (s) => !TEST_NAME_PATTERNS.some((p) => s.toLowerCase().includes(p)),
      ),
    fc
      .string({ minLength: 0, maxLength: 10 })
      .filter(
        (s) => !TEST_NAME_PATTERNS.some((p) => s.toLowerCase().includes(p)),
      ),
  )
  .map(([pattern, prefix, suffix]) => `${prefix}${pattern}${suffix}`);

/** Generate a name that does NOT contain any test patterns and is not a repeated char name */
const safeNameArb = fc.string({ minLength: 2, maxLength: 30 }).filter((s) => {
  const lower = s.toLowerCase();
  if (TEST_NAME_PATTERNS.some((p) => lower.includes(p))) return false;
  const trimmed = s.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length === 1) return false;
  const firstChar = trimmed[0].toLowerCase();
  if (trimmed.split("").every((ch) => ch.toLowerCase() === firstChar))
    return false;
  return true;
});

/** Generate an email that ends with a test domain */
const emailWithTestDomainArb = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
    fc.constantFrom(...TEST_EMAIL_DOMAINS),
  )
  .map(([local, domain]) => `${local}${domain}`);

/** Generate an email containing "+test" */
const emailWithPlusTestArb = fc
  .stringMatching(/^[a-z][a-z0-9]{1,5}$/)
  .map((local) => `${local}+test@gmail.com`);

/** Generate an email that does NOT match any test patterns */
const safeEmailArb = fc
  .stringMatching(/^[a-z][a-z0-9]{2,8}$/)
  .map((local) => `${local}@company.org`);

/** Generate a repeated-character name (single char or all same char) */
const repeatedCharNameArb = fc.oneof(
  fc.stringMatching(/^[A-Za-z]$/),
  fc
    .tuple(fc.stringMatching(/^[A-Za-z]$/), fc.integer({ min: 2, max: 10 }))
    .map(([ch, len]) => ch.repeat(len)),
);

/** Generate a name that is NOT a repeated char pattern (multi-char, not all same) */
const nonRepeatedNameArb = fc
  .string({ minLength: 2, maxLength: 20 })
  .filter((s) => {
    const trimmed = s.trim();
    if (trimmed.length < 2) return false;
    const firstChar = trimmed[0].toLowerCase();
    return !trimmed.split("").every((ch) => ch.toLowerCase() === firstChar);
  });

// ─── Property 5 Tests ─────────────────────────────────────────────────────────

describe("Property 5: Dummy Data Pattern Detection", () => {
  describe("matchesTestNamePattern - names WITH test patterns are detected", () => {
    it("any name containing a test pattern (case-insensitive) returns a non-null match", () => {
      fc.assert(
        fc.property(nameWithPatternArb, (name) => {
          const result = matchesTestNamePattern(name);
          expect(result).not.toBeNull();
          expect(result).toMatch(/^contains "/);
        }),
        { numRuns: 100 },
      );
    });

    it("detection is case-insensitive (mixed case patterns are still detected)", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...TEST_NAME_PATTERNS),
          fc.boolean(),
          (pattern, uppercase) => {
            const mixedCase = uppercase ? pattern.toUpperCase() : pattern;
            const name = `prefix${mixedCase}suffix`;
            const result = matchesTestNamePattern(name);
            expect(result).not.toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("matchesTestNamePattern - names WITHOUT test patterns are not flagged", () => {
    it("safe names (no test patterns, not repeated chars) return null", () => {
      fc.assert(
        fc.property(safeNameArb, (name) => {
          const result = matchesTestNamePattern(name);
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("matchesTestNamePattern - null/undefined/empty inputs", () => {
    it("null, undefined, and empty string inputs return null", () => {
      fc.assert(
        fc.property(fc.constantFrom(null, undefined, ""), (input) => {
          const result = matchesTestNamePattern(
            input as string | null | undefined,
          );
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("matchesTestEmailPattern - emails WITH test domains are detected", () => {
    it("any email ending with a test domain returns a non-null match", () => {
      fc.assert(
        fc.property(emailWithTestDomainArb, (email) => {
          const result = matchesTestEmailPattern(email);
          expect(result).not.toBeNull();
          expect(result).toMatch(/^domain "/);
        }),
        { numRuns: 100 },
      );
    });

    it('emails containing "+test" are detected', () => {
      fc.assert(
        fc.property(emailWithPlusTestArb, (email) => {
          const result = matchesTestEmailPattern(email);
          expect(result).not.toBeNull();
          expect(result).toMatch(/contains "\+test"|domain "/);
        }),
        { numRuns: 100 },
      );
    });

    it("detection is case-insensitive for email domains", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...TEST_EMAIL_DOMAINS),
          fc.stringMatching(/^[a-z][a-z0-9]{1,8}$/),
          fc.boolean(),
          (domain, local, uppercase) => {
            const emailDomain = uppercase ? domain.toUpperCase() : domain;
            const email = `${local}${emailDomain}`;
            const result = matchesTestEmailPattern(email);
            expect(result).not.toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("matchesTestEmailPattern - emails WITHOUT test patterns are not flagged", () => {
    it("safe emails (non-test domains, no +test) return null", () => {
      fc.assert(
        fc.property(safeEmailArb, (email) => {
          const result = matchesTestEmailPattern(email);
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("matchesTestEmailPattern - null/undefined/empty inputs", () => {
    it("null, undefined, and empty string inputs return null", () => {
      fc.assert(
        fc.property(fc.constantFrom(null, undefined, ""), (input) => {
          const result = matchesTestEmailPattern(
            input as string | null | undefined,
          );
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("matchesRepeatedCharPattern - repeated char names are detected", () => {
    it('single character names return "single character name"', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[A-Za-z]$/), (name) => {
          const result = matchesRepeatedCharPattern(name);
          expect(result).toBe("single character name");
        }),
        { numRuns: 100 },
      );
    });

    it('all-same-character names (length >= 2) return "repeated character name"', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[A-Za-z]$/),
            fc.integer({ min: 2, max: 20 }),
          ),
          ([ch, len]) => {
            const name = ch.repeat(len);
            const result = matchesRepeatedCharPattern(name);
            expect(result).toBe("repeated character name");
          },
        ),
        { numRuns: 100 },
      );
    });

    it('repeated char detection is case-insensitive (e.g., "aAaA" is repeated)', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Za-z]$/),
          fc.integer({ min: 2, max: 10 }),
          (ch, len) => {
            const name = Array.from({ length: len }, (_, i) =>
              i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase(),
            ).join("");
            const result = matchesRepeatedCharPattern(name);
            expect(result).toBe("repeated character name");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("matchesRepeatedCharPattern - non-repeated names are not flagged", () => {
    it("names with multiple distinct characters return null", () => {
      fc.assert(
        fc.property(nonRepeatedNameArb, (name) => {
          const result = matchesRepeatedCharPattern(name);
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("matchesRepeatedCharPattern - null/undefined/empty inputs", () => {
    it("null, undefined, empty, and whitespace-only inputs return null", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, "", "   ", "\t"),
          (input) => {
            const result = matchesRepeatedCharPattern(
              input as string | null | undefined,
            );
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Report completeness - all detections include pattern description", () => {
    it("matchesTestNamePattern always returns a descriptive string when matching", () => {
      fc.assert(
        fc.property(nameWithPatternArb, (name) => {
          const result = matchesTestNamePattern(name);
          expect(result).not.toBeNull();
          expect(result!.length).toBeGreaterThan(0);
          expect(result).toContain("contains");
        }),
        { numRuns: 100 },
      );
    });

    it("matchesTestEmailPattern always returns a descriptive string when matching", () => {
      fc.assert(
        fc.property(
          fc.oneof(emailWithTestDomainArb, emailWithPlusTestArb),
          (email) => {
            const result = matchesTestEmailPattern(email);
            expect(result).not.toBeNull();
            expect(result!.length).toBeGreaterThan(0);
            expect(result).toMatch(/domain|contains/);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("matchesRepeatedCharPattern always returns a descriptive string when matching", () => {
      fc.assert(
        fc.property(repeatedCharNameArb, (name) => {
          const result = matchesRepeatedCharPattern(name);
          expect(result).not.toBeNull();
          expect(result!.length).toBeGreaterThan(0);
          expect(result).toMatch(/character name/);
        }),
        { numRuns: 100 },
      );
    });
  });
});
