import { vi, describe, expect, it } from "vitest";

// Mock env module before importing usage
vi.mock("../env", () => ({
  env: {
    PORT: 3002,
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    GEMINI_API_KEY: "test-gemini-key",
    ALLOWED_ORIGINS: "*",
    NODE_ENV: "development",
  },
}));

const { mockFrom, insertedUsagePayloads } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  insertedUsagePayloads: [] as Record<string, unknown>[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import {
  parseUsageMetadata,
  calculateLiveUsageCost,
  calculatePerMinuteCost,
  calculateFinalLiveUsageCost,
  flushLiveUsage,
  createLiveUsageAccumulator,
  observeLiveUsageMetadata,
  commitPendingLiveUsageTurn,
  summarizeLiveUsageAccumulator,
} from "../usage";

// ── parseUsageMetadata — modality breakdown ──────────────

describe("parseUsageMetadata — modality breakdown", () => {
  it("returns text/audio breakdown from promptTokensDetails and responseTokensDetails", () => {
    const raw = {
      promptTokenCount: 1500,
      promptTokensDetails: [
        { modality: "TEXT", tokenCount: 500 },
        { modality: "AUDIO", tokenCount: 1000 },
      ],
      responseTokenCount: 800,
      responseTokensDetails: [
        { modality: "TEXT", tokenCount: 200 },
        { modality: "AUDIO", tokenCount: 600 },
      ],
      totalTokenCount: 2300,
    };

    const snapshot = parseUsageMetadata(raw);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.promptTokenCount).toBe(1500);
    expect(snapshot!.responseTokenCount).toBe(800);
    expect(snapshot!.totalTokenCount).toBe(2300);
    expect(snapshot!.promptModality).toEqual({ text: 500, audio: 1000 });
    expect(snapshot!.responseModality).toEqual({ text: 200, audio: 600 });
  });

  it("returns undefined modality when sum does not match total", () => {
    const raw = {
      promptTokenCount: 2000,
      promptTokensDetails: [
        { modality: "TEXT", tokenCount: 500 },
        { modality: "AUDIO", tokenCount: 1000 },
      ],
      totalTokenCount: 2000,
    };

    const snapshot = parseUsageMetadata(raw);
    expect(snapshot).not.toBeNull();
    // 500 + 1000 = 1500 ≠ 2000, so promptModality should be undefined
    expect(snapshot!.promptModality).toBeUndefined();
  });

  it("returns undefined modality when no details array", () => {
    const raw = {
      promptTokenCount: 100,
      responseTokenCount: 50,
      totalTokenCount: 150,
    };

    const snapshot = parseUsageMetadata(raw);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.promptModality).toBeUndefined();
    expect(snapshot!.responseModality).toBeUndefined();
  });

  it("handles case-insensitive modality strings", () => {
    const raw = {
      promptTokenCount: 300,
      promptTokensDetails: [
        { modality: "text", tokenCount: 100 },
        { modality: "Audio", tokenCount: 200 },
      ],
      totalTokenCount: 300,
    };

    const snapshot = parseUsageMetadata(raw);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.promptModality).toEqual({ text: 100, audio: 200 });
  });

  it("returns null for empty/invalid input", () => {
    expect(parseUsageMetadata(null)).toBeNull();
    expect(parseUsageMetadata(undefined)).toBeNull();
    expect(parseUsageMetadata("string")).toBeNull();
    expect(parseUsageMetadata({})).toBeNull();
  });
});

describe("Telefun Live per-minute billing", () => {
  it("calculates combined input and output per-minute audio cost", () => {
    const cost = calculatePerMinuteCost(120_000, 15_000);

    expect(cost).toEqual({
      costUsd: 0.046,
      costIdr: 690,
    });
  });

  it("uses per-minute cost for live models when it is higher than token cost", () => {
    const cost = calculateFinalLiveUsageCost({
      modelId: "gemini-3.1-flash-live-preview",
      perTokenCostUsd: 0.000123,
      sessionDurationMs: 120_000,
      usdToIdrRate: 15_000,
    });

    expect(cost).toEqual({
      sessionDurationMs: 120_000,
      perMinuteCostUsd: 0.046,
      perMinuteCostIdr: 690,
      finalCostUsd: 0.046,
      finalCostIdr: 690,
    });
  });

  it("uses per-token cost for live models when token cost is higher", () => {
    const cost = calculateFinalLiveUsageCost({
      modelId: "gemini-3.1-flash-live-preview",
      perTokenCostUsd: 0.5,
      sessionDurationMs: 1_000,
      usdToIdrRate: 15_000,
    });

    expect(cost.perMinuteCostUsd).toBe(0.000383);
    expect(cost.finalCostUsd).toBe(0.5);
    expect(cost.finalCostIdr).toBe(7_500);
  });

  it("does not apply per-minute billing to non-live models", () => {
    const cost = calculateFinalLiveUsageCost({
      modelId: "gemini-3.1-flash-lite",
      perTokenCostUsd: 0.012345,
      sessionDurationMs: 120_000,
      usdToIdrRate: 15_000,
    });

    expect(cost).toEqual({
      sessionDurationMs: 120_000,
      perMinuteCostUsd: null,
      perMinuteCostIdr: null,
      finalCostUsd: 0.012345,
      finalCostIdr: 185,
    });
  });
});

