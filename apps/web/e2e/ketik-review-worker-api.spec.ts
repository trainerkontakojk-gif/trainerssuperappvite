import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import { tnaApiRequest } from "./helpers/tnaApi";

const env = readLoopbackEnv();
const db = createAdmin(env);
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
const identities: Awaited<ReturnType<typeof createUserWithJwt>>[] = [];
let agent: typeof trainer;
let leader: typeof trainer;
let admin: typeof trainer;
let otherTrainer: typeof trainer;
let guarded: typeof fetch;
let providerMode: "hold" | "success" | "fail" = "hold";
const releases: Array<() => void> = [];
const releaseProvider = () => {
  for (const release of releases.splice(0)) release();
};
let worker: ChildProcess | undefined;
let workerLog = "";
const fixtures = new Set<string>();
let boundaryRequests: unknown[] = [];
let providerCalls = 0;
let guidancePayload: unknown;
let providerOrigin: string;
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += String(chunk);
  boundaryRequests.push(JSON.parse(raw || "{}"));
  providerCalls++;
  if (providerMode === "hold")
    await new Promise<void>((resolve) => {
      releases.push(resolve);
    });
  if (providerMode === "fail") {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: { message: "private-worker-provider-sentinel" },
      }),
    );
    return;
  }
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      candidates: [
        {
          content: {
            role: "model",
            parts: [
              {
                text: JSON.stringify({
                  scores: {
                    final: 80,
                    empathy: 80,
                    probing: 80,
                    resolution: 80,
                    typo: 80,
                    compliance: 80,
                  },
                  dimensionGuidance: guidancePayload,
                  summary: "Local review",
                  strengths: ["Jelas"],
                  weaknesses: ["Probing"],
                  coachingFocus: ["Verifikasi"],
                }),
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
    }),
  );
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
  guarded = globalThis.fetch;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Provider did not bind loopback");
  providerOrigin = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    if (
      url.hostname === "generativelanguage.googleapis.com" ||
      url.hostname === "api.openai.com"
    )
      return guarded(new Request(providerOrigin + url.pathname, req));
    return guarded(req);
  };
  trainer = await createUserWithJwt(
    env,
    "trainer",
    `ketik-worker-${randomUUID()}`,
  );
  identities.push(trainer);
  for (const role of ["agent", "leader", "admin", "trainer"] as const)
    identities.push(
      await createUserWithJwt(env, role, `ketik-worker-${randomUUID()}`),
    );
  [agent, leader, admin, otherTrainer] = identities.slice(1);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});
