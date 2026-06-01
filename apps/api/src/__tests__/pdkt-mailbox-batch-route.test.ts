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
    single: mockSingle,
    insert: vi.fn(() => m),
    delete: vi.fn(() => m),
    update: vi.fn(() => m),
    neq: vi.fn(() => m),
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
  mockRpc.mockResolvedValue({ data: "new-batch-uuid", error: null });
});

afterEach(() => {
  vi.resetModules();
});

describe("PDKT Mailbox Batch Route E2E", () => {
  describe("POST /mailbox/batch", () => {
    it("creates batch successfully and returns new id", async () => {
      await createAuthenticatedApp("trainer");
      const res = await app.request("/api/v1/pdkt/mailbox/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        },
        body: JSON.stringify({
          client_request_id: "req-abc",
          sender_name: "Test Sender",
          sender_email: "test@sender.com",
          subject: "Welcome",
          snippet: "This is a test snippet",
          scenario_snapshot: { id: "s1", title: "T", description: "D", objective: "O", required_points: [], category: "Sales", isActive: true },
          config_snapshot: { scenarios: [], consumerType: { id: "c1", name: "C", description: "D", behaviors: [], traits: [] }, writingStyleMode: "training", identity: { name: "N", email: "E", city: "C", bodyName: "N" }, selectedModel: "gpt" },
          inbound_email: { id: "e1", from: "a@b.com", to: "c@d.com", subject: "S", body: "Test body", timestamp: new Date().toISOString(), isAgent: false },
        }),
      });

      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toBe("new-batch-uuid");
      expect(mockRpc).toHaveBeenCalledWith("submit_pdkt_mailbox_batch", {
        p_client_request_id: "req-abc",
        p_sender_name: "Test Sender",
        p_sender_email: "test@sender.com",
        p_subject: "Welcome",
        p_snippet: "This is a test snippet",
        p_scenario_snapshot: expect.any(Object),
        p_config_snapshot: expect.any(Object),
        p_inbound_email: expect.any(Object),
      });
    });

    it("sanitizes 'function not found' error but logs it", async () => {
      await createAuthenticatedApp("trainer");
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "function submit_pdkt_mailbox_batch does not exist", code: "42883" },
      });

      const res = await app.request("/api/v1/pdkt/mailbox/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_request_id: "req-abc",
          sender_name: "Test Sender",
          sender_email: "test@sender.com",
          subject: "Welcome",
          snippet: "Snippet",
          scenario_snapshot: { id: "s1", title: "T", description: "D", objective: "O", required_points: [], category: "Sales", isActive: true },
          config_snapshot: { scenarios: [], consumerType: { id: "c1", name: "C", description: "D", behaviors: [], traits: [] }, writingStyleMode: "training", identity: { name: "N", email: "E", city: "C", bodyName: "N" }, selectedModel: "gpt" },
          inbound_email: { id: "e1", from: "a@b.com", to: "c@d.com", subject: "S", body: "Test body", timestamp: new Date().toISOString(), isAgent: false },
        }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.message).toBe("function submit_pdkt_mailbox_batch does not exist");
      
      expect(consoleSpy).toHaveBeenCalledWith("[PDKT /mailbox/batch] Raw error:", expect.any(Object));
      consoleSpy.mockRestore();
    });

    it("sanitizes token expired/jwt errors", async () => {
      await createAuthenticatedApp("trainer");
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "JWT expired", code: "PGRST301" },
      });

      const res = await app.request("/api/v1/pdkt/mailbox/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_request_id: "req-abc",
          sender_name: "Test Sender",
          sender_email: "test@sender.com",
          subject: "Welcome",
          snippet: "Snippet",
          scenario_snapshot: { id: "s1", title: "T", description: "D", objective: "O", required_points: [], category: "Sales", isActive: true },
          config_snapshot: { scenarios: [], consumerType: { id: "c1", name: "C", description: "D", behaviors: [], traits: [] }, writingStyleMode: "training", identity: { name: "N", email: "E", city: "C", bodyName: "N" }, selectedModel: "gpt" },
          inbound_email: { id: "e1", from: "a@b.com", to: "c@d.com", subject: "S", body: "Test body", timestamp: new Date().toISOString(), isAgent: false },
        }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error.message).toBe("Sesi Anda telah berakhir. Silakan login kembali.");
    });
  });
});
