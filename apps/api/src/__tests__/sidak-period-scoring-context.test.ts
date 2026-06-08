import { describe, expect, it, vi, beforeEach } from "vitest";

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

import {
  normalizePeriodScoringRows,
  loadPeriodScoringContext,
  mergeServiceWeights,
} from "../services/sidak/period-scoring-context";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
} from "../lib/scoring";
import type { ServiceType, ServiceWeight } from "@trainers/types";

describe("normalizePeriodScoringRows", () => {
  const baseContext = {
    indicators: [
      {
        id: "snapshot-1",
        service_type: "call" as ServiceType,
        name: "Greeting",
        category: "critical" as const,
        bobot: 10,
        has_na: false,
      },
    ],
    weight: DEFAULT_SERVICE_WEIGHTS.call,
    scoreIdByAnyId: new Map<string, string>([
      ["snapshot-1", "snapshot-1"],
      ["master-1", "snapshot-1"],
      ["legacy-1", "snapshot-1"],
    ]),
  };

  it("uses rule_indicator_id when available", () => {
    const result = normalizePeriodScoringRows(
      [
        {
          indicator_id: "master-1",
          rule_indicator_id: "snapshot-1",
          nilai: 2,
          period_id: "p-jan",
        },
      ],
      baseContext,
    );
    expect(result).toEqual([
      {
        indicator_id: "snapshot-1",
        nilai: 2,
        period_id: "p-jan",
        no_tiket: null,
        created_at: undefined,
      },
    ]);
  });

  it("falls back via legacy_indicator_id mapping", () => {
    const result = normalizePeriodScoringRows(
      [
        {
          indicator_id: "legacy-1",
          nilai: 2,
          period_id: "p-jan",
        },
      ],
      baseContext,
    );
    expect(result[0].indicator_id).toBe("snapshot-1");
  });

  it("passes through unknown ID without casting", () => {
    const result = normalizePeriodScoringRows(
      [
        {
          indicator_id: "unknown-id",
          nilai: 3,
          period_id: "p-jan",
        },
      ],
      baseContext,
    );
    expect(result[0].indicator_id).toBe("unknown-id");
  });

  it("preserves no_tiket and created_at", () => {
    const result = normalizePeriodScoringRows(
      [
        {
          indicator_id: "master-1",
          rule_indicator_id: "snapshot-1",
          nilai: 2,
          no_tiket: "TKT-001",
          created_at: "2026-01-15T10:00:00Z",
          period_id: "p-jan",
        },
      ],
      baseContext,
    );
    expect(result[0].no_tiket).toBe("TKT-001");
    expect(result[0].created_at).toBe("2026-01-15T10:00:00Z");
  });

  it("prefers rule_indicator_id over indicator_id", () => {
    const ctx = {
      ...baseContext,
      scoreIdByAnyId: new Map<string, string>([
        ["snapshot-1", "snapshot-1"],
        ["master-1", "other-id"],
        ["legacy-1", "snapshot-1"],
      ]),
    };
    const result = normalizePeriodScoringRows(
      [
        {
          indicator_id: "master-1",
          rule_indicator_id: "snapshot-1",
          nilai: 2,
          period_id: "p-jan",
        },
      ],
      ctx,
    );
    expect(result[0].indicator_id).toBe("snapshot-1");
  });
});

describe("mergeServiceWeights", () => {
  it("merges DB overrides with defaults", () => {
    const overrides: ServiceWeight[] = [
      {
        service_type: "call",
        critical_weight: 0.7,
        non_critical_weight: 0.3,
        scoring_mode: "weighted",
      },
    ];
    const result = mergeServiceWeights(DEFAULT_SERVICE_WEIGHTS, overrides);
    expect(result.call.critical_weight).toBe(0.7);
    expect(result.call.non_critical_weight).toBe(0.3);
    expect(result.chat).toEqual(DEFAULT_SERVICE_WEIGHTS.chat);
  });

  it("returns defaults when overrides empty", () => {
    const result = mergeServiceWeights(DEFAULT_SERVICE_WEIGHTS, []);
    expect(result).toEqual(DEFAULT_SERVICE_WEIGHTS);
  });

  it("handles numeric conversion from string values", () => {
    const overrides = [
      {
        service_type: "email",
        critical_weight: "0.8",
        non_critical_weight: "0.2",
        scoring_mode: "weighted" as const,
      },
    ];
    const result = mergeServiceWeights(DEFAULT_SERVICE_WEIGHTS, overrides);
    expect(result.email.critical_weight).toBe(0.8);
    expect(result.email.non_critical_weight).toBe(0.2);
  });

  it("partial override keeps other fields from defaults", () => {
    const overrides = [
      {
        service_type: "email" as ServiceType,
        critical_weight: 0.8,
        non_critical_weight: 0.2,
        scoring_mode: "weighted" as const,
      },
    ];
    const result = mergeServiceWeights(DEFAULT_SERVICE_WEIGHTS, overrides);
    expect(result.email.critical_weight).toBe(0.8);
    expect(result.email.service_type).toBe("email");
  });
});