test.afterAll(async () => {
  releaseProvider();
  globalThis.fetch = guarded;
  for (const identity of identities)
    expect((await db.auth.admin.deleteUser(identity.userId)).error).toBeNull();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function seedSession(ownerId = trainer.userId, completed = false) {
  const id = randomUUID();
  fixtures.add(id);
  expect(
    (
      await db.from("ketik_history").insert({
        id,
        user_id: ownerId,
        scenario_title: "Worker test",
        consumer_name: "Konsumen",
        messages: [
          {
            id: "m1",
            sender: "agent",
            text: "Selamat pagi",
            timestamp: new Date().toISOString(),
          },
        ],
        review_status: completed ? "completed" : "pending",
        ...(completed
          ? {
              final_score: 60,
              empathy_score: 60,
              probing_score: 60,
              resolution_score: 60,
              typo_score: 60,
              compliance_score: 60,
            }
          : {}),
      })
    ).error,
  ).toBeNull();
  if (completed) {
    expect(
      (
        await db.from("ketik_session_reviews").insert({
          session_id: id,
          ai_summary: "Previous review",
          strengths: ["Old"],
          weaknesses: ["Old"],
          coaching_focus: ["Old"],
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await db.from("ketik_typo_findings").insert({
          session_id: id,
          message_id: "m1",
          original_word: "pgi",
          corrected_word: "pagi",
          severity: "minor",
        })
      ).error,
    ).toBeNull();
  }
  return id;
}
async function request(path: string, identity = trainer, body?: unknown) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function job(id: string) {
  const result = await db
    .from("ketik_review_jobs")
    .select("*")
    .eq("session_id", id)
    .maybeSingle();
  expect(result.error).toBeNull();
  return result.data;
}
// One lifecycle contract, two hosts: the standalone worker entrypoint and the
// API process with the embedded worker (playwright.api.config.ts projects).
const EMBEDDED_PROJECT = "ketik-review-worker-embedded-real-backend";
const embedded = () => test.info().project.name === EMBEDDED_PROJECT;
function spawnWorkerHost(overrides: Record<string, string>) {
  const entry = embedded()
    ? "../../api/src/index.ts"
    : "../../api/src/workers/ketik-review-worker-entrypoint.ts";
  return spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      fileURLToPath(
        new URL("./helpers/ketikWorkerTransport.mjs", import.meta.url),
      ),
      fileURLToPath(new URL(entry, import.meta.url)),
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      env: {
        ...process.env,
        // Embedded host: ephemeral HTTP port, never the dev API's :3001.
        PORT: "0",
        KETIK_E2E_PROVIDER_ORIGIN: providerOrigin,
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}
async function startWorker() {
  workerLog = "";
  worker = spawnWorkerHost({
    KETIK_REVIEW_WORKER_ENABLED: "true",
    KETIK_REVIEW_WORKER_INTERVAL_MS: "250",
    KETIK_REVIEW_WORKER_SHUTDOWN_MS: "500",
    KETIK_REVIEW_WORKER_HEALTH_PORT: "0",
  });
  worker.stdout?.on("data", (data) => {
    workerLog += String(data);
  });
  worker.stderr?.on("data", (data) => {
    workerLog += String(data);
  });
  await expect
    .poll(() => workerLog.includes('"event":"ketik_review_worker.started"'), {
      timeout: 15_000,
      message: "Real worker entrypoint must start with loopback DB/provider",
    })
    .toBe(true);
}
async function stopWorker(signal: NodeJS.Signals = "SIGTERM") {
  const child = worker;
  worker = undefined;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal })),
  );
  child.kill(signal);
  try {
    const result = await Promise.race([
      exit,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Task worker did not stop")),
          6000,
        );
        timer.unref();
      }),
    ]);
    if (signal === "SIGTERM") expect(result.code).toBe(0);
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
}
test.beforeEach(() => {
  providerMode = "hold";
  providerCalls = 0;
  boundaryRequests = [];
  guidancePayload = undefined;
});
test.afterEach(async () => {
  await stopWorker();
  releaseProvider();
  for (const id of fixtures)
    expect(
      (await db.from("ketik_history").delete().eq("id", id)).error,
    ).toBeNull();
  fixtures.clear();
});

test("score explanations preserve real evidence and disclose missing or fabricated evidence", async () => {
  providerMode = "success";
  guidancePayload = [
    {
      key: "empathy",
      diagnosis:
        "Sapaan sopan, tetapi belum mengakui kekhawatiran konsumen sehingga empati belum maksimal.",
      howToFix: "Validasi perasaan sebelum menjawab.",
      exampleRewrite: "Saya paham kekhawatirannya, saya bantu cek.",
      evidence: [{ messageId: "wrong-id", quote: "Selamat pagi" }],
    },
    {
      key: "probing",
      diagnosis: "Kronologi belum digali.",
      howToFix: "Tanyakan kronologi.",
      exampleRewrite: "Kapan kendala mulai terjadi?",
      evidence: [{ messageId: "m1", quote: "kutipan yang tidak ada" }],
    },
    {
      key: "typo",
      diagnosis: "",
      howToFix: "Baca ulang.",
      exampleRewrite: "Selamat pagi.",
      evidence: [{ messageId: "m1", quote: "Selamat pagi" }],
    },
  ];
  const id = await seedSession();
  expect((await request("/review", trainer, { sessionId: id })).status).toBe(
    202,
  );
  await startWorker();
  await expect
    .poll(async () => (await job(id)).status, { timeout: 20_000 })
    .toBe("completed");
  const response = await request(`/review/${id}`);
  expect(response.status).toBe(200);
  const detail = (await response.json()).data;
  expect(detail.scores).toEqual({
    final: 80,
    empathy: 80,
    probing: 80,
    resolution: 80,
    typo: 80,
    compliance: 80,
  });
  const guidance = detail.review.education.dimensionGuidance;
  expect(
    guidance.find((item: { key: string }) => item.key === "empathy"),
  ).toMatchObject({
    source: "transcript",
    evidence: [{ messageId: "m1", quote: "Selamat pagi" }],
    diagnosis: expect.stringContaining("belum mengakui"),
  });
  for (const key of ["probing", "resolution", "typo", "compliance"]) {
    expect(
      guidance.find((item: { key: string }) => item.key === key),
    ).toMatchObject({
      source: "general",
      evidence: [],
      diagnosis: expect.stringContaining("belum tersedia"),
    });
  }
  const legacy = await seedSession(trainer.userId, true);
  const old = (await request(`/review/${legacy}`).then((r) => r.json())).data;
  expect(
    old.review.education.dimensionGuidance.every(
      (item: { source: string }) => item.source === "general",
    ),
  ).toBe(true);
  await test.info().attach("review-evidence-response", {
    body: JSON.stringify({
      scores: detail.scores,
      education: detail.review.education,
    }),
    contentType: "application/json",
  });
});

