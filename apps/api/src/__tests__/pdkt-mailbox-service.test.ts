import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    single: vi.fn().mockResolvedValue({ data: {}, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
  createAdminClient: vi.fn().mockReturnThis(),
}));

import {
  submitMailboxReply,
  submitMailboxReplyWithOutcome,
  createMailboxItem,
  softDeleteMailboxItem,
  fetchMailboxItems,
  fetchMailboxItemById,
  canDeletePdktMailboxItem,
  bulkSoftDeleteMailboxItems,
} from "../services/pdkt/mailbox-service";
import type {
  PdktMailboxReply,
  EmailMessage,
  PdktSessionConfig,
  PdktScenario,
  PdktMailboxBatch,
} from "@trainers/types";

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
    const payload: PdktMailboxReply = {
      mailboxId,
      reply: makeReply(),
      timeTaken: 60,
    };
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
    const payload: PdktMailboxReply = {
      mailboxId,
      reply: makeReply(),
      timeTaken: 60,
    };
    await expect(submitMailboxReply(client, payload)).rejects.toThrow(
      "Gagal mengirim balasan mailbox.",
    );
  });

  it("throws with default message when RPC error has no message", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST202" } as any,
      }),
    });
    const payload: PdktMailboxReply = {
      mailboxId,
      reply: makeReply(),
      timeTaken: 60,
    };
    await expect(submitMailboxReply(client, payload)).rejects.toThrow(
      "Gagal mengirim balasan mailbox.",
    );
  });

  it("throws when RPC succeeds without returning a history ID", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const payload: PdktMailboxReply = {
      mailboxId,
      reply: makeReply(),
      timeTaken: 60,
    };
    await expect(submitMailboxReply(client, payload)).rejects.toThrow(
      "Gagal mengirim balasan mailbox.",
    );
  });

  it("does not mark a concurrent retry as newly created", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({
        data: { history_id: "history-1", created: false },
        error: null,
      }),
    });

    const payload: PdktMailboxReply = {
      mailboxId,
      reply: makeReply(),
      timeTaken: 60,
    };
    await expect(
      submitMailboxReplyWithOutcome(client, payload, "user-1"),
    ).resolves.toEqual({ historyId: "history-1", created: false });
    expect(client.rpc).toHaveBeenCalledWith(
      "submit_pdkt_mailbox_reply_with_outcome",
      expect.any(Object),
    );
  });
});

