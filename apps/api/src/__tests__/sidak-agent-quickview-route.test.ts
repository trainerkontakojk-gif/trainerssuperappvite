import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import * as sidakService from "../services/sidak-service";

const { quickviewFixture, filterScopeFixture } = vi.hoisted(() => ({
  quickviewFixture: {
    agentId: "agent-1",
    serviceType: "call",
    year: 2026,
  },
  filterScopeFixture: {
    agentIds: ["agent-1"],
    allowedFolders: [],
    allowedServices: ["call"],
    serviceTypeLocked: true,
  },
}));

vi.mock("../services/sidak-service", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../services/sidak-service")>();
  return {
    ...original,
    getAccessibleAgentIds: vi.fn().mockResolvedValue(["agent-1"]),
    getAccessibleSidakFilters: vi.fn().mockResolvedValue(filterScopeFixture),
    getSidakAgentQuickview: vi.fn().mockResolvedValue(quickviewFixture),
  };
});

import { sidakDashboard } from "../routes/sidak/dashboard";

const app = new Hono<{ Variables: { user: any; profile: any } }>();
app.use("*", async (c, next) => {
  c.set("user", { id: "test-user-id" });
  c.set("profile", { role: "leader" });
  await next();
});
app.route("/", sidakDashboard);

describe("Sidak Agent Quickview Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards the exact agent context and leader filter scope", async () => {
    const res = await app.request(
      "/agents/agent-1/quickview?year=2026&service_type=call",
    );

    expect(res.status).toBe(200);
    expect(sidakService.getSidakAgentQuickview).toHaveBeenCalledWith({
      agentId: "agent-1",
      year: 2026,
      requestedServiceType: "call",
      accessibleAgentIds: ["agent-1"],
      filterScope: expect.objectContaining({
        allowedServices: ["call"],
      }),
    });
    expect(await res.json()).toEqual({
      success: true,
      data: quickviewFixture,
    });
  });

  it("returns 403 before resolving filters or calling the service for an inaccessible agent", async () => {
    vi.mocked(sidakService.getAccessibleAgentIds).mockResolvedValueOnce([
      "agent-2",
    ]);

    const res = await app.request(
      "/agents/agent-1/quickview?year=2026&service_type=call",
    );

    expect(res.status).toBe(403);
    expect(sidakService.getAccessibleSidakFilters).not.toHaveBeenCalled();
    expect(sidakService.getSidakAgentQuickview).not.toHaveBeenCalled();
  });

  it("returns 403 before resolving filters or calling the service for an empty leader scope", async () => {
    vi.mocked(sidakService.getAccessibleAgentIds).mockResolvedValueOnce([]);

    const res = await app.request(
      "/agents/agent-1/quickview?year=2026&service_type=call",
    );

    expect(res.status).toBe(403);
    expect(sidakService.getAccessibleSidakFilters).not.toHaveBeenCalled();
    expect(sidakService.getSidakAgentQuickview).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid year", async () => {
    const res = await app.request(
      "/agents/agent-1/quickview?year=abc&service_type=call",
    );

    expect(res.status).toBe(400);
    expect(sidakService.getAccessibleAgentIds).not.toHaveBeenCalled();
    expect(sidakService.getSidakAgentQuickview).not.toHaveBeenCalled();
  });

  it("returns 400 for an unsupported service type", async () => {
    const res = await app.request(
      "/agents/agent-1/quickview?year=2026&service_type=voice",
    );

    expect(res.status).toBe(400);
    expect(sidakService.getAccessibleAgentIds).not.toHaveBeenCalled();
    expect(sidakService.getSidakAgentQuickview).not.toHaveBeenCalled();
  });

  it("returns a human-readable 404 envelope when the service cannot build the quickview", async () => {
    vi.mocked(sidakService.getSidakAgentQuickview).mockRejectedValueOnce(
      new Error("Agent tidak ditemukan."),
    );

    const res = await app.request(
      "/agents/agent-1/quickview?year=2026&service_type=call",
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Agent tidak ditemukan.",
      },
    });
  });
});
