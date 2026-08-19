import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null })),
        })),
      })),
    })),
  },
  createAdminClient: vi.fn(),
}));

import {
  buildTelefunSettingsUpsertPayload,
  buildTelefunSessionInsertPayload,
  isTelefunRecordingPathOwnedBySession,
  buildTelefunSessionUpdatePayload,
  buildTelefunFeedbackSummary,
  buildSeekablePath,
} from "../routes/telefun";
import { telefunSessions } from "../routes/telefun/sessions";
import { telefunSettings } from "../routes/telefun/settings";
import { createAdminClient } from "../lib/supabase";
import { env } from "../lib/env";

import {
  getTelefunLiveModel,
  telefunTranscriptSchema,
  parseTelefunTranscript,
  DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
  TELEFUN_OPENAI_WEBRTC_MODEL_IDS,
  parseTelefunOpenAiWebRtcAllowedModelIds,
} from "@trainers/types";
import {
  telefunSettingsPayloadSchema,
  telefunSimulationChallengeTypesSchema,
} from "../routes/telefun/settings";
import {
  resolveTelefunOpenAiWebRtcCapabilities,
  telefunCapabilities,
} from "../routes/telefun/capabilities";
import {
  telefunSessionCreatePayloadSchema,
  telefunSessionUpdatePayloadSchema,
  validateTelefunSessionDuration,
} from "../routes/telefun/sessions";