describe("createMailboxItem", () => {
  const mockConfig: PdktSessionConfig = {
    scenarios: [mockScenario],
    consumerType: {
      id: "ramah",
      name: "Ramah",
      description: "Sopan",
      difficulty: "Easy",
    },
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
    expect(client.rpc).toHaveBeenCalledWith(
      "submit_pdkt_mailbox_batch",
      expect.objectContaining({
        p_client_request_id: "idemp-123",
      }),
    );
  });

  it("registers a backend-only intent for a frozen participant snapshot", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({ data: "mailbox-3", error: null }),
    });
    const { supabaseAdmin } = await import("../lib/supabase");
    const payload = {
      client_request_id: "snapshot-123",
      sender_name: "Budi Santoso",
      sender_email: "budi@mail.com",
      subject: "Pengaduan",
      snippet: "Saya mau lapor",
      scenario_snapshot: mockScenario,
      config_snapshot: mockConfig,
      inbound_email: mockInbound,
      simulationSubject: {
        type: "participant" as const,
        participantId: "123e4567-e89b-12d3-a456-426614174000",
      },
      simulationSubjectSnapshot: {
        type: "participant" as const,
        participantId: "123e4567-e89b-12d3-a456-426614174000",
        displayName: "Andi",
        batchName: "Batch 12",
        team: "Tim Alpha",
      },
    } as any;

    await expect(createMailboxItem(client, payload, "user-1")).resolves.toBe(
      "mailbox-3",
    );
    expect((supabaseAdmin as any).insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: "user-1",
        subject_name: "Andi",
        client_request_id: "snapshot-123",
      }),
    );
    expect(client.rpc).toHaveBeenCalledWith(
      "submit_pdkt_mailbox_batch_with_subject",
      expect.objectContaining({
        p_subject_snapshot_token: expect.any(String),
        p_subject_name: "Andi",
      }),
    );
  });

  it("maps the concurrent idempotency unique violation to a conflict", async () => {
    const client = buildMockClient({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message:
            'duplicate key value violates unique constraint "uq_pdkt_mailbox_canonical_client_req"',
          code: "23505",
        },
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
    await expect(createMailboxItem(client, payload)).rejects.toMatchObject({
      status: 409,
    });
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
    const err = await softDeleteMailboxItem(client, "id-1", agentActor).catch(
      (e) => e,
    );
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
    expect(
      canDeletePdktMailboxItem(
        { id: "x", role: "admin" },
        { user_id: "other" },
      ),
    ).toBe(true);
  });

  it("returns true for trainer role", () => {
    expect(
      canDeletePdktMailboxItem(
        { id: "x", role: "trainer" },
        { user_id: "other" },
      ),
    ).toBe(true);
  });

  it("returns true when actor is the creator", () => {
    expect(
      canDeletePdktMailboxItem(
        { id: "user-1", role: "agent" },
        { created_by_user_id: "user-1" },
      ),
    ).toBe(true);
  });

  it("returns false for agent who is not the creator", () => {
    expect(
      canDeletePdktMailboxItem(
        { id: "user-1", role: "agent" },
        { created_by_user_id: "user-2" },
      ),
    ).toBe(false);
  });

  it("falls back to user_id when created_by_user_id is null", () => {
    expect(
      canDeletePdktMailboxItem(
        { id: "user-1", role: "agent" },
        { created_by_user_id: null, user_id: "user-1" },
      ),
    ).toBe(true);
  });

  it("handles null role", () => {
    expect(
      canDeletePdktMailboxItem({ id: "x", role: null }, { user_id: "other" }),
    ).toBe(false);
  });
});

const INLINE_ATTACHMENT = "data:image/png;base64," + "A".repeat(2048);

