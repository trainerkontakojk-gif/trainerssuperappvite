import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const resolveAccess = vi.hoisted(() => vi.fn());
const canRead = vi.hoisted(() => vi.fn());
const getHistory = vi.hoisted(() => vi.fn());
const getDetail = vi.hoisted(() => vi.fn());

vi.mock("../services/sidak/simulation-access", () => ({
  resolveSidakSimulationAccess: resolveAccess,
  canReadSidakSimulationModule: canRead,
  SidakSimulationAccessError: class SidakSimulationAccessError extends Error {
    status = 403 as const;
    code = "FORBIDDEN" as const;
  },
}));

vi.mock("../services/sidak/agent-simulations", () => ({
  getSidakAgentSimulationHistory: getHistory,
  getSidakAgentSimulationDetail: getDetail,
  SidakSimulationDataError: class SidakSimulationDataError extends Error {},
  SidakSimulationNotFoundError: class SidakSimulationNotFoundError extends Error {},
}));

import { sidakSimulations } from "../routes/sidak/simulations";

const agentId = "123e4567-e89b-12d3-a456-426614174000";
const historyId = "123e4567-e89b-12d3-a456-426614174001";

function buildApp(role = "leader") {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "leader-1" });
    c.set("profile", { role });
    await next();
  });
  app.route("/", sidakSimulations);
  return app;
}

describe("SIDAK simulation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAccess.mockResolvedValue({
      agentId,
      role: "leader",
      modules: ["ketik", "telefun"],
      canPlayTelefunRecording: true,
    });
    canRead.mockImplementation((access, module) => access.modules.includes(module));
    getHistory.mockResolvedValue({ items: [], nextCursor: null });
    getDetail.mockResolvedValue({ module: "telefun", recording_url: null });
  });

  it("passes only approved modules to an all-module list", async () => {
    const response = await buildApp().request(
      `/agents/${agentId}/simulations?module=all`,
    );

    expect(response.status).toBe(200);
    expect(getHistory).toHaveBeenCalledWith({
      agentId,
      module: "all",
      cursor: undefined,
      allowedModules: ["ketik", "telefun"],
    });
  });

  it("rejects a module outside leader scope before reading history", async () => {
    canRead.mockReturnValue(false);

    const response = await buildApp().request(
      `/agents/${agentId}/simulations/pdkt/${historyId}`,
    );

    expect(response.status).toBe(403);
    expect(getDetail).not.toHaveBeenCalled();
  });

  it("passes scoped Telefun playback permission to the detail service", async () => {
    const response = await buildApp().request(
      `/agents/${agentId}/simulations/telefun/${historyId}`,
    );

    expect(response.status).toBe(200);
    expect(getDetail).toHaveBeenCalledWith({
      agentId,
      module: "telefun",
      historyId,
      canPlayTelefunRecording: true,
    });
  });

  it("keeps Telefun detail readable while withholding recording signing", async () => {
    resolveAccess.mockResolvedValue({
      agentId,
      role: "leader",
      modules: ["telefun"],
      canPlayTelefunRecording: false,
    });

    const response = await buildApp().request(
      `/agents/${agentId}/simulations/telefun/${historyId}`,
    );

    expect(response.status).toBe(200);
    expect(getDetail).toHaveBeenCalledWith({
      agentId,
      module: "telefun",
      historyId,
      canPlayTelefunRecording: false,
    });
  });

  it("rejects malformed IDs before resolving scope or reading data", async () => {
    const response = await buildApp().request(
      "/agents/not-an-uuid/simulations/telefun/not-an-uuid",
    );

    expect(response.status).toBe(400);
    expect(resolveAccess).not.toHaveBeenCalled();
    expect(getDetail).not.toHaveBeenCalled();
  });
});
