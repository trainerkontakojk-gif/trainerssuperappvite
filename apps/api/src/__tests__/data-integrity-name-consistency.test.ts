import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  levenshteinDistance,
  isSubstringMatch,
  detectWhitespaceIssues,
  detectAbbreviation,
  deriveCanonicalForm,
} from "../../../../scripts/data-integrity-checker";

// ─── Property 7 Arbitraries ──────────────────────────────────────────────────

/** Generate alphanumeric strings for Levenshtein testing */
const shortStringArb = fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/);

/** Generate alphabetic strings of given length range */
const alphaStringArb = (min: number, max: number) =>
  fc.stringMatching(new RegExp(`^[a-zA-Z]{${min},${max}}$`));

/** Generate lowercase alphabetic strings */
const lowerAlphaArb = (min: number, max: number) =>
  fc.stringMatching(new RegExp(`^[a-z]{${min},${max}}$`));

/** Generate strings with at least 4 alpha characters for substring testing */
const substringNameArb = fc.stringMatching(/^[a-zA-Z]{4,20}$/);

/** Generate a single uppercase letter */
const upperLetterArb = fc.stringMatching(/^[A-Z]$/);

/** Generate spaces of given length */
const spacesArb = (min: number, max: number) =>
  fc.nat({ max: max - min }).map((n) => " ".repeat(n + min));

// ─── Property 7 Tests ────────────────────────────────────────────────────────

/**
 * Property 7: Name Consistency Detection
 * Validates: Requirements 10.1, 10.2, 10.3
 *
 * For any pair of profiler_peserta.nama values, the Data_Integrity_Checker SHALL correctly
 * identify similarity (Levenshtein distance ≤ 3 or substring relationship with minimum 4
 * characters) and inconsistency types (whitespace, capitalization, abbreviation), and SHALL
 * derive a canonical form by trimming whitespace and applying title-case capitalization.
 */
