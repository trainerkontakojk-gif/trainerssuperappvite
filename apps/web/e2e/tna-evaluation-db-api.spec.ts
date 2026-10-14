import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

// The evaluation RPCs are new public contracts. Before any client-role call,
// verify their catalog presence; absence is a safe RED and never invokes them.
test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const fixture = createTnaFixture(randomUUID());
const admin = createAdmin(env);
const createdNeeds: string[] = [];
const createdPlans: string[] = [];
let users: Awaited<ReturnType<typeof fixture.seed>>;
const signatures = [
  "tna_start_plan_evaluation(uuid,uuid,timestamptz,uuid)",
  "tna_update_evaluation_period(uuid,uuid,timestamptz,uuid)",
  "tna_complete_plan(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text)",
  "tna_cancel_plan(uuid,uuid,timestamptz,text)",
];

test.beforeAll(async () => {
  users = await fixture.seed();
});

test.afterAll(async () => {
  // Used only for the paired rollback's destructive-data refusal check; the
  // caller immediately performs an approved local reset to clean this fixture.
  if (process.env.TNA_PRESERVE_ROLLBACK_FIXTURE === "1") return;
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
});

test("phase 2 evaluation columns and RPCs are installed without changing legacy signatures", async () => {
  const missing = sqlOne(
    env,
    `SELECT count(*) FROM unnest(ARRAY[${signatures.map((s) => `'${s}'`).join(",")}]) AS sig
      WHERE to_regprocedure('public.' || sig) IS NULL;`,
  );
  expect(Number(missing), "new evaluation/cancel RPC overloads missing").toBe(
    0,
  );

  const newCancelDefaults = sqlOne(
    env,
    `SELECT p.pronargdefaults FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.tna_cancel_plan(uuid,uuid,timestamptz,text)');`,
  );
  expect(
    newCancelDefaults,
    "the required fourth cancel argument must have no default",
  ).toBe("0");

  const columns = sqlOne(
    env,
    `SELECT count(*) FROM (VALUES
      ('tna_plans','evaluation_period_id'),('tna_plans','evaluation_started_at'),
      ('tna_plans','evaluation_snapshot'),('tna_plans','verdict'),('tna_plans','conclusion_note'),
      ('tna_plans','follow_up'),('tna_plans','completed_at'),('tna_plans','cancel_reason'),
      ('tna_plan_participants','baseline_sessions'),('tna_plan_participants','eval_findings'),
      ('tna_plan_participants','eval_sessions'),('tna_plan_participants','audited_in_eval'),
      ('tna_needs','previous_plan_id')
    ) AS expected(table_name,column_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name=expected.table_name AND c.column_name=expected.column_name);`,
  );
  expect(Number(columns), "phase 2 TNA columns missing").toBe(0);
  expect(
    sqlOne(
      env,
      `SELECT has_function_privilege('service_role','public.tna_complete_plan(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text)','EXECUTE');`,
    ),
  ).toBe("t");
});

