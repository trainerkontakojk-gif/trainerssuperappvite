import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let tableResults: Record<string, any> = {};

function buildQuery(onAwait: () => any) {
  const q = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: any) => resolve(onAwait());
        return () => q;
      },
    },
  );
  return q;
}

// Track which table was queried to return different results per table
vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      return buildQuery(() => {
        const result = tableResults[table] ?? { data: [], error: null };
        return result;
      });
    }),
  },
  createAdminClient: vi.fn(),
}));

import * as profilerService from "../services/profiler-service";

describe("getAccessiblePesertaIds", () => {
  beforeEach(() => {
    tableResults = {};
  });

  it("returns null for admin role", async () => {
    const result = await profilerService.getAccessiblePesertaIds(
      "user-1",
      "admin",
    );
    expect(result).toBeNull();
  });

  it("returns null for trainer role", async () => {
    const result = await profilerService.getAccessiblePesertaIds(
      "user-1",
      "trainer",
    );
    expect(result).toBeNull();
  });

  it("returns empty for unknown role", async () => {
    const result = await profilerService.getAccessiblePesertaIds(
      "user-1",
      "unknown",
    );
    expect(result).toEqual([]);
  });

  describe("agent role", () => {
    it("returns peserta id when agent has linked peserta", async () => {
      tableResults["profiler_peserta"] = {
        data: { id: "peserta-1" },
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "agent",
      );
      expect(result).toEqual(["peserta-1"]);
    });

    it("returns empty when agent has no linked peserta", async () => {
      tableResults["profiler_peserta"] = {
        data: null,
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "agent",
      );
      expect(result).toEqual([]);
    });
  });

  describe("leader role", () => {
    let scopeSnapshotSpy: any;

    beforeEach(async () => {
      const leaderAccessService = await import(
        "../services/leader-access-service"
      );
      scopeSnapshotSpy = vi
        .spyOn(leaderAccessService, "getLeaderScopeSnapshot")
        .mockResolvedValue({
          requestIds: [],
          pesertaIds: [],
          batchNames: [],
          tims: [],
          serviceTypes: [],
        });
    });

    afterEach(() => {
      scopeSnapshotSpy?.mockRestore();
    });

    it("returns empty array when snapshot has no pesertaIds", async () => {
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual([]);
    });

    it("returns pesertaIds from snapshot", async () => {
      scopeSnapshotSpy.mockResolvedValue({
        requestIds: ["req-1"],
        pesertaIds: ["peserta-1", "peserta-2"],
        batchNames: [],
        tims: [],
        serviceTypes: [],
      });
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual(["peserta-1", "peserta-2"]);
    });

    it("returns empty when snapshot pesertaIds is empty", async () => {
      scopeSnapshotSpy.mockResolvedValue({
        requestIds: ["req-1"],
        pesertaIds: [],
        batchNames: ["Batch A"],
        tims: ["Tim A"],
        serviceTypes: ["call"],
      });
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual([]);
    });

    it("calls getLeaderScopeSnapshot with ktp module", async () => {
      await profilerService.getAccessiblePesertaIds("user-1", "leader");
      expect(scopeSnapshotSpy).toHaveBeenCalledWith("user-1", "ktp");
    });

    it("keeps leader scope consumers working when snapshot comes pre-expanded from RPC", async () => {
      scopeSnapshotSpy.mockResolvedValue({
        requestIds: ["req-1"],
        pesertaIds: ["p1", "p2"],
        batchNames: ["Batch A"],
        tims: ["Tim A"],
        serviceTypes: ["call"],
      });

      const result = await profilerService.getAccessiblePesertaIds(
        "leader-user",
        "leader",
      );

      expect(result).toEqual(["p1", "p2"]);
    });
  });
});

describe("getLeaderAccessStatus", () => {
  beforeEach(() => {
    tableResults = {};
  });

  it("returns none for both ktp and sidak when no requests exist", async () => {
    tableResults["leader_access_requests"] = {
      data: [],
      error: null,
    };

    const { getLeaderAccessStatus } = await import(
      "../services/admin-service"
    );
    const result = await getLeaderAccessStatus("user-1");
    expect(result.ktp.status).toBe("none");
    expect(result.sidak.status).toBe("none");
    expect(result.ktp.created_at).toBeNull();
    expect(result.sidak.created_at).toBeNull();
  });

  it("returns pending status correctly", async () => {
    tableResults["leader_access_requests"] = {
      data: [
        { id: "req-1", module: "ktp", status: "pending", created_at: "2025-01-01" },
        { id: "req-2", module: "sidak", status: "pending", created_at: "2025-01-02" },
      ],
      error: null,
    };

    const { getLeaderAccessStatus } = await import(
      "../services/admin-service"
    );
    const result = await getLeaderAccessStatus("user-1");
    expect(result.ktp.status).toBe("pending");
    expect(result.ktp.created_at).toBe("2025-01-01");
    expect(result.sidak.status).toBe("pending");
    expect(result.sidak.created_at).toBe("2025-01-02");
  });

  it("all module covers both ktp and sidak", async () => {
    tableResults["leader_access_requests"] = {
      data: [
        { id: "req-1", module: "all", status: "approved", created_at: "2025-01-01" },
      ],
      error: null,
    };

    const { getLeaderAccessStatus } = await import(
      "../services/admin-service"
    );
    const result = await getLeaderAccessStatus("user-1");
    expect(result.ktp.status).toBe("approved");
    expect(result.sidak.status).toBe("approved");
    expect(result.ktp.created_at).toBe("2025-01-01");
    expect(result.sidak.created_at).toBe("2025-01-01");
  });

  it("handles mixed status: ktp approved, sidak none", async () => {
    tableResults["leader_access_requests"] = {
      data: [
        { id: "req-1", module: "ktp", status: "approved", created_at: "2025-01-01" },
      ],
      error: null,
    };

    const { getLeaderAccessStatus } = await import(
      "../services/admin-service"
    );
    const result = await getLeaderAccessStatus("user-1");
    expect(result.ktp.status).toBe("approved");
    expect(result.sidak.status).toBe("none");
  });
});
