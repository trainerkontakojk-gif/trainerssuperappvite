import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
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
let generatedEmailFixture: { subject: string; body: string } | null = null;
let heldEvaluation: {
  started: boolean;
  release: () => void;
  wait: Promise<void>;
} | null = null;
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
    GEMINI_PROXY_URL: "",
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
          candidatesTokensDetails: [
            { modality: "IMAGE", tokenCount: 1_000_000 },
          ],
          totalTokenCount: 1_000_100,
        },
      });
    }
    if (url.hostname === "generativelanguage.googleapis.com") {
      providerCalls++;
      const held = heldEvaluation;
      const isHeld = held !== null && !held.started;
      if (isHeld) {
        held.started = true;
        await held.wait;
      }
      return Response.json({
        candidates: [
          {
            content: {
              role: "model",
              parts: [
                {
                  text: JSON.stringify(
                    isHeld
                      ? { ...evaluation, feedback: "Hasil klaim lama" }
                      : (generatedEmailFixture ?? evaluation),
                  ),
                },
              ],
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
  const paragraph = Array(8)
    .fill(
      "Saya sudah membayar tagihan itu tetapi aplikasi masih menunjukkan saldo yang belum selesai dan saya memerlukan penjelasan.",
    )
    .join(" ");
  generatedEmailFixture = {
    subject: "Tolong periksa tagihan",
    body: Array(6).fill(paragraph).join("\n\n"),
  };
  try {
    const init = await api("/session/init", "POST", {
      ...generation(),
      scenarioDraft: { ...scenario, alwaysUseSampleEmail: false },
      enableImageGeneration: true,
      writingStyleMode: "training",
      resolvedConsumerNameMentionPattern: "none",
    });
    const body = await init.json();
    expect(init.status, JSON.stringify(body)).toBe(200);
    expect(body.data.attachmentSource).toBe("ai");
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
  } finally {
    generatedEmailFixture = null;
  }
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

test("abandoned evaluations expose a user-triggered recovery without retrying fresh work", async () => {
  const old = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  const stale = await insertHistory({
    evaluation_status: "processing",
    evaluation_started_at: old,
  });
  const fresh = await insertHistory({
    evaluation_status: "processing",
    evaluation_started_at: new Date().toISOString(),
  });
  const pending = await insertHistory({
    evaluation_status: "pending",
    evaluation_started_at: null,
    created_at: old,
  });
  const before = providerCalls;
  for (const [id, recovery] of [
    [stale, "retry_available"],
    [fresh, null],
    [pending, "retry_available"],
  ] as const) {
    const response = await api(`/history/eval/${id}`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.recovery).toBe(recovery);
    expect(payload.data.evaluation_status).toBe(
      id === pending ? "pending" : "processing",
    );
  }
  expect(providerCalls).toBe(before);
  expect(
    (await api(`/history/eval/${stale}`, "GET", undefined, other)).status,
  ).toBe(404);
  expect(
    (await api("/history/retry-eval", "POST", { historyId: stale }, other))
      .status,
  ).toBe(404);
  const retries = await Promise.all([
    api("/history/retry-eval", "POST", { historyId: stale }),
    api("/history/retry-eval", "POST", { historyId: stale }),
  ]);
  expect(retries.map((response) => response.status)).toEqual([200, 200]);
  await expect
    .poll(
      async () => {
        const response = await api(`/history/eval/${stale}`);
        return (await response.json()).data.evaluation_status;
      },
      { timeout: 10000 },
    )
    .toBe("completed");
  expect(providerCalls - before).toBe(1);
  expect(
    (await api("/history/retry-eval", "POST", { historyId: pending })).status,
  ).toBe(200);
  await expect
    .poll(
      async () => {
        const response = await api(`/history/eval/${pending}`);
        return (await response.json()).data.evaluation_status;
      },
      { timeout: 10000 },
    )
    .toBe("completed");
  expect(providerCalls - before).toBe(2);
});

test("a real API process crash preserves the claim and explicit retry recovers after restart", async () => {
  test.setTimeout(90000);
  const id = await insertHistory();
  function boot(mode: "hold" | "complete") {
    const childEnv: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"]) {
      if (process.env[key]) childEnv[key] = process.env[key];
    }
    Object.assign(childEnv, {
      NODE_ENV: "test",
      PORT: "0",
      VITE_SUPABASE_URL: env.apiUrl,
      SUPABASE_URL: env.apiUrl,
      VITE_SUPABASE_ANON_KEY: env.anonKey,
      SUPABASE_ANON_KEY: env.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
      GEMINI_API_KEY: "e2e-only",
      OPENAI_API_KEY: "e2e-only",
      TELEFUN_SCORING_WORKER_ENABLED: "false",
      KETIK_REVIEW_WORKER_ENABLED: "false",
      ALLOWED_ORIGINS: "http://127.0.0.1:3005",
      E2E_PDKT_CRASH_MODE: mode,
      E2E_PDKT_EVALUATION_FIXTURE_JSON: JSON.stringify(evaluation),
    });
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        fileURLToPath(new URL("./helpers/pdktCrashApi.mjs", import.meta.url)),
      ],
      {
        cwd: fileURLToPath(new URL("../../../", import.meta.url)),
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let log = "";
    const collect = (data: Buffer) => {
      log = (log + String(data)).slice(-100000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const exited = once(child, "exit");
    return {
      child,
      exited,
      log: () => log,
      async url() {
        await expect
          .poll(() => log.match(/\[e2e-listening\] (\d+)/)?.[1], {
            timeout: 20000,
          })
          .toBeTruthy();
        return `http://127.0.0.1:${log.match(/\[e2e-listening\] (\d+)/)![1]}`;
      },
      async close() {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
        await exited;
      },
    };
  }
  const first = boot("hold");
  let second: ReturnType<typeof boot> | undefined;
  const request = (origin: string, path: string, retry = false) =>
    fetch(`${origin}/api/v1/pdkt/history/${path}`, {
      method: retry ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${owner.token}`,
        "Content-Type": "application/json",
      },
      ...(retry ? { body: JSON.stringify({ historyId: id }) } : {}),
    });
  try {
    const firstUrl = await first.url();
    expect((await request(firstUrl, "retry-eval", true)).status).toBe(200);
    await expect
      .poll(() => first.log().includes("[e2e-pdkt-provider]"), {
        timeout: 15000,
      })
      .toBe(true);
    const claimed = await createAdmin(env)
      .from("pdkt_history")
      .select("evaluation_status,evaluation_started_at")
      .eq("id", id)
      .single();
    expect(claimed.error).toBeNull();
    expect(claimed.data?.evaluation_status).toBe("processing");
    await first.close();
    expect(first.child.signalCode).toBe("SIGKILL");

    second = boot("complete");
    const secondUrl = await second.url();
    const fresh = await request(secondUrl, `eval/${id}`);
    expect(fresh.status).toBe(200);
    expect((await fresh.json()).data.recovery).toBeNull();
    expect(second.log()).not.toContain("[e2e-pdkt-provider]");
    // Advance only this disposable row's claim age instead of waiting six minutes.
    const aged = await createAdmin(env)
      .from("pdkt_history")
      .update({
        evaluation_started_at: new Date(
          Date.now() - 6 * 60 * 1000,
        ).toISOString(),
      })
      .eq("id", id)
      .eq("evaluation_status", "processing")
      .eq("evaluation_started_at", claimed.data!.evaluation_started_at)
      .select("id");
    expect(aged.error).toBeNull();
    expect(aged.data).toHaveLength(1);
    const recoverable = await request(secondUrl, `eval/${id}`);
    expect((await recoverable.json()).data.recovery).toBe("retry_available");
    expect(second.log()).not.toContain("[e2e-pdkt-provider]");
    const replies = await Promise.all([
      request(secondUrl, "retry-eval", true),
      request(secondUrl, "retry-eval", true),
    ]);
    expect(replies.map((response) => response.status)).toEqual([200, 200]);
    await expect
      .poll(
        async () => {
          const result = await request(secondUrl, `eval/${id}`);
          return (await result.json()).data.evaluation_status;
        },
        { timeout: 15000 },
      )
      .toBe("completed");
    const saved = await request(secondUrl, `eval/${id}`);
    expect((await saved.json()).data.evaluation.feedback).toBe(
      evaluation.feedback,
    );
    expect(second.log().match(/\[e2e-pdkt-provider\]/g)).toHaveLength(1);
    expect(first.log() + second.log()).not.toMatch(
      /\[(?:socket-)?egress-denied\]/,
    );
  } finally {
    await first.close();
    await second?.close();
    let diagnostic = first.log() + (second?.log() ?? "");
    for (const secret of [
      env.anonKey,
      env.serviceRoleKey,
      env.dbUrl,
      owner.token,
    ])
      diagnostic = diagnostic.split(secret).join("[redacted]");
    await test.info().attach("local-api-processes", {
      body: diagnostic,
      contentType: "text/plain",
    });
  }
});

test("a late evaluation from an expired claim cannot overwrite its retry", async () => {
  const id = await insertHistory();
  let release = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = { started: false, release, wait };
  heldEvaluation = held;
  const { processPdktEvaluation } =
    await import("../../api/src/services/pdkt/evaluation-service");
  const oldAttempt = processPdktEvaluation(id, owner.userId);
  try {
    await expect.poll(() => held.started, { timeout: 10000 }).toBe(true);
    const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const updated = await createAdmin(env)
      .from("pdkt_history")
      .update({ evaluation_started_at: stale })
      .eq("id", id);
    expect(updated.error).toBeNull();
    expect(
      (await api("/history/retry-eval", "POST", { historyId: id })).status,
    ).toBe(200);
    await expect
      .poll(
        async () => {
          const response = await api(`/history/eval/${id}`);
          return (await response.json()).data.evaluation_status;
        },
        { timeout: 10000 },
      )
      .toBe("completed");
    held.release();
    await oldAttempt;
    const response = await api(`/history/eval/${id}`);
    const saved = await response.json();
    expect(saved.data.evaluation_status).toBe("completed");
    expect(saved.data.evaluation.feedback).toBe(evaluation.feedback);
  } finally {
    held.release();
    await oldAttempt.catch(() => {});
    heldEvaluation = null;
  }
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

test("the history list carries only what the list shows, and one session opens in full", async () => {
  const id = await insertHistory({
    evaluation_status: "completed",
    evaluation,
  });
  const list = await api("/history?view=list");
  expect(list.status).toBe(200);
  const row = (await list.json()).data.find(
    (entry: { id: string }) => entry.id === id,
  );
  expect(row).toMatchObject({
    detail: "summary",
    evaluation_status: "completed",
    evaluation: { score: evaluation.score },
    emails: [{ subject: reply.subject }],
    config: { scenarios: [{ id: scenario.id, title: scenario.title }] },
  });
  const listed = JSON.stringify(row);
  for (const hidden of [
    inbound.body,
    reply.body,
    evaluation.feedback,
    privateAnswer,
  ])
    expect(listed).not.toContain(hidden);

  const opened = await api(`/history/${id}`);
  expect(opened.status).toBe(200);
  const session = (await opened.json()).data;
  expect(session.id).toBe(id);
  expect(session.detail).toBeUndefined();
  expect(session.emails.map((email: { body: string }) => email.body)).toEqual([
    inbound.body,
    reply.body,
  ]);
  expect(session.emails[0].to).toBe("");
  expect(session.evaluation.feedback).toBe(evaluation.feedback);
  expect(JSON.stringify(session)).not.toContain(privateAnswer);
  expect((await api(`/history/${id}`, "GET", undefined, other)).status).toBe(
    404,
  );
});
