import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const mockRpc = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  })),
}));

vi.mock("../lib/telefun-analysis", () => ({
  analyzeVoiceQuality: vi.fn(),
  generateCoachingSummary: vi.fn(),
}));

vi.mock("../services/telefun-scoring-service", () => ({
  enqueueScoring: vi.fn(),
}));

import { telefunRecordings } from "../routes/telefun/recordings";

type Variables = { user: User; profile: any };

function buildApp() {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "requesting-user" } as User);
    c.set("profile", { role: "agent" });
    await next();
  });
  app.route("/", telefunRecordings);
  return app;
}

describe("POST /score/:id ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("menolak scoring session milik user lain sebelum atomic claim", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { user_id: "different-user" },
      error: null,
    });

    const response = await buildApp().request("/score/session-1", {
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("menolak ownership sebelum claim walaupun session asing sudah completed", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        user_id: "different-user",
        telefun_transport: "openai-webrtc",
        scoring_status: "completed",
        score: 8,
        voice_assessment: null,
      },
      error: null,
    });

    const response = await buildApp().request("/score/session-1", {
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