async function makePlan(dueDate: string) {
  const need = await admin.rpc("tna_create_need", {
    p_actor_id: users.trainer.userId,
    p_payload: {
      service_type: "chat",
      period_id: fixture.ids.periods[2],
      indicator_id: fixture.ids.indicators[0],
      compare_count: 2,
      validation_snapshot: { metric_version: 1, findings: 4 },
      validated_cluster_id: "kurang_menggali",
      cause_note: "Catatan TNA evaluasi sintetis",
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
  // The fixture calendar sits before every seeded audit, so a training that
  // ended yesterday would make all fixture periods ineligible. End the
  // training the day before the fixture year so its periods stay valid
  // evaluation months, while the due date still exercises the WIB gate.
  const endDate = sqlOne(
    env,
    `SELECT make_date(year - 1, 12, 31)::text FROM qa_periods WHERE id='${fixture.ids.periods[0]}';`,
  );
  const plan = await admin.rpc("tna_create_plan", {
    p_actor_id: users.trainer.userId,
    p_plan: {
      need_id: need.data.id,
      program_id: program.data!.id,
      title: "Rencana evaluasi sintetis",
      intervention_type: "kelas",
      start_date: endDate,
      end_date: endDate,
      evaluation_due_date: dueDate,
      target_max_rate_per_100: 100,
      target_max_spread_pct: 90,
    },
    p_participants: [
      { peserta_id: fixture.ids.participants[0] },
      { peserta_id: fixture.ids.participants[1] },
    ],
  });
  expect(plan.error).toBeNull();
  createdPlans.push(plan.data.id);
  return { plan: plan.data, today, endDate };
}

async function activate(plan: { id: string; updated_at: string }) {
  const participantRows = await admin
    .from("tna_plan_participants")
    .select("id,peserta_id")
    .eq("plan_id", plan.id);
  expect(participantRows.error).toBeNull();
  const participantBaselines = participantRows.data!.map((row, i) => ({
    peserta_id: row.peserta_id,
    baseline_findings: i === 1 ? 0 : 2,
    was_affected: i !== 1,
    ...(i === 0
      ? { baseline_sessions: null }
      : i === 1
        ? { baseline_sessions: 0 }
        : {}),
  }));
  const result = await admin.rpc("tna_activate_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: plan.updated_at,
    p_baseline: {
      auditStatus: "audited",
      findings: 4,
      auditedAgents: 2,
      ratePer100: 200,
      spreadPct: 100,
    },
    p_participant_baselines: participantBaselines,
  });
  expect(result.error).toBeNull();
  return result.data;
}

function evaluationSnapshot(
  periodId: string,
  overrides: Record<string, unknown> = {},
) {
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
    // D10: delta is the signed change in findings per 100 sampled sessions.
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
    ...overrides,
  };
}

test("service-role lifecycle freezes validated evaluation and handles nullable baselines atomically", async () => {
  const today = sqlOne(
    env,
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  const { plan } = await makePlan(today);
  const participantInsert = await admin
    .from("tna_plan_participants")
    .insert({
      plan_id: plan.id,
      peserta_id: null,
      peserta_name_snapshot: "Peserta FK-null",
      team_snapshot: null,
    })
    .select("id")
    .single();
  expect(participantInsert.error).toBeNull();
  const activated = await activate(plan);
  const start = await admin.rpc("tna_start_plan_evaluation", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: activated.updated_at,
    p_evaluation_period_id: fixture.ids.periods[2],
  });
  expect(start.error).toBeNull();
  expect(start.data.status).toBe("evaluasi");
  const stale = await admin.rpc("tna_update_evaluation_period", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: activated.updated_at,
    p_evaluation_period_id: fixture.ids.periods[1],
  });
  expect(stale.error?.message).toContain("TNA_PLAN_STALE");
  const replacement = await admin.rpc("tna_update_evaluation_period", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: start.data.updated_at,
    p_evaluation_period_id: fixture.ids.periods[1],
  });
  expect(replacement.error).toBeNull();
  expect(replacement.data.evaluation_started_at).toBe(
    start.data.evaluation_started_at,
  );
  const participantRows = await admin
    .from("tna_plan_participants")
    .select("id")
    .eq("plan_id", plan.id);
  const evaluations = participantRows.data!.map((row, index) => ({
    participant_id: row.id,
    audited_in_eval: index === 0,
    eval_findings: index === 0 ? 0 : null,
    eval_sessions: index === 0 ? 0 : null,
  }));
  const malformed = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: replacement.data.updated_at,
    p_evaluation_snapshot: evaluationSnapshot(fixture.ids.periods[1], {
      unexpected: true,
    }),
    p_participant_evaluations: evaluations,
    p_verdict: "tercapai",
    p_conclusion_note: "Kesimpulan evaluasi valid",
    p_follow_up: "selesai_tuntas",
  });
  expect(malformed.error?.message).toContain("TNA_INVALID_EVALUATION");
  const wrongVerdict = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: replacement.data.updated_at,
    p_evaluation_snapshot: evaluationSnapshot(fixture.ids.periods[1]),
    p_participant_evaluations: evaluations,
    p_verdict: "tidak_tercapai",
    p_conclusion_note: "Kesimpulan evaluasi valid",
    p_follow_up: "selesai_tuntas",
  });
  expect(wrongVerdict.error?.message).toContain("TNA_INVALID_EVALUATION");
  const completed = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: replacement.data.updated_at,
    p_evaluation_snapshot: evaluationSnapshot(fixture.ids.periods[1]),
    p_participant_evaluations: evaluations,
    p_verdict: "tercapai",
    p_conclusion_note: "Kesimpulan evaluasi valid",
    p_follow_up: "selesai_tuntas",
  });
  expect(completed.error).toBeNull();
  expect(completed.data.status).toBe("selesai");
  const catalogFingerprint = () =>
    sqlOne(
      env,
      `SELECT md5(string_agg(definition, '|' ORDER BY definition)) FROM (
    SELECT table_name || column_name || data_type AS definition FROM information_schema.columns
      WHERE table_schema='public' AND table_name LIKE 'tna_%'
    UNION ALL SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='tna_internal' OR (n.nspname='public' AND p.proname LIKE 'tna_%')
    UNION ALL SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relnamespace='public'::regnamespace AND c.relname LIKE 'tna_%' AND NOT t.tgisinternal
  ) definitions;`,
    );
  const beforeRollback = catalogFingerprint();
  let rollbackRefused = false;
  try {
    runSql(
      env,
      readFileSync(
        new URL(
          "../../../supabase/rollbacks/rollback_20261011130000_tna_phase2_evaluation.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
  } catch (error) {
    // Do not print the helper's connection URL/credentials on an expected failure.
    rollbackRefused =
      error instanceof Error &&
      error.message.includes("TNA_PHASE2_ROLLBACK_DATA_PRESENT");
  }
  expect(
    rollbackRefused,
    "rollback harus menolak data evaluasi sebelum DDL",
  ).toBe(true);
  expect(catalogFingerprint()).toBe(beforeRollback);
  const afterRollback = await admin
    .from("tna_plans")
    .select("status,updated_at,evaluation_snapshot")
    .eq("id", plan.id)
    .single();
  expect(afterRollback.data).toEqual({
    status: "selesai",
    updated_at: completed.data.updated_at,
    evaluation_snapshot: completed.data.evaluation_snapshot,
  });
  const unchanged = await admin
    .from("tna_plan_participants")
    .select("baseline_sessions,eval_findings,eval_sessions,audited_in_eval")
    .eq("plan_id", plan.id)
    .order("peserta_id");
  expect(unchanged.error).toBeNull();
  expect(unchanged.data!.some((row) => row.baseline_sessions === null)).toBe(
    true,
  );
  expect(unchanged.data!.some((row) => row.baseline_sessions === 0)).toBe(true);
  const frozen = await admin
    .from("tna_plans")
    .update({ verdict: "tidak_tercapai" })
    .eq("id", plan.id);
  expect(frozen.error?.message).toContain("TNA_EVALUATION_IMMUTABLE");
  const frozenParticipant = await admin
    .from("tna_plan_participants")
    .update({ eval_findings: 1 })
    .eq("plan_id", plan.id);
  expect(frozenParticipant.error?.message).toContain(
    "TNA_EVALUATION_IMMUTABLE",
  );
  const illegalTransition = await admin
    .from("tna_plans")
    .update({ status: "evaluasi" })
    .eq("id", plan.id);
  expect(illegalTransition.error?.message).toContain(
    "TNA_PLAN_TRANSITION_CONFLICT",
  );
});

test("snapshot, period, and participant validation failures are stable and atomic", async () => {
  const today = sqlOne(
    env,
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  const { plan } = await makePlan(today);
  const activated = await activate(plan);
  const start = await admin.rpc("tna_start_plan_evaluation", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: activated.updated_at,
    p_evaluation_period_id: fixture.ids.periods[2],
  });
  expect(start.error).toBeNull();
  const invalidPeriod = await admin.rpc("tna_update_evaluation_period", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: start.data.updated_at,
    p_evaluation_period_id: "00000000-0000-4000-8000-000000000000",
  });
  expect(invalidPeriod.error?.message).toContain(
    "TNA_EVALUATION_PERIOD_INVALID",
  );
  const participants = await admin
    .from("tna_plan_participants")
    .select("id")
    .eq("plan_id", plan.id);
  const roster = participants.data!.map((row, index) => ({
    participant_id: row.id,
    audited_in_eval: index === 0,
    eval_findings: index === 0 ? 0 : null,
    eval_sessions: index === 0 ? 0 : null,
  }));
  const validSnapshot = evaluationSnapshot(fixture.ids.periods[2]);
  const invalidSnapshots: Record<string, unknown>[] = [
    { ...validSnapshot, computed_at: null },
    {
      ...validSnapshot,
      population: { ...validSnapshot.population, auditStatus: null },
    },
    {
      ...validSnapshot,
      cohorts: {
        ...validSnapshot.cohorts,
        participants: {
          ...validSnapshot.cohorts.participants,
          delta: { ratePer100: -20, spreadPct: -50 },
        },
      },
    },
  ];
  invalidSnapshots.push({
    ...validSnapshot,
    cohorts: {
      ...validSnapshot.cohorts,
      comparison: {
        ...validSnapshot.cohorts.comparison,
        baseline: { ...validSnapshot.cohorts.comparison.baseline, agents: 6 },
        evaluation: {
          ...validSnapshot.cohorts.comparison.evaluation,
          agents: 6,
        },
      },
      comparison_small: false,
      net_effect: 0,
    },
  });
  for (const snapshot of invalidSnapshots) {
    const rejected = await admin.rpc("tna_complete_plan", {
      p_actor_id: users.trainer.userId,
      p_plan_id: plan.id,
      p_expected_updated_at: start.data.updated_at,
      p_evaluation_snapshot: snapshot,
      p_participant_evaluations: roster,
      p_verdict: "tercapai",
      p_conclusion_note: "Kesimpulan evaluasi valid",
      p_follow_up: "selesai_tuntas",
    });
    expect(rejected.error?.message).toContain("TNA_INVALID_EVALUATION");
  }
  const noAuditSnapshot = evaluationSnapshot(fixture.ids.periods[2]);
  noAuditSnapshot.population.auditStatus = "no_audit";
  const noAudit = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: start.data.updated_at,
    p_evaluation_snapshot: noAuditSnapshot,
    p_participant_evaluations: roster,
    p_verdict: "tercapai",
    p_conclusion_note: "Kesimpulan evaluasi valid",
    p_follow_up: "selesai_tuntas",
  });
  expect(noAudit.error?.message).toContain("TNA_EVALUATION_NO_AUDIT");
  const fractionalSnapshot = evaluationSnapshot(fixture.ids.periods[2]);
  fractionalSnapshot.population.findings = 1.5;
  const fractional = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: start.data.updated_at,
    p_evaluation_snapshot: fractionalSnapshot,
    p_participant_evaluations: roster,
    p_verdict: "tercapai",
    p_conclusion_note: "Kesimpulan evaluasi valid",
    p_follow_up: "selesai_tuntas",
  });
  expect(fractional.error?.message).toContain("TNA_INVALID_EVALUATION");
  const wrongPeriod = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: start.data.updated_at,
    p_evaluation_snapshot: evaluationSnapshot(fixture.ids.periods[1]),
    p_participant_evaluations: roster,
    p_verdict: "tercapai",
    p_conclusion_note: "Kesimpulan evaluasi valid",
    p_follow_up: "selesai_tuntas",
  });
  expect(wrongPeriod.error?.message).toContain("TNA_INVALID_EVALUATION");
  const fractionalRoster = [...roster];
  fractionalRoster[0] = { ...fractionalRoster[0]!, eval_findings: 1.5 };
  const participantMismatch = await admin.rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: start.data.updated_at,
    p_evaluation_snapshot: evaluationSnapshot(fixture.ids.periods[2]),
    p_participant_evaluations: fractionalRoster,
    p_verdict: "tercapai",
    p_conclusion_note: "Kesimpulan evaluasi valid",
    p_follow_up: "selesai_tuntas",
  });
  expect(participantMismatch.error?.message).toContain(
    "TNA_EVALUATION_PARTICIPANT_MISMATCH",
  );
  const unchanged = await admin
    .from("tna_plans")
    .select("status,updated_at,evaluation_snapshot")
    .eq("id", plan.id)
    .single();
  expect(unchanged.data).toEqual({
    status: "evaluasi",
    updated_at: start.data.updated_at,
    evaluation_snapshot: null,
  });
  const participantsUnchanged = await admin
    .from("tna_plan_participants")
    .select("eval_findings,eval_sessions,audited_in_eval")
    .eq("plan_id", plan.id);
  expect(
    participantsUnchanged.data!.every(
      (row) =>
        row.eval_findings === null &&
        row.eval_sessions === null &&
        row.audited_in_eval === null,
    ),
  ).toBe(true);
  const cancelled = await admin.rpc("tna_cancel_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: start.data.updated_at,
    p_cancel_reason: "Dibatalkan setelah validasi sintetis",
  });
  expect(cancelled.error).toBeNull();
});

