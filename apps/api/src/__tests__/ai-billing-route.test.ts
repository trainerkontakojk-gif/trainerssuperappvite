import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const { mockFrom, mockCreateAdminClient } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockCreateAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: mockCreateAdminClient,
}));

import { ai } from "../routes/ai";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" });
    c.set("profile", { role: "trainer" });
    await next();
  });
  app.route("/", ai);
  return app;
}

describe("AI billing routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCreateAdminClient.mockReturnValue({ from: mockFrom });
  });

  it("GET /monitoring/billing falls back to the latest legacy row when key column is unavailable", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table !== "ai_billing_settings") {
        return { select: vi.fn() };
      }

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
                data: { usd_to_idr_rate: 16500 },
                error: null,
              }),
            }),
          }),
        }),
      };
    });

    const app = buildApp();
    const res = await app.request("/monitoring/billing");
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { usd_to_idr_rate: 16500 },
    });
  });

  it("POST /monitoring/billing falls back to legacy row update when singleton constraint is unavailable", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const upsert = vi.fn().mockResolvedValue({
      error: {
        code: "42P10",
        message:
          "there is no unique or exclusion constraint matching the ON CONFLICT specification",
      },
    });

    mockFrom.mockImplementation((table: string) => {
      if (table !== "ai_billing_settings") {
        return {};
      }

      return {
        upsert,
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "billing-row-1" },
                error: null,
              }),
            }),
          }),
        }),
        update,
      };
    });

    const app = buildApp();
    const res = await app.request("/monitoring/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usd_to_idr_rate: 17500 }),
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: null });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ usd_to_idr_rate: 17500 }),
    );
    expect(updateEq).toHaveBeenCalledWith("id", "billing-row-1");
  });
});