describe("Property 7: Name Consistency Detection", () => {
  describe("Levenshtein distance properties", () => {
    it("Levenshtein distance is symmetric: d(a,b) = d(b,a)", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(shortStringArb, shortStringArb, (a, b) => {
          const distAB = levenshteinDistance(a, b);
          const distBA = levenshteinDistance(b, a);
          expect(distAB).toBe(distBA);
        }),
        { numRuns: 100 },
      );
    });

    it("Levenshtein distance is 0 if and only if strings are identical", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(shortStringArb, shortStringArb, (a, b) => {
          const dist = levenshteinDistance(a, b);
          if (a === b) {
            expect(dist).toBe(0);
          } else {
            expect(dist).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 },
      );
    });

    it("Levenshtein distance of a string with itself is always 0", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(shortStringArb, (a) => {
          expect(levenshteinDistance(a, a)).toBe(0);
        }),
        { numRuns: 100 },
      );
    });

    it("Levenshtein distance satisfies triangle inequality: d(a,c) ≤ d(a,b) + d(b,c)", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          shortStringArb,
          shortStringArb,
          shortStringArb,
          (a, b, c) => {
            const dAB = levenshteinDistance(a, b);
            const dBC = levenshteinDistance(b, c);
            const dAC = levenshteinDistance(a, c);
            expect(dAC).toBeLessThanOrEqual(dAB + dBC);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("Levenshtein distance is at most max(len(a), len(b))", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(shortStringArb, shortStringArb, (a, b) => {
          const dist = levenshteinDistance(a, b);
          const maxLen = Math.max(
            a.slice(0, 100).length,
            b.slice(0, 100).length,
          );
          expect(dist).toBeLessThanOrEqual(maxLen);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Substring detection properties", () => {
    it("if a contains b (len≥4) and they are not equal, isSubstringMatch returns true", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          substringNameArb,
          alphaStringArb(1, 10),
          alphaStringArb(1, 10),
          (inner, prefix, suffix) => {
            // Construct a string that contains `inner` as a substring
            const outer = prefix + inner + suffix;
            // Only test when they are genuinely different (case-insensitive, trimmed)
            if (outer.toLowerCase().trim() === inner.toLowerCase().trim())
              return;
            if (outer.trim().length < 4 || inner.trim().length < 4) return;

            expect(isSubstringMatch(outer, inner)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("isSubstringMatch returns false for exact matches (case-insensitive)", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(substringNameArb, (name) => {
          // Same string should not be a "substring match"
          expect(isSubstringMatch(name, name)).toBe(false);
          // Case-insensitive same string
          expect(isSubstringMatch(name, name.toUpperCase())).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it("isSubstringMatch returns false when either string is shorter than minLength", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z]{1,3}$/),
          substringNameArb,
          (shortStr, longStr) => {
            expect(isSubstringMatch(shortStr, longStr)).toBe(false);
            expect(isSubstringMatch(longStr, shortStr)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("isSubstringMatch is symmetric: isSubstringMatch(a,b) === isSubstringMatch(b,a)", () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(substringNameArb, substringNameArb, (a, b) => {
          expect(isSubstringMatch(a, b)).toBe(isSubstringMatch(b, a));
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Canonical form properties", () => {
    it("canonical form is always trimmed (no leading/trailing whitespace)", () => {
      /**
       * **Validates: Requirements 10.3**
       */
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          (name) => {
            const canonical = deriveCanonicalForm(name);
            expect(canonical).toBe(canonical.trim());
          },
        ),
        { numRuns: 100 },
      );
    });

    it("canonical form has no consecutive spaces", () => {
      /**
       * **Validates: Requirements 10.3**
       */
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          (name) => {
            const canonical = deriveCanonicalForm(name);
            expect(canonical).not.toMatch(/\s{2,}/);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("canonical form is title-cased (each word starts with uppercase, rest lowercase)", () => {
      /**
       * **Validates: Requirements 10.3**
       */
      fc.assert(
        fc.property(
          fc
            .array(alphaStringArb(1, 10), { minLength: 1, maxLength: 4 })
            .map((words) => words.join(" ")),
          (name) => {
            const canonical = deriveCanonicalForm(name);
            const words = canonical.split(" ");
            for (const word of words) {
              if (word.length === 0) continue;
              expect(word[0]).toBe(word[0].toUpperCase());
              if (word.length > 1) {
                expect(word.slice(1)).toBe(word.slice(1).toLowerCase());
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("canonical form is idempotent: deriveCanonicalForm(deriveCanonicalForm(x)) === deriveCanonicalForm(x)", () => {
      /**
       * **Validates: Requirements 10.3**
       */
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim().length > 0),
          (name) => {
            const once = deriveCanonicalForm(name);
            const twice = deriveCanonicalForm(once);
            expect(twice).toBe(once);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Whitespace detection properties", () => {
    it("names with leading whitespace are detected", () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(spacesArb(1, 5), alphaStringArb(1, 20), (spaces, name) => {
          const nameWithLeading = spaces + name;
          const issues = detectWhitespaceIssues(nameWithLeading);
          expect(issues).toContain("leading whitespace");
        }),
        { numRuns: 100 },
      );
    });

    it("names with trailing whitespace are detected", () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(alphaStringArb(1, 20), spacesArb(1, 5), (name, spaces) => {
          const nameWithTrailing = name + spaces;
          const issues = detectWhitespaceIssues(nameWithTrailing);
          expect(issues).toContain("trailing whitespace");
        }),
        { numRuns: 100 },
      );
    });

    it("names with consecutive internal spaces are detected", () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(
          alphaStringArb(1, 10),
          spacesArb(2, 5),
          alphaStringArb(1, 10),
          (word1, spaces, word2) => {
            const nameWithConsecutive = word1 + spaces + word2;
            const issues = detectWhitespaceIssues(nameWithConsecutive);
            expect(issues).toContain("consecutive internal spaces");
          },
        ),
        { numRuns: 100 },
      );
    });

    it("clean names (trimmed, single spaces) have no whitespace issues", () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(
          fc.array(alphaStringArb(1, 10), { minLength: 1, maxLength: 4 }),
          (words) => {
            const cleanName = words.join(" ");
            const issues = detectWhitespaceIssues(cleanName);
            expect(issues).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Abbreviation detection properties", () => {
    it('"X. Surname" vs "Xname Surname" is detected as abbreviation', () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(
          upperLetterArb,
          lowerAlphaArb(2, 10),
          alphaStringArb(2, 10),
          (initial, restOfName, surname) => {
            const abbreviated = `${initial}. ${surname}`;
            const full = `${initial}${restOfName} ${surname}`;
            expect(detectAbbreviation(abbreviated, full)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("abbreviation detection is symmetric", () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(
          upperLetterArb,
          lowerAlphaArb(2, 10),
          alphaStringArb(2, 10),
          (initial, restOfName, surname) => {
            const abbreviated = `${initial}. ${surname}`;
            const full = `${initial}${restOfName} ${surname}`;
            // Should detect regardless of argument order
            expect(detectAbbreviation(abbreviated, full)).toBe(
              detectAbbreviation(full, abbreviated),
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it("two full names (no abbreviation pattern) are not detected as abbreviation", () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(
          alphaStringArb(2, 10),
          alphaStringArb(2, 10),
          alphaStringArb(2, 10),
          alphaStringArb(2, 10),
          (firstName1, lastName1, firstName2, lastName2) => {
            // Full names without periods should not trigger abbreviation detection
            const name1 = `${firstName1} ${lastName1}`;
            const name2 = `${firstName2} ${lastName2}`;
            expect(detectAbbreviation(name1, name2)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
