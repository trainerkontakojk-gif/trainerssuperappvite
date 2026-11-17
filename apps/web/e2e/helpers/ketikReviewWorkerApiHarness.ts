// Shared by the ketik-review-worker-api-*.spec.ts files.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./sidakRealBackend";
import { tnaApiRequest } from "./tnaApi";

export const env = readLoopbackEnv();

export const db = createAdmin(env);

export let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;

export let app: Hono;

export const identities: Awaited<ReturnType<typeof createUserWithJwt>>[] = [];

export let agent: typeof trainer;

export let leader: typeof trainer;

export let admin: typeof trainer;

export let otherTrainer: typeof trainer;

export let guarded: typeof fetch;

export const suiteDefaults = () => ({
  providerMode: "hold" as "hold" | "success" | "fail",
  boundaryRequests: [] as unknown[],
  providerCalls: 0,
  providerAborts: 0,
  guidancePayload: undefined as unknown,
  verificationPayload: undefined as unknown,
});

export const suite = suiteDefaults();

export const releases: Array<() => void> = [];

export const releaseProvider = () => {
  for (const release of releases.splice(0)) release();
};

export let worker: ChildProcess | undefined;

export let workerLog = "";

export const fixtures = new Set<string>();

export let providerOrigin: string;

export const server = createServer(async (req, res) => {
  let raw = "";
  for await (const chunk of req) raw += String(chunk);
  suite.boundaryRequests.push(JSON.parse(raw || "{}"));
  suite.providerCalls++;
  let releaseHeld: (() => void) | undefined;
  res.once("close", () => {
    if (!res.writableEnded) {
      suite.providerAborts++;
      releaseHeld?.();
    }
  });
  if (suite.providerMode === "hold")
    await new Promise<void>((resolve) => {
      releaseHeld = resolve;
      releases.push(resolve);
    });
  if (res.destroyed) return;
  if (suite.providerMode === "fail") {
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
                  dimensionGuidance: suite.guidancePayload,
                  verification: suite.verificationPayload,
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
        thoughtsTokenCount: 20,
        totalTokenCount: 35,
      },
    }),
  );
});

// Each spec file runs this once, so it resets every per-file collection and
// creates its own users; the provider server is re-opened after the previous
// file closed it.
export async function setupKetikReviewWorkerSuite() {
  Object.assign(suite, suiteDefaults());
  identities.length = 0;
  fixtures.clear();
  releases.length = 0;
  workerLog = "";
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
  app = (await import("../../../api/src/app")).default as unknown as Hono;
}

export async function teardownKetikReviewWorkerSuite() {
  releaseProvider();
  globalThis.fetch = guarded;
  for (const identity of identities)
    expect((await db.auth.admin.deleteUser(identity.userId)).error).toBeNull();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

// Disposable instrumentation only: not installed by product migrations.
export function installKetikReviewTransitionGuard() {
  const guard = `e2e_review_transition_${randomUUID().replaceAll("-", "")}`;
  runSql(
    env,
    `
    CREATE FUNCTION public.${guard}() RETURNS trigger
    LANGUAGE plpgsql SET search_path = '' AS $$
    DECLARE stack text;
    BEGIN
      GET DIAGNOSTICS stack = PG_CONTEXT;
      IF position('transition_ketik_review_job(' IN stack) = 0 THEN
        RAISE EXCEPTION 'e2e-review-transition-bypass';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER ${guard} AFTER UPDATE OF status ON public.ketik_review_jobs
      FOR EACH ROW EXECUTE FUNCTION public.${guard}();
    CREATE TRIGGER ${guard} AFTER UPDATE OF review_status ON public.ketik_history
      FOR EACH ROW EXECUTE FUNCTION public.${guard}();
  `,
  );
  return () => runSql(env, `DROP FUNCTION public.${guard}() CASCADE;`);
}

export async function seedSession(ownerId = trainer.userId, completed = false) {
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

export async function request(
  path: string,
  identity = trainer,
  body?: unknown,
) {
  return tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${identity.token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export async function job(id: string) {
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
export const EMBEDDED_PROJECT = "ketik-review-worker-embedded-real-backend";

export const embedded = () => test.info().project.name === EMBEDDED_PROJECT;

export function spawnWorkerHost(overrides: Record<string, string>) {
  const entry = embedded()
    ? "../../../api/src/index.ts"
    : "../../../api/src/workers/ketik-review-worker-entrypoint.ts";
  return spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--import",
      fileURLToPath(new URL("./ketikWorkerTransport.mjs", import.meta.url)),
      fileURLToPath(new URL(entry, import.meta.url)),
    ],
    {
      cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
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

export async function startWorker(overrides: Record<string, string> = {}) {
  workerLog = "";
  worker = spawnWorkerHost({
    KETIK_REVIEW_WORKER_ENABLED: "true",
    KETIK_REVIEW_WORKER_INTERVAL_MS: "250",
    KETIK_REVIEW_WORKER_SHUTDOWN_MS: "500",
    KETIK_REVIEW_WORKER_HEALTH_PORT: "0",
    ...overrides,
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

export async function stopWorker(signal: NodeJS.Signals = "SIGTERM") {
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

export function resetKetikReviewWorkerTest() {
  suite.providerMode = "hold";
  suite.providerCalls = 0;
  suite.providerAborts = 0;
  suite.boundaryRequests = [];
  suite.guidancePayload = undefined;
  suite.verificationPayload = undefined;
}

export async function cleanupKetikReviewWorkerTest() {
  await stopWorker();
  releaseProvider();
  for (const id of fixtures)
    expect(
      (await db.from("ketik_history").delete().eq("id", id)).error,
    ).toBeNull();
  fixtures.clear();
}
