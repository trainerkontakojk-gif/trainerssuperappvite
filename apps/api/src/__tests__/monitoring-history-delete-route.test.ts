import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock the service
vi.mock("../services/monitoring-history-delete-service", () => ({
  deleteMonitoringHistory: vi.fn(),
  MonitoringHistoryDeleteError: class extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import * as deleteService from "../services/monitoring-history-delete-service";
import { ai } from "../routes/ai";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (authHeader === "Bearer admin-token") {
      c.set("user", { id: "admin1" });
      c.set("profile", { role: "admin" });
    } else if (authHeader === "Bearer trainer-token") {
      c.set("user", { id: "trainer1" });
      c.set("profile", { role: "trainer" });
    } else if (authHeader === "Bearer agent-token") {
      c.set("user", { id: "agent1" });
      c.set("profile", { role: "agent" });
    }
    await next();
  });
  app.route("/", ai);
  return app;
}

describe("Monitoring History Delete Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for unauthorized role (agent)", async () => {
    const app = buildApp();
    const res = await app.request(
      "/monitoring/history/telefun/00000000-0000-0000-0000-000000000001",
      {
        method: "DELETE",
        headers: { Authorization: "Bearer agent-token" },
      },
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for unsupported modules", async () => {
    const app = buildApp();
    const res = await app.request(
      "/monitoring/history/unknown/00000000-0000-0000-0000-000000000001",
      {
        method: "DELETE",
        headers: { Authorization: "Bearer admin-token" },
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(deleteService.deleteMonitoringHistory).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid UUID", async () => {
    const app = buildApp();
    const res = await app.request("/monitoring/history/telefun/not-a-uuid", {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toContain("ID riwayat tidak valid");
    expect(deleteService.deleteMonitoringHistory).not.toHaveBeenCalled();
  });

  it("delegates to service and returns 200 on success", async () => {
    const app = buildApp();
    const sessionId = "00000000-0000-0000-0000-000000000001";
    vi.mocked(deleteService.deleteMonitoringHistory).mockResolvedValue({
      module: "telefun",
      id: sessionId,
      source: "telefun_history",
      deleted: true,
    });

    const res = await app.request(`/monitoring/history/telefun/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteService.deleteMonitoringHistory).toHaveBeenCalledWith(
      "telefun",
      sessionId,
    );
  });

  it("returns 404 when service throws NOT_FOUND", async () => {
    const app = buildApp();
    const sessionId = "00000000-0000-0000-0000-000000000002";
    vi.mocked(deleteService.deleteMonitoringHistory).mockRejectedValue(
      new deleteService.MonitoringHistoryDeleteError("NOT_FOUND", "Not found"),
    );

    const res = await app.request(`/monitoring/history/ketik/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer trainer-token" },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("returns 500 when service throws DELETE_FAILED", async () => {
    const app = buildApp();
    const sessionId = "00000000-0000-0000-0000-000000000003";
    vi.mocked(deleteService.deleteMonitoringHistory).mockRejectedValue(
      new deleteService.MonitoringHistoryDeleteError("DELETE_FAILED", "Failed"),
    );

    const res = await app.request(`/monitoring/history/pdkt/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("DB_ERROR");
  });

  it("does not expose unexpected internal error messages", async () => {
    const app = buildApp();
    const sessionId = "00000000-0000-0000-0000-000000000004";
    vi.mocked(deleteService.deleteMonitoringHistory).mockRejectedValue(
      new Error("password=secret internal SQL detail"),
    );

    const res = await app.request(`/monitoring/history/pdkt/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer admin-token" },
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toEqual({
      code: "DB_ERROR",
      message: "Gagal menghapus riwayat.",
    });
  });
});
