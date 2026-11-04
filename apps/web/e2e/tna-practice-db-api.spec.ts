import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  createUserWithJwt,
  sqlOne,
} from "./helpers/sidakRealBackend";

// TNA phase 3 T1 (plans/markdown/tna-phase-3.md D15, P-1, P-2): practice
// targets per plan and a frozen per-participant practice snapshot. Real local
// Supabase only. Catalog presence is checked first so a missing table is a
// safe RED that never calls anything new.
test.describe.configure({ mode: "serial" });

const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const env = fixture.env;
const admin = createAdmin(env);
const users: Record<string, Awaited<ReturnType<typeof createUserWithJwt>>> = {};
const createdNeeds: string[] = [];
const createdPlans: string[] = [];

function client(role: string) {
  return createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${users[role]!.token}` } },
  });
}

// A backend crash restarts every auxiliary process, so the checkpointer start
// time changes exactly when the database went through recovery (K6 bug).
function checkpointerStart(): string {
  return sqlOne(
    env,
    "SELECT backend_start FROM pg_stat_activity WHERE backend_type = 'checkpointer';",
  );
}

test.beforeAll(async () => {
  Object.assign(users, await fixture.seed());
  for (const role of ["leader", "agent"] as const)
    users[role] = await createUserWithJwt(env, role, namespace);
});

test.afterAll(async () => {
  if (createdPlans.length) {
    const deleted = await admin
      .from("tna_plans")
      .delete()
      .in("id", createdPlans);
    expect(deleted.error, "cleanup rencana fixture gagal").toBeNull();
  }
  if (createdNeeds.length) {
    const deleted = await admin
      .from("tna_needs")
      .delete()
      .in("id", createdNeeds);
    expect(deleted.error, "cleanup kebutuhan fixture gagal").toBeNull();
  }
  await fixture.cleanup();
  for (const role of ["leader", "agent"]) {
    const result = await admin.auth.admin.deleteUser(users[role]!.userId);
    if (result.error) throw new Error("TNA test user cleanup failed");
  }
});

type Target = { module: string; min_sessions: number };

async function makePlan(targets: Target[] | undefined) {
  const need = await admin.rpc("tna_create_need", {
    p_actor_id: users.trainer!.userId,
    p_payload: {
      service_type: "chat",
      period_id: fixture.ids.periods[2],
      indicator_id: fixture.ids.indicators[0],
      compare_count: 2,
      validation_snapshot: { metric_version: 1, findings: 4 },
      validated_cluster_id: "kurang_menggali",
      cause_note: "Catatan TNA latihan sintetis",
      gap_type: "skill",
      outcome: "training",
    },
  });
  expect(need.error).toBeNull();
  createdNeeds.push(need.data.id);
  const program = await admin
    .from("tna_programs")
    .select("id")
    .eq("code", "effective-probing")
    .single();
  expect(program.error).toBeNull();
  const today = sqlOne(
    env,
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  // Same calendar trick as tna-evaluation-db-api.spec.ts: the training ends
  // before the fixture year so fixture periods are valid evaluation months.
  const endDate = sqlOne(
    env,
    `SELECT make_date(year - 1, 12, 31)::text FROM qa_periods WHERE id='${fixture.ids.periods[0]}';`,
  );
  const plan = await admin.rpc("tna_create_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan: {
      need_id: need.data.id,
      program_id: program.data!.id,
      title: "Rencana latihan sintetis",
      intervention_type: "kelas",
      start_date: endDate,
      end_date: endDate,
      evaluation_due_date: today,
      target_max_rate_per_100: 100,
      target_max_spread_pct: 90,
      ...(targets === undefined ? {} : { practice_targets: targets }),
    },
    p_participants: [
      { peserta_id: fixture.ids.participants[0] },
      { peserta_id: fixture.ids.participants[1] },
    ],
  });
  if (plan.data?.id) createdPlans.push(plan.data.id);
  return plan;
}

function targetsOf(planId: string) {
  return admin
    .from("tna_plan_practice_targets")
    .select("module,min_sessions")
    .eq("plan_id", planId)
    .order("module");
}

async function activate(plan: { id: string; updated_at: string }) {
  const rows = await admin
    .from("tna_plan_participants")
    .select("peserta_id")
    .eq("plan_id", plan.id);
  expect(rows.error).toBeNull();
  const result = await admin.rpc("tna_activate_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: plan.updated_at,
    p_baseline: {
      auditStatus: "audited",
      findings: 4,
      auditedAgents: 2,
      ratePer100: 200,
      spreadPct: 100,
    },
    p_participant_baselines: rows.data!.map((row) => ({
      peserta_id: row.peserta_id,
      baseline_findings: 2,
      was_affected: true,
    })),
  });
  expect(result.error).toBeNull();
  return result.data as { id: string; updated_at: string };
}

async function startEvaluation(plan: { id: string; updated_at: string }) {
  const result = await admin.rpc("tna_start_plan_evaluation", {
    p_actor_id: users.trainer!.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: plan.updated_at,
    p_evaluation_period_id: fixture.ids.periods[1],
  });
  expect(result.error).toBeNull();
  return result.data as { id: string; updated_at: string };
}

function evaluationSnapshot(periodId: string) {
  const cohort = {
    baseline: {
      agents: 2,
      findings: 4,
      sampledSessions: 10,
      ratePer100: 40,
      spreadPct: 100,
    },
    evaluation: {
      agents: 2,
      findings: 2,
      sampledSessions: 10,
      ratePer100: 20,
      spreadPct: 50,
    },
    delta: -20,
  };
  return {
    metric_version: 1,
    computed_at: new Date().toISOString(),
    evaluation_period_id: periodId,
    population: {
      periodId,
      auditedAgents: 5,
      sampledSessions: 10,
      findings: 2,
      affectedAgents: 2,
      ratePer100: 20,
      spreadPct: 40,
      auditStatus: "audited",
      insufficientData: false,
    },
    baseline_recompute_drift: { findings: 0, auditedAgents: 0 },
    cohorts: {
      participants: cohort,
      comparison: cohort,
      comparison_small: true,
      net_effect: null,
    },
    verdict: "tercapai",
  };
}

async function participantIds(planId: string): Promise<string[]> {
  const rows = await admin
    .from("tna_plan_participants")
    .select("id")
    .eq("plan_id", planId)
    .order("id");
  expect(rows.error).toBeNull();
  return rows.data!.map((r) => r.id);
}

function complete(
  plan: { id: string; updated_at: string },
  evaluations: Record<string, unknown>[],
) {
  return admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: plan.updated_at,
    p_evaluation_snapshot: evaluationSnapshot(fixture.ids.periods[1]),
    p_participant_evaluations: evaluations,
    p_verdict: "tercapai",
    p_conclusion_note: "Kesimpulan evaluasi latihan",
    p_follow_up: "selesai_tuntas",
  });
}

function baseEvaluation(id: string) {
  return {
    participant_id: id,
    audited_in_eval: true,
    eval_findings: 1,
    eval_sessions: 5,
  };
}

test("phase 3 practice table and snapshot column are installed with legacy signatures intact", async () => {
  expect(
    sqlOne(
      env,
      "SELECT to_regclass('public.tna_plan_practice_targets') IS NOT NULL;",
    ),
    "tna_plan_practice_targets missing",
  ).toBe("t");
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM information_schema.columns
        WHERE table_schema='public' AND table_name='tna_plan_participants' AND column_name='practice_snapshot';`,
    ),
    "tna_plan_participants.practice_snapshot missing",
  ).toBe("1");
  expect(
    sqlOne(
      env,
      "SELECT relrowsecurity FROM pg_class WHERE oid='public.tna_plan_practice_targets'::regclass;",
    ),
  ).toBe("t");
  const missing = sqlOne(
    env,
    `SELECT count(*) FROM unnest(ARRAY[
      'tna_create_plan(uuid,jsonb,jsonb)',
      'tna_update_draft_plan(uuid,uuid,timestamptz,jsonb,jsonb)',
      'tna_complete_plan(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text)'
    ]) AS sig WHERE to_regprocedure('public.' || sig) IS NULL;`,
  );
  expect(Number(missing), "legacy TNA signatures changed").toBe(0);
});

