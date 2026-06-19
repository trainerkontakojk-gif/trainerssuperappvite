import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const { mockFrom, mockCreateAdminClient } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockCreateAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: { from: mockFrom },
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("../middleware/rateLimit", () => ({
  aiRateLimitMiddleware: async (_c: any, next: any) => await next(),
}));

import { ai } from "../routes/ai";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer-1" });
    c.set("profile", { role: "trainer" });
    await next();
  });
  app.route("/", ai);
  return app;
}

function buildChain(data: any[]) {
  const query: any = {
    select: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(async () => ({ data, error: null })),
    then: (resolve: any) => resolve({ data, error: null }),
  };
  return query;
}

describe("AI monitoring aggregation — final cost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockReturnValue({ from: mockFrom });
  });

  it("prefers final_cost_idr over estimated_cost_idr for Telefun Live rows", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "ai_usage_logs") {
        return buildChain([
          {
            user_id: "user-1",
            model_id: "gemini-3.1-flash-live-preview",
            module: "telefun",
            action: "voice_live",
            input_tokens: 100,
            output_tokens: 100,
            total_tokens: 200,
            estimated_cost_idr: 23,
            final_cost_idr: 690,
          },
          {
            user_id: "user-1",
            model_id: "gemini-3.1-flash-live-preview",
            module: "telefun",
            action: "voice_live",
            input_tokens: 2300,
            output_tokens: 230,
            total_tokens: 2530,
            estimated_cost_idr: 129,
            final_cost_idr: 129,
          },
        ]);
      }
      if (table === "profiles") {
        return buildChain([
          {
            id: "user-1",
            email: "agent@example.com",
            role: "agent",
            full_name: "Agent One",
          },
        ]);
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const app = buildApp();
    const res = await app.request(
      "/monitoring/aggregation?module=telefun&year=2026&month=6",
    );
    const body = (await res.json()) as any;

    expect(body.success).toBe(true);
    expect(body.data[0].total_cost_idr).toBe(819);
    expect(body.data[0].simulation_cost_idr).toBe(819);
    expect(body.data[0].models[0].cost_idr).toBe(819);
  });
});
