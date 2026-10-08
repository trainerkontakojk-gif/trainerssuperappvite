import { tnaApiRequest } from "./helpers/tnaApi";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { hc } from "hono/client";
import type { AppType } from "../../api/src/app";
import type { TnaNeed, TnaPlan, TnaPlanDetail } from "@trainers/types";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  createUserWithJwt,
  runSql,
} from "./helpers/sidakRealBackend";

test.describe.configure({ mode: "serial" });
const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const admin = createAdmin(fixture.env);
let users: Awaited<ReturnType<typeof fixture.seed>>;
let app: Hono;
let programId: string;
const inactiveId = randomUUID();
const denied: Awaited<ReturnType<typeof createUserWithJwt>>[] = [];
const period = fixture.ids.periods[2]!;
const indicator = fixture.ids.metricsIndicators.alpha;
const participant = (i: number) => fixture.ids.participants[i]!;
type PlanDetail = TnaPlanDetail & {
  participant_preview: Array<{
    peserta_id: string | null;
    baseline_findings: number;
    was_affected: boolean;
  }> | null;
};
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
  const envelope = (await response.json()) as {
    success: boolean;
    data: T;
    error?: { code: string; message: string };
  };
  return { status: response.status, ...envelope };
}
async function need(
  outcome = "training",
  periodId = period,
  indicatorId = indicator,
) {
  const result = await call<TnaNeed>("/needs", "POST", {
    service_type: "chat",
    period_id: periodId,
    indicator_id: indicatorId,
    compare_count: 2,
    validated_cluster_id: "kurang_menggali",
    cause_note: "Trainer memvalidasi tiket untuk rencana pelatihan.",
    gap_type: "skill",
    outcome,
    validation_snapshot: { findings: 99999, auditedAgents: 99999 },
  });
  expect(result.status).toBe(201);
  expect(result.data.validation_snapshot.findings).not.toBe(99999);
  return result.data;
}
function planBody(needId: string, ids = [participant(0), participant(1)]) {
  return {
    need_id: needId,
    program_id: programId,
    title: "Pelatihan probing terarah",
    intervention_type: "kelas",
    start_date: "2099-06-01",
    end_date: "2099-06-02",
    evaluation_due_date: "2099-07-02",
    target_max_rate_per_100: 1,
    target_max_spread_pct: 10,
    participant_peserta_ids: ids,
  };
}
async function draft(
  ids = [participant(0), participant(1)],
  periodId = period,
) {
  const createdNeed = await need("training", periodId);
  const created = await call("/plans", "POST", planBody(createdNeed.id, ids));
  expect(created.status).toBe(201);
  expect(created.data).toMatchObject({
    status: "draft",
    baseline_snapshot: null,
    activated_at: null,
  });
  return { need: createdNeed, plan: created.data };
}
async function detail(id: string) {
  const result = await call<PlanDetail>(`/plans/${id}`);
  expect(result.status).toBe(200);
  return result.data;
}
function counts(needId: string) {
  return (
    sql(`SELECT count(*) FROM tna_plans WHERE need_id='${needId}';`) +
    ":" +
    sql(
      `SELECT count(*) FROM tna_plan_participants WHERE plan_id IN (SELECT id FROM tna_plans WHERE need_id='${needId}');`,
    )
  );
}
function sql(query: string) {
  try {
    return runSql(fixture.env, query);
  } catch {
    throw new Error("TNA SQL probe failed; raw command suppressed");
  }
}
// Catch only inside a nested statement block. If the statement succeeds, the
// assertion outside the block fails; no false positive from catching our own error.
function rejectsSql(statement: string, code: string, markerPlan: string) {
  sql(
    `BEGIN; SELECT set_config('tna.activating_plan','${markerPlan}',true); DO $probe$ DECLARE rejected boolean := false; BEGIN BEGIN ${statement}; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '${code}' THEN RAISE EXCEPTION 'UNEXPECTED_TRIGGER_REJECTION'; END IF; rejected := true; END; IF NOT rejected THEN RAISE EXCEPTION 'TRIGGER_DID_NOT_REJECT'; END IF; END $probe$; ROLLBACK;`,
  );
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
  users = await fixture.seed();
  for (const role of ["leader", "agent"] as const)
    denied.push(await createUserWithJwt(fixture.env, role, namespace));
  sql(
    `INSERT INTO tna_programs(id,code,name,description,gap_type,is_active) VALUES ('${inactiveId}','tna-inactive-${namespace}','Program nonaktif fixture','Fixture lokal','skill',false);`,
  );
  programId = sql(
    "SELECT id FROM tna_programs WHERE code='effective-probing';",
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});
test.afterAll(async () => {
  // Delete parents first: existing FK cascade is the trigger-approved cleanup.
  sql(
    `DELETE FROM tna_plans WHERE need_id IN (SELECT id FROM tna_needs WHERE period_id IN ('${fixture.ids.periods.join("','")}','${fixture.ids.extraPeriods[0]}')); DELETE FROM tna_needs WHERE period_id IN ('${fixture.ids.periods.join("','")}','${fixture.ids.extraPeriods[0]}'); DELETE FROM tna_programs WHERE id='${inactiveId}';`,
  );
  for (const user of denied)
    expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
  await fixture.cleanup();
});

