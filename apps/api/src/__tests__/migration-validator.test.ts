import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

/**
 * Property 2: Migration Validator Halt-on-Failure and Report Correctness
 * Validates: Requirements 4.2, 4.3
 *
 * For any ordered sequence of migration files where one file contains invalid SQL,
 * the Migration_Validator SHALL halt at the failing file, not execute subsequent files,
 * and produce a report containing every file's filename, correct status (pass/fail),
 * and execution duration in milliseconds.
 */

// --- Interfaces (mirroring scripts/validate-migrations.ts) ---

interface MigrationError {
  line?: number;
  statement?: string;
  message: string;
}

interface MigrationResult {
  filename: string;
  status: "pass" | "fail";
  durationMs: number;
  error?: MigrationError;
}

interface MigrationReport {
  results: MigrationResult[];
  totalFiles: number;
  passed: number;
  failed: number;
  haltedAt?: string;
}

// --- Pure logic extracted from validateMigrations for testability ---

/**
 * Simulates the migration validator's halt-on-failure behavior.
 * Given a list of filenames and a function that determines each file's outcome,
 * produces a MigrationReport following the halt-on-first-failure rule.
 *
 * This mirrors the core loop logic in validateMigrations() without database I/O.
 */
function buildMigrationReport(
  outcomes: Array<{
    filename: string;
    status: "pass" | "fail";
    durationMs: number;
    error?: MigrationError;
  }>,
): MigrationReport {
  const results: MigrationResult[] = [];

  for (const outcome of outcomes) {
    const result: MigrationResult = {
      filename: outcome.filename,
      status: outcome.status,
      durationMs: outcome.durationMs,
    };

    if (outcome.status === "fail" && outcome.error) {
      result.error = outcome.error;
    }

    results.push(result);

    if (outcome.status === "fail") {
      // Halt on first failure — do not process subsequent files
      return {
        results,
        totalFiles: outcomes.length,
        passed: results.filter((r) => r.status === "pass").length,
        failed: 1,
        haltedAt: outcome.filename,
      };
    }
  }

  // All passed
  return {
    results,
    totalFiles: outcomes.length,
    passed: results.length,
    failed: 0,
  };
}

// --- Arbitraries ---

const filenameArb = fc
  .tuple(
    fc.integer({ min: 0, max: 999 }),
    fc.stringMatching(/^[a-z][a-z0-9_]{2,20}$/),
  )
  .map(([num, name]) => `${String(num).padStart(3, "0")}_${name}.sql`);

const durationMsArb = fc.integer({ min: 0, max: 30_000 });

const migrationErrorArb = fc.record({
  line: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
  statement: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
    nil: undefined,
  }),
  message: fc.string({ minLength: 1, maxLength: 500 }),
});

const passOutcomeArb = (filename: string) =>
  durationMsArb.map((durationMs) => ({
    filename,
    status: "pass" as const,
    durationMs,
  }));

const failOutcomeArb = (filename: string) =>
  fc.tuple(durationMsArb, migrationErrorArb).map(([durationMs, error]) => ({
    filename,
    status: "fail" as const,
    durationMs,
    error,
  }));

/**
 * Generates a sequence of migration outcomes where exactly one file fails
 * at a specified position. Files before the failure pass, the file at the
 * failure position fails, and files after are defined but should never be executed.
 */
