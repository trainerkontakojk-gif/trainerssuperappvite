import { describe, expect, it } from "vitest";
import {
  buildTelefunSettingsUpsertPayload,
  buildTelefunSessionInsertPayload,
  isTelefunRecordingPathOwnedBySession,
  buildTelefunSessionUpdatePayload,
  buildTelefunFeedbackSummary,
} from "../routes/telefun";

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
      speakingRate: { score: 8, wordsPerMinute: 145, verdict: "Baik", feedback: "Tempo bicara stabil." },
      intonation: { score: 7, verdict: "Cukup", feedback: "Intonasi perlu lebih hangat." },
      articulation: { score: 8, verdict: "Baik", feedback: "Artikulasi jelas." },
      fillerWords: { score: 9, count: 1, examples: ["eee"], verdict: "Baik", feedback: "Kata pengisi minim." },
      emotionalTone: { score: 7, dominant: "tenang", verdict: "Cukup", feedback: "Empati perlu lebih eksplisit." },
      transcript: "",
      highlights: [],
      strengths: [],
    });

    expect(summary).toContain("Tempo bicara stabil.");
    expect(summary).toContain("Intonasi perlu lebih hangat.");
    expect(summary).toContain("Artikulasi jelas.");
  });
});