test("draft create/list/detail uses server need, previews population and roster, and logs creation", async () => {
  const created = await draft();
  const client = hc<AppType>("http://localhost/api", {
    headers: { Authorization: `Bearer ${users.trainer.token}` },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) =>
      tnaApiRequest(app, new Request(input, init), {}),
  });
  const typedList = await client.v1.tna.plans.$get();
  expect(typedList.status).toBe(200);
  const typedBody = await typedList.json();
  expect(typedBody.success).toBe(true);
  expect(
    "data" in typedBody &&
      typedBody.data.items.some((row) => row.id === created.plan.id),
  ).toBe(true);
  expect(created.need.validation_snapshot).toMatchObject({
    findings: 3,
    auditedAgents: 5,
  });
  const loaded = await detail(created.plan.id);
  expect(loaded.preview).toMatchObject({
    findings: 3,
    sampledSessions: 33,
    validation_drift: { findings: 0, auditedAgents: 0 },
  });
  expect(loaded.participant_preview).toEqual(
    expect.arrayContaining([
      { peserta_id: participant(0), baseline_findings: 1, was_affected: true },
      { peserta_id: participant(1), baseline_findings: 1, was_affected: true },
    ]),
  );
  expect(
    loaded.participants.every((row) => row.baseline_findings === null),
  ).toBe(true);
  expect(loaded.narrative).toContain("Pratinjau:");
  expect(loaded.narrative).toContain("9,1 per 100 sesi sampel");
  expect(loaded.narrative).toContain("stabil");
  expect(loaded.narrative).toContain(created.need.cause_note);
  expect(
    (await call<{ items: TnaPlan[] }>("/plans?status=draft")).data.items.map(
      (row) => row.id,
    ),
  ).toContain(created.plan.id);
  expect(
    (await call<{ items: TnaPlan[] }>("/plans?status=aktif")).data.items,
  ).toEqual([]);
  const linked = await call<{ plans: TnaPlan[] }>(`/needs/${created.need.id}`);
  expect(linked.data.plans.map((row) => row.id)).toContain(created.plan.id);
  expect(
    Number(
      sql(
        `SELECT count(*) FROM activity_logs WHERE module='tna' AND type='add' AND action LIKE '%${created.plan.id}%';`,
      ),
    ),
  ).toBe(1);
});

