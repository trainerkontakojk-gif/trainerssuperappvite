import { Hono } from "hono";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KETIK_SETTINGS, KETIK_PROMPT_LIMITS } from "@trainers/types";

const { mockPersistSession, mockSaveSettings } = vi.hoisted(() => ({
  mockPersistSession: vi.fn(),
  mockSaveSettings: vi.fn(),
}));

vi.mock("../services/ketik-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/ketik-service")>();
  return {
    ...actual,
    persistSession: mockPersistSession,
    saveSettings: mockSaveSettings,
  };
});

import { ketik } from "../routes/ketik";

type Variables = { user: User; profile: { role: string } };

const validMessage = {
  id: "message-1",
  sender: "agent" as const,
  text: "Halo, ada yang bisa saya bantu?",
  timestamp: "2026-07-11T00:00:00.000Z",
  status: "sent" as const,
  pacingMeta: {
    mode: "realistic" as const,
    band: "normal" as const,
    plannedDelayMs: 1000,
    timerClamped: false,
  },
};

const validHistory = {
  scenarioTitle: "Pinjol Ilegal",
  consumerName: "Budi",
  consumerPhone: "08123456789",
  consumerCity: "Jakarta",
  messages: [validMessage],
  simulationDuration: 5,
};

function buildApp() {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role: "agent" });
    await next();
  });
  app.route("/", ketik);
  return app;
}

async function requestJson(
  app: Hono<{ Variables: Variables }>,
  path: string,
  method: "PUT" | "POST",
  body: unknown,
  extraHeaders?: Record<string, string>,
) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

describe("KETIK settings and history input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveSettings.mockResolvedValue(undefined);
    mockPersistSession.mockResolvedValue({ id: "session-1" });
  });

  it("accepts the default settings and persists the validated payload", async () => {
    const response = await requestJson(
      buildApp(),
      "/settings",
      "PUT",
      DEFAULT_KETIK_SETTINGS,
    );

    expect(response.status).toBe(200);
    // Route meneruskan expectedVersion (dari header x-settings-version) —
    // absent header berarti undefined (optimistic concurrency opsional).
    expect(mockSaveSettings).toHaveBeenCalledWith(
      "user-1",
      DEFAULT_KETIK_SETTINGS,
      undefined,
    );
  });

  it("passes x-settings-version through for optimistic concurrency", async () => {
    mockSaveSettings.mockResolvedValue("v2");

    const response = await requestJson(
      buildApp(),
      "/settings",
      "PUT",
      DEFAULT_KETIK_SETTINGS,
      { "x-settings-version": "v1" },
    );

    expect(response.status).toBe(200);
    expect(mockSaveSettings).toHaveBeenCalledWith(
      "user-1",
      DEFAULT_KETIK_SETTINGS,
      "v1",
    );
  });

  it("maps settings conflict errors to 409", async () => {
    mockSaveSettings.mockRejectedValue({
      code: "SETTINGS_CONFLICT",
      message: "stale version",
    });

    const response = await requestJson(
      buildApp(),
      "/settings",
      "PUT",
      DEFAULT_KETIK_SETTINGS,
    );

    expect(response.status).toBe(409);
  });

  it.each([
    ["primitive payload", "settings"],
    ["empty object", {}],
    ["empty consumer types", { ...DEFAULT_KETIK_SETTINGS, consumerTypes: [] }],
    [
      "duration below minimum",
      { ...DEFAULT_KETIK_SETTINGS, simulationDuration: 0 },
    ],
    [
      "duration above maximum",
      { ...DEFAULT_KETIK_SETTINGS, simulationDuration: 61 },
    ],
    [
      "invalid pacing mode",
      { ...DEFAULT_KETIK_SETTINGS, responsePacingMode: "instant" },
    ],
    [
      "scenario description above prompt limit",
      {
        ...DEFAULT_KETIK_SETTINGS,
        scenarios: [
          {
            ...DEFAULT_KETIK_SETTINGS.scenarios[0],
            description: "x".repeat(12_001),
          },
        ],
      },
    ],
    [
      "scenario script above prompt limit",
      {
        ...DEFAULT_KETIK_SETTINGS,
        scenarios: [
          {
            ...DEFAULT_KETIK_SETTINGS.scenarios[0],
            script: "x".repeat(20_001),
          },
        ],
      },
    ],
    [
      "consumer description above prompt limit",
      {
        ...DEFAULT_KETIK_SETTINGS,
        consumerTypes: [
          {
            ...DEFAULT_KETIK_SETTINGS.consumerTypes[0],
            description: "x".repeat(4_001),
          },
        ],
      },
    ],
  ])("rejects %s without saving", async (_label, payload) => {
    const response = await requestJson(buildApp(), "/settings", "PUT", payload);

    expect(response.status).toBe(400);
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it("accepts a valid history message and persists the session", async () => {
    const response = await requestJson(
      buildApp(),
      "/history",
      "POST",
      validHistory,
    );

    expect(response.status).toBe(200);
    expect(mockPersistSession).toHaveBeenCalledWith("user-1", validHistory);
  });

  it("accepts a history message at the 20,000-character limit and persists", async () => {
    const historyWithLongMessage = {
      ...validHistory,
      messages: [
        {
          ...validMessage,
          text: "x".repeat(KETIK_PROMPT_LIMITS.chatMessageText),
        },
      ],
    };
    const response = await requestJson(
      buildApp(),
      "/history",
      "POST",
      historyWithLongMessage,
    );

    expect(response.status).toBe(200);
    expect(mockPersistSession).toHaveBeenCalledWith(
      "user-1",
      historyWithLongMessage,
    );
  });

  it.each([
    ["message without text", { ...validMessage, text: undefined }],
    ["invalid sender", { ...validMessage, sender: "customer" }],
    ["non-string timestamp", { ...validMessage, timestamp: 123 }],
    [
      "invalid pacing metadata",
      { ...validMessage, pacingMeta: { mode: "unknown" } },
    ],
    [
      "message above prompt limit",
      {
        ...validMessage,
        text: "x".repeat(KETIK_PROMPT_LIMITS.chatMessageText + 1),
      },
    ],
  ])("rejects %s without persisting history", async (_label, message) => {
    const response = await requestJson(buildApp(), "/history", "POST", {
      ...validHistory,
      messages: [message],
    });

    expect(response.status).toBe(400);
    expect(mockPersistSession).not.toHaveBeenCalled();
  });
});