test("manual POST returns accepted before AI and only enqueues without a running worker", async () => {
  const sessionId = await seedSession();
  let response: Response | undefined;
  const pending = tnaApiRequest(app, "http://localhost/api/v1/ketik/review", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trainer.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, requestId: randomUUID() }),
  }).then((value) => {
    response = value;
    return value;
  });
  try {
    await expect.poll(() => response?.status, { timeout: 1500 }).toBe(202);
    expect(providerCalls).toBe(0);
    expect(
      (
        await db
          .from("ketik_review_jobs")
          .select("status")
          .eq("session_id", sessionId)
          .single()
      ).data?.status,
    ).toBe("queued");
  } finally {
    releaseProvider();
    await pending;
    await db.from("ketik_history").delete().eq("id", sessionId);
  }
});

test("a real worker claims once, publishes scores/review atomically and never reviews an unrequested session", async () => {
  const id = await seedSession();
  const untouched = await seedSession();
  const requestId = randomUUID();
  const replies = await Promise.all([
    request("/review", trainer, { sessionId: id, requestId }),
    request("/review", trainer, { sessionId: id, requestId }),
  ]);
  expect(replies.map((r) => r.status)).toEqual([202, 202]);
  expect((await job(id)).attempt_count).toBe(0);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("queued");
  await startWorker();
  await expect.poll(() => providerCalls).toBe(1);
  expect((await job(id)).status).toBe("processing");
  expect(
    (
      await request("/review", trainer, {
        sessionId: id,
        requestId: randomUUID(),
        rerun: true,
      })
    ).status,
  ).toBe(202);
  const before = (await request(`/review/status/${id}`).then((r) => r.json()))
    .data;
  expect(before).toMatchObject({ status: "processing", resultReady: false });
  releaseProvider();
  providerMode = "success";
  await expect.poll(async () => (await job(id)).status).toBe("completed");
  const detail = (await request(`/review/${id}`).then((r) => r.json())).data;
  expect(detail.review.aiSummary).toBe("Local review");
  expect(detail.scores.final).toBe(80);
  expect(
    (await request("/review", trainer, { sessionId: id, requestId })).status,
  ).toBe(200);
  expect((await job(id)).attempt_count).toBe(1);
  expect(providerCalls).toBe(1);
  const usage = await db
    .from("ai_usage_logs")
    .select("user_id,module,action")
    .eq("user_id", trainer.userId);
  expect(usage.error).toBeNull();
  expect(usage.data).toContainEqual(
    expect.objectContaining({
      user_id: trainer.userId,
      module: "ketik",
      action: "coaching_review",
    }),
  );
  // The loopback health server exists only on the standalone host.
  if (!embedded()) {
    const port = Number(workerLog.match(/"healthPort":(\d+)/)?.[1]);
    const health = await guarded(`http://127.0.0.1:${port}/health`);
    expect(health.status).toBe(200);
    const payload = await health.json();
    expect(payload.healthy).toBe(true);
    expect(Object.keys(payload).sort()).toEqual(
      [
        "active",
        "errorClass",
        "healthy",
        "lastSuccessfulPollAt",
        "loopAlive",
        "stopping",
      ].sort(),
    );
  }
  expect(await job(untouched)).toBeNull();
  expect(
    (
      boundaryRequests[0] as {
        contents: Array<{ parts: Array<{ text: string }> }>;
      }
    ).contents[0].parts[0].text,
  ).toContain("Selamat pagi");
});

