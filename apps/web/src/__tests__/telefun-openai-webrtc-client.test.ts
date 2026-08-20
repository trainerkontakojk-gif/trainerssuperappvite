import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { cleanupHistoricalOpenAiWebRtcSession } from "../routes/telefun/services/openaiWebRtc/openaiWebRtcSession";

const source = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)), "../routes/telefun/services/openaiWebRtc/openaiWebRtcSession.ts"),
  "utf8",
);

const sessionId = "550e8400-e29b-41d4-a716-446655440000";

describe("historical OpenAI WebRTC browser cleanup", () => {
  it("keeps any stale cached start shell fail-closed without media implementation", () => {
    expect(source).toContain("permanently disabled for Telefun");
    expect(source).not.toContain("createOffer");
    expect(source).not.toContain("MediaRecorder");
  });

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
