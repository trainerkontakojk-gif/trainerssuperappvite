import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockBuildQuery,
  mockPeriods,
  mockFolders,
  mockIndicators,
  mockWeights,
} from "./helpers/sidak-dashboard-fixtures";

// ─── Mock Setup ────────────────────────────────────────────────────────────────

let allowSummaryQueries = false;
let mvData: Record<string, any> | null = null;
let mockTemuanRows: any[] = [];

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((tableName: string) => {
      const forbiddenSummaryTables = new Set([
        "mv_qa_period_summary",
        "qa_dashboard_period_summary",
      ]);
      if (forbiddenSummaryTables.has(tableName) && !allowSummaryQueries) {
        throw new Error(`${tableName} must not be queried by getDashboardData summary`);
      }

      if (tableName === "mv_qa_period_summary") {
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
        return mockBuildQuery(tableName, () => ({ data: mockTemuanRows, error: null }));
      }

      return mockBuildQuery(tableName, () => ({ data: [], error: null }));
    }),
  },
  createAdminClient: vi.fn(),
}));

import { supabaseAdmin } from "../lib/supabase";
import * as sidakService from "../services/sidak-service";

describe("Dashboard Materialized View Fallback", () => {
  beforeEach(() => {
    allowSummaryQueries = false;
    mvData = null;
    mockTemuanRows = [
      {
        period_id: "period-1",
        peserta_id: "agent-1",
        service_type: "call",
        tahun: 2025,
        no_tiket: "ticket-1",
        indicator_id: "ind-1",
        nilai: 2,
        ketidaksesuaian: "Greeting tidak lengkap",
        sebaiknya: null,
        is_phantom_padding: false,
        profiler_peserta: {
          id: "agent-1",
          nama: "Agent One",
          batch_name: "Folder A",
          tim: "Team A",
          jabatan: "Agent",
        },
      },
    ];
    vi.clearAllMocks();
  });

  it("should calculate summary solely using app scoring engine and not query MV or cache tables", async () => {
    const result = await sidakService.getDashboardData({
      period_ids: ["period-1"],
      service_type: "call",
    });

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary).toMatchObject({
      totalDefects: 1,
      totalAgents: 1,
    });

    // Verify the tables are never queried
    expect(supabaseAdmin.from).not.toHaveBeenCalledWith("mv_qa_period_summary");
    expect(supabaseAdmin.from).not.toHaveBeenCalledWith("qa_dashboard_period_summary");
  });

  it("should ignore poison/impossible MV data if queries are allowed", async () => {
    // Even if a future change accidentally leaves table mocks available, poisoned values must not win.
    allowSummaryQueries = true;
    mvData = {
      total_agents: 999,
      total_defects: 999,
      avg_defects_per_audit: 999,
      zero_error_rate: 0.99,
      avg_agent_score: 1,
      compliance_rate: 0.01,
      compliance_count: 999,
    };

    const result = await sidakService.getDashboardData({
      period_ids: ["period-1"],
      service_type: "call",
    });

    expect(result.summary?.totalAgents).not.toBe(999);
    expect(result.summary?.totalDefects).not.toBe(999);
    expect(result.summary?.avgAgentScore).not.toBe(1);
  });
});