test("create rejects escalation/inactive catalog/bad rosters and leaves no partial rows", async () => {
  const escalation = await need("eskalasi_non_training");
  const rejected = await call("/plans", "POST", planBody(escalation.id));
  expect(rejected.status).toBe(422);
  expect(rejected.error?.code).toBe("TNA_NEED_NOT_TRAINING");
  const training = await need();
  const inactive = await call("/plans", "POST", {
    ...planBody(training.id),
    program_id: inactiveId,
  });
  expect(inactive.status).toBe(422);
  expect(inactive.error?.code).toBe("TNA_PROGRAM_INACTIVE");
  for (const ids of [
    [],
    [participant(0), participant(0)],
    Array.from({ length: 201 }, () => randomUUID()),
    [participant(0), randomUUID(), participant(1)],
    [participant(5)],
  ]) {
    expect(
      (await call("/plans", "POST", planBody(training.id, ids))).status,
    ).toBe(422);
    expect(counts(training.id)).toBe("0:0");
  }
  // Real RPC proves atomic rollback after the parent INSERT, independently of
  // backend prevalidation. It still runs through the unchanged service guard.
  const { participant_peserta_ids: _ids, ...rpcPlan } = planBody(training.id);
  const rpc = await admin.rpc("tna_create_plan", {
    p_actor_id: users.trainer.userId,
    p_plan: rpcPlan,
    p_participants: [participant(0), randomUUID(), participant(1)].map(
      (peserta_id) => ({ peserta_id }),
    ),
  });
  expect(rpc.error?.message).toBe("TNA_INVALID_PARTICIPANTS");
  expect(counts(training.id)).toBe("0:0");
  const created = await call("/plans", "POST", planBody(training.id));
  expect(created.status).toBe(201);
  const duplicate = await call("/plans", "POST", planBody(training.id));
  expect(duplicate.status).toBe(409);
  expect(duplicate.error?.code).toBe("TNA_PLAN_EXISTS");
  expect(counts(training.id)).toBe("1:2");
});

test("draft PATCH replaces roster, updates live preview, rejects stale revision and rolls back invalid edits", async () => {
  const { plan } = await draft();
  const updated = await call(`/plans/${plan.id}`, "PATCH", {
    expected_updated_at: plan.updated_at,
    participant_peserta_ids: [participant(2), participant(3)],
    title: "Pelatihan setelah edit",
  });
  expect(updated.status).toBe(200);
  expect(updated.data.updated_at).not.toBe(plan.updated_at);
  const loaded = await detail(plan.id);
  expect(loaded.participants.map((row) => row.peserta_id).sort()).toEqual(
    [participant(2), participant(3)].sort(),
  );
  expect(loaded.participant_preview).toEqual(
    expect.arrayContaining([
      { peserta_id: participant(2), baseline_findings: 1, was_affected: true },
      { peserta_id: participant(3), baseline_findings: 0, was_affected: false },
    ]),
  );
  const stale = await call(`/plans/${plan.id}`, "PATCH", {
    expected_updated_at: plan.updated_at,
    title: "Edit dengan versi basi",
  });
  expect(stale.status).toBe(409);
  expect(stale.error?.code).toBe("TNA_PLAN_STALE");
  const invalid = await call(`/plans/${plan.id}`, "PATCH", {
    expected_updated_at: updated.data.updated_at,
    title: "Edit harus rollback",
    participant_peserta_ids: [participant(0), randomUUID(), participant(1)],
  });
  expect(invalid.status).toBe(422);
  const badDate = await call(`/plans/${plan.id}`, "PATCH", {
    expected_updated_at: updated.data.updated_at,
    end_date: "2099-05-01",
  });
  expect(badDate.status).toBe(422);
  expect((await detail(plan.id)).plan).toEqual(updated.data);
  const rpc = await admin.rpc("tna_update_draft_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: updated.data.updated_at,
    p_plan: { title: "RPC harus rollback" },
    p_participants: [participant(0), randomUUID(), participant(1)].map(
      (peserta_id) => ({ peserta_id }),
    ),
  });
  expect(rpc.error?.message).toBe("TNA_INVALID_PARTICIPANTS");
  expect((await detail(plan.id)).plan).toEqual(updated.data);
});

