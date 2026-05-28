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

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                then: (resolve: any) => resolve({ data: mockLogs, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

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

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                then: (resolve: any) => resolve({ data: mockLogs, error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const app = buildApp();
    const res = await app.request("/usage/summary?module=telefun");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.simulationCostIdr).toBe(1500);
    expect(body.data.reviewCostIdr).toBe(0);
  });

  it("handles empty logs gracefully", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                then: (resolve: any) => resolve({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const app = buildApp();
    const res = await app.request("/usage/summary?module=pdkt");
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data.simulationCostIdr).toBe(0);
    expect(body.data.reviewCostIdr).toBe(0);
    expect(body.data.totalCalls).toBe(0);
  });
});
