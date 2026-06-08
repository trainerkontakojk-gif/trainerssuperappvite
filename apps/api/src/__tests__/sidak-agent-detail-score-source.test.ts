import { describe, it, expect, vi, beforeEach } from "vitest";

function buildQuery(onAwait: () => any) {
  const q = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve(onAwait());
        }
        return () => q;
      },
    },
  );
  return q;
}

let pendingResolve: (table?: string) => any = () => ({
  data: [],
  error: null,
});

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table) => buildQuery(() => pendingResolve(table))),
  },
  createAdminClient: vi.fn(),
}));

// Mock rule version resolver to always return null (fallback to master)
vi.mock("../services/sidak/rule-version-resolver", () => ({
  resolveEffectiveRuleVersionForPeriod: vi.fn().mockResolvedValue(null),
}));

import { getAgentDetail } from "../services/sidak/agent-directory";
import type { ServiceType } from "@trainers/types";

const AGENT_ID = "a81a4bb0-e4a5-4b9f-a666-f61e629f548c";

const callIndicators = [
  {
    id: "call-greeting",
    service_type: "call" as ServiceType,
    name: "Salam Pembuka",
    category: "critical" as const,
    bobot: 10,
    has_na: false,
  },
  {
    id: "call-closing",
    service_type: "call" as ServiceType,
    name: "Salam Penutup",
    category: "non_critical" as const,
    bobot: 10,
    has_na: false,
  },
];

const periods = [
  { id: "p-jan", month: 1, year: 2026 },
  { id: "p-feb", month: 2, year: 2026 },
  { id: "p-mar", month: 3, year: 2026 },
  { id: "p-apr", month: 4, year: 2026 },
  { id: "p-may", month: 5, year: 2026 },
];