let frozenPlan: TnaPlan;
let frozenDetail: PlanDetail;
test("activation recomputes baseline for final roster, then freezes population and participant values", async () => {
  const { plan } = await draft([
    participant(0),
    participant(3),
    participant(4),
  ]);
  sql(
    `UPDATE qa_temuan SET nilai=3,ketidaksesuaian=NULL,sebaiknya=NULL WHERE period_id='${period}' AND indicator_id='${indicator}' AND peserta_id='${participant(0)}';`,
  );
  const live = await detail(plan.id);
  expect(live.preview).toMatchObject({
    findings: 2,
    affectedAgents: 2,
    validation_drift: { findings: -1, auditedAgents: 0 },
  });
  const forged = await call(`/plans/${plan.id}/activate`, "POST", {
    expected_updated_at: plan.updated_at,
    baseline_snapshot: { findings: 99999 },
  });
  expect([400, 422]).toContain(forged.status);
  expect((await detail(plan.id)).plan.status).toBe("draft");
  const activated = await call(`/plans/${plan.id}/activate`, "POST", {
    expected_updated_at: plan.updated_at,
  });
  expect(activated.status).toBe(200);
  frozenPlan = activated.data;
  expect(frozenPlan).toMatchObject({
    status: "aktif",
    baseline_snapshot: {
      findings: 2,
      auditedAgents: 5,
      validation_drift: { findings: -1, auditedAgents: 0 },
    },
  });
  expect(frozenPlan.activated_at).toBeTruthy();
  frozenDetail = await detail(plan.id);
  expect(frozenDetail.preview).toBeNull();
  expect(frozenDetail.participant_preview).toBeNull();
  expect(
    frozenDetail.participants.every(
      (row) => row.baseline_findings === 0 && row.was_affected === false,
    ),
  ).toBe(true);
  expect(frozenDetail.narrative).not.toContain("Pratinjau:");
  expect(frozenDetail.narrative).toContain("6,1 per 100 sesi sampel");
  expect(frozenDetail.narrative).toContain("turun");
  sql(
    `UPDATE qa_temuan SET nilai=1,ketidaksesuaian='Tidak melakukan probing' WHERE period_id='${period}' AND indicator_id='${indicator}' AND peserta_id='${participant(0)}' AND is_phantom_padding=false;`,
  );
  const afterQa = await detail(plan.id);
  expect(afterQa.plan.baseline_snapshot).toEqual(frozenPlan.baseline_snapshot);
  expect(afterQa.participants).toEqual(frozenDetail.participants);
  expect(afterQa.narrative).toBe(frozenDetail.narrative);
  expect(
    Number(
      sql(
        `SELECT count(*) FROM activity_logs WHERE module='tna' AND type='update' AND action LIKE '%${plan.id}%' AND action LIKE 'Mengaktifkan%';`,
      ),
    ),
  ).toBe(1);
});

test("active plans reject API edits, direct admin writes and all activation marker abuse", async () => {
  const edit = await call(`/plans/${frozenPlan.id}`, "PATCH", {
    expected_updated_at: frozenPlan.updated_at,
    participant_peserta_ids: [participant(1)],
  });
  expect(edit.status).toBe(409);
  expect(edit.error?.code).toBe("TNA_PLAN_NOT_DRAFT");
  const row = frozenDetail.participants[0]!;
  const direct = await admin
    .from("tna_plan_participants")
    .update({ baseline_findings: 77 })
    .eq("id", row.id);
  expect(direct.error?.message).toBe("TNA_PARTICIPANTS_IMMUTABLE");
  const directRoster = await admin
    .from("tna_plan_participants")
    .update({ peserta_id: participant(2) })
    .eq("id", row.id);
  expect(directRoster.error?.message).toBe("TNA_PARTICIPANTS_IMMUTABLE");

  const baseline = await admin
    .from("tna_plans")
    .update({
      baseline_snapshot: { ...frozenPlan.baseline_snapshot, findings: 99999 },
    })
    .eq("id", frozenPlan.id);
  expect(baseline.error?.message).toBe("TNA_BASELINE_IMMUTABLE");
  rejectsSql(
    `UPDATE tna_plan_participants SET baseline_findings=77,was_affected=true WHERE id='${row.id}'`,
    "TNA_PARTICIPANTS_IMMUTABLE",
    frozenPlan.id,
  );
  rejectsSql(
    `INSERT INTO tna_plan_participants(plan_id,peserta_id,peserta_name_snapshot) VALUES ('${frozenPlan.id}','${participant(1)}','Fixture abuse')`,
    "TNA_PARTICIPANTS_IMMUTABLE",
    frozenPlan.id,
  );
  rejectsSql(
    `DELETE FROM tna_plan_participants WHERE id='${row.id}'`,
    "TNA_PARTICIPANTS_IMMUTABLE",
    frozenPlan.id,
  );
  const otherPlan = await draft([participant(1)]);
  rejectsSql(
    `UPDATE tna_plan_participants SET baseline_findings=77,was_affected=true WHERE id='${row.id}'`,
    "TNA_PARTICIPANTS_IMMUTABLE",
    otherPlan.plan.id,
  );
  expect((await detail(frozenPlan.id)).plan).toEqual(frozenPlan);
  expect((await detail(frozenPlan.id)).participants).toEqual(
    frozenDetail.participants,
  );
});

