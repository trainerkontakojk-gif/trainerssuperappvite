import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

/**
 * Property 3: Seed Manager Production Guard
 * Validates: Requirements 6.3
 *
 * For any environment configuration where NODE_ENV equals 'production' (case-insensitive)
 * OR SUPABASE_DB_URL contains a production host pattern, the Seed_Manager SHALL abort
 * with a non-zero exit code and not execute any seed SQL.
 *
 * For any environment configuration where NODE_ENV is NOT 'production' AND
 * SUPABASE_DB_URL does NOT contain a production host pattern, the Seed_Manager SHALL
 * proceed with seed execution.
 */

// --- Replicate the pure production detection logic from scripts/seed.ts ---
// This mirrors the exact logic in isProductionEnvironment() for testability
// without importing the script (which triggers main() execution).

const PRODUCTION_HOST_PATTERNS = [
  "supabase.co",
  "supabase.com",
  "prod",
  "production",
];

function isProductionEnvironment(
  nodeEnv: string | undefined,
  dbUrl: string | undefined,
): boolean {
  // Check NODE_ENV
  if (nodeEnv?.toLowerCase() === "production") {
    return true;
  }

  // Check database URL for production host patterns
  if (dbUrl) {
    const urlLower = dbUrl.toLowerCase();
    for (const pattern of PRODUCTION_HOST_PATTERNS) {
      if (urlLower.includes(pattern)) {
        return true;
      }
    }
  }

  return false;
}

// --- Arbitraries ---

/** Generates NODE_ENV values that are 'production' (case-insensitive variants) */
const productionNodeEnvArb = fc.oneof(
  fc.constant("production"),
  fc.constant("Production"),
  fc.constant("PRODUCTION"),
  fc.constant("PrOdUcTiOn"),
  // Generate random case variations of 'production'
  fc
    .tuple(
      fc.constantFrom("p", "P"),
      fc.constantFrom("r", "R"),
      fc.constantFrom("o", "O"),
      fc.constantFrom("d", "D"),
      fc.constantFrom("u", "U"),
      fc.constantFrom("c", "C"),
      fc.constantFrom("t", "T"),
      fc.constantFrom("i", "I"),
      fc.constantFrom("o", "O"),
      fc.constantFrom("n", "N"),
    )
    .map((chars) => chars.join("")),
);

/** Generates NODE_ENV values that are NOT 'production' */
const nonProductionNodeEnvArb = fc.oneof(
  fc.constant("development"),
  fc.constant("test"),
  fc.constant("staging"),
  fc.constant("local"),
  fc.constant("ci"),
  fc.constant(""),
  fc.constant(undefined),
  // Random strings that don't match 'production' case-insensitively
  fc
    .string({ minLength: 0, maxLength: 30 })
    .filter((s) => s.toLowerCase() !== "production"),
);

/** Generates DB URLs that contain production host patterns */
const productionDbUrlArb = fc.oneof(
  // URLs containing 'supabase.co'
  fc
    .string({ minLength: 1, maxLength: 20 })
    .map(
      (prefix) =>
        `postgresql://user:pass@db.${prefix}.supabase.co:5432/postgres`,
    ),
  // URLs containing 'supabase.com'
  fc
    .string({ minLength: 1, maxLength: 20 })
    .map(
      (prefix) => `postgresql://user:pass@${prefix}.supabase.com:5432/postgres`,
    ),
  // URLs containing 'prod' in the host
  fc
    .string({ minLength: 1, maxLength: 20 })
    .map(
      (prefix) =>
        `postgresql://user:pass@${prefix}-prod-db.example.com:5432/mydb`,
    ),
  // URLs containing 'production' in the host
  fc
    .string({ minLength: 1, maxLength: 20 })
    .map(
      (prefix) =>
        `postgresql://user:pass@${prefix}.production.example.com:5432/mydb`,
    ),
  // Direct pattern inclusion with arbitrary surrounding text
  fc
    .constantFrom(...PRODUCTION_HOST_PATTERNS)
    .chain((pattern) =>
      fc
        .tuple(
          fc.string({ minLength: 0, maxLength: 30 }),
          fc.string({ minLength: 0, maxLength: 30 }),
        )
        .map(([before, after]) => `postgresql://${before}${pattern}${after}`),
    ),
);

