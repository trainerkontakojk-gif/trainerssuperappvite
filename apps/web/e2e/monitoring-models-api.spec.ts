import { resetSidakReferenceCache } from "./helpers/resetSidakReferenceCache";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { tnaApiRequest } from "./helpers/tnaApi";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
} from "./helpers/sidakRealBackend";
import {
  DEFAULT_KETIK_SETTINGS,
  AI_TASKS,
  AI_TASK_DEFINITIONS,
  AiModelPolicyListResponse,
  AiModelPolicyAuditListResponse,
} from "@trainers/types";

/**
 * Monitoring AI Model Policy E2E API tests.
 * Backend nyata in-process + Supabase lokal disposable.
 *
 * Verifikasi:
 * 1. Tabel kosong -> GET mengembalikan source: "code" dan codeDefault untuk semua tugas.
 * 2. PUT model eligible yang punya harga -> tersimpan, audit bertambah satu baris, GET mengembalikan source: "policy".
 * 3. PUT ditolak: model tanpa harga (MODEL_NO_PRICING), model tanpa audio untuk telefun_assessment (MODEL_NOT_ELIGIBLE),
 *    fallback sama dengan primary (FALLBACK_SAME_AS_PRIMARY), tugas tidak dikenal (TASK_UNKNOWN).
 * 4. Role tanpa capability (agent/leader) -> 403 untuk PUT/DELETE/GET.
 * 5. Baris berisi model tidak di registry -> resolve mengembalikan codeDefault.
 * 6. DELETE -> kembali ke codeDefault, audit tercatat.
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

let app: Hono;
let trainer: Awaited<ReturnType<typeof createUserWithJwt>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;

function call(
  method: string,
  path: string,
  body?: unknown,
  token = trainer.token,
) {
  return tnaApiRequest(app, `http://localhost/api/v1/ai${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
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
  trainer = await createUserWithJwt(env, "trainer", `modelpol-${ns}`);
  agent = await createUserWithJwt(env, "agent", `modelpol-${ns}`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  runSql(
    env,
    `DELETE FROM ai_model_policy;
     DELETE FROM ai_model_policy_audit;`,
  );
  for (const user of [trainer, agent].filter(Boolean)) {
    runSql(
      env,
      `DELETE FROM activity_logs WHERE user_id=${quoted(user.userId)};`,
    );
    const { error } = await createAdmin(env).auth.admin.deleteUser(user.userId);
    expect(error).toBeNull();
  }
});

test.beforeEach(async () => {
  const { invalidateAiModelPolicyCache } =
    await import("../../api/src/lib/ai-model-policy");
  invalidateAiModelPolicyCache();
  runSql(
    env,
    `DELETE FROM ai_model_policy;
     DELETE FROM ai_model_policy_audit;`,
  );
});

test.describe("AI Model Policy API", () => {
  test("1. Tabel kosong -> GET mengembalikan source 'code' dan codeDefault untuk semua tugas", async () => {
    const res = await call("GET", "/monitoring/models");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: true;
      data: AiModelPolicyListResponse;
    };
    const data = body.data;

    expect(data.items.length).toBe(AI_TASKS.length);
    for (const task of AI_TASKS) {
      const item = data.items.find((i) => i.task === task);
      expect(item).toBeDefined();
      expect(item?.source).toBe("code");
      expect(item?.modelId).toBe(AI_TASK_DEFINITIONS[task].codeDefault);
      expect(item?.codeDefault).toBe(AI_TASK_DEFINITIONS[task].codeDefault);
      expect(item?.eligible.length).toBeGreaterThan(0);
      expect(item?.updatedBy).toBeNull();
    }
  });

  test("2. PUT model eligible berbayar -> sukses, audit bertambah, GET menjadi source 'policy'", async () => {
    // Put sidak_forecast ke gemini-3.5-flash-lite
    const putRes = await call("PUT", "/monitoring/models/sidak_forecast", {
      modelId: "gemini-3.5-flash-lite",
    });
    expect(putRes.status).toBe(200);

    const getRes = await call("GET", "/monitoring/models");
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      success: true;
      data: AiModelPolicyListResponse;
    };
    const data = getBody.data;
    const item = data.items.find((i) => i.task === "sidak_forecast");
    expect(item?.modelId).toBe("gemini-3.5-flash-lite");
    expect(item?.source).toBe("policy");
    expect(item?.updatedBy).toBe(trainer.userId);

    // Cek audit log
    const auditRes = await call("GET", "/monitoring/models/audit");
    expect(auditRes.status).toBe(200);
    const auditBody = (await auditRes.json()) as {
      success: true;
      data: AiModelPolicyAuditListResponse;
    };
    const auditData = auditBody.data;
    expect(auditData.items.length).toBeGreaterThanOrEqual(1);
    const latest = auditData.items[0];
    expect(latest.task).toBe("sidak_forecast");
    expect(latest.newModelId).toBe("gemini-3.5-flash-lite");
    expect(latest.changedBy).toBe(trainer.userId);
    expect(latest.changedByName).toBe("E2E trainer");
  });

  test("3. Validasi penolakan PUT", async () => {
    // 3a. Tugas tidak dikenal
    const unknownTask = await call("PUT", "/monitoring/models/invalid_task", {
      modelId: "gemini-3.8-flash",
    });
    expect(unknownTask.status).toBe(400);

    // 3b. Model tanpa audio untuk telefun_assessment
    const noAudio = await call("PUT", "/monitoring/models/telefun_assessment", {
      modelId: "gpt-5.4-mini",
    });
    expect(noAudio.status).toBe(400);

    // 3c. Fallback sama dengan primary
    // Jika ketik_review sedang gemini-3.8-flash, fallback tidak boleh diubah ke gemini-3.8-flash
    const sameFallback = await call(
      "PUT",
      "/monitoring/models/ketik_review_fallback",
      {
        modelId: "gemini-3.8-flash",
      },
    );
    expect(sameFallback.status).toBe(400);
  });

  test("4. Role tanpa capability (agent) mendapat 403", async () => {
    const getRes = await call(
      "GET",
      "/monitoring/models",
      undefined,
      agent.token,
    );
    expect(getRes.status).toBe(403);

    const putRes = await call(
      "PUT",
      "/monitoring/models/sidak_forecast",
      { modelId: "gemini-3.5-flash-lite" },
      agent.token,
    );
    expect(putRes.status).toBe(403);

    const delRes = await call(
      "DELETE",
      "/monitoring/models/sidak_forecast",
      undefined,
      agent.token,
    );
    expect(delRes.status).toBe(403);
  });

  test("5. DELETE mengembalikan ke codeDefault dan mencatat audit", async () => {
    // Set dulu
    await call("PUT", "/monitoring/models/sidak_forecast", {
      modelId: "gemini-3.5-flash-lite",
    });

    // Delete
    const delRes = await call("DELETE", "/monitoring/models/sidak_forecast");
    expect(delRes.status).toBe(200);

    // GET harus kembali ke code
    const getRes = await call("GET", "/monitoring/models");
    const getBody = (await getRes.json()) as {
      success: true;
      data: AiModelPolicyListResponse;
    };
    const data = getBody.data;
    const item = data.items.find((i) => i.task === "sidak_forecast");
    expect(item?.source).toBe("code");
    expect(item?.modelId).toBe(AI_TASK_DEFINITIONS.sidak_forecast.codeDefault);

    // Audit mencatat pengembalian
    const auditRes = await call("GET", "/monitoring/models/audit");
    const auditBody = (await auditRes.json()) as {
      success: true;
      data: AiModelPolicyAuditListResponse;
    };
    const auditData = auditBody.data;
    expect(auditData.items[0].task).toBe("sidak_forecast");
    expect(auditData.items[0].newModelId).toBe(
      AI_TASK_DEFINITIONS.sidak_forecast.codeDefault,
    );
  });

  test("6. Baris model tidak di registry fallback ke codeDefault tanpa error", async () => {
    // Sisipkan row invalid langsung ke DB
    runSql(
      env,
      `INSERT INTO ai_model_policy (task, model_id) VALUES ('sidak_forecast', 'non-existent-model')
       ON CONFLICT (task) DO UPDATE SET model_id = EXCLUDED.model_id;`,
    );

    const { resolveTaskModel, invalidateAiModelPolicyCache } =
      await import("../../api/src/lib/ai-model-policy");
    invalidateAiModelPolicyCache();

    const resolved = await resolveTaskModel("sidak_forecast");
    expect(resolved.source).toBe("code");
    expect(resolved.modelId).toBe(
      AI_TASK_DEFINITIONS.sidak_forecast.codeDefault,
    );
  });
});

test("Gemini-only tasks reject GPT and hide it from eligible options", async () => {
  for (const task of ["sidak_forecast", "telefun_assessment"]) {
    const res = await call("PUT", `/monitoring/models/${task}`, {
      modelId: "gpt-5.4-mini",
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("MODEL_NOT_ELIGIBLE");
  }
  const body = await call("GET", "/monitoring/models").then((r) => r.json());
  for (const task of ["sidak_forecast", "telefun_assessment"]) {
    expect(
      body.data.items
        .find((i: { task: string }) => i.task === task)
        .eligible.every((m: { provider: string }) => m.provider === "gemini"),
    ).toBe(true);
  }
});

test("reset rolls back deletion when audit insert fails", async () => {
  expect(
    (
      await call("PUT", "/monitoring/models/sidak_forecast", {
        modelId: "gemini-3.5-flash-lite",
      })
    ).status,
  ).toBe(200);
  runSql(
    env,
    `CREATE FUNCTION public.e2e_policy_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit failure'; END $$;
    CREATE TRIGGER e2e_policy_audit_fail BEFORE INSERT ON public.ai_model_policy_audit FOR EACH ROW EXECUTE FUNCTION public.e2e_policy_audit_fail();`,
  );
  try {
    expect(
      (await call("DELETE", "/monitoring/models/sidak_forecast")).status,
    ).toBe(500);
    expect(
      runSql(
        env,
        "SELECT model_id FROM ai_model_policy WHERE task='sidak_forecast'",
      ),
    ).toBe("gemini-3.5-flash-lite");
  } finally {
    runSql(
      env,
      "DROP TRIGGER e2e_policy_audit_fail ON public.ai_model_policy_audit; DROP FUNCTION public.e2e_policy_audit_fail();",
    );
  }
});

test("pricing requires a current or due schedule, never a future schedule", async () => {
  // Transactional backup/restore keeps local pricing intact even after a failed assertion.
  const current = await createAdmin(env)
    .from("ai_pricing_settings")
    .select("*")
    .eq("model_id", "gemini-3.5-flash-lite");
  const scheduled = await createAdmin(env)
    .from("ai_pricing_schedule")
    .select("*")
    .eq("model_id", "gemini-3.5-flash-lite");
  expect(current.error).toBeNull();
  expect(scheduled.error).toBeNull();
  try {
    runSql(
      env,
      "DELETE FROM ai_pricing_settings WHERE model_id='gemini-3.5-flash-lite'; DELETE FROM ai_pricing_schedule WHERE model_id='gemini-3.5-flash-lite';",
    );
    const noPrice = await call("PUT", "/monitoring/models/sidak_forecast", {
      modelId: "gemini-3.5-flash-lite",
    });
    expect(noPrice.status).toBe(400);
    expect((await noPrice.json()).error.code).toBe("MODEL_NO_PRICING");
    runSql(
      env,
      `INSERT INTO ai_pricing_schedule(model_id, effective_from, input_price_usd_per_million, output_price_usd_per_million) VALUES ('gemini-3.5-flash-lite', now() + interval '1 day', 1, 2);`,
    );
    expect(
      (
        await call("PUT", "/monitoring/models/sidak_forecast", {
          modelId: "gemini-3.5-flash-lite",
        })
      ).status,
    ).toBe(400);
    runSql(
      env,
      "UPDATE ai_pricing_schedule SET effective_from=now() - interval '1 day' WHERE model_id='gemini-3.5-flash-lite';",
    );
    const body = await call("GET", "/monitoring/models").then((r) => r.json());
    expect(
      body.data.items
        .find((i: { task: string }) => i.task === "sidak_forecast")
        .eligible.find((m: { id: string }) => m.id === "gemini-3.5-flash-lite")
        .hasPricing,
    ).toBe(true);
    expect(
      (
        await call("PUT", "/monitoring/models/sidak_forecast", {
          modelId: "gemini-3.5-flash-lite",
        })
      ).status,
    ).toBe(200);
  } finally {
    runSql(
      env,
      "DELETE FROM ai_pricing_schedule WHERE model_id='gemini-3.5-flash-lite';",
    );
    if (current.data?.length)
      expect(
        (
          await createAdmin(env)
            .from("ai_pricing_settings")
            .insert(current.data)
        ).error,
      ).toBeNull();
    if (scheduled.data?.length)
      expect(
        (
          await createAdmin(env)
            .from("ai_pricing_schedule")
            .insert(scheduled.data)
        ).error,
      ).toBeNull();
  }
});

for (const selectedModel of ["gemini-3.5-flash-lite", "gemini-4-hydrogen"]) {
  test(`selected SIDAK and KETIK models reach the provider and ai_usage_logs (${selectedModel})`, async () => {
    const requestedModels: string[] = [];
    const server = createServer(async (req, res) => {
      for await (const _chunk of req) {
        /* drain request */
      }
      requestedModels.push(req.url ?? "");
      const text = req.url?.includes("generateContent")
        ? JSON.stringify({
            scores: {
              final: 80,
              empathy: 80,
              probing: 80,
              resolution: 80,
              typo: 80,
              compliance: 80,
            },
            summary: "Local policy review",
            strengths: ["Jelas"],
            weaknesses: ["Probing"],
            coachingFocus: ["Verifikasi"],
          })
        : "Local forecast";
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          candidates: [
            {
              content: { role: "model", parts: [{ text }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata:
            selectedModel === "gemini-4-hydrogen"
              ? {
                  promptTokenCount: 10000,
                  cachedContentTokenCount: 8000,
                  candidatesTokenCount: 500,
                  thoughtsTokenCount: 500,
                  totalTokenCount: 11000,
                }
              : {
                  promptTokenCount: 10,
                  candidatesTokenCount: 5,
                  totalTokenCount: 15,
                },
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Loopback provider unavailable");
    const guarded = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      return guarded(
        url.hostname === "generativelanguage.googleapis.com"
          ? new Request(`http://127.0.0.1:${address.port}${url.pathname}`, req)
          : req,
      );
    };
    const id = randomUUID();
    const batch = `policy-${ns}`;
    const year = 2097;
    expect(
      runSql(env, `SELECT count(*) FROM qa_periods WHERE year=${year}`),
    ).toBe("0");
    expect(
      runSql(env, `SELECT count(*) FROM profiler_years WHERE year=${year}`),
    ).toBe("0");
    try {
      runSql(
        env,
        `INSERT INTO profiler_years(id,year,label) VALUES ('${id}',${year},'Policy E2E');
      INSERT INTO profiler_folders(id,name,year_id) VALUES ('${id}','${batch}','${id}');
      INSERT INTO qa_periods (month,year) VALUES (1,${year}),(2,${year});
      INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,nomor_urut) VALUES ('${id}','${batch}','Policy Agent','Uji','Agent',1);
      INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,no_tiket,is_phantom_padding,nilai,ketidaksesuaian,tahun)
      SELECT '${id}',p.id,i.id,'call','${ns}-' || p.month,false,0,'Policy finding',${year}
      FROM qa_periods p CROSS JOIN LATERAL (SELECT id FROM qa_indicators WHERE service_type='call' AND is_active LIMIT 1) i WHERE p.year=${year};`,
      );
      await resetSidakReferenceCache();
      expect(
        (
          await call("PUT", "/monitoring/models/sidak_forecast", {
            modelId: selectedModel,
          })
        ).status,
      ).toBe(200);
      const forecast = await tnaApiRequest(
        app,
        "http://localhost/api/v1/sidak/dashboard/forecast",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${trainer.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filters: { year, batchNames: [batch] },
            forceRefresh: true,
          }),
        },
      );
      expect(forecast.status, await forecast.clone().text()).toBe(200);
      expect(requestedModels.some((url) => url.includes(selectedModel))).toBe(
        true,
      );
      expect(
        (
          await call("PUT", "/monitoring/models/ketik_review", {
            modelId: selectedModel,
          })
        ).status,
      ).toBe(200);
      const db = createAdmin(env);
      expect(
        (
          await db.from("ketik_history").insert({
            id,
            user_id: trainer.userId,
            scenario_title: "Policy review",
            consumer_name: "Konsumen",
            messages: [
              {
                id: "m1",
                sender: "agent",
                text: "Selamat pagi",
                timestamp: new Date().toISOString(),
              },
            ],
            review_status: "pending",
          })
        ).error,
      ).toBeNull();
      const enqueue = await tnaApiRequest(
        app,
        "http://localhost/api/v1/ketik/review",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${trainer.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId: id, requestId: randomUUID() }),
        },
      );
      expect(enqueue.status).toBe(202);
      const { claimKetikReview, processClaimedKetikReview } =
        await import("../../api/src/services/ketik/review-lifecycle");
      const claim = await claimKetikReview("policy-e2e", id);
      expect(claim?.status).toBe("processing");
      if (!claim || claim.status !== "processing")
        throw new Error("Claim unavailable");
      expect(
        (
          await call("PUT", "/monitoring/models/ketik_review", {
            modelId: "gemini-3.8-flash",
          })
        ).status,
      ).toBe(200);
      const result = await processClaimedKetikReview(claim);
      expect(result.status).toBe("completed");
      await expect
        .poll(async () => {
          const logs = await db
            .from("ai_usage_logs")
            .select(
              "action,model_id,input_price_usd_per_million,output_price_usd_per_million,cached_input_text_price_usd_per_million,input_tokens,input_text_tokens,cached_input_text_tokens,input_unspecified_tokens,output_tokens,estimated_cost_usd",
            )
            .eq("user_id", trainer.userId);
          expect(logs.error).toBeNull();
          return logs.data;
        })
        .toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              action: "generate-trend-forecast",
              model_id: selectedModel,
            }),
            expect.objectContaining({
              action: "coaching_review",
              model_id: selectedModel,
            }),
          ]),
        );
      if (selectedModel === "gemini-4-hydrogen") {
        const usage = await db
          .from("ai_usage_logs")
          .select(
            "input_price_usd_per_million,output_price_usd_per_million,cached_input_text_price_usd_per_million,input_tokens,input_text_tokens,cached_input_text_tokens,input_unspecified_tokens,output_tokens,estimated_cost_usd",
          )
          .eq("user_id", trainer.userId);
        expect(usage.error).toBeNull();
        expect(usage.data).toHaveLength(2);
        for (const row of usage.data ?? []) {
          expect(row.input_price_usd_per_million).toBe(1.5);
          expect(row.output_price_usd_per_million).toBe(7.5);
          expect(row.cached_input_text_price_usd_per_million).toBe(0.075);
          expect(row.input_tokens).toBe(10000);
          expect(row.input_text_tokens).toBe(8000);
          expect(row.cached_input_text_tokens).toBe(8000);
          expect(row.input_unspecified_tokens).toBe(2000);
          expect(row.output_tokens).toBe(1000); // Includes 500 thinking tokens.
          expect(row.estimated_cost_usd).toBe(0.0111);
        }
      }
      await test.info().attach("selected-model-evidence", {
        body: JSON.stringify({
          requestedModels,
          logs: (
            await db
              .from("ai_usage_logs")
              .select(
                "action,model_id,input_price_usd_per_million,output_price_usd_per_million,cached_input_text_price_usd_per_million,input_tokens,input_text_tokens,cached_input_text_tokens,input_unspecified_tokens,output_tokens,estimated_cost_usd",
              )
              .eq("user_id", trainer.userId)
          ).data,
        }),
        contentType: "application/json",
      });
    } finally {
      globalThis.fetch = guarded;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      runSql(
        env,
        `DELETE FROM ketik_history WHERE id='${id}'; DELETE FROM qa_temuan WHERE peserta_id='${id}'; DELETE FROM profiler_peserta WHERE id='${id}'; DELETE FROM qa_periods WHERE year=${year}; DELETE FROM profiler_folders WHERE id='${id}'; DELETE FROM profiler_years WHERE id='${id}'; DELETE FROM sidak_dashboard_forecast_snapshots WHERE generated_by='${trainer.userId}'; DELETE FROM ai_usage_logs WHERE user_id='${trainer.userId}';`,
      );
    }
  });
}