test("SQL RPC clears activation marker within the same transaction with explicit service claims", async () => {
  const { plan } = await draft([participant(1)]);
  const live = await detail(plan.id);
  const baseline = JSON.stringify(live.preview).replaceAll("'", "''");
  const roster = JSON.stringify(live.participant_preview).replaceAll("'", "''");
  const result = sql(
    `BEGIN; DO $probe$ BEGIN PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true); PERFORM public.tna_activate_plan('${users.trainer.userId}','${plan.id}','${plan.updated_at}','${baseline}'::jsonb,'${roster}'::jsonb); IF current_setting('tna.activating_plan',true) IS DISTINCT FROM '' THEN RAISE EXCEPTION 'MARKER_NOT_CLEARED'; END IF; END $probe$; SELECT coalesce(current_setting('tna.activating_plan',true),'<null>'); ROLLBACK;`,
  );
  expect(result).toBe("");
  expect((await detail(plan.id)).plan.status).toBe("draft");
});

test("target validation, cancellation and simultaneous activate/cancel preserve consistent final state", async () => {
  const created = await draft();
  const worse = await call(`/plans/${created.plan.id}`, "PATCH", {
    expected_updated_at: created.plan.updated_at,
    target_max_rate_per_100: 100,
    target_max_spread_pct: 100,
  });
  expect(worse.status).toBe(200);
  const rejected = await call(`/plans/${created.plan.id}/activate`, "POST", {
    expected_updated_at: worse.data.updated_at,
  });
  expect(rejected.status).toBe(422);
  expect(rejected.error?.code).toBe("TNA_TARGET_NOT_BETTER");
  const cancelled = await call(`/plans/${created.plan.id}/cancel`, "POST", {
    expected_updated_at: worse.data.updated_at,
  });
  expect(cancelled.status).toBe(200);
  expect(cancelled.data).toMatchObject({
    status: "dibatalkan",
    baseline_snapshot: null,
  });
  expect(
    (
      await call(`/plans/${created.plan.id}/cancel`, "POST", {
        expected_updated_at: cancelled.data.updated_at,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(`/plans/${created.plan.id}/activate`, "POST", {
        expected_updated_at: cancelled.data.updated_at,
      })
    ).status,
  ).toBe(409);
  // The partial unique index permits replacement after cancellation.
  expect((await call("/plans", "POST", planBody(created.need.id))).status).toBe(
    201,
  );
  const activeCancelled = await call(`/plans/${frozenPlan.id}/cancel`, "POST", {
    expected_updated_at: frozenPlan.updated_at,
  });
  expect(activeCancelled.status).toBe(200);
  expect(activeCancelled.data.baseline_snapshot).toEqual(
    frozenPlan.baseline_snapshot,
  );
  const concurrent = await draft([participant(1)]);
  const outcomes = await Promise.all([
    call(`/plans/${concurrent.plan.id}/activate`, "POST", {
      expected_updated_at: concurrent.plan.updated_at,
    }),
    call(`/plans/${concurrent.plan.id}/cancel`, "POST", {
      expected_updated_at: concurrent.plan.updated_at,
    }),
  ]);
  expect(outcomes.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(outcomes.find((result) => result.status === 409)?.error?.code).toBe(
    "TNA_PLAN_TRANSITION_CONFLICT",
  );
  const winner = outcomes.find((result) => result.status === 200)!;
  const final = await detail(concurrent.plan.id);
  expect(final.plan).toEqual(winner.data);
  if (final.plan.status === "aktif") {
    expect(final.plan.baseline_snapshot).toBeTruthy();
    expect(final.participants[0]).toMatchObject({
      baseline_findings: 1,
      was_affected: true,
    });
  } else {
    expect(final.plan.status).toBe("dibatalkan");
    expect(final.plan.baseline_snapshot).toBeNull();
    expect(final.participants[0]?.baseline_findings).toBeNull();
  }
});

test("plan endpoints admit admin/trainer, reject other roles and validate identities/body", async () => {
  for (const user of [users.admin, users.trainer]) {
    const createdNeed = await need();
    const created = await call(
      "/plans",
      "POST",
      planBody(createdNeed.id),
      user.token,
    );
    expect(created.status).toBe(201);
    const plan = created.data;
    const operations: Array<[string, string, unknown?]> = [
      ["/plans", "GET"],
      [`/plans/${plan.id}`, "GET"],
      [
        `/plans/${plan.id}`,
        "PATCH",
        { expected_updated_at: plan.updated_at, title: "Draft dari role sah" },
      ],
      [
        `/plans/${plan.id}/activate`,
        "POST",
        { expected_updated_at: plan.updated_at },
      ],
      [
        `/plans/${plan.id}/cancel`,
        "POST",
        { expected_updated_at: plan.updated_at },
      ],
      ["/plans", "POST", planBody(createdNeed.id)],
    ];
    for (const [path, method, body] of operations) {
      expect((await call(path, method, body, null)).status).toBe(401);
      for (const actor of denied)
        expect((await call(path, method, body, actor.token)).status).toBe(403);
    }
    expect((await call("/plans", "GET", undefined, user.token)).status).toBe(
      200,
    );
    expect(
      (await call(`/plans/${plan.id}`, "GET", undefined, user.token)).status,
    ).toBe(200);
    const updated = await call(
      `/plans/${plan.id}`,
      "PATCH",
      { expected_updated_at: plan.updated_at, title: "Draft dari role sah" },
      user.token,
    );
    expect(updated.status).toBe(200);
    const activated = await call(
      `/plans/${plan.id}/activate`,
      "POST",
      { expected_updated_at: updated.data.updated_at },
      user.token,
    );
    expect(activated.status).toBe(200);
    expect(
      (
        await call(
          `/plans/${plan.id}/cancel`,
          "POST",
          { expected_updated_at: activated.data.updated_at },
          user.token,
        )
      ).status,
    ).toBe(200);
  }
  expect((await call("/plans?status=invalid")).status).toBe(400);
  expect((await call("/plans/not-uuid")).status).toBe(400);
  expect((await call(`/plans/${randomUUID()}`)).status).toBe(404);
  expect((await call("/plans", "POST", {})).status).toBe(400);
  expect((await call("/plans", "POST", planBody(randomUUID()))).status).toBe(
    404,
  );

  const { plan } = await draft();
  expect(
    (
      await call(`/plans/${plan.id}`, "PATCH", {
        expected_updated_at: plan.updated_at,
        baseline_snapshot: {},
      })
    ).status,
  ).toBe(400);
  expect((await call(`/plans/${plan.id}/activate`, "POST", {})).status).toBe(
    400,
  );
});

test("D9 renders no comparison, rising computed trend and new-from-zero through real plan detail", async () => {
  const earliest = await draft([participant(1)], fixture.ids.periods[0]!);
  const earliestDetail = await detail(earliest.plan.id);
  expect(earliestDetail.preview?.trendStatus).toBe("no_comparison_data");
  expect(earliestDetail.narrative).toContain("(Chat)");
  expect(earliestDetail.narrative).not.toContain("(chat)");
  expect(earliestDetail.narrative).toContain(
    "belum memiliki periode pembanding",
  );
  const rising = await draft([participant(1)]);
  sql(
    `UPDATE qa_temuan SET nilai=1,ketidaksesuaian='Tidak melakukan probing' WHERE period_id='${period}' AND indicator_id='${indicator}' AND peserta_id='${participant(3)}' AND is_phantom_padding=false;`,
  );
  const risingDetail = await detail(rising.plan.id);
  expect(risingDetail.preview).toMatchObject({
    trendStatus: "computed",
    findings: 5,
  });
  expect(risingDetail.narrative).toContain("naik 66,7%");
  sql(
    `UPDATE qa_temuan SET nilai=3,ketidaksesuaian=NULL,sebaiknya=NULL WHERE indicator_id='${indicator}' AND period_id IN ('${fixture.ids.periods[0]}','${fixture.ids.periods[1]}');`,
  );
  const fromZero = await detail(rising.plan.id);
  expect(fromZero.preview?.trendStatus).toBe("new_from_zero");
  expect(fromZero.narrative).toContain(
    "baru muncul karena periode pembanding tidak punya temuan",
  );
});

test("activation records population drift and accepts one improved target while freezing affected final roster", async () => {
  const { plan } = await draft([participant(1), participant(3)]);
  const edited = await call(`/plans/${plan.id}`, "PATCH", {
    expected_updated_at: plan.updated_at,
    target_max_rate_per_100: 100,
    target_max_spread_pct: 10,
  });
  expect(edited.status).toBe(200);
  sql(
    `DELETE FROM qa_temuan WHERE period_id='${period}' AND peserta_id='${participant(4)}';`,
  );
  const live = await detail(plan.id);
  expect(live.preview).toMatchObject({
    auditedAgents: 4,
    validation_drift: { auditedAgents: -1 },
    insufficientData: true,
  });
  expect(live.narrative).toContain("data periode ini belum cukup");
  const activated = await call(`/plans/${plan.id}/activate`, "POST", {
    expected_updated_at: edited.data.updated_at,
  });
  expect(activated.status).toBe(200);
  expect(activated.data.baseline_snapshot).toMatchObject({
    auditedAgents: 4,
    validation_drift: { auditedAgents: -1 },
  });
  const frozen = await detail(plan.id);
  expect(frozen.participants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        peserta_id: participant(1),
        baseline_findings: 1,
        was_affected: true,
      }),
      expect.objectContaining({
        peserta_id: participant(3),
        baseline_findings: 2,
        was_affected: true,
      }),
    ]),
  );
});

