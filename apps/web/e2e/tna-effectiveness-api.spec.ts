import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import type { TnaEffectiveness } from "@trainers/types";
import { tnaApiRequest } from "./helpers/tnaApi";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  createUserWithJwt,
  runSql,
} from "./helpers/sidakRealBackend";

// TNA phase 6 T1 (plans/markdown/tna-phase-6.md D28-D29, K39, K42, P-1, P-2,
// P-4): the effectiveness aggregate and the due-count badge on the real local
// backend. Completed plans are driven through the guarded service-role RPCs
// with synthetic frozen snapshots, the same lifecycle the API uses.
test.describe.configure({ mode: "serial" });

const namespace = randomUUID();
const suffix = namespace.slice(0, 8);
const fixture = createTnaFixture(namespace);
const admin = createAdmin(fixture.env);
let users: Awaited<ReturnType<typeof fixture.seed>>;
let app: Hono;
const denied: Awaited<ReturnType<typeof createUserWithJwt>>[] = [];
const programs: Record<"a" | "b", { id: string; code: string }> = {} as never;
const plans: Record<string, string> = {};
let today = "";
let yesterday = "";

async function call<T>(
  path: string,
  token: string | null = users.trainer.token,
) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna${path}`,
    {
      method: "GET",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    },
  );
  const envelope = (await response.json()) as {
    success: boolean;
    data: T;
    error?: { code: string };
  };
  return { status: response.status, ...envelope };
}

function sql(query: string) {
  try {
    return runSql(fixture.env, query);
  } catch {
    throw new Error("TNA SQL probe failed; raw command suppressed");
  }
}

async function rpc(name: string, args: Record<string, unknown>) {
  const result = await admin.rpc(name, args);
  expect(result.error, `${name}: ${result.error?.message}`).toBeNull();
  return result.data;
}

async function createProgram(key: "a" | "b", name: string) {
  const program = await rpc("tna_create_program", {
    p_actor_id: users.trainer.userId,
    p_program: {
      code: `uji-efektif-${key}-${suffix}`,
      name,
      description: "Program sintetis untuk uji dashboard efektivitas.",
      gap_type: "skill",
      trigger_clusters: [],
      service_types: [],
      suggested_modules: [],
    },
  });
  programs[key] = { id: program.id, code: program.code };
}

// Training ends before the fixture year, so every fixture period is a valid
// evaluation month (same calendar rule as tna-evaluation-db-api.spec.ts).
function endDate() {
  return sql(
    `SELECT make_date(year - 1, 12, 31)::text FROM qa_periods WHERE id='${fixture.ids.periods[0]}';`,
  );
}

async function draftPlan(
  label: string,
  program: "a" | "b",
  gap: string,
  dueDate: string,
) {
  const need = await rpc("tna_create_need", {
    p_actor_id: users.trainer.userId,
    p_payload: {
      service_type: "chat",
      period_id: fixture.ids.periods[2],
      indicator_id: fixture.ids.indicators[0],
      compare_count: 2,
      validation_snapshot: { metric_version: 1, findings: 4 },
      validated_cluster_id: "kurang_menggali",
      cause_note: "Catatan TNA efektivitas sintetis",
      gap_type: gap,
      outcome: "training",
    },
  });
  const end = endDate();
  const plan = await rpc("tna_create_plan", {
    p_actor_id: users.trainer.userId,
    p_plan: {
      need_id: need.id,
      program_id: programs[program].id,
      title: `Rencana ${label} ${suffix}`,
      intervention_type: "kelas",
      start_date: end,
      end_date: end,
      evaluation_due_date: dueDate,
      target_max_rate_per_100: 100,
      target_max_spread_pct: 90,
    },
    p_participants: [{ peserta_id: fixture.ids.participants[0] }],
  });
  plans[label] = plan.id;
  return plan as { id: string; updated_at: string };
}

async function activate(plan: { id: string; updated_at: string }) {
  const participants = await admin
    .from("tna_plan_participants")
    .select("peserta_id")
    .eq("plan_id", plan.id);
  expect(participants.error).toBeNull();
  return (await rpc("tna_activate_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: plan.updated_at,
    // A complete baseline snapshot, so the plan list (full plan schema)
    // reads these fixture plans the same way it reads production plans.
    p_baseline: {
      metric_version: 1,
      computed_at: new Date().toISOString(),
      periodId: fixture.ids.periods[2],
      serviceType: "chat",
      indicatorId: fixture.ids.indicators[0],
      parameterName: fixture.names.mapped,
      category: "non_critical",
      auditStatus: "audited",
      auditedAgents: 2,
      sampledSessions: 2,
      findings: 4,
      affectedAgents: 2,
      ratePer100: 200,
      spreadPct: 100,
      insufficientData: false,
      comparePeriods: [],
      comparisonRatePer100: null,
      trendStatus: "no_comparison_data",
      trendPct: null,
      isCandidate: true,
      signals: [],
      suggestedIntervention: "kelas",
      validation_drift: { findings: 0, auditedAgents: 0 },
    },
    p_participant_baselines: participants.data!.map((row) => ({
      peserta_id: row.peserta_id,
      baseline_findings: 2,
      was_affected: true,
    })),
  })) as { id: string; updated_at: string };
}

function verdictFor(rate: number, spread: number) {
  const rateMet = rate <= 100;
  const spreadMet = spread <= 90;
  return rateMet && spreadMet
    ? "tercapai"
    : rateMet !== spreadMet
      ? "tercapai_sebagian"
      : "tidak_tercapai";
}

async function completePlan(
  label: string,
  program: "a" | "b",
  gap: string,
  rate: number,
  spread: number,
  followUp: string,
) {
  const active = await activate(await draftPlan(label, program, gap, today));
  const periodId = fixture.ids.periods[2]!;
  const started = await rpc("tna_start_plan_evaluation", {
    p_actor_id: users.trainer.userId,
    p_plan_id: active.id,
    p_expected_updated_at: active.updated_at,
    p_evaluation_period_id: periodId,
  });
  const participants = await admin
    .from("tna_plan_participants")
    .select("id")
    .eq("plan_id", active.id);
  const cohort = {
    baseline: {
      agents: 1,
      findings: 2,
      sampledSessions: 10,
      ratePer100: 20,
      spreadPct: 100,
    },
    evaluation: {
      agents: 1,
      findings: 1,
      sampledSessions: 10,
      ratePer100: 10,
      spreadPct: 100,
    },
    delta: -10,
  };
  const verdict = verdictFor(rate, spread);
  await rpc("tna_complete_plan", {
    p_actor_id: users.trainer.userId,
    p_plan_id: active.id,
    p_expected_updated_at: started.updated_at,
    p_evaluation_snapshot: {
      metric_version: 1,
      computed_at: new Date().toISOString(),
      evaluation_period_id: periodId,
      population: {
        periodId,
        auditedAgents: 5,
        sampledSessions: 10,
        findings: 2,
        affectedAgents: 2,
        ratePer100: rate,
        spreadPct: spread,
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
      verdict,
    },
    p_participant_evaluations: participants.data!.map((row) => ({
      participant_id: row.id,
      audited_in_eval: true,
      eval_findings: 1,
      eval_sessions: 5,
    })),
    p_verdict: verdict,
    p_conclusion_note: "Kesimpulan evaluasi sintetis",
    p_follow_up: followUp,
  });
}

const otherCompletedToday = () =>
  sql(
    `SELECT count(*) FROM tna_plans WHERE status='selesai'
      AND (completed_at AT TIME ZONE 'Asia/Jakarta')::date = '${today}'
      AND id NOT IN ('${Object.values(plans).join("','") || randomUUID()}');`,
  );

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
  app = (await import("../../api/src/app")).default as unknown as Hono;
  today = sql(
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  yesterday = sql(
    "SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date - 1)::text;",
  );
  await createProgram("a", "Program efektivitas A");
  await createProgram("b", "Program efektivitas B");
});

test.afterAll(async () => {
  sql(
    `DELETE FROM tna_plans WHERE need_id IN (SELECT id FROM tna_needs WHERE period_id IN ('${fixture.ids.periods.join("','")}'));
     DELETE FROM tna_needs WHERE period_id IN ('${fixture.ids.periods.join("','")}');`,
  );
  const ids = Object.values(programs).map((p) => p.id);
  if (ids.length)
    sql(`DELETE FROM tna_programs WHERE id IN ('${ids.join("','")}');`);
  for (const user of denied)
    expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
  await fixture.cleanup();
});

test("effectiveness groups completed plans by program from frozen snapshots", async () => {
  // Fail closed: the summary below is exact, so no other completed plan may
  // share today's WIB date on this local database.
  expect(otherCompletedToday(), "other completed TNA plans today").toBe("0");

  // Program A: three plans, one of each verdict; drops 180, 140, 50.
  await completePlan("a1", "a", "skill", 20, 40, "selesai_tuntas");
  await completePlan("a2", "a", "skill", 60, 95, "perlu_rencana_lanjutan");
  await completePlan("a3", "a", "proses", 150, 95, "eskalasi_non_training");
  // Program B: one plan, a thin group.
  await completePlan("b1", "b", "skill", 40, 50, "selesai_tuntas");
  // Not completed: an active plan and a draft never count.
  await activate(await draftPlan("aktif", "a", "skill", today));
  await draftPlan("draf", "b", "skill", today);

  // P-3 consistency: renaming after activation keeps the frozen name.
  sql(
    `UPDATE tna_programs SET name='Program A diganti' WHERE id='${programs.a.id}';`,
  );

  const result = await call<TnaEffectiveness>(
    `/effectiveness?from=${today}&to=${today}`,
  );
  expect(result.status).toBe(200);
  const data = result.data;
  expect(data.group_by).toBe("program");
  expect(data.from).toBe(today);
  expect(data.to).toBe(today);
  expect(data.summary).toEqual({
    completed: 4,
    verdicts: { tercapai: 2, tercapai_sebagian: 1, tidak_tercapai: 1 },
    fully_achieved_pct: 50,
    // drops 180, 140, 50, 160 -> median (140 + 160) / 2
    median_rate_drop: 150,
    median_duration_days: expect.any(Number),
  });
  expect(data.summary.median_duration_days).toBeGreaterThanOrEqual(0);
  expect(data.summary.median_duration_days).toBeLessThan(1);

  expect(data.groups.map((g) => g.key)).toEqual([
    programs.a.code,
    programs.b.code,
  ]);
  const [a, b] = data.groups;
  expect(a).toMatchObject({
    key: programs.a.code,
    label: "Program efektivitas A",
    completed: 3,
    verdicts: { tercapai: 1, tercapai_sebagian: 1, tidak_tercapai: 1 },
    median_rate_drop: 140,
    follow_ups: {
      selesai_tuntas: 1,
      perlu_rencana_lanjutan: 1,
      eskalasi_non_training: 1,
    },
    thin: false,
  });
  expect(a!.fully_achieved_pct).toBeCloseTo(100 / 3, 6);
  // P-2: the numbers link to the plans behind them, newest first.
  expect(a!.plans.map((p) => p.id)).toEqual([plans.a3, plans.a2, plans.a1]);
  expect(a!.plans[0]).toEqual({
    id: plans.a3,
    title: `Rencana a3 ${suffix}`,
    verdict: "tidak_tercapai",
    completed_at: expect.any(String),
  });
  expect(b).toMatchObject({
    key: programs.b.code,
    label: "Program efektivitas B",
    completed: 1,
    verdicts: { tercapai: 1, tercapai_sebagian: 0, tidak_tercapai: 0 },
    fully_achieved_pct: 100,
    median_rate_drop: 160,
    thin: true,
  });
});

test("effectiveness groups by validated need gap and by service", async () => {
  // P-1: gap type comes from the need the trainer validated, not the program
  // (both fixture programs are "skill"; plan a3's need is "proses").
  const byGap = await call<TnaEffectiveness>(
    `/effectiveness?from=${today}&to=${today}&group_by=gap_type`,
  );
  expect(byGap.status).toBe(200);
  expect(
    byGap.data.groups.map((g) => [g.key, g.label, g.completed, g.thin]),
  ).toEqual([
    ["skill", null, 3, false],
    ["proses", null, 1, true],
  ]);
  expect(byGap.data.groups[1]!.plans.map((p) => p.id)).toEqual([plans.a3]);

  const byService = await call<TnaEffectiveness>(
    `/effectiveness?from=${today}&to=${today}&group_by=service`,
  );
  expect(byService.status).toBe(200);
  expect(byService.data.groups).toHaveLength(1);
  expect(byService.data.groups[0]).toMatchObject({
    key: "chat",
    label: null,
    completed: 4,
    median_rate_drop: 150,
  });
});

test("effectiveness filters by WIB completion date and validates the query", async () => {
  const before = await call<TnaEffectiveness>(`/effectiveness?to=${yesterday}`);
  expect(before.status).toBe(200);
  expect(
    before.data.groups.flatMap((g) => g.plans.map((p) => p.id)),
  ).not.toContain(plans.a1);
  expect(before.data.from).toBeNull();

  const empty = await call<TnaEffectiveness>(
    `/effectiveness?from=${yesterday}&to=${yesterday}`,
  );
  expect(empty.status).toBe(200);
  expect(empty.data.summary).toEqual({
    completed: 0,
    verdicts: { tercapai: 0, tercapai_sebagian: 0, tidak_tercapai: 0 },
    fully_achieved_pct: null,
    median_rate_drop: null,
    median_duration_days: null,
  });
  expect(empty.data.groups).toEqual([]);

  const open = await call<TnaEffectiveness>("/effectiveness");
  expect(open.status).toBe(200);
  expect(open.data.summary.completed).toBe(
    Number(sql("SELECT count(*) FROM tna_plans WHERE status='selesai';")),
  );

  for (const query of [
    `from=${today}&to=${yesterday}`,
    "from=2026-13-01",
    "from=kemarin",
    "group_by=tim",
    "limit=5",
  ]) {
    const invalid = await call(`/effectiveness?${query}`);
    expect(invalid.status, query).toBe(400);
  }
});

test("due count matches the due list without returning plans", async () => {
  // aktif plan due today counts; one due tomorrow does not.
  const tomorrow = sql(
    "SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date + 1)::text;",
  );
  await activate(await draftPlan("besok", "b", "skill", tomorrow));

  const list = await call<{ items: Array<{ id: string }> }>("/plans?due=1");
  expect(list.status).toBe(200);
  const count = await call<{ count: number }>("/plans/due-count");
  expect(count.status).toBe(200);
  expect(count.data).toEqual({ count: list.data.items.length });
  const dueIds = list.data.items.map((p) => p.id);
  expect(dueIds).toContain(plans.aktif);
  expect(dueIds).not.toContain(plans.besok);
  expect(count.data.count, "same WIB rule as the RPC, counted in SQL").toBe(
    Number(
      sql(
        `SELECT count(*) FROM tna_plans WHERE status='evaluasi'
          OR (status='aktif' AND evaluation_due_date <= '${today}');`,
      ),
    ),
  );

  const bad = await call("/plans/due-count?due=1");
  expect(bad.status).toBe(400);
});

test("only admin and trainer read effectiveness and the due count", async () => {
  expect((await call("/effectiveness", users.admin.token)).status).toBe(200);
  for (const path of ["/effectiveness", "/plans/due-count"]) {
    for (const user of denied)
      expect((await call(path, user.token)).status, path).toBe(403);
    expect((await call(path, null)).status, `anon ${path}`).toBe(401);
  }
});
