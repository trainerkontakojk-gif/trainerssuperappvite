import { describe, expect, it, vi } from "vitest";

const getAccessibleSidakFilters = vi.hoisted(() => vi.fn());

vi.mock("../services/sidak/access-scope", () => ({
  getAccessibleSidakFilters,
}));

import {
  compareSidakSimulationItems,
  decodeSidakSimulationCursor,
  encodeSidakSimulationCursor,
  type SidakSimulationCursor,
} from "../services/sidak/agent-simulations";
import {
  getSidakSimulationModuleForService,
  canReadSidakSimulationModule,
  canPlaySidakTelefunRecording,
  resolveSidakSimulationAccess,
} from "../services/sidak/simulation-access";

const cursor: SidakSimulationCursor = {
  occurredAt: "2026-09-10T10:00:00.000Z",
  module: "pdkt",
  historyId: "00000000-0000-0000-0000-000000000002",
};

describe("SIDAK agent simulation contracts", () => {
  it("round-trips an opaque cursor without losing the tie-break fields", () => {
    expect(decodeSidakSimulationCursor(encodeSidakSimulationCursor(cursor))).toEqual(
      cursor,
    );
  });

  it("orders equal timestamps by module and then session ID", () => {
    const rows = [
      { occurredAt: cursor.occurredAt, module: "telefun" as const, historyId: "b" },
      { occurredAt: cursor.occurredAt, module: "ketik" as const, historyId: "z" },
      { occurredAt: cursor.occurredAt, module: "ketik" as const, historyId: "a" },
      { occurredAt: "2026-09-11T10:00:00.000Z", module: "pdkt" as const, historyId: "new" },
    ];

    expect(rows.sort(compareSidakSimulationItems).map((row) => row.historyId)).toEqual([
      "new",
      "a",
      "z",
      "b",
    ]);
  });

  it("maps only the three SIDAK services to simulation modules", () => {
    expect(getSidakSimulationModuleForService("chat")).toBe("ketik");
    expect(getSidakSimulationModuleForService("email")).toBe("pdkt");
    expect(getSidakSimulationModuleForService("call")).toBe("telefun");
    expect(getSidakSimulationModuleForService("cso")).toBeNull();
  });

  it("lets admin and trainer read all modules and play Telefun recordings", () => {
    expect(canReadSidakSimulationModule({ role: "admin", modules: ["ketik"] }, "telefun")).toBe(true);
    expect(canReadSidakSimulationModule({ role: "trainer", modules: ["pdkt"] }, "telefun")).toBe(true);
    expect(canPlaySidakTelefunRecording({ role: "trainer", modules: ["telefun"] })).toBe(true);
  });

  it("keeps leader module and recording access bounded by the approved scope", () => {
    const access = { role: "leader", modules: ["ketik", "telefun"] as const };

    expect(canReadSidakSimulationModule(access, "ketik")).toBe(true);
    expect(canReadSidakSimulationModule(access, "pdkt")).toBe(false);
    expect(canPlaySidakTelefunRecording(access)).toBe(true);
    expect(
      canPlaySidakTelefunRecording({ role: "leader", modules: ["ketik"] }),
    ).toBe(false);
  });

  it("resolves leader service approval to modules and fails closed on empty scope", async () => {
    getAccessibleSidakFilters.mockResolvedValueOnce({
      agentIds: ["agent-1"],
      allowedFolders: [],
      allowedServices: ["chat", "email", "call"],
      serviceTypeLocked: true,
    });

    await expect(
      resolveSidakSimulationAccess({
        userId: "leader-1",
        role: "leader",
        agentId: "agent-1",
      }),
    ).resolves.toMatchObject({
      modules: ["ketik", "pdkt", "telefun"],
      canPlayTelefunRecording: true,
    });

    getAccessibleSidakFilters.mockResolvedValueOnce({
      agentIds: ["agent-1"],
      allowedFolders: [],
      allowedServices: [],
      serviceTypeLocked: false,
    });
    await expect(
      resolveSidakSimulationAccess({
        userId: "leader-1",
        role: "leader",
        agentId: "agent-1",
      }),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("returns unavailable instead of widening access when scope lookup fails", async () => {
    getAccessibleSidakFilters.mockRejectedValueOnce(new Error("rpc down"));

    await expect(
      resolveSidakSimulationAccess({
        userId: "leader-1",
        role: "leader",
        agentId: "agent-1",
      }),
    ).rejects.toMatchObject({ status: 503, code: "SCOPE_UNAVAILABLE" });
  });
});
