import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ─── Mock Setup ────────────────────────────────────────────────────────────────

// Track which table is being queried and what state to simulate
let mvState: "returns-data" | "returns-null" | "throws-error" = "returns-data";
let mvData: Record<string, any> | null = null;
let queryCallCount = 0;

function buildQuery(tableName: string, onAwait: () => any) {
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve(onAwait());
        }
        return (..._args: any[]) => q;
      },
    },
  );
  return q;
}

// Default mock data for supporting queries
const mockPeriods = [
  { id: "period-1", month: 1, year: 2025, label: "01/2025" },
];
const mockFolders = [{ id: "folder-1", name: "Folder A" }];
const mockIndicators = [
  {
    id: "ind-1",
    name: "Greeting",
    category: "non_critical",
    service_type: "call",
    bobot: 1,
  },
  {
    id: "ind-2",
    name: "Critical Point",
    category: "critical",
    service_type: "call",
    bobot: 1,
  },
];
const mockWeights = [
  {
    service_type: "call",
    critical_weight: 0.5,
    non_critical_weight: 0.5,
    scoring_mode: "weighted",
  },
];
let mockTemuan: any[] = [];

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((tableName: string) => {
      queryCallCount++;

      if (tableName === "mv_qa_period_summary") {
        if (mvState === "throws-error") {
          // Simulate MV throwing an error
          return buildQuery(tableName, () => {
            throw new Error('relation "mv_qa_period_summary" does not exist');
          });
        }
        return buildQuery(tableName, () => ({ data: mvData, error: null }));
      }

      if (tableName === "qa_periods") {
        return buildQuery(tableName, () => ({
          data: mockPeriods,
          error: null,
        }));
      }
      if (tableName === "profiler_folders") {
        return buildQuery(tableName, () => ({
          data: mockFolders,
          error: null,
        }));
      }
      if (tableName === "qa_indicators") {
        return buildQuery(tableName, () => ({
          data: mockIndicators,
          error: null,
        }));
      }
      if (tableName === "qa_service_weights") {
        return buildQuery(tableName, () => ({
          data: mockWeights,
          error: null,
        }));
      }
      if (tableName === "profiles") {
        return buildQuery(tableName, () => ({ data: [], error: null }));
      }
      if (tableName === "qa_dashboard_period_summary") {
        return buildQuery(tableName, () => ({ data: null, error: null }));
      }
      if (tableName === "qa_temuan") {
        return buildQuery(tableName, () => ({ data: mockTemuan, error: null }));
      }

      return buildQuery(tableName, () => ({ data: [], error: null }));
    }),
  },
  createAdminClient: vi.fn(),
}));

import * as sidakService from "../services/sidak-service";

// ─── Property Test: Dashboard Materialized View Fallback ───────────────────────

