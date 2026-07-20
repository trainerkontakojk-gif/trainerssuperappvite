import { Hono } from "hono";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KETIK_PROMPT_LIMITS } from "@trainers/types";

const { mockGenerateConsumerResponse, mockGetScenarios, mockGetConsumerTypes } = vi.hoisted(
  () => ({
    mockGenerateConsumerResponse: vi.fn(),
    mockGetScenarios: vi.fn(),
    mockGetConsumerTypes: vi.fn(),
  }),
);

vi.mock("../services/ketik-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ketik-service")>();
  return {
    ...actual,
    generateConsumerResponse: mockGenerateConsumerResponse,
    getScenarios: mockGetScenarios,
    getConsumerTypes: mockGetConsumerTypes,
  };
});

import { ketik } from "../routes/ketik";

type Variables = { user: User; profile: { role: string } };

const validScenario = {
  id: "pinjol",
  category: "Pinjol",
  title: "Pinjol Ilegal",
  description: "Konsumen diteror oleh pinjol ilegal padahal tidak pernah meminjam.",
  isActive: true,
};

const validConsumerType = {
  id: "marah",
  name: "Marah & Emosional",
  description: "Konsumen sedang sangat kesal.",
  difficulty: "Sulit" as const,
};

const validBody = {
  scenarioId: "pinjol",
  consumerTypeId: "marah",
  identity: { name: "Budi", city: "Jakarta", phone: "08123456789" },
  selectedModel: "gemini-3.1-flash-lite",
  simulationDuration: 5,
  responsePacingMode: "realistic" as const,
  chatHistory: [],
};

function buildApp(token?: string) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    if (token === "leader-token") {
      c.set("user", { id: "leader-user" } as User);
      c.set("profile", { role: "leader" });
    } else if (token === "agent-token") {
      c.set("user", { id: "agent-user" } as User);
      c.set("profile", { role: "agent" });
    } else if (token === "guest-token") {
      c.set("user", { id: "guest-user" } as User);
      c.set("profile", { role: "guest" });
    }

    await next();
  });
  app.route("/", ketik);
  return app;
}

describe("KETIK generate route role access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetScenarios.mockReturnValue([validScenario]);
    mockGetConsumerTypes.mockReturnValue([validConsumerType]);
    mockGenerateConsumerResponse.mockResolvedValue({
      success: true,
      text: "mock-response",
    });
  });

  it("allows leader to call POST /generate", async () => {
    const response = await buildApp("leader-token").request("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer leader-token",
      },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.text).toBe("mock-response");
    expect(mockGenerateConsumerResponse).toHaveBeenCalledTimes(1);
  });

  it("still allows agent to call POST /generate", async () => {
    const response = await buildApp("agent-token").request("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer agent-token",
      },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.success).toBe(true);
    expect(body.data.text).toBe("mock-response");
    expect(mockGenerateConsumerResponse).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported roles", async () => {
    const response = await buildApp("guest-token").request("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer guest-token",
      },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(403);
    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(mockGenerateConsumerResponse).not.toHaveBeenCalled();
  });

  it("rejects missing auth", async () => {
    const response = await buildApp().request("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validBody),
    });

    expect(response.status).toBe(403);
    const body = await response.json() as any;
    expect(body.success).toBe(false);
    expect(mockGenerateConsumerResponse).not.toHaveBeenCalled();
  });

  describe("chat message text boundary (20,000 chars)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockGetScenarios.mockReturnValue([validScenario]);
      mockGetConsumerTypes.mockReturnValue([validConsumerType]);
      mockGenerateConsumerResponse.mockResolvedValue({
        success: true,
        text: "mock-response",
      });
    });

    it("accepts 20,000-character message and calls AI", async () => {
      const body = {
        ...validBody,
        chatHistory: [
          {
            id: "msg-1",
            sender: "agent" as const,
            text: "x".repeat(KETIK_PROMPT_LIMITS.chatMessageText),
            timestamp: new Date().toISOString(),
            status: "sent" as const,
          },
        ],
      };
      const response = await buildApp("leader-token").request("/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer leader-token",
        },
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(200);
      expect(mockGenerateConsumerResponse).toHaveBeenCalledTimes(1);
    });

    it("rejects 20,001-character message without calling AI", async () => {
      const body = {
        ...validBody,
        chatHistory: [
          {
            id: "msg-2",
            sender: "agent" as const,
            text: "x".repeat(KETIK_PROMPT_LIMITS.chatMessageText + 1),
            timestamp: new Date().toISOString(),
            status: "sent" as const,
          },
        ],
      };
      const response = await buildApp("leader-token").request("/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer leader-token",
        },
        body: JSON.stringify(body),
      });

      expect(response.status).toBe(400);
      expect(mockGenerateConsumerResponse).not.toHaveBeenCalled();
    });
  });
});
