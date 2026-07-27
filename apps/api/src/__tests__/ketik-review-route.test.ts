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

vi.mock("../lib/openai", () => ({
  generateOpenAIContent: vi.fn(),
}));

vi.mock("../middleware/rateLimit", () => ({
  aiRateLimitMiddleware: async (_c: any, next: any) => await next(),
}));

vi.mock("../services/ketik-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ketik-service")>();
  return {
    ...actual,
    claimAndProcessKetikReviewJob: vi.fn(),
    triggerKetikAIReview: vi.fn(),
    getKetikReviewStatus: vi.fn(),
  };
});

import * as ketikService from "../services/ketik-service";
import { ketik } from "../routes/ketik";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (authHeader === "Bearer test-token") {
      c.set("user", { id: "user1" });
      c.set("profile", { role: "trainer" });
    } else if (authHeader === "Bearer admin-token") {
      c.set("user", { id: "admin1" });
      c.set("profile", { role: "admin" });
    } else if (authHeader === "Bearer qa-token") {
      c.set("user", { id: "qa1" });
      c.set("profile", { role: "qa" });
    } else if (authHeader === "Bearer leader-token") {
      c.set("user", { id: "leader1" });
      c.set("profile", { role: "leader" });
    } else if (authHeader === "Bearer agent-token") {
      c.set("user", { id: "agent1" });
      c.set("profile", { role: "agent" });
    }
    await next();
  });
  app.route("/", ketik);
  return app;
}

describe("KETIK Review Route E2E", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReset();
    mockCreateAdminClient.mockReturnValue({ from: mockFrom });
  });

  describe("POST /review", () => {
    it("returns 403 without auth (requireRole guard)", async () => {
      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(403);
      const body = await res.json() as any;
      expect(body.success).toBe(false);
    });

    it("returns 403 for agent role", async () => {
      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer agent-token",
        },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(403);
    });

    it("returns 404 when session not found", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "Not found" },
            }),
            update: vi.fn().mockReturnThis(),
          };
        }
        return mockDefaultQuery();
      });

      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns processing when active lease exists", async () => {
      const futureDate = new Date(Date.now() + 300_000).toISOString();
      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "sess1",
                user_id: "user1",
                review_status: "pending",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                status: "processing",
                lease_owner: "worker1",
                lease_expires_at: futureDate,
                attempt_count: 1,
                error_message: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            or: vi.fn().mockReturnThis(),
          };
        }
        return mockDefaultQuery();
      });

      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("processing");
    });

    it("reclaims expired processing lease and processes", async () => {
      const pastDate = new Date(Date.now() - 300_000).toISOString();
      (ketikService.claimAndProcessKetikReviewJob as any).mockResolvedValue({
        status: "completed",
      });
      (ketikService.triggerKetikAIReview as any).mockResolvedValue({
        status: "queued",
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "sess1",
                user_id: "user1",
                review_status: "pending",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                status: "processing",
                lease_owner: "stale-worker",
                lease_expires_at: pastDate,
                attempt_count: 1,
                error_message: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            or: vi.fn().mockReturnThis(),
          };
        }
        return mockDefaultQuery();
      });

      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("completed");
    });

    it("retries failed job and processes", async () => {
      (ketikService.claimAndProcessKetikReviewJob as any).mockResolvedValue({
        status: "completed",
      });
      (ketikService.triggerKetikAIReview as any).mockResolvedValue({
        status: "queued",
      });

      let jobUpdatedToQueued = false;
      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "sess1",
                user_id: "user1",
                review_status: "failed",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                status: "failed",
                lease_owner: null,
                lease_expires_at: null,
                attempt_count: 1,
                error_message: "Previous AI error",
              },
              error: null,
            }),
            update: vi.fn().mockImplementation((data: any) => {
              if (data?.status === "queued") jobUpdatedToQueued = true;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            or: vi.fn().mockReturnThis(),
          };
        }
        return mockDefaultQuery();
      });

      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("completed");
      expect(jobUpdatedToQueued).toBe(true);
    });

    it("returns failed state with error message when processing fails", async () => {
      (ketikService.claimAndProcessKetikReviewJob as any).mockResolvedValue({
        status: "failed",
        error: "AI response JSON tidak valid atau format tidak sesuai.",
      });
      (ketikService.triggerKetikAIReview as any).mockResolvedValue({
        status: "queued",
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "sess1",
                user_id: "user1",
                review_status: "pending",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                status: "queued",
                lease_owner: null,
                lease_expires_at: null,
                attempt_count: 0,
                error_message: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            or: vi.fn().mockReturnThis(),
          };
        }
        return mockDefaultQuery();
      });

      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("failed");
      expect(body.data.error).toBeDefined();
    });

    it("returns scores when processing completes synchronously", async () => {
      const mockScores = {
        final: 85,
        empathy: 80,
        probing: 75,
        typo: 90,
        compliance: 85,
      };
      (ketikService.claimAndProcessKetikReviewJob as any).mockResolvedValue({
        status: "completed",
        scores: mockScores,
      });
      (ketikService.triggerKetikAIReview as any).mockResolvedValue({
        status: "queued",
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "sess1",
                user_id: "user1",
                review_status: "pending",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                status: "queued",
                lease_owner: null,
                lease_expires_at: null,
                attempt_count: 0,
                error_message: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            or: vi.fn().mockReturnThis(),
          };
        }
        return mockDefaultQuery();
      });

      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("completed");
      expect(body.data.scores).toBeDefined();
      expect(body.data.scores.final).toBe(85);
      expect(body.data.scores.empathy).toBe(80);
      expect(body.data.scores.probing).toBe(75);
      expect(body.data.scores.typo).toBe(90);
      expect(body.data.scores.compliance).toBe(85);
    });

    it("returns completed status for completed job without processing", async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === "ketik_history") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: "sess1",
                user_id: "user1",
                review_status: "pending",
              },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === "ketik_review_jobs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                status: "completed",
                lease_owner: null,
                lease_expires_at: null,
                attempt_count: 1,
                error_message: null,
              },
              error: null,
            }),
            update: vi.fn().mockReturnThis(),
            upsert: vi.fn().mockResolvedValue({ error: null }),
            or: vi.fn().mockReturnThis(),
          };
        }
        return mockDefaultQuery();
      });

      const app = buildApp();
      const res = await app.request("/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({ sessionId: "sess1" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("completed");
      expect(ketikService.claimAndProcessKetikReviewJob).not.toHaveBeenCalled();
    });
  });

  describe("GET /review/status/:sessionId", () => {
    it("returns processing status from polling", async () => {
      (ketikService.getKetikReviewStatus as any).mockResolvedValue({
        status: "processing",
        resultReady: false,
        scores: null,
      });

      const app = buildApp();
      const res = await app.request("/review/status/sess1", {
        headers: { Authorization: "Bearer test-token" },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("processing");
    });

    it("returns failed status with errorMessage from polling", async () => {
      (ketikService.getKetikReviewStatus as any).mockResolvedValue({
        status: "failed",
        resultReady: false,
        scores: null,
        errorMessage: "AI response JSON tidak valid atau format tidak sesuai.",
      });

      const app = buildApp();
      const res = await app.request("/review/status/sess1", {
        headers: { Authorization: "Bearer test-token" },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("failed");
      expect(body.data.errorMessage).toBeDefined();
    });
  });
});

function mockDefaultQuery() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
}