describe("loadPeriodScoringContext", () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
  });

  it("returns fallback when no rule version exists", async () => {
    let _callCount = 0;
    pendingResolve = (table) => {
      _callCount++;
      if (table === "qa_periods")
        return { data: { id: "p-jan", month: 1, year: 2026 }, error: null };
      if (table === "qa_service_rule_versions")
        return { data: [], error: null };
      return { data: [], error: null };
    };

    const fallbackInds = [
      {
        id: "ind-1",
        service_type: "call" as ServiceType,
        name: "Test",
        category: "critical" as const,
        bobot: 10,
        has_na: false,
      },
    ];

    const ctx = await loadPeriodScoringContext(
      "call",
      "p-jan",
      fallbackInds,
      DEFAULT_SERVICE_WEIGHTS.call,
    );
    expect(ctx.indicators).toHaveLength(1);
    expect(ctx.indicators[0].id).toBe("ind-1");
    expect(ctx.weight).toEqual(DEFAULT_SERVICE_WEIGHTS.call);
  });

  it("builds context from snapshot indicators when rule version exists", async () => {
    const ruleVersionId = "rv-1";
    let _callCount = 0;
    pendingResolve = (table) => {
      _callCount++;
      if (table === "qa_periods")
        return { data: { id: "p-jan", month: 1, year: 2026 }, error: null };
      if (table === "qa_service_rule_versions")
        return {
          data: [
            {
              id: ruleVersionId,
              service_type: "call",
              effective_period_id: "p-jan",
              critical_weight: "0.6",
              non_critical_weight: "0.4",
              scoring_mode: "weighted",
              version_number: 1,
              status: "published",
              created_at: "2026-01-01T00:00:00Z",
              qa_periods: { id: "p-jan", month: 1, year: 2026 },
            },
          ],
          error: null,
        };
      if (table === "qa_service_rule_indicators")
        return {
          data: [
            {
              id: "snap-1",
              indicator_id: "master-1",
              legacy_indicator_id: "legacy-1",
              name: "Greeting",
              category: "critical",
              bobot: 10,
              has_na: false,
            },
          ],
          error: null,
        };
      return { data: [], error: null };
    };

    const ctx = await loadPeriodScoringContext(
      "call",
      "p-jan",
      [],
      DEFAULT_SERVICE_WEIGHTS.call,
    );
    expect(ctx.indicators).toHaveLength(1);
    expect(ctx.indicators[0].id).toBe("snap-1");
    expect(ctx.indicators[0].name).toBe("Greeting");
    expect(ctx.scoreIdByAnyId.get("snap-1")).toBe("snap-1");
    expect(ctx.scoreIdByAnyId.get("master-1")).toBe("snap-1");
    expect(ctx.scoreIdByAnyId.get("legacy-1")).toBe("snap-1");
    expect(ctx.weight.critical_weight).toBe(0.6);
  });

  it("keeps snapshot indicators and normalized rows on the same scoring ID", async () => {
    pendingResolve = (table) => {
      if (table === "qa_periods")
        return { data: { id: "p-jan", month: 1, year: 2026 }, error: null };
      if (table === "qa_service_rule_versions")
        return {
          data: [
            {
              id: "rv-1",
              service_type: "call",
              effective_period_id: "p-jan",
              critical_weight: "0.6",
              non_critical_weight: "0.4",
              scoring_mode: "weighted",
              version_number: 1,
              status: "published",
              created_at: "2026-01-01T00:00:00Z",
              qa_periods: { id: "p-jan", month: 1, year: 2026 },
            },
          ],
          error: null,
        };
      if (table === "qa_service_rule_indicators")
        return {
          data: [
            {
              id: "snap-1",
              indicator_id: "master-1",
              legacy_indicator_id: "legacy-1",
              service_type: "call",
              name: "Greeting",
              category: "critical",
              bobot: 10,
              has_na: false,
            },
          ],
          error: null,
        };
      return { data: [], error: null };
    };

    const context = await loadPeriodScoringContext(
      "call",
      "p-jan",
      [],
      DEFAULT_SERVICE_WEIGHTS.call,
    );
    const rows = normalizePeriodScoringRows(
      [
        {
          indicator_id: "legacy-1",
          rule_indicator_id: "snap-1",
          nilai: 0,
          no_tiket: "JAN-001",
          period_id: "p-jan",
        },
      ],
      context,
    );

    const score = calculateQAScoreFromTemuan(
      context.indicators,
      rows,
      context.weight,
    );

    expect(score.finalScore).toBeLessThan(100);
  });

  it("throws when no indicators and no rule version", async () => {
    pendingResolve = () => ({ data: [], error: null });

    await expect(
      loadPeriodScoringContext(
        "call",
        "p-jan",
        [],
        DEFAULT_SERVICE_WEIGHTS.call,
      ),
    ).rejects.toThrow(
      "Tidak ada indikator untuk layanan call pada periode p-jan",
    );
  });
});
