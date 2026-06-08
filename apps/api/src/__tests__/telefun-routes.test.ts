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
} from "../routes/telefun";

import { telefunTranscriptSchema, parseTelefunTranscript } from "@trainers/types";

describe("telefun API payload and security validators", () => {
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
      telefun_model_id: null,
      telefun_transport: null,
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
