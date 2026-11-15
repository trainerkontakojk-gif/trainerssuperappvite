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

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { tnaApiRequest } from "./helpers/tnaApi";
import { createAdmin, runSql } from "./helpers/sidakRealBackend";
import {
  DEFAULT_KETIK_SETTINGS,
  IMAGE_GENERATION_MODELS,
  TELEFUN_LIVE_MODELS,
  AI_TASKS,
  AI_TASK_DEFINITIONS,
  AiModelPolicyListResponse,
  AiModelPolicyAuditListResponse,
} from "@trainers/types";
import {
  env,
  quoted,
  app,
  trainer,
  agent,
  call,
  setupModelPolicySuite,
  teardownModelPolicySuite,
  resetModelPolicies,
} from "./helpers/monitoringModelsApiHarness";

test.beforeAll(setupModelPolicySuite);

test.afterAll(teardownModelPolicySuite);

test.beforeEach(resetModelPolicies);

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

test("selectable pricing matches catalogs and policies without retired or realtime text choices", async () => {
  const pricingRes = await call("GET", "/monitoring/pricing");
  expect(pricingRes.status).toBe(200);
  const pricing = (await pricingRes.json()).data as Array<{
    model_id: string;
    provider: string;
    historical?: boolean;
    editable?: boolean;
  }>;
  const policiesRes = await call("GET", "/monitoring/models");
  expect(policiesRes.status).toBe(200);
  const policies = (await policiesRes.json()).data as AiModelPolicyListResponse;
  const expectedIds = new Set(IMAGE_GENERATION_MODELS.map((model) => model.id));
  for (const module of ["ketik", "pdkt", "telefun"]) {
    const response = await call("GET", `/models?module=${module}`);
    expect(response.status).toBe(200);
    for (const model of (await response.json()).data) expectedIds.add(model.id);
  }
  for (const item of policies.items) {
    for (const model of item.eligible) {
      expectedIds.add(model.id);
      expect(pricing.find((row) => row.model_id === model.id)).toMatchObject({
        editable: true,
      });
      expect(TELEFUN_LIVE_MODELS.some((live) => live.id === model.id)).toBe(
        false,
      );
    }
  }
  const active = pricing.filter((row) => !row.historical);
  expect(active.map((row) => row.model_id).sort()).toEqual(
    [...expectedIds].sort(),
  );
  expect(active).toHaveLength(7);
  expect(
    active.every((row) => row.provider === "gemini" && row.editable === true),
  ).toBe(true);
  for (const path of ["/models", "/models?module=default"]) {
    const response = await call("GET", path);
    expect(response.status).toBe(200);
    expect(
      (await response.json()).data
        .map((model: { id: string }) => model.id)
        .sort(),
    ).toEqual(active.map((row) => row.model_id).sort());
  }
  const qaResponse = await call("GET", "/models?module=qa-analyzer");
  expect(qaResponse.status).toBe(200);
  expect(
    (await qaResponse.json()).data
      .map((model: { id: string }) => model.id)
      .sort(),
  ).toEqual(
    ["gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.5-flash-lite"].sort(),
  );
  expect(
    policies.items.find((item) => item.task === "ketik_review_fallback"),
  ).toMatchObject({
    codeDefault: "gemini-3.5-flash-lite",
    modelId: "gemini-3.5-flash-lite",
  });
});

test("retired pricing remains historical and cannot be edited or selected as fallback", async () => {
  const modelId = "gpt-5.4-mini";
  const before = await createAdmin(env)
    .from("ai_pricing_settings")
    .select("*")
    .eq("model_id", modelId)
    .maybeSingle();
  expect(before.error).toBeNull();
  const rates = {
    model_id: modelId,
    input_price_usd_per_million: 0.75,
    output_price_usd_per_million: 4.5,
  };
  try {
    expect(
      (
        await createAdmin(env)
          .from("ai_pricing_settings")
          .upsert(rates, { onConflict: "model_id" })
      ).error,
    ).toBeNull();
    const response = await call("GET", "/monitoring/pricing");
    expect(response.status).toBe(200);
    expect(
      (await response.json()).data.find(
        (row: { model_id: string }) => row.model_id === modelId,
      ),
    ).toMatchObject({ ...rates, historical: true, editable: false });
    const edit = await call("PUT", "/monitoring/pricing", rates);
    expect(edit.status).toBe(400);
    expect((await edit.json()).error.code).toBe("UNKNOWN_MODEL");
    const select = await call(
      "PUT",
      "/monitoring/models/ketik_review_fallback",
      { modelId },
    );
    expect(select.status).toBe(400);
    expect((await select.json()).error.code).toBe("MODEL_NOT_ELIGIBLE");
    runSql(
      env,
      `INSERT INTO ai_model_policy(task, model_id) VALUES ('ketik_review_fallback', '${modelId}');`,
    );
    const { resolveTaskModel, invalidateAiModelPolicyCache } =
      await import("../../api/src/lib/ai-model-policy");
    invalidateAiModelPolicyCache();
    expect(await resolveTaskModel("ketik_review_fallback")).toEqual({
      modelId: "gemini-3.5-flash-lite",
      source: "code",
    });
  } finally {
    if (before.data)
      expect(
        (await createAdmin(env).from("ai_pricing_settings").upsert(before.data))
          .error,
      ).toBeNull();
    else
      expect(
        (
          await createAdmin(env)
            .from("ai_pricing_settings")
            .delete()
            .eq("model_id", modelId)
        ).error,
      ).toBeNull();
  }
});

