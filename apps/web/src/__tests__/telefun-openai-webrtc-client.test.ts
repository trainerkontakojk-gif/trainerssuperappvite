import { describe, expect, it, vi } from "vitest";
import { cleanupHistoricalOpenAiWebRtcSession } from "../routes/telefun/services/openaiWebRtc/openaiWebRtcSession";

const sessionId = "550e8400-e29b-41d4-a716-446655440000";

describe("historical OpenAI WebRTC browser cleanup", () => {
  it("allows only an owner-bound DELETE cleanup through the broker client", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    });

    await cleanupHistoricalOpenAiWebRtcSession({
      fetch,
      brokerHttpBaseUrl: "https://broker.example",
      sessionId,
      accessToken: "token",
    });

    expect(fetch).toHaveBeenCalledOnce();
  });
});