test("service role stores, validates, and replaces draft practice targets", async () => {
  for (const [label, targets] of [
    ["unknown module", [{ module: "sidak", min_sessions: 3 }]],
    [
      "duplicate module",
      [
        { module: "ketik", min_sessions: 3 },
        { module: "ketik", min_sessions: 4 },
      ],
    ],
    ["zero sessions", [{ module: "ketik", min_sessions: 0 }]],
    ["too many sessions", [{ module: "ketik", min_sessions: 21 }]],
    ["not an array", { module: "ketik", min_sessions: 3 }],
    ["extra key", [{ module: "ketik", min_sessions: 3, note: "x" }]],
  ] as const) {
    const bad = await makePlan(targets as unknown as Target[]);
    expect(bad.error?.message, label).toContain("TNA_INVALID_PRACTICE_TARGETS");
  }

  const plan = await makePlan([
    { module: "telefun", min_sessions: 2 },
    { module: "ketik", min_sessions: 3 },
  ]);
  expect(plan.error).toBeNull();
  expect((await targetsOf(plan.data.id)).data).toEqual([
    { module: "ketik", min_sessions: 3 },
    { module: "telefun", min_sessions: 2 },
  ]);

  // Absent key leaves targets untouched.
  const renamed = await admin.rpc("tna_update_draft_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan_id: plan.data.id,
    p_expected_updated_at: plan.data.updated_at,
    p_plan: { title: "Rencana latihan diganti" },
    p_participants: null,
  });
  expect(renamed.error).toBeNull();
  expect((await targetsOf(plan.data.id)).data).toHaveLength(2);

  // An array replaces the whole set; an invalid array leaves it untouched.
  const invalid = await admin.rpc("tna_update_draft_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan_id: plan.data.id,
    p_expected_updated_at: renamed.data.updated_at,
    p_plan: { practice_targets: [{ module: "pdkt", min_sessions: 99 }] },
    p_participants: null,
  });
  expect(invalid.error?.message).toContain("TNA_INVALID_PRACTICE_TARGETS");
  expect((await targetsOf(plan.data.id)).data).toHaveLength(2);
  const replaced = await admin.rpc("tna_update_draft_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan_id: plan.data.id,
    p_expected_updated_at: renamed.data.updated_at,
    p_plan: { practice_targets: [{ module: "pdkt", min_sessions: 5 }] },
    p_participants: null,
  });
  expect(replaced.error).toBeNull();
  expect(replaced.data.updated_at).not.toBe(renamed.data.updated_at);
  expect((await targetsOf(plan.data.id)).data).toEqual([
    { module: "pdkt", min_sessions: 5 },
  ]);
  const cleared = await admin.rpc("tna_update_draft_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan_id: plan.data.id,
    p_expected_updated_at: replaced.data.updated_at,
    p_plan: { practice_targets: [] },
    p_participants: null,
  });
  expect(cleared.error).toBeNull();
  expect((await targetsOf(plan.data.id)).data).toEqual([]);
});

