import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import {
  mockBuildQuery,
  mockPeriods,
  mockFolders,
  mockIndicators,
  mockWeights,
} from "./helpers/sidak-dashboard-fixtures";

// ─── Mock Setup ────────────────────────────────────────────────────────────────

let mvState: "returns-data" | "returns-null" | "throws-error" = "returns-data";
let mvData: Record<string, any> | null = null;

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((tableName: string) => {
      if (tableName === "mv_qa_period_summary") {
        if (mvState === "throws-error") {
          return mockBuildQuery(tableName, () => {
            throw new Error('relation "mv_qa_period_summary" does not exist');
          });
        }
        return mockBuildQuery(tableName, () => ({ data: mvData, error: null }));
      }

      if (tableName === "qa_periods") {
        return mockBuildQuery(tableName, () => ({
          data: mockPeriods,
          error: null,
        }));
      }
      if (tableName === "profiler_folders") {
        return mockBuildQuery(tableName, () => ({
          data: mockFolders,
          error: null,
        }));
      }
      if (tableName === "qa_indicators") {
        return mockBuildQuery(tableName, () => ({
          data: mockIndicators,
          error: null,
        }));
      }
      if (tableName === "qa_service_weights") {
        return mockBuildQuery(tableName, () => ({
          data: mockWeights,
          error: null,
        }));
      }
      if (tableName === "profiles") {
        return mockBuildQuery(tableName, () => ({ data: [], error: null }));
      }
      if (tableName === "qa_dashboard_period_summary") {
        return mockBuildQuery(tableName, () => ({ data: null, error: null }));
      }
      if (tableName === "qa_temuan") {
        return mockBuildQuery(tableName, () => ({ data: [], error: null }));
      }

      return mockBuildQuery(tableName, () => ({ data: [], error: null }));
    }),
  },
  createAdminClient: vi.fn(),
}));

import * as sidakService from "../services/sidak-service";

describe("Dashboard Materialized View Fallback", () => {
  beforeEach(() => {
    mvState = "returns-data";
    mvData = null;
  });

  const mvStateArb = fc.oneof(
    fc.constant("returns-data" as const),
    fc.constant("returns-null" as const),
    fc.constant("throws-error" as const),
  );

  const mvRowArb = fc.record({
    total_agents: fc.integer({ min: 0, max: 1000 }),
    total_defects: fc.integer({ min: 0, max: 5000 }),
    avg_defects_per_audit: fc.float({ min: 0, max: 100, noNaN: true }),
    zero_error_rate: fc.float({ min: 0, max: 1, noNaN: true }),
    avg_agent_score: fc.float({ min: 0, max: 100, noNaN: true }),
    compliance_rate: fc.float({ min: 0, max: 1, noNaN: true }),
    compliance_count: fc.integer({ min: 0, max: 1000 }),
  });

  const serviceTypeArb = fc.oneof(
    fc.constant("call"),
    fc.constant("email"),
    fc.constant("chat"),
  );

  const periodIdArb = fc.uuid();

  it("should always return valid dashboard data regardless of MV state (Property 1)", async () => {
    await fc.assert(
      fc.asyncProperty(
        mvStateArb,
        mvRowArb,
        serviceTypeArb,
        periodIdArb,
        async (state, mvRowData, serviceType, periodId) => {
          mvState = state;

          if (state === "returns-data") {
            mvData = {
              ...mvRowData,
              period_id: periodId,
              service_type: serviceType,
            };
          } else {
            mvData = null;
          }

          const result = await sidakService.getDashboardData({
            period_ids: [periodId],
            service_type: serviceType,
          });

          expect(result).toBeDefined();
          expect(result.summary).toBeDefined();

          const summary = result.summary!;
          expect(typeof summary.totalDefects).toBe("number");
          expect(typeof summary.avgDefectsPerAudit).toBe("number");
          expect(typeof summary.zeroErrorRate).toBe("number");
          expect(typeof summary.avgAgentScore).toBe("number");
          expect(typeof summary.complianceRate).toBe("number");
          expect(typeof summary.complianceCount).toBe("number");
          expect(typeof summary.totalAgents).toBe("number");

          expect(Number.isNaN(summary.totalDefects)).toBe(false);
          expect(Number.isNaN(summary.avgDefectsPerAudit)).toBe(false);
          expect(Number.isNaN(summary.zeroErrorRate)).toBe(false);
          expect(Number.isNaN(summary.avgAgentScore)).toBe(false);
          expect(Number.isNaN(summary.complianceRate)).toBe(false);
          expect(Number.isNaN(summary.complianceCount)).toBe(false);
          expect(Number.isNaN(summary.totalAgents)).toBe(false);

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

          const result = await sidakService.getDashboardData({
            period_ids: [periodId],
            service_type: serviceType,
          });

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

          const result = await sidakService.getDashboardData({
            period_ids: [periodId],
            service_type: serviceType,
          });

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

          const result = await sidakService.getDashboardData({
            period_ids: [periodId],
            service_type: serviceType,
          });

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
