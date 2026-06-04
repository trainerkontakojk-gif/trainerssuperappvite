import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockBuildQuery,
  mockFolders,
  mockIndicators,
  mockWeights,
} from "./helpers/sidak-dashboard-fixtures";

const mockPeriods = [
  { id: "period-1", month: 4, year: 2026, label: "04/2026" },
  { id: "period-2", month: 5, year: 2026, label: "05/2026" },
];

let mockTemuanRows: any[] = [];

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((tableName: string) => {
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
      if (tableName === "mv_qa_period_summary") {
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

import * as sidakService from "../services/sidak-service";

describe("Dashboard Range Summary Calculation", () => {
  beforeEach(() => {
    mockTemuanRows = [];
  });

  it("calculates complianceRate and complianceCount correctly across a range of periods", async () => {
    // Period 1 (April):
    // Agent 1: 100% score (1 audit presence) -> Compliant
    // Agent 2: 100% score (1 audit presence) -> Compliant
    // Monthly Compliance: 2 / 2 = 100%
    
    // Period 2 (May):
    // Agent 1: 100% score (1 audit presence) -> Compliant
    // Agent 2: 90% score (1 critical defect) -> Non-compliant
    // Agent 3: 100% score (1 audit presence) -> Compliant
    // Agent 4: 100% score (1 audit presence) -> Compliant
    // Monthly Compliance: 3 / 4 = 75%

    // Expected overall compliance audits = 2 + 3 = 5
    // Expected overall audited sessions = 2 + 4 = 6
    // Expected range compliance rate = 5 / 6 = 83.33%
    // Expected range compliance count = (2 + 3) / 2 = 2.5 average compliant agents per month

    mockTemuanRows = [
      // April (period-1)
      { period_id: "period-1", peserta_id: "a1", service_type: "call", nilai: 3, is_phantom_padding: true, tahun: 2026, profiler_peserta: { id: "a1", nama: "Agent 1", batch_name: "Folder A", tim: "A", jabatan: "Agent" } },
      { period_id: "period-1", peserta_id: "a2", service_type: "call", nilai: 3, is_phantom_padding: true, tahun: 2026, profiler_peserta: { id: "a2", nama: "Agent 2", batch_name: "Folder A", tim: "A", jabatan: "Agent" } },
      // May (period-2)
      { period_id: "period-2", peserta_id: "a1", service_type: "call", nilai: 3, is_phantom_padding: true, tahun: 2026, profiler_peserta: { id: "a1", nama: "Agent 1", batch_name: "Folder A", tim: "A", jabatan: "Agent" } },
      { period_id: "period-2", peserta_id: "a2", service_type: "call", nilai: 0, indicator_id: "ind-2", tahun: 2026, profiler_peserta: { id: "a2", nama: "Agent 2", batch_name: "Folder A", tim: "A", jabatan: "Agent" } },
      { period_id: "period-2", peserta_id: "a3", service_type: "call", nilai: 3, is_phantom_padding: true, tahun: 2026, profiler_peserta: { id: "a3", nama: "Agent 3", batch_name: "Folder A", tim: "A", jabatan: "Agent" } },
      { period_id: "period-2", peserta_id: "a4", service_type: "call", nilai: 3, is_phantom_padding: true, tahun: 2026, profiler_peserta: { id: "a4", nama: "Agent 4", batch_name: "Folder A", tim: "A", jabatan: "Agent" } },
    ];

    const result = await sidakService.getDashboardData({
      year: 2026,
      startMonth: 4,
      endMonth: 5,
    });

    expect(result.summary).toBeDefined();
    const summary = result.summary!;

    expect(summary.totalAgents).toBe(4); // 4 unique agents in total (a1, a2, a3, a4)
    expect(summary.totalDefects).toBe(1); // 1 defect in total (ind-2 value 0)
    
    // Expect compliance rate to be 5/6 * 100 = 83.33% (rounded to 2 decimal places)
    expect(summary.complianceRate).toBe(83.33);

    // Expect compliance count to be (2 + 3) / 2 = 2.5 (average compliant agents per month)
    expect(summary.complianceCount).toBe(2.5);
  });
});
