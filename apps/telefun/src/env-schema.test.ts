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
    expect(parsed.data.OPENAI_API_KEY).toBeUndefined();
    expect(parsed.data.GEMINI_API_KEY).toBe("gemini");
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
      OPENAI_API_KEY: "sk-configured",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.TELEFUN_OPENAI_ENABLED).toBe(true);
    expect(parsed.data.OPENAI_API_KEY).toBe("sk-configured");
  });
});
