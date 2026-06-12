import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  createAdminClient: vi.fn().mockReturnThis(),
}));

import {
  submitMailboxReply,
  createMailboxItem,
  softDeleteMailboxItem,
  fetchMailboxItems,
  canDeletePdktMailboxItem,
  bulkSoftDeleteMailboxItems,
} from "../services/pdkt/mailbox-service";
import type { PdktMailboxReply, EmailMessage, PdktSessionConfig, PdktScenario, PdktMailboxBatch } from "@trainers/types";

function buildMockClient(overrides: Record<string, any> = {}) {
  const m: any = {
    rpc: vi.fn().mockResolvedValue({ data: "history-1", error: null }),
    from: vi.fn(() => m),
    select: vi.fn(() => m),
    eq: vi.fn(() => m),
    in: vi.fn(() => m),
    order: vi.fn(() => m),
    limit: vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null }),
    neq: vi.fn(() => m),
    or: vi.fn(() => m),
    insert: vi.fn(() => m),
    update: vi.fn(() => m),
    delete: vi.fn(() => m),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  return m;
}

const agentActor = { id: "user-1", role: "agent" as const };
const trainerActor = { id: "user-2", role: "trainer" as const };

function makeReply(): EmailMessage {
  return {
    id: "reply-1",
    from: "cc@ojk.go.id",
    to: "user@test.com",
    subject: "Re: Test",
    body: "Terima kasih.",
    timestamp: new Date().toISOString(),
    isAgent: true,
  };
}

const mockScenario: PdktScenario = {
  id: "pinjol",
  category: "Pinjol",
  title: "Pinjol Ilegal",
  description: "Test",
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitMailboxReply", () => {
  const mailboxId = "00000000-0000-0000-0000-000000000001";

  it("calls submit_pdkt_mailbox_reply RPC with correct payload", async () => {
    const client = buildMockClient();
    const payload: PdktMailboxReply = { mailboxId, reply: makeReply(), timeTaken: 60 };
    const result = await submitMailboxReply(client, payload);
    expect(result).toBe("history-1");
    expect(client.rpc).toHaveBeenCalledWith("submit_pdkt_mailbox_reply", {
      p_mailbox_id: mailboxId,
      p_agent_reply: payload.reply,
      p_time_taken: 60,
    });
  });

  it("throws with human-friendly error when RPC returns error", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "function not found", code: "PGRST202" },
      }),
    });
    const payload: PdktMailboxReply = { mailboxId, reply: makeReply(), timeTaken: 60 };
    await expect(submitMailboxReply(client, payload)).rejects.toThrow(
      "function not found",
    );
  });

  it("throws with default message when RPC error has no message", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST202" } as any,
      }),
    });
    const payload: PdktMailboxReply = { mailboxId, reply: makeReply(), timeTaken: 60 };
    await expect(submitMailboxReply(client, payload)).rejects.toThrow(
      "Gagal mengirim balasan mailbox.",
    );
  });

  it("throws when RPC succeeds without returning a history ID", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const payload: PdktMailboxReply = { mailboxId, reply: makeReply(), timeTaken: 60 };
    await expect(submitMailboxReply(client, payload)).rejects.toThrow(
      "Gagal mengirim balasan mailbox.",
    );
  });
});

describe("createMailboxItem", () => {
  const mockConfig: PdktSessionConfig = {
    scenarios: [mockScenario],
    consumerType: { id: "ramah", name: "Ramah", description: "Sopan", difficulty: "Easy" },
    identity: { name: "Budi", email: "budi@mail.com", city: "Jakarta", bodyName: "Budi" },
    enableImageGeneration: false,
    selectedModel: "gemini-3.1-flash-lite",
    resolvedConsumerNameMentionPattern: "none",
    writingStyleMode: "training",
  };

  const mockInbound: EmailMessage = {
    id: "email-1",
    from: "budi@mail.com",
    to: "konsumen@ojk.go.id",
    subject: "Pengaduan",
    body: "Saya mau lapor pinjol.",
    timestamp: new Date().toISOString(),
    isAgent: false,
  };

  it("calls submit_pdkt_mailbox_batch RPC with correct payload", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({ data: "mailbox-1", error: null }),
    });
    const payload: PdktMailboxBatch = {
      sender_name: "Budi Santoso",
      sender_email: "budi@mail.com",
      subject: "Pengaduan",
      snippet: "Saya mau lapor",
      scenario_snapshot: mockScenario,
      config_snapshot: mockConfig,
      inbound_email: mockInbound,
    };
    const result = await createMailboxItem(client, payload);
    expect(result).toBe("mailbox-1");
    expect(client.rpc).toHaveBeenCalledWith("submit_pdkt_mailbox_batch", {
      p_client_request_id: null,
      p_sender_name: "Budi Santoso",
      p_sender_email: "budi@mail.com",
      p_subject: "Pengaduan",
      p_snippet: "Saya mau lapor",
      p_scenario_snapshot: mockScenario,
      p_config_snapshot: mockConfig,
      p_inbound_email: mockInbound,
    });
  });

  it("passes client_request_id for idempotency", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({ data: "mailbox-2", error: null }),
    });
    const payload: PdktMailboxBatch = {
      client_request_id: "idemp-123",
      sender_name: "Budi Santoso",
      sender_email: "budi@mail.com",
      subject: "Pengaduan",
      snippet: "Saya mau lapor",
      scenario_snapshot: mockScenario,
      config_snapshot: mockConfig,
      inbound_email: mockInbound,
    };
    await createMailboxItem(client, payload);
    expect(client.rpc).toHaveBeenCalledWith("submit_pdkt_mailbox_batch", expect.objectContaining({
      p_client_request_id: "idemp-123",
    }));
  });

  it("throws error when RPC call fails", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "duplicate key", code: "23505" },
      }),
    });
    const payload: PdktMailboxBatch = {
      sender_name: "Budi Santoso",
      sender_email: "budi@mail.com",
      subject: "Pengaduan",
      snippet: "Saya mau lapor",
      scenario_snapshot: mockScenario,
      config_snapshot: mockConfig,
      inbound_email: mockInbound,
    };
    await expect(createMailboxItem(client, payload)).rejects.toThrow("duplicate key");
  });
});

