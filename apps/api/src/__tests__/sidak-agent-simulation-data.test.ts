import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  detailRow: null as unknown,
  selects: [] as Array<{ table: string; columns: string }>,
  filters: [] as Array<{
    table: string;
    operator: string;
    args: unknown[];
  }>,
}));

function builderFor(table: string): any {
  const builder: any = {
    select(columns: string) {
      state.selects.push({ table, columns });
      return builder;
    },
    eq(column: string, value: unknown) {
      state.filters.push({ table, operator: "eq", args: [column, value] });
      return builder;
    },
    lt(column: string, value: unknown) {
      state.filters.push({ table, operator: "lt", args: [column, value] });
      return builder;
    },
    lte(column: string, value: unknown) {
      state.filters.push({ table, operator: "lte", args: [column, value] });
      return builder;
    },
    or(value: string) {
      state.filters.push({ table, operator: "or", args: [value] });
      return builder;
    },
    order() {
      return builder;
    },
    limit: async () => ({ data: state.rows[table] ?? [], error: null }),
    in: async () => ({
      data: table === "profiles" ? [{ id: "actor-1", email: "trainer@example.com", role: "trainer" }] : [],
      error: null,
    }),
    maybeSingle: async () => ({
      data: table === "profiler_peserta" ? { id: agentId } : state.detailRow,
      error: null,
    }),
  };
  return builder;
}

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: (table: string) => builderFor(table),
  }),
}));

const getReviewDetail = vi.hoisted(() => vi.fn());

vi.mock("../services/monitoring-review-service", () => ({
  getMonitoringReviewDetail: getReviewDetail,
}));

import {
  decodeSidakSimulationCursor,
  encodeSidakSimulationCursor,
  getSidakAgentSimulationHistory,
} from "../services/sidak/agent-simulations";

const agentId = "123e4567-e89b-12d3-a456-426614174000";

