/**
 * E2E: the API's per-IP rate limit keys on the client address the edge proxy
 * vouches for, not on what the caller writes into `X-Forwarded-For`.
 *
 * Railway's edge appends the real peer address as the RIGHTMOST
 * `X-Forwarded-For` hop; anything to its left came from the caller. These
 * requests mimic that shape: a caller-chosen value on the left, a fixed proxy
 * hop on the right.
 *
 * Runs the real API app (`apps/api/src/app.ts`) in-process. Supabase env is
 * pinned to an unreachable loopback before import and fetch is guarded, so no
 * request can leave the process. Requests carry no token, so the auth
 * middleware answers 401 after the limiter has counted them.
 */

import { randomInt } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { installLoopbackFetchGuard } from "./helpers/sidakRealBackend";

const LIMIT = 200;
let app: Hono;

// Fresh documentation-range address per call so one test's in-memory bucket
// can never satisfy another.
function proxyHop(): string {
  const group = () => randomInt(1, 0xffff).toString(16);
  return `2001:db8::${group()}:${group()}:${group()}`;
}

function send(forwardedFor: string) {
  return app.request("http://localhost/api/v1/home", {
    headers: { "x-forwarded-for": forwardedFor },
  });
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: "http://127.0.0.1:9",
    VITE_SUPABASE_ANON_KEY: "e2e-only",
    SUPABASE_ANON_KEY: "e2e-only",
    SUPABASE_SERVICE_ROLE_KEY: "e2e-only",
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test("spoofed leftmost X-Forwarded-For values share the real client's bucket", async () => {
  const realClient = proxyHop();

  for (let i = 0; i < LIMIT; i++) {
    const res = await send(`198.51.100.${i % 250}, ${realClient}`);
    expect(res.status, `request ${i + 1}`).toBe(401);
  }

  const blocked = await send(`192.0.2.77, ${realClient}`);
  expect(blocked.status).toBe(429);
  expect(await blocked.json()).toMatchObject({
    success: false,
    error: { code: "RATE_LIMITED" },
  });
});

test("a different real client keeps its own bucket", async () => {
  const limited = proxyHop();
  for (let i = 0; i <= LIMIT; i++) await send(`10.0.0.1, ${limited}`);
  expect((await send(limited)).status).toBe(429);

  const other = await send(`10.0.0.1, ${proxyHop()}`);
  expect(other.status).toBe(401);
  expect(other.headers.get("x-ratelimit-remaining")).toBe(String(LIMIT - 1));
});

test("a single-hop header is still the client key", async () => {
  const client = proxyHop();
  const first = await send(client);
  expect(first.status).toBe(401);
  expect(first.headers.get("x-ratelimit-remaining")).toBe(String(LIMIT - 1));
  const second = await send(` ${client} `);
  expect(second.headers.get("x-ratelimit-remaining")).toBe(String(LIMIT - 2));
});