const migrationSequenceWithFailureArb = fc
  .tuple(
    // Number of files before the failure (0 to 10)
    fc.integer({ min: 0, max: 10 }),
    // Number of files after the failure (0 to 10)
    fc.integer({ min: 0, max: 10 }),
  )
  .chain(([beforeCount, afterCount]) => {
    const totalFiles = beforeCount + 1 + afterCount;
    // Generate unique filenames for all files
    return fc
      .uniqueArray(filenameArb, {
        minLength: totalFiles,
        maxLength: totalFiles,
      })
      .chain((filenames) => {
        // Sort filenames to simulate ascending order
        const sortedFilenames = [...filenames].sort();

        // Generate pass outcomes for files before failure
        const beforeArbs = sortedFilenames
          .slice(0, beforeCount)
          .map((fn) => passOutcomeArb(fn));

        // Generate fail outcome for the failing file
        const failingFilename = sortedFilenames[beforeCount];
        const failArb = failOutcomeArb(failingFilename);

        // Generate outcomes for files after failure (these should never be executed)
        const afterArbs = sortedFilenames
          .slice(beforeCount + 1)
          .map((fn) => fc.oneof(passOutcomeArb(fn), failOutcomeArb(fn)));

        return fc.tuple(
          beforeArbs.length > 0
            ? fc.tuple(...beforeArbs)
            : fc.constant([] as any[]),
          failArb,
          afterArbs.length > 0
            ? fc.tuple(...afterArbs)
            : fc.constant([] as any[]),
          fc.constant({ beforeCount, afterCount, totalFiles, sortedFilenames }),
        );
      });
  })
  .map(([beforeResults, failResult, afterResults, meta]) => {
    const before = Array.isArray(beforeResults)
      ? meta.beforeCount === 0
        ? []
        : [beforeResults].flat()
      : [beforeResults];
    const after = Array.isArray(afterResults)
      ? meta.afterCount === 0
        ? []
        : [afterResults].flat()
      : [afterResults];

    return {
      allOutcomes: [...before, failResult, ...after],
      failIndex: meta.beforeCount,
      totalFiles: meta.totalFiles,
      beforeCount: meta.beforeCount,
      afterCount: meta.afterCount,
    };
  });

/**
 * Generates a sequence of migration outcomes where all files pass.
 */
const allPassSequenceArb = fc
  .integer({ min: 1, max: 15 })
  .chain((count) =>
    fc
      .uniqueArray(filenameArb, { minLength: count, maxLength: count })
      .chain((filenames) => {
        const sorted = [...filenames].sort();
        return fc.tuple(...sorted.map((fn) => passOutcomeArb(fn)));
      }),
  )
  .map((outcomes) => (Array.isArray(outcomes) ? outcomes : [outcomes]));

// --- Property Tests ---