function buildQueryResult(data: Record<string, unknown> | null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe("flushLiveUsage — per-minute billing payload", () => {
  it("persists token, per-minute, and final cost columns for live models", async () => {
    insertedUsagePayloads.length = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "ai_pricing_settings") {
        return buildQueryResult({
          input_price_usd_per_million: 3,
          output_price_usd_per_million: 12,
        });
      }
      if (table === "ai_billing_settings") {
        return buildQueryResult({ usd_to_idr_rate: 15_000 });
      }
      if (table === "ai_usage_logs") {
        return {
          insert: vi.fn(async (payload: Record<string, unknown>) => {
            insertedUsagePayloads.push(payload);
            return { error: null };
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    await flushLiveUsage(
      "telefun-live-test",
      "user-1",
      {
        turnCount: 1,
        billedPromptTokenCount: 100,
        billedResponseTokenCount: 100,
        billedTotalTokenCount: 200,
        billedPromptModality: { text: 0, audio: 100 },
        billedResponseModality: { text: 0, audio: 100 },
        latestSnapshot: {
          promptTokenCount: 100,
          responseTokenCount: 100,
          totalTokenCount: 200,
          promptModality: { text: 0, audio: 100 },
          responseModality: { text: 0, audio: 100 },
        },
        rawUsageMetadata: {
          billing_model: "gemini_live_context_window_per_turn_v1",
          turn_count: 1,
          latest: {
            promptTokenCount: 100,
            responseTokenCount: 100,
            totalTokenCount: 200,
          },
          turns: [],
        },
      },
      "gemini-3.1-flash-live-preview",
      120_000,
    );

    expect(insertedUsagePayloads).toHaveLength(1);
    expect(insertedUsagePayloads[0]).toMatchObject({
      estimated_cost_usd: 0.0015,
      estimated_cost_idr: 23,
      live_turn_count: 1,
      latest_input_tokens: 100,
      latest_output_tokens: 100,
      latest_total_tokens: 200,
      context_rebilled_cost_usd: 0.0015,
      context_rebilled_cost_idr: 23,
      session_duration_ms: 120_000,
      per_minute_cost_usd: 0.046,
      per_minute_cost_idr: 690,
      final_cost_usd: 0.046,
      final_cost_idr: 690,
      raw_usage_metadata: expect.objectContaining({
        billing_model: "gemini_live_context_window_per_turn_v1",
      }),
    });
  });
});

describe("Telefun Live context-window per-turn billing", () => {
  it("sums context-window usageMetadata per committed turn", () => {
    const acc = createLiveUsageAccumulator();

    observeLiveUsageMetadata(acc, {
      promptTokenCount: 500,
      promptTokensDetails: [
        { modality: "AUDIO", tokenCount: 400 },
        { modality: "TEXT", tokenCount: 100 },
      ],
      responseTokenCount: 50,
      responseTokensDetails: [{ modality: "AUDIO", tokenCount: 50 }],
      totalTokenCount: 550,
    }, 1_000);
    commitPendingLiveUsageTurn(acc, "turnComplete");

    observeLiveUsageMetadata(acc, {
      promptTokenCount: 800,
      promptTokensDetails: [
        { modality: "AUDIO", tokenCount: 640 },
        { modality: "TEXT", tokenCount: 160 },
      ],
      responseTokenCount: 80,
      responseTokensDetails: [{ modality: "AUDIO", tokenCount: 80 }],
      totalTokenCount: 880,
    }, 2_000);
    commitPendingLiveUsageTurn(acc, "turnComplete");

    observeLiveUsageMetadata(acc, {
      promptTokenCount: 1000,
      promptTokensDetails: [
        { modality: "AUDIO", tokenCount: 800 },
        { modality: "TEXT", tokenCount: 200 },
      ],
      responseTokenCount: 100,
      responseTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }],
      totalTokenCount: 1100,
    }, 3_000);
    commitPendingLiveUsageTurn(acc, "turnComplete");

    const aggregate = summarizeLiveUsageAccumulator(acc);
    expect(aggregate).not.toBeNull();
    expect(aggregate!.turnCount).toBe(3);
    expect(aggregate!.billedPromptTokenCount).toBe(2300);
    expect(aggregate!.billedResponseTokenCount).toBe(230);
    expect(aggregate!.billedPromptModality).toEqual({ audio: 1840, text: 460 });
    expect(aggregate!.billedResponseModality).toEqual({ audio: 230, text: 0 });
    expect(aggregate!.latestSnapshot.promptTokenCount).toBe(1000);
  });

  it("does not double-count identical usageMetadata snapshots", () => {
    const acc = createLiveUsageAccumulator();
    const raw = {
      promptTokenCount: 500,
      responseTokenCount: 50,
      totalTokenCount: 550,
    };
    observeLiveUsageMetadata(acc, raw, 1_000);
    commitPendingLiveUsageTurn(acc, "turnComplete");
    observeLiveUsageMetadata(acc, raw, 1_100);
    commitPendingLiveUsageTurn(acc, "turnComplete");

    const aggregate = summarizeLiveUsageAccumulator(acc);
    expect(aggregate!.turnCount).toBe(1);
    expect(aggregate!.billedTotalTokenCount).toBe(550);
  });

  it("counts a later smaller prompt snapshot as a new billable turn", () => {
    const acc = createLiveUsageAccumulator();
    observeLiveUsageMetadata(acc, { promptTokenCount: 1200, responseTokenCount: 100, totalTokenCount: 1300 }, 1_000);
    commitPendingLiveUsageTurn(acc, "turnComplete");
    observeLiveUsageMetadata(acc, { promptTokenCount: 900, responseTokenCount: 90, totalTokenCount: 990 }, 2_000);
    commitPendingLiveUsageTurn(acc, "turnComplete");

    const aggregate = summarizeLiveUsageAccumulator(acc);
    expect(aggregate!.turnCount).toBe(2);
    expect(aggregate!.billedPromptTokenCount).toBe(2100);
    expect(aggregate!.latestSnapshot.promptTokenCount).toBe(900);
  });

  it("commits pending metadata on session_flush boundary", () => {
    const acc = createLiveUsageAccumulator();
    observeLiveUsageMetadata(acc, { promptTokenCount: 300, responseTokenCount: 30, totalTokenCount: 330 }, 1_000);
    // Do NOT commit turnComplete - simulate disconnect before turn end
    commitPendingLiveUsageTurn(acc, "session_flush");

    const aggregate = summarizeLiveUsageAccumulator(acc);
    expect(aggregate!.turnCount).toBe(1);
    expect(aggregate!.billedPromptTokenCount).toBe(300);
  });

  it("returns null summary for empty accumulator", () => {
    const acc = createLiveUsageAccumulator();
    const aggregate = summarizeLiveUsageAccumulator(acc);
    expect(aggregate).toBeNull();
  });

  it("calculates context-window rebilled token cost from all turns", () => {
    const acc = createLiveUsageAccumulator();

    observeLiveUsageMetadata(acc, {
      promptTokenCount: 500,
      promptTokensDetails: [
        { modality: "AUDIO", tokenCount: 400 },
        { modality: "TEXT", tokenCount: 100 },
      ],
      responseTokenCount: 50,
      responseTokensDetails: [{ modality: "AUDIO", tokenCount: 50 }],
      totalTokenCount: 550,
    });
    commitPendingLiveUsageTurn(acc, "turnComplete");
    observeLiveUsageMetadata(acc, {
      promptTokenCount: 800,
      promptTokensDetails: [
        { modality: "AUDIO", tokenCount: 640 },
        { modality: "TEXT", tokenCount: 160 },
      ],
      responseTokenCount: 80,
      responseTokensDetails: [{ modality: "AUDIO", tokenCount: 80 }],
      totalTokenCount: 880,
    });
    commitPendingLiveUsageTurn(acc, "turnComplete");
    observeLiveUsageMetadata(acc, {
      promptTokenCount: 1000,
      promptTokensDetails: [
        { modality: "AUDIO", tokenCount: 800 },
        { modality: "TEXT", tokenCount: 200 },
      ],
      responseTokenCount: 100,
      responseTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }],
      totalTokenCount: 1100,
    });
    commitPendingLiveUsageTurn(acc, "turnComplete");

    const aggregate = summarizeLiveUsageAccumulator(acc);
    expect(aggregate).not.toBeNull();
    const cost = calculateLiveUsageCost(aggregate!, 3, 12, 15_000);

    expect(cost.costUsd).toBe(0.008625);
    expect(cost.costIdr).toBe(129);
    expect(cost.inputUnspecifiedTokens).toBe(0);
    expect(cost.outputUnspecifiedTokens).toBe(0);
  });
});
