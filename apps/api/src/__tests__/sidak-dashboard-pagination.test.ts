import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  mockIndicators,
  mockWeights,
} from "./helpers/sidak-dashboard-fixtures";

const mockPeriods = [
  { id: "period-1", month: 5, year: 2026, label: "05/2026" },
];
const mockFolders = [
  { id: "folder-1", name: "Folder A" },
  { id: "folder-2", name: "Folder B" },
];

let mockTemuanRows: any[] = [];

function parseNotInValues(raw: string): string[] {
  return raw
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function applyQueryFilters(
  rows: any[],
  state: {
    eq: Array<{ column: string; value: unknown }>;
    in: Array<{ column: string; values: unknown[] }>;
    not: Array<{ column: string; operator: string; value: unknown }>;
    rangeFrom: number;
    rangeTo: number;
  },
) {
  let filtered = rows;

  for (const { column, value } of state.eq) {
    filtered = filtered.filter((row) => row[column] === value);
  }

  for (const { column, values } of state.in) {
    if (column === "profiler_peserta.batch_name") {
      filtered = filtered.filter((row) =>
        values.includes(row.profiler_peserta?.batch_name),
      );
      continue;
    }
    filtered = filtered.filter((row) => values.includes(row[column]));
  }

  for (const { column, operator, value } of state.not) {
    if (operator !== "in" || typeof value !== "string") continue;
    const excluded = new Set(parseNotInValues(value));
    filtered = filtered.filter((row) => !excluded.has(String(row[column])));
  }

  return filtered.slice(state.rangeFrom, state.rangeTo + 1);
}

function buildQueryResult(
  tableName: string,
  state: {
    eq: Array<{ column: string; value: unknown }>;
    in: Array<{ column: string; values: unknown[] }>;
    not: Array<{ column: string; operator: string; value: unknown }>;
    rangeFrom: number;
    rangeTo: number;
  },
) {
  if (tableName === "qa_periods") {
    return { data: mockPeriods, error: null };
  }
  if (tableName === "profiler_folders") {
    const rows = applyQueryFilters(mockFolders, state);
    return { data: rows, error: null };
  }
  if (tableName === "qa_indicators") {
    return { data: mockIndicators, error: null };
  }
  if (tableName === "qa_service_weights") {
    return { data: mockWeights, error: null };
  }
  if (tableName === "profiles") {
    return { data: [], error: null };
  }
  if (tableName === "qa_dashboard_period_summary") {
    return { data: null, error: null };
  }
  if (tableName === "mv_qa_period_summary") {
    return { data: null, error: null };
  }
  if (tableName === "qa_temuan") {
    const rows = applyQueryFilters(mockTemuanRows, state);
    return { data: rows, error: null };
  }
  return { data: [], error: null };
}

function mockBuildQuery(tableName: string) {
  const state = {
    eq: [] as Array<{ column: string; value: unknown }>,
    in: [] as Array<{ column: string; values: unknown[] }>,
    not: [] as Array<{ column: string; operator: string; value: unknown }>,
    rangeFrom: 0,
    rangeTo: Number.MAX_SAFE_INTEGER,
  };

  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve(buildQueryResult(tableName, state));
        }
        if (prop === "eq") {
          return (column: string, value: unknown) => {
            state.eq.push({ column, value });
            return q;
          };
        }
        if (prop === "in") {
          return (column: string, values: unknown[]) => {
            state.in.push({ column, values });
            return q;
          };
        }
        if (prop === "not") {
          return (column: string, operator: string, value: unknown) => {
            state.not.push({ column, operator, value });
            return q;
          };
        }
        if (prop === "range") {
          return (from: number, to: number) => {
            state.rangeFrom = from;
            state.rangeTo = to;
            return q;
          };
        }
        return (..._args: any[]) => q;
      },
    },
  );

  return q;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((tableName: string) => {
      return mockBuildQuery(tableName);
    }),
  },
  createAdminClient: vi.fn(),
}));

import * as sidakService from "../services/sidak-service";

function generateTemuanRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `temuan-${i + 1}`,
    period_id: "period-1",
    peserta_id: `agent-${(i % 50) + 1}`,
    service_type: "call",
    indicator_id: "ind-1",
    nilai: 0, // critical defect → isCountableFinding returns true
    is_phantom_padding: false,
    tahun: 2026,
    profiler_peserta: {
      id: `agent-${(i % 50) + 1}`,
      nama: `Agent ${(i % 50) + 1}`,
      batch_name: "Folder A",
      tim: "Tim A",
      jabatan: "Agent",
    },
  }));
}

