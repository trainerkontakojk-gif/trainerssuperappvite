import { describe, it, expect, vi, beforeEach } from "vitest";

const queryCalls: { table?: string; method: string; args: any[] }[] = [];

function buildQuery(table: string | undefined, onAwait: () => any) {
  const q = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve(onAwait());
        }
        return (...args: any[]) => {
          queryCalls.push({ table, method: String(prop), args });
          return q;
        };
      },
    },
  );
  return q;
}

let pendingResolve: (table?: string) => any = () => ({ data: [], error: null });

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table) => buildQuery(table, () => pendingResolve(table))),
  },
  createAdminClient: vi.fn(),
}));

// Mock rule version resolver to always return null (fallback to master)
vi.mock("../services/sidak/rule-version-resolver", () => ({
  resolveEffectiveRuleVersionForPeriod: vi.fn().mockResolvedValue(null),
}));

import { getAgentDetail } from "../services/sidak/agent-directory";
import type { ServiceType } from "@trainers/types";

const AGENT_A = "a0000000-0000-0000-0000-00000000000a";
const AGENT_B = "b0000000-0000-0000-0000-00000000000b";
const AGENT_C = "c0000000-0000-0000-0000-00000000000c";

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
];

function temuanRow(
  id: string,
  pesertaId: string,
  periodId: string,
  indicatorId: string,
  nilai: number,
  batchName: string,
  note?: string,
) {
  return {
    id,
    peserta_id: pesertaId,
    period_id: periodId,
    indicator_id: indicatorId,
    service_type: "call" as ServiceType,
    no_tiket: `T-${id}`,
    nilai,
    tahun: 2026,
    is_phantom_padding: false,
    ketidaksesuaian: note ?? null,
    sebaiknya: note ?? null,
    created_at: `2026-01-10T10:00:00Z`,
    profiler_peserta: { id: pesertaId, batch_name: batchName, tim: batchName },
  };
}

// Countable findings per agent:
// A (batch B1): greeting=3, closing=1  => total 4
// B (batch B1): greeting=2, closing=1  => total 3
// C (batch B2): greeting=1, closing=1  => total 2
// Plus one non-countable row (nilai=3, no note) for A.
const allTemuan = [
  // Agent A
  temuanRow("a1", AGENT_A, "p-jan", "call-greeting", 2, "B1"),
  temuanRow("a2", AGENT_A, "p-jan", "call-greeting", 2, "B1"),
  temuanRow("a3", AGENT_A, "p-jan", "call-closing", 2, "B1"),
  temuanRow("a4", AGENT_A, "p-feb", "call-greeting", 1, "B1"),
  temuanRow("a5", AGENT_A, "p-feb", "call-closing", 3, "B1"), // non-countable
  // Agent B
  temuanRow("b1", AGENT_B, "p-jan", "call-greeting", 2, "B1"),
  temuanRow("b2", AGENT_B, "p-jan", "call-closing", 2, "B1"),
  temuanRow("b3", AGENT_B, "p-feb", "call-greeting", 2, "B1"),
  // Agent C
  temuanRow("c1", AGENT_C, "p-jan", "call-greeting", 2, "B2"),
  temuanRow("c2", AGENT_C, "p-feb", "call-closing", 2, "B2"),
];

function mockResolve() {
  pendingResolve = (table) => {
    if (table === "profiler_peserta") {
      return {
        data: {
          id: AGENT_A,
          nama: "Agent A",
          tim: "B1",
          batch_name: "B1",
        },
        error: null,
      };
    }
    if (table === "qa_indicators") return { data: callIndicators, error: null };
    if (table === "qa_periods") return { data: periods, error: null };
    if (table === "qa_service_weights") return { data: [], error: null };
    if (table === "qa_temuan") return { data: allTemuan, error: null };
    if (table === "qa_service_rule_versions") return { data: [], error: null };
    if (table === "qa_service_rule_indicators")
      return { data: [], error: null };
    return { data: [], error: null };
  };
}