test("SIGKILL leaves a reclaimable lease; restart fences the previous token", async () => {
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect.poll(() => providerCalls).toBe(1);
  const old = await job(id);
  await stopWorker("SIGKILL");
  expect(
    (
      await db
        .from("ketik_review_jobs")
        .update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("session_id", id)
    ).error,
  ).toBeNull();
  await startWorker();
  await expect.poll(() => providerCalls).toBe(2);
  expect((await job(id)).attempt_count).toBe(2);
  const stale = await db.rpc("settle_ketik_review", {
    p_session: id,
    p_token: old.lease_token,
    p_release: true,
  });
  expect(stale.error).toBeNull();
  expect(stale.data).toBe(false);
  expect((await job(id)).status).toBe("processing");
  providerMode = "success";
  releaseProvider();
  await expect.poll(async () => (await job(id)).status).toBe("completed");
});

test("provider failure exhausts three attempts and exposes only a safe terminal error", async () => {
  providerMode = "fail";
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect
    .poll(async () => (await job(id)).status, { timeout: 20_000 })
    .toBe("failed");
  expect((await job(id)).attempt_count).toBe(3);
  expect(providerCalls).toBe(6);
  const status = (await request(`/review/status/${id}`).then((r) => r.json()))
    .data;
  expect(status).toMatchObject({
    status: "failed",
    resultReady: false,
    previousKept: false,
  });
  expect(JSON.stringify(status)).not.toContain(
    "private-worker-provider-sentinel",
  );
});

test("failure during rerun publication rolls back review, typos, scores and completion; explicit retry can replace them", async () => {
  providerMode = "success";
  const id = await seedSession(trainer.userId, true);
  const old = (await request(`/review/${id}`).then((r) => r.json())).data;
  const fn = `ketik_publish_fail_${id.replaceAll("-", "")}`;
  runSql(
    env,
    `CREATE FUNCTION public.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${id}' AND NEW.final_score=80 THEN RAISE EXCEPTION 'private-publication-sentinel'; END IF; RETURN NEW; END $$; CREATE TRIGGER ${fn} BEFORE UPDATE ON public.ketik_history FOR EACH ROW EXECUTE FUNCTION public.${fn}();`,
  );
  try {
    await request("/review", trainer, { sessionId: id, rerun: true });
    await startWorker();
    await expect
      .poll(async () => (await job(id)).status, { timeout: 20_000 })
      .toBe("failed");
    const kept = (await request(`/review/${id}`).then((r) => r.json())).data;
    expect(kept.review.id).toBe(old.review.id);
    expect(kept.review.aiSummary).toBe("Previous review");
    expect(kept.scores.final).toBe(60);
    expect(kept.typos).toEqual(old.typos);
    const status = (await request(`/review/status/${id}`).then((r) => r.json()))
      .data;
    expect(status).toMatchObject({
      status: "failed",
      resultReady: true,
      previousKept: true,
    });
    expect(
      (
        await db
          .from("ketik_history")
          .select("review_status")
          .eq("id", id)
          .single()
      ).data?.review_status,
    ).toBe("completed");
  } finally {
    runSql(
      env,
      `DROP TRIGGER IF EXISTS ${fn} ON public.ketik_history; DROP FUNCTION IF EXISTS public.${fn}();`,
    );
  }
  await request("/review", trainer, { sessionId: id, rerun: true });
  await expect.poll(async () => (await job(id)).status).toBe("completed");
  expect(
    (await request(`/review/${id}`).then((r) => r.json())).data.scores.final,
  ).toBe(80);
});

test("SIGTERM stops admission and fences an unfinished provider before restart", async () => {
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect.poll(() => providerCalls).toBe(1);
  await stopWorker();
  expect((await job(id)).status).toBe("queued");
  expect((await job(id)).lease_token).toBeNull();
  expect(
    (await db.from("ketik_session_reviews").select("id").eq("session_id", id))
      .data,
  ).toEqual([]);
  providerMode = "success";
  releaseProvider();
  await startWorker();
  await expect
    .poll(async () => (await job(id)).status, { timeout: 10_000 })
    .toBe("completed");
});