test("KETIK claims use the configured fallback timeout for the lease", async () => {
  const id = randomUUID();
  const db = createAdmin(env);
  try {
    expect(
      (
        await call("PUT", "/monitoring/models/ketik_review_fallback", {
          modelId: "gpt-5.6-luna",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await db.from("ketik_history").insert({
          id,
          user_id: trainer.userId,
          scenario_title: "Lease policy",
          consumer_name: "Konsumen",
          messages: [],
          review_status: "pending",
        })
      ).error,
    ).toBeNull();
    const res = await tnaApiRequest(
      app,
      "http://localhost/api/v1/ketik/review",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${trainer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: id, requestId: randomUUID() }),
      },
    );
    expect(res.status).toBe(202);
    const { claimKetikReview } =
      await import("../../api/src/services/ketik/review-lifecycle");
    expect((await claimKetikReview("policy-lease-e2e", id))?.status).toBe(
      "processing",
    );
    expect(
      Number(
        runSql(
          env,
          `SELECT extract(epoch FROM (lease_expires_at - now())) FROM ketik_review_jobs WHERE session_id='${id}'`,
        ),
      ),
    ).toBeGreaterThan(655);
  } finally {
    expect(
      (await db.from("ketik_history").delete().eq("id", id)).error,
    ).toBeNull();
  }
});

