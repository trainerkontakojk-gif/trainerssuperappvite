import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { hc } from "hono/client";
import type { AppType } from "../../api/src/app";
import type {
  TnaNeed,
  TnaPlan,
  TnaPlanDetail,
  TnaEvaluationPeriodInput,
} from "@trainers/types";
import { tnaApiRequest } from "./helpers/tnaApi";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  createUserWithJwt,
  runSql,
} from "./helpers/sidakRealBackend";

const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const admin = createAdmin(fixture.env);
let users: Awaited<ReturnType<typeof fixture.seed>>;
let app: Hono;
let programId: string;
let today: string;
let tomorrow: string;
let year: string;
const denied: Awaited<ReturnType<typeof createUserWithJwt>>[] = [];
const baselinePeriod = fixture.ids.periods[1]!;
const evaluationPeriod = fixture.ids.periods[2]!;
const emptyPeriod = fixture.ids.extraPeriods[0]!;
const reason = "Pelatihan dibatalkan karena kebutuhan operasional berubah.";
const conclusion = "Hasil evaluasi ditinjau dan perlu tindak lanjut terarah.";

function sql(query: string) {
  try {
    return runSql(fixture.env, query);
  } catch {
    throw new Error("TNA flow SQL failed; raw command suppressed");
  }
}
async function call<T = TnaPlan>(
  path: string,
  method = "GET",
  body?: unknown,
  token: string | null = users.trainer.token,
) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  return {
    status: response.status,
    ...((await response.json()) as {
      success: boolean;
      data: T;
      error?: { code: string; message: string };
    }),
  };
}
const needBody = (overrides = {}) => ({
  service_type: "chat",
  period_id: baselinePeriod,
  indicator_id: fixture.ids.metricsIndicators.alpha,
  compare_count: 2,
  validated_cluster_id: "kurang_menggali",
  cause_note: "Trainer memvalidasi kebutuhan dan tindak lanjut.",
  gap_type: "skill",
  outcome: "training",
  ...overrides,
});
async function draft(due = today, token = users.trainer.token) {
  const need = await call<TnaNeed>("/needs", "POST", needBody(), token);
  expect(need.status).toBe(201);
  const created = await call(
    "/plans",
    "POST",
    {
      need_id: need.data.id,
      program_id: programId,
      title: "Pelatihan evaluasi terarah",
      intervention_type: "kelas",
      start_date: `${year}-02-01`,
      end_date: `${year}-02-02`,
      evaluation_due_date: due,
      target_max_rate_per_100: 1,
      target_max_spread_pct: 10,
      participant_peserta_ids: fixture.ids.participants.slice(0, 2),
    },
    token,
  );
  expect(created.status).toBe(201);
  return created.data;
}
async function active(due = today, token = users.trainer.token) {
  const plan = await draft(due, token);
  const activated = await call(
    `/plans/${plan.id}/activate`,
    "POST",
    { expected_updated_at: plan.updated_at },
    token,
  );
  expect(activated.status).toBe(200);
  return activated.data;
}
async function detail(id: string) {
  const result = await call<TnaPlanDetail>(`/plans/${id}`);
  expect(result.status).toBe(200);
  return result.data;
}
const periodInput = (plan: TnaPlan, period = evaluationPeriod) => ({
  expected_updated_at: plan.updated_at,
  evaluation_period_id: period,
});
const completeInput = (plan: TnaPlan, follow_up = "selesai_tuntas") => ({
  expected_updated_at: plan.updated_at,
  conclusion_note: conclusion,
  follow_up,
});
async function evaluating(
  period = evaluationPeriod,
  token = users.trainer.token,
) {
  const plan = await active(today, token);
  const started = await call(
    `/plans/${plan.id}/start-evaluation`,
    "POST",
    periodInput(plan, period),
    token,
  );
  expect(started.status).toBe(200);
  return started.data;
}
// Seed a completed predecessor through existing T1 RPCs, so the first RED
// isolates K15's DB writer rather than the new HTTP routes not existing yet.
async function predecessor(followUp = "perlu_rencana_lanjutan") {
  const plan = await active();
  const started = await admin.rpc("tna_start_plan_evaluation", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: plan.updated_at,
    p_evaluation_period_id: evaluationPeriod,
  });
  expect(started.error).toBeNull();
  const preview = await detail(plan.id);
  const completed = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: started.data.updated_at,
    p_evaluation_snapshot: preview.evaluation,
    p_participant_evaluations: preview.participant_evaluation!.map(
      ({ participant_id, audited_in_eval, eval_findings, eval_sessions }) => ({
        participant_id,
        audited_in_eval,
        eval_findings,
        eval_sessions,
      }),
    ),
    p_verdict: preview.evaluation!.verdict,
    p_conclusion_note: conclusion,
    p_follow_up: followUp,
  });
  expect(completed.error).toBeNull();
  return completed.data as TnaPlan;
}
async function linkRpc(
  previous: string | null,
  overrides = {},
  actor = users.trainer.userId,
) {
  const validated = await call<TnaNeed>(
    "/needs",
    "POST",
    needBody({ period_id: evaluationPeriod }),
  );
  expect(validated.status).toBe(201);
  return admin.rpc("tna_create_need", {
    p_actor_id: actor,
    p_payload: {
      ...needBody({ period_id: evaluationPeriod }),
      validation_snapshot: validated.data.validation_snapshot,
      suggested_cluster_id: "kurang_menggali",
      previous_plan_id: previous,
      ...overrides,
    },
  });
}

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: fixture.env.apiUrl,
    VITE_SUPABASE_ANON_KEY: fixture.env.anonKey,
    SUPABASE_ANON_KEY: fixture.env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: fixture.env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  // Fail closed before ANY exposed RPC invocation: do not probe denied EXECUTE.
  const acl = sql(
    "SELECT bool_and(has_function_privilege(r.role,p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) r(role) WHERE n.nspname='public' AND p.proname IN ('tna_create_need','tna_create_plan','tna_activate_plan','tna_start_plan_evaluation','tna_update_evaluation_period','tna_complete_plan','tna_cancel_plan');",
  );
  expect(acl).toBe("t");
  users = await fixture.seed();
  // April normally holds the shared pagination substrate. This flow needs a
  // genuine no-audit month, so remove only this namespace's April rows.
  sql(
    `DELETE FROM qa_temuan WHERE period_id='${emptyPeriod}' AND peserta_id IN ('${fixture.ids.participants.join("','")}');`,
  );
  for (const role of ["leader", "agent"] as const)
    denied.push(await createUserWithJwt(fixture.env, role, namespace));
  programId = sql(
    "SELECT id FROM tna_programs WHERE code='effective-probing';",
  );
  today = sql("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;");
  tomorrow = sql(
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date + 1;",
  );
  year = sql(`SELECT year FROM qa_periods WHERE id='${baselinePeriod}';`);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});
