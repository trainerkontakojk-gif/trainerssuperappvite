import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OPENAI_DISABLED = {
  success: false,
  error: {
    code: "TELEFUN_OPENAI_DISABLED",
    message: "OpenAI Realtime tidak tersedia untuk Telefun.",
  },
};

const RETIRED_PRICING = {
  success: false,
  error: {
    code: "TELEFUN_REALTIME_MODEL_RETIRED",
    message: "Harga model realtime OpenAI Telefun hanya tersedia untuk riwayat.",
  },
};

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  generateOpenAIContent: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  createAdminClient: mocks.createAdminClient,
  supabaseAdmin: {},
}));

vi.mock("../lib/openai", () => ({
  generateOpenAIContent: mocks.generateOpenAIContent,
}));

import {
  buildTelefunSessionInsertPayload,
  buildTelefunSessionUpdatePayload,
  isTelefunRecordingPathOwnedBySession,
} from "../routes/telefun";
import { ai } from "../routes/ai";
import { telefunCapabilities, resolveTelefunOpenAiWebRtcCapabilities } from "../routes/telefun/capabilities";
import { telefunSessions } from "../routes/telefun/sessions";
import { telefunRecordings } from "../routes/telefun/recordings";
import { telefunSettings, buildTelefunSettingsUpsertPayload } from "../routes/telefun/settings";
import {
  DEFAULT_TELEFUN_LIVE_MODEL_ID,
  parseTelefunTranscript,
  telefunTranscriptSchema,
} from "@trainers/types";

const USER_ID = "019f45e3-5fac-7cd2-afeb-8069c2f813b3";

function buildApp(...routes: any[]) {
  const app = new Hono<any>();
  app.use("*", async (c, next) => {
    c.set("user", { id: USER_ID });
    c.set("profile", { role: "admin" });
    await next();
  });
  for (const route of routes) app.route("/", route);
  return app;
}

function noDatabaseClient() {
  return {
    from: vi.fn(),
    rpc: vi.fn(),
  };
}

const baseSession = {
  scenario_title: "Pinjol Ilegal",
  consumer_name: "Siti",
};

const baseSettings = {
  selectedModel: DEFAULT_TELEFUN_LIVE_MODEL_ID,
  voiceName: "Kore",
  consumerName: "Siti",
  consumerGender: "female",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockReturnValue(noDatabaseClient());
});

describe("Gemini-only Telefun public model and capability reads", () => {
  it("returns only active Gemini Live records from GET /models?module=telefun", async () => {
    const response = await buildApp(ai).request("/models?module=telefun");

    expect(response.status).toBe(200);
    expect((await response.json()).data.map((model: { id: string }) => model.id)).toEqual([
      "gemini-3.1-flash-live-preview",
      "gemini-3.0-flash-live-preview",
    ]);
  });

  it("keeps direct OpenAI text generation available outside Telefun", async () => {
    mocks.generateOpenAIContent.mockResolvedValue({
      success: true,
      text: "Direct OpenAI text remains available.",
    });

    const response = await buildApp(ai).request("/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5.6-luna", prompt: "Halo" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { text: "Direct OpenAI text remains available." },
    });
    expect(mocks.generateOpenAIContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5.6-luna" }),
    );
  });

  it("hard-disables WebRTC capability regardless of supplied rollout values", async () => {
    expect(
      resolveTelefunOpenAiWebRtcCapabilities({
        userId: USER_ID,
        enabled: true,
        nodeEnv: "production",
        allowedUserIds: [USER_ID],
        allowedModelIds: ["gpt-realtime-2.1", "gpt-realtime-2.1-mini"],
      }),
    ).toEqual({
      openaiWebRtc: {
        enabled: false,
        allowed: false,
        modelId: "gpt-realtime-2.1",
        transport: "openai-webrtc",
        modelIds: [],
      },
    });

    const response = await buildApp(telefunCapabilities).request(
      "/capabilities",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        openaiWebRtc: {
          enabled: false,
          allowed: false,
          modelId: "gpt-realtime-2.1",
          transport: "openai-webrtc",
          modelIds: [],
        },
      },
    });
  });
});