test("Hydrogen is additive in model catalogs and system-task policy options", async () => {
  for (const module of ["ketik", "pdkt", "qa-analyzer"]) {
    const res = await call("GET", `/models?module=${module}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((model: { id: string }) => model.id)).toEqual(
      expect.arrayContaining([
        "gemini-4-hydrogen",
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
      ]),
    );
    expect(
      body.data.find(
        (model: { id: string }) => model.id === "gemini-4-hydrogen",
      ),
    ).toMatchObject({
      provider: "gemini",
      supportsTemperature: false,
      capabilities: { supportsText: true, supportsImage: true },
    });
  }
  const policies = await call("GET", "/monitoring/models").then((r) =>
    r.json(),
  );
  for (const item of policies.data.items) {
    expect(item.source).toBe("code");
    expect(item.modelId).toBe(
      AI_TASK_DEFINITIONS[item.task as keyof typeof AI_TASK_DEFINITIONS]
        .codeDefault,
    );
    expect(
      item.eligible.some(
        (model: { id: string }) => model.id === "gemini-4-hydrogen",
      ),
    ).toBe(item.task !== "telefun_assessment");
  }
});

test("KETIK settings and sessions retain Hydrogen and still accept Flash", async () => {
  const request = (path: string, method = "GET", body?: unknown) =>
    tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${trainer.token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  for (const model of ["gemini-4-hydrogen", "gemini-3.8-flash"]) {
    expect(
      (
        await request("/settings", "PUT", {
          ...DEFAULT_KETIK_SETTINGS,
          selectedModel: model,
        })
      ).status,
    ).toBe(200);
    const response = await request("/sessions", "POST", {
      requestId: randomUUID(),
    });
    expect(response.status).toBe(200);
    const session = (await response.json()).data;
    try {
      expect(session.config.selectedModel).toBe(model);
    } finally {
      expect(
        (
          await createAdmin(env)
            .from("ketik_sessions")
            .delete()
            .eq("id", session.id)
        ).error,
      ).toBeNull();
    }
  }
});

test("Hydrogen with missing pricing logs real tokens at zero cost and cannot be saved as a policy", async () => {
  const db = createAdmin(env);
  const pricing = await db
    .from("ai_pricing_settings")
    .select("*")
    .eq("model_id", "gemini-4-hydrogen");
  expect(pricing.error).toBeNull();
  const guarded = globalThis.fetch;
  const providerPaths: string[] = [];
  let sessionId: string | undefined;
  try {
    expect(
      (
        await db
          .from("ai_pricing_settings")
          .delete()
          .eq("model_id", "gemini-4-hydrogen")
      ).error,
    ).toBeNull();
    const response = await call("PUT", "/monitoring/models/default_text", {
      modelId: "gemini-4-hydrogen",
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("MODEL_NO_PRICING");
    globalThis.fetch = (input, init) => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      if (url.hostname === "generativelanguage.googleapis.com") {
        providerPaths.push(url.pathname);
        return Promise.resolve(
          Response.json({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [{ text: "Saya membutuhkan bantuan." }],
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
      }
      return guarded(req);
    };
    const request = (path: string, method: string, body: unknown) =>
      tnaApiRequest(app, `http://localhost/api/v1/ketik${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${trainer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    expect(
      (
        await request("/settings", "PUT", {
          ...DEFAULT_KETIK_SETTINGS,
          selectedModel: "gemini-4-hydrogen",
          responsePacingMode: "training_fast",
        })
      ).status,
    ).toBe(200);
    const start = await request("/sessions", "POST", {
      requestId: randomUUID(),
    });
    expect(start.status).toBe(200);
    sessionId = (await start.json()).data.id;
    const turn = await request(`/sessions/${sessionId}/turns`, "POST", {
      requestId: randomUUID(),
      expectedVersion: 0,
      text: "Selamat pagi.",
    });
    expect(turn.status).toBe(200);
    expect(providerPaths).toHaveLength(1);
    expect(providerPaths[0]).toContain("gemini-4-hydrogen");
    const logs = await db
      .from("ai_usage_logs")
      .select(
        "model_id,input_tokens,output_tokens,input_price_usd_per_million,output_price_usd_per_million,estimated_cost_usd",
      )
      .eq("user_id", trainer.userId);
    expect(logs.error).toBeNull();
    expect(logs.data).toEqual([
      expect.objectContaining({
        model_id: "gemini-4-hydrogen",
        input_tokens: 10,
        output_tokens: 5,
        input_price_usd_per_million: 0,
        output_price_usd_per_million: 0,
        estimated_cost_usd: 0,
      }),
    ]);
  } finally {
    globalThis.fetch = guarded;
    if (sessionId)
      expect(
        (await db.from("ketik_sessions").delete().eq("id", sessionId)).error,
      ).toBeNull();
    expect(
      (await db.from("ai_usage_logs").delete().eq("user_id", trainer.userId))
        .error,
    ).toBeNull();
    if (pricing.data?.length)
      expect(
        (await db.from("ai_pricing_settings").insert(pricing.data)).error,
      ).toBeNull();
  }
});
