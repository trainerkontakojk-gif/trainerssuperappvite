import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import { logAiUsage } from "../lib/ai-usage";

describe("logAiUsage legacy schema compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
  });

  it("retries insert without status columns when hosted ai_usage_logs schema is older", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({
        error: {
          code: "42703",
          message: "column ai_usage_logs.status does not exist",
        },
      })
      .mockResolvedValueOnce({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "ai_pricing_settings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  input_price_usd_per_million: 1,
                  output_price_usd_per_million: 2,
                },
              }),
            }),
          }),
        };
      }

      if (table === "ai_billing_settings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { usd_to_idr_rate: 15000 },
              }),
            }),
          }),
        };
      }

      return { insert };
    });

    await logAiUsage({
      requestId: "req-1",
      userId: "user-1",
      provider: "gemini",
      modelId: "gemini-3.1-flash-lite",
      usageContext: { module: "ketik", action: "generate_consumer_response" },
      tokens: { inputTokens: 1000, outputTokens: 2000, totalTokens: 3000 },
    });

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0]).toMatchObject({
      request_id: "req-1",
      status: "success",
      error_message: null,
    });
    expect(insert.mock.calls[1][0]).toMatchObject({
      request_id: "req-1",
      module: "ketik",
      action: "generate_consumer_response",
    });
    expect(insert.mock.calls[1][0]).not.toHaveProperty("status");
    expect(insert.mock.calls[1][0]).not.toHaveProperty("error_message");
  });

  it("retries insert without status columns when PostgREST schema cache is stale (PGRST204)", async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce({
        error: {
          code: "PGRST204",
          message: "Could not find the 'error_message' column of 'ai_usage_logs' in the schema cache",
        },
      })
      .mockResolvedValueOnce({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "ai_pricing_settings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  input_price_usd_per_million: 1,
                  output_price_usd_per_million: 2,
                },
              }),
            }),
          }),
        };
      }

      if (table === "ai_billing_settings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { usd_to_idr_rate: 15000 },
              }),
            }),
          }),
        };
      }

      return { insert };
    });

    await logAiUsage({
      requestId: "req-2",
      userId: "user-2",
      provider: "openrouter",
      modelId: "gpt-4o-mini",
      usageContext: { module: "pdkt", action: "generate_template" },
      tokens: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
    });

    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[0][0]).toMatchObject({
      request_id: "req-2",
      status: "success",
      error_message: null,
    });
    expect(insert.mock.calls[1][0]).toMatchObject({
      request_id: "req-2",
      module: "pdkt",
      action: "generate_template",
    });
    expect(insert.mock.calls[1][0]).not.toHaveProperty("status");
    expect(insert.mock.calls[1][0]).not.toHaveProperty("error_message");
  });

  it("falls back to legacy billing lookup when singleton key column is unavailable", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === "ai_pricing_settings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  input_price_usd_per_million: 1,
                  output_price_usd_per_million: 2,
                },
              }),
            }),
          }),
        };
      }

      if (table === "ai_billing_settings") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: {
                  code: "42703",
                  message: 'column "key" does not exist',
                },
              }),
            }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { usd_to_idr_rate: 17000 },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      return { insert };
    });

    await logAiUsage({
      requestId: "req-3",
      userId: "user-3",
      provider: "gemini",
      modelId: "gemini-3.1-flash-lite",
      usageContext: { module: "ketik", action: "generate_consumer_response" },
      tokens: { inputTokens: 1000, outputTokens: 2000, totalTokens: 3000 },
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      request_id: "req-3",
      usd_to_idr_rate: 17000,
    });
  });
});
