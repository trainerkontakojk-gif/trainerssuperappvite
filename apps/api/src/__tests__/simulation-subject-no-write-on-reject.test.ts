import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { User } from "@supabase/supabase-js";

const { mockPersist, mockSearch, mockGetPesertaById, mockUserClient } =
  vi.hoisted(() => ({
    mockPersist: vi.fn(),
    mockSearch: vi.fn(),
    mockGetPesertaById: vi.fn(),
    mockUserClient: { from: vi.fn() },
  }));

vi.mock("../lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/supabase")>();
  return { ...actual, createUserClient: () => mockUserClient };
});

vi.mock("../services/ketik-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/ketik-service")>();
  return { ...actual, persistSession: mockPersist, saveSettings: vi.fn() };
});

vi.mock("../services/profiler-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/profiler-service")>();
  return {
    ...actual,
    getAccessiblePesertaIds: vi.fn().mockResolvedValue(null),
    getPesertaById: mockGetPesertaById,
    searchPesertaOptions: mockSearch,
  };
});

import { ketik } from "../routes/ketik";

function buildApp(role = "agent") {
  const app = new Hono<{ Variables: { user: User; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role, full_name: "Agent" });
    await next();
  });
  app.route("/", ketik);
  return app;
}

const baseHistory = {
  scenarioTitle: "Pinjol Ilegal",
  consumerName: "Budi",
  consumerPhone: "081",
  consumerCity: "Jakarta",
  messages: [
    {
      id: "m1",
      sender: "agent",
      text: "halo",
      timestamp: "2026-09-09T00:00:00.000Z",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPersist.mockResolvedValue({ id: "s1" });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        nama: "Andi",
        batch_name: "Batch 12",
        tim: "Tim Alpha",
      },
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mockUserClient.from.mockReset().mockReturnValue(query);
});

describe("rejected participant runs no write", () => {
  it("agent participant denied without persisting", async () => {
    const res = await buildApp("agent").request("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...baseHistory,
        simulationSubject: {
          type: "participant",
          participantId: "123e4567-e89b-12d3-a456-426614174000",
        },
      }),
    });
    expect(res.status).toBe(403);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("resolves participant through the request-scoped user client", async () => {
    const participantId = "123e4567-e89b-12d3-a456-426614174000";
    const res = await buildApp("admin").request("/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer request-token",
      },
      body: JSON.stringify({
        ...baseHistory,
        simulationSubject: { type: "participant", participantId },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockUserClient.from).toHaveBeenCalledWith("profiler_peserta");
  });

  it("invalid UUID rejected without persisting", async () => {
    const res = await buildApp("admin").request("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...baseHistory,
        simulationSubject: { type: "participant", participantId: "bad" },
      }),
    });
    expect(res.status).toBe(400);
    expect(mockPersist).not.toHaveBeenCalled();
  });
});