test("evaluation period changes require the RPC marker in a fresh transaction", async () => {
  const today = sqlOne(
    env,
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  const { plan } = await makePlan(today);
  const activated = await activate(plan);
  const error = sqlOne(
    env,
    `BEGIN;
    DO $$ BEGIN
      BEGIN
        UPDATE public.tna_plans SET status='evaluasi', evaluation_period_id='${fixture.ids.periods[2]}',
          evaluation_started_at=clock_timestamp() WHERE id='${plan.id}';
        RAISE EXCEPTION 'UNMARKED_UPDATE_ACCEPTED';
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('tna.test_error', SQLERRM, true);
      END;
    END $$;
    SELECT current_setting('tna.test_error'); ROLLBACK;`,
  );
  expect(error).toBe("TNA_PLAN_TRANSITION_CONFLICT");
  const unchanged = await admin
    .from("tna_plans")
    .select("status,updated_at,evaluation_period_id")
    .eq("id", plan.id)
    .single();
  expect(unchanged.data).toEqual({
    status: "aktif",
    updated_at: activated.updated_at,
    evaluation_period_id: null,
  });
});

test("activation rejects ambiguous FK-null baseline rosters without changing the draft", async () => {
  const today = sqlOne(
    env,
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  const { plan } = await makePlan(today);
  const added = await admin.from("tna_plan_participants").insert([
    {
      plan_id: plan.id,
      peserta_id: null,
      peserta_name_snapshot: "FK-null satu",
    },
    {
      plan_id: plan.id,
      peserta_id: null,
      peserta_name_snapshot: "FK-null dua",
    },
  ]);
  expect(added.error).toBeNull();
  const rows = await admin
    .from("tna_plan_participants")
    .select("peserta_id")
    .eq("plan_id", plan.id);
  expect(rows.error).toBeNull();
  const result = await admin.rpc("tna_activate_plan", {
    p_actor_id: users.trainer.userId,
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
  expect(result.error?.message).toContain("TNA_BASELINE_PARTICIPANT_MISMATCH");
  const unchanged = await admin
    .from("tna_plans")
    .select("status,updated_at,baseline_snapshot")
    .eq("id", plan.id)
    .single();
  expect(unchanged.data).toEqual({
    status: "draft",
    updated_at: plan.updated_at,
    baseline_snapshot: null,
  });
});

test("WIB due gate and cancellation overloads preserve legacy draft and require active reasons", async () => {
  const today = sqlOne(
    env,
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  const tomorrow = sqlOne(env, `SELECT ('${today}'::date + 1)::text;`);
  const { plan: futurePlan } = await makePlan(tomorrow);
  const activated = await activate(futurePlan);
  const early = await admin.rpc("tna_start_plan_evaluation", {
    p_actor_id: users.trainer.userId,
    p_plan_id: futurePlan.id,
    p_expected_updated_at: activated.updated_at,
    p_evaluation_period_id: fixture.ids.periods[2],
  });
  expect(early.error?.message).toContain("TNA_EVALUATION_NOT_DUE");
  const legacyCancel = await admin.rpc("tna_cancel_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: futurePlan.id,
    p_expected_updated_at: activated.updated_at,
  });
  expect(legacyCancel.error?.message).toContain("TNA_CANCEL_REASON_REQUIRED");
  const reasonless = await admin.rpc("tna_cancel_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: futurePlan.id,
    p_expected_updated_at: activated.updated_at,
    p_cancel_reason: null,
  });
  expect(reasonless.error?.message).toContain("TNA_CANCEL_REASON_REQUIRED");
  const shortReason = await admin.rpc("tna_cancel_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: futurePlan.id,
    p_expected_updated_at: activated.updated_at,
    p_cancel_reason: "singkat",
  });
  expect(shortReason.error?.message).toContain("TNA_INVALID_CANCEL_REASON");
  const cancelled = await admin.rpc("tna_cancel_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: futurePlan.id,
    p_expected_updated_at: activated.updated_at,
    p_cancel_reason: "Rencana dibatalkan karena perubahan jadwal",
  });
  expect(cancelled.error).toBeNull();
  expect(cancelled.data.status).toBe("dibatalkan");
  const baseline = await admin
    .from("tna_plan_participants")
    .select("baseline_findings,baseline_sessions")
    .eq("plan_id", futurePlan.id);
  expect(baseline.error).toBeNull();
  expect(baseline.data!.length).toBe(2);

  const { plan: draft } = await makePlan(today);
  const legacyDraftCancel = await admin.rpc("tna_cancel_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: draft.id,
    p_expected_updated_at: draft.updated_at,
  });
  expect(legacyDraftCancel.error).toBeNull();
  expect(legacyDraftCancel.data.status).toBe("dibatalkan");
});