describe("getAgentDetail — comparison benchmark table", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    mockResolve();
  });

  it("computes cumulative agent counts, team and service averages", async () => {
    const result = await getAgentDetail(AGENT_A, 2026, "call", 1, 2);

    expect(result.comparisonTable).toBeDefined();
    const { scope, rows } = result.comparisonTable!;

    expect(scope.teamLabel).toBe("B1");
    expect(scope.serviceLabel).toBe("Call");
    expect(scope.startMonth).toBe(1);
    expect(scope.endMonth).toBe(2);

    const total = rows.find((r) => r.key === "total");
    expect(total).toBeDefined();
    // Agent A cumulative total
    expect(total!.agentCount).toBe(4);
    // Team (B1 = A + B): (4 + 3) / 2 = 3.5
    expect(total!.teamAverage).toBe(3.5);
    expect(total!.teamAgentCount).toBe(2);
    // Service (call = A + B + C): (4 + 3 + 2) / 3 = 3
    expect(total!.serviceAverage).toBe(3);
    expect(total!.serviceAgentCount).toBe(3);
  });

  it("emits one row per parameter sorted by agent count", async () => {
    const result = await getAgentDetail(AGENT_A, 2026, "call", 1, 2);
    const { rows } = result.comparisonTable!;

    // Total pinned first
    expect(rows[0].key).toBe("total");

    const greeting = rows.find((r) => r.key === "call-greeting");
    const closing = rows.find((r) => r.key === "call-closing");
    expect(greeting).toBeDefined();
    expect(closing).toBeDefined();

    // Agent A: greeting=3, closing=1
    expect(greeting!.agentCount).toBe(3);
    expect(closing!.agentCount).toBe(1);

    // Team averages (B1 = A + B)
    expect(greeting!.teamAverage).toBe(2.5); // (3+2)/2
    expect(closing!.teamAverage).toBe(1); // (1+1)/2

    // Service averages (call = A + B + C)
    expect(greeting!.serviceAverage).toBe(2); // (3+2+1)/3
    expect(closing!.serviceAverage).toBe(1); // (1+1+1)/3

    // greeting has higher agent count, so it is sorted before closing
    const greetingIdx = rows.findIndex((r) => r.key === "call-greeting");
    const closingIdx = rows.findIndex((r) => r.key === "call-closing");
    expect(greetingIdx).toBeLessThan(closingIdx);
  });

  it("excludes non-countable findings (nilai=3, no note)", async () => {
    const result = await getAgentDetail(AGENT_A, 2026, "call", 1, 2);
    const total = result.comparisonTable!.rows.find((r) => r.key === "total");
    // A would have 5 raw rows but only 4 are countable (a5 is nilai=3, no note)
    expect(total!.agentCount).toBe(4);
  });

  it("restricts service cohort to accessible agents for leaders", async () => {
    // Leader scope only includes A and B (not C)
    const result = await getAgentDetail(AGENT_A, 2026, "call", 1, 2, undefined, [
      AGENT_A,
      AGENT_B,
    ]);
    const total = result.comparisonTable!.rows.find((r) => r.key === "total");

    // Service cohort now excludes C
    expect(total!.serviceAgentCount).toBe(2);
    expect(total!.serviceAverage).toBe(3.5); // (4 + 3) / 2

    const greeting = result.comparisonTable!.rows.find(
      (r) => r.key === "call-greeting",
    );
    expect(greeting!.serviceAverage).toBe(2.5); // (3 + 2) / 2
  });

  it("filters the comparison cohort by the effective service when service_type is omitted", async () => {
    await getAgentDetail(AGENT_A, 2026, undefined, 1, 2, ["call"]);

    const comparisonSelectIndex = queryCalls.findIndex(
      (call) =>
        call.table === "qa_temuan" &&
        call.method === "select" &&
        String(call.args[0]).includes("profiler_peserta!inner"),
    );
    expect(comparisonSelectIndex).toBeGreaterThanOrEqual(0);

    const comparisonCalls = queryCalls.slice(comparisonSelectIndex);
    expect(
      comparisonCalls.some(
        (call) =>
          call.table === "qa_temuan" &&
          call.method === "eq" &&
          call.args[0] === "service_type" &&
          call.args[1] === "call",
      ),
    ).toBe(true);
  });

  it("returns empty rows when no temuan exist in the range", async () => {
    pendingResolve = (table) => {
      if (table === "profiler_peserta") {
        return {
          data: { id: AGENT_A, nama: "Agent A", tim: "B1", batch_name: "B1" },
          error: null,
        };
      }
      if (table === "qa_indicators") return { data: callIndicators, error: null };
      if (table === "qa_periods") return { data: periods, error: null };
      if (table === "qa_service_weights") return { data: [], error: null };
      if (table === "qa_temuan") return { data: [], error: null };
      if (table === "qa_service_rule_versions") return { data: [], error: null };
      if (table === "qa_service_rule_indicators")
        return { data: [], error: null };
      return { data: [], error: null };
    };

    const result = await getAgentDetail(AGENT_A, 2026, "call", 1, 2);
    expect(result.comparisonTable!.rows).toEqual([]);
  });
});
