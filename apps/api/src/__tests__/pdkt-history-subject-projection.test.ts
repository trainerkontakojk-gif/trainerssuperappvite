import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));

vi.mock("../../services/pdkt-service", () => ({
  getScenarios: vi.fn(),
  getConsumerTypes: vi.fn(),
  generateRandomIdentity: vi.fn(),
  resolvePdktGenerationConfig: vi.fn(),
  generateScenarioEmailTemplate: vi.fn(),
  initializeEmailSession: vi.fn(),
}));

vi.mock("../../middleware/role", () => ({
  requireRole: () => async (c: any, next: any) => await next(),
}));

import { history } from "../routes/pdkt/history";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" });
    c.set("profile", { role: "admin" });
    (c as any).set("supabaseUserClient", { from: mockFrom });
    await next();
  });
  app.route("/", history);
  return app;
}

// getUserClient reads token? Check route-utils: it likely uses c.get userClient or creates from header.
// Simplify: mock getUserClient via route-utils mock
vi.mock("../routes/pdkt/route-utils", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../routes/pdkt/route-utils")>();
  return {
    ...actual,
    getUserClient: () => ({ from: mockFrom }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pdkt history projection", () => {
  it("maps snake_case attribution to camelCase snapshot", async () => {
    const row = {
      id: "h1",
      user_id: "user-1",
      timestamp: "2026-09-09T00:00:00Z",
      config: {},
      emails: [],
      evaluation: null,
      evaluation_status: "completed",
      evaluation_error: null,
      time_taken: 10,
      simulation_subject_type: "participant",
      simulation_subject_peserta_id: VALID_UUID,
      simulation_subject_name: "Andi",
      simulation_subject_batch_name: "Batch 12",
      simulation_subject_team: "Tim Alpha",
    };
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: [row], error: null }));
    mockFrom.mockReturnValue(chain);

    const res = await buildApp().request("/");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0].simulationSubject).toEqual({
      type: "participant",
      participantId: VALID_UUID,
      displayName: "Andi",
      batchName: "Batch 12",
      team: "Tim Alpha",
    });
  });

  it("maps legacy null row to unknown", async () => {
    const row = {
      id: "h2",
      user_id: "user-1",
      timestamp: "2026-09-09T00:00:00Z",
      config: {},
      emails: [],
      evaluation: null,
      evaluation_status: "completed",
      simulation_subject_type: null,
      simulation_subject_peserta_id: null,
      simulation_subject_name: null,
      simulation_subject_batch_name: null,
      simulation_subject_team: null,
    };
    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.order = vi.fn(() => Promise.resolve({ data: [row], error: null }));
    mockFrom.mockReturnValue(chain);

    const res = await buildApp().request("/");
    const json = await res.json();
    expect(json.data[0].simulationSubject.type).toBe("unknown");
  });
});
