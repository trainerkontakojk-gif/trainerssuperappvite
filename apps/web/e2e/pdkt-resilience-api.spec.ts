import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

// Real JWT, Hono and PostgREST/RLS; provider responses stay inside this worker.
test.describe.configure({ mode: "default" });
const env = readLoopbackEnv();
const ns = `pdkt-resilience-${randomUUID().slice(0, 8)}`;
const privateAnswer = `private-answer-${ns}`;
const recipient = `pengaduan-${ns}@company.test`;
const scenario = {
  id: ns,
  category: "Pinjaman",
  title: "Tagihan setelah lunas",
  description: "Konsumen sudah melunasi pinjaman tetapi masih ditagih.",
  isActive: true,
  primaryRecipientType: "reported_company" as const,
  recipientMode: "single" as const,
  recipientEmails: [recipient],
  expectedAnswer: privateAnswer,
  alwaysUseSampleEmail: true,
  sampleEmailTemplate: { subject: ns, body: "Mohon periksa tagihan saya." },
};
const consumer = { id: "calm", name: "Tenang", description: "Tenang" };
const identity = {
  name: "Budi",
  bodyName: "Budi",
  city: "Bandung",
  email: `consumer-${ns}@mail.test`,
};
const config = {
  scenarios: [scenario],
  consumerType: consumer,
  identity,
  selectedModel: "gemini-3.8-flash",
  enableImageGeneration: false,
  recipientContext: {
    primaryRecipientType: "reported_company",
    primaryRecipientAddress: recipient,
    ccRecipients: [],
    replyIntent: "reply_to_company_with_ojk_cc",
  },
};
const inbound = {
  id: ns,
  from: identity.email,
  to: recipient,
  subject: ns,
  body: "Mohon periksa tagihan saya.",
  timestamp: new Date().toISOString(),
  isAgent: false,
  recipientContext: config.recipientContext,
};
const reply = {
  ...inbound,
  id: `${ns}-reply`,
  from: "agent@mail.test",
  to: identity.email,
  body: "Yth. tim Pengaduan Konsumen, kami memeriksa tagihan Anda.",
  isAgent: true,
};
const evaluation = {
  score: 90,
  expectedAnswerAlignment: {
    category: "Sesuai",
    reason: "Jawaban sesuai acuan.",
  },
  feedback: "Balasan jelas.",
  scoreBreakdown: {
    recipientDirectionScore: 90,
    normativeResponseScore: 90,
    clarityScore: 90,
    typoScore: 90,
    templateComplianceScore: 90,
  },
  typos: [],
  clarityIssues: [],
  contentGaps: [],
  annotations: [],
  consumerPoints: [
    {
      quote: inbound.body,
      summary: "Periksa tagihan",
      status: "answered",
      reason: null,
      replyQuote: "kami memeriksa tagihan Anda.",
    },
  ],
};
const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
let owner: Identity;
let other: Identity;
let app: Hono;
let guardedFetch: typeof fetch;
let providerCalls = 0;
let failMailboxSave = false;
let failHistoryPage = false;
const mailboxIds: string[] = [];
const historyIds: string[] = [];

