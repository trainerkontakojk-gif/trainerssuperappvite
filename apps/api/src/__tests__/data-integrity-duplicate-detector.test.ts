import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  normalizeForComparison,
  countNullFields,
  determineResolution,
  groupByNormalizedKey,
  buildDuplicateGroups,
} from "../../../../scripts/data-integrity-checker";

/**
 * Property 6: Duplicate Record Detection and Resolution
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 *
 * For any set of profiler_peserta or profiles records, the Data_Integrity_Checker SHALL
 * correctly identify duplicate groups based on case-insensitive, whitespace-trimmed matching
 * of the specified field combinations (excluding is_deleted = true records and NULL fields),
 * and SHALL suggest the correct resolution strategy ("merge" for more-complete records,
 * "archive" for inactive records, "flag for manual review" for conflicting values).
 */

// --- Property 6 Arbitraries ---

/** Generate a non-empty name string (possibly with whitespace variations) */
const nameArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
  fc
    .tuple(
      fc.nat({ max: 3 }),
      fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => s.trim().length > 0),
      fc.nat({ max: 3 }),
    )
    .map(
      ([preLen, name, postLen]) =>
        `${" ".repeat(preLen)}${name}${" ".repeat(postLen)}`,
    ),
);

/** Generate a nullable name (for testing null exclusion) */
const nullableNameArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  fc.constant("   "),
  nameArb,
);

/** Generate a record ID */
const idArb = fc.uuid();

/** Generate a status field */
const statusArb6 = fc.oneof(
  fc.constant("active"),
  fc.constant("inactive"),
  fc.constant(null),
  fc.constant(undefined),
);

/** Generate a boolean or undefined for is_deleted */
const isDeletedArb = fc.oneof(
  fc.constant(true),
  fc.constant(false),
  fc.constant(undefined),
  fc.constant(null),
);

/** Generate a profiler_peserta-like record */
const pesertaRecordArb = fc.record({
  id: idArb,
  nama: nullableNameArb,
  batch_name: nullableNameArb,
  tim: nullableNameArb,
  is_deleted: isDeletedArb,
  status: statusArb6,
  created_at: fc.oneof(
    fc.constant("2024-01-01"),
    fc.constant("2024-06-15"),
    fc.constant(null),
  ),
  trainer_id: fc.oneof(idArb, fc.constant(null)),
  foto_url: fc.oneof(
    fc.constant("photo.jpg"),
    fc.constant(null),
    fc.constant(""),
  ),
});

/** Generate a set of records that guarantees some duplicates */
function recordsWithDuplicatesArb(_keyFields: string[]) {
  return fc
    .tuple(
      nameArb,
      nameArb.filter((s) => s.trim().length > 0),
      fc.array(pesertaRecordArb, { minLength: 0, maxLength: 5 }),
    )
    .chain(([sharedName1, sharedName2, extraRecords]) => {
      const duplicateCount = fc.nat({ max: 2 }).map((n) => n + 2);
      return duplicateCount.chain((count) => {
        return fc
          .array(
            fc.record({
              id: idArb,
              nama: fc.oneof(
                fc.constant(sharedName1),
                fc.constant(sharedName1.toUpperCase()),
                fc.constant(`  ${sharedName1}  `),
              ),
              batch_name: fc.oneof(
                fc.constant(sharedName2),
                fc.constant(sharedName2.toUpperCase()),
                fc.constant(` ${sharedName2} `),
              ),
              tim: nullableNameArb,
              is_deleted: fc.oneof(
                fc.constant(false),
                fc.constant(undefined),
                fc.constant(null),
              ),
              status: statusArb6,
              created_at: fc.oneof(
                fc.constant("2024-01-01"),
                fc.constant("2024-06-15"),
                fc.constant(null),
              ),
              trainer_id: fc.oneof(idArb, fc.constant(null)),
              foto_url: fc.oneof(fc.constant("photo.jpg"), fc.constant(null)),
            }),
            { minLength: count, maxLength: count },
          )
          .map((duplicates) => [...duplicates, ...extraRecords]);
      });
    });
}

