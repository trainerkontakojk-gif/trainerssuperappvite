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
  calculateOpenAIRealtimeUsageCost,
  createOpenAIUsageAccumulator,
  flushOpenAIRealtimeUsage,
  getOpenAIUsageDiagnostics,
  observeOpenAIUsage,
  parseOpenAIRealtimeUsage,
  summarizeOpenAIUsageAccumulator,
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

  it("does not apply the Gemini per-minute floor to OpenAI realtime models", () => {
    const cost = calculateFinalLiveUsageCost({
      modelId: "gpt-realtime-2.1",
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

  it.each(["gpt-realtime-2.1", "arbitrary-live-model"])(
    "rejects non-Gemini canonical model %s before database access",
    async (modelId) => {
      insertedUsagePayloads.length = 0;
      mockFrom.mockReset();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await flushLiveUsage(
        "telefun-invalid-gemini",
        "user-1",
        {
          turnCount: 1,
          billedPromptTokenCount: 1,
          billedResponseTokenCount: 1,
          billedTotalTokenCount: 2,
          latestSnapshot: {
            promptTokenCount: 1,
            responseTokenCount: 1,
            totalTokenCount: 2,
          },
          rawUsageMetadata: {
            billing_model: "gemini_live_context_window_per_turn_v1",
            turn_count: 1,
            latest: {
              promptTokenCount: 1,
              responseTokenCount: 1,
              totalTokenCount: 2,
            },
            turns: [],
          },
        },
        modelId,
      );

      expect(mockFrom).not.toHaveBeenCalled();
      expect(insertedUsagePayloads).toHaveLength(0);
      consoleError.mockRestore();
    },
  );
});

describe("Telefun Live context-window per-turn billing", () => {
  it("sums context-window usageMetadata per committed turn", () => {
    const acc = createLiveUsageAccumulator();

    observeLiveUsageMetadata(
      acc,
      {
        promptTokenCount: 500,
        promptTokensDetails: [
          { modality: "AUDIO", tokenCount: 400 },
          { modality: "TEXT", tokenCount: 100 },
        ],
        responseTokenCount: 50,
        responseTokensDetails: [{ modality: "AUDIO", tokenCount: 50 }],
        totalTokenCount: 550,
      },
      1_000,
    );
    commitPendingLiveUsageTurn(acc, "turnComplete");

    observeLiveUsageMetadata(
      acc,
      {
        promptTokenCount: 800,
        promptTokensDetails: [
          { modality: "AUDIO", tokenCount: 640 },
          { modality: "TEXT", tokenCount: 160 },
        ],
        responseTokenCount: 80,
        responseTokensDetails: [{ modality: "AUDIO", tokenCount: 80 }],
        totalTokenCount: 880,
      },
      2_000,
    );
    commitPendingLiveUsageTurn(acc, "turnComplete");

    observeLiveUsageMetadata(
      acc,
      {
        promptTokenCount: 1000,
        promptTokensDetails: [
          { modality: "AUDIO", tokenCount: 800 },
          { modality: "TEXT", tokenCount: 200 },
        ],
        responseTokenCount: 100,
        responseTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }],
        totalTokenCount: 1100,
      },
      3_000,
    );
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
    observeLiveUsageMetadata(
      acc,
      {
        promptTokenCount: 1200,
        responseTokenCount: 100,
        totalTokenCount: 1300,
      },
      1_000,
    );
    commitPendingLiveUsageTurn(acc, "turnComplete");
    observeLiveUsageMetadata(
      acc,
      { promptTokenCount: 900, responseTokenCount: 90, totalTokenCount: 990 },
      2_000,
    );
    commitPendingLiveUsageTurn(acc, "turnComplete");

    const aggregate = summarizeLiveUsageAccumulator(acc);
    expect(aggregate!.turnCount).toBe(2);
    expect(aggregate!.billedPromptTokenCount).toBe(2100);
    expect(aggregate!.latestSnapshot.promptTokenCount).toBe(900);
  });

  it("commits pending metadata on session_flush boundary", () => {
    const acc = createLiveUsageAccumulator();
    observeLiveUsageMetadata(
      acc,
      { promptTokenCount: 300, responseTokenCount: 30, totalTokenCount: 330 },
      1_000,
    );
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

describe("OpenAI Realtime response usage", () => {
  const responseUsage = {
    total_tokens: 3_300_000,
    input_tokens: 3_000_000,
    output_tokens: 300_000,
    input_token_details: {
      text_tokens: 1_000_000,
      audio_tokens: 2_000_000,
      cached_tokens: 750_000,
      cached_tokens_details: {
        text_tokens: 250_000,
        audio_tokens: 500_000,
      },
    },
    output_token_details: {
      text_tokens: 100_000,
      audio_tokens: 200_000,
    },
  };

  it("persists assessment usage under telefun/voice_assessment", async () => {
    insertedUsagePayloads.length = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "ai_pricing_settings") {
        return buildQueryResult({
          input_text_price_usd_per_million: 4,
          cached_input_text_price_usd_per_million: 0.4,
          input_audio_price_usd_per_million: 32,
          cached_input_audio_price_usd_per_million: 0.4,
          output_text_price_usd_per_million: 24,
          output_audio_price_usd_per_million: 64,
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
    const accumulator = createOpenAIUsageAccumulator();
    observeOpenAIUsage(accumulator, {
      source: "openai_realtime_response",
      id: "assessment-response",
      usage: responseUsage,
    });
    await expect(
      flushOpenAIRealtimeUsage(
        "telefun-assessment-s1",
        "user-1",
        summarizeOpenAIUsageAccumulator(accumulator)!,
        "gpt-realtime-2.1",
        undefined,
        "voice_assessment",
      ),
    ).resolves.toBe(true);
    expect(insertedUsagePayloads[0]).toMatchObject({
      module: "telefun",
      action: "voice_assessment",
    });
  });

  it("parses text, audio, and cached input details without inventing missing fields", () => {
    expect(parseOpenAIRealtimeUsage(responseUsage)).toEqual({
      inputTokens: 3_000_000,
      outputTokens: 300_000,
      totalTokens: 3_300_000,
      inputTextTokens: 1_000_000,
      inputAudioTokens: 2_000_000,
      cachedInputTokens: 750_000,
      cachedInputTextTokens: 250_000,
      cachedInputAudioTokens: 500_000,
      outputTextTokens: 100_000,
      outputAudioTokens: 200_000,
    });

    expect(
      parseOpenAIRealtimeUsage({
        input_tokens: 5,
        output_tokens: 7,
        total_tokens: 12,
      }),
    ).toEqual({ inputTokens: 5, outputTokens: 7, totalTokens: 12 });
    expect(parseOpenAIRealtimeUsage({})).toBeNull();
  });

  it("dedupes response IDs and excludes transcription observations from Realtime totals", () => {
    const accumulator = createOpenAIUsageAccumulator();
    const responseObservation = {
      source: "openai_realtime_response" as const,
      id: "resp_1",
      usage: responseUsage,
    };

    expect(observeOpenAIUsage(accumulator, responseObservation, 1_000)).toBe(
      true,
    );
    expect(observeOpenAIUsage(accumulator, responseObservation, 1_100)).toBe(
      false,
    );
    expect(
      observeOpenAIUsage(
        accumulator,
        {
          source: "openai_input_transcription",
          id: "item_1",
          usage: {
            type: "tokens",
            input_tokens: 200,
            output_tokens: 20,
            total_tokens: 220,
          },
        },
        1_200,
      ),
    ).toBe(true);

    const aggregate = summarizeOpenAIUsageAccumulator(accumulator);
    expect(aggregate).toMatchObject({
      responseCount: 1,
      inputTokens: 3_000_000,
      outputTokens: 300_000,
      totalTokens: 3_300_000,
      cachedInputTextTokens: 250_000,
      cachedInputAudioTokens: 500_000,
    });
    expect(aggregate?.rawUsageMetadata).toMatchObject({
      billing_model: "openai_realtime_per_response_v1",
      response_count: 1,
      transcription_observation_count: 1,
    });
  });

  it("keeps missing usage as a bounded warning instead of synthesizing tokens", () => {
    const accumulator = createOpenAIUsageAccumulator();

    for (let index = 0; index < 150; index += 1) {
      observeOpenAIUsage(accumulator, {
        source: "openai_realtime_response",
        id: `missing_${index}`,
        usage: null,
      });
    }

    expect(summarizeOpenAIUsageAccumulator(accumulator)).toBeNull();
    expect(getOpenAIUsageDiagnostics(accumulator)).toEqual({
      missingUsageCount: 150,
      unpriceableUsageCount: 0,
      warnings: ["missing_openai_realtime_usage"],
      recentMissingUsageIds: expect.arrayContaining(["missing_149"]),
      recentUnpriceableUsageIds: [],
    });
    expect(
      getOpenAIUsageDiagnostics(accumulator).recentMissingUsageIds.length,
    ).toBeLessThanOrEqual(20);
  });

  it("charges cached input at cached rates and excludes it from full-rate input", () => {
    const accumulator = createOpenAIUsageAccumulator();
    observeOpenAIUsage(accumulator, {
      source: "openai_realtime_response",
      id: "resp_cost",
      usage: responseUsage,
    });
    const aggregate = summarizeOpenAIUsageAccumulator(accumulator)!;

    expect(
      calculateOpenAIRealtimeUsageCost(
        aggregate,
        {
          inputTextPriceUsdPerMillion: 4,
          cachedInputTextPriceUsdPerMillion: 0.4,
          inputAudioPriceUsdPerMillion: 32,
          cachedInputAudioPriceUsdPerMillion: 0.4,
          outputTextPriceUsdPerMillion: 24,
          outputAudioPriceUsdPerMillion: 64,
        },
        15_000,
      ),
    ).toEqual({
      costUsd: 66.5,
      costIdr: 997_500,
      nonCachedInputTextTokens: 750_000,
      nonCachedInputAudioTokens: 1_500_000,
    });
  });

  it.each([
    {
      name: "missing cached modality details",
      inputDetails: {
        text_tokens: 80,
        audio_tokens: 20,
        cached_tokens: 10,
      },
    },
    {
      name: "partial cached modality details",
      inputDetails: {
        text_tokens: 80,
        audio_tokens: 20,
        cached_tokens: 10,
        cached_tokens_details: { text_tokens: 10 },
      },
    },
    {
      name: "mismatched cached modality total",
      inputDetails: {
        text_tokens: 80,
        audio_tokens: 20,
        cached_tokens: 10,
        cached_tokens_details: { text_tokens: 3, audio_tokens: 4 },
      },
    },
  ])("fails closed for $name", async ({ inputDetails }) => {
    insertedUsagePayloads.length = 0;
    mockFrom.mockReset();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const accumulator = createOpenAIUsageAccumulator();
    observeOpenAIUsage(accumulator, {
      source: "openai_realtime_response",
      id: "resp_unpriceable_cache",
      usage: {
        input_tokens: 100,
        output_tokens: 5,
        total_tokens: 105,
        input_token_details: inputDetails,
        output_token_details: { text_tokens: 5, audio_tokens: 0 },
      },
    });
    const aggregate = summarizeOpenAIUsageAccumulator(accumulator)!;

    expect(aggregate.cachedInputTokens).toBe(10);
    expect(getOpenAIUsageDiagnostics(accumulator)).toMatchObject({
      unpriceableUsageCount: 1,
      warnings: ["unpriceable_openai_usage_breakdown"],
    });
    expect(
      calculateOpenAIRealtimeUsageCost(
        aggregate,
        {
          inputTextPriceUsdPerMillion: 4,
          cachedInputTextPriceUsdPerMillion: 0.4,
          inputAudioPriceUsdPerMillion: 32,
          cachedInputAudioPriceUsdPerMillion: 0.4,
          outputTextPriceUsdPerMillion: 24,
          outputAudioPriceUsdPerMillion: 64,
        },
        15_000,
      ),
    ).toBeNull();
    await expect(
      flushOpenAIRealtimeUsage(
        "telefun-unpriceable-cache",
        "user-1",
        aggregate,
        "gpt-realtime-2.1",
      ),
    ).resolves.toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(insertedUsagePayloads).toHaveLength(0);
    consoleError.mockRestore();
  });

  it.each([
    {
      name: "missing input modality details",
      inputDetails: undefined,
      outputDetails: { text_tokens: 15, audio_tokens: 5 },
    },
    {
      name: "partial input modality details",
      inputDetails: { text_tokens: 80, cached_tokens: 0 },
      outputDetails: { text_tokens: 15, audio_tokens: 5 },
    },
    {
      name: "mismatched input modality total",
      inputDetails: {
        text_tokens: 70,
        audio_tokens: 20,
        cached_tokens: 0,
      },
      outputDetails: { text_tokens: 15, audio_tokens: 5 },
    },
    {
      name: "missing output modality details",
      inputDetails: {
        text_tokens: 80,
        audio_tokens: 20,
        cached_tokens: 0,
      },
      outputDetails: undefined,
    },
    {
      name: "partial output modality details",
      inputDetails: {
        text_tokens: 80,
        audio_tokens: 20,
        cached_tokens: 0,
      },
      outputDetails: { text_tokens: 15 },
    },
    {
      name: "mismatched output modality total",
      inputDetails: {
        text_tokens: 80,
        audio_tokens: 20,
        cached_tokens: 0,
      },
      outputDetails: { text_tokens: 10, audio_tokens: 5 },
    },
  ])("fails closed for $name", async ({ inputDetails, outputDetails }) => {
    insertedUsagePayloads.length = 0;
    mockFrom.mockReset();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const accumulator = createOpenAIUsageAccumulator();
    observeOpenAIUsage(accumulator, {
      source: "openai_realtime_response",
      id: "resp_unpriceable_modality",
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        ...(inputDetails === undefined
          ? {}
          : { input_token_details: inputDetails }),
        ...(outputDetails === undefined
          ? {}
          : { output_token_details: outputDetails }),
      },
    });
    const aggregate = summarizeOpenAIUsageAccumulator(accumulator)!;

    expect(getOpenAIUsageDiagnostics(accumulator)).toMatchObject({
      unpriceableUsageCount: 1,
      warnings: ["unpriceable_openai_usage_breakdown"],
    });
    expect(
      calculateOpenAIRealtimeUsageCost(
        aggregate,
        {
          inputTextPriceUsdPerMillion: 4,
          cachedInputTextPriceUsdPerMillion: 0.4,
          inputAudioPriceUsdPerMillion: 32,
          cachedInputAudioPriceUsdPerMillion: 0.4,
          outputTextPriceUsdPerMillion: 24,
          outputAudioPriceUsdPerMillion: 64,
        },
        15_000,
      ),
    ).toBeNull();
    await expect(
      flushOpenAIRealtimeUsage(
        "telefun-unpriceable-modality",
        "user-1",
        aggregate,
        "gpt-realtime-2.1",
      ),
    ).resolves.toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("uses the Mini cached rates instead of the full model cached rates", () => {
    const accumulator = createOpenAIUsageAccumulator();
    observeOpenAIUsage(accumulator, {
      source: "openai_realtime_response",
      id: "resp_mini_cost",
      usage: {
        input_tokens: 1_000_000,
        output_tokens: 0,
        total_tokens: 1_000_000,
        input_token_details: {
          text_tokens: 1_000_000,
          audio_tokens: 0,
          cached_tokens: 500_000,
          cached_tokens_details: {
            text_tokens: 500_000,
            audio_tokens: 0,
          },
        },
        output_token_details: { text_tokens: 0, audio_tokens: 0 },
      },
    });

    expect(
      calculateOpenAIRealtimeUsageCost(
        summarizeOpenAIUsageAccumulator(accumulator)!,
        {
          inputTextPriceUsdPerMillion: 0.6,
          cachedInputTextPriceUsdPerMillion: 0.06,
          inputAudioPriceUsdPerMillion: 10,
          cachedInputAudioPriceUsdPerMillion: 0.3,
          outputTextPriceUsdPerMillion: 2.4,
          outputAudioPriceUsdPerMillion: 20,
        },
        15_000,
      ),
    ).toEqual({
      costUsd: 0.33,
      costIdr: 4_950,
      nonCachedInputTextTokens: 500_000,
      nonCachedInputAudioTokens: 0,
    });
  });

  it("rejects non-OpenAI models before reading pricing or writing usage", async () => {
    insertedUsagePayloads.length = 0;
    mockFrom.mockReset();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const accumulator = createOpenAIUsageAccumulator();
    observeOpenAIUsage(accumulator, {
      source: "openai_realtime_response",
      id: "resp_wrong_provider",
      usage: responseUsage,
    });

    await expect(
      flushOpenAIRealtimeUsage(
        "telefun-wrong-provider",
        "user-1",
        summarizeOpenAIUsageAccumulator(accumulator)!,
        "gemini-3.1-flash-live-preview",
      ),
    ).resolves.toBe(false);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(insertedUsagePayloads).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("persists OpenAI provider, modality tokens, cached snapshots, and token-only billing", async () => {
    insertedUsagePayloads.length = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "ai_pricing_settings") {
        return buildQueryResult({
          input_price_usd_per_million: 4,
          output_price_usd_per_million: 24,
          input_text_price_usd_per_million: 4,
          cached_input_text_price_usd_per_million: 0.4,
          input_audio_price_usd_per_million: 32,
          cached_input_audio_price_usd_per_million: 0.4,
          output_text_price_usd_per_million: 24,
          output_audio_price_usd_per_million: 64,
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

    const accumulator = createOpenAIUsageAccumulator();
    observeOpenAIUsage(accumulator, {
      source: "openai_realtime_response",
      id: "resp_persist",
      usage: responseUsage,
    });

    await expect(
      flushOpenAIRealtimeUsage(
        "telefun-openai-test",
        "user-1",
        summarizeOpenAIUsageAccumulator(accumulator)!,
        "gpt-realtime-2.1",
        120_000,
      ),
    ).resolves.toBe(true);

    expect(insertedUsagePayloads).toHaveLength(1);
    expect(insertedUsagePayloads[0]).toMatchObject({
      provider: "openai",
      model_id: "gpt-realtime-2.1",
      billing_model: "openai_realtime_per_response_v1",
      input_text_tokens: 1_000_000,
      cached_input_text_tokens: 250_000,
      input_audio_tokens: 2_000_000,
      cached_input_audio_tokens: 500_000,
      output_text_tokens: 100_000,
      output_audio_tokens: 200_000,
      cached_input_text_price_usd_per_million: 0.4,
      cached_input_audio_price_usd_per_million: 0.4,
      estimated_cost_usd: 66.5,
      estimated_cost_idr: 997_500,
      session_duration_ms: 120_000,
      per_minute_cost_usd: null,
      per_minute_cost_idr: null,
      final_cost_usd: 66.5,
      final_cost_idr: 997_500,
    });
  });
});
