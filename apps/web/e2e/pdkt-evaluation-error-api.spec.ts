import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Hono } from "hono";
import { PDKT_EVALUATION_ERROR_CODES } from "@trainers/types";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";

// Real routers + local DB. No provider egress: the fake key and fetch guard
// exercise the normal failed-evaluation path, not a mocked service result.
test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let owner: Identity;
let trainer: Identity;
let app: Hono;
const mailboxIds: string[] = [];
const historyIds: string[] = [];

async function api(path: string, token: string, body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  owner = await createUserWithJwt(env, "agent", `pdkt-errors-${ns}`);
  trainer = await createUserWithJwt(env, "trainer", `pdkt-errors-${ns}`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
});

test.afterAll(async () => {
  const admin = createAdmin(env);
  if (historyIds.length)
    await admin.from("pdkt_history").delete().in("id", historyIds);
  if (mailboxIds.length)
    await admin.from("pdkt_mailbox_items").delete().in("id", mailboxIds);
  for (const identity of [owner, trainer].filter(Boolean))
    await admin.auth.admin.deleteUser(identity.userId);
});

test("failed telaah stores only a public error code through the real retry route", async () => {
  const scenario = {
    id: `scenario-${ns}`,
    category: "Pinjaman",
    title: "Tagihan setelah lunas",
    description: "Konsumen sudah melunasi pinjaman tetapi masih ditagih.",
    isActive: true,
  };
  const inbound = {
    id: `email-${ns}`,
    from: `konsumen-${ns}@mail.test`,
    to: "konsumen@ojk.go.id",
    subject: "Tagihan setelah lunas",
    body: "Saya sudah melunasi pinjaman tetapi masih ditagih. Mohon bantuan.",
    timestamp: new Date().toISOString(),
    isAgent: false,
  };
  const config = {
    scenarios: [scenario],
    consumerType: {
      id: "calm",
      name: "Tenang",
      description: "Tenang",
      difficulty: "Easy",
      tone: "Tenang",
    },
    identity: {
      name: "Budi",
      email: inbound.from,
      city: "Bandung",
      bodyName: "Budi",
    },
    enableImageGeneration: false,
    selectedModel: "gemini-3.8-flash",
    resolvedConsumerNameMentionPattern: "none",
    writingStyleMode: "training",
  };
  const inserted = await createAdmin(env)
    .from("pdkt_mailbox_items")
    .insert({
      user_id: owner.userId,
      created_by_user_id: owner.userId,
      client_request_id: `e2e-errors-${randomUUID()}`,
      status: "open",
      is_shared_copy: false,
      sender_name: "Budi",
      sender_email: inbound.from,
      subject: inbound.subject,
      snippet: inbound.body,
      scenario_snapshot: scenario,
      config_snapshot: config,
      inbound_email: inbound,
      emails_thread: [inbound],
    })
    .select("id")
    .single();
  expect(inserted.error).toBeNull();
  const mailboxId = inserted.data!.id;
  mailboxIds.push(mailboxId);
  const client = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${owner.token}` } },
  });
  const reply = await client.rpc("submit_pdkt_mailbox_reply_with_outcome", {
    p_mailbox_id: mailboxId,
    p_agent_reply: {
      id: `reply-${ns}`,
      from: owner.email,
      to: inbound.from,
      subject: `Re: ${inbound.subject}`,
      body: "Mohon maaf, kami periksa status pinjaman Bapak.",
      timestamp: new Date().toISOString(),
      isAgent: true,
    },
    p_time_taken: 30,
  });
  expect(reply.error).toBeNull();
  const historyId = reply.data.history_id as string;
  historyIds.push(historyId);
  const retry = await api("/pdkt/history/retry-eval", owner.token, {
    historyId,
  });
  expect(retry.status).toBe(200);
  await expect
    .poll(
      async () => {
        const row = await createAdmin(env)
          .from("pdkt_history")
          .select("evaluation_status")
          .eq("id", historyId)
          .single();
        expect(row.error).toBeNull();
        return row.data?.evaluation_status;
      },
      { timeout: 45000, intervals: [250, 500, 1000] },
    )
    .toBe("failed");
  const row = await createAdmin(env)
    .from("pdkt_history")
    .select("evaluation_error")
    .eq("id", historyId)
    .single();
  expect(row.error).toBeNull();
  expect(PDKT_EVALUATION_ERROR_CODES).toContain(row.data?.evaluation_error);
  // The blocked provider call is an unavailable AI, not a parse or save failure.
  expect(row.data?.evaluation_error).toBe("ai_unavailable");
  expect(row.data?.evaluation_error).not.toMatch(/e2e-only|fetch|http/i);
  const status = await api(`/pdkt/history/eval/${historyId}`, owner.token);
  expect(status.status).toBe(200);
  expect((await status.json()).data.evaluation_error).toBe(
    row.data?.evaluation_error,
  );
  // The other runtime caller must not forward the provider message either.
  const synchronous = await api("/pdkt/mailbox/evaluate", trainer.token, {
    config,
    emails: [
      inbound,
      {
        ...inbound,
        id: `sync-reply-${ns}`,
        from: owner.email,
        to: inbound.from,
        body: "Mohon maaf, kami periksa status pinjaman Bapak.",
        isAgent: true,
      },
    ],
  });
  expect(synchronous.status).toBe(502);
  expect((await synchronous.json()).error).toEqual({
    code: "AI_ERROR",
    message:
      "AI belum bisa menelaah balasan ini. Coba lagi beberapa saat lagi.",
  });
});

test("missing email returns the new copy without changing status or code", async () => {
  const response = await api(`/pdkt/mailbox/${randomUUID()}`, owner.token);
  expect(response.status).toBe(404);
  expect((await response.json()).error).toEqual({
    code: "NOT_FOUND",
    message: "Email tidak ditemukan.",
  });
});

test("invalid JWT is rejected by auth before the PDKT copy mapper", async () => {
  const response = await api("/pdkt/mailbox", "invalid-e2e-token");
  expect(response.status).toBe(401);
  expect((await response.json()).success).toBe(false);
  // The auth middleware owns this response; intentionally no 'masuk kembali'
  // assertion here, as allowed by the plan. No bypass of real auth.
});