test("client roles can read but never write practice targets or call writers", async () => {
  const before = checkpointerStart();
  const plan = await makePlan([{ module: "ketik", min_sessions: 3 }]);
  expect(plan.error).toBeNull();
  for (const role of ["admin", "trainer", "leader", "agent"]) {
    const db = client(role);
    const read = await db
      .from("tna_plan_practice_targets")
      .select("module")
      .eq("plan_id", plan.data.id);
    expect(read.error, role).toBeNull();
    expect(read.data, role).toEqual(
      role === "admin" || role === "trainer" ? [{ module: "ketik" }] : [],
    );
    for (const mutation of [
      () =>
        db.from("tna_plan_practice_targets").insert({
          plan_id: plan.data.id,
          module: "pdkt",
          min_sessions: 3,
        }),
      () =>
        db
          .from("tna_plan_practice_targets")
          .update({ min_sessions: 9 })
          .eq("plan_id", plan.data.id),
      () =>
        db
          .from("tna_plan_practice_targets")
          .delete()
          .eq("plan_id", plan.data.id),
    ]) {
      const result = await mutation();
      expect(result.error?.code, `${role} direct DML`).toBe("42501");
    }
    const rpc = await db.rpc("tna_update_draft_plan", {
      p_actor_id: users.trainer!.userId,
      p_plan_id: plan.data.id,
      p_expected_updated_at: plan.data.updated_at,
      p_plan: { practice_targets: [] },
      p_participants: null,
    });
    expect(rpc.error?.message, `${role} RPC`).toBe("TNA_FORBIDDEN");
  }
  expect((await targetsOf(plan.data.id)).data).toEqual([
    { module: "ketik", min_sessions: 3 },
  ]);
  expect(checkpointerStart(), "database restarted during client calls").toBe(
    before,
  );
  expect(sqlOne(env, "SELECT 1;")).toBe("1");
});

test("activation locks practice targets for every role including service role", async () => {
  const plan = await makePlan([{ module: "ketik", min_sessions: 3 }]);
  expect(plan.error).toBeNull();
  const active = await activate(plan.data);
  for (const [label, mutation] of [
    [
      "insert",
      () =>
        admin.from("tna_plan_practice_targets").insert({
          plan_id: plan.data.id,
          module: "pdkt",
          min_sessions: 3,
        }),
    ],
    [
      "update",
      () =>
        admin
          .from("tna_plan_practice_targets")
          .update({ min_sessions: 9 })
          .eq("plan_id", plan.data.id),
    ],
    [
      "delete",
      () =>
        admin
          .from("tna_plan_practice_targets")
          .delete()
          .eq("plan_id", plan.data.id),
    ],
  ] as const) {
    const result = await mutation();
    expect(result.error?.message, label).toContain(
      "TNA_PRACTICE_TARGETS_IMMUTABLE",
    );
  }
  expect((await targetsOf(plan.data.id)).data).toEqual([
    { module: "ketik", min_sessions: 3 },
  ]);
  // Only the draft writer may touch targets; it rejects non-draft plans.
  const update = await admin.rpc("tna_update_draft_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan_id: plan.data.id,
    p_expected_updated_at: active.updated_at,
    p_plan: { practice_targets: [] },
    p_participants: null,
  });
  expect(update.error?.message).toContain("TNA_PLAN_NOT_DRAFT");
});

