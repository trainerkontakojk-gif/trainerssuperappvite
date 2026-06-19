import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const { mockFrom, mockCreateAdminClient } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockCreateAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("../middleware/rateLimit", () => ({
  aiRateLimitMiddleware: async (_c: any, next: any) => await next(),
}));

import { ai } from "../routes/ai";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user1" });
    c.set("profile", { role: "trainer" });
    await next();
  });
  app.route("/", ai);
  return app;
}

function buildPaginatedQuery(rows: any[]) {
  let rangeFrom = 0;
  let rangeTo = Number.MAX_SAFE_INTEGER;
  let usedRange = false;

  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => {
            if (!usedRange) {
              return resolve({ data: rows.slice(0, 1000), error: null });
            }
            return resolve({
              data: rows.filter((_, idx) => idx >= rangeFrom && idx <= rangeTo),
              error: null,
            });
          };
        }
        if (prop === "range") {
          return (from: number, to: number) => {
            usedRange = true;
            rangeFrom = from;
            rangeTo = to;
            return q;
          };
        }
        return (..._args: any[]) => q;
      },
    },
  );

  return q;
}

describe("AI Usage Summary — simulation/review breakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCreateAdminClient.mockReturnValue({ from: mockFrom });
  });

  it("returns simulationCostIdr and reviewCostIdr in response", async () => {
    const mockLogs = [
      { action: "chat_response", input_tokens: 100, output_tokens: 200, total_tokens: 300, estimated_cost_usd: 0.001, estimated_cost_idr: 1500 },
      { action: "chat_response", input_tokens: 150, output_tokens: 250, total_tokens: 400, estimated_cost_usd: 0.0015, estimated_cost_idr: 2250 },
      { action: "coaching_review", input_tokens: 500, output_tokens: 800, total_tokens: 1300, estimated_cost_usd: 0.005, estimated_cost_idr: 7500 },
      { action: "evaluate_response", input_tokens: 300, output_tokens: 500, total_tokens: 800, estimated_cost_usd: 0.003, estimated_cost_idr: 4500 },
    ];

    mockFrom.mockReturnValue(buildPaginatedQuery(mockLogs));

    const app = buildApp();
    const res = await app.request("/usage/summary?module=ketik");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("simulationCostIdr");
    expect(body.data).toHaveProperty("reviewCostIdr");
    expect(body.data.simulationCostIdr).toBe(3750);
    expect(body.data.reviewCostIdr).toBe(12000);
    expect(body.data.totalCostIdr).toBe(15750);
    expect(body.data.totalCalls).toBe(4);
  });

  it("returns 0 for simulation/review when no matching actions", async () => {
    const mockLogs = [
      { action: "voice_live", input_tokens: 100, output_tokens: 200, total_tokens: 300, estimated_cost_usd: 0.001, estimated_cost_idr: 1500 },
    ];

    mockFrom.mockReturnValue(buildPaginatedQuery(mockLogs));

    const app = buildApp();
    const res = await app.request("/usage/summary?module=telefun");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.simulationCostIdr).toBe(1500);
    expect(body.data.reviewCostIdr).toBe(0);
  });

  it("handles empty logs gracefully", async () => {
    mockFrom.mockReturnValue(buildPaginatedQuery([]));

    const app = buildApp();
    const res = await app.request("/usage/summary?module=pdkt");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.simulationCostIdr).toBe(0);
    expect(body.data.reviewCostIdr).toBe(0);
    expect(body.data.totalCalls).toBe(0);
  });

  it("classifies KETIK generate_consumer_response as simulation cost", async () => {
    const mockLogs = [
      {
        action: "generate_consumer_response",
        input_tokens: 100,
        output_tokens: 200,
        total_tokens: 300,
        estimated_cost_usd: 0.001,
        estimated_cost_idr: 1500,
      },
    ];

    mockFrom.mockReturnValue(buildPaginatedQuery(mockLogs));

    const app = buildApp();
    const res = await app.request("/usage/summary?module=ketik");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.totalCalls).toBe(1);
    expect(body.data.totalCostIdr).toBe(1500);
    expect(body.data.simulationCostIdr).toBe(1500);
    expect(body.data.reviewCostIdr).toBe(0);
  });

  it("returns breakdown with simulation and review detailed stats", async () => {
    const mockLogs = [
      { action: "chat_response", input_tokens: 100, output_tokens: 200, total_tokens: 300, estimated_cost_usd: 0.001, estimated_cost_idr: 1500 },
      { action: "coaching_review", input_tokens: 500, output_tokens: 800, total_tokens: 1300, estimated_cost_usd: 0, estimated_cost_idr: 0 },
    ];

    mockFrom.mockReturnValue(buildPaginatedQuery(mockLogs));

    const app = buildApp();
    const res = await app.request("/usage/summary?module=ketik");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty("breakdown");
    expect(body.data.breakdown.simulation).toEqual({
      calls: 1,
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      costIdr: 1500,
      costUsd: 0.001,
    });
    expect(body.data.breakdown.review).toEqual({
      calls: 1,
      inputTokens: 500,
      outputTokens: 800,
      totalTokens: 1300,
      costIdr: 0,
      costUsd: 0,
    });
  });

  it("classifies PDKT create email, image generation, and async evaluation into itemized breakdown", async () => {
    const mockLogs = [
      {
        action: "init_email",
        input_tokens: 100,
        output_tokens: 300,
        total_tokens: 400,
        estimated_cost_usd: 0.001,
        estimated_cost_idr: 1500,
      },
      {
        action: "generate_ai_images",
        input_tokens: 200,
        output_tokens: 0,
        total_tokens: 200,
        estimated_cost_usd: 0.002,
        estimated_cost_idr: 3000,
      },
      {
        action: "async_evaluate_agent_response",
        input_tokens: 400,
        output_tokens: 500,
        total_tokens: 900,
        estimated_cost_usd: 0.003,
        estimated_cost_idr: 4500,
      },
    ];

    mockFrom.mockReturnValue(buildPaginatedQuery(mockLogs));

    const app = buildApp();
    const res = await app.request("/usage/summary?module=pdkt");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.simulationCostIdr).toBe(4500);
    expect(body.data.reviewCostIdr).toBe(4500);
    expect(body.data.breakdown.simulation.calls).toBe(2);
    expect(body.data.breakdown.review.calls).toBe(1);
    expect(body.data.breakdown.uncategorized.calls).toBe(0);
    expect(body.data.breakdownItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "pdkt_create_email",
          label: "Create Email",
          category: "simulation",
          calls: 1,
          costIdr: 1500,
        }),
        expect.objectContaining({
          key: "pdkt_image_generation",
          label: "Lampiran AI",
          category: "simulation",
          calls: 1,
          costIdr: 3000,
        }),
        expect.objectContaining({
          key: "pdkt_review",
          label: "Penilaian AI",
          category: "review",
          calls: 1,
          costIdr: 4500,
        }),
      ]),
    );
  });

  it("prefers final Telefun Live cost when present", async () => {
    const mockLogs = [
      {
        action: "voice_live",
        input_tokens: 100,
        output_tokens: 100,
        total_tokens: 200,
        estimated_cost_usd: 0.0015,
        estimated_cost_idr: 23,
        final_cost_usd: 0.046,
        final_cost_idr: 690,
      },
      {
        action: "voice_live",
        input_tokens: 2300,
        output_tokens: 230,
        total_tokens: 2530,
        estimated_cost_usd: 0.008625,
        estimated_cost_idr: 129,
        final_cost_usd: 0.008625,
        final_cost_idr: 129,
      },
    ];

    mockFrom.mockReturnValue(buildPaginatedQuery(mockLogs));

    const app = buildApp();
    const res = await app.request("/usage/summary?module=telefun");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.totalCostUsd).toBe(0.054625);
    expect(body.data.totalCostIdr).toBe(819);
    expect(body.data.simulationCostIdr).toBe(819);
    expect(body.data.breakdown.simulation.costIdr).toBe(819);
  });
});