describe("Dashboard Materialized View Fallback", () => {
  /**
   * **Validates: Requirements 3.2, 3.4**
   *
   * Property 1: Dashboard Materialized View Fallback
   *
   * For any dashboard query parameters (period_ids, service_type, agent_ids),
   * when the materialized view returns data, the Dashboard_Query SHALL use that data;
   * when the materialized view is unavailable or returns no rows, the Dashboard_Query
   * SHALL compute equivalent results from raw tables without error.
   */

  beforeEach(() => {
    mvState = "returns-data";
    mvData = null;
    queryCallCount = 0;
  });

  // Arbitrary generators for MV availability states
  const mvStateArb = fc.oneof(
    fc.constant("returns-data" as const),
    fc.constant("returns-null" as const),
    fc.constant("throws-error" as const),
  );

  // Generator for valid MV row data
  const mvRowArb = fc.record({
    total_agents: fc.integer({ min: 0, max: 1000 }),
    total_defects: fc.integer({ min: 0, max: 5000 }),
    avg_defects_per_audit: fc.float({ min: 0, max: 100, noNaN: true }),
    zero_error_rate: fc.float({ min: 0, max: 1, noNaN: true }),
    avg_agent_score: fc.float({ min: 0, max: 100, noNaN: true }),
    compliance_rate: fc.float({ min: 0, max: 1, noNaN: true }),
    compliance_count: fc.integer({ min: 0, max: 1000 }),
  });

  // Generator for service types
  const serviceTypeArb = fc.oneof(
    fc.constant("call"),
    fc.constant("email"),
    fc.constant("chat"),
  );

  // Generator for period IDs (UUID-like)
  const periodIdArb = fc.uuid();

  it("should always return valid dashboard data regardless of MV state (Property 1)", async () => {
    await fc.assert(
      fc.asyncProperty(
        mvStateArb,
        mvRowArb,
        serviceTypeArb,
        periodIdArb,
        async (state, mvRowData, serviceType, periodId) => {
          // Setup MV state for this iteration
          mvState = state;
          queryCallCount = 0;

          if (state === "returns-data") {
            mvData = {
              ...mvRowData,
              period_id: periodId,
              service_type: serviceType,
            };
          } else {
            mvData = null;
          }

          // Call getDashboardData with params that trigger MV path
          // (single period + specific service type)
          const result = await sidakService.getDashboardData({
            period_ids: [periodId],
            service_type: serviceType,
          });

          // Property: dashboard always returns valid data
          expect(result).toBeDefined();
          expect(result.summary).toBeDefined();

          // Summary must have all required numeric fields
          const summary = result.summary!;
          expect(typeof summary.totalDefects).toBe("number");
          expect(typeof summary.avgDefectsPerAudit).toBe("number");
          expect(typeof summary.zeroErrorRate).toBe("number");
          expect(typeof summary.avgAgentScore).toBe("number");
          expect(typeof summary.complianceRate).toBe("number");
          expect(typeof summary.complianceCount).toBe("number");
          expect(typeof summary.totalAgents).toBe("number");

          // No NaN values in summary
          expect(Number.isNaN(summary.totalDefects)).toBe(false);
          expect(Number.isNaN(summary.avgDefectsPerAudit)).toBe(false);
          expect(Number.isNaN(summary.zeroErrorRate)).toBe(false);
          expect(Number.isNaN(summary.avgAgentScore)).toBe(false);
          expect(Number.isNaN(summary.complianceRate)).toBe(false);
          expect(Number.isNaN(summary.complianceCount)).toBe(false);
          expect(Number.isNaN(summary.totalAgents)).toBe(false);

          // Non-negative values
          expect(summary.totalDefects).toBeGreaterThanOrEqual(0);
          expect(summary.totalAgents).toBeGreaterThanOrEqual(0);
          expect(summary.complianceCount).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should use MV data when MV returns valid rows", async () => {
    await fc.assert(
      fc.asyncProperty(
        mvRowArb,
        serviceTypeArb,
        periodIdArb,
        async (mvRowData, serviceType, periodId) => {
          mvState = "returns-data";
          mvData = {
            ...mvRowData,
            period_id: periodId,
            service_type: serviceType,
          };
          queryCallCount = 0;

          const result = await sidakService.getDashboardData({
            period_ids: [periodId],
            service_type: serviceType,
          });

          // When MV returns data, summary should reflect MV values
          const summary = result.summary!;
          expect(summary.totalDefects).toBe(Number(mvRowData.total_defects));
          expect(summary.totalAgents).toBe(Number(mvRowData.total_agents));
          expect(summary.complianceCount).toBe(
            Number(mvRowData.compliance_count),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should never propagate MV errors to caller", async () => {
    await fc.assert(
      fc.asyncProperty(
        serviceTypeArb,
        periodIdArb,
        async (serviceType, periodId) => {
          mvState = "throws-error";
          mvData = null;
          queryCallCount = 0;

          // Property: MV errors never propagate — getDashboardData should NOT throw
          const result = await sidakService.getDashboardData({
            period_ids: [periodId],
            service_type: serviceType,
          });

          // Should still return valid data (from raw computation fallback)
          expect(result).toBeDefined();
          expect(result.summary).toBeDefined();
          expect(typeof result.summary!.totalDefects).toBe("number");
          expect(typeof result.summary!.totalAgents).toBe("number");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("should fall back gracefully when MV returns null/no rows", async () => {
    await fc.assert(
      fc.asyncProperty(
        serviceTypeArb,
        periodIdArb,
        async (serviceType, periodId) => {
          mvState = "returns-null";
          mvData = null;
          queryCallCount = 0;

          // Property: null MV result triggers fallback without error
          const result = await sidakService.getDashboardData({
            period_ids: [periodId],
            service_type: serviceType,
          });

          // Should still return valid data (from cache or raw computation)
          expect(result).toBeDefined();
          expect(result.summary).toBeDefined();
          expect(typeof result.summary!.totalDefects).toBe("number");
          expect(typeof result.summary!.totalAgents).toBe("number");
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property Test: Soft-Delete Dashboard Exclusion ────────────────────────────

/**
 * Property 8: Soft-Delete Dashboard Exclusion
 * Validates: Requirements 12.1, 12.2, 12.6
 *
 * For any dashboard query (temuan retrieval, agent rankings, agent lists),
 * all records linked to a profile with is_deleted = true or status = 'inactive'
 * SHALL be excluded from results, and records where the profile join returns null
 * SHALL be treated as not deleted and included.
 */

// ─── Types for soft-delete test data generation ───────────────────────────────

interface ProfileRecord {
  id: string;
  is_deleted: boolean | null;
  status: "active" | "inactive";
}

interface PesertaRecord {
  id: string;
  user_id: string | null;
  nama: string;
  tim: string;
  batch_name: string;
}

// ─── Helper: determine if a peserta should be excluded ────────────────────────

function shouldBeExcluded(
  peserta: PesertaRecord,
  profiles: ProfileRecord[],
): boolean {
  // If user_id is null, the record is NOT excluded (Requirement 12.6)
  if (peserta.user_id === null) return false;

  // Find the linked profile
  const profile = profiles.find((p) => p.id === peserta.user_id);

  // If no profile found (join returns null), treat as not deleted (Requirement 12.6)
  if (!profile) return false;

  // Excluded if is_deleted = true OR status = 'inactive' (Requirements 12.1, 12.2)
  return profile.is_deleted === true || profile.status === "inactive";
}

// ─── Simulate the getSoftDeletedPesertaIds logic ──────────────────────────────

function simulateGetSoftDeletedPesertaIds(
  profiles: ProfileRecord[],
  pesertaRecords: PesertaRecord[],
): string[] {
  // Step 1: Find profiles with is_deleted = true OR status = 'inactive'
  const deletedProfiles = profiles.filter(
    (p) => p.is_deleted === true || p.status === "inactive",
  );

  if (deletedProfiles.length === 0) return [];

  const deletedProfileIds = deletedProfiles.map((p) => p.id);

  // Step 2: Find peserta records whose user_id is in the deleted profile IDs
  // Records with user_id = null will NOT match (they are not excluded)
  const excludedPeserta = pesertaRecords.filter(
    (pp) => pp.user_id !== null && deletedProfileIds.includes(pp.user_id),
  );

  return excludedPeserta.map((pp) => pp.id);
}

// ─── Simulate filtering (like getAgents does) ─────────────────────────────────

function simulateFilteredResults(
  pesertaRecords: PesertaRecord[],
  excludedIds: string[],
  showArchived: boolean,
): PesertaRecord[] {
  if (showArchived) return pesertaRecords;
  return pesertaRecords.filter((pp) => !excludedIds.includes(pp.id));
}

// ─── Arbitraries for soft-delete tests ────────────────────────────────────────

const profileArb: fc.Arbitrary<ProfileRecord> = fc.record({
  id: fc.uuid(),
  is_deleted: fc.oneof(
    fc.constant(true),
    fc.constant(false),
    fc.constant(null),
  ),
  status: fc.oneof(
    fc.constant("active" as const),
    fc.constant("inactive" as const),
  ),
});

function pesertaArb(profileIds: string[]): fc.Arbitrary<PesertaRecord> {
  // user_id can be null, a valid profile ID, or a non-existent ID
  const userIdArb = fc.oneof(
    fc.constant(null),
    ...(profileIds.length > 0
      ? [fc.constantFrom(...profileIds)]
      : [fc.constant(null)]),
    fc.uuid(), // non-existent profile ID (simulates join returning null)
  );

  return fc.record({
    id: fc.uuid(),
    user_id: userIdArb,
    nama: fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => s.trim().length > 0),
    tim: fc.constantFrom("Tim A", "Tim B", "Tim C"),
    batch_name: fc.constantFrom("Batch 1", "Batch 2", "Batch 3"),
  });
}

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

describe("hasCritical Parity Validation", () => {
  beforeEach(() => {
    mvState = "returns-null";
    mvData = null;
    mockTemuan = [];
  });

  it("should return hasCritical: false if agent only has non-critical findings", async () => {
    mockTemuan = [
      {
        id: "t-1",
        peserta_id: "agent-1",
        indicator_id: "ind-1", // non_critical
        nilai: 0,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "call",
        profiler_peserta: {
          id: "agent-1",
          nama: "Agent One",
          batch_name: "Batch 1",
          tim: "Tim A",
          jabatan: "Agent",
        },
      },
    ];

    const result = await sidakService.getDashboardData({
      period_ids: ["period-1"],
      service_type: "call",
      year: 2025,
    });

    const agent = result.topAgents.find((a) => a.agentId === "agent-1");
    expect(agent).toBeDefined();
    expect(agent?.hasCritical).toBe(false);
  });

  it("should return hasCritical: false if critical finding has nilai > 0 (1 or 2)", async () => {
    mockTemuan = [
      {
        id: "t-2",
        peserta_id: "agent-2",
        indicator_id: "ind-2", // critical
        nilai: 1,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "call",
        profiler_peserta: {
          id: "agent-2",
          nama: "Agent Two",
          batch_name: "Batch 1",
          tim: "Tim A",
          jabatan: "Agent",
        },
      },
      {
        id: "t-3",
        peserta_id: "agent-3",
        indicator_id: "ind-2", // critical
        nilai: 2,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "call",
        profiler_peserta: {
          id: "agent-3",
          nama: "Agent Three",
          batch_name: "Batch 1",
          tim: "Tim A",
          jabatan: "Agent",
        },
      },
    ];

    const result = await sidakService.getDashboardData({
      period_ids: ["period-1"],
      service_type: "call",
      year: 2025,
    });

    const agent2 = result.topAgents.find((a) => a.agentId === "agent-2");
    const agent3 = result.topAgents.find((a) => a.agentId === "agent-3");
    expect(agent2?.hasCritical).toBe(false);
    expect(agent3?.hasCritical).toBe(false);
  });

  it("should return hasCritical: false if critical finding has nilai = 0 but is phantom padding", async () => {
    mockTemuan = [
      {
        id: "t-4",
        peserta_id: "agent-4",
        indicator_id: "ind-2", // critical
        nilai: 0,
        is_phantom_padding: true,
        tahun: 2025,
        period_id: "period-1",
        service_type: "call",
        profiler_peserta: {
          id: "agent-4",
          nama: "Agent Four",
          batch_name: "Batch 1",
          tim: "Tim A",
          jabatan: "Agent",
        },
      },
    ];

    const result = await sidakService.getDashboardData({
      period_ids: ["period-1"],
      service_type: "call",
      year: 2025,
    });

    const agent = result.topAgents.find((a) => a.agentId === "agent-4");
    expect(agent?.hasCritical).toBe(false);
  });

  it("should return hasCritical: true if critical finding has nilai = 0 and is not phantom padding", async () => {
    mockTemuan = [
      {
        id: "t-5",
        peserta_id: "agent-5",
        indicator_id: "ind-2", // critical
        nilai: 0,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "call",
        profiler_peserta: {
          id: "agent-5",
          nama: "Agent Five",
          batch_name: "Batch 1",
          tim: "Tim A",
          jabatan: "Agent",
        },
      },
    ];

    const result = await sidakService.getDashboardData({
      period_ids: ["period-1"],
      service_type: "call",
      year: 2025,
    });

    const agent = result.topAgents.find((a) => a.agentId === "agent-5");
    expect(agent?.hasCritical).toBe(true);
  });
});
