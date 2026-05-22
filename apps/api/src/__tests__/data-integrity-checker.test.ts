import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  matchesTestNamePattern,
  matchesTestEmailPattern,
  matchesRepeatedCharPattern,
  normalizeForComparison,
  countNullFields,
  determineResolution,
  groupByNormalizedKey,
  buildDuplicateGroups,
  levenshteinDistance,
  isSubstringMatch,
  detectWhitespaceIssues,
  detectAbbreviation,
  deriveCanonicalForm,
} from '../../../../scripts/data-integrity-checker';
import type { ResolutionStrategy } from '../../../../scripts/data-integrity-checker';

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

const TEST_NAME_PATTERNS = ['test', 'dummy', 'sample', 'placeholder', 'lorem'];
const TEST_EMAIL_DOMAINS = ['@example.com', '@test.com', '@mailinator.com'];

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/** Generate a name that DOES contain one of the test patterns */
const nameWithPatternArb = fc.tuple(
  fc.constantFrom(...TEST_NAME_PATTERNS),
  fc.string({ minLength: 0, maxLength: 10 }).filter((s) => !TEST_NAME_PATTERNS.some((p) => s.toLowerCase().includes(p))),
  fc.string({ minLength: 0, maxLength: 10 }).filter((s) => !TEST_NAME_PATTERNS.some((p) => s.toLowerCase().includes(p))),
).map(([pattern, prefix, suffix]) => `${prefix}${pattern}${suffix}`);

/** Generate a name that does NOT contain any test patterns and is not a repeated char name */
const safeNameArb = fc.string({ minLength: 2, maxLength: 30 })
  .filter((s) => {
    const lower = s.toLowerCase();
    if (TEST_NAME_PATTERNS.some((p) => lower.includes(p))) return false;
    const trimmed = s.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.length === 1) return false;
    const firstChar = trimmed[0].toLowerCase();
    if (trimmed.split('').every((ch) => ch.toLowerCase() === firstChar)) return false;
    return true;
  });

/** Generate an email that ends with a test domain */
const emailWithTestDomainArb = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9]{1,10}$/),
  fc.constantFrom(...TEST_EMAIL_DOMAINS),
).map(([local, domain]) => `${local}${domain}`);

/** Generate an email containing "+test" */
const emailWithPlusTestArb = fc.stringMatching(/^[a-z][a-z0-9]{1,5}$/).map(
  (local) => `${local}+test@gmail.com`,
);

/** Generate an email that does NOT match any test patterns */
const safeEmailArb = fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/).map(
  (local) => `${local}@company.org`,
);

/** Generate a repeated-character name (single char or all same char) */
const repeatedCharNameArb = fc.oneof(
  fc.stringMatching(/^[A-Za-z]$/),
  fc.tuple(
    fc.stringMatching(/^[A-Za-z]$/),
    fc.integer({ min: 2, max: 10 }),
  ).map(([ch, len]) => ch.repeat(len)),
);

/** Generate a name that is NOT a repeated char pattern (multi-char, not all same) */
const nonRepeatedNameArb = fc.string({ minLength: 2, maxLength: 20 })
  .filter((s) => {
    const trimmed = s.trim();
    if (trimmed.length < 2) return false;
    const firstChar = trimmed[0].toLowerCase();
    return !trimmed.split('').every((ch) => ch.toLowerCase() === firstChar);
  });

// ─── Property 5 Tests ─────────────────────────────────────────────────────────