describe("Telefun OpenAI settings and session admission", () => {
  it.each([
    ["model-only", { telefun_model_id: "gpt-realtime-2.1" }, { telefunModelId: "gpt-realtime-2.1" }],
    ["transport-only", { telefun_transport: "openai-audio" }, { telefunTransport: "openai-audio" }],
    [
      "paired",
      {
        telefun_model_id: "gpt-realtime-2.1",
        telefun_transport: "openai-webrtc",
      },
      {
        telefunModelId: "gpt-realtime-2.1",
        telefunTransport: "openai-webrtc",
      },
    ],
    [
      "mismatched",
      {
        telefun_model_id: "gpt-realtime-2.1-mini",
        telefun_transport: "gemini-live",
      },
      {
        telefunModelId: "gpt-realtime-2.1-mini",
        telefunTransport: "gemini-live",
      },
    ],
  ])(
    "rejects %s historical selection before every settings/session database operation",
    async (_label, sessionSelection, settingsSelection) => {
      const client = noDatabaseClient();
      mocks.createAdminClient.mockReturnValue(client);
      const app = buildApp(telefunSessions, telefunSettings);

      const create = await app.request("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseSession, ...sessionSelection }),
      });
      const patch = await app.request("/sessions/session-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionSelection),
      });
      const settings = await app.request("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...baseSettings, ...settingsSelection }),
      });

      for (const response of [create, patch, settings]) {
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual(OPENAI_DISABLED);
      }
      expect(client.from).not.toHaveBeenCalled();
      expect(client.rpc).not.toHaveBeenCalled();
    },
  );

  it("rejects a legacy selectedModel-only settings write before the database", async () => {
    const client = noDatabaseClient();
    mocks.createAdminClient.mockReturnValue(client);

    const response = await buildApp(telefunSettings).request("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...baseSettings,
        selectedModel: "gpt-realtime-2.1-mini",
      }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(OPENAI_DISABLED);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("projects persisted OpenAI settings to Gemini without mutating the stored row", async () => {
    const rawTelefunSettings = {
      selectedModel: "gpt-realtime-2.1",
      telefunModelId: "gpt-realtime-2.1",
      telefunTransport: "openai-webrtc",
      voiceName: "marin",
      consumerName: "Siti",
      consumerGender: "female",
      scenarioTitle: "Tetap ada",
      identitySettings: {
        gender: "female",
        voiceName: "cedar",
        city: "Bandung",
      },
    };
    const maybeSingle = vi.fn(async () => ({
      data: { settings: { ketik: { preserved: true }, telefun: rawTelefunSettings } },
      error: null,
    }));
    const upsert = vi.fn();
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
        upsert,
      })),
    });

    const response = await buildApp(telefunSettings).request("/settings");
    const payload = await response.json();

    const expected = {
      ...rawTelefunSettings,
      selectedModel: DEFAULT_TELEFUN_LIVE_MODEL_ID,
      telefunModelId: DEFAULT_TELEFUN_LIVE_MODEL_ID,
      telefunTransport: "gemini-live",
      voiceName: "",
      identitySettings: {
        ...rawTelefunSettings.identitySettings,
        voiceName: "",
      },
    };
    expect(response.status).toBe(200);
    expect(payload.settings).toEqual(expected);
    expect(payload.data).toEqual(expected);
    expect(rawTelefunSettings).toEqual({
      selectedModel: "gpt-realtime-2.1",
      telefunModelId: "gpt-realtime-2.1",
      telefunTransport: "openai-webrtc",
      voiceName: "marin",
      consumerName: "Siti",
      consumerGender: "female",
      scenarioTitle: "Tetap ada",
      identitySettings: {
        gender: "female",
        voiceName: "cedar",
        city: "Bandung",
      },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("persists the default Gemini pair on the next normal settings save", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { settings: { ketik: { preserved: true } } },
              error: null,
            })),
          })),
        })),
        upsert,
      })),
    });

    const response = await buildApp(telefunSettings).request("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(baseSettings),
    });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          ketik: { preserved: true },
          telefun: expect.objectContaining({
            telefunModelId: DEFAULT_TELEFUN_LIVE_MODEL_ID,
            telefunTransport: "gemini-live",
          }),
        }),
      }),
      { onConflict: "user_id" },
    );
  });
});

describe("historical OpenAI realtime pricing", () => {
  const historicalRates = {
    input_text_price_usd_per_million: 4,
    cached_input_text_price_usd_per_million: 0.4,
    input_audio_price_usd_per_million: 32,
    cached_input_audio_price_usd_per_million: 0.4,
    output_text_price_usd_per_million: 24,
    output_audio_price_usd_per_million: 64,
  };

  it("keeps a persisted realtime pricing row readable but display-only", async () => {
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(async () => ({
            data: [
              {
                model_id: "gpt-realtime-2.1",
                input_price_usd_per_million: 4,
                output_price_usd_per_million: 24,
                ...historicalRates,
              },
            ],
            error: null,
          })),
        })),
      })),
    });

    const response = await buildApp(ai).request("/monitoring/pricing");
    const payload = await response.json();
    const realtime = payload.data.find(
      (row: { model_id: string }) => row.model_id === "gpt-realtime-2.1",
    );

    expect(response.status).toBe(200);
    expect(realtime).toMatchObject({
      model_id: "gpt-realtime-2.1",
      provider: "openai",
      pricing_mode: "realtime",
      historical: true,
      editable: false,
      ...historicalRates,
    });
  });

  it("rejects writes to historical realtime pricing before an upsert", async () => {
    const client = noDatabaseClient();
    mocks.createAdminClient.mockReturnValue(client);

    const response = await buildApp(ai).request("/monitoring/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_id: "gpt-realtime-2.1-mini",
        input_price_usd_per_million: 0.6,
        output_price_usd_per_million: 2.4,
      }),
    });

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual(RETIRED_PRICING);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("keeps direct OpenAI text pricing writable", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ upsert })),
    });

    const response = await buildApp(ai).request("/monitoring/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_id: "gpt-5.4-mini",
        input_price_usd_per_million: 1,
        output_price_usd_per_million: 2,
      }),
    });

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
  });
});

