import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { TelefunAppSettings } from "../routes/telefun/telefunSettings";
import {
  cleanupOpenAIWebRtcSession,
  createTelefunTransport,
  deriveTelefunBrokerHttpBaseUrl,
  mapTelefunTransportError,
} from "../routes/telefun/services/telefunTransport";

const legacyConfig = {
  telefunTransport: "openai-webrtc",
  telefunModelId: "gpt-realtime-2.1",
} as unknown as TelefunAppSettings;

const source = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../routes/telefun/services/telefunTransport.ts",
  ),
  "utf8",
);

describe("Telefun transport retirement", () => {
  it("normalizes historical transport to the Gemini Live session", () => {
    const session = createTelefunTransport(legacyConfig, { accessToken: "token" });
    expect(session.constructor.name).toBe("LiveSession");
  });

  it("retains only the DELETE cleanup helper", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    });
    await cleanupOpenAIWebRtcSession({
      websocketUrl: "wss://telefun.example/ws",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      accessToken: "token",
      fetch,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps a typed Gemini transport surface without retired lifecycle widening", () => {
    expect(source).not.toContain("as unknown as TelefunTransportSession");
    expect(source).not.toContain("...args: any[]");
    expect(source).not.toContain('"provider_error"');
    expect(source).not.toContain('"network_lost"');
  });

  it("keeps safe cleanup and microphone error mapping", () => {
    expect(mapTelefunTransportError({ code: "cleanup_pending" })).toContain("tersimpan");
    expect(mapTelefunTransportError({ name: "NotAllowedError" })).toContain("mikrofon");
  });

  it("derives cleanup origin without exposing websocket query data", () => {
    expect(deriveTelefunBrokerHttpBaseUrl("wss://telefun.example/ws?secret=x")).toBe("https://telefun.example");
  });
});
