import { describe, it, expect, vi, beforeEach } from "vitest";

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

let pendingResolve: () => any = () => ({ data: [], error: null });

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
    pendingResolve = () => ({ data: [], error: null });
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
    it("returns empty array when no approved request exists", async () => {
      tableResults["leader_access_requests"] = {
        data: [],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual([]);
    });

    it("returns empty array when request exists but no group links", async () => {
      tableResults["leader_access_requests"] = {
        data: [{ id: "req-1" }],
        error: null,
      };
      tableResults["leader_access_request_groups"] = {
        data: [],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual([]);
    });

    it("returns empty array when group links exist but no active items", async () => {
      tableResults["leader_access_requests"] = {
        data: [{ id: "req-1" }],
        error: null,
      };
      tableResults["leader_access_request_groups"] = {
        data: [{ access_group_id: "group-1" }],
        error: null,
      };
      tableResults["access_group_items"] = {
        data: [],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual([]);
    });

    it("resolves direct peserta_id items", async () => {
      tableResults["leader_access_requests"] = {
        data: [{ id: "req-1" }],
        error: null,
      };
      tableResults["leader_access_request_groups"] = {
        data: [{ access_group_id: "group-1" }],
        error: null,
      };
      tableResults["access_group_items"] = {
        data: [
          { field_name: "peserta_id", field_value: "peserta-1" },
          { field_name: "peserta_id", field_value: "peserta-2" },
        ],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual(["peserta-1", "peserta-2"]);
    });

    it("resolves batch_name items", async () => {
      tableResults["leader_access_requests"] = {
        data: [{ id: "req-1" }],
        error: null,
      };
      tableResults["leader_access_request_groups"] = {
        data: [{ access_group_id: "group-1" }],
        error: null,
      };
      tableResults["access_group_items"] = {
        data: [
          { field_name: "batch_name", field_value: "Batch A" },
        ],
        error: null,
      };
      tableResults["profiler_peserta"] = {
        data: [{ id: "p1" }, { id: "p2" }],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual(["p1", "p2"]);
    });

    it("resolves tim items", async () => {
      tableResults["leader_access_requests"] = {
        data: [{ id: "req-1" }],
        error: null,
      };
      tableResults["leader_access_request_groups"] = {
        data: [{ access_group_id: "group-1" }],
        error: null,
      };
      tableResults["access_group_items"] = {
        data: [
          { field_name: "tim", field_value: "Tim A" },
        ],
        error: null,
      };
      tableResults["profiler_peserta"] = {
        data: [{ id: "p1" }],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual(["p1"]);
    });

    it("skips service_type items (not relevant for KTP)", async () => {
      tableResults["leader_access_requests"] = {
        data: [{ id: "req-1" }],
        error: null,
      };
      tableResults["leader_access_request_groups"] = {
        data: [{ access_group_id: "group-1" }],
        error: null,
      };
      tableResults["access_group_items"] = {
        data: [
          { field_name: "peserta_id", field_value: "p-direct" },
          { field_name: "service_type", field_value: "call" },
        ],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual(["p-direct"]);
    });

    it("combines all scope types into unique IDs", async () => {
      tableResults["leader_access_requests"] = {
        data: [{ id: "req-1" }],
        error: null,
      };
      tableResults["leader_access_request_groups"] = {
        data: [{ access_group_id: "group-1" }],
        error: null,
      };
      tableResults["access_group_items"] = {
        data: [
          { field_name: "peserta_id", field_value: "direct-1" },
          { field_name: "batch_name", field_value: "Batch A" },
          { field_name: "tim", field_value: "Tim A" },
        ],
        error: null,
      };
      // Mock different results for batch vs tim queries
      tableResults["profiler_peserta"] = {
        data: [{ id: "batch-p1" }, { id: "tim-p1" }],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      // deduplication: both batch and tim queries resolve, plus direct
      expect(result).toEqual(["direct-1", "batch-p1", "tim-p1"]);
    });

    it("requests module all counts as ktp", async () => {
      tableResults["leader_access_requests"] = {
        data: [{ id: "req-1" }],
        error: null,
      };
      tableResults["leader_access_request_groups"] = {
        data: [],
        error: null,
      };
      const result = await profilerService.getAccessiblePesertaIds(
        "user-1",
        "leader",
      );
      expect(result).toEqual([]);
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