// Temuan: 8 rows for Jan (nilai=2), 8 rows for Feb (nilai=1-2), 7 rows for Mar (nilai=2),
// 6 rows for Apr (nilai=2-3), 4 rows for May (nilai=2-3)
const temuanRows = [
  // January — 8 tickets, nilai=2
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `t-jan-${i}`,
    peserta_id: AGENT_ID,
    period_id: "p-jan",
    indicator_id: i % 2 === 0 ? "call-greeting" : "call-closing",
    service_type: "call" as ServiceType,
    no_tiket: `JAN-00${i + 1}`,
    nilai: 2,
    tahun: 2026,
    is_phantom_padding: false,
    created_at: `2026-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
  })),
  // February — 8 tickets
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `t-feb-${i}`,
    peserta_id: AGENT_ID,
    period_id: "p-feb",
    indicator_id: i % 2 === 0 ? "call-greeting" : "call-closing",
    service_type: "call" as ServiceType,
    no_tiket: `FEB-00${i + 1}`,
    nilai: i < 4 ? 1 : 2,
    tahun: 2026,
    is_phantom_padding: false,
    created_at: `2026-02-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
  })),
  // March — 7 tickets
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `t-mar-${i}`,
    peserta_id: AGENT_ID,
    period_id: "p-mar",
    indicator_id: i % 2 === 0 ? "call-greeting" : "call-closing",
    service_type: "call" as ServiceType,
    no_tiket: `MAR-00${i + 1}`,
    nilai: 2,
    tahun: 2026,
    is_phantom_padding: false,
    created_at: `2026-03-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
  })),
  // April — 6 tickets, mixed nilai 2-3
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `t-apr-${i}`,
    peserta_id: AGENT_ID,
    period_id: "p-apr",
    indicator_id: i % 2 === 0 ? "call-greeting" : "call-closing",
    service_type: "call" as ServiceType,
    no_tiket: `APR-00${i + 1}`,
    nilai: i < 2 ? 2 : 3,
    tahun: 2026,
    is_phantom_padding: false,
    created_at: `2026-04-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
  })),
  // May — 4 tickets
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `t-may-${i}`,
    peserta_id: AGENT_ID,
    period_id: "p-may",
    indicator_id: i % 2 === 0 ? "call-greeting" : "call-closing",
    service_type: "call" as ServiceType,
    no_tiket: `MAY-00${i + 1}`,
    nilai: i < 1 ? 2 : 3,
    tahun: 2026,
    is_phantom_padding: false,
    created_at: `2026-05-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
  })),
];

// Poison cache rows — literal 0 scores from migration refresh
const poisonCache = [
  {
    agent_id: AGENT_ID,
    period_id: "p-jan",
    service_type: "call",
    final_score: 0,
    non_critical_score: 0,
    critical_score: 0,
    session_count: 1,
    findings_count: 8,
  },
  {
    agent_id: AGENT_ID,
    period_id: "p-feb",
    service_type: "call",
    final_score: 0,
    non_critical_score: 0,
    critical_score: 0,
    session_count: 1,
    findings_count: 8,
  },
  {
    agent_id: AGENT_ID,
    period_id: "p-mar",
    service_type: "call",
    final_score: 0,
    non_critical_score: 0,
    critical_score: 0,
    session_count: 1,
    findings_count: 7,
  },
];

let cacheQueried = false;

describe("getAgentDetail — score source regression", () => {
  beforeEach(() => {
    cacheQueried = false;
  });

  it("returns calculated scores from raw temuan, not from cache", async () => {
    pendingResolve = (table) => {
      if (table === "qa_dashboard_agent_period_summary") {
        cacheQueried = true;
        return { data: poisonCache, error: null };
      }
      if (table === "profiler_peserta") {
        return {
          data: {
            id: AGENT_ID,
            nama: "Test Agent",
            tim: "Telepon",
            batch_name: "Batch 1",
          },
          error: null,
        };
      }
      if (table === "qa_indicators") {
        return { data: callIndicators, error: null };
      }
      if (table === "qa_periods") {
        return { data: periods, error: null };
      }
      if (table === "qa_service_weights") {
        return { data: [], error: null };
      }
      if (table === "qa_temuan") {
        return { data: temuanRows, error: null };
      }
      // Mock rule version resolver queries (should not fire due to mock but handle gracefully)
      if (table === "qa_service_rule_versions") {
        return { data: [], error: null };
      }
      if (table === "qa_service_rule_indicators") {
        return { data: [], error: null };
      }
      return { data: [], error: null };
    };

    const result = await getAgentDetail(AGENT_ID, 2026, "call", 1, 6);

    // Cache must NOT be queried
    expect(cacheQueried).toBe(false);

    // All months with data must have non-zero scores
    const january = result.periodSummaries.find((s) => s.month === 1);
    const february = result.periodSummaries.find((s) => s.month === 2);
    const march = result.periodSummaries.find((s) => s.month === 3);

    expect(january).toBeDefined();
    expect(january?.finalScore).toBeGreaterThan(0);
    expect(january?.finalScore).not.toBe(0);

    expect(february).toBeDefined();
    expect(february?.finalScore).toBeGreaterThan(0);
    expect(february?.finalScore).not.toBe(0);

    expect(march).toBeDefined();
    expect(march?.finalScore).toBeGreaterThan(0);
    expect(march?.finalScore).not.toBe(0);

    // Response contract remains stable
    expect(result).toMatchObject({
      peserta: { id: AGENT_ID },
      initialYear: 2026,
      initialService: "call",
    });
    expect(result.scoreHistory).toHaveLength(result.periodSummaries.length);
    expect(result.weights.call).toBeDefined();
  });

  it("returns stable April/May values", async () => {
    pendingResolve = (table) => {
      if (table === "qa_dashboard_agent_period_summary") {
        cacheQueried = true;
        return { data: poisonCache, error: null };
      }
      if (table === "profiler_peserta") {
        return {
          data: {
            id: AGENT_ID,
            nama: "Test Agent",
            tim: "Telepon",
            batch_name: "Batch 1",
          },
          error: null,
        };
      }
      if (table === "qa_indicators") {
        return { data: callIndicators, error: null };
      }
      if (table === "qa_periods") {
        return { data: periods, error: null };
      }
      if (table === "qa_service_weights") {
        return { data: [], error: null };
      }
      if (table === "qa_temuan") {
        return { data: temuanRows, error: null };
      }
      if (table === "qa_service_rule_versions") {
        return { data: [], error: null };
      }
      if (table === "qa_service_rule_indicators") {
        return { data: [], error: null };
      }
      return { data: [], error: null };
    };

    const result = await getAgentDetail(AGENT_ID, 2026, "call", 1, 6);

    const april = result.periodSummaries.find((s) => s.month === 4);
    const may = result.periodSummaries.find((s) => s.month === 5);

    expect(april).toBeDefined();
    expect(may).toBeDefined();

    // April/May should still produce rational scores
    expect(april?.finalScore).toBeGreaterThan(0);
    expect(may?.finalScore).toBeGreaterThan(0);
  });

  it("preserves phantom padding semantics", async () => {
    const rowsWithPhantom = [
      ...temuanRows,
      // Add a phantom padding row for January
      {
        id: "t-jan-phantom",
        peserta_id: AGENT_ID,
        period_id: "p-jan",
        indicator_id: "call-greeting",
        service_type: "call" as ServiceType,
        no_tiket: "__PHANTOM_test",
        nilai: 3,
        tahun: 2026,
        is_phantom_padding: true,
        created_at: "2026-01-15T10:00:00Z",
      },
    ];

    pendingResolve = (table) => {
      if (table === "qa_dashboard_agent_period_summary") {
        cacheQueried = true;
        return { data: poisonCache, error: null };
      }
      if (table === "profiler_peserta") {
        return {
          data: {
            id: AGENT_ID,
            nama: "Test Agent",
            tim: "Telepon",
            batch_name: "Batch 1",
          },
          error: null,
        };
      }
      if (table === "qa_indicators") {
        return { data: callIndicators, error: null };
      }
      if (table === "qa_periods") {
        return { data: periods, error: null };
      }
      if (table === "qa_service_weights") {
        return { data: [], error: null };
      }
      if (table === "qa_temuan") {
        return { data: rowsWithPhantom, error: null };
      }
      if (table === "qa_service_rule_versions") {
        return { data: [], error: null };
      }
      if (table === "qa_service_rule_indicators") {
        return { data: [], error: null };
      }
      return { data: [], error: null };
    };

    const result = await getAgentDetail(AGENT_ID, 2026, "call", 1, 6);

    // Phantom padding must not increase findings count
    const january = result.periodSummaries.find((s) => s.month === 1);
    expect(january).toBeDefined();
    // Still 8 real findings even with phantom row present
    expect(january?.findingsCount).toBe(8);
    // Phantom rows are filtered from temuan
    const phantomInTemuan = result.temuan.filter(
      (temuan) => temuan.is_phantom_padding === true,
    );
    expect(phantomInTemuan).toHaveLength(0);
  });
});