test("review authorization follows own account or the trainer assignment; public RPCs remain denied", async () => {
  const own = await seedSession(agent.userId);
  const team = await seedSession(leader.userId);
  const stranger = await seedSession(otherTrainer.userId);
  expect(
    (
      await db.from("ketik_configuration_assignments").insert({
        recipient_id: leader.userId,
        assigned_by: trainer.userId,
        source_configuration: {},
        source_settings_version: "absent",
      })
    ).error,
  ).toBeNull();
  try {
    expect((await request("/review", agent, { sessionId: own })).status).toBe(
      202,
    );
    expect((await request("/review", leader, { sessionId: team })).status).toBe(
      202,
    );
    const ownerClient = createClient(env.apiUrl, env.anonKey, {
      global: { headers: { Authorization: `Bearer ${agent.token}` } },
      auth: { persistSession: false },
    });
    expect(
      (
        await ownerClient
          .from("ketik_review_jobs")
          .select("lease_token")
          .eq("session_id", own)
      ).error,
    ).not.toBeNull();
    const safeJob = await ownerClient
      .from("ketik_review_jobs")
      .select("status")
      .eq("session_id", own)
      .single();
    expect(safeJob.error).toBeNull();
    expect(safeJob.data?.status).toBe("queued");
    expect(
      (await request("/review", trainer, { sessionId: team })).status,
    ).toBe(202);
    expect((await request("/review", agent, { sessionId: team })).status).toBe(
      404,
    );
    expect(
      (await request("/review", otherTrainer, { sessionId: team })).status,
    ).toBe(404);
    expect(
      (await request("/review", trainer, { sessionId: stranger })).status,
    ).toBe(404);
    expect(
      (await request("/review", admin, { sessionId: stranger })).status,
    ).toBe(202);
    expect((await request(`/review/status/${team}`, otherTrainer)).status).toBe(
      404,
    );
    expect((await request(`/history/${team}`, trainer)).status).toBe(200);
    expect((await request(`/history/${team}`, agent)).status).toBe(404);
    expect(
      (
        await request("/review", trainer, {
          sessionId: team,
          workerId: "browser-forgery",
        })
      ).status,
    ).toBe(400);
    expect((await request("/worker", admin)).status).toBe(410);
    for (const identity of [...identities, null]) {
      const client = createClient(env.apiUrl, env.anonKey, {
        global: {
          headers: {
            ...(identity ? { Authorization: `Bearer ${identity.token}` } : {}),
          },
        },
        auth: { persistSession: false },
      });
      for (const [name, args] of [
        [
          "enqueue_ketik_review",
          { p_actor: trainer.userId, p_session: team, p_request: randomUUID() },
        ],
        ["claim_ketik_review", { p_worker: "forged", p_lease_seconds: 600 }],
        ["settle_ketik_review", { p_session: team, p_token: randomUUID() }],
        ["read_ketik_review", { p_actor: trainer.userId, p_session: team }],
        [
          "can_access_ketik_review",
          { p_actor: trainer.userId, p_session: team },
        ],
      ] as const)
        expect((await client.rpc(name, args)).error).not.toBeNull();
    }
    expect(
      (
        await db
          .from("ketik_configuration_assignments")
          .update({ assigned_by: otherTrainer.userId })
          .eq("recipient_id", leader.userId)
      ).error,
    ).toBeNull();
    expect((await request(`/review/status/${team}`, trainer)).status).toBe(404);
  } finally {
    await db
      .from("ketik_configuration_assignments")
      .delete()
      .eq("recipient_id", leader.userId);
  }
});

test("a live worker that loses its lease cannot publish a late successful response", async () => {
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect.poll(() => providerCalls).toBe(1);
  expect(
    (
      await db
        .from("ketik_review_jobs")
        .update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq("session_id", id)
    ).error,
  ).toBeNull();
  const claimed = await db.rpc("claim_ketik_review", {
    p_worker: "test-successor",
    p_lease_seconds: 600,
    p_session: id,
  });
  expect(claimed.error).toBeNull();
  expect(claimed.data.attempt).toBe(2);
  releaseProvider();
  providerMode = "success";
  await expect
    .poll(() => workerLog.includes("ketik_review_worker.lease_lost"))
    .toBe(true);
  // Wait for the real old worker to finish its HTTP response and attempt fenced publication.
  await expect
    .poll(
      async () =>
        (
          await db
            .from("ai_usage_logs")
            .select("id", { count: "exact", head: true })
            .eq("user_id", trainer.userId)
        ).count,
    )
    .toBeGreaterThan(0);
  expect(
    (await db.from("ketik_session_reviews").select("id").eq("session_id", id))
      .data,
  ).toEqual([]);
  expect((await job(id)).lease_token).toBe(claimed.data.token);
  await db.rpc("settle_ketik_review", {
    p_session: id,
    p_token: claimed.data.token,
    p_release: true,
  });
  await expect
    .poll(async () => (await job(id)).status, { timeout: 10_000 })
    .toBe("completed");
  expect((await job(id)).attempt_count).toBe(3);
});

