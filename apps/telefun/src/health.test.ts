import { describe, expect, it } from "vitest";
import { buildTelefunHealthPayload } from "./health.js";

describe("Telefun health payload", () => {
  it("reports Gemini-only non-billable readiness without secrets", () => {
    const payload = buildTelefunHealthPayload(
      { geminiConfigured: true },
      { uptime: 12.5, timestamp: "2026-07-17T00:00:00.000Z" },
    );

    expect(payload).toEqual({
      status: "ok",
      uptime: 12.5,
      timestamp: "2026-07-17T00:00:00.000Z",
      readiness: {
        acceptingSessions: true,
        providers: {
          gemini: { enabled: true, configured: true, ready: true },
          openai: { enabled: false, configured: false, ready: false },
        },
      },
    });
    expect(JSON.stringify(payload)).not.toContain("key");
    expect(JSON.stringify(payload)).not.toContain("token");
  });

  it("hard-disables OpenAI and does not accept sessions without Gemini even under retired flags", () => {
    const payload = buildTelefunHealthPayload(
      {
        geminiConfigured: false,
        openAIEnabled: true,
        openAIConfigured: true,
      },
      { uptime: 1, timestamp: "now" },
    );

    expect(payload.readiness.acceptingSessions).toBe(false);
    expect(payload.readiness.providers.openai).toEqual({
      enabled: false,
      configured: false,
      ready: false,
    });
  });
});