describe("telefun API payload and security validators", () => {
  it("denies WebRTC session creation before database insert when rollout is off", async () => {
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: "019f45e3-5fac-7cd2-afeb-8069c2f813b3" });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSessions);
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = false;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [];
    const insert = vi.fn();
    vi.mocked(createAdminClient).mockClear();
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ insert })),
    } as never);

    try {
      const response = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_title: "Test",
          consumer_name: "Consumer",
          telefun_model_id: "gpt-realtime-2.1",
          telefun_transport: "openai-webrtc",
          live_prompt_instructions: "canonical prompt snapshot",
        }),
      });

      expect(response.status).toBe(400);
      expect(insert).not.toHaveBeenCalled();
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
    }
  });

  it("accepts an allowlisted WebRTC session and inserts only after the runtime recheck", async () => {
    const userId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = true;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [userId];

    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: "session-1" }, error: null })),
      })),
    }));
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ insert })),
      rpc: vi.fn(async () => ({
        data: {
          allowed: true,
          remaining: 9,
          reset_at: "2026-08-01T00:01:00.000Z",
          reason: "allowed",
        },
        error: null,
      })),
    } as never);
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSessions);

    try {
      const response = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_title: "Test",
          consumer_name: "Consumer",
          telefun_model_id: "gpt-realtime-2.1",
          telefun_transport: "openai-webrtc",
          live_prompt_instructions: "canonical prompt snapshot",
        }),
      });
      expect(response.status).toBe(200);
      expect(insert).toHaveBeenCalledOnce();
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
    }
  });

  it("fails closed when a WebRTC session write has no distributed limiter", async () => {
    const userId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = true;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [userId];

    const update = vi.fn();
    const maybeSingle = vi.fn(async () => ({
      data: { user_id: userId, telefun_transport: "openai-webrtc" },
      error: null,
    }));
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle })),
    }));
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ select, update })),
    } as never);
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSessions);

    try {
      const response = await app.request(`/sessions/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona_config: { safe: true } }),
      });

      expect(response.status).toBe(503);
      expect(update).not.toHaveBeenCalled();
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
    }
  });

  it("rejects explicit WebRTC PATCH and settings PUT before any write when rollout is denied", async () => {
    const userId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = false;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [userId];

    const update = vi.fn();
    const upsert = vi.fn();
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { settings: {} },
          error: null,
        })),
      })),
    }));
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ update, upsert, select })),
    } as never);

    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSessions);
    app.route("/", telefunSettings);

    try {
      const patch = await app.request(`/sessions/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefun_model_id: "gpt-realtime-2.1",
          telefun_transport: "openai-webrtc",
        }),
      });
      const put = await app.request("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedModel: "gpt-realtime-2.1",
          voiceName: "marin",
          consumerName: "Consumer",
          consumerGender: "female",
          telefunModelId: "gpt-realtime-2.1",
          telefunTransport: "openai-webrtc",
        }),
      });

      expect(patch.status).toBe(400);
      expect(put.status).toBe(400);
      expect(update).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
    }
  });

  it("rejects Mini+WebRTC settings when the server allowed-model set is Full-only", async () => {
    const userId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
      allowedModelIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = true;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [userId];
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = ["gpt-realtime-2.1"];

    const upsert = vi.fn();
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { settings: {} },
          error: null,
        })),
      })),
    }));
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ upsert, select })),
    } as never);
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSettings);

    try {
      const response = await app.request("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedModel: "gpt-realtime-2.1-mini",
          voiceName: "marin",
          consumerName: "Consumer",
          consumerGender: "female",
          telefunModelId: "gpt-realtime-2.1-mini",
          telefunTransport: "openai-webrtc",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toBe(
        "Model dan transport OpenAI WebRTC tidak tersedia.",
      );
      expect(upsert).not.toHaveBeenCalled();
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = previous.allowedModelIds;
    }
  });

  it("accepts Mini+WebRTC settings when the server allowed-model set admits it", async () => {
    const userId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
      allowedModelIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = true;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [userId];
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = [
      "gpt-realtime-2.1",
      "gpt-realtime-2.1-mini",
    ];

    const upsert = vi.fn(async () => ({ error: null }));
    const select = vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { settings: {} },
          error: null,
        })),
      })),
    }));
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ upsert, select })),
    } as never);
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSettings);

    try {
      const response = await app.request("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedModel: "gpt-realtime-2.1-mini",
          voiceName: "marin",
          consumerName: "Consumer",
          consumerGender: "female",
          telefunModelId: "gpt-realtime-2.1-mini",
          telefunTransport: "openai-webrtc",
        }),
      });

      expect(response.status).toBe(200);
      expect(upsert).toHaveBeenCalledOnce();
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = previous.allowedModelIds;
    }
  });

  it("rejects Mini+WebRTC session creation when the server allowed-model set is Full-only", async () => {
    const userId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
      allowedModelIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = true;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [userId];
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = ["gpt-realtime-2.1"];

    const insert = vi.fn();
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ insert })),
    } as never);
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSessions);

    try {
      const response = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_title: "Test",
          consumer_name: "Consumer",
          telefun_model_id: "gpt-realtime-2.1-mini",
          telefun_transport: "openai-webrtc",
          live_prompt_instructions: "canonical prompt snapshot",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toBe(
        "Model dan transport OpenAI WebRTC tidak tersedia.",
      );
      expect(insert).not.toHaveBeenCalled();
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = previous.allowedModelIds;
    }
  });

  it("accepts Mini+WebRTC session creation when the server allowed-model set admits it", async () => {
    const userId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
      allowedModelIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = true;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [userId];
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = [
      "gpt-realtime-2.1",
      "gpt-realtime-2.1-mini",
    ];

    const insert = vi.fn((payload: unknown) => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { id: "session-mini-1" },
          error: null,
        })),
      })),
    }));
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ insert })),
      rpc: vi.fn(async () => ({
        data: {
          allowed: true,
          remaining: 9,
          reset_at: "2026-08-01T00:01:00.000Z",
          reason: "allowed",
        },
        error: null,
      })),
    } as never);
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSessions);

    try {
      const response = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_title: "Test",
          consumer_name: "Consumer",
          telefun_model_id: "gpt-realtime-2.1-mini",
          telefun_transport: "openai-webrtc",
          live_prompt_instructions: "canonical prompt snapshot",
        }),
      });
      expect(response.status).toBe(200);
      expect(insert).toHaveBeenCalledOnce();
      const insertArgs = insert.mock.calls[0][0] as {
        telefun_model_id: string;
        telefun_transport: string;
      };
      expect(insertArgs.telefun_model_id).toBe("gpt-realtime-2.1-mini");
      expect(insertArgs.telefun_transport).toBe("openai-webrtc");
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = previous.allowedModelIds;
    }
  });

  it("rejects Mini+WebRTC PATCH when the server allowed-model set is Full-only", async () => {
    const userId = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";
    const previous = {
      enabled: env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED,
      nodeEnv: env.NODE_ENV,
      allowedUserIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS,
      allowedModelIds: env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS,
    };
    env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = true;
    env.NODE_ENV = "staging";
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = [userId];
    env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = ["gpt-realtime-2.1"];

    const update = vi.fn();
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn(() => ({ update })),
    } as never);
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunSessions);

    try {
      const response = await app.request(`/sessions/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefun_model_id: "gpt-realtime-2.1-mini",
          telefun_transport: "openai-webrtc",
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toBe(
        "Model dan transport OpenAI WebRTC tidak tersedia.",
      );
      expect(update).not.toHaveBeenCalled();
    } finally {
      env.TELEFUN_OPENAI_WEBRTC_POC_ENABLED = previous.enabled;
      env.NODE_ENV = previous.nodeEnv;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS = previous.allowedUserIds;
      env.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS = previous.allowedModelIds;
    }
  });

  it("returns the exact authenticated capability shape without provider metadata", async () => {
    const app = new Hono<{
      Variables: { user: { id: string }; profile: { role: string } };
    }>();
    app.use("*", async (c, next) => {
      c.set("user", { id: "user-1" });
      c.set("profile", { role: "admin" });
      await next();
    });
    app.route("/", telefunCapabilities);

    const response = await app.request("/capabilities");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        openaiWebRtc: {
          enabled: false,
          allowed: false,
          modelId: "gpt-realtime-2.1",
          transport: "openai-webrtc",
          modelIds: ["gpt-realtime-2.1"],
        },
      },
    });
  });

  it("resolves only an exact allowlisted user in development, staging, or production", () => {
    expect(
      resolveTelefunOpenAiWebRtcCapabilities({
        userId: "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
        enabled: true,
        nodeEnv: "staging",
        allowedUserIds: ["019f45e3-5fac-7cd2-afeb-8069c2f813b3"],
      }),
    ).toEqual({
      openaiWebRtc: {
        enabled: true,
        allowed: true,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
        modelIds: ["gpt-realtime-2.1"],
      },
    });
    expect(
      resolveTelefunOpenAiWebRtcCapabilities({
        userId: "019f45e3-5fac-7cd2-afeb-8069c2f813b4",
        enabled: true,
        nodeEnv: "staging",
        allowedUserIds: ["019f45e3-5fac-7cd2-afeb-8069c2f813b3"],
      }).openaiWebRtc,
    ).toEqual({
      enabled: false,
      allowed: false,
      modelId: "gpt-realtime-2.1",
      transport: "openai-webrtc",
      modelIds: ["gpt-realtime-2.1"],
    });
    expect(
      resolveTelefunOpenAiWebRtcCapabilities({
        userId: "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
        enabled: true,
        nodeEnv: "production",
        allowedUserIds: ["019f45e3-5fac-7cd2-afeb-8069c2f813b3"],
      }).openaiWebRtc,
    ).toEqual({
      enabled: true,
      allowed: true,
      modelId: "gpt-realtime-2.1",
      transport: "openai-webrtc",
      modelIds: ["gpt-realtime-2.1"],
    });
    expect(
      resolveTelefunOpenAiWebRtcCapabilities({
        userId: "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
        enabled: true,
        nodeEnv: "test",
        allowedUserIds: ["019f45e3-5fac-7cd2-afeb-8069c2f813b3"],
      }).openaiWebRtc,
    ).toEqual({
      enabled: false,
      allowed: false,
      modelId: "gpt-realtime-2.1",
      transport: "openai-webrtc",
      modelIds: ["gpt-realtime-2.1"],
    });
    expect(
      resolveTelefunOpenAiWebRtcCapabilities({
        userId: "019f45e3-5fac-7cd2-afeb-8069c2f813b4",
        enabled: true,
        nodeEnv: "production",
        allowedUserIds: ["019f45e3-5fac-7cd2-afeb-8069c2f813b3"],
      }).openaiWebRtc,
    ).toEqual({
      enabled: false,
      allowed: false,
      modelId: "gpt-realtime-2.1",
      transport: "openai-webrtc",
      modelIds: ["gpt-realtime-2.1"],
    });
  });
  it("keeps the compatibility modelId while exposing the effective WebRTC model set additively", () => {
    const capability = resolveTelefunOpenAiWebRtcCapabilities({
      userId: "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
      enabled: true,
      nodeEnv: "staging",
      allowedUserIds: ["019f45e3-5fac-7cd2-afeb-8069c2f813b3"],
      allowedModelIds: ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"],
    });
    expect(capability.openaiWebRtc).toEqual({
      enabled: true,
      allowed: true,
      modelId: "gpt-realtime-2.1",
      transport: "openai-webrtc",
      modelIds: ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"],
    });
  });

  it("defaults the capability WebRTC model set to Full-only without allowed-model config", () => {
    expect(
      resolveTelefunOpenAiWebRtcCapabilities({
        userId: "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
        enabled: true,
        nodeEnv: "staging",
        allowedUserIds: ["019f45e3-5fac-7cd2-afeb-8069c2f813b3"],
      }).openaiWebRtc,
    ).toEqual({
      enabled: true,
      allowed: true,
      modelId: "gpt-realtime-2.1",
      transport: "openai-webrtc",
      modelIds: ["gpt-realtime-2.1"],
    });
  });

  const validSettingsBody = {
    selectedModel: "gemini-3.1-flash-live-preview",
    voiceName: "Kore",
    consumerName: "Agus",
    consumerGender: "male",
  };

  it("rejects unknown simulation challenge IDs at the settings boundary", () => {
    expect(
      telefunSimulationChallengeTypesSchema.safeParse([
        "interruption",
        "unknown_challenge",
      ]).success,
    ).toBe(false);
  });

  it("merges telefun settings without wiping other keys like ketik", () => {
    const existingSettings = {
      ketik: { selectedModel: "gemini-2.0-flash-exp" },
      telefun: { voiceName: "Aoede" },
    };
    const requestBody = {
      selectedModel: "gemini-3.1-flash-live-preview",
      voiceName: "Kore",
      systemInstruction: "Anda adalah konsumen OJK.",
      consumerName: "Agus",
      consumerGender: "male",
    };

    const payload = buildTelefunSettingsUpsertPayload({
      userId: "user-1",
      existingSettings,
      telefunSettings: requestBody,
      now: "2026-05-25T00:00:00.000Z",
    });

    expect(payload.settings.ketik).toEqual(existingSettings.ketik);
    expect(payload.settings.telefun.voiceName).toBe("Kore");
    expect(payload.updated_at).toBe("2026-05-25T00:00:00.000Z");
  });

  it("accepts legacy settings without Telefun model fields and valid canonical pairs", () => {
    expect(
      telefunSettingsPayloadSchema.safeParse(validSettingsBody).success,
    ).toBe(true);
    expect(
      telefunSettingsPayloadSchema.safeParse({
        ...validSettingsBody,
        telefunModelId: "gpt-realtime-2.1",
        telefunTransport: "openai-audio",
      }).success,
    ).toBe(true);
    expect(
      telefunSettingsPayloadSchema.safeParse({
        ...validSettingsBody,
        telefunModelId: "gpt-realtime-2.1",
        telefunTransport: "openai-webrtc",
      }).success,
    ).toBe(true);
  });

  it("accepts but does not require the legacy systemInstruction field", () => {
    expect(
      telefunSettingsPayloadSchema.safeParse(validSettingsBody).success,
    ).toBe(true);
    expect(
      telefunSettingsPayloadSchema.safeParse({
        ...validSettingsBody,
        systemInstruction: "Legacy value ignored by runtime.",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown, incomplete, and mismatched settings model pairs", () => {
    expect(
      telefunSettingsPayloadSchema.safeParse({
        ...validSettingsBody,
        telefunModelId: "unknown-live-model",
        telefunTransport: "gemini-live",
      }).success,
    ).toBe(false);
    expect(
      telefunSettingsPayloadSchema.safeParse({
        ...validSettingsBody,
        telefunModelId: "gpt-realtime-2.1",
      }).success,
    ).toBe(false);
    expect(
      telefunSettingsPayloadSchema.safeParse({
        ...validSettingsBody,
        telefunModelId: "gpt-realtime-2.1",
        telefunTransport: "gemini-live",
      }).success,
    ).toBe(false);
  });

  it("builds correct session insert payload with user details", () => {
    const body = {
      scenario_title: "Pinjol Ilegal",
      consumer_name: "Siti",
      consumer_gender: "female",
      consumer_phone: "08123456789",
      consumer_city: "Bandung",
      realistic_mode_enabled: true,
      persona_config: { consumerType: "Marah & Emosional" },
      disruption_config: ["interruption"],
    };

    const payload = buildTelefunSessionInsertPayload({
      userId: "user-1",
      body,
    });

    expect(payload).toEqual({
      user_id: "user-1",
      scenario_title: "Pinjol Ilegal",
      consumer_name: "Siti",
      consumer_gender: "female",
      consumer_phone: "08123456789",
      consumer_city: "Bandung",
      realistic_mode_enabled: true,
      persona_config: { consumerType: "Marah & Emosional" },
      disruption_config: ["interruption"],
      status: "active",
      configured_duration: null,
      response_pacing_mode: null,
      telefun_model_id: "gemini-3.1-flash-live-preview",
      live_prompt_instructions: null,
      telefun_transport: "gemini-live",
    });
  });

  it("accepts canonical session pairs, model-only derivation, and Gemini defaults", () => {
    const base = {
      scenario_title: "Pinjol Ilegal",
      consumer_name: "Siti",
    };

    expect(telefunSessionCreatePayloadSchema.safeParse(base).success).toBe(
      true,
    );
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        consumer_gender: "male",
      }).success,
    ).toBe(true);
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        consumer_gender: "random",
      }).success,
    ).toBe(false);
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        telefun_model_id: "gpt-realtime-2.1-mini",
      }).success,
    ).toBe(true);
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-audio",
      }).success,
    ).toBe(true);
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
        live_prompt_instructions: "canonical prompt snapshot",
      }).success,
    ).toBe(true);
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        telefun_model_id: "gpt-realtime-2.1-mini",
        telefun_transport: "openai-webrtc",
        live_prompt_instructions: "canonical prompt snapshot",
      }).success,
    ).toBe(true);

    expect(
      buildTelefunSessionInsertPayload({ userId: "user-1", body: base }),
    ).toMatchObject({
      telefun_model_id: "gemini-3.1-flash-live-preview",
      telefun_transport: "gemini-live",
    });
    expect(
      buildTelefunSessionInsertPayload({
        userId: "user-1",
        body: { ...base, telefun_model_id: "gpt-realtime-2.1-mini" },
      }),
    ).toMatchObject({
      telefun_model_id: "gpt-realtime-2.1-mini",
      telefun_transport: "openai-audio",
    });
    expect(
      buildTelefunSessionInsertPayload({
        userId: "user-1",
        body: {
          ...base,
          telefun_model_id: "gpt-realtime-2.1",
          telefun_transport: "openai-webrtc",
          live_prompt_instructions: "canonical prompt snapshot",
        },
      }),
    ).toMatchObject({
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
    });
    expect(
      buildTelefunSessionInsertPayload({
        userId: "user-1",
        body: {
          ...base,
          telefun_model_id: "gpt-realtime-2.1-mini",
          telefun_transport: "openai-webrtc",
          live_prompt_instructions: "canonical prompt snapshot",
        },
      }),
    ).toMatchObject({
      telefun_model_id: "gpt-realtime-2.1-mini",
      telefun_transport: "openai-webrtc",
    });
  });

  it("rejects invalid session create pairs before database persistence", () => {
    const base = {
      scenario_title: "Pinjol Ilegal",
      consumer_name: "Siti",
    };

    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        telefun_transport: "gemini-live",
      }).success,
    ).toBe(false);
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        telefun_model_id: "unknown-live-model",
      }).success,
    ).toBe(false);
    expect(() =>
      buildTelefunSessionInsertPayload({
        userId: "user-1",
        body: {
          ...base,
          telefun_model_id: "gpt-realtime-2.1",
          telefun_transport: "gemini-live",
        },
      }),
    ).toThrow("Model dan transport Telefun tidak cocok");
  });

  it("accepts OpenAI duration 3600 seconds and rejects 3601 seconds", () => {
    const base = {
      scenario_title: "Pinjol Ilegal",
      consumer_name: "Siti",
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-audio",
    };

    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        configured_duration: 3600,
      }).success,
    ).toBe(true);
    expect(
      telefunSessionCreatePayloadSchema.safeParse({
        ...base,
        configured_duration: 3601,
      }).success,
    ).toBe(false);
    expect(() =>
      buildTelefunSessionInsertPayload({
        userId: "user-1",
        body: { ...base, configured_duration: 3601 },
      }),
    ).toThrow("Durasi maksimum model Telefun adalah 3600 detik");
  });

  it("derives the session duration limit from resolved model metadata", () => {
    const cappedModel = getTelefunLiveModel("gpt-realtime-2.1-mini");
    const uncappedModel = getTelefunLiveModel("gemini-3.1-flash-live-preview");

    expect(cappedModel).toBeDefined();
    expect(uncappedModel).toBeDefined();
    expect(() =>
      validateTelefunSessionDuration(cappedModel!, 3600),
    ).not.toThrow();
    expect(() => validateTelefunSessionDuration(cappedModel!, 3601)).toThrow(
      "Durasi maksimum model Telefun adalah 3600 detik",
    );
    expect(() =>
      validateTelefunSessionDuration(uncappedModel!, 7200),
    ).not.toThrow();
  });

  it("requires both model fields together for session updates", () => {
    expect(
      telefunSessionUpdatePayloadSchema.safeParse({
        telefun_model_id: "gemini-3.0-flash-live-preview",
        telefun_transport: "gemini-live",
      }).success,
    ).toBe(true);
    expect(
      telefunSessionUpdatePayloadSchema.safeParse({
        telefun_model_id: "gemini-3.0-flash-live-preview",
      }).success,
    ).toBe(false);
    expect(
      telefunSessionUpdatePayloadSchema.safeParse({
        telefun_model_id: "gpt-realtime-2.1-mini",
        telefun_transport: "gemini-live",
      }).success,
    ).toBe(false);
    expect(
      telefunSessionUpdatePayloadSchema.safeParse({
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      }).success,
    ).toBe(true);
    expect(
      telefunSessionUpdatePayloadSchema.safeParse({
        telefun_model_id: "gpt-realtime-2.1-mini",
        telefun_transport: "openai-webrtc",
      }).success,
    ).toBe(true);
    expect(() =>
      buildTelefunSessionUpdatePayload({
        telefun_transport: "openai-audio",
      }),
    ).toThrow("Model dan transport Telefun harus diperbarui bersama");
    expect(
      buildTelefunSessionUpdatePayload({
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      }),
    ).toEqual({
      telefun_model_id: "gpt-realtime-2.1",
      telefun_transport: "openai-webrtc",
    });
    expect(
      buildTelefunSessionUpdatePayload({
        telefun_model_id: "gpt-realtime-2.1-mini",
        telefun_transport: "openai-webrtc",
      }),
    ).toEqual({
      telefun_model_id: "gpt-realtime-2.1-mini",
      telefun_transport: "openai-webrtc",
    });
  });

  it("validates recording path format and session ownership", () => {
    expect(
      isTelefunRecordingPathOwnedBySession({
        path: "other-user/session-1/full_call.webm",
        userId: "user-1",
        sessionId: "session-1",
        type: "full_call",
      }),
    ).toBe(false);

    expect(
      isTelefunRecordingPathOwnedBySession({
        path: "user-1/session-2/full_call.webm",
        userId: "user-1",
        sessionId: "session-1",
        type: "full_call",
      }),
    ).toBe(false);

    expect(
      isTelefunRecordingPathOwnedBySession({
        path: "user-1/session-1/agent_only.webm",
        userId: "user-1",
        sessionId: "session-1",
        type: "full_call",
      }),
    ).toBe(false);

    expect(
      isTelefunRecordingPathOwnedBySession({
        path: "user-1/session-1/full_call.webm",
        userId: "user-1",
        sessionId: "session-1",
        type: "full_call",
      }),
    ).toBe(true);

    expect(
      isTelefunRecordingPathOwnedBySession({
        path: "user-1/session-1/agent_only.webm",
        userId: "user-1",
        sessionId: "session-1",
        type: "agent_only",
      }),
    ).toBe(true);
  });

  it("keeps feedback in the explicit telefun session update payload", () => {
    expect(
      buildTelefunSessionUpdatePayload({
        status: "completed",
        score: 87,
        feedback: "Artikulasi baik, tempo perlu lebih stabil.",
      }),
    ).toEqual({
      status: "completed",
      score: 87,
      feedback: "Artikulasi baik, tempo perlu lebih stabil.",
    });
  });

  it("rejects telefun session update recording paths outside the same user session", () => {
    expect(() =>
      (buildTelefunSessionUpdatePayload as any)(
        {
          recording_path: "other-user/session-1/full_call.webm",
        },
        { userId: "user-1", sessionId: "session-1" },
      ),
    ).toThrow("Invalid recording path ownership");

    expect(() =>
      (buildTelefunSessionUpdatePayload as any)(
        {
          agent_recording_path: "user-1/session-2/agent_only.webm",
        },
        { userId: "user-1", sessionId: "session-1" },
      ),
    ).toThrow("Invalid agent recording path ownership");

    expect(
      (buildTelefunSessionUpdatePayload as any)(
        {
          recording_path: "user-1/session-1/full_call.webm",
          agent_recording_path: "user-1/session-1/agent_only.webm",
        },
        { userId: "user-1", sessionId: "session-1" },
      ),
    ).toMatchObject({
      recording_path: "user-1/session-1/full_call.webm",
      agent_recording_path: "user-1/session-1/agent_only.webm",
    });
  });

  it("builds an Indonesian feedback summary from voice assessment sections", () => {
    const summary = buildTelefunFeedbackSummary({
      overallScore: 8,
      speakingRate: {
        score: 8,
        wordsPerMinute: 145,
        verdict: "Baik",
        feedback: "Tempo stabil.",
      },
      intonation: {
        score: 7,
        verdict: "Cukup",
        feedback: "Intonasi perlu lebih hangat.",
      },
      articulation: {
        score: 8,
        verdict: "Baik",
        feedback: "Artikulasi jelas.",
      },
      fillerWords: {
        score: 9,
        count: 1,
        examples: ["eee"],
        verdict: "Baik",
        feedback: "Kata pengisi minim.",
      },
      emotionalTone: {
        score: 7,
        dominant: "tenang",
        verdict: "Cukup",
        feedback: "Empati perlu lebih eksplisit.",
      },
      transcript: "",
      highlights: [],
      strengths: [],
    });

    expect(summary).toContain("Tempo stabil.");
    expect(summary).toContain("Intonasi perlu lebih hangat.");
    expect(summary).toContain("Artikulasi jelas.");
  });

  it("builds feedback summary with communicationProfile present (backward compatible)", () => {
    const summary = buildTelefunFeedbackSummary({
      overallScore: 8,
      speakingRate: {
        score: 8,
        wordsPerMinute: 145,
        verdict: "Baik",
        feedback: "Tempo stabil.",
      },
      intonation: {
        score: 7,
        verdict: "Cukup",
        feedback: "Intonasi perlu lebih hangat.",
      },
      articulation: {
        score: 8,
        verdict: "Baik",
        feedback: "Artikulasi jelas.",
      },
      fillerWords: {
        score: 9,
        count: 1,
        examples: ["eee"],
        verdict: "Baik",
        feedback: "Kata pengisi minim.",
      },
      emotionalTone: {
        score: 7,
        dominant: "tenang",
        verdict: "Cukup",
        feedback: "Empati perlu lebih eksplisit.",
      },
      transcript: "",
      highlights: [],
      strengths: [],
      communicationProfile: {
        metrics: [],
        overallSummary: "Test",
        strengths: [],
        improvementPriorities: [],
      },
    });

    expect(summary).toContain("Tempo stabil.");
    expect(summary).toContain("Intonasi perlu lebih hangat.");
    expect(summary).toContain("Artikulasi jelas.");
  });

  it("includes hold management feedback when hold was used", () => {
    const summary = buildTelefunFeedbackSummary({
      overallScore: 8,
      speakingRate: {
        score: 8,
        wordsPerMinute: 145,
        verdict: "Baik",
        feedback: "Tempo stabil.",
      },
      intonation: {
        score: 7,
        verdict: "Cukup",
        feedback: "Intonasi perlu lebih hangat.",
      },
      articulation: {
        score: 8,
        verdict: "Baik",
        feedback: "Artikulasi jelas.",
      },
      fillerWords: {
        score: 9,
        count: 1,
        examples: [],
        verdict: "Baik",
        feedback: "Kata pengisi minim.",
      },
      emotionalTone: {
        score: 7,
        dominant: "tenang",
        verdict: "Cukup",
        feedback: "Empati baik.",
      },
      holdManagement: {
        status: "exceeded",
        score: 4,
        verdict: "Kurang",
        feedback: "Manajemen hold kurang.",
        holdCount: 1,
        totalDurationMs: 61_000,
        longestDurationMs: 61_000,
        exceededCount: 1,
      },
      transcript: "",
      highlights: [],
      strengths: [],
    });

    expect(summary).toContain("Manajemen hold kurang.");
  });

  it("buildTelefunSessionUpdatePayload includes typed transcript entries", () => {
    const entries = [
      { speaker: "agent" as const, text: "Halo", startMs: 1000 },
      { speaker: "consumer" as const, text: "Halo juga", startMs: 3000 },
    ];
    const payload = buildTelefunSessionUpdatePayload({
      status: "completed",
      messages: entries,
    });
    expect(payload.messages).toEqual(entries);
  });

  it("telefunTranscriptSchema rejects malformed transcript entries", () => {
    const valid = telefunTranscriptSchema.safeParse([
      { speaker: "agent", text: "Test", startMs: 0 },
    ]);
    expect(valid.success).toBe(true);

    const invalidSpeaker = telefunTranscriptSchema.safeParse([
      { speaker: "unknown", text: "Test", startMs: 0 },
    ]);
    expect(invalidSpeaker.success).toBe(false);

    const negativeTimestamp = telefunTranscriptSchema.safeParse([
      { speaker: "agent", text: "Test", startMs: -1 },
    ]);
    expect(negativeTimestamp.success).toBe(false);

    const emptyText = telefunTranscriptSchema.safeParse([
      { speaker: "agent", text: "", startMs: 0 },
    ]);
    expect(emptyText.success).toBe(false);
  });

  it("parseTelefunTranscript strips malformed items but keeps valid ones", () => {
    const result = parseTelefunTranscript([
      { speaker: "agent", text: "Valid", startMs: 0 },
      { speaker: "unknown", text: "Invalid role", startMs: 0 },
      { speaker: "consumer", text: "", startMs: 0 },
      { speaker: "consumer", text: "Juga valid", startMs: 5000 },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Valid");
    expect(result[1].text).toBe("Juga valid");
  });

  it("parseTelefunTranscript returns empty array for non-array input", () => {
    expect(parseTelefunTranscript(null)).toEqual([]);
    expect(parseTelefunTranscript(undefined)).toEqual([]);
    expect(parseTelefunTranscript("string")).toEqual([]);
    expect(parseTelefunTranscript({})).toEqual([]);
  });
});

describe("buildSeekablePath", () => {
  it("converts full_call.webm to full_call.seekable.webm", () => {
    const result = buildSeekablePath("u1/s1/full_call.webm");
    expect(result).toBe("u1/s1/full_call.seekable.webm");
  });

  it("converts agent_only.webm to agent_only.seekable.webm", () => {
    const result = buildSeekablePath("u1/s1/agent_only.webm");
    expect(result).toBe("u1/s1/agent_only.seekable.webm");
  });

  it("handles paths without extension", () => {
    const result = buildSeekablePath("u1/s1/full_call");
    expect(result).toBe("u1/s1/full_call.seekable.webm");
  });

  it("handles paths with multiple dots", () => {
    const result = buildSeekablePath("u1/s1/full_call.old.webm");
    expect(result).toBe("u1/s1/full_call.old.seekable.webm");
  });

  it("keeps an existing seekable path idempotent", () => {
    const path = "u1/s1/full_call.seekable.webm";
    expect(buildSeekablePath(path)).toBe(path);
  });
});

describe("TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS parsing", () => {
  it("defaults to the explicit Full-only set when missing or empty", () => {
    expect(DEFAULT_TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS).toEqual([
      "gpt-realtime-2.1",
    ]);
    expect(parseTelefunOpenAiWebRtcAllowedModelIds(undefined)).toEqual([
      "gpt-realtime-2.1",
    ]);
  });

  it("rejects unknown, duplicate, and empty tokens fail-closed to Full-only", () => {
    expect(
      parseTelefunOpenAiWebRtcAllowedModelIds(
        "gpt-realtime-2.1,unknown-model",
      ),
    ).toEqual(["gpt-realtime-2.1"]);
    expect(
      parseTelefunOpenAiWebRtcAllowedModelIds(
        "gpt-realtime-2.1,gpt-realtime-2.1",
      ),
    ).toEqual(["gpt-realtime-2.1"]);
    expect(
      parseTelefunOpenAiWebRtcAllowedModelIds("gpt-realtime-2.1-mini,"),
    ).toEqual(["gpt-realtime-2.1"]);
    expect(parseTelefunOpenAiWebRtcAllowedModelIds("")).toEqual([
      "gpt-realtime-2.1",
    ]);
    expect(
      parseTelefunOpenAiWebRtcAllowedModelIds("gemini-3.1-flash-live-preview"),
    ).toEqual(["gpt-realtime-2.1"]);
    expect(
      parseTelefunOpenAiWebRtcAllowedModelIds(
        TELEFUN_OPENAI_WEBRTC_MODEL_IDS.join(",") + ",gpt-realtime-2.1",
      ),
    ).toEqual(["gpt-realtime-2.1"]);
  });

  it("accepts only exact registry members with whitespace trimming", () => {
    expect(
      parseTelefunOpenAiWebRtcAllowedModelIds(
        " gpt-realtime-2.1 , gpt-realtime-2.1-mini ",
      ),
    ).toEqual(["gpt-realtime-2.1", "gpt-realtime-2.1-mini"]);
    expect(
      parseTelefunOpenAiWebRtcAllowedModelIds("gpt-realtime-2.1-mini"),
    ).toEqual(["gpt-realtime-2.1-mini"]);
  });
});
