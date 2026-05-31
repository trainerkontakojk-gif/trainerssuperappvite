import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockBuildQuery,
  mockPeriods,
  mockFolders,
  mockIndicators,
  mockWeights,
} from "./helpers/sidak-dashboard-fixtures";

// ─── Mock Setup ────────────────────────────────────────────────────────────────

let mvState: "returns-data" | "returns-null" | "throws-error" = "returns-null";
let mvData: Record<string, any> | null = null;
let mockTemuan: any[] = [];

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
        return mockBuildQuery(tableName, () => ({ data: mockTemuan, error: null }));
      }

      return mockBuildQuery(tableName, () => ({ data: [], error: null }));
    }),
  },
  createAdminClient: vi.fn(),
}));

import * as sidakService from "../services/sidak-service";

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