test("polling is read-only for missing jobs, old queues, expired leases, and missing published results", async () => {
  const id = await seedSession();
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("pending");
  await db
    .from("ketik_history")
    .update({ review_status: "processing" })
    .eq("id", id);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("processing");
  await request("/review", trainer, { sessionId: id });
  await db
    .from("ketik_review_jobs")
    .update({ updated_at: "2020-01-01T00:00:00Z" })
    .eq("session_id", id);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("queued");
  const claimed = await db.rpc("claim_ketik_review", {
    p_worker: "null-lease-probe",
    p_lease_seconds: 600,
    p_session: id,
  });
  expect(claimed.error).toBeNull();
  await db
    .from("ketik_review_jobs")
    .update({ lease_expires_at: null })
    .eq("session_id", id);
  const missingExpiry = await db.rpc("settle_ketik_review", {
    p_session: id,
    p_token: claimed.data.token,
    p_release: true,
  });
  expect(missingExpiry.error).toBeNull();
  expect(missingExpiry.data).toBe(false);
  await db
    .from("ketik_review_jobs")
    .update({ status: "processing", lease_expires_at: "2020-01-01T00:00:00Z" })
    .eq("session_id", id);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data.status,
  ).toBe("processing");
  expect((await job(id)).status).toBe("processing");
  await db
    .from("ketik_history")
    .update({ review_status: "completed", final_score: 80 })
    .eq("id", id);
  await db
    .from("ketik_review_jobs")
    .update({ status: "completed" })
    .eq("session_id", id);
  expect(
    (await request(`/review/status/${id}`).then((r) => r.json())).data,
  ).toMatchObject({ status: "failed", resultReady: false });
  expect((await job(id)).status).toBe("completed");
  const retry = await request("/review", trainer, {
    sessionId: id,
    requestId: randomUUID(),
  });
  expect(retry.status).toBe(202);
  expect((await job(id)).status).toBe("queued");
});

test("worker host refuses invalid activation and stays idle when disabled", async () => {
  // Disabled: the standalone entrypoint exits 1; the API keeps serving and claims nothing.
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  for (const overrides of [
    { KETIK_REVIEW_WORKER_ENABLED: "false" },
    {
      KETIK_REVIEW_WORKER_ENABLED: "true",
      KETIK_REVIEW_WORKER_INTERVAL_MS: "-1",
    },
  ]) {
    const child = spawnWorkerHost(overrides);
    let log = "";
    child.stdout.on("data", (data) => {
      log += String(data);
    });
    child.stderr.on("data", (data) => {
      log += String(data);
    });
    const exit = new Promise<number | null>((resolve) =>
      child.once("exit", resolve),
    );
    try {
      if (embedded() && overrides.KETIK_REVIEW_WORKER_ENABLED === "false") {
        await expect
          .poll(() => log, { timeout: 15_000 })
          .toContain("[API] Server running");
        expect(log).toContain('"event":"ketik_review_worker.disabled"');
        await new Promise((resolve) => setTimeout(resolve, 1500));
        expect((await job(id)).status).toBe("queued");
        expect((await job(id)).attempt_count).toBe(0);
        child.kill("SIGTERM");
        expect(await exit).toBe(0);
      } else {
        const code = await Promise.race([
          exit,
          new Promise<never>((_, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Worker host failed to stop")),
              15_000,
            );
            timer.unref();
          }),
        ]);
        expect(code).toBe(1);
        expect(log).toContain("ketik_review_worker.config_rejected");
        // Invalid config never reaches traffic in the API host.
        expect(log).not.toContain("[API] Server running");
      }
      expect(providerCalls).toBe(0);
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }
  }
});

