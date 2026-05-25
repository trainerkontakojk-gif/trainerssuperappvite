import { describe, expect, it } from "vitest";
import {
  buildTelefunSettingsUpsertPayload,
  buildTelefunSessionInsertPayload,
  isTelefunRecordingPathOwnedBySession,
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
});