describe("SIDAK simulation history data projection", () => {
  beforeEach(() => {
    state.selects = [];
    state.filters = [];
    state.detailRow = null;
    state.rows = {
      ketik_history: [
        {
          id: "00000000-0000-0000-0000-000000000001",
          user_id: "actor-1",
          date: "2026-09-10T10:00:00.000Z",
          scenario_title: "Chat Tagihan",
          simulation_duration: 0,
          final_score: 0,
          review_status: "pending",
          simulation_subject_type: "participant",
          simulation_subject_peserta_id: agentId,
          simulation_subject_name: "Nama Sebelum Rename",
          simulation_subject_batch_name: "Batch 1",
          simulation_subject_team: "Tim A",
        },
        {
          id: "00000000-0000-0000-0000-000000000002",
          user_id: "actor-1",
          date: "2026-09-10T09:00:00.000Z",
          final_score: 99,
          simulation_subject_type: "self",
          simulation_subject_peserta_id: null,
        },
        {
          id: "00000000-0000-0000-0000-000000000003",
          user_id: "actor-1",
          date: "2026-09-10T08:00:00.000Z",
          final_score: 98,
          simulation_subject_type: null,
          simulation_subject_peserta_id: null,
        },
      ],
      pdkt_history: [
        {
          id: "00000000-0000-0000-0000-000000000004",
          user_id: "actor-1",
          timestamp: "2026-09-10T10:00:00.000Z",
          scenarios: [{ title: "Email Tagihan" }],
          config: { scenarios: [{ title: "Email Tagihan" }] },
          evaluation: { score: null },
          evaluation_status: "processing",
          time_taken: null,
          simulation_subject_type: "participant",
          simulation_subject_peserta_id: agentId,
          simulation_subject_name: "Nama Sebelum Rename",
          simulation_subject_batch_name: "Batch 1",
          simulation_subject_team: "Tim A",
        },
      ],
      telefun_history: [
        {
          id: "00000000-0000-0000-0000-000000000005",
          user_id: "actor-1",
          created_at: "2026-09-10T10:00:00.000Z",
          scenario_title: "Panggilan Tagihan",
          duration_seconds: 0,
          score: null,
          scoring_status: "failed",
          status: "active",
          simulation_subject_type: "participant",
          simulation_subject_peserta_id: agentId,
          simulation_subject_name: "Nama Sebelum Rename",
          simulation_subject_batch_name: "Batch 1",
          simulation_subject_team: "Tim A",
        },
      ],
    };
  });

  it("keeps exact participant attribution, frozen name, executor, zero, null, and status", async () => {
    const page = await getSidakAgentSimulationHistory({
      agentId,
      module: "all",
    });

    expect(page.items).toHaveLength(3);
    expect(page.items.map((item) => item.module)).toEqual([
      "ketik",
      "pdkt",
      "telefun",
    ]);
    expect(page.items[0]).toMatchObject({
      score: 0,
      scoreScale: 100,
      durationSeconds: 0,
      reviewStatus: "pending",
      actor: {
        userId: "actor-1",
        email: "trainer@example.com",
        role: "trainer",
      },
      simulationSubject: {
        type: "participant",
        participantId: agentId,
        displayName: "Nama Sebelum Rename",
      },
    });
    expect(page.items[1]).toMatchObject({
      scenarioTitle: "Email Tagihan",
      score: null,
      durationSeconds: null,
      reviewStatus: "processing",
      scoreScale: 100,
    });
    expect(page.items[2]).toMatchObject({
      score: null,
      scoreScale: 10,
      durationSeconds: 0,
      reviewStatus: "failed",
    });
    expect(state.selects.find((query) => query.table === "ketik_history")?.columns).not.toContain("messages");
    const pdktSelect = state.selects.find((query) => query.table === "pdkt_history")?.columns;
    expect(pdktSelect).toContain("scenarios:config->scenarios");
    expect(pdktSelect).toContain("evaluation_score:evaluation->score");
    expect(pdktSelect).not.toContain(", config,");
    expect(pdktSelect).not.toContain(", evaluation,");
    expect(pdktSelect).not.toContain("emails");
    expect(state.selects.find((query) => query.table === "telefun_history")?.columns).not.toContain("recording_path");
  });

  it("uses the page size and applies the global cursor tie-break per source", async () => {
    state.rows = {
      ketik_history: Array.from({ length: 6 }, (_, index) => ({
        id: `00000000-0000-0000-0000-00000000000${index + 1}`,
        date: "2026-09-10T10:00:00.000Z",
        final_score: index,
        simulation_subject_type: "participant",
        simulation_subject_peserta_id: agentId,
        simulation_subject_name: "Agent",
      })),
      pdkt_history: [],
      telefun_history: [],
    };

    const firstPage = await getSidakAgentSimulationHistory({
      agentId,
      module: "ketik",
    });

    expect(firstPage.items).toHaveLength(5);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(
      decodeSidakSimulationCursor(firstPage.nextCursor),
    ).toMatchObject({
      module: "ketik",
      historyId: "00000000-0000-0000-0000-000000000005",
    });

    state.filters = [];
    await getSidakAgentSimulationHistory({
      agentId,
      module: "all",
      cursor: encodeSidakSimulationCursor({
        occurredAt: "2026-09-10T10:00:00.000Z",
        module: "pdkt",
        historyId: "00000000-0000-0000-0000-000000000004",
      }),
    });

    expect(state.filters).toEqual(
      expect.arrayContaining([
        {
          table: "ketik_history",
          operator: "lt",
          args: ["date", "2026-09-10T10:00:00.000Z"],
        },
        {
          table: "pdkt_history",
          operator: "or",
          args: [
            "timestamp.lt.2026-09-10T10:00:00.000Z,and(timestamp.eq.2026-09-10T10:00:00.000Z,id.gt.00000000-0000-0000-0000-000000000004)",
          ],
        },
        {
          table: "telefun_history",
          operator: "lte",
          args: ["created_at", "2026-09-10T10:00:00.000Z"],
        },
      ]),
    );
  });

  it("rejects a cursor generated for a different explicit module", async () => {
    await expect(
      getSidakAgentSimulationHistory({
        agentId,
        module: "ketik",
        cursor: encodeSidakSimulationCursor({
          occurredAt: "2026-09-10T10:00:00.000Z",
          module: "pdkt",
          historyId: "00000000-0000-0000-0000-000000000004",
        }),
      }),
    ).rejects.toMatchObject({ source: "cursor" });
  });

  it("rejects an untrusted cursor history ID before interpolating it into a query", async () => {
    const invalidCursor = Buffer.from(
      JSON.stringify({
        occurredAt: "2026-09-10T10:00:00.000Z",
        module: "ketik",
        historyId: "not-a-uuid",
      }),
      "utf8",
    ).toString("base64url");

    await expect(
      getSidakAgentSimulationHistory({
        agentId,
        module: "all",
        cursor: invalidCursor,
      }),
    ).rejects.toMatchObject({ source: "cursor" });
    expect(state.filters.filter((filter) => filter.table !== "profiler_peserta")).toEqual([]);
  });

  it("checks exact participant ownership before loading the full review", async () => {
    state.detailRow = null;
    getReviewDetail.mockReset();

    await expect(
      import("../services/sidak/agent-simulations").then(({ getSidakAgentSimulationDetail }) =>
        getSidakAgentSimulationDetail({
          agentId,
          module: "telefun",
          historyId: "00000000-0000-0000-0000-000000000006",
          canPlayTelefunRecording: true,
        }),
      ),
    ).rejects.toMatchObject({ name: "SidakSimulationNotFoundError" });

    expect(getReviewDetail).not.toHaveBeenCalled();
    expect(state.filters).toEqual(
      expect.arrayContaining([
        { table: "telefun_history", operator: "eq", args: ["id", "00000000-0000-0000-0000-000000000006"] },
        { table: "telefun_history", operator: "eq", args: ["simulation_subject_type", "participant"] },
        { table: "telefun_history", operator: "eq", args: ["simulation_subject_peserta_id", agentId] },
      ]),
    );
  });

  it("loads detail only after ownership and forwards the scoped recording decision", async () => {
    const historyId = "00000000-0000-0000-0000-000000000007";
    const detail = { module: "telefun", recording_url: null };
    state.detailRow = { id: historyId };
    getReviewDetail.mockResolvedValue(detail);

    const { getSidakAgentSimulationDetail } = await import(
      "../services/sidak/agent-simulations"
    );
    await expect(
      getSidakAgentSimulationDetail({
        agentId,
        module: "telefun",
        historyId,
        canPlayTelefunRecording: false,
      }),
    ).resolves.toEqual(detail);
    expect(getReviewDetail).toHaveBeenCalledWith({
      module: "telefun",
      historyId,
      canSignTelefunRecording: false,
      allowLegacyTelefun: false,
    });
  });
});
