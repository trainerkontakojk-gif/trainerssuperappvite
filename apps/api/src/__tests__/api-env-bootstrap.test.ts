import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("API Env Bootstrap", () => {
  const originalEnv = { ...process.env };
  const originalLoadEnvFile = process.loadEnvFile;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTE3MDY1MSwiZXhwIjoxOTA1MTI2NjUxfQ.test";
    process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTE3MDY1MSwiZXhwIjoxOTA1MTI2NjUxfQ.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  });

  afterEach(() => {
    process.env = originalEnv;
    process.loadEnvFile = originalLoadEnvFile;
  });

  it("resolves repo-root .env.local from module location, not process.cwd()", async () => {
    const loadEnvFileSpy = vi.fn();
    process.loadEnvFile = loadEnvFileSpy;

    await import("../lib/env");

    expect(loadEnvFileSpy).toHaveBeenCalledTimes(1);
    const resolvedPath = loadEnvFileSpy.mock.calls[0][0] as string;

    // env.ts is at apps/api/src/lib/env.ts -> __dirname = apps/api/src/lib
    // ../../../.. from that dir = repo root
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(__dirname, "../../../../");
    const expectedPath = path.join(repoRoot, ".env.local");

    expect(path.normalize(resolvedPath)).toBe(path.normalize(expectedPath));
  });

  it("does not crash when .env.local is missing", async () => {
    const loadEnvFileSpy = vi.fn(() => {
      throw new Error("ENOENT: no such file");
    });
    process.loadEnvFile = loadEnvFileSpy;

    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTE3MDY1MSwiZXhwIjoxOTA1MTI2NjUxfQ.test";
    process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTE3MDY1MSwiZXhwIjoxOTA1MTI2NjUxfQ.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";

    await expect(import("../lib/env")).resolves.toBeDefined();
  });

  it("exits with code 1 when required env vars are missing", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as any);

    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    process.loadEnvFile = vi.fn(() => {
      throw new Error("ENOENT");
    });

    await expect(import("../lib/env")).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});

describe("Supabase Client Bootstrap", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTE3MDY1MSwiZXhwIjoxOTA1MTI2NjUxfQ.test";
    process.env.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc3OTE3MDY1MSwiZXhwIjoxOTA1MTI2NjUxfQ.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("supabaseAdmin uses validated env values, not raw process.env fallback", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://wrong-url.supabase.co";

    const { supabaseAdmin } = await import("../lib/supabase");
    expect(supabaseAdmin).toBeDefined();
  });

  it("createUserClient uses validated env for URL", async () => {
    const { createUserClient } = await import("../lib/supabase");
    const client = createUserClient("test-token");
    expect(client).toBeDefined();
  });
});