test("zero-to-zero draft preview explains no findings and activation returns the baseline-specific 422", async () => {
  const { plan } = await draft();
  // Keep audit-presence clean rows while removing every real finding of alpha
  // across selected+comparisons; other parameters still establish audit.
  sql(
    `UPDATE qa_temuan SET nilai=3,ketidaksesuaian=NULL,sebaiknya=NULL WHERE indicator_id='${indicator}' AND period_id IN ('${fixture.ids.periods.join("','")}');`,
  );
  const loaded = await detail(plan.id);
  expect(loaded.preview).toMatchObject({
    trendStatus: "no_findings_both",
    findings: 0,
    auditStatus: "audited",
    ratePer100: 0,
    spreadPct: 0,
  });
  expect(loaded.narrative).toContain(
    "tidak memiliki temuan, baik pada periode ini maupun periode pembanding",
  );
  const activated = await call(`/plans/${plan.id}/activate`, "POST", {
    expected_updated_at: plan.updated_at,
  });
  expect(activated.status).toBe(422);
  expect(activated.error?.code).toBe("TNA_BASELINE_NO_FINDINGS");
  expect((await detail(plan.id)).plan.baseline_snapshot).toBeNull();
});

test("no-audit draft preview has nullable rates and no zero-rate narrative; activation returns NO_AUDIT", async () => {
  const createdNeed = await need(
    "training",
    period,
    fixture.ids.metricsIndicators.critical,
  );
  const created = await call("/plans", "POST", planBody(createdNeed.id));
  expect(created.status).toBe(201);
  sql(
    `DELETE FROM qa_temuan WHERE period_id='${period}' AND peserta_id IN ('${fixture.ids.participants.join("','")}');`,
  );
  const loaded = await detail(created.data.id);
  expect(loaded.preview).toMatchObject({
    auditStatus: "no_audit",
    findings: 0,
    ratePer100: null,
    spreadPct: null,
  });
  expect(loaded.narrative).toContain("Belum ada audit");
  expect(loaded.narrative).toContain("(Chat)");
  expect(loaded.narrative).toContain(
    "tingkat dan sebaran belum dapat dihitung",
  );
  expect(loaded.narrative).not.toContain("0,0 per 100");
  expect(loaded.narrative).not.toContain("0% agent");
  const activated = await call(`/plans/${created.data.id}/activate`, "POST", {
    expected_updated_at: created.data.updated_at,
  });
  expect(activated.status).toBe(422);
  expect(activated.error?.code).toBe("TNA_BASELINE_NO_AUDIT");
  expect((await detail(created.data.id)).plan.baseline_snapshot).toBeNull();
});
