import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./env.js", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  },
}));

import {
  createTelefunWebRtcDb,
  updateWebRtcSessionWithClient,
} from "./db.js";

const sessionId = "session-1";
const userId = "user-1";
const updates = {
  status: "completed" as const,
  messages: [],
  duration_seconds: 42,
};

type UpdateResult = {
  data: { id: string; status: string } | null;
  error: { message: string } | null;
};

type CurrentResult = {
  data: { id: string; status: string } | null;
  error: { message: string } | null;
};

function makeClient(
  result: UpdateResult,
  current: CurrentResult = { data: null, error: null },
) {
  const updateMaybeSingle = vi.fn(async () => result);
  const currentMaybeSingle = vi.fn(async () => current);
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }));
  const statusFilter = vi.fn(() => ({ select: updateSelect }));
  const ownerFilter = vi.fn(() => ({ eq: statusFilter, select: updateSelect }));
  const sessionFilter = vi.fn(() => ({ eq: ownerFilter }));
  const update = vi.fn(() => ({ eq: sessionFilter }));
  const currentSelect = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: currentMaybeSingle })),
    })),
  }));
  const client = {
    from: vi.fn(() => ({ update, select: currentSelect })),
  };

  return {
    client,
    maybeSingle: updateMaybeSingle,
    currentMaybeSingle,
    select: updateSelect,
    currentSelect,
    ownerFilter,
    statusFilter,
    sessionFilter,
    update,
  };
}

describe("updateWebRtcSessionWithClient", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("filters by session and owner, selects the returned id, and resolves for a matching row", async () => {
    const {
      client,
      maybeSingle,
      select,
      ownerFilter,
      statusFilter,
      sessionFilter,
      update,
    } = makeClient({
      data: { id: sessionId, status: "completed" },
      error: null,
    });

    await expect(
      updateWebRtcSessionWithClient(client, sessionId, userId, updates),
    ).resolves.toBeUndefined();

    expect(client.from).toHaveBeenCalledWith("telefun_history");
    expect(update).toHaveBeenCalledWith(updates);
    expect(sessionFilter).toHaveBeenCalledWith("id", sessionId);
    expect(ownerFilter).toHaveBeenCalledWith("user_id", userId);
    expect(statusFilter).toHaveBeenCalledWith("status", "active");
    expect(select).toHaveBeenCalledWith("id, status");
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it("rejects a database error", async () => {
    const { client } = makeClient({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(
      updateWebRtcSessionWithClient(client, sessionId, userId, updates),
    ).rejects.toThrow("WebRTC session persistence failed");
  });

  it("treats an already completed owned row as an idempotent no-op", async () => {
    const { client, currentMaybeSingle } = makeClient(
      { data: null, error: null },
      { data: { id: sessionId, status: "completed" }, error: null },
    );

    await expect(
      updateWebRtcSessionWithClient(client, sessionId, userId, updates),
    ).resolves.toBeUndefined();
    expect(currentMaybeSingle).toHaveBeenCalledOnce();
  });

  it("treats an already failed owned row as an idempotent no-op", async () => {
    const { client } = makeClient(
      { data: null, error: null },
      { data: { id: sessionId, status: "failed" }, error: null },
    );

    await expect(
      updateWebRtcSessionWithClient(client, sessionId, userId, {
        ...updates,
        status: "failed",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a missing or non-terminal row after a zero-row update", async () => {
    const { client } = makeClient(
      { data: null, error: null },
      { data: { id: sessionId, status: "active" }, error: null },
    );

    await expect(
      updateWebRtcSessionWithClient(client, sessionId, userId, updates),
    ).rejects.toThrow("WebRTC session persistence failed");
  });

  it("rejects a returned row with a mismatched id", async () => {
    const { client } = makeClient({
      data: { id: "other-session", status: "completed" },
      error: null,
    });

    await expect(
      updateWebRtcSessionWithClient(client, sessionId, userId, updates),
    ).rejects.toThrow("WebRTC session persistence failed");
  });
});

describe("TelefunWebRtcDb RPC wrapper", () => {
  const attemptId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
  const userId = "019f45e3-5fac-7cd2-afeb-8069c2f81400";
  const sessionId = "019f45e3-5fac-7cd2-afeb-8069c2f81401";
  const finalizationKey = "019f45e3-5fac-7cd2-afeb-8069c2f81402";

  it("calls the claim RPC with named arguments and maps its durable IDs", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          claimed: true,
          attempt_id: attemptId,
          finalization_key: finalizationKey,
          usage_request_id: `telefun-webrtc:${attemptId}`,
          state: "claimed",
          reason: "claimed",
        },
      ],
      error: null,
    }));
    const db = createTelefunWebRtcDb({ rpc, from: vi.fn() });

    await expect(
      db.claimAttempt({
        sessionId,
        userId,
        attemptId,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
      }),
    ).resolves.toEqual({
      claimed: true,
      attemptId,
      finalizationKey,
      usageRequestId: `telefun-webrtc:${attemptId}`,
      state: "claimed",
      reason: "claimed",
    });
    expect(rpc).toHaveBeenCalledWith("claim_telefun_realtime_attempt", {
      p_session_id: sessionId,
      p_user_id: userId,
      p_attempt_id: attemptId,
      p_model_id: "gpt-realtime-2.1",
      p_transport: "openai-webrtc",
    });
  });

  it("preserves a business rejection row when the claim RPC returns nullable IDs", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          claimed: false,
          attempt_id: null,
          finalization_key: null,
          usage_request_id: null,
          state: null,
          reason: "session_rejected",
        },
      ],
      error: null,
    }));
    const db = createTelefunWebRtcDb({ rpc, from: vi.fn() });

    await expect(
      db.claimAttempt({
        sessionId,
        userId,
        attemptId,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
      }),
    ).resolves.toMatchObject({
      claimed: false,
      attemptId,
      reason: "session_rejected",
    });
  });

  it("maps the owner-bound no-attempt failure RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ applied: true, terminal: true, reason: "failed_without_attempt" }],
      error: null,
    }));
    const db = createTelefunWebRtcDb({ rpc, from: vi.fn() });

    await expect(db.failSessionWithoutAttempt!(sessionId, userId)).resolves.toEqual({
      applied: true,
      terminal: true,
      reason: "failed_without_attempt",
    });
    expect(rpc).toHaveBeenCalledWith(
      "fail_telefun_realtime_session_without_attempt",
      { p_session_id: sessionId, p_user_id: userId },
    );
  });

  it("does not leak the Supabase error when an RPC is unavailable", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: "PGRST500", message: "secret database details" },
    }));
    const db = createTelefunWebRtcDb({ rpc, from: vi.fn() });

    const error = await db
      .markSidebandConnected(attemptId, userId)
      .catch((value: unknown) => value);

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain("durable");
    expect(String(error)).not.toContain("secret database details");
  });
});
