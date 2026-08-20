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
  it("starts Gemini with every retired OpenAI admission value set and no OpenAI key", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_ENABLED: "true",
      TELEFUN_OPENAI_WEBRTC_POC_ENABLED: "true",
      TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS: "user-1,not-a-uuid",
      TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS:
        "gpt-realtime-2.1,gpt-realtime-2.1-mini",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.GEMINI_API_KEY).toBe("gemini");
    expect(parsed.data.OPENAI_API_KEY).toBeUndefined();
    expect(parsed.data.TELEFUN_OPENAI_ENABLED).toBe(false);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_POC_ENABLED).toBe(false);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS).toEqual([]);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS).toEqual([]);
  });

  it("treats malformed retired admission values as no-ops rather than startup failures", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_ENABLED: "enable-now",
      TELEFUN_OPENAI_WEBRTC_POC_ENABLED: { stale: true },
      TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS: ["cohort"],
      TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS: { model: "gpt-realtime-2.1" },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.TELEFUN_OPENAI_ENABLED).toBe(false);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_POC_ENABLED).toBe(false);
  });

  it("keeps an OpenAI key optional and cleanup-only", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      OPENAI_API_KEY: "cleanup-key",
      TELEFUN_INTERNAL_TOKEN: "internal-secret",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.OPENAI_API_KEY).toBe("cleanup-key");
    expect(parsed.data.TELEFUN_INTERNAL_TOKEN).toBe("internal-secret");
    expect(parsed.data.TELEFUN_OPENAI_ENABLED).toBe(false);
  });

  it("retains validation for an explicitly configured cleanup-reference key", () => {
    expect(
      parseTelefunEnv({
        ...REQUIRED_ENV,
        TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY: "short-key",
      }).success,
    ).toBe(false);

    expect(
      parseTelefunEnv({
        ...REQUIRED_ENV,
        TELEFUN_OPENAI_WEBRTC_ORPHAN_KEY:
          "historical-cleanup-key-with-at-least-32-characters",
      }).success,
    ).toBe(true);
  });

  it("keeps bounded cleanup timeouts independent of retired admission", () => {
    const parsed = parseTelefunEnv({
      ...REQUIRED_ENV,
      TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS: "22000",
      TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS: "7000",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_PROVIDER_TIMEOUT_MS).toBe(22_000);
    expect(parsed.data.TELEFUN_OPENAI_WEBRTC_SIDEBAND_TIMEOUT_MS).toBe(7_000);
  });

  it("requires exact HTTPS origins in production", () => {
    expect(
      parseTelefunEnv({ ...REQUIRED_ENV, NODE_ENV: "production" }).success,
    ).toBe(false);

    expect(
      parseTelefunEnv({
        ...REQUIRED_ENV,
        NODE_ENV: "production",
        ALLOWED_ORIGINS: "https://web.example.test",
      }).success,
    ).toBe(true);
  });
});