test("competing real database claims admit only one worker and release invalidates its token", async () => {
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  expect(
    (
      await db.rpc("claim_ketik_review", {
        p_worker: "invalid-lease",
        p_lease_seconds: null,
        p_session: id,
      })
    ).error,
  ).not.toBeNull();
  const claims = await Promise.all(
    ["worker-a", "worker-b"].map((p_worker) =>
      db.rpc("claim_ketik_review", {
        p_worker,
        p_lease_seconds: 600,
        p_session: id,
      }),
    ),
  );
  expect(claims.every((claim) => claim.error === null)).toBe(true);
  const admitted = claims.map((claim) => claim.data).filter(Boolean);
  expect(admitted).toHaveLength(1);
  expect(admitted[0].status).toBe("processing");
  expect((await job(id)).attempt_count).toBe(1);
  expect(providerCalls).toBe(0);
  expect(
    (
      await db.rpc("settle_ketik_review", {
        p_session: id,
        p_token: admitted[0].token,
        p_release: null,
      })
    ).error,
  ).not.toBeNull();
  const release = await db.rpc("settle_ketik_review", {
    p_session: id,
    p_token: admitted[0].token,
    p_release: true,
  });
  expect(release.error).toBeNull();
  expect(release.data).toBe(true);
  expect(
    (
      await db.rpc("settle_ketik_review", {
        p_session: id,
        p_token: admitted[0].token,
        p_release: true,
      })
    ).data,
  ).toBe(false);
});

test("health becomes degraded when active work exceeds its lease-age bound", async () => {
  test.skip(
    embedded(),
    "The embedded worker has no loopback health server; the API's /health covers the process.",
  );
  const id = await seedSession();
  await request("/review", trainer, { sessionId: id });
  await startWorker();
  await expect.poll(() => providerCalls).toBe(1);
  const port = Number(workerLog.match(/"healthPort":(\d+)/)?.[1]);
  expect((await guarded(`http://127.0.0.1:${port}/health`)).status).toBe(200);
  worker?.kill("SIGUSR2");
  await expect
    .poll(async () => (await guarded(`http://127.0.0.1:${port}/health`)).status)
    .toBe(503);
});

test("migration rollback refuses live jobs, preserves published data, and reapply restores protected RPCs", async () => {
  const id = await seedSession(trainer.userId, true);
  await request("/review", trainer, { sessionId: id, rerun: true });
  const rollback = readFileSync(
    fileURLToPath(
      new URL(
        "../../../supabase/rollbacks/rollback_20261016000935_ketik_durable_review_worker.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  let refused = false;
  try {
    runSql(env, rollback);
  } catch {
    refused = true;
  }
  expect(refused).toBe(true);
  expect(
    (
      await db
        .from("ketik_review_jobs")
        .update({ status: "failed" })
        .eq("session_id", id)
    ).error,
  ).toBeNull();
  runSql(env, rollback);
  expect(
    (await db.from("ketik_history").select("final_score").eq("id", id).single())
      .data?.final_score,
  ).toBe(60);
  expect(
    (
      await db.rpc("enqueue_ketik_review", {
        p_actor: trainer.userId,
        p_session: id,
        p_request: randomUUID(),
      })
    ).error,
  ).not.toBeNull();
  // Reapply the worker migration and every later one that redefines its RPCs,
  // so the database ends at HEAD and a rerun of this spec stays meaningful.
  for (const migration of [
    "20261016000935_ketik_durable_review_worker.sql",
    "20261017150000_ketik_settle_review_drop_legacy_results.sql",
  ])
    runSql(
      env,
      readFileSync(
        fileURLToPath(
          new URL(`../../../supabase/migrations/${migration}`, import.meta.url),
        ),
        "utf8",
      ),
    );
  // DDL notifications are asynchronous/coalesced. Require stable API readiness after both commits.
  let ready = 0;
  await expect
    .poll(
      async () => {
        const response = await request(`/review/status/${id}`);
        const body = await response.json();
        ready =
          response.status === 200 && body.data?.resultReady === true
            ? ready + 1
            : 0;
        return ready;
      },
      { timeout: 5000, intervals: [100, 250, 500] },
    )
    .toBeGreaterThanOrEqual(3);
});
