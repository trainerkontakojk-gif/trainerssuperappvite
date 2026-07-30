import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const single = vi.fn();
const select = vi.fn(() => ({
  eq: vi.fn(() => ({ single, maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })),
}));
const createSignedUrl = vi.fn();
const coachingSummary = vi.fn();
let currentRole = "trainer";

vi.mock("../lib/supabase", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => table === "telefun_coaching_summary"
      ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: coachingSummary })) })) }
      : { select }),
    storage: {
      from: vi.fn(() => ({ createSignedUrl })),
    },
  }),
}));

import { ai } from "../routes/ai";

function buildApp() {
  const app = new Hono<{ Variables: { user: any; profile: any } }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "trainer-1" });
    c.set("profile", { role: currentRole });
    await next();
  });
  app.route("/", ai);
  return app;
}

describe("Telefun monitoring review transcript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRole = "trainer";
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-full-call.webm" },
      error: null,
    });
    coachingSummary.mockResolvedValue({ data: null, error: null });
  });

  it("selects messages, returns transcript entries, and signs recording URL for trainer", async () => {
    single.mockResolvedValue({
      data: {
        score: 8,
        user_id: "trainer-1",
        recording_path: "trainer-1/00000000-0000-0000-0000-000000000001/full_call.webm",
        agent_recording_path: "trainer-1/00000000-0000-0000-0000-000000000001/agent_only.webm",
        scenario_title: "Tagihan",
        duration_seconds: 60,
        voice_assessment: null,
        messages: [
          { speaker: "agent", text: "Selamat pagi", startMs: 3000 },
          { speaker: "system", text: "Internal prompt", startMs: 3500 },
          { speaker: "consumer", text: "Selamat pagi", startMs: 5000 },
        ],
        ai_summary: null,
        strengths: null,
        weaknesses: null,
        coaching_focus: null,
        consumer_name: "Siti",
        consumer_phone: "08123456789",
        consumer_city: "Bandung",
        consumer_gender: "female",
        persona_config: { consumerType: "Marah & Emosional" },
      },
      error: null,
    });

    const response = await buildApp().request(
      "/monitoring/history/telefun/00000000-0000-0000-0000-000000000001/review",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("messages"));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("agent_recording_path"));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("consumer_phone"));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("consumer_city"));
    expect(createSignedUrl).toHaveBeenCalledWith("trainer-1/00000000-0000-0000-0000-000000000001/full_call.webm", 3600);
    expect(body.data.recording_url).toBe("https://storage.example/signed-full-call.webm");
    expect(body.data.agent_recording_path).toBe("trainer-1/00000000-0000-0000-0000-000000000001/agent_only.webm");
    expect(body.data.consumer_phone).toBe("08123456789");
    expect(body.data.consumer_city).toBe("Bandung");
    expect(body.data.consumer_gender).toBe("female");
    expect(body.data.persona_config).toEqual({ consumerType: "Marah & Emosional" });
    expect(body.data.transcript).toEqual([
      { speaker: "agent", text: "Selamat pagi", startMs: 3000 },
      { speaker: "consumer", text: "Selamat pagi", startMs: 5000 },
    ]);
  });

  it("returns canonical coaching recommendations joined by session_id", async () => {
    coachingSummary.mockResolvedValue({ data: { recommendations: [{ text: "Perjelas penutupan", priority: 2 }], generated_at: "2026-05-23T12:00:00Z" }, error: null });
    single.mockResolvedValue({ data: { score: 0, recording_path: null, agent_recording_path: null, scenario_title: "Tagihan", duration_seconds: 60, voice_assessment: null, messages: [], ai_summary: "legacy", strengths: [], weaknesses: [], coaching_focus: [], consumer_name: "Nina", consumer_phone: "08123456789", consumer_city: "Bandung", consumer_gender: "female", persona_config: { consumerType: "Rendah" } }, error: null });
    const response = await buildApp().request("/monitoring/history/telefun/00000000-0000-0000-0000-000000000001/review");
    const body = await response.json();
    expect(body.data.review_status).toBe("completed");
    expect(body.data.consumer_phone).toBe("08123456789");
    expect(body.data.consumer_city).toBe("Bandung");
    expect(body.data.consumer_gender).toBe("female");
    expect(body.data.coaching_recommendations).toEqual([{ text: "Perjelas penutupan", priority: 2 }]);
    expect(body.data.coaching_generated_at).toBe("2026-05-23T12:00:00Z");
  });

  it("drops malformed coaching recommendations and returns an explicit empty result", async () => {
    coachingSummary.mockResolvedValue({ data: { recommendations: [{ text: "Valid", priority: 5 }, { text: "", priority: 2 }, null, { text: "Bad priority", priority: Infinity }], generated_at: null }, error: null });
    single.mockResolvedValue({ data: { score: 0, recording_path: null, agent_recording_path: null, scenario_title: "Tagihan", duration_seconds: 0, voice_assessment: null, messages: [] }, error: null });
    const response = await buildApp().request("/monitoring/history/telefun/00000000-0000-0000-0000-000000000001/review");
    const body = await response.json();
    expect(body.data.coaching_recommendations).toEqual([{ text: "Valid", priority: 5 }]);
  });

  it("returns ketik monitoring details with simulation duration and resolution score", async () => {
    single.mockResolvedValue({
      data: {
        review_status: "pending",
        final_score: 0,
        empathy_score: 0,
        probing_score: 0,
        resolution_score: 0,
        typo_score: 0,
        compliance_score: 0,
        consumer_name: "Budi",
        consumer_phone: "0812",
        consumer_city: "Bandung",
        simulation_duration: 0,
        messages: [],
      },
      error: null,
    });

    const response = await buildApp().request(
      "/monitoring/history/ketik/00000000-0000-0000-0000-000000000001/review",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(select).toHaveBeenCalledWith(expect.stringContaining("simulation_duration"));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("resolution_score"));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("consumer_phone"));
    expect(select).toHaveBeenCalledWith(expect.stringContaining("consumer_city"));
    expect(body.data.review_status).toBe("pending");
    expect(body.data.scores).toMatchObject({ final: 0, empathy: 0, probing: 0, resolution: 0, typo: 0, compliance: 0 });
    expect(body.data.session).toMatchObject({ consumerName: "Budi", consumerPhone: "0812", consumerCity: "Bandung", simulationDuration: 0 });
    expect(body.data.session.messages).toEqual([]);
  });

  it("rejects external recording URLs without leaking them", async () => {
    single.mockResolvedValue({ data: { score: 8, recording_path: "https://attacker.example/call.webm", agent_recording_path: null, scenario_title: "Tagihan", duration_seconds: 60, voice_assessment: null, messages: [] }, error: null });
    const response = await buildApp().request("/monitoring/history/telefun/00000000-0000-0000-0000-000000000001/review");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.recording_url).toBeNull();
    expect(JSON.stringify(body)).not.toContain("attacker.example");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns 500 when coaching summary read fails", async () => {
    single.mockResolvedValue({ data: { score: 8, recording_path: null, agent_recording_path: null, scenario_title: "Tagihan", duration_seconds: 60, voice_assessment: null, messages: [] }, error: null });
    coachingSummary.mockResolvedValue({ data: null, error: { message: "coaching unavailable" } });
    const response = await buildApp().request("/monitoring/history/telefun/00000000-0000-0000-0000-000000000001/review");
    expect(response.status).toBe(500);
  });

  it("does not synthesize a missing KETIK consumer name", async () => {
    single.mockResolvedValue({ data: { review_status: "pending", final_score: 0, empathy_score: 0, probing_score: 0, resolution_score: 0, typo_score: 0, compliance_score: 0, consumer_name: null, consumer_phone: "0", consumer_city: "", simulation_duration: 0, messages: [] }, error: null });
    const response = await buildApp().request("/monitoring/history/ketik/00000000-0000-0000-0000-000000000001/review");
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.session.consumerName).toBeNull();
    expect(body.data.session.consumerPhone).toBe("0");
    expect(body.data.session.simulationDuration).toBe(0);
  });

  it("does not sign monitoring recording URLs for leader", async () => {
    currentRole = "leader";
    single.mockResolvedValue({
      data: {
        score: 8,
        user_id: "trainer-1",
        recording_path: "trainer-1/00000000-0000-0000-0000-000000000001/full_call.webm",
        agent_recording_path: "trainer-1/00000000-0000-0000-0000-000000000001/agent_only.webm",
        scenario_title: "Tagihan",
        duration_seconds: 60,
        voice_assessment: null,
        messages: [],
        ai_summary: null,
        strengths: null,
        weaknesses: null,
        coaching_focus: null,
      },
      error: null,
    });

    const response = await buildApp().request(
      "/monitoring/history/telefun/00000000-0000-0000-0000-000000000001/review",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(body.data.recording_url).toBeNull();
    expect(body.data.recording_path).toBe("trainer-1/00000000-0000-0000-0000-000000000001/full_call.webm");
  });
});