test("completion requires a consistent practice snapshot when targets exist and freezes it", async () => {
  const plan = await makePlan([
    { module: "ketik", min_sessions: 3 },
    { module: "telefun", min_sessions: 2 },
  ]);
  expect(plan.error).toBeNull();
  const evaluating = await startEvaluation(await activate(plan.data));
  const [first, second] = await participantIds(plan.data.id);

  const good = {
    ketik: { sessions: 3, avg_score: 82.5, status: "memenuhi" },
    telefun: { sessions: 1, avg_score: 7.4, status: "berjalan" },
  };
  const none = {
    ketik: { sessions: 0, avg_score: null, status: "belum_mulai" },
    telefun: { sessions: 0, avg_score: null, status: "belum_mulai" },
  };
  for (const [label, practice] of [
    ["missing practice key", undefined],
    ["missing module", { ketik: good.ketik }],
    [
      "module without target",
      { ...good, pdkt: { sessions: 1, avg_score: 50, status: "berjalan" } },
    ],
    [
      "status does not match sessions",
      { ...good, ketik: { sessions: 1, avg_score: 60, status: "memenuhi" } },
    ],
    [
      "score without sessions",
      { ...good, ketik: { sessions: 0, avg_score: 60, status: "belum_mulai" } },
    ],
    [
      "telefun score above scale",
      { ...good, telefun: { sessions: 1, avg_score: 70, status: "berjalan" } },
    ],
    [
      "negative sessions",
      {
        ...good,
        ketik: { sessions: -1, avg_score: null, status: "belum_mulai" },
      },
    ],
    ["extra entry key", { ...good, ketik: { ...good.ketik, note: "x" } }],
  ] as const) {
    const evaluations = [
      practice === undefined
        ? baseEvaluation(first!)
        : { ...baseEvaluation(first!), practice },
      { ...baseEvaluation(second!), practice: none },
    ];
    const result = await complete(evaluating, evaluations);
    expect(result.error?.message, label).toContain(
      "TNA_PRACTICE_SNAPSHOT_INVALID",
    );
  }

  // Outside the completion marker, nobody can write the snapshot.
  const direct = await admin
    .from("tna_plan_participants")
    .update({ practice_snapshot: good })
    .eq("id", first!);
  expect(direct.error?.message).toContain("TNA_PARTICIPANTS_IMMUTABLE");

  const done = await complete(evaluating, [
    { ...baseEvaluation(first!), practice: good },
    { ...baseEvaluation(second!), practice: none },
  ]);
  expect(done.error).toBeNull();
  expect(done.data.status).toBe("selesai");
  const stored = await admin
    .from("tna_plan_participants")
    .select("id,practice_snapshot")
    .eq("plan_id", plan.data.id)
    .order("id");
  expect(stored.data).toEqual([
    { id: first, practice_snapshot: good },
    { id: second, practice_snapshot: none },
  ]);
  const rewrite = await admin
    .from("tna_plan_participants")
    .update({ practice_snapshot: none })
    .eq("id", first!);
  expect(rewrite.error?.message).toMatch(
    /TNA_PRACTICE_SNAPSHOT_IMMUTABLE|TNA_PARTICIPANTS_IMMUTABLE/,
  );
});

test("plans without targets keep the phase 2 completion payload and reject practice data", async () => {
  const plan = await makePlan(undefined);
  expect(plan.error).toBeNull();
  expect((await targetsOf(plan.data.id)).data).toEqual([]);
  const evaluating = await startEvaluation(await activate(plan.data));
  const ids = await participantIds(plan.data.id);
  const withPractice = await complete(
    evaluating,
    ids.map((id) => ({
      ...baseEvaluation(id),
      practice: { ketik: { sessions: 1, avg_score: 50, status: "berjalan" } },
    })),
  );
  expect(withPractice.error?.message).toContain(
    "TNA_PRACTICE_SNAPSHOT_INVALID",
  );
  const legacy = await complete(evaluating, ids.map(baseEvaluation));
  expect(legacy.error).toBeNull();
  const stored = await admin
    .from("tna_plan_participants")
    .select("practice_snapshot")
    .eq("plan_id", plan.data.id);
  expect(stored.data).toEqual(ids.map(() => ({ practice_snapshot: null })));
});