describe("Property 6: Duplicate Record Detection and Resolution", () => {
  describe("normalizeForComparison", () => {
    it("trims whitespace and lowercases for any non-empty string", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 100 })
            .filter((s) => s.trim().length > 0),
          (value) => {
            const result = normalizeForComparison(value);
            expect(result).not.toBeNull();
            expect(result).toBe(result!.trim());
            expect(result).toBe(result!.toLowerCase());
            expect(result).toBe(value.trim().toLowerCase());
          },
        ),
        { numRuns: 100 },
      );
    });

    it("returns null for null, undefined, or empty/whitespace-only strings", () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(""),
            fc.nat({ max: 10 }).map((n) => " ".repeat(n + 1)),
            fc.nat({ max: 5 }).map((n) => "\t".repeat(n + 1)),
          ),
          (value) => {
            const result = normalizeForComparison(
              value as string | null | undefined,
            );
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("groupByNormalizedKey - is_deleted exclusion", () => {
    it("records with is_deleted = true are never included in any group", () => {
      fc.assert(
        fc.property(
          fc.array(pesertaRecordArb, { minLength: 1, maxLength: 20 }),
          fc.constantFrom(
            ["nama", "batch_name"] as string[],
            ["nama", "tim"] as string[],
          ),
          (records, keyFields) => {
            const groups = groupByNormalizedKey(records, keyFields);

            const groupedRecords: Record<string, unknown>[] = [];
            for (const [, recs] of groups) {
              groupedRecords.push(...recs);
            }

            for (const rec of groupedRecords) {
              expect(rec.is_deleted).not.toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("groupByNormalizedKey - null key exclusion", () => {
    it("records with null/empty key fields are excluded from all groups", () => {
      fc.assert(
        fc.property(
          fc.array(pesertaRecordArb, { minLength: 1, maxLength: 20 }),
          fc.constantFrom(
            ["nama", "batch_name"] as string[],
            ["nama", "tim"] as string[],
          ),
          (records, keyFields) => {
            const groups = groupByNormalizedKey(records, keyFields);

            for (const [, recs] of groups) {
              for (const rec of recs) {
                for (const field of keyFields) {
                  const normalized = normalizeForComparison(
                    (rec as Record<string, unknown>)[field] as
                      | string
                      | null
                      | undefined,
                  );
                  expect(normalized).not.toBeNull();
                }
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("groupByNormalizedKey - case-insensitive grouping", () => {
    it("records with same normalized key are grouped together regardless of case/whitespace", () => {
      fc.assert(
        fc.property(
          nameArb.filter((s) => s.trim().length > 0),
          nameArb.filter((s) => s.trim().length > 0),
          (baseName, baseBatch) => {
            const records = [
              {
                id: "1",
                nama: baseName,
                batch_name: baseBatch,
                is_deleted: false,
              },
              {
                id: "2",
                nama: baseName.toUpperCase(),
                batch_name: baseBatch.toUpperCase(),
                is_deleted: false,
              },
              {
                id: "3",
                nama: `  ${baseName}  `,
                batch_name: ` ${baseBatch} `,
                is_deleted: false,
              },
            ];

            const groups = groupByNormalizedKey(records, [
              "nama",
              "batch_name",
            ]);

            const allGrouped: Record<string, unknown>[] = [];
            for (const [, recs] of groups) {
              allGrouped.push(...recs);
            }
            expect(allGrouped.length).toBe(3);
            expect(groups.size).toBe(1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("buildDuplicateGroups - only groups with 2+ records are duplicates", () => {
    it("singleton groups are never reported as duplicates", () => {
      fc.assert(
        fc.property(
          fc.array(pesertaRecordArb, { minLength: 1, maxLength: 15 }),
          (records) => {
            const groups = groupByNormalizedKey(records, [
              "nama",
              "batch_name",
            ]);
            const duplicates = buildDuplicateGroups(
              groups,
              "profiler_peserta",
              ["nama", "batch_name"],
              ["created_at", "trainer_id", "foto_url"],
            );

            for (const group of duplicates) {
              expect(group.recordIds.length).toBeGreaterThanOrEqual(2);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("determineResolution - archive strategy", () => {
    it('returns "archive" when any record has status = inactive', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: idArb,
              status: fc.oneof(fc.constant("active"), fc.constant(null)),
              field1: fc.oneof(fc.constant("a"), fc.constant(null)),
            }),
            { minLength: 1, maxLength: 4 },
          ),
          fc.nat({ max: 10 }),
          (baseRecords, insertIdx) => {
            const inactiveRecord = {
              id: "inactive-id",
              status: "inactive",
              field1: "value",
            };
            const idx = insertIdx % (baseRecords.length + 1);
            const records = [
              ...baseRecords.slice(0, idx),
              inactiveRecord,
              ...baseRecords.slice(idx),
            ];

            const result = determineResolution(records, ["field1"]);
            expect(result).toBe("archive");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("determineResolution - flag for manual review strategy", () => {
    it('returns "flag for manual review" when records have conflicting non-null values and no inactive status', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0 && s !== "inactive"),
          (value1, value2) => {
            fc.pre(value1 !== value2);

            const records = [
              { id: "1", status: "active", diffField: value1 },
              { id: "2", status: "active", diffField: value2 },
            ];

            const result = determineResolution(records, ["diffField"]);
            expect(result).toBe("flag for manual review");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("determineResolution - merge strategy", () => {
    it('returns "merge" when no inactive status and no conflicting non-null values', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          (sharedValue) => {
            const records = [
              { id: "1", status: "active", diffField: sharedValue },
              { id: "2", status: "active", diffField: null },
            ];

            const result = determineResolution(records, ["diffField"]);
            expect(result).toBe("merge");
          },
        ),
        { numRuns: 100 },
      );
    });

    it('returns "merge" when all non-null values in differing fields are identical', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          (sharedValue) => {
            const records = [
              { id: "1", status: "active", diffField: sharedValue },
              { id: "2", status: "active", diffField: sharedValue },
              { id: "3", status: "active", diffField: sharedValue },
            ];

            const result = determineResolution(records, ["diffField"]);
            expect(result).toBe("merge");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("determineResolution - priority ordering", () => {
    it('"archive" takes priority over "flag for manual review"', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s.trim().length > 0),
          (value1, value2) => {
            fc.pre(value1 !== value2);

            const records = [
              { id: "1", status: "inactive", diffField: value1 },
              { id: "2", status: "active", diffField: value2 },
            ];

            const result = determineResolution(records, ["diffField"]);
            expect(result).toBe("archive");
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("End-to-end duplicate detection pipeline", () => {
    it("correctly identifies duplicates from generated record sets with mixed keys", () => {
      fc.assert(
        fc.property(
          recordsWithDuplicatesArb(["nama", "batch_name"]),
          (records) => {
            const groups = groupByNormalizedKey(records, [
              "nama",
              "batch_name",
            ]);
            const duplicates = buildDuplicateGroups(
              groups,
              "profiler_peserta",
              ["nama", "batch_name"],
              ["created_at", "trainer_id", "foto_url"],
            );

            for (const group of duplicates) {
              expect(group.table).toBe("profiler_peserta");
              expect(group.recordIds.length).toBeGreaterThanOrEqual(2);
              expect(["merge", "archive", "flag for manual review"]).toContain(
                group.resolution,
              );
              expect(Object.keys(group.matchedFields)).toContain("nama");
              expect(Object.keys(group.matchedFields)).toContain("batch_name");

              for (const id of group.recordIds) {
                expect(group.differingValues).toHaveProperty(id);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("resolution strategy is consistent with record data", () => {
      fc.assert(
        fc.property(
          recordsWithDuplicatesArb(["nama", "batch_name"]),
          (records) => {
            const groups = groupByNormalizedKey(records, [
              "nama",
              "batch_name",
            ]);
            const duplicates = buildDuplicateGroups(
              groups,
              "profiler_peserta",
              ["nama", "batch_name"],
              ["created_at", "trainer_id", "foto_url"],
            );

            for (const group of duplicates) {
              const groupRecords = records.filter((r) =>
                group.recordIds.includes(String(r.id)),
              );

              const hasInactive = groupRecords.some(
                (r) =>
                  typeof r.status === "string" &&
                  r.status.toLowerCase() === "inactive",
              );

              if (hasInactive) {
                expect(group.resolution).toBe("archive");
              }
              if (group.resolution === "merge") {
                expect(hasInactive).toBe(false);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe("countNullFields", () => {
    it("correctly counts null/undefined/empty fields for any record", () => {
      fc.assert(
        fc.property(
          fc.record({
            field1: fc.oneof(
              fc.constant(null),
              fc.constant("value"),
              fc.constant(""),
            ),
            field2: fc.oneof(
              fc.constant(null),
              fc.constant(42),
              fc.constant(""),
            ),
            field3: fc.oneof(
              fc.constant(null),
              fc.constant(true),
              fc.constant(""),
            ),
            field4: fc.oneof(
              fc.constant(null),
              fc.constant(undefined),
              fc.constant("data"),
            ),
          }),
          (record) => {
            const count = countNullFields(record);

            const expected = Object.values(record).filter(
              (v) => v == null || v === "",
            ).length;
            expect(count).toBe(expected);

            expect(count).toBeGreaterThanOrEqual(0);
            expect(count).toBeLessThanOrEqual(Object.keys(record).length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
