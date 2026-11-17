import { execFileSync } from "node:child_process";
import { createServer, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Explicit disposable stack only: never read a developer or production env file.
const workdir = process.env.E2E_SUPABASE_WORKDIR;
if (!workdir) throw new Error("E2E_SUPABASE_WORKDIR is required");
const status = JSON.parse(
  execFileSync("supabase", ["status", "--workdir", workdir, "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
for (const url of [status.API_URL, status.DB_URL]) {
  if (
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname)
  )
    throw new Error("Integration target must be loopback");
}
Object.assign(process.env, {
  NODE_ENV: "test",
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  GEMINI_API_KEY: "test-only",
  OPENAI_API_KEY: "test-only",
  GEMINI_PROXY_URL: "",
});

describe("OpenAI cancellation integration", () => {
  let client: SupabaseClient;
  let userId: string;
  let server: Server;
  let origin: string;
  let generate: typeof import("../lib/openai").generateOpenAIContent;
  let mode: "hold" | "retry" | "success";
  let calls: number;
  let held: ServerResponse | undefined;
  let started: (() => void) | undefined;
  let on503: (() => void) | undefined;
  const originalFetch = globalThis.fetch;
  const options = (action: string) => ({
    model: "gpt-5.4-mini",
    contents: [{ role: "user", parts: [{ text: "test" }] }],
    usageContext: { module: "ketik" as const, action },
    userId,
  });
  const success = (res: ServerResponse) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        output_text: "ok",
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    );
  };
  const usage = async (action: string) => {
    const { data, error } = await client
      .from("ai_usage_logs")
      .select("status,error_message,input_tokens,output_tokens,total_tokens")
      .eq("user_id", userId)
      .eq("action", action);
    expect(error).toBeNull();
    return data;
  };
  beforeAll(async () => {
    client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const created = await client.auth.admin.createUser({
      email: `openai-cancel-${randomUUID()}@local.test`,
      password: randomUUID(),
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    userId = created.data.user!.id;
    server = createServer((_req, res) => {
      calls++;
      if (mode === "hold") {
        held = res;
        started?.();
        return;
      }
      if (mode === "retry" && calls === 1) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "retry" } }));
        return;
      }
      success(res);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Provider stub failed to bind");
    origin = `http://127.0.0.1:${address.port}`;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.hostname === "api.openai.com") {
        const response = await originalFetch(
          new Request(origin + url.pathname, request),
        );
        if (response.status === 503) on503?.();
        return response;
      }
      if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname))
        throw new Error("Non-loopback egress blocked");
      return originalFetch(request);
    };
    ({ generateOpenAIContent: generate } = await import("../lib/openai"));
  });
  beforeEach(() => {
    calls = 0;
    mode = "success";
    held = undefined;
    started = undefined;
    on503 = undefined;
  });
  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (userId) {
      await client.from("ai_usage_logs").delete().eq("user_id", userId);
      expect((await client.auth.admin.deleteUser(userId)).error).toBeNull();
    }
    if (server)
      await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  it("does not start a request when already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("KETIK review deadline"));
    const result = await generate({
      ...options("preabort"),
      signal: controller.signal,
    });
    expect(result.success).toBe(false);
    expect(calls).toBe(0);
    expect(await usage("preabort")).toEqual([
      expect.objectContaining({
        status: "timeout",
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        error_message: expect.stringContaining("cancelled:"),
      }),
    ]);
  });
  it("aborts an in-flight request and records the cancellation", async () => {
    mode = "hold";
    const controller = new AbortController();
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = generate({
      ...options("inflight"),
      signal: controller.signal,
    });
    await begun;
    controller.abort(new Error("KETIK review shutdown"));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("cancel did not settle")),
            3000,
          );
        }),
      ]);
      expect(result.success).toBe(false);
      expect(calls).toBe(1);
      expect(await usage("inflight")).toEqual([
        expect.objectContaining({
          status: "timeout",
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          error_message: expect.stringContaining("cancelled:"),
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (held && !held.destroyed) success(held);
      await pending;
    }
  });
  it("stops during retry backoff after a 503 and logs timeout", async () => {
    mode = "retry";
    const controller = new AbortController();
    on503 = () => {
      setImmediate(() => controller.abort(new Error("KETIK review deadline")));
    };
    const result = await generate({
      ...options("backoff"),
      signal: controller.signal,
    });
    expect(result.success).toBe(false);
    expect(calls).toBe(1);
    expect(await usage("backoff")).toEqual([
      expect.objectContaining({
        status: "timeout",
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        error_message: expect.stringContaining("cancelled:"),
      }),
    ]);
  });
  it("still retries a 503 when no cancellation signal is passed", async () => {
    mode = "retry";
    const result = await generate(options("unchanged"));
    expect(result).toMatchObject({ success: true, text: "ok" });
    expect(calls).toBe(2);
  });
});
