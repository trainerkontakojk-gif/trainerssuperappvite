import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildWebRtcRecoveryPlan,
  classifyWebRtcRecoveryCause,
  type WebRtcRecoveryCause,
} from "../routes/telefun/services/openaiWebRtc/recovery-policy";
import { deleteOpenAIWebRtcBrokerCall } from "../routes/telefun/services/openaiWebRtc/brokerApi";
import { OpenAIWebRtcSession } from "../routes/telefun/services/openaiWebRtc/openaiWebRtcSession";
import type { OpenAIWebRtcDependencies } from "../routes/telefun/services/openaiWebRtc/contracts";

describe("OpenAI WebRTC browser/network recovery", () => {
  it.each([
    "network_lost",
    "tab_crash",
    "device_unplugged",
    "wifi_mobile_switch",
  ] as WebRtcRecoveryCause[])(
    "creates a new session boundary for %s",
    (cause) => {
      const plan = buildWebRtcRecoveryPlan({
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        previousAttemptId: "attempt-old",
        cause,
        nowMs: 123,
        createId: (() => {
          let index = 0;
          return () => `id-${++index}`;
        })(),
      });
      expect(plan.outcome).toBe("network_lost");
      expect(plan.requiresNewSessionBoundary).toBe(true);
      expect(plan.newAttemptId).not.toBe("attempt-old");
      expect(plan.discontinuityId).toBe("id-2");
      expect(plan.reason).toBe(cause);
    },
  );

  it("does not misclassify provider errors as recoverable network loss", () => {
    expect(classifyWebRtcRecoveryCause("provider_error")).toBe("failed");
  });

  it("sends network_lost as a bounded terminal outcome without provider details", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    await deleteOpenAIWebRtcBrokerCall({
      fetch: async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response(null, { status: 204 });
      },
      brokerHttpBaseUrl: "https://telefun.example",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      accessToken: "supabase-token",
      outcome: "network_lost",
    });
    expect(calls[0]?.url).toContain("outcome=network_lost");
    expect(calls[0]?.init?.headers).toEqual({
      Authorization: "Bearer supabase-token",
    });
    expect(JSON.stringify(calls)).not.toContain("api.openai.com");
  });

  it("keeps production CSP connect targets fixed to approved deployment domains", () => {
    for (const path of [
      "../../apps/web/public/serve.json",
      "../../vercel.json",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("connect-src 'self' https: wss:");
      expect(source).toContain("frame-ancestors 'none'");
      expect(source).toContain("Permissions-Policy");
    }
  });

  it("rejects insecure broker transport before requesting microphone or SDP", async () => {
    const fetch = vi.fn();
    const getUserMedia = vi.fn();
    const session = new OpenAIWebRtcSession(
      {
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        accessToken: "supabase-token",
        brokerHttpBaseUrl: "http://telefun.example",
        requireSecureTransport: true,
      },
      {
        RTCPeerConnection:
          class {} as OpenAIWebRtcDependencies["RTCPeerConnection"],
        fetch,
        mediaDevices: { getUserMedia },
        audioElement: {
          srcObject: null,
          play: vi.fn(async () => undefined),
        },
      },
    );

    await expect(session.connect()).rejects.toThrow(/HTTPS/);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
