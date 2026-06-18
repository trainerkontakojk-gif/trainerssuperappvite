import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: (...args: any[]) => rpcMock(...args),
  },
  createAdminClient: vi.fn(),
}));

import { getLeaderScopeSnapshot } from "../services/leader-access-service";

describe("getLeaderScopeSnapshot RPC", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls the RPC with leader and module params", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          request_ids: ["req-1"],
          peserta_ids: ["p-1", "p-2"],
          batch_names: ["Batch A"],
          tims: ["Tim A"],
          service_types: ["call", "chat"],
        },
      ],
      error: null,
    });

    const result = await getLeaderScopeSnapshot("leader-1", "sidak");

    expect(rpcMock).toHaveBeenCalledWith("get_leader_scope_snapshot", {
      p_leader_user_id: "leader-1",
      p_module: "sidak",
    });
    expect(result).toEqual({
      requestIds: ["req-1"],
      pesertaIds: ["p-1", "p-2"],
      batchNames: ["Batch A"],
      tims: ["Tim A"],
      serviceTypes: ["call", "chat"],
    });
  });

  it("returns the empty snapshot when the RPC returns no rows", async () => {
    rpcMock.mockResolvedValue({
      data: [],
      error: null,
    });

    await expect(
      getLeaderScopeSnapshot("leader-1", "ktp"),
    ).resolves.toEqual({
      requestIds: [],
      pesertaIds: [],
      batchNames: [],
      tims: [],
      serviceTypes: [],
    });
  });

  it("filters invalid service types", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          request_ids: ["req-1"],
          peserta_ids: [],
          batch_names: [],
          tims: [],
          service_types: ["call", "bogus", "email"],
        },
      ],
      error: null,
    });

    const result = await getLeaderScopeSnapshot("leader-1", "sidak");

    expect(result.serviceTypes).toEqual(["call", "email"]);
  });

  it("preserves requestIds even when pesertaIds is empty", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          request_ids: ["req-9"],
          peserta_ids: [],
          batch_names: [],
          tims: [],
          service_types: [],
        },
      ],
      error: null,
    });

    const result = await getLeaderScopeSnapshot("leader-1", "sidak");

    expect(result.requestIds).toEqual(["req-9"]);
    expect(result.pesertaIds).toEqual([]);
  });

  it("throws on RPC error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "rpc failed" },
    });

    await expect(
      getLeaderScopeSnapshot("leader-1", "sidak"),
    ).rejects.toThrow("rpc failed");
  });
});