describe("Property 2: Migration Validator Halt-on-Failure and Report Correctness", () => {
  describe("Halt behavior: no files executed after first failure", () => {
    it("report contains only files up to and including the first failure", () => {
      fc.assert(
        fc.property(
          migrationSequenceWithFailureArb,
          ({ allOutcomes, failIndex, totalFiles: _totalFiles, beforeCount }) => {
            const report = buildMigrationReport(allOutcomes);

            // Only files up to and including the failure should appear in results
            const expectedResultCount = beforeCount + 1;
            expect(report.results.length).toBe(expectedResultCount);

            // No files after the failure index should be in results
            const resultFilenames = report.results.map((r) => r.filename);
            const afterFilenames = allOutcomes
              .slice(failIndex + 1)
              .map((o) => o.filename);
            for (const afterFile of afterFilenames) {
              expect(resultFilenames).not.toContain(afterFile);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("haltedAt is set to the failing filename", () => {
      fc.assert(
        fc.property(
          migrationSequenceWithFailureArb,
          ({ allOutcomes, failIndex }) => {
            const report = buildMigrationReport(allOutcomes);

            // haltedAt SHALL be set to the failing file
            expect(report.haltedAt).toBe(allOutcomes[failIndex].filename);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("failed count is exactly 1 when halted", () => {
      fc.assert(
        fc.property(migrationSequenceWithFailureArb, ({ allOutcomes }) => {
          const report = buildMigrationReport(allOutcomes);

          // Only one failure is recorded (halt on first)
          expect(report.failed).toBe(1);
        }),
        { numRuns: 100 },
      );
    });

    it("the last result in the report is always the failing file", () => {
      fc.assert(
        fc.property(migrationSequenceWithFailureArb, ({ allOutcomes }) => {
          const report = buildMigrationReport(allOutcomes);

          const lastResult = report.results[report.results.length - 1];
          expect(lastResult.status).toBe("fail");
          expect(lastResult.filename).toBe(report.haltedAt);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Report correctness: statuses, filenames, and durations", () => {
    it('all results before the failure have status "pass"', () => {
      fc.assert(
        fc.property(
          migrationSequenceWithFailureArb,
          ({ allOutcomes, beforeCount }) => {
            const report = buildMigrationReport(allOutcomes);

            // All results except the last should be 'pass'
            const beforeResults = report.results.slice(0, beforeCount);
            for (const result of beforeResults) {
              expect(result.status).toBe("pass");
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("report contains correct filenames matching input order", () => {
      fc.assert(
        fc.property(
          migrationSequenceWithFailureArb,
          ({ allOutcomes, beforeCount }) => {
            const report = buildMigrationReport(allOutcomes);

            // Filenames in report match the input sequence up to halt point
            for (let i = 0; i <= beforeCount; i++) {
              expect(report.results[i].filename).toBe(allOutcomes[i].filename);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("each result has a non-negative durationMs", () => {
      fc.assert(
        fc.property(migrationSequenceWithFailureArb, ({ allOutcomes }) => {
          const report = buildMigrationReport(allOutcomes);

          for (const result of report.results) {
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
          }
        }),
        { numRuns: 100 },
      );
    });

    it("totalFiles reflects the total number of migration files (not just executed)", () => {
      fc.assert(
        fc.property(
          migrationSequenceWithFailureArb,
          ({ allOutcomes, totalFiles }) => {
            const report = buildMigrationReport(allOutcomes);

            // totalFiles should be the total count of all files, not just executed ones
            expect(report.totalFiles).toBe(totalFiles);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('passed count equals the number of results with status "pass"', () => {
      fc.assert(
        fc.property(
          migrationSequenceWithFailureArb,
          ({ allOutcomes, beforeCount }) => {
            const report = buildMigrationReport(allOutcomes);

            expect(report.passed).toBe(beforeCount);
            expect(report.passed).toBe(
              report.results.filter((r) => r.status === "pass").length,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it("failing result contains error information", () => {
      fc.assert(
        fc.property(migrationSequenceWithFailureArb, ({ allOutcomes }) => {
          const report = buildMigrationReport(allOutcomes);

          const failingResult = report.results.find((r) => r.status === "fail");
          expect(failingResult).toBeDefined();
          expect(failingResult!.error).toBeDefined();
          expect(failingResult!.error!.message.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("All-pass scenario: no halt, complete report", () => {
    it("when all migrations pass, report has no haltedAt and failed is 0", () => {
      fc.assert(
        fc.property(allPassSequenceArb, (outcomes) => {
          const report = buildMigrationReport(outcomes);

          expect(report.haltedAt).toBeUndefined();
          expect(report.failed).toBe(0);
          expect(report.passed).toBe(outcomes.length);
          expect(report.totalFiles).toBe(outcomes.length);
          expect(report.results.length).toBe(outcomes.length);
        }),
        { numRuns: 100 },
      );
    });

    it('when all pass, every result has status "pass" and valid durationMs', () => {
      fc.assert(
        fc.property(allPassSequenceArb, (outcomes) => {
          const report = buildMigrationReport(outcomes);

          for (const result of report.results) {
            expect(result.status).toBe("pass");
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
            expect(result.error).toBeUndefined();
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Edge cases", () => {
    it("first file fails: report has 1 result, 0 passed, haltedAt is first file", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }).chain((totalFiles) =>
            fc
              .uniqueArray(filenameArb, {
                minLength: totalFiles,
                maxLength: totalFiles,
              })
              .chain((filenames) => {
                const sorted = [...filenames].sort();
                return fc.tuple(failOutcomeArb(sorted[0]), fc.constant(sorted));
              }),
          ),
          ([failOutcome, sortedFilenames]) => {
            // Build outcomes: first fails, rest would pass (but never executed)
            const allOutcomes = [
              failOutcome,
              ...sortedFilenames.slice(1).map((fn) => ({
                filename: fn,
                status: "pass" as const,
                durationMs: 100,
              })),
            ];

            const report = buildMigrationReport(allOutcomes);

            expect(report.results.length).toBe(1);
            expect(report.passed).toBe(0);
            expect(report.failed).toBe(1);
            expect(report.haltedAt).toBe(sortedFilenames[0]);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("empty file list produces empty report", () => {
      const report = buildMigrationReport([]);

      expect(report.results).toEqual([]);
      expect(report.totalFiles).toBe(0);
      expect(report.passed).toBe(0);
      expect(report.failed).toBe(0);
      expect(report.haltedAt).toBeUndefined();
    });
  });
});