describe("softDeleteMailboxItem", () => {
  it("throws when item not found", async () => {
    const client = buildMockClient({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    await expect(
      softDeleteMailboxItem(client, "nonexistent-id", agentActor),
    ).rejects.toThrow("Item mailbox tidak ditemukan.");
  });

  it("throws 403 when actor lacks permission", async () => {
    const client = buildMockClient({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { user_id: "other-user", created_by_user_id: "other-user" },
        error: null,
      }),
    });
    const err = await softDeleteMailboxItem(client, "id-1", agentActor).catch(e => e);
    expect(err.message).toContain("hanya dapat menghapus");
    expect(err.status).toBe(403);
  });

  it("deletes successfully when permission is granted", async () => {
    const client = buildMockClient({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { user_id: "user-1", created_by_user_id: "user-1" },
        error: null,
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    await expect(
      softDeleteMailboxItem(client, "id-1", agentActor),
    ).resolves.toBeUndefined();
    expect(client.rpc).toHaveBeenCalledWith("soft_delete_pdkt_mailbox_item", {
      p_mailbox_id: "id-1",
    });
  });

  it("allows manager role (trainer) to delete any item", async () => {
    const client = buildMockClient({
      maybeSingle: vi.fn().mockResolvedValue({
        data: { user_id: "other-user", created_by_user_id: "other-user" },
        error: null,
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    await expect(
      softDeleteMailboxItem(client, "id-1", trainerActor),
    ).resolves.toBeUndefined();
  });
});

describe("canDeletePdktMailboxItem", () => {
  it("returns true for admin role", () => {
    expect(canDeletePdktMailboxItem(
      { id: "x", role: "admin" },
      { user_id: "other" },
    )).toBe(true);
  });

  it("returns true for trainer role", () => {
    expect(canDeletePdktMailboxItem(
      { id: "x", role: "trainer" },
      { user_id: "other" },
    )).toBe(true);
  });

  it("returns true when actor is the creator", () => {
    expect(canDeletePdktMailboxItem(
      { id: "user-1", role: "agent" },
      { created_by_user_id: "user-1" },
    )).toBe(true);
  });

  it("returns false for agent who is not the creator", () => {
    expect(canDeletePdktMailboxItem(
      { id: "user-1", role: "agent" },
      { created_by_user_id: "user-2" },
    )).toBe(false);
  });

  it("falls back to user_id when created_by_user_id is null", () => {
    expect(canDeletePdktMailboxItem(
      { id: "user-1", role: "agent" },
      { created_by_user_id: null, user_id: "user-1" },
    )).toBe(true);
  });

  it("handles null role", () => {
    expect(canDeletePdktMailboxItem(
      { id: "x", role: null },
      { user_id: "other" },
    )).toBe(false);
  });
});

describe("fetchMailboxItems", () => {
  it("returns empty array when no data", async () => {
    const client = buildMockClient({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const result = await fetchMailboxItems(client, agentActor);
    expect(result).toEqual([]);
  });

  it("throws on error", async () => {
    const client = buildMockClient({
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: "fail" } }),
    });
    await expect(fetchMailboxItems(client, agentActor)).rejects.toThrow("fail");
  });
});

describe("bulkSoftDeleteMailboxItems", () => {
  it("returns empty result when no IDs provided", async () => {
    const client = buildMockClient();
    const result = await bulkSoftDeleteMailboxItems(client, [], agentActor);
    expect(result).toEqual({ successCount: 0, failureCount: 0, errors: [] });
  });

  it("throws when items fetch fails", async () => {
    const client = buildMockClient({
      in: vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
    });
    await expect(
      bulkSoftDeleteMailboxItems(client, ["id-1"], agentActor),
    ).rejects.toThrow("Gagal mengambil data email untuk dihapus.");
  });

  it("reports individual item failures for unauthorized items", async () => {
    const client = buildMockClient({
      in: vi.fn().mockResolvedValue({
        data: [{ id: "id-1", user_id: "other-user", created_by_user_id: "other-user" }],
        error: null,
      }),
    });
    const result = await bulkSoftDeleteMailboxItems(client, ["id-1"], agentActor);
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(result.errors[0]).toContain("tidak diizinkan");
  });

  it("partially succeeds when some items are deletable", async () => {
    const client = buildMockClient({
      in: vi.fn().mockResolvedValue({
        data: [
          { id: "my-item", user_id: "user-1", created_by_user_id: "user-1" },
          { id: "other-item", user_id: "other-user", created_by_user_id: "other-user" },
        ],
        error: null,
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const result = await bulkSoftDeleteMailboxItems(client, ["my-item", "other-item"], agentActor);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
  });
});
