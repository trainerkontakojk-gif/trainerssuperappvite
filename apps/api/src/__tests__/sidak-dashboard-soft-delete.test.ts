import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  shouldBeExcluded,
  simulateGetSoftDeletedPesertaIds,
  simulateFilteredResults,
  profileArb,
  pesertaArb,
} from "./helpers/sidak-dashboard-fixtures";

describe("Property 8: Soft-Delete Dashboard Exclusion", () => {
  /**
   * **Validates: Requirements 12.1, 12.2, 12.6**
   *
   * Property: Records linked to deleted/inactive profiles are ALWAYS excluded
   * from dashboard results when showArchived is false.
   */
  it("excluded records never appear in filtered results", () => {
    fc.assert(
      fc.property(
        fc
          .array(profileArb, { minLength: 1, maxLength: 10 })
          .chain((profiles) => {
            const profileIds = profiles.map((p) => p.id);
            return fc.tuple(
              fc.constant(profiles),
              fc.array(pesertaArb(profileIds), { minLength: 1, maxLength: 20 }),
            );
          }),
        ([profiles, pesertaRecords]) => {
          const excludedIds = simulateGetSoftDeletedPesertaIds(
            profiles,
            pesertaRecords,
          );
          const results = simulateFilteredResults(
            pesertaRecords,
            excludedIds,
            false,
          );

          // Every record in results must NOT be linked to a deleted/inactive profile
          for (const result of results) {
            expect(shouldBeExcluded(result, profiles)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * Property: Records with null user_id are ALWAYS included in results
   * (treated as not-deleted).
   */
  it("null-profile records (user_id = null) are always included", () => {
    fc.assert(
      fc.property(
        fc
          .array(profileArb, { minLength: 1, maxLength: 10 })
          .chain((profiles) => {
            const profileIds = profiles.map((p) => p.id);
            return fc.tuple(
              fc.constant(profiles),
              fc.array(pesertaArb(profileIds), { minLength: 1, maxLength: 20 }),
            );
          }),
        ([profiles, pesertaRecords]) => {
          const excludedIds = simulateGetSoftDeletedPesertaIds(
            profiles,
            pesertaRecords,
          );
          const results = simulateFilteredResults(
            pesertaRecords,
            excludedIds,
            false,
          );

          // All peserta with user_id = null must appear in results
          const nullUserIdPeserta = pesertaRecords.filter(
            (pp) => pp.user_id === null,
          );
          for (const pp of nullUserIdPeserta) {
            expect(results.some((r) => r.id === pp.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.1, 12.2**
   *
   * Property: Every peserta linked to a profile with is_deleted=true or
   * status='inactive' is excluded from results.
   */
  it("all peserta linked to deleted/inactive profiles are excluded", () => {
    fc.assert(
      fc.property(
        fc
          .array(profileArb, { minLength: 1, maxLength: 10 })
          .chain((profiles) => {
            const profileIds = profiles.map((p) => p.id);
            return fc.tuple(
              fc.constant(profiles),
              fc.array(pesertaArb(profileIds), { minLength: 1, maxLength: 20 }),
            );
          }),
        ([profiles, pesertaRecords]) => {
          const excludedIds = simulateGetSoftDeletedPesertaIds(
            profiles,
            pesertaRecords,
          );
          const results = simulateFilteredResults(
            pesertaRecords,
            excludedIds,
            false,
          );

          // Every peserta that should be excluded must NOT appear in results
          for (const pp of pesertaRecords) {
            if (shouldBeExcluded(pp, profiles)) {
              expect(results.some((r) => r.id === pp.id)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.6**
   *
   * Property: Records where the profile join returns null (user_id points to
   * non-existent profile) are treated as not-deleted and included.
   */
  it("records with non-existent profile (join returns null) are included", () => {
    fc.assert(
      fc.property(
        fc
          .array(profileArb, { minLength: 1, maxLength: 5 })
          .chain((profiles) => {
            const profileIds = profiles.map((p) => p.id);
            return fc.tuple(
              fc.constant(profiles),
              fc.array(pesertaArb(profileIds), { minLength: 1, maxLength: 15 }),
            );
          }),
        ([profiles, pesertaRecords]) => {
          const excludedIds = simulateGetSoftDeletedPesertaIds(
            profiles,
            pesertaRecords,
          );
          const results = simulateFilteredResults(
            pesertaRecords,
            excludedIds,
            false,
          );

          // Peserta with user_id that doesn't match any profile should be included
          const orphanedPeserta = pesertaRecords.filter(
            (pp) =>
              pp.user_id !== null && !profiles.some((p) => p.id === pp.user_id),
          );
          for (const pp of orphanedPeserta) {
            expect(results.some((r) => r.id === pp.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.1, 12.2, 12.6**
   *
   * Property: showArchived=true bypasses all exclusion — all records are returned.
   */
  it("showArchived=true returns all records regardless of deletion status", () => {
    fc.assert(
      fc.property(
        fc
          .array(profileArb, { minLength: 1, maxLength: 10 })
          .chain((profiles) => {
            const profileIds = profiles.map((p) => p.id);
            return fc.tuple(
              fc.constant(profiles),
              fc.array(pesertaArb(profileIds), { minLength: 1, maxLength: 20 }),
            );
          }),
        ([profiles, pesertaRecords]) => {
          const excludedIds = simulateGetSoftDeletedPesertaIds(
            profiles,
            pesertaRecords,
          );
          const results = simulateFilteredResults(
            pesertaRecords,
            excludedIds,
            true,
          );

          // All records should be present when showArchived is true
          expect(results.length).toBe(pesertaRecords.length);
          for (const pp of pesertaRecords) {
            expect(results.some((r) => r.id === pp.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 12.1, 12.2, 12.6**
   *
   * Property: The set of included + excluded records partition the full input set
   * (no records are lost or duplicated).
   */
  it("included + excluded records partition the full input set", () => {
    fc.assert(
      fc.property(
        fc
          .array(profileArb, { minLength: 1, maxLength: 10 })
          .chain((profiles) => {
            const profileIds = profiles.map((p) => p.id);
            return fc.tuple(
              fc.constant(profiles),
              fc.array(pesertaArb(profileIds), { minLength: 1, maxLength: 20 }),
            );
          }),
        ([profiles, pesertaRecords]) => {
          const excludedIds = simulateGetSoftDeletedPesertaIds(
            profiles,
            pesertaRecords,
          );
          const results = simulateFilteredResults(
            pesertaRecords,
            excludedIds,
            false,
          );

          // results + excluded = all records (no loss, no duplication)
          const includedIds = new Set(results.map((r) => r.id));
          const excludedSet = new Set(excludedIds);

          for (const pp of pesertaRecords) {
            const isIncluded = includedIds.has(pp.id);
            const isExcluded = excludedSet.has(pp.id);
            // Each record is either included or excluded, not both
            expect(isIncluded !== isExcluded).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