test.afterAll(async () => {
  const periods = [...fixture.ids.periods, ...fixture.ids.extraPeriods].join(
    "','",
  );
  // Remove child plans/linked needs first; predecessor FK is ON DELETE RESTRICT.
  sql(
    `BEGIN; DELETE FROM tna_plans WHERE need_id IN (SELECT id FROM tna_needs WHERE period_id IN ('${periods}') AND previous_plan_id IS NOT NULL); DELETE FROM tna_needs WHERE period_id IN ('${periods}') AND previous_plan_id IS NOT NULL; DELETE FROM tna_plans WHERE need_id IN (SELECT id FROM tna_needs WHERE period_id IN ('${periods}')); DELETE FROM tna_needs WHERE period_id IN ('${periods}'); COMMIT;`,
  );
  for (const user of denied)
    expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
  await fixture.cleanup();
});

test("previous_plan_id RPC persists K15 link and rejects invalid predecessors atomically", async () => {
  const previous = await predecessor();
  const valid = await linkRpc(previous.id);
  expect(valid.error).toBeNull();
  expect(valid.data.previous_plan_id).toBe(previous.id);
  expect(
    sql(`SELECT previous_plan_id FROM tna_needs WHERE id='${valid.data.id}';`),
  ).toBe(previous.id);
  const notCompleted = await active();
  const wrongFollowUp = await predecessor("selesai_tuntas");
  const before = sql(
    `SELECT count(*) FROM tna_needs WHERE previous_plan_id IS NOT NULL AND period_id='${evaluationPeriod}';`,
  );
  for (const [id, overrides] of [
    [randomUUID(), {}],
    ["malformed-uuid", {}],
    [notCompleted.id, {}],
    [wrongFollowUp.id, {}],
    [previous.id, { indicator_id: fixture.ids.metricsIndicators.beta }],
    [previous.id, { service_type: "call" }],
  ] as const) {
    const rejected = await linkRpc(id, overrides);
    expect(rejected.error?.message).toBe("TNA_PREVIOUS_PLAN_INVALID");
    expect(rejected.data).toBeNull();
    expect(
      sql(
        `SELECT count(*) FROM tna_needs WHERE previous_plan_id IS NOT NULL AND period_id='${evaluationPeriod}';`,
      ),
    ).toBe(before);
  }
  const legacy = await linkRpc(null);
  expect(legacy.error).toBeNull();
  expect(legacy.data.previous_plan_id).toBeNull();
});

