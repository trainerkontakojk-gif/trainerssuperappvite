import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const mockRpc = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
let mockMailboxItems: any[] = [];

function buildMockClient() {
  const m: any = {
    rpc: mockRpc,
    from: vi.fn(() => m),
    select: vi.fn(() => m),
    eq: vi.fn(() => m),
    in: vi.fn(() => Promise.resolve({ data: mockMailboxItems, error: null })),
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
const mockUserClient = buildMockClient();

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => mockSupabaseAdmin,
  createUserClient: (_token: string) => mockUserClient,
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
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockMailboxItems = [];
});

afterEach(() => {
  vi.resetModules();
});

describe("PDKT Mailbox Bulk Delete Route E2E", () => {
  it("bulk deletes items successfully", async () => {
    await createAuthenticatedApp("trainer");

    mockMailboxItems = [
      { id: "00000000-0000-0000-0000-000000000001", user_id: "test-user-id", created_by_user_id: "test-user-id" },
      { id: "00000000-0000-0000-0000-000000000002", user_id: "test-user-id", created_by_user_id: "test-user-id" },
    ];

    const ids = [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ];

    const res = await app.request("/api/v1/pdkt/mailbox/batch-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({ ids }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.successCount).toBe(2);
    expect(json.data.failureCount).toBe(0);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("returns validation error for invalid UUIDs", async () => {
    await createAuthenticatedApp("trainer");

    const res = await app.request("/api/v1/pdkt/mailbox/batch-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: ["invalid-uuid"] }),
    });

    expect(res.status).toBe(400);
  });
});