describe("historical OpenAI scoring suppression", () => {
  it("permanently terminalizes a transport-only historical row before WebRTC readiness", async () => {
    const rpc = vi.fn(async (_name: string) => ({ data: true, error: null }));
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    }));
    mocks.createAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                user_id: USER_ID,
                status: "completed",
                telefun_model_id: null,
                telefun_transport: "openai-webrtc",
                recording_status: "pending",
                recording_error: null,
                scoring_ready_at: null,
                agent_recording_path: null,
                scoring_status: "pending",
                score: null,
                voice_assessment: null,
              },
              error: null,
            })),
          })),
        })),
        update,
      })),
    });

    const response = await buildApp(telefunRecordings).request(
      "/score/session-1",
      { method: "POST" },
    );

    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: "TELEFUN_OPENAI_SCORING_DISABLED",
        message: "Penilaian OpenAI Realtime tidak lagi tersedia untuk Telefun.",
      },
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_telefun_scoring",
      "fail_telefun_scoring",
    ]);
  });

  it("returns a transport-only cached historical assessment unchanged before the retired readiness gate", async () => {
    const assessment = {
      overallScore: 8,
      speakingRate: { score: 7, wordsPerMinute: 130, verdict: "Baik", feedback: "Ok" },
      intonation: { score: 8, verdict: "Baik", feedback: "Ok" },
      articulation: { score: 8, verdict: "Baik", feedback: "Ok" },
      fillerWords: { score: 8, count: 0, examples: [], verdict: "Baik", feedback: "Ok" },
      emotionalTone: { score: 8, dominant: "netral", verdict: "Baik", feedback: "Ok" },
      transcript: "",
      highlights: [],
      strengths: [],
    };
    const rpc = vi.fn();
    mocks.createAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                user_id: USER_ID,
                status: "completed",
                telefun_model_id: null,
                telefun_transport: "openai-webrtc",
                recording_status: "pending",
                recording_error: null,
                scoring_ready_at: null,
                agent_recording_path: null,
                scoring_status: "completed",
                score: 8,
                voice_assessment: assessment,
              },
              error: null,
            })),
          })),
        })),
      })),
    });

    const response = await buildApp(telefunRecordings).request(
      "/score/session-1",
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      cached: true,
      data: { assessment },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps an active transport-only WebRTC lifecycle row owned by cleanup", async () => {
    const rpc = vi.fn();
    mocks.createAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: {
                user_id: USER_ID,
                status: "active",
                telefun_model_id: null,
                telefun_transport: "openai-webrtc",
                recording_status: "pending",
                recording_error: null,
                scoring_ready_at: null,
                agent_recording_path: null,
                scoring_status: "pending",
                score: null,
                voice_assessment: null,
              },
              error: null,
            })),
          })),
        })),
      })),
    });

    const response = await buildApp(telefunRecordings).request(
      "/score/session-1",
      { method: "POST" },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: "SCORING_NOT_READY",
        message: "Rekaman agen belum siap untuk scoring.",
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("preserved non-OpenAI Telefun contracts", () => {
  it("keeps namespace merging and active Gemini defaults", () => {
    const payload = buildTelefunSettingsUpsertPayload({
      userId: USER_ID,
      existingSettings: { ketik: { selectedModel: "gpt-5.4-mini" } },
      telefunSettings: baseSettings,
      now: "2026-08-14T00:00:00.000Z",
    });
    expect(payload.settings.ketik).toEqual({ selectedModel: "gpt-5.4-mini" });

    expect(
      buildTelefunSessionInsertPayload({ userId: USER_ID, body: baseSession }),
    ).toMatchObject({
      telefun_model_id: DEFAULT_TELEFUN_LIVE_MODEL_ID,
      telefun_transport: "gemini-live",
    });
    expect(
      buildTelefunSessionUpdatePayload({
        telefun_model_id: "gemini-3.0-flash-live-preview",
        telefun_transport: "gemini-live",
      }),
    ).toEqual({
      telefun_model_id: "gemini-3.0-flash-live-preview",
      telefun_transport: "gemini-live",
    });
  });

  it("preserves recording ownership and transcript validation", () => {
    expect(
      isTelefunRecordingPathOwnedBySession({
        path: "u1/s1/full_call.webm",
        userId: "u1",
        sessionId: "s1",
        type: "full_call",
      }),
    ).toBe(true);
    expect(
      isTelefunRecordingPathOwnedBySession({
        path: "u1/s2/full_call.webm",
        userId: "u1",
        sessionId: "s1",
        type: "full_call",
      }),
    ).toBe(false);
    expect(
      telefunTranscriptSchema.safeParse([
        { speaker: "agent", text: "Halo", startMs: 0 },
      ]).success,
    ).toBe(true);
    expect(
      parseTelefunTranscript([
        { speaker: "agent", text: "Valid", startMs: 0 },
        { speaker: "invalid", text: "Tidak valid", startMs: 1 },
      ]),
    ).toEqual([{ speaker: "agent", text: "Valid", startMs: 0 }]);
  });
});
