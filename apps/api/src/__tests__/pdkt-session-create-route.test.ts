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

vi.mock("../lib/gemini", () => ({
  generateGeminiContent: vi.fn().mockResolvedValue({
    success: true,
    text: JSON.stringify({
      subject: "Test Subject",
      body: Array.from(
        { length: 5 },
        () =>
          "Ini adalah email penipuan yang sangat panjang dan detil untuk memenuhi kebijakan isi. ".repeat(
            9,
          ),
      ).join("\n\n"),
    }),
  }),
}));

vi.mock("../services/pdkt/image-generation", () => ({
  generatePdktScenarioImages: vi.fn().mockResolvedValue({
    success: true,
    images: ["data:image/png;base64,image-mock"],
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
  mockRpc.mockResolvedValue({ data: "new-batch-uuid", error: null });
});

afterEach(() => {
  vi.resetModules();
});

describe("PDKT Unified Session Create Route", () => {
  it.each([
    "/api/v1/pdkt/generate-template",
    "/api/v1/pdkt/session/init",
    "/api/v1/pdkt/session/create",
  ])("rejects draft prompt fields above the prompt-specific request limit at %s", async (path) => {
    await createAuthenticatedApp("trainer");
    const res = await app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioDraft: {
          id: "pinjol",
          category: "Pinjol",
          title: "x".repeat(501),
          description: "Keluhan",
          isActive: true,
        },
        consumerTypeId: "marah",
        identity: {
          name: "Budi",
          email: "budi@mail.com",
          city: "Jakarta",
          bodyName: "Budi",
        },
      }),
    });

    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("orchestrates identity, email generation, image generation, and batch persistence atomically", async () => {
    await createAuthenticatedApp("trainer");
    const res = await app.request("/api/v1/pdkt/session/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioId: "pinjol",
        consumerTypeId: "marah",
        identity: {
          name: "Budi",
          email: "budi@mail.com",
          city: "Jakarta",
          bodyName: "Budi",
        },
        enableImageGeneration: true,
        selectedModel: "gemini-3.1-flash-lite",
        resolvedConsumerNameMentionPattern: "none",
        writingStyleMode: "training",
        client_request_id: "req-xyz-123",
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("new-batch-uuid");
    expect(json.data.message).toBeDefined();
    expect(json.data.message.attachments).toContain("data:image/png;base64,image-mock");
    expect(json.data.message.attachmentSource).toBe("ai");

    expect(mockRpc).toHaveBeenCalledWith("submit_pdkt_mailbox_batch", {
      p_client_request_id: "req-xyz-123",
      p_sender_name: "Budi",
      p_sender_email: "budi@mail.com",
      p_subject: expect.any(String),
      p_snippet: expect.any(String),
      p_scenario_snapshot: expect.any(Object),
      p_config_snapshot: expect.any(Object),
      p_inbound_email: expect.any(Object),
    });
  });

  it("handles custom body name in the payload correctly", async () => {
    await createAuthenticatedApp("trainer");
    const res = await app.request("/api/v1/pdkt/session/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioId: "pinjol",
        consumerTypeId: "marah",
        identity: {
          name: "Black Cat",
          email: "blackcat@mail.com",
          city: "Jakarta",
          bodyName: "Susanto",
        },
        enableImageGeneration: false,
        selectedModel: "gemini-3.1-flash-lite",
        resolvedConsumerNameMentionPattern: "upfront",
        writingStyleMode: "training",
        client_request_id: "req-xyz-456",
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.message.from).toBe("blackcat@mail.com");
    expect(json.data.message.body).toContain("Susanto");
    expect(json.data.message.body).not.toContain("Black Cat");
  });

  it("handles resolvedConsumerNameMentionPattern 'middle' correctly", async () => {
    await createAuthenticatedApp("trainer");
    const res = await app.request("/api/v1/pdkt/session/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioId: "pinjol",
        consumerTypeId: "marah",
        identity: {
          name: "Black Cat",
          email: "blackcat@mail.com",
          city: "Jakarta",
          bodyName: "Susanto",
        },
        enableImageGeneration: false,
        selectedModel: "gemini-3.1-flash-lite",
        resolvedConsumerNameMentionPattern: "middle",
        writingStyleMode: "training",
        client_request_id: "req-xyz-789",
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.message.body).toContain("Susanto");
    expect(json.data.message.body).not.toContain("Black Cat");
  });

  it("propagates per-scenario recipient targets into the created mailbox message", async () => {
    await createAuthenticatedApp("trainer");
    const res = await app.request("/api/v1/pdkt/session/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioDraft: {
          id: "pinjol",
          category: "Pinjol",
          title: "Pinjol Ilegal",
          description: "Konsumen diteror pinjol ilegal.",
          isActive: true,
          recipientMode: "multiple",
          recipientEmails: ["alpha@test.com", "beta@test.com"],
          alwaysUseSampleEmail: true,
          sampleEmailTemplate: {
            subject: "Template",
            body: "Template body " + "kata ".repeat(600),
          },
        },
        consumerTypeId: "marah",
        identity: {
          name: "Budi",
          email: "budi@mail.com",
          city: "Jakarta",
          bodyName: "Budi",
        },
        enableImageGeneration: false,
        selectedModel: "gemini-3.1-flash-lite",
        resolvedConsumerNameMentionPattern: "none",
        writingStyleMode: "training",
        client_request_id: "req-xyz-999",
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.message.to).toBe(
      "konsumen@ojk.go.id, alpha@test.com, beta@test.com",
    );
    expect(json.data.message.recipientContext).toEqual({
      primaryRecipientType: "reported_company",
      primaryRecipientAddress: "alpha@test.com",
      ccRecipients: ["konsumen@ojk.go.id", "beta@test.com"],
      replyIntent: "reply_to_company_with_ojk_cc",
    });

    expect(mockRpc).toHaveBeenCalledWith(
      "submit_pdkt_mailbox_batch",
      expect.objectContaining({
        p_config_snapshot: expect.objectContaining({
          recipientContext: expect.objectContaining({
            primaryRecipientType: "reported_company",
            replyIntent: "reply_to_company_with_ojk_cc",
          }),
        }),
      }),
    );
  });

  it("keeps OJK as primary while preserving custom recipients as CC", async () => {
    await createAuthenticatedApp("trainer");
    const res = await app.request("/api/v1/pdkt/session/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioDraft: {
          id: "pinjol",
          category: "Pinjol",
          title: "Pinjol Ilegal",
          description: "Konsumen diteror pinjol ilegal.",
          isActive: true,
          primaryRecipientType: "ojk",
          recipientMode: "single",
          recipientEmails: ["company@test.com"],
          alwaysUseSampleEmail: true,
          sampleEmailTemplate: {
            subject: "Template",
            body: "Template body " + "kata ".repeat(600),
          },
        },
        consumerTypeId: "marah",
        identity: {
          name: "Budi",
          email: "budi@mail.com",
          city: "Jakarta",
          bodyName: "Budi",
        },
        enableImageGeneration: false,
        selectedModel: "gemini-3.1-flash-lite",
        resolvedConsumerNameMentionPattern: "none",
        writingStyleMode: "training",
        client_request_id: "req-ojk-primary-001",
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.message.to).toContain("konsumen@ojk.go.id");
    expect(json.data.message.recipientContext.primaryRecipientAddress).toBe(
      "konsumen@ojk.go.id",
    );
    expect(json.data.message.recipientContext.ccRecipients).toContain(
      "company@test.com",
    );
  });
});
