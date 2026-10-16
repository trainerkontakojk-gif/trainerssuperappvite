import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

// Real auth/router/database. Only failed HTTP boundaries are injected; no
// product service is stubbed and no provider traffic leaves this process.
test.describe.configure({ mode: "serial" });
const env = readLoopbackEnv();
const marker = "e2e-internal-provider-database-detail";
let owner: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let failedTable: string | undefined;
let guardedFetch: typeof fetch;
let providerCalls: string[] = [];

async function api(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${owner.token}`,
      "Content-Type": "application/json",
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function expectSafe(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain(marker);
  expect(body).toMatchObject({ success: false, error: { code, message } });
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
  guardedFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin === new URL(env.apiUrl).origin &&
      url.pathname === `/rest/v1/${failedTable}`
    ) {
      return Response.json({ code: "XX000", message: marker }, { status: 500 });
    }
    if (
      ["generativelanguage.googleapis.com", "api.openai.com"].includes(
        url.hostname,
      )
    ) {
      providerCalls.push(
        url.hostname === "api.openai.com"
          ? JSON.parse(String(init?.body)).model
          : url.pathname,
      );
      return Response.json(
        { error: { code: 400, message: marker, status: "INVALID_ARGUMENT" } },
        { status: 400 },
      );
    }
    return guardedFetch(input, init);
  };
  owner = await createUserWithJwt(
    env,
    "admin",
    `ketik-errors-${randomUUID().slice(0, 8)}`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
  const { env: apiEnv } = await import("../../api/src/lib/env");
  expect(apiEnv.VITE_SUPABASE_URL).toBe(env.apiUrl);
});

test.beforeEach(() => {
  failedTable = undefined;
  providerCalls = [];
});
test.afterAll(async () => {
  failedTable = undefined;
  globalThis.fetch = guardedFetch;
  if (owner) {
    const deleted = await createAdmin(env).auth.admin.deleteUser(owner.userId);
    expect(deleted.error).toBeNull();
  }
});

test("database errors in settings, mutation, detail, and worker stay private", async () => {
  failedTable = "user_settings";
  await expectSafe(
    await api("/settings"),
    500,
    "SETTINGS_LOAD_FAILED",
    "Pengaturan belum bisa dimuat. Coba lagi.",
  );
  await expectSafe(
    await api("/settings", "PUT", DEFAULT_KETIK_SETTINGS),
    500,
    "SETTINGS_SAVE_FAILED",
    "Pengaturan belum bisa disimpan. Coba lagi.",
  );
  failedTable = "ketik_history";
  await expectSafe(
    await api("/history", "DELETE"),
    500,
    "HISTORY_DELETE_FAILED",
    "Riwayat belum bisa dihapus. Coba lagi.",
  );
  await expectSafe(
    await api(`/history/${randomUUID()}`, "DELETE"),
    500,
    "HISTORY_DELETE_FAILED",
    "Riwayat belum bisa dihapus. Coba lagi.",
  );
  // An unavailable DB is not the same as a missing result.
  await expectSafe(
    await api(`/review/${randomUUID()}`),
    500,
    "REVIEW_LOAD_FAILED",
    "Hasil telaah belum bisa dimuat. Coba lagi.",
  );
  await expectSafe(
    await api(`/review/status/${randomUUID()}`),
    500,
    "REVIEW_LOAD_FAILED",
    "Hasil telaah belum bisa dimuat. Coba lagi.",
  );
  failedTable = "ketik_review_jobs";
  await expectSafe(
    await api("/worker"),
    500,
    "REVIEW_FAILED",
    "Telaah belum bisa diproses. Coba lagi.",
  );
});

test("template failures stay private and settings conflicts never overwrite server data", async () => {
  failedTable = "ketik_global_settings";
  await expectSafe(
    await api("/templates", "PUT", { templates: [] }),
    500,
    "TEMPLATES_SAVE_FAILED",
    "Template belum bisa disimpan. Coba lagi.",
  );
  failedTable = undefined;
  const admin = createAdmin(env);
  const before = await admin
    .from("user_settings")
    .select("settings, updated_at")
    .eq("user_id", owner.userId)
    .maybeSingle();
  expect(before.error).toBeNull();
  const conflict = await api("/settings", "PUT", DEFAULT_KETIK_SETTINGS, {
    "x-settings-version": "2020-01-01T00:00:00.000Z",
  });
  expect(conflict.status).toBe(409);
  expect((await conflict.json()).error.code).toBe("SETTINGS_CONFLICT");
  const after = await admin
    .from("user_settings")
    .select("settings, updated_at")
    .eq("user_id", owner.userId)
    .maybeSingle();
  expect(after.error).toBeNull();
  expect(after.data).toEqual(before.data);
});

test("missing sessions keep 404 with Indonesian copy", async () => {
  await expectSafe(
    await api(`/review/status/${randomUUID()}`),
    404,
    "NOT_FOUND",
    "Sesi tidak ditemukan.",
  );
});

test("generation hides raw provider detail while preserving failure status", async () => {
  const started = await api("/sessions", "POST", { requestId: randomUUID() });
  expect(started.status).toBe(200);
  const active = (await started.json()).data;
  await expectSafe(
    await api(`/sessions/${active.id}/turns`, "POST", {
      requestId: randomUUID(),
      expectedVersion: 0,
      text: "Saya bantu.",
    }),
    502,
    "SESSION_AI_FAILED",
    "Balasan konsumen belum tersedia. Coba lagi untuk pesan yang sama.",
  );
  expect(providerCalls).toHaveLength(1);
});

test("failed review, polling, and worker return safe copy and still use primary then fallback", async () => {
  // Review fixture setup bypasses the retired browser transcript endpoint.
  const saved = await createAdmin(env)
    .from("ketik_history")
    .insert({
      user_id: owner.userId,
      scenario_title: "KETIK error fixture",
      consumer_name: "Konsumen",
      consumer_city: "Bandung",
      consumer_phone: "0800000000",
      messages: [
        {
          id: "m1",
          sender: "agent",
          text: "Saya bantu.",
          timestamp: new Date().toISOString(),
        },
      ],
    })
    .select("id")
    .single();
  expect(saved.error).toBeNull();
  const session = saved.data!;
  const response = await api("/review", "POST", { sessionId: session.id });
  expect(response.status).toBe(200);
  expect((await response.json()).data).toMatchObject({
    status: "failed",
    error: "Telaah belum bisa diproses. Coba lagi.",
  });
  expect(providerCalls).toHaveLength(2);
  expect(providerCalls[0]).toContain("gemini-3.8-flash");
  expect(providerCalls[1]).toBe("gpt-5.4-mini");
  // Legacy/raw job detail must never be returned by status polling.
  const admin = createAdmin(env);
  const history = await admin
    .from("ketik_history")
    .update({ review_status: "processing" })
    .eq("id", session.id);
  expect(history.error).toBeNull();
  const job = await admin
    .from("ketik_review_jobs")
    .update({ status: "failed", error_message: marker })
    .eq("session_id", session.id);
  expect(job.error).toBeNull();
  const polled = await api(`/review/status/${session.id}`);
  expect(polled.status).toBe(200);
  expect((await polled.json()).data).toMatchObject({
    status: "failed",
    errorMessage: "Telaah belum bisa diproses. Coba lagi.",
  });
  // Do not let the global worker claim a fixture owned by another test/run.
  const otherJobs = await admin
    .from("ketik_review_jobs")
    .select("session_id")
    .or(
      `status.eq.queued,and(status.eq.processing,lease_expires_at.lt.${new Date().toISOString()})`,
    );
  expect(otherJobs.error).toBeNull();
  expect(otherJobs.data).toEqual([]);
  const queued = await admin
    .from("ketik_review_jobs")
    .update({ status: "queued" })
    .eq("session_id", session.id);
  expect(queued.error).toBeNull();
  const worked = await api("/worker");
  expect(worked.status).toBe(200);
  expect((await worked.json()).data).toMatchObject({
    status: "failed",
    error: "Telaah belum bisa diproses. Coba lagi.",
  });
});