function makeStoredMailboxRow(overrides: Record<string, any> = {}) {
  const inboundEmail = {
    id: "msg-1",
    from: "konsumen@test.com",
    to: "ojk@kontak157.go.id",
    subject: "Keluhan transaksi",
    body: "Mohon tindak lanjut.",
    timestamp: new Date().toISOString(),
    isAgent: false,
    attachments: [INLINE_ATTACHMENT],
  };
  const scenario = {
    id: "pinjol",
    category: "Pinjol",
    title: "Pinjol Ilegal",
    description: "Test",
    isActive: true,
    attachmentImages: [INLINE_ATTACHMENT],
  };

  return {
    id: "m-1",
    user_id: "user-1",
    created_by_user_id: "user-1",
    status: "open",
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    sender_name: "Konsumen",
    sender_email: "konsumen@test.com",
    subject: "Keluhan transaksi",
    snippet: "Mohon tindak lanjut.",
    scenario_snapshot: scenario,
    config_snapshot: { scenarios: [scenario] },
    inbound_email: inboundEmail,
    emails_thread: [inboundEmail],
    ...overrides,
  };
}

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
      limit: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "fail" } }),
    });
    await expect(fetchMailboxItems(client, agentActor)).rejects.toThrow(
      "Gagal mengambil data mailbox.",
    );
  });

  it("keeps the list payload free of inline attachment base64", async () => {
    const client = buildMockClient({
      limit: vi.fn().mockResolvedValue({
        data: [makeStoredMailboxRow()],
        error: null,
      }),
    });

    const result = await fetchMailboxItems(client, agentActor);
    const item = result[0] as any;

    expect(JSON.stringify(result)).not.toContain(INLINE_ATTACHMENT);
    expect(item).not.toHaveProperty("inbound_email");
    expect(item).not.toHaveProperty("emails_thread");
    expect(item).not.toHaveProperty("scenario_snapshot");
    expect(item).not.toHaveProperty("config_snapshot");
  });

  it("shrinks the stored row by every duplicated inline attachment copy", async () => {
    const storedRow = makeStoredMailboxRow();
    const client = buildMockClient({
      limit: vi.fn().mockResolvedValue({ data: [storedRow], error: null }),
    });

    const [listRow] = await fetchMailboxItems(client, agentActor);
    const storedSize = JSON.stringify(storedRow).length;
    const listSize = JSON.stringify(listRow).length;

    // inbound_email + emails_thread + scenario_snapshot + config_snapshot all
    // carry the same base64 payload; the list keeps none of them (the list row
    // only gains a small creator/permission decoration).
    expect(storedSize - listSize).toBeGreaterThanOrEqual(
      3 * INLINE_ATTACHMENT.length,
    );
    expect(listSize).toBeLessThan(storedSize / 2);
  });

  it("keeps lightweight mailbox fields and permissions intact", async () => {
    const client = buildMockClient({
      limit: vi.fn().mockResolvedValue({
        data: [makeStoredMailboxRow()],
        error: null,
      }),
    });

    const [item] = await fetchMailboxItems(client, agentActor);
    expect(item.subject).toBe("Keluhan transaksi");
    expect(item.status).toBe("open");
    expect(item.permissions).toEqual({ can_delete: true });

    const projection = client.select.mock.calls[0]?.[0];
    expect(projection).not.toBe("*");
    expect(projection).not.toContain("scenario_snapshot");
    expect(projection).not.toContain("config_snapshot");
    expect(projection).not.toContain("emails_thread");
    expect(projection).not.toContain("inbound_email");
  });
});

describe("fetchMailboxItemById", () => {
  it("returns the full row including inline attachments", async () => {
    const client = buildMockClient({
      maybeSingle: vi.fn().mockResolvedValue({
        data: makeStoredMailboxRow(),
        error: null,
      }),
    });

    const item = (await fetchMailboxItemById(client, agentActor, "m-1")) as any;

    expect(item.id).toBe("m-1");
    expect(item.inbound_email.attachments).toEqual([INLINE_ATTACHMENT]);
    expect(item.permissions).toEqual({ can_delete: true });
  });

  it("returns null when the item is missing", async () => {
    const client = buildMockClient({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    await expect(
      fetchMailboxItemById(client, agentActor, "missing"),
    ).resolves.toBeNull();
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
      in: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "DB error" } }),
    });
    await expect(
      bulkSoftDeleteMailboxItems(client, ["id-1"], agentActor),
    ).rejects.toThrow("Gagal mengambil data email untuk dihapus.");
  });

  it("reports individual item failures for unauthorized items", async () => {
    const client = buildMockClient({
      in: vi.fn().mockResolvedValue({
        data: [
          {
            id: "id-1",
            user_id: "other-user",
            created_by_user_id: "other-user",
          },
        ],
        error: null,
      }),
    });
    const result = await bulkSoftDeleteMailboxItems(
      client,
      ["id-1"],
      agentActor,
    );
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(1);
    expect(result.errors[0]).toContain("tidak diizinkan");
  });

  it("partially succeeds when some items are deletable", async () => {
    const client = buildMockClient({
      in: vi.fn().mockResolvedValue({
        data: [
          { id: "my-item", user_id: "user-1", created_by_user_id: "user-1" },
          {
            id: "other-item",
            user_id: "other-user",
            created_by_user_id: "other-user",
          },
        ],
        error: null,
      }),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const result = await bulkSoftDeleteMailboxItems(
      client,
      ["my-item", "other-item"],
      agentActor,
    );
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(1);
  });
});