test("legacy KETIK snapshots and PDKT evaluation requests cannot call retired providers", async () => {
  const guarded = globalThis.fetch;
  const requestedModels: string[] = [];
  const db = createAdmin(env);
  let sessionId: string | undefined;
  globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (
      ["generativelanguage.googleapis.com", "api.openai.com"].includes(
        url.hostname,
      )
    ) {
      requestedModels.push(
        url.hostname === "api.openai.com" ? "openai" : url.pathname,
      );
      return Promise.resolve(
        Response.json(
          {
            error: {
              message: "e2e provider unavailable",
              status: "INVALID_ARGUMENT",
            },
          },
          { status: 400 },
        ),
      );
    }
    return guarded(request);
  };
  const request = (path: string, body: unknown) =>
    tnaApiRequest(app, `http://localhost/api/v1/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trainer.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    expect(
      (
        await tnaApiRequest(app, "http://localhost/api/v1/ketik/settings", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${trainer.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...DEFAULT_KETIK_SETTINGS,
            responsePacingMode: "training_fast",
          }),
        })
      ).status,
    ).toBe(200);
    const start = await request("ketik/sessions", { requestId: randomUUID() });
    expect(start.status).toBe(200);
    sessionId = (await start.json()).data.id;
    runSql(
      env,
      `UPDATE ketik_sessions SET snapshot=jsonb_set(snapshot, '{config,selectedModel}', '"gpt-5.4-mini"') WHERE id=${quoted(sessionId!)};`,
    );
    const turn = await request(`ketik/sessions/${sessionId}/turns`, {
      requestId: randomUUID(),
      expectedVersion: 0,
      text: "Selamat pagi.",
    });
    expect(turn.status).toBe(502);
    expect(requestedModels).toHaveLength(1);
    expect.soft(requestedModels[0]).toContain("gemini-3.8-flash");
    expect(
      runSql(
        env,
        `SELECT snapshot->'config'->>'selectedModel' FROM ketik_sessions WHERE id=${quoted(sessionId!)};`,
      ),
    ).toBe("gpt-5.4-mini");
    requestedModels.length = 0;
    const evaluation = await request("pdkt/mailbox/evaluate", {
      config: {
        scenarios: [
          {
            id: "s1",
            category: "Pengaduan",
            title: "Status laporan",
            description: "Periksa laporan saya.",
            isActive: true,
          },
        ],
        consumerType: { id: "calm", name: "Tenang", description: "Tenang" },
        identity: {
          name: "Rina",
          email: "rina@local.test",
          city: "Bandung",
          bodyName: "Rina",
        },
        enableImageGeneration: false,
        selectedModel: "deepseek-v4-pro",
      },
      emails: [
        {
          id: "inbound",
          from: "rina@local.test",
          to: "konsumen@ojk.go.id",
          subject: "Status laporan",
          body: "Periksa laporan saya.",
          timestamp: new Date().toISOString(),
          isAgent: false,
        },
        {
          id: "reply",
          from: "agent@local.test",
          to: "konsumen@ojk.go.id",
          subject: "Re: Status laporan",
          body: "Kami bantu periksa.",
          timestamp: new Date().toISOString(),
          isAgent: true,
        },
      ],
    });
    expect(evaluation.status).toBe(502);
    expect(requestedModels).toHaveLength(1);
    expect(requestedModels[0]).toContain("gemini-3.8-flash");
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
  }
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
