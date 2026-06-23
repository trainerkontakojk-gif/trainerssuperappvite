import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const maybeSingle = vi.fn();
const createSignedUrl = vi.fn();

vi.mock("../lib/supabase", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl,
      })),
    },
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

type Variables = { user: User; profile: { role: string } };

function buildApp(params: { userId: string; role: string }) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: params.userId } as User);
    c.set("profile", { role: params.role });
    await next();
  });
  app.route("/", telefunRecordings);
  return app;
}

describe("GET /recording/:id access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({
      data: {
        user_id: "session-owner",
        recording_path: "session-owner/session-1/full_call.webm",
        agent_recording_path: "session-owner/session-1/agent_only.webm",
      },
      error: null,
    });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed.webm" },
      error: null,
    });
  });

  it("allows admin to sign another user's recording", async () => {
    const response = await buildApp({
      userId: "admin-user",
      role: "admin",
    }).request("/recording/session-1");

    expect(response.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "session-owner/session-1/full_call.webm",
      3600,
    );
  });

  it("allows trainer to sign another user's recording", async () => {
    const response = await buildApp({
      userId: "trainer-user",
      role: "trainer",
    }).request("/recording/session-1");

    expect(response.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "session-owner/session-1/full_call.webm",
      3600,
    );
  });

  it("allows a session owner to sign their own recording", async () => {
    const response = await buildApp({
      userId: "session-owner",
      role: "agent",
    }).request("/recording/session-1");

    expect(response.status).toBe(200);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "session-owner/session-1/full_call.webm",
      3600,
    );
  });

  it("rejects QA cross-user recording access", async () => {
    const response = await buildApp({
      userId: "qa-user",
      role: "qa",
    }).request("/recording/session-1");

    expect(response.status).toBe(403);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects leader cross-user recording access", async () => {
    const response = await buildApp({
      userId: "leader-user",
      role: "leader",
    }).request("/recording/session-1");

    expect(response.status).toBe(403);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