test("previous_plan_id RPC retains guard-first JWT denial and actor validation", async () => {
  const previous = await predecessor();
  const payload = {
    ...needBody(),
    previous_plan_id: previous.id,
    validation_snapshot: {},
  };
  const before = sql("SELECT count(*) FROM tna_needs;");
  for (const token of [
    fixture.env.anonKey,
    users.trainer.token,
    ...denied.map((u) => u.token),
  ]) {
    const response = await fetch(
      `${fixture.env.apiUrl}/rest/v1/rpc/tna_create_need`,
      {
        method: "POST",
        headers: {
          apikey: fixture.env.anonKey,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_actor_id: users.trainer.userId,
          p_payload: payload,
        }),
      },
    );
    const error = await response.json();
    expect(error.code).toBe("42501");
    expect(error.message).toBe("TNA_FORBIDDEN");
    expect(sql("SELECT 1;")).toBe("1");
    expect(sql("SELECT count(*) FROM tna_needs;")).toBe(before);
  }
  const actorRejected = await linkRpc(previous.id, {}, denied[0]!.userId);
  expect(actorRejected.error?.message).toBe("TNA_ACTOR_FORBIDDEN");
});

test("due filter uses WIB today, includes evaluating and combines status correctly", async () => {
  const due = await active();
  const future = await active(tomorrow);
  const draftPlan = await draft();
  const inEvaluation = await evaluating();
  const list = await call<{
    items: Array<TnaPlan & { evaluation_due: boolean }>;
  }>("/plans?due=1");
  expect(list.status).toBe(200);
  expect(list.data.items.map((p) => p.id)).toEqual(
    expect.arrayContaining([due.id, inEvaluation.id]),
  );
  expect(list.data.items.map((p) => p.id)).not.toEqual(
    expect.arrayContaining([future.id]),
  );
  expect(list.data.items.some((p) => p.id === draftPlan.id)).toBe(false);
  expect(list.data.items.find((p) => p.id === due.id)?.evaluation_due).toBe(
    true,
  );
  expect(
    list.data.items.find((p) => p.id === inEvaluation.id)?.evaluation_due,
  ).toBe(true);
  const activeOnly = await call<{ items: TnaPlan[] }>(
    "/plans?status=aktif&due=1",
  );
  expect(activeOnly.data.items.some((p) => p.id === due.id)).toBe(true);
  expect(
    activeOnly.data.items.some(
      (p) => p.id === inEvaluation.id || p.id === future.id,
    ),
  ).toBe(false);
  const all = await call<{
    items: Array<TnaPlan & { evaluation_due: boolean }>;
  }>("/plans");
  expect(all.data.items.find((p) => p.id === future.id)?.evaluation_due).toBe(
    false,
  );
  expect(
    all.data.items.find((p) => p.id === draftPlan.id)?.evaluation_due,
  ).toBe(false);
  expect((await call("/plans?due=garbage")).status).toBe(400);
});

