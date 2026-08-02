import { describe, expect, it } from "vitest";
import { parseTelefunEnv } from "./env-schema.js";

const REQUIRED_ENV = {
  PORT: "3002",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  GEMINI_API_KEY: "gemini",
  ALLOWED_ORIGINS: "*",
  NODE_ENV: "test",
};

describe("Telefun environment schema", () => {
  it("defaults OpenAI off while preserving required Gemini configuration", () => {
    const parsed = parseTelefunEnv(REQUIRED_ENV);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.TELEFUN_OPENAI_ENABLED).toBe(false);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_POC_ENABLED).toBe(false);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS).toEqual([]);
    expect(parsed.data.OPENAI_API_KEY).toBeUndefined();
    expect(parsed.data.GEMINI_API_KEY).toBe("gemini");
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS).toBe(15_000);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS).toBe(10_000);
  });

  it("fails fast when OpenAI is enabled without a non-empty key", () => {
    for (const key of [undefined, "", "   "]) {
      const parsed = parseTelefunEnv({
        ...REQUIRED_ENV,
        TELEFUN_OPENAI_ENABLED: "true",
        OPENAI_API_KEY: key,
      });

      expect(parsed.success).toBe(false);
      if (parsed.success) continue;
      expect(parsed.error.flatten().fieldErrors.OPENAI_API_KEY).toContain(
        "OPENAI_API_KEY is required when TELEFUN_OPENAI_ENABLED=true",
      );
    }
  });

  it("accepts enabled OpenAI only with a server-side key", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_ENABLED: "true",
      OPENAI_API_KEY: "«redacted:sk-…»",
      TELEFUN_INTERNAL_TOKEN: "internal-secret",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.TELEFUN_OPENAI_ENABLED).toBe(true);
    expect(parsed.data.OPENAI_API_KEY).toBe("«redacted:sk-…»");
  });

  it("requires an internal token when OpenAI is enabled", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_ENABLED: "true",
      OPENAI_API_KEY: "«redacted:sk-…»",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires an OpenAI key when the WebRTC POC flag is enabled", () => {
    const missing = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_WEBRTC_POC_ENABLED: "true",
    });
    expect(missing.success).toBe(false);
    if (missing.success) return;
    expect(missing.error.flatten().fieldErrors.OPENAI_API_KEY).toContain(
      "OPENAI_API_KEY is required when TELEFUN_OPENAI_WEBRTC_POC_ENABLED=true",
    );

    const configured = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_WEBRTC_POC_ENABLED: "true",
      OPENAI_API_KEY: "server-key",
      TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY:
        "phase5-orphan-key-with-at-least-32-characters",
    });
    expect(configured.success).toBe(true);
    if (configured.success) {
      expect(configured.data.TELEFUN_OPENAI_WEBRTC_POC_ENABLED).toBe(true);
    }
  });

  it("rejects a weak provider-reference encryption secret", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_WEBRTC_POC_ENABLED: "true",
      OPENAI_API_KEY: "server-key",
      TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY: "short-key",
    });

    expect(parsed.success).toBe(false);
  });

  it("parses the exact trimmed UUID rollout allowlist and supports staging", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      NODE_ENV: "staging",
      TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS:
        "  019f45e3-5fac-7cd2-afeb-8069c2f813b3,not-a-uuid, 019f45e3-5fac-7cd2-afeb-8069c2f813b4 ",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.NODE_ENV).toBe("staging");
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS).toEqual([
      "019f45e3-5fac-7cd2-afeb-8069c2f813b3",
      "019f45e3-5fac-7cd2-afeb-8069c2f813b4",
    ]);
  });

  it("denies rollout eligibility outside development and staging", async () => {
    const { isTelefunOpenAiWebRtcAllowed } =
      await import("./realtime-webrtc/rollout-gate.js");
    const config = {
      enabled: true,
      allowedUserIds: ["019f45e3-5fac-7cd2-afeb-8069c2f813b3"],
    };
    expect(
      isTelefunOpenAiWebRtcAllowed({
        ...config,
        nodeEnv: "development",
        userId: config.allowedUserIds[0],
      }),
    ).toBe(true);
    expect(
      isTelefunOpenAiWebRtcAllowed({
        ...config,
        nodeEnv: "staging",
        userId: config.allowedUserIds[0],
      }),
    ).toBe(true);
    expect(
      isTelefunOpenAiWebRtcAllowed({
        ...config,
        nodeEnv: "test",
        userId: config.allowedUserIds[0],
      }),
    ).toBe(false);
    expect(
      isTelefunOpenAiWebRtcAllowed({
        ...config,
        nodeEnv: "production",
        userId: config.allowedUserIds[0],
      }),
    ).toBe(false);
  });

  it("accepts bounded independent WebRTC deadlines", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS: "22000",
      TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS: "7000",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS).toBe(
        22_000,
      );
      expect(parsed.data.TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS).toBe(7_000);
    }
  });

  it("rejects non-positive or unreasonably large WebRTC deadlines", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS: "0",
      TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS: "999999999",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires exact HTTPS origins in production and bounds distributed hardening", () => {
    const wildcard = parseTelefunEnv({
      ...REQUIRED_ENV,
      NODE_ENV: "production",
    });
    expect(wildcard.success).toBe(false);

    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://web.example.test",
      TELEFUN_OPENAI_WEBRTC_LEASE_TTL_MS: "45000",
      TELEFUN_OPENAI_WEBRTC_LEASE_HEARTBEAT_MS: "5000",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_LEASE_TTL_MS).toBe(45_000);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_LEASE_HEARTBEAT_MS).toBe(5_000);

    for (const invalidOrigin of [
      "https://*.example.test",
      "https://web.example.test/path",
      "https://user:pass@web.example.test",
      "http://web.example.test",
    ]) {
      expect(
        parseTelefunEnv({
          ...REQUIRED_ENV,
          NODE_ENV: "production",
          ALLOWED_ORIGINS: invalidOrigin,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts an internal token alongside OpenAI config", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_ENABLED: "true",
      OPENAI_API_KEY: "«redacted:sk-…»",
      TELEFUN_INTERNAL_TOKEN: "internal-secret",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.TELEFUN_INTERNAL_TOKEN).toBe("internal-secret");
  });
});