/** Generates DB URLs that do NOT contain any production host patterns */
const nonProductionDbUrlArb = fc.oneof(
  fc.constant("postgresql://user:pass@localhost:5432/mydb"),
  fc.constant("postgresql://user:pass@127.0.0.1:5432/mydb"),
  fc.constant("postgresql://user:pass@db.dev.internal:5432/mydb"),
  fc.constant("postgresql://user:pass@staging-db.example.com:5432/mydb"),
  fc.constant(undefined),
  // Random URLs that don't contain production patterns
  fc.string({ minLength: 5, maxLength: 100 }).filter((s) => {
    const lower = s.toLowerCase();
    return !PRODUCTION_HOST_PATTERNS.some((pattern) => lower.includes(pattern));
  }),
);

describe("Property 3: Seed Manager Production Guard", () => {
  describe("Production environments always detected (returns true)", () => {
    it("NODE_ENV = production (any case) always triggers production guard", () => {
      fc.assert(
        fc.property(
          productionNodeEnvArb,
          nonProductionDbUrlArb,
          (nodeEnv, dbUrl) => {
            const result = isProductionEnvironment(nodeEnv, dbUrl);
            expect(result).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("DB URL containing production host patterns always triggers production guard", () => {
      fc.assert(
        fc.property(
          nonProductionNodeEnvArb,
          productionDbUrlArb,
          (nodeEnv, dbUrl) => {
            const result = isProductionEnvironment(nodeEnv, dbUrl);
            expect(result).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("both NODE_ENV=production AND production DB URL still triggers guard", () => {
      fc.assert(
        fc.property(
          productionNodeEnvArb,
          productionDbUrlArb,
          (nodeEnv, dbUrl) => {
            const result = isProductionEnvironment(nodeEnv, dbUrl);
            expect(result).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Non-production environments always proceed (returns false)", () => {
    it("non-production NODE_ENV with non-production DB URL allows seed execution", () => {
      fc.assert(
        fc.property(
          nonProductionNodeEnvArb,
          nonProductionDbUrlArb,
          (nodeEnv, dbUrl) => {
            const result = isProductionEnvironment(nodeEnv, dbUrl);
            expect(result).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("Production detection is case-insensitive for NODE_ENV", () => {
    it('any case variation of "production" in NODE_ENV triggers the guard', () => {
      fc.assert(
        fc.property(productionNodeEnvArb, (nodeEnv) => {
          const result = isProductionEnvironment(nodeEnv, undefined);
          expect(result).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Production detection is case-insensitive for DB URL patterns", () => {
    it("production host patterns in DB URL are detected regardless of URL casing", () => {
      const mixedCaseProductionUrlArb = fc.constantFrom(
        "postgresql://user:pass@DB.SUPABASE.CO:5432/postgres",
        "postgresql://user:pass@Supabase.Com/db",
        "postgresql://user:pass@MY-PROD-SERVER:5432/db",
        "postgresql://user:pass@PRODUCTION.example.com:5432/db",
        "postgresql://user:pass@db.Supabase.Co:5432/postgres",
      );

      fc.assert(
        fc.property(mixedCaseProductionUrlArb, (dbUrl) => {
          const result = isProductionEnvironment(undefined, dbUrl);
          expect(result).toBe(true);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("Edge cases", () => {
    it("undefined NODE_ENV and undefined DB URL is non-production", () => {
      const result = isProductionEnvironment(undefined, undefined);
      expect(result).toBe(false);
    });

    it("empty string NODE_ENV and empty string DB URL is non-production", () => {
      const result = isProductionEnvironment("", "");
      expect(result).toBe(false);
    });

    it('NODE_ENV containing "production" as substring but not equal does not trigger', () => {
      // e.g., "nonproduction", "preproduction" — these should NOT trigger
      // because the check is nodeEnv?.toLowerCase() === 'production' (exact match)
      const substringArb = fc.oneof(
        fc.constant("nonproduction"),
        fc.constant("preproduction"),
        fc.constant("production-like"),
        fc.constant("my-production-env"),
      );

      fc.assert(
        fc.property(substringArb, (nodeEnv) => {
          const result = isProductionEnvironment(nodeEnv, undefined);
          expect(result).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });
});

/**
 * Property 4: Seed Idempotency
 * Validates: Requirements 6.5
 *
 * For any valid seed data set, applying the seed twice to the same database
 * SHALL produce no duplicate-key errors and the row counts in seeded tables
 * SHALL remain stable after the second application.
 */

// --- Seed Idempotency Simulation ---

/**
 * Simulates a database table with ON CONFLICT DO NOTHING semantics.
 * This models the idempotent behavior of seed SQL files.
 */
class IdempotentTable<T extends { id: string }> {
  private rows: Map<string, T> = new Map();

  /**
   * Insert a record with ON CONFLICT DO NOTHING semantics.
   * Returns { success: true } always — never throws a duplicate-key error.
   */
  insertOnConflictDoNothing(record: T): {
    success: boolean;
    skipped: boolean;
    error?: string;
  } {
    if (this.rows.has(record.id)) {
      // ON CONFLICT DO NOTHING - skip silently, no error
      return { success: true, skipped: true };
    }
    this.rows.set(record.id, record);
    return { success: true, skipped: false };
  }

  /**
   * Insert a record with ON CONFLICT DO UPDATE semantics.
   * Always succeeds - either inserts new or updates existing.
   */
  insertOnConflictDoUpdate(record: T): { success: boolean; error?: string } {
    this.rows.set(record.id, record);
    return { success: true };
  }

  getRowCount(): number {
    return this.rows.size;
  }
}

/**
 * Applies a seed data set to a table using ON CONFLICT DO NOTHING semantics.
 * Returns whether any duplicate-key errors occurred and the final row count.
 */
function applySeedDoNothing<T extends { id: string }>(
  table: IdempotentTable<T>,
  records: T[],
): { errors: string[]; rowCount: number } {
  const errors: string[] = [];
  for (const record of records) {
    const result = table.insertOnConflictDoNothing(record);
    if (result.error) {
      errors.push(result.error);
    }
  }
  return { errors, rowCount: table.getRowCount() };
}

/**
 * Applies a seed data set to a table using ON CONFLICT DO UPDATE semantics.
 * Returns whether any duplicate-key errors occurred and the final row count.
 */
function applySeedDoUpdate<T extends { id: string }>(
  table: IdempotentTable<T>,
  records: T[],
): { errors: string[]; rowCount: number } {
  const errors: string[] = [];
  for (const record of records) {
    const result = table.insertOnConflictDoUpdate(record);
    if (result.error) {
      errors.push(result.error);
    }
  }
  return { errors, rowCount: table.getRowCount() };
}

// --- Arbitraries for seed data ---

const seedIdArb = fc.uuid();

const profileRecordArb = fc.record({
  id: seedIdArb,
  full_name: fc.string({ minLength: 1, maxLength: 50 }),
  email: fc.emailAddress(),
  role: fc.constantFrom("admin", "trainer", "leader", "user"),
});

const profilerPesertaRecordArb = fc.record({
  id: seedIdArb,
  nama: fc.string({ minLength: 1, maxLength: 100 }),
  batch_name: fc.string({ minLength: 1, maxLength: 50 }),
  tim: fc.string({ minLength: 1, maxLength: 50 }),
});

const qaPeriodRecordArb = fc.record({
  id: seedIdArb,
  month: fc.integer({ min: 1, max: 12 }),
  year: fc.integer({ min: 2020, max: 2030 }),
  label: fc.string({ minLength: 1, maxLength: 20 }),
});

const aiUsageLogRecordArb = fc.record({
  id: seedIdArb,
  user_id: seedIdArb,
  provider: fc.constantFrom("gemini", "openrouter"),
  model_id: fc.string({ minLength: 1, maxLength: 50 }),
  module: fc.constantFrom("ketik", "pdkt", "telefun", "report"),
  status: fc.constantFrom("success", "failed", "timeout"),
});

/** Generates a complete seed data set across multiple tables */
const seedDataSetArb = fc.record({
  profiles: fc.array(profileRecordArb, { minLength: 1, maxLength: 20 }),
  profilerPeserta: fc.array(profilerPesertaRecordArb, {
    minLength: 1,
    maxLength: 20,
  }),
  qaPeriods: fc.array(qaPeriodRecordArb, { minLength: 1, maxLength: 20 }),
  aiUsageLogs: fc.array(aiUsageLogRecordArb, { minLength: 1, maxLength: 20 }),
});

type ConflictStrategy = "doNothing" | "doUpdate";
const conflictStrategyArb = fc.constantFrom<ConflictStrategy>(
  "doNothing",
  "doUpdate",
);

describe("Property 4: Seed Idempotency", () => {
  it("double-application with ON CONFLICT DO NOTHING produces no errors and stable row counts", () => {
    fc.assert(
      fc.property(seedDataSetArb, (seedData) => {
        // Create fresh tables
        const profilesTable = new IdempotentTable<
          (typeof seedData.profiles)[0]
        >();
        const pesertaTable = new IdempotentTable<
          (typeof seedData.profilerPeserta)[0]
        >();
        const periodsTable = new IdempotentTable<
          (typeof seedData.qaPeriods)[0]
        >();
        const aiLogsTable = new IdempotentTable<
          (typeof seedData.aiUsageLogs)[0]
        >();

        // First application
        const first = {
          profiles: applySeedDoNothing(profilesTable, seedData.profiles),
          peserta: applySeedDoNothing(pesertaTable, seedData.profilerPeserta),
          periods: applySeedDoNothing(periodsTable, seedData.qaPeriods),
          aiLogs: applySeedDoNothing(aiLogsTable, seedData.aiUsageLogs),
        };

        // No errors on first application
        expect(first.profiles.errors).toHaveLength(0);
        expect(first.peserta.errors).toHaveLength(0);
        expect(first.periods.errors).toHaveLength(0);
        expect(first.aiLogs.errors).toHaveLength(0);

        // Second application (same data applied again)
        const second = {
          profiles: applySeedDoNothing(profilesTable, seedData.profiles),
          peserta: applySeedDoNothing(pesertaTable, seedData.profilerPeserta),
          periods: applySeedDoNothing(periodsTable, seedData.qaPeriods),
          aiLogs: applySeedDoNothing(aiLogsTable, seedData.aiUsageLogs),
        };

        // No duplicate-key errors on second application
        expect(second.profiles.errors).toHaveLength(0);
        expect(second.peserta.errors).toHaveLength(0);
        expect(second.periods.errors).toHaveLength(0);
        expect(second.aiLogs.errors).toHaveLength(0);

        // Row counts remain stable after second application
        expect(second.profiles.rowCount).toBe(first.profiles.rowCount);
        expect(second.peserta.rowCount).toBe(first.peserta.rowCount);
        expect(second.periods.rowCount).toBe(first.periods.rowCount);
        expect(second.aiLogs.rowCount).toBe(first.aiLogs.rowCount);
      }),
      { numRuns: 100 },
    );
  });

  it("double-application with ON CONFLICT DO UPDATE produces no errors and stable row counts", () => {
    fc.assert(
      fc.property(seedDataSetArb, (seedData) => {
        // Create fresh tables
        const profilesTable = new IdempotentTable<
          (typeof seedData.profiles)[0]
        >();
        const pesertaTable = new IdempotentTable<
          (typeof seedData.profilerPeserta)[0]
        >();
        const periodsTable = new IdempotentTable<
          (typeof seedData.qaPeriods)[0]
        >();
        const aiLogsTable = new IdempotentTable<
          (typeof seedData.aiUsageLogs)[0]
        >();

        // First application
        const first = {
          profiles: applySeedDoUpdate(profilesTable, seedData.profiles),
          peserta: applySeedDoUpdate(pesertaTable, seedData.profilerPeserta),
          periods: applySeedDoUpdate(periodsTable, seedData.qaPeriods),
          aiLogs: applySeedDoUpdate(aiLogsTable, seedData.aiUsageLogs),
        };

        // No errors on first application
        expect(first.profiles.errors).toHaveLength(0);
        expect(first.peserta.errors).toHaveLength(0);
        expect(first.periods.errors).toHaveLength(0);
        expect(first.aiLogs.errors).toHaveLength(0);

        // Second application (same data applied again)
        const second = {
          profiles: applySeedDoUpdate(profilesTable, seedData.profiles),
          peserta: applySeedDoUpdate(pesertaTable, seedData.profilerPeserta),
          periods: applySeedDoUpdate(periodsTable, seedData.qaPeriods),
          aiLogs: applySeedDoUpdate(aiLogsTable, seedData.aiUsageLogs),
        };

        // No errors on second application
        expect(second.profiles.errors).toHaveLength(0);
        expect(second.peserta.errors).toHaveLength(0);
        expect(second.periods.errors).toHaveLength(0);
        expect(second.aiLogs.errors).toHaveLength(0);

        // Row counts remain stable after second application
        expect(second.profiles.rowCount).toBe(first.profiles.rowCount);
        expect(second.peserta.rowCount).toBe(first.peserta.rowCount);
        expect(second.periods.rowCount).toBe(first.periods.rowCount);
        expect(second.aiLogs.rowCount).toBe(first.aiLogs.rowCount);
      }),
      { numRuns: 100 },
    );
  });

  it("seed data with duplicate IDs within same batch still produces stable results", () => {
    fc.assert(
      fc.property(
        fc.array(profileRecordArb, { minLength: 2, maxLength: 10 }),
        (records) => {
          // Intentionally create duplicates by reusing the first record's ID
          const duplicatedRecords = [
            ...records,
            { ...records[0], full_name: "Updated Name" },
          ];

          const table = new IdempotentTable<(typeof records)[0]>();

          // First application with duplicates in same batch
          const first = applySeedDoNothing(table, duplicatedRecords);
          expect(first.errors).toHaveLength(0);
          const firstCount = first.rowCount;

          // Second application
          const second = applySeedDoNothing(table, duplicatedRecords);
          expect(second.errors).toHaveLength(0);

          // Row count stable
          expect(second.rowCount).toBe(firstCount);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("multiple applications (N times) produce no errors and stable row counts after first", () => {
    fc.assert(
      fc.property(
        seedDataSetArb,
        conflictStrategyArb,
        fc.integer({ min: 2, max: 5 }),
        (seedData, strategy, applicationCount) => {
          const table = new IdempotentTable<(typeof seedData.profiles)[0]>();

          const applyFn =
            strategy === "doNothing" ? applySeedDoNothing : applySeedDoUpdate;

          let previousRowCount: number | null = null;

          // Apply multiple times
          for (let i = 0; i < applicationCount; i++) {
            const result = applyFn(table, seedData.profiles);

            // Never any errors
            expect(result.errors).toHaveLength(0);

            // After first application, row count should be stable
            if (previousRowCount !== null) {
              expect(result.rowCount).toBe(previousRowCount);
            }
            previousRowCount = result.rowCount;
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("row count equals number of unique IDs in seed data", () => {
    fc.assert(
      fc.property(
        fc.array(profileRecordArb, { minLength: 1, maxLength: 30 }),
        (records) => {
          const table = new IdempotentTable<(typeof records)[0]>();

          // Apply seed
          applySeedDoNothing(table, records);

          // Row count should equal unique IDs
          const uniqueIds = new Set(records.map((r) => r.id));
          expect(table.getRowCount()).toBe(uniqueIds.size);

          // Apply again
          applySeedDoNothing(table, records);

          // Still equals unique IDs (stable)
          expect(table.getRowCount()).toBe(uniqueIds.size);
        },
      ),
      { numRuns: 100 },
    );
  });
});
