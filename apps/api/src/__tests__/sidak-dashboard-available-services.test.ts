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

describe("getDashboardData availableServices regression", () => {
  beforeEach(() => {
    mvState = "returns-null";
    mvData = null;
    mockTemuan = [];
  });

  it("returns all services with data when service_type is filtered (ranking filter fix)", async () => {
    mockTemuan = [
      {
        id: "sf-1",
        peserta_id: "sf-a-1",
        indicator_id: "ind-1",
        nilai: 3,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "call",
        profiler_peserta: {
          id: "sf-a-1",
          nama: "Agent SF1",
          batch_name: "Batch SF",
          tim: "Tim SF",
          jabatan: "Agent",
        },
      },
      {
        id: "sf-2",
        peserta_id: "sf-a-2",
        indicator_id: "ind-1",
        nilai: 3,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "chat",
        profiler_peserta: {
          id: "sf-a-2",
          nama: "Agent SF2",
          batch_name: "Batch SF",
          tim: "Tim SF",
          jabatan: "Agent",
        },
      },
      {
        id: "sf-3",
        peserta_id: "sf-a-3",
        indicator_id: "ind-1",
        nilai: 3,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "email",
        profiler_peserta: {
          id: "sf-a-3",
          nama: "Agent SF3",
          batch_name: "Batch SF",
          tim: "Tim SF",
          jabatan: "Agent",
        },
      },
    ];

    const result = await sidakService.getDashboardData({
      service_type: "call",
      year: 2025,
    });

    expect(result.availableServices).toContain("call");
    expect(result.availableServices).toContain("chat");
    expect(result.availableServices).toContain("email");
  });

  it("intersects availableServices with leader allowedServices", async () => {
    mockTemuan = [
      {
        id: "sf-4",
        peserta_id: "sf-a-4",
        indicator_id: "ind-1",
        nilai: 3,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "call",
        profiler_peserta: {
          id: "sf-a-4",
          nama: "Agent SF4",
          batch_name: "Batch SF2",
          tim: "Tim SF2",
          jabatan: "Agent",
        },
      },
      {
        id: "sf-5",
        peserta_id: "sf-a-5",
        indicator_id: "ind-1",
        nilai: 3,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "chat",
        profiler_peserta: {
          id: "sf-a-5",
          nama: "Agent SF5",
          batch_name: "Batch SF2",
          tim: "Tim SF2",
          jabatan: "Agent",
        },
      },
      {
        id: "sf-6",
        peserta_id: "sf-a-6",
        indicator_id: "ind-1",
        nilai: 3,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "email",
        profiler_peserta: {
          id: "sf-a-6",
          nama: "Agent SF6",
          batch_name: "Batch SF2",
          tim: "Tim SF2",
          jabatan: "Agent",
        },
      },
    ];

    const result = await sidakService.getDashboardData({
      service_type: "call",
      year: 2025,
      allowedServiceTypes: ["call", "email"],
    });

    expect(result.availableServices).toEqual(["call", "email"]);
    expect(result.availableServices).not.toContain("chat");
  });

  it("returns every active master service when no data matches the selected period", async () => {
    mockTemuan = [];

    const result = await sidakService.getDashboardData({
      service_type: "call",
      year: 2025,
      folder_ids: ["folder-1"],
    });

    expect(result.availableServices).toEqual([
      "call",
      "chat",
      "email",
      "cso",
      "pencatatan",
      "bko",
      "slik",
    ]);
  });

  it("availableServices reflects leader scope even without serviceTypeLocked", async () => {
    mockTemuan = [
      {
        id: "sf-8",
        peserta_id: "sf-a-8",
        indicator_id: "ind-1",
        nilai: 3,
        is_phantom_padding: false,
        tahun: 2025,
        period_id: "period-1",
        service_type: "call",
        profiler_peserta: {
          id: "sf-a-8",
          nama: "Agent SF8",
          batch_name: "Batch SF4",
          tim: "Tim SF4",
          jabatan: "Agent",
        },
      },
    ];

    const result = await sidakService.getDashboardData({
      service_type: "call",
      year: 2025,
      allowedServiceTypes: ["call", "chat"],
    });

    expect(result.availableServices).toEqual(["call", "chat"]);
  });
});