test("start-evaluation rejects early, invalid month, missing period, stale and wrong status", async () => {
  const future = await active(tomorrow);
  const early = await call(
    `/plans/${future.id}/start-evaluation`,
    "POST",
    periodInput(future),
  );
  expect(early.status).toBe(422);
  expect(early.error?.code).toBe("TNA_EVALUATION_NOT_DUE");
  const plan = await active();
  for (const id of [baselinePeriod, fixture.ids.periods[0]!, randomUUID()]) {
    const invalid = await call(
      `/plans/${plan.id}/start-evaluation`,
      "POST",
      periodInput(plan, id),
    );
    expect(invalid.status).toBe(422);
    expect(invalid.error?.code).toBe("TNA_EVALUATION_PERIOD_INVALID");
    expect((await detail(plan.id)).plan).toEqual(plan);
  }
  const stale = await call(`/plans/${plan.id}/start-evaluation`, "POST", {
    ...periodInput(plan),
    expected_updated_at: "2000-01-01T00:00:00Z",
  });
  expect(stale.status).toBe(409);
  expect(stale.error?.code).toBe("TNA_PLAN_STALE");
  const draftPlan = await draft();
  const conflict = await call(
    `/plans/${draftPlan.id}/start-evaluation`,
    "POST",
    periodInput(draftPlan),
  );
  expect(conflict.status).toBe(409);
  expect(conflict.error?.code).toBe("TNA_PLAN_NOT_ACTIVE");
});