function client(user: Identity) {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });
}
async function api(path: string, method = "GET", body?: unknown, user = owner) {
  return tnaApiRequest(app, `http://localhost/api/v1/pdkt${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function insertHistory(extra: Record<string, unknown> = {}) {
  const result = await createAdmin(env)
    .from("pdkt_history")
    .insert({
      user_id: owner.userId,
      config,
      emails: [inbound, reply],
      evaluation_status: "failed",
      ...extra,
    })
    .select("id")
    .single();
  expect(result.error).toBeNull();
  historyIds.push(result.data!.id);
  return result.data!.id as string;
}
function mailboxRow(extra: Record<string, unknown> = {}) {
  return {
    user_id: owner.userId,
    created_by_user_id: owner.userId,
    client_request_id: randomUUID(),
    status: "open",
    is_shared_copy: false,
    sender_name: identity.name,
    sender_email: identity.email,
    subject: ns,
    snippet: inbound.body,
    scenario_snapshot: scenario,
    config_snapshot: config,
    inbound_email: inbound,
    emails_thread: [inbound],
    ...extra,
  };
}
const generation = () => ({
  client_request_id: randomUUID(),
  scenarioDraft: scenario,
  consumerTypeId: consumer.id,
  consumerTypeDraft: consumer,
  identity,
  selectedModel: config.selectedModel,
  enableImageGeneration: false,
});
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
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      url.hostname === "generativelanguage.googleapis.com" &&
      url.pathname.includes("gemini-3.1-flash-image")
    ) {
      return Response.json({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ inlineData: { mimeType: "image/png", data: PIXEL } }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 1_000_000,
          candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1_000_000 }],
          totalTokenCount: 1_000_100,
        },
      });
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      providerCalls++;
      return Response.json({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ text: JSON.stringify(evaluation) }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      });
    }
    if (
      failMailboxSave &&
      url.pathname.includes("/rpc/submit_pdkt_mailbox_batch")
    )
      return Response.json(
        { message: "local fixture save failure" },
        { status: 503 },
      );
    if (
      failHistoryPage &&
      url.pathname === "/rest/v1/pdkt_history" &&
      Number(url.searchParams.get("offset")) > 0
    )
      return Response.json(
        { message: "local fixture page failure" },
        { status: 503 },
      );
    return guardedFetch(request);
  };
  owner = await createUserWithJwt(env, "agent", ns);
  other = await createUserWithJwt(env, "agent", `${ns}-other`);
  // The daily PDKT limit is covered by practice-quota-api.spec.ts.
  const unlimited = await createAdmin(env)
    .from("practice_limit_overrides")
    .insert(
      [owner, other].map((user) => ({
        user_id: user.userId,
        module: "pdkt",
        daily_limit: null,
      })),
    );
  expect(unlimited.error).toBeNull();
  app = (await import("../../api/src/app")).default as unknown as Hono;
  expect((await import("../../api/src/lib/env")).env.VITE_SUPABASE_URL).toBe(
    env.apiUrl,
  );
});
test.afterAll(async () => {
  globalThis.fetch = guardedFetch;
  const admin = createAdmin(env);
  for (const user of [owner, other].filter(Boolean)) {
    await admin.from("pdkt_mailbox_items").delete().eq("user_id", user.userId);
    await admin.from("pdkt_history").delete().eq("user_id", user.userId);
    await admin.from("ai_usage_logs").delete().eq("user_id", user.userId);
    await admin.auth.admin.deleteUser(user.userId);
  }
});

test("direct authenticated inserts cannot fabricate a completed score", async () => {
  const result = await client(owner)
    .from("pdkt_history")
    .insert({
      user_id: owner.userId,
      config: {},
      emails: [],
      evaluation_status: "completed",
      evaluation: { score: 100 },
    })
    .select("id");
  expect(result.error?.code).toBe("42501");
});

test("private history JSON is blocked directly while owner scalars and API replay remain available", async () => {
  const id = await insertHistory();
  for (const column of ["config", "emails", "*"]) {
    const result = await client(owner)
      .from("pdkt_history")
      .select(column)
      .eq("id", id);
    expect(
      result.error?.code,
      `${column} must not bypass the API projection`,
    ).toBe("42501");
  }
  const scalar = await client(owner)
    .from("pdkt_history")
    .select("id,evaluation_status")
    .eq("id", id);
  expect(scalar.error).toBeNull();
  expect(scalar.data).toEqual([{ id, evaluation_status: "failed" }]);
  expect(
    (
      await client(owner)
        .from("pdkt_history")
        .select("id")
        .eq("config->scenarios->0->>expectedAnswer", privateAnswer)
    ).error?.code,
  ).toBe("42501");
  expect(
    (
      await client(owner)
        .from("pdkt_history")
        .update({ evaluation: { score: 100 } })
        .eq("id", id)
    ).error?.code,
  ).toBe("42501");
  expect(
    (await client(other).from("pdkt_history").select("id").eq("id", id)).data,
  ).toEqual([]);
  const response = await api("/history");
  expect(response.status).toBe(200);
  const rows = (await response.json()).data;
  const row = rows.find((entry: { id: string }) => entry.id === id);
  expect(row.emails[0].body).toBe(inbound.body);
  expect(row.emails[0].to).toBe("");
  expect(JSON.stringify(row)).not.toContain(privateAnswer);
  expect(JSON.stringify(row)).not.toContain(recipient);
  const stored = await createAdmin(env)
    .from("pdkt_history")
    .select("config")
    .eq("id", id)
    .single();
  expect(stored.data?.config.scenarios[0].expectedAnswer).toBe(privateAnswer);
});

test("init, creation and encrypted save-retry never expose private recipient metadata", async () => {
  const init = await api("/session/init", "POST", generation());
  expect(init.status).toBe(200);
  const initData = (await init.json()).data;
  expect(initData.to).toBe("");
  expect(initData.message.to).toBe("");
  expect(initData.message).not.toHaveProperty("recipientContext");
  const created = await api("/session/create", "POST", generation());
  expect(created.status).toBe(200);
  const createdData = (await created.json()).data;
  mailboxIds.push(createdData.id);
  expect(createdData.message.to).toBe("");
  expect(createdData.message).not.toHaveProperty("recipientContext");
  let failure: Response;
  failMailboxSave = true;
  try {
    failure = await api("/session/create", "POST", generation());
  } finally {
    failMailboxSave = false;
  }
  expect(failure.status).toBeGreaterThanOrEqual(400);
  const draft = (await failure.json()).error.details.retryDraft;
  expect(draft.inbound_email.to).toBe("");
  expect(JSON.stringify(draft)).not.toContain(privateAnswer);
  expect(JSON.stringify(draft)).not.toContain(recipient);
  expect(JSON.stringify(draft)).not.toContain("config_snapshot");
  const saved = await api("/mailbox/batch", "POST", {
    mailboxDraftToken: draft.token,
  });
  expect(saved.status).toBe(200);
  mailboxIds.push((await saved.json()).data);
});

test("generated attachment images are costed at the image rate, not the text rate", async () => {
  const init = await api("/session/init", "POST", {
    ...generation(),
    enableImageGeneration: true,
  });
  expect(init.status).toBe(200);
  const logs = await createAdmin(env)
    .from("ai_usage_logs")
    .select("model_id,action,output_tokens,estimated_cost_usd")
    .eq("user_id", owner.userId)
    .eq("model_id", "gemini-3.1-flash-image");
  expect(logs.error).toBeNull();
  // 1M image tokens at $60 per million plus 100 input tokens at $0.50 per million.
  expect(logs.data).toContainEqual(
    expect.objectContaining({
      action: "generate_ai_images",
      output_tokens: 1_000_000,
      estimated_cost_usd: 60.00005,
    }),
  );
});

test("fresh failed evaluation retries immediately and concurrent requests create one attempt", async () => {
  const id = await insertHistory({
    evaluation_started_at: new Date().toISOString(),
  });
  const before = providerCalls;
  const responses = await Promise.all([
    api("/history/retry-eval", "POST", { historyId: id }),
    api("/history/retry-eval", "POST", { historyId: id }),
  ]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  await expect
    .poll(
      async () => {
        const response = await api(`/history/eval/${id}`);
        return (await response.json()).data.evaluation_status;
      },
      { timeout: 10000 },
    )
    .toBe("completed");
  expect(providerCalls - before).toBe(1);
  const active = await insertHistory({
    evaluation_status: "processing",
    evaluation_started_at: new Date().toISOString(),
  });
  await api("/history/retry-eval", "POST", { historyId: active });
  expect(
    (
      await createAdmin(env)
        .from("pdkt_history")
        .select("evaluation_status")
        .eq("id", active)
        .single()
    ).data?.evaluation_status,
  ).toBe("processing");
  expect(providerCalls - before).toBe(1);
});

test("history deletion preserves the shared email with an explicit missing-history reference", async () => {
  const id = await insertHistory();
  const inserted = await createAdmin(env)
    .from("pdkt_mailbox_items")
    .insert(
      mailboxRow({
        status: "replied",
        history_id: id,
        emails_thread: [inbound, reply],
      }),
    )
    .select("id")
    .single();
  expect(inserted.error).toBeNull();
  const mailboxId = inserted.data!.id;
  mailboxIds.push(mailboxId);
  const rejected = await api(`/history/${id}`, "DELETE", undefined, other);
  expect(rejected.status).toBe(200);
  expect(
    (await createAdmin(env).from("pdkt_history").select("id").eq("id", id))
      .data,
  ).toHaveLength(1);
  expect((await api(`/history/${id}`, "DELETE")).status).toBe(200);
  const detail = await api(`/mailbox/${mailboxId}`);
  expect(detail.status).toBe(200);
  expect((await detail.json()).data).toMatchObject({
    status: "replied",
    history_id: null,
  });
});

test("mailbox includes older emails beyond its former 100-item cap", async () => {
  test.setTimeout(90000);
  const admin = createAdmin(env);
  const mail = await admin
    .from("pdkt_mailbox_items")
    .insert(Array.from({ length: 110 }, () => mailboxRow()))
    .select("id");
  expect(mail.error).toBeNull();
  const ids = mail.data!.map((row) => row.id);
  mailboxIds.push(...ids);
  const listed = await api("/mailbox");
  expect(listed.status).toBe(200);
  const listedIds = new Set(
    (await listed.json()).data.map((row: { id: string }) => row.id),
  );
  expect(ids.filter((id) => listedIds.has(id))).toHaveLength(110);
});

test("history includes every page and never returns partial success", async () => {
  test.setTimeout(90000);
  const admin = createAdmin(env);
  for (let from = 0; from < 1001; from += 250) {
    const rows = Array.from({ length: Math.min(250, 1001 - from) }, () => ({
      user_id: other.userId,
      config,
      emails: [inbound, reply],
      evaluation_status: "completed",
      evaluation,
    }));
    expect((await admin.from("pdkt_history").insert(rows)).error).toBeNull();
  }
  const response = await api("/history", "GET", undefined, other);
  expect(response.status).toBe(200);
  expect((await response.json()).data).toHaveLength(1001);
  failHistoryPage = true;
  try {
    const failed = await api("/history", "GET", undefined, other);
    expect(failed.status).toBe(500);
    expect((await failed.json()).success).toBe(false);
  } finally {
    failHistoryPage = false;
  }
});
