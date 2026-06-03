import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const mockRpc = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

function buildMockClient() {
  const m: any = {
    rpc: mockRpc,
    from: vi.fn(() => m),
    select: vi.fn(() => m),
    eq: vi.fn(() => m),
    order: vi.fn(() => ({ data: [], error: null })),
    in: vi.fn(() => ({ data: [], error: null })),
    single: mockSingle,
    insert: vi.fn(() => m),
    delete: vi.fn(() => m),
    update: vi.fn(() => m),
    neq: vi.fn(() => m),
    or: vi.fn(() => m),
    maybeSingle: mockMaybeSingle,
  };
  return m;
}

const mockSupabaseAdmin = buildMockClient();

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => mockSupabaseAdmin,
  createUserClient: (_token: string) => buildMockClient(),
  supabaseAdmin: mockSupabaseAdmin,
}));

vi.mock("../middleware/role", () => ({
  requireRole: (...roles: string[]) => {
    return async (c: any, next: any) => {
      const profile = c.get("profile");
      if (!profile || !roles.includes(profile.role)) {
        return c.json(
          {
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied." },
          },
          403,
        );
      }
      await next();
    };
  },
}));

vi.mock("../middleware/rateLimit", () => ({
  aiRateLimitMiddleware: async (c: any, next: any) => await next(),
}));

vi.mock("../lib/pdkt-settings", () => ({
  readPdktSettings: (raw: any) => raw || {},
  writePdktSettings: (existing: any, settings: any) => ({
    ...existing,
    ...settings,
  }),
}));

let app: Hono<{ Variables: { user: any; profile: any } }>;

async function createAuthenticatedApp(role = "trainer") {
  const { pdkt: pdktRoute } = await import("../routes/pdkt");
  app = new Hono<{ Variables: { user: any; profile: any } }>().basePath("/api");
  app.use("/v1/*", async (c, next) => {
    c.set("user", {
      id: "test-user-id",
      email: "test@example.com",
      role: role,
    });
    c.set("profile", { id: "prof-1", role, email: "test@example.com" });
    await next();
  });
  app.route("/v1/pdkt", pdktRoute);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockRpc.mockResolvedValue({ data: "history-123", error: null });
});

afterEach(() => {
  vi.resetModules();
});

describe("PDKT Reply Route E2E", () => {
  describe("POST /mailbox/reply", () => {
    it("sends reply successfully and returns historyId", async () => {
      await createAuthenticatedApp("trainer");
      const res = await app.request("/api/v1/pdkt/mailbox/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          mailboxId: "00000000-0000-0000-0000-000000000001",
          reply: {
            id: "reply-1",
            from: "cc@ojk.go.id",
            to: "user@test.com",
            subject: "Re: Test",
            body: "Terima kasih.",
            timestamp: new Date().toISOString(),
            isAgent: true,
          },
          timeTaken: 60,
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.historyId).toBe("history-123");
      expect(mockRpc).toHaveBeenCalledWith("submit_pdkt_mailbox_reply", {
        p_mailbox_id: "00000000-0000-0000-0000-000000000001",
        p_agent_reply: expect.objectContaining({ isAgent: true }),
        p_time_taken: 60,
      });
    });

    it("returns 403 when role is not allowed", async () => {
      await createAuthenticatedApp("qa");
      const res = await app.request("/api/v1/pdkt/mailbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId: "00000000-0000-0000-0000-000000000001",
          reply: { id: "x", from: "a", to: "b", subject: "", body: "", timestamp: "", isAgent: true },
          timeTaken: 1,
        }),
      });

      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid mailboxId", async () => {
      await createAuthenticatedApp("trainer");
      const res = await app.request("/api/v1/pdkt/mailbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId: "not-a-uuid",
          reply: { id: "x", from: "a", to: "b", subject: "", body: "", timestamp: "", isAgent: true },
          timeTaken: 1,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when reply is missing fields", async () => {
      await createAuthenticatedApp("trainer");
      const res = await app.request("/api/v1/pdkt/mailbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId: "00000000-0000-0000-0000-000000000001",
          reply: { id: "x" }, // missing fields
          timeTaken: 1,
        }),
      });

      expect(res.status).toBe(400);
    });

    it("returns error when RPC fails", async () => {
      await createAuthenticatedApp("trainer");
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "function not found", code: "PGRST202" },
      });

      const res = await app.request("/api/v1/pdkt/mailbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mailboxId: "00000000-0000-0000-0000-000000000001",
          reply: {
            id: "reply-1",
            from: "cc@ojk.go.id",
            to: "user@test.com",
            subject: "Re: Test",
            body: "Oke.",
            timestamp: new Date().toISOString(),
            isAgent: true,
          },
          timeTaken: 30,
        }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
    });
  });

  describe("GET /mailbox", () => {
    it("returns mailbox items for authenticated user", async () => {
      await createAuthenticatedApp("trainer");

      const res = await app.request("/api/v1/pdkt/mailbox", {
        headers: { Authorization: "Bearer test-token" },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("GET /history/eval/:id", () => {
    it("returns evaluation status for completed eval", async () => {
      await createAuthenticatedApp("trainer");
      mockSingle.mockResolvedValueOnce({
        data: {
          evaluation_status: "completed",
          evaluation: { score: 85, feedback: "Good." },
          evaluation_error: null,
        },
        error: null,
      });

      const res = await app.request(
        "/api/v1/pdkt/history/eval/00000000-0000-0000-0000-000000000001",
        { headers: { Authorization: "Bearer test-token" } },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.evaluation_status).toBe("completed");
    });
  });

  describe("POST /history/retry-eval", () => {
    it("starts retry evaluation", async () => {
      await createAuthenticatedApp("trainer");
      mockMaybeSingle.mockResolvedValueOnce({
        data: { id: "hist-1" },
        error: null,
      });

      const res = await app.request("/api/v1/pdkt/history/retry-eval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId: "hist-1" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