describe('Property 5: Dummy Data Pattern Detection', () => {
  describe('matchesTestNamePattern - names WITH test patterns are detected', () => {
    it('any name containing a test pattern (case-insensitive) returns a non-null match', () => {
      fc.assert(
        fc.property(
          nameWithPatternArb,
          (name) => {
            const result = matchesTestNamePattern(name);
            expect(result).not.toBeNull();
            expect(result).toMatch(/^contains "/);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('detection is case-insensitive (mixed case patterns are still detected)', () => {
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

  describe('matchesTestNamePattern - names WITHOUT test patterns are not flagged', () => {
    it('safe names (no test patterns, not repeated chars) return null', () => {
      fc.assert(
        fc.property(
          safeNameArb,
          (name) => {
            const result = matchesTestNamePattern(name);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('matchesTestNamePattern - null/undefined/empty inputs', () => {
    it('null, undefined, and empty string inputs return null', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, ''),
          (input) => {
            const result = matchesTestNamePattern(input as string | null | undefined);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('matchesTestEmailPattern - emails WITH test domains are detected', () => {
    it('any email ending with a test domain returns a non-null match', () => {
      fc.assert(
        fc.property(
          emailWithTestDomainArb,
          (email) => {
            const result = matchesTestEmailPattern(email);
            expect(result).not.toBeNull();
            expect(result).toMatch(/^domain "/);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('emails containing "+test" are detected', () => {
      fc.assert(
        fc.property(
          emailWithPlusTestArb,
          (email) => {
            const result = matchesTestEmailPattern(email);
            expect(result).not.toBeNull();
            expect(result).toMatch(/contains "\+test"|domain "/);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('detection is case-insensitive for email domains', () => {
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

  describe('matchesTestEmailPattern - emails WITHOUT test patterns are not flagged', () => {
    it('safe emails (non-test domains, no +test) return null', () => {
      fc.assert(
        fc.property(
          safeEmailArb,
          (email) => {
            const result = matchesTestEmailPattern(email);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('matchesTestEmailPattern - null/undefined/empty inputs', () => {
    it('null, undefined, and empty string inputs return null', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, ''),
          (input) => {
            const result = matchesTestEmailPattern(input as string | null | undefined);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('matchesRepeatedCharPattern - repeated char names are detected', () => {
    it('single character names return "single character name"', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[A-Za-z]$/),
          (name) => {
            const result = matchesRepeatedCharPattern(name);
            expect(result).toBe('single character name');
          },
        ),
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
            expect(result).toBe('repeated character name');
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
              i % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase()
            ).join('');
            const result = matchesRepeatedCharPattern(name);
            expect(result).toBe('repeated character name');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('matchesRepeatedCharPattern - non-repeated names are not flagged', () => {
    it('names with multiple distinct characters return null', () => {
      fc.assert(
        fc.property(
          nonRepeatedNameArb,
          (name) => {
            const result = matchesRepeatedCharPattern(name);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('matchesRepeatedCharPattern - null/undefined/empty inputs', () => {
    it('null, undefined, empty, and whitespace-only inputs return null', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, '', '   ', '\t'),
          (input) => {
            const result = matchesRepeatedCharPattern(input as string | null | undefined);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Report completeness - all detections include pattern description', () => {
    it('matchesTestNamePattern always returns a descriptive string when matching', () => {
      fc.assert(
        fc.property(
          nameWithPatternArb,
          (name) => {
            const result = matchesTestNamePattern(name);
            expect(result).not.toBeNull();
            expect(result!.length).toBeGreaterThan(0);
            expect(result).toContain('contains');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('matchesTestEmailPattern always returns a descriptive string when matching', () => {
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

    it('matchesRepeatedCharPattern always returns a descriptive string when matching', () => {
      fc.assert(
        fc.property(
          repeatedCharNameArb,
          (name) => {
            const result = matchesRepeatedCharPattern(name);
            expect(result).not.toBeNull();
            expect(result!.length).toBeGreaterThan(0);
            expect(result).toMatch(/character name/);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});


// ─── Property 6 Tests ─────────────────────────────────────────────────────────

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
  fc.tuple(
    fc.nat({ max: 3 }),
    fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    fc.nat({ max: 3 }),
  ).map(([preLen, name, postLen]) => `${' '.repeat(preLen)}${name}${' '.repeat(postLen)}`),
);

/** Generate a nullable name (for testing null exclusion) */
const nullableNameArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(''),
  fc.constant('   '),
  nameArb,
);

/** Generate a record ID */
const idArb = fc.uuid();

/** Generate a status field */
const statusArb6 = fc.oneof(
  fc.constant('active'),
  fc.constant('inactive'),
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
  created_at: fc.oneof(fc.constant('2024-01-01'), fc.constant('2024-06-15'), fc.constant(null)),
  trainer_id: fc.oneof(idArb, fc.constant(null)),
  foto_url: fc.oneof(fc.constant('photo.jpg'), fc.constant(null), fc.constant('')),
});

/** Generate a set of records that guarantees some duplicates */
function recordsWithDuplicatesArb(keyFields: string[]) {
  return fc.tuple(
    nameArb,
    nameArb.filter((s) => s.trim().length > 0),
    fc.array(pesertaRecordArb, { minLength: 0, maxLength: 5 }),
  ).chain(([sharedName1, sharedName2, extraRecords]) => {
    const duplicateCount = fc.nat({ max: 2 }).map((n) => n + 2);
    return duplicateCount.chain((count) => {
      return fc.array(
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
          is_deleted: fc.oneof(fc.constant(false), fc.constant(undefined), fc.constant(null)),
          status: statusArb6,
          created_at: fc.oneof(fc.constant('2024-01-01'), fc.constant('2024-06-15'), fc.constant(null)),
          trainer_id: fc.oneof(idArb, fc.constant(null)),
          foto_url: fc.oneof(fc.constant('photo.jpg'), fc.constant(null)),
        }),
        { minLength: count, maxLength: count },
      ).map((duplicates) => [...duplicates, ...extraRecords]);
    });
  });
}

describe('Property 6: Duplicate Record Detection and Resolution', () => {
  describe('normalizeForComparison', () => {
    it('trims whitespace and lowercases for any non-empty string', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
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

    it('returns null for null, undefined, or empty/whitespace-only strings', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant(''),
            fc.nat({ max: 10 }).map((n) => ' '.repeat(n + 1)),
            fc.nat({ max: 5 }).map((n) => '\t'.repeat(n + 1)),
          ),
          (value) => {
            const result = normalizeForComparison(value as string | null | undefined);
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('groupByNormalizedKey - is_deleted exclusion', () => {
    it('records with is_deleted = true are never included in any group', () => {
      fc.assert(
        fc.property(
          fc.array(pesertaRecordArb, { minLength: 1, maxLength: 20 }),
          fc.constantFrom(['nama', 'batch_name'] as string[], ['nama', 'tim'] as string[]),
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

  describe('groupByNormalizedKey - null key exclusion', () => {
    it('records with null/empty key fields are excluded from all groups', () => {
      fc.assert(
        fc.property(
          fc.array(pesertaRecordArb, { minLength: 1, maxLength: 20 }),
          fc.constantFrom(['nama', 'batch_name'] as string[], ['nama', 'tim'] as string[]),
          (records, keyFields) => {
            const groups = groupByNormalizedKey(records, keyFields);

            for (const [, recs] of groups) {
              for (const rec of recs) {
                for (const field of keyFields) {
                  const normalized = normalizeForComparison((rec as Record<string, unknown>)[field] as string | null | undefined);
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

  describe('groupByNormalizedKey - case-insensitive grouping', () => {
    it('records with same normalized key are grouped together regardless of case/whitespace', () => {
      fc.assert(
        fc.property(
          nameArb.filter((s) => s.trim().length > 0),
          nameArb.filter((s) => s.trim().length > 0),
          (baseName, baseBatch) => {
            const records = [
              { id: '1', nama: baseName, batch_name: baseBatch, is_deleted: false },
              { id: '2', nama: baseName.toUpperCase(), batch_name: baseBatch.toUpperCase(), is_deleted: false },
              { id: '3', nama: `  ${baseName}  `, batch_name: ` ${baseBatch} `, is_deleted: false },
            ];

            const groups = groupByNormalizedKey(records, ['nama', 'batch_name']);

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

  describe('buildDuplicateGroups - only groups with 2+ records are duplicates', () => {
    it('singleton groups are never reported as duplicates', () => {
      fc.assert(
        fc.property(
          fc.array(pesertaRecordArb, { minLength: 1, maxLength: 15 }),
          (records) => {
            const groups = groupByNormalizedKey(records, ['nama', 'batch_name']);
            const duplicates = buildDuplicateGroups(
              groups,
              'profiler_peserta',
              ['nama', 'batch_name'],
              ['created_at', 'trainer_id', 'foto_url'],
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

  describe('determineResolution - archive strategy', () => {
    it('returns "archive" when any record has status = inactive', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: idArb,
              status: fc.oneof(fc.constant('active'), fc.constant(null)),
              field1: fc.oneof(fc.constant('a'), fc.constant(null)),
            }),
            { minLength: 1, maxLength: 4 },
          ),
          fc.nat({ max: 10 }),
          (baseRecords, insertIdx) => {
            const inactiveRecord = {
              id: 'inactive-id',
              status: 'inactive',
              field1: 'value',
            };
            const idx = insertIdx % (baseRecords.length + 1);
            const records = [
              ...baseRecords.slice(0, idx),
              inactiveRecord,
              ...baseRecords.slice(idx),
            ];

            const result = determineResolution(records, ['field1']);
            expect(result).toBe('archive');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('determineResolution - flag for manual review strategy', () => {
    it('returns "flag for manual review" when records have conflicting non-null values and no inactive status', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0 && s !== 'inactive'),
          (value1, value2) => {
            fc.pre(value1 !== value2);

            const records = [
              { id: '1', status: 'active', diffField: value1 },
              { id: '2', status: 'active', diffField: value2 },
            ];

            const result = determineResolution(records, ['diffField']);
            expect(result).toBe('flag for manual review');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('determineResolution - merge strategy', () => {
    it('returns "merge" when no inactive status and no conflicting non-null values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (sharedValue) => {
            const records = [
              { id: '1', status: 'active', diffField: sharedValue },
              { id: '2', status: 'active', diffField: null },
            ];

            const result = determineResolution(records, ['diffField']);
            expect(result).toBe('merge');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('returns "merge" when all non-null values in differing fields are identical', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (sharedValue) => {
            const records = [
              { id: '1', status: 'active', diffField: sharedValue },
              { id: '2', status: 'active', diffField: sharedValue },
              { id: '3', status: 'active', diffField: sharedValue },
            ];

            const result = determineResolution(records, ['diffField']);
            expect(result).toBe('merge');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('determineResolution - priority ordering', () => {
    it('"archive" takes priority over "flag for manual review"', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
          (value1, value2) => {
            fc.pre(value1 !== value2);

            const records = [
              { id: '1', status: 'inactive', diffField: value1 },
              { id: '2', status: 'active', diffField: value2 },
            ];

            const result = determineResolution(records, ['diffField']);
            expect(result).toBe('archive');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('End-to-end duplicate detection pipeline', () => {
    it('correctly identifies duplicates from generated record sets with mixed keys', () => {
      fc.assert(
        fc.property(
          recordsWithDuplicatesArb(['nama', 'batch_name']),
          (records) => {
            const groups = groupByNormalizedKey(records, ['nama', 'batch_name']);
            const duplicates = buildDuplicateGroups(
              groups,
              'profiler_peserta',
              ['nama', 'batch_name'],
              ['created_at', 'trainer_id', 'foto_url'],
            );

            for (const group of duplicates) {
              expect(group.table).toBe('profiler_peserta');
              expect(group.recordIds.length).toBeGreaterThanOrEqual(2);
              expect(['merge', 'archive', 'flag for manual review']).toContain(group.resolution);
              expect(Object.keys(group.matchedFields)).toContain('nama');
              expect(Object.keys(group.matchedFields)).toContain('batch_name');

              for (const id of group.recordIds) {
                expect(group.differingValues).toHaveProperty(id);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('resolution strategy is consistent with record data', () => {
      fc.assert(
        fc.property(
          recordsWithDuplicatesArb(['nama', 'batch_name']),
          (records) => {
            const groups = groupByNormalizedKey(records, ['nama', 'batch_name']);
            const duplicates = buildDuplicateGroups(
              groups,
              'profiler_peserta',
              ['nama', 'batch_name'],
              ['created_at', 'trainer_id', 'foto_url'],
            );

            for (const group of duplicates) {
              const groupRecords = records.filter((r) =>
                group.recordIds.includes(String(r.id)),
              );

              const hasInactive = groupRecords.some(
                (r) => typeof r.status === 'string' && r.status.toLowerCase() === 'inactive',
              );

              if (hasInactive) {
                expect(group.resolution).toBe('archive');
              }
              if (group.resolution === 'merge') {
                expect(hasInactive).toBe(false);
              }
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('countNullFields', () => {
    it('correctly counts null/undefined/empty fields for any record', () => {
      fc.assert(
        fc.property(
          fc.record({
            field1: fc.oneof(fc.constant(null), fc.constant('value'), fc.constant('')),
            field2: fc.oneof(fc.constant(null), fc.constant(42), fc.constant('')),
            field3: fc.oneof(fc.constant(null), fc.constant(true), fc.constant('')),
            field4: fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant('data')),
          }),
          (record) => {
            const count = countNullFields(record);

            const expected = Object.values(record).filter(
              (v) => v == null || v === '',
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
  fc.nat({ max: max - min }).map((n) => ' '.repeat(n + min));

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
describe('Property 7: Name Consistency Detection', () => {
  describe('Levenshtein distance properties', () => {
    it('Levenshtein distance is symmetric: d(a,b) = d(b,a)', () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          shortStringArb,
          shortStringArb,
          (a, b) => {
            const distAB = levenshteinDistance(a, b);
            const distBA = levenshteinDistance(b, a);
            expect(distAB).toBe(distBA);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Levenshtein distance is 0 if and only if strings are identical', () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          shortStringArb,
          shortStringArb,
          (a, b) => {
            const dist = levenshteinDistance(a, b);
            if (a === b) {
              expect(dist).toBe(0);
            } else {
              expect(dist).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Levenshtein distance of a string with itself is always 0', () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          shortStringArb,
          (a) => {
            expect(levenshteinDistance(a, a)).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Levenshtein distance satisfies triangle inequality: d(a,c) ≤ d(a,b) + d(b,c)', () => {
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Levenshtein distance is at most max(len(a), len(b))', () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          shortStringArb,
          shortStringArb,
          (a, b) => {
            const dist = levenshteinDistance(a, b);
            const maxLen = Math.max(a.slice(0, 100).length, b.slice(0, 100).length);
            expect(dist).toBeLessThanOrEqual(maxLen);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Substring detection properties', () => {
    it('if a contains b (len≥4) and they are not equal, isSubstringMatch returns true', () => {
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
            if (outer.toLowerCase().trim() === inner.toLowerCase().trim()) return;
            if (outer.trim().length < 4 || inner.trim().length < 4) return;

            expect(isSubstringMatch(outer, inner)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isSubstringMatch returns false for exact matches (case-insensitive)', () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          substringNameArb,
          (name) => {
            // Same string should not be a "substring match"
            expect(isSubstringMatch(name, name)).toBe(false);
            // Case-insensitive same string
            expect(isSubstringMatch(name, name.toUpperCase())).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isSubstringMatch returns false when either string is shorter than minLength', () => {
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isSubstringMatch is symmetric: isSubstringMatch(a,b) === isSubstringMatch(b,a)', () => {
      /**
       * **Validates: Requirements 10.1**
       */
      fc.assert(
        fc.property(
          substringNameArb,
          substringNameArb,
          (a, b) => {
            expect(isSubstringMatch(a, b)).toBe(isSubstringMatch(b, a));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Canonical form properties', () => {
    it('canonical form is always trimmed (no leading/trailing whitespace)', () => {
      /**
       * **Validates: Requirements 10.3**
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          (name) => {
            const canonical = deriveCanonicalForm(name);
            expect(canonical).toBe(canonical.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canonical form has no consecutive spaces', () => {
      /**
       * **Validates: Requirements 10.3**
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          (name) => {
            const canonical = deriveCanonicalForm(name);
            expect(canonical).not.toMatch(/\s{2,}/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canonical form is title-cased (each word starts with uppercase, rest lowercase)', () => {
      /**
       * **Validates: Requirements 10.3**
       */
      fc.assert(
        fc.property(
          fc.array(alphaStringArb(1, 10), { minLength: 1, maxLength: 4 }).map((words) => words.join(' ')),
          (name) => {
            const canonical = deriveCanonicalForm(name);
            const words = canonical.split(' ');
            for (const word of words) {
              if (word.length === 0) continue;
              expect(word[0]).toBe(word[0].toUpperCase());
              if (word.length > 1) {
                expect(word.slice(1)).toBe(word.slice(1).toLowerCase());
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canonical form is idempotent: deriveCanonicalForm(deriveCanonicalForm(x)) === deriveCanonicalForm(x)', () => {
      /**
       * **Validates: Requirements 10.3**
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
          (name) => {
            const once = deriveCanonicalForm(name);
            const twice = deriveCanonicalForm(once);
            expect(twice).toBe(once);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Whitespace detection properties', () => {
    it('names with leading whitespace are detected', () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(
          spacesArb(1, 5),
          alphaStringArb(1, 20),
          (spaces, name) => {
            const nameWithLeading = spaces + name;
            const issues = detectWhitespaceIssues(nameWithLeading);
            expect(issues).toContain('leading whitespace');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('names with trailing whitespace are detected', () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(
          alphaStringArb(1, 20),
          spacesArb(1, 5),
          (name, spaces) => {
            const nameWithTrailing = name + spaces;
            const issues = detectWhitespaceIssues(nameWithTrailing);
            expect(issues).toContain('trailing whitespace');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('names with consecutive internal spaces are detected', () => {
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
            expect(issues).toContain('consecutive internal spaces');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('clean names (trimmed, single spaces) have no whitespace issues', () => {
      /**
       * **Validates: Requirements 10.2**
       */
      fc.assert(
        fc.property(
          fc.array(alphaStringArb(1, 10), { minLength: 1, maxLength: 4 }),
          (words) => {
            const cleanName = words.join(' ');
            const issues = detectWhitespaceIssues(cleanName);
            expect(issues).toHaveLength(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Abbreviation detection properties', () => {
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
          }
        ),
        { numRuns: 100 }
      );
    });

    it('abbreviation detection is symmetric', () => {
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
              detectAbbreviation(full, abbreviated)
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('two full names (no abbreviation pattern) are not detected as abbreviation', () => {
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
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
