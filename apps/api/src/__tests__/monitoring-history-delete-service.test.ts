import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase client
const mockRpc = vi.fn();

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
  }),
}));

import {
  deleteMonitoringHistory,
  MonitoringHistoryDeleteError,
} from "../services/monitoring-history-delete-service";

describe("deleteMonitoringHistory service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls delete_monitoring_history with the module and id", async () => {
    const sessionId = "00000000-0000-0000-0000-000000000001";
    mockRpc.mockResolvedValue({
      data: {
        module: "telefun",
        id: sessionId,
        source: "telefun_history",
        deleted: true,
      },
      error: null,
    });

    const result = await deleteMonitoringHistory("telefun", sessionId);

    expect(mockRpc).toHaveBeenCalledWith("delete_monitoring_history", {
      p_module: "telefun",
      p_id: sessionId,
    });
    expect(result).toEqual({
      module: "telefun",
      id: sessionId,
      source: "telefun_history",
      deleted: true,
    });
  });

  it("maps monitoring history not found to NOT_FOUND", async () => {
    const sessionId = "00000000-0000-0000-0000-000000000002";
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "monitoring history not found" },
    });

    try {
      await deleteMonitoringHistory("ketik", sessionId);
      expect.fail("Should have thrown MonitoringHistoryDeleteError");
    } catch (error: any) {
      expect(error).toBeInstanceOf(MonitoringHistoryDeleteError);
      expect(error.code).toBe("NOT_FOUND");
      expect(error.message).toContain("tidak ditemukan");
    }
  });

  it("maps other database failures to DELETE_FAILED", async () => {
    const sessionId = "00000000-0000-0000-0000-000000000003";
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Some database error" },
    });

    try {
      await deleteMonitoringHistory("pdkt", sessionId);
      expect.fail("Should have thrown MonitoringHistoryDeleteError");
    } catch (error: any) {
      expect(error).toBeInstanceOf(MonitoringHistoryDeleteError);
      expect(error.code).toBe("DELETE_FAILED");
      expect(error.message).toContain("Gagal menghapus");
    }
  });

  it("rejects malformed successful RPC payloads", async () => {
    const sessionId = "00000000-0000-0000-0000-000000000004";
    mockRpc.mockResolvedValue({
      data: { something: "else" },
      error: null,
    });

    try {
      await deleteMonitoringHistory("telefun", sessionId);
      expect.fail("Should have thrown MonitoringHistoryDeleteError");
    } catch (error: any) {
      expect(error.code).toBe("DELETE_FAILED");
    }
  });

  it("rejects RPC payloads with an unknown source", async () => {
    const sessionId = "00000000-0000-0000-0000-000000000005";
    mockRpc.mockResolvedValue({
      data: {
        module: "telefun",
        id: sessionId,
        source: "unexpected_table",
        deleted: true,
      },
      error: null,
    });

    await expect(
      deleteMonitoringHistory("telefun", sessionId),
    ).rejects.toMatchObject({
      code: "DELETE_FAILED",
    });
  });

  it("rejects RPC payloads whose source does not match the module", async () => {
    const sessionId = "00000000-0000-0000-0000-000000000006";
    mockRpc.mockResolvedValue({
      data: {
        module: "ketik",
        id: sessionId,
        source: "results",
        deleted: true,
      },
      error: null,
    });

    await expect(
      deleteMonitoringHistory("ketik", sessionId),
    ).rejects.toMatchObject({
      code: "DELETE_FAILED",
    });
  });
});