describe("SIDAK Dashboard pagination (>1000 rows)", () => {
  beforeEach(() => {
    mockTemuanRows = [];
  });

  it("processes 100 rows correctly (baseline sanity)", async () => {
    mockTemuanRows = generateTemuanRows(100);

    const result = await sidakService.getDashboardData({
      year: 2026,
      period_ids: ["period-1"],
    });

    expect(result.summary!.totalAgents).toBe(50);
    expect(result.summary!.totalDefects).toBe(100);
    expect(result.topAgents.length).toBe(20); // default limit
  });

  it("processes 1060 rows without truncation (regression: May 106->80 bug)", async () => {
    mockTemuanRows = generateTemuanRows(1060);

    const result = await sidakService.getDashboardData({
      year: 2026,
      period_ids: ["period-1"],
    });

    // 1060 rows across 50 unique agents — all must be counted
    expect(result.summary!.totalDefects).toBe(1060);
    expect(result.summary!.totalAgents).toBe(50);
  });

  it("returns all available services even when service_type is filtered (distinct query has no service_type filter)", async () => {
    mockTemuanRows = [
      ...generateTemuanRows(30),
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `chat-${i + 1}`,
        period_id: "period-1",
        peserta_id: `chat-agent-${i + 1}`,
        service_type: "chat",
        indicator_id: "ind-chat-1",
        nilai: 0,
        is_phantom_padding: false,
        tahun: 2026,
        profiler_peserta: {
          id: `chat-agent-${i + 1}`,
          nama: `Chat Agent ${i + 1}`,
          batch_name: "Folder A",
          tim: "Tim A",
          jabatan: "Agent",
        },
      })),
    ];

    const result = await sidakService.getDashboardData({
      service_type: "call",
      year: 2026,
      period_ids: ["period-1"],
    });

    // fetchDistinctServiceTypes doesn't filter by service_type,
    // so both call and chat should appear in availableServices
    expect(result.availableServices).toContain("call");
    expect(result.availableServices).toContain("chat");
  });

  it("folder filter limits dashboard data but not available services (regression: 34fff97)", async () => {
    mockTemuanRows = [
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `call-folder-a-${i + 1}`,
        period_id: "period-1",
        peserta_id: `call-folder-a-agent-${i + 1}`,
        service_type: "call",
        indicator_id: "ind-1",
        nilai: 0,
        is_phantom_padding: false,
        tahun: 2026,
        profiler_peserta: {
          id: `call-folder-a-agent-${i + 1}`,
          nama: `Call Agent ${i + 1}`,
          batch_name: "Folder A",
          tim: "Tim A",
          jabatan: "Agent",
        },
      })),
      ...Array.from({ length: 15 }, (_, i) => ({
        id: `chat-folder-b-${i + 1}`,
        period_id: "period-1",
        peserta_id: `chat-folder-b-agent-${i + 1}`,
        service_type: "chat",
        indicator_id: "ind-chat-1",
        nilai: 0,
        is_phantom_padding: false,
        tahun: 2026,
        profiler_peserta: {
          id: `chat-folder-b-agent-${i + 1}`,
          nama: `Chat Agent ${i + 1}`,
          batch_name: "Folder B",
          tim: "Tim B",
          jabatan: "Agent",
        },
      })),
    ];

    const result = await sidakService.getDashboardData({
      year: 2026,
      period_ids: ["period-1"],
      folder_ids: ["folder-1"],
    });

    // Data dibatasi folder: hanya 15 baris Folder A (call) yang dihitung.
    expect(result.summary!.totalDefects).toBe(15);
    // Dropdown service tetap menampilkan semua tipe yang punya data,
    // tidak dibatasi folder (keputusan desain commit 34fff97).
    expect(result.availableServices).toContain("call");
    expect(result.availableServices).toContain("chat");
  });

  it("handles empty result set gracefully", async () => {
    mockTemuanRows = [];

    const result = await sidakService.getDashboardData({
      year: 2026,
      period_ids: ["period-1"],
    });

    expect(result.summary!.totalAgents).toBe(0);
    expect(result.summary!.totalDefects).toBe(0);
    expect(result.topAgents).toEqual([]);
  });
});
