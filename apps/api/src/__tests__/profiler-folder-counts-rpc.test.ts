import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
    rpc: (...args: any[]) => rpcMock(...args),
  },
  createAdminClient: vi.fn(),
}));

vi.mock("../services/leader-access-service", () => ({
  getLeaderScopeSnapshot: vi.fn(),
}));

import { getFolderCounts } from "../services/profiler-service";

describe("getFolderCounts RPC", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls get_profiler_folder_counts with null scope when accessibleIds is omitted", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { batch_name: "Batch A", peserta_count: 7 },
        { batch_name: "Batch B", peserta_count: "11" },
      ],
      error: null,
    });

    const result = await getFolderCounts();

    expect(rpcMock).toHaveBeenCalledWith("get_profiler_folder_counts", {
      p_accessible_ids: null,
    });
    expect(result).toEqual({
      "Batch A": 7,
      "Batch B": 11,
    });
  });

  it("short-circuits to empty object when accessibleIds is an empty array", async () => {
    const result = await getFolderCounts([]);

    expect(result).toEqual({});
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("passes scoped IDs through to the RPC", async () => {
    rpcMock.mockResolvedValue({
      data: [{ batch_name: "Scoped Batch", peserta_count: 3 }],
      error: null,
    });

    const result = await getFolderCounts(["id-1", "id-2"]);

    expect(rpcMock).toHaveBeenCalledWith("get_profiler_folder_counts", {
      p_accessible_ids: ["id-1", "id-2"],
    });
    expect(result).toEqual({ "Scoped Batch": 3 });
  });

  it("throws when the RPC fails", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "rpc failed" },
    });

    await expect(getFolderCounts()).rejects.toThrow("rpc failed");
  });
});