test("live evaluation changes period, completes server snapshot once and freezes detail", async () => {
  const client = hc<AppType>("http://localhost/api", {
    headers: {
      Authorization: `Bearer ${users.admin.token}`,
      "Content-Type": "application/json",
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
      tnaApiRequest(app, new Request(input, init), {}),
  });
  const plan = await active(today, users.admin.token);
  const started = await client.v1.tna.plans[":id"]["start-evaluation"].$post(
    { param: { id: plan.id } },
    {
      init: {
        body: JSON.stringify(
          periodInput(plan) satisfies TnaEvaluationPeriodInput,
        ),
      },
    },
  );
  expect(started.status).toBe(200);
  const before = await detail(plan.id);
  expect(before.plan.status).toBe("evaluasi");
  expect(before.plan.evaluation_snapshot).toBeNull();
  const expectedNarrative = `Evaluasi Maret ${year}: tingkat ketidaksesuaian parameter ${fixture.names.alpha} (Chat) tetap di 9,1 per 100 sesi sampel (target ≤ 1,0), dengan sebaran 60,0% → 60,0% (target ≤ 10,0%). Target tidak tercapai. Kelompok pembanding terlalu kecil untuk dibandingkan. Perbandingan ini indikatif, bukan bukti sebab-akibat.`;
  expect(before.evaluation_narrative).toBe(`Pratinjau: ${expectedNarrative}`);
  const empty = await call(
    `/plans/${plan.id}/evaluation`,
    "PATCH",
    periodInput(before.plan, emptyPeriod),
  );
  expect(empty.status).toBe(200);
  const noAudit = await call(
    `/plans/${plan.id}/complete`,
    "POST",
    completeInput(empty.data),
  );
  expect(noAudit.status).toBe(422);
  expect(noAudit.error?.code).toBe("TNA_EVALUATION_NO_AUDIT");
  expect((await detail(plan.id)).plan.status).toBe("evaluasi");
  const switched = await call(
    `/plans/${plan.id}/evaluation`,
    "PATCH",
    periodInput(empty.data),
  );
  expect(switched.status).toBe(200);
  const stale = await call(
    `/plans/${plan.id}/evaluation`,
    "PATCH",
    periodInput(empty.data),
  );
  expect(stale.status).toBe(409);
  expect(stale.error?.code).toBe("TNA_PLAN_STALE");
  const completed = await call(
    `/plans/${plan.id}/complete`,
    "POST",
    completeInput(switched.data),
  );
  expect(completed.status).toBe(200);
  expect(completed.data).toMatchObject({
    status: "selesai",
    verdict: "tidak_tercapai",
    follow_up: "selesai_tuntas",
    conclusion_note: conclusion,
  });
  expect(completed.data.evaluation_snapshot?.population.findings).toBe(3);
  expect(completed.data.baseline_snapshot).toEqual(plan.baseline_snapshot);
  const frozen = await detail(plan.id);
  expect(frozen.evaluation_narrative).toBe(expectedNarrative);
  console.info(
    "T4_NARRATIVE",
    JSON.stringify({
      case: test.info().title,
      actual: frozen.evaluation_narrative,
    }),
  );
  expect(frozen.evaluation).toEqual(completed.data.evaluation_snapshot);
  expect(frozen.participant_evaluation?.every((p) => p.audited_in_eval)).toBe(
    true,
  );
  // Change actual QA then restore it; completed GET must not recompute anything.
  sql(
    `UPDATE qa_temuan SET ketidaksesuaian='Tidak melakukan probing',nilai=1 WHERE period_id='${evaluationPeriod}' AND indicator_id='${fixture.ids.metricsIndicators.alpha}' AND peserta_id='${fixture.ids.participants[3]}' AND no_tiket LIKE '%alpha-%' AND NOT is_phantom_padding;`,
  );
  try {
    expect(
      Number(
        sql(
          `SELECT count(*) FROM qa_temuan WHERE period_id='${evaluationPeriod}' AND indicator_id='${fixture.ids.metricsIndicators.alpha}' AND peserta_id='${fixture.ids.participants[3]}' AND nilai=1 AND NOT is_phantom_padding;`,
        ),
      ),
    ).toBe(2);
    const afterQaChange = await detail(plan.id);
    expect(afterQaChange.evaluation_narrative).toBe(expectedNarrative);
    expect(afterQaChange).toEqual(frozen);
  } finally {
    sql(
      `UPDATE qa_temuan SET ketidaksesuaian=CASE WHEN no_tiket LIKE '%-ws' THEN '   ' ELSE NULL END,nilai=3 WHERE period_id='${evaluationPeriod}' AND indicator_id='${fixture.ids.metricsIndicators.alpha}' AND peserta_id='${fixture.ids.participants[3]}' AND no_tiket LIKE '%alpha-%' AND NOT is_phantom_padding;`,
    );
  }
  for (const [path, method, input] of [
    ["complete", "POST", completeInput(completed.data)],
    ["evaluation", "PATCH", periodInput(completed.data)],
    [
      "cancel",
      "POST",
      { expected_updated_at: completed.data.updated_at, cancel_reason: reason },
    ],
  ] as const) {
    const final = await call(`/plans/${plan.id}/${path}`, method, input);
    expect(final.status).toBe(409);
    expect(final.error?.code).toBe(
      path === "cancel"
        ? "TNA_PLAN_TRANSITION_CONFLICT"
        : "TNA_PLAN_NOT_EVALUATING",
    );
  }
  for (const verb of [
    "Memulai evaluasi",
    "Mengubah periode evaluasi",
    "Menyelesaikan",
  ])
    expect(
      Number(
        sql(
          `SELECT count(*) FROM activity_logs WHERE module='tna' AND type='update' AND action LIKE '${verb}%${plan.id}%';`,
        ),
      ),
    ).toBe(verb === "Mengubah periode evaluasi" ? 2 : 1);
});

test("transition bodies reject client numbers and unauthorized roles before mutation", async () => {
  const plan = await active();
  const operations = [
    ["start-evaluation", "POST", periodInput(plan)],
    ["evaluation", "PATCH", periodInput(plan)],
    ["complete", "POST", completeInput(plan)],
    [
      "cancel",
      "POST",
      { expected_updated_at: plan.updated_at, cancel_reason: reason },
    ],
  ] as const;
  for (const [path, method, body] of operations) {
    expect(
      (await call(`/plans/${plan.id}/${path}`, method, body, null)).status,
    ).toBe(401);
    for (const user of denied)
      expect(
        (await call(`/plans/${plan.id}/${path}`, method, body, user.token))
          .status,
      ).toBe(403);
    for (const forged of [
      { verdict: "tercapai" },
      { evaluation_snapshot: {} },
      { findings: 999 },
    ])
      expect(
        (
          await call(`/plans/${plan.id}/${path}`, method, {
            ...body,
            ...forged,
          })
        ).status,
      ).toBe(400);
    expect((await call(`/plans/not-uuid/${path}`, method, body)).status).toBe(
      400,
    );
    expect(
      (await call(`/plans/${randomUUID()}/${path}`, method, body)).status,
    ).toBe(404);
  }
  expect(
    (
      await call(`/plans/${plan.id}/complete`, "POST", {
        ...completeInput(plan),
        conclusion_note: "short",
      })
    ).status,
  ).toBe(400);
  expect((await detail(plan.id)).plan).toEqual(plan);
  const invalidPeriodEdit = await call(
    `/plans/${plan.id}/evaluation`,
    "PATCH",
    periodInput(plan),
  );
  expect(invalidPeriodEdit.status).toBe(409);
  expect(invalidPeriodEdit.error?.code).toBe("TNA_PLAN_NOT_EVALUATING");
});

test("cancel requires valid reason for active/evaluating, preserves snapshots and logs once", async () => {
  for (const plan of [await active(), await evaluating()]) {
    const baseline = plan.baseline_snapshot;
    const missing = await call(`/plans/${plan.id}/cancel`, "POST", {
      expected_updated_at: plan.updated_at,
    });
    expect(missing.status).toBe(422);
    expect(missing.error?.code).toBe("TNA_CANCEL_REASON_REQUIRED");
    for (const invalid of ["short", " ", "x".repeat(1001)])
      expect(
        (
          await call(`/plans/${plan.id}/cancel`, "POST", {
            expected_updated_at: plan.updated_at,
            cancel_reason: invalid,
          })
        ).status,
      ).toBe(400);
    const stale = await call(`/plans/${plan.id}/cancel`, "POST", {
      expected_updated_at: "2000-01-01T00:00:00Z",
      cancel_reason: reason,
    });
    expect(stale.status).toBe(409);
    expect(stale.error?.code).toBe("TNA_PLAN_STALE");
    const cancelled = await call(`/plans/${plan.id}/cancel`, "POST", {
      expected_updated_at: plan.updated_at,
      cancel_reason: `  ${reason}  `,
    });
    expect(cancelled.status).toBe(200);
    expect(cancelled.data).toMatchObject({
      status: "dibatalkan",
      cancel_reason: reason,
      baseline_snapshot: baseline,
      evaluation_period_id: plan.evaluation_period_id,
    });
    expect(
      Number(
        sql(
          `SELECT count(*) FROM activity_logs WHERE module='tna' AND action='Membatalkan rencana TNA: ${plan.id}';`,
        ),
      ),
    ).toBe(1);
  }
  const draftPlan = await draft();
  const cancelled = await call(`/plans/${draftPlan.id}/cancel`, "POST", {
    expected_updated_at: draftPlan.updated_at,
  });
  expect(cancelled.status).toBe(200);
  expect(cancelled.data).toMatchObject({
    status: "dibatalkan",
    cancel_reason: null,
  });
});

test("previous_plan_id HTTP validates K15 and keeps original need's unique plan invariant", async () => {
  const plan = await evaluating();
  const finished = await call(
    `/plans/${plan.id}/complete`,
    "POST",
    completeInput(plan, "perlu_rencana_lanjutan"),
  );
  expect(finished.status).toBe(200);
  const created = await call<TnaNeed>(
    "/needs",
    "POST",
    needBody({ period_id: evaluationPeriod, previous_plan_id: plan.id }),
  );
  expect(created.status).toBe(201);
  expect(created.data.previous_plan_id).toBe(plan.id);
  const loaded = await call<{ need: TnaNeed }>(`/needs/${created.data.id}`);
  expect(loaded.data.need.previous_plan_id).toBe(plan.id);
  const before = sql(
    `SELECT count(*) FROM tna_needs WHERE previous_plan_id='${plan.id}';`,
  );
  for (const overrides of [
    { previous_plan_id: randomUUID() },
    { indicator_id: fixture.ids.metricsIndicators.beta },
  ]) {
    const invalid = await call<TnaNeed>(
      "/needs",
      "POST",
      needBody({
        period_id: evaluationPeriod,
        previous_plan_id: plan.id,
        ...overrides,
      }),
    );
    expect(invalid.status).toBe(422);
    expect(invalid.error?.code).toBe("TNA_PREVIOUS_PLAN_INVALID");
    expect(invalid.error?.message).not.toBe("TNA_PREVIOUS_PLAN_INVALID");
    expect(
      sql(
        `SELECT count(*) FROM tna_needs WHERE previous_plan_id='${plan.id}';`,
      ),
    ).toBe(before);
  }
  const original = await call("/plans", "POST", {
    need_id: plan.need_id,
    program_id: programId,
    title: "Rencana kedua harus ditolak",
    intervention_type: "kelas",
    start_date: `${year}-02-01`,
    end_date: `${year}-02-02`,
    evaluation_due_date: today,
    target_max_rate_per_100: 1,
    target_max_spread_pct: 10,
    participant_peserta_ids: fixture.ids.participants.slice(0, 2),
  });
  expect(original.status).toBe(409);
  expect(original.error?.code).toBe("TNA_PLAN_EXISTS");
});

test("completion and period editing enforce revision and one concurrent winner", async () => {
  const plan = await evaluating();
  const original = await detail(plan.id);
  const invalidPeriod = await call(
    `/plans/${plan.id}/evaluation`,
    "PATCH",
    periodInput(plan, baselinePeriod),
  );
  expect(invalidPeriod.status).toBe(422);
  expect(invalidPeriod.error?.code).toBe("TNA_EVALUATION_PERIOD_INVALID");
  const stale = await call(`/plans/${plan.id}/complete`, "POST", {
    ...completeInput(plan),
    expected_updated_at: "2000-01-01T00:00:00Z",
  });
  expect(stale.status).toBe(409);
  expect(stale.error?.code).toBe("TNA_PLAN_STALE");
  const after = await detail(plan.id);
  expect(after.plan).toEqual(original.plan);
  expect(after.participants).toEqual(original.participants);
  // Concurrent requests, not concurrent test runners: verify DB row locking.
  const outcomes = await Promise.all([
    call(`/plans/${plan.id}/complete`, "POST", completeInput(plan)),
    call(`/plans/${plan.id}/complete`, "POST", completeInput(plan)),
  ]);
  expect(outcomes.map((o) => o.status).sort()).toEqual([200, 409]);
  expect(outcomes.find((o) => o.status === 409)?.error?.code).toBe(
    "TNA_PLAN_NOT_EVALUATING",
  );
  const winner = outcomes.find((o) => o.status === 200)!;
  expect((await detail(plan.id)).plan).toEqual(winner.data);
  expect(
    Number(
      sql(
        `SELECT count(*) FROM activity_logs WHERE module='tna' AND action='Menyelesaikan rencana TNA: ${plan.id}';`,
      ),
    ),
  ).toBe(1);
});

test("K15 rollback preserves links and restores exact old writer before forward reapply", async () => {
  const previous = await predecessor();
  const linked = await linkRpc(previous.id);
  expect(linked.error).toBeNull();
  const metadata = () =>
    sql(
      "SELECT oid::text || ':' || proowner::text || ':' || coalesce(proacl::text,'<default>') FROM pg_proc WHERE oid='public.tna_create_need(uuid,jsonb)'::regprocedure;",
    );
  const before = metadata();
  const rollback = readFileSync(
    new URL(
      "../../../supabase/rollbacks/rollback_20261012150000_tna_need_previous_plan.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const forward = readFileSync(
    new URL(
      "../../../supabase/migrations/20261012150000_tna_need_previous_plan.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const phase1 = readFileSync(
    new URL(
      "../../../supabase/migrations/20261008120000_tna_phase1.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const oldBody = phase1
    .match(
      /CREATE FUNCTION public\.tna_create_need[\s\S]*?AS \$\$([\s\S]*?)\$\$;/,
    )?.[1]
    ?.trim();
  expect(oldBody).toBeTruthy();
  try {
    sql(rollback);
    expect(metadata()).toBe(before);
    expect(
      sql(
        "SELECT prosrc FROM pg_proc WHERE oid='public.tna_create_need(uuid,jsonb)'::regprocedure;",
      ),
    ).toBe(oldBody);
    expect(
      sql(
        `SELECT previous_plan_id FROM tna_needs WHERE id='${linked.data.id}';`,
      ),
    ).toBe(previous.id);
    const legacy = await linkRpc(previous.id);
    expect(legacy.error).toBeNull();
    expect(legacy.data.previous_plan_id).toBeNull();
  } finally {
    sql(forward);
  }
  expect(metadata()).toBe(before);
  const restored = await linkRpc(previous.id);
  expect(restored.error).toBeNull();
  expect(restored.data.previous_plan_id).toBe(previous.id);
});
