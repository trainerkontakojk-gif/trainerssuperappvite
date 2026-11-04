import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import type { TnaNeed, TnaPlan, TnaPlanDetail } from "@trainers/types";
import { tnaApiRequest } from "./helpers/tnaApi";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  createUserWithJwt,
  runSql,
} from "./helpers/sidakRealBackend";

// TNA phase 3 T2 (plans/markdown/tna-phase-3.md D16/D17, K18-K21, P-3):
// practice progress on GET /tna/plans/:id. Real local Supabase; history rows
// are written with psql so every counting rule has an explicit fixture.
test.describe.configure({ mode: "serial" });

const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const admin = createAdmin(fixture.env);
let users: Awaited<ReturnType<typeof fixture.seed>>;
let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let app: Hono;
let programId: string;
let today: string;
let year: string;
const baselinePeriod = fixture.ids.periods[1]!;
const evaluationPeriod = fixture.ids.periods[2]!;
const [p0, p1] = fixture.ids.participants as [string, string];
const historyIds: Record<"ketik" | "pdkt" | "telefun", string[]> = {
  ketik: [],
  pdkt: [],
  telefun: [],
};

function sql(query: string) {
  try {
    return runSql(fixture.env, query);
  } catch {
    throw new Error("TNA practice SQL failed; raw command suppressed");
  }
}
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function call<T = TnaPlan>(path: string, method = "GET", body?: unknown) {
  const response = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${users.trainer.token}`,
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

async function detail(id: string) {
  const result = await call<TnaPlanDetail>(`/plans/${id}`);
  expect(result.status, JSON.stringify(result.error)).toBe(200);
  return result.data;
}

// Need through the API (server-computed snapshot); plan through the T1 RPC
// so targets exist before the T3 HTTP contract accepts them.
async function draftPlan(targets?: { module: string; min_sessions: number }[]) {
  const need = await call<TnaNeed>("/needs", "POST", {
    service_type: "chat",
    period_id: baselinePeriod,
    indicator_id: fixture.ids.metricsIndicators.alpha,
    compare_count: 2,
    validated_cluster_id: "kurang_menggali",
    cause_note: "Trainer memvalidasi kebutuhan latihan simulasi.",
    gap_type: "skill",
    outcome: "training",
  });
  expect(need.status).toBe(201);
  const plan = await admin.rpc("tna_create_plan", {
    p_actor_id: users.trainer.userId,
    p_plan: {
      need_id: need.data.id,
      program_id: programId,
      title: "Pelatihan dengan latihan simulasi",
      intervention_type: "kelas",
      start_date: `${year}-02-01`,
      end_date: `${year}-02-02`,
      evaluation_due_date: today,
      target_max_rate_per_100: 1,
      target_max_spread_pct: 10,
      ...(targets ? { practice_targets: targets } : {}),
    },
    p_participants: [{ peserta_id: p0 }, { peserta_id: p1 }],
  });
  expect(plan.error).toBeNull();
  return plan.data as TnaPlan;
}

async function activePlan(
  targets?: { module: string; min_sessions: number }[],
) {
  const plan = await draftPlan(targets);
  const activated = await call(`/plans/${plan.id}/activate`, "POST", {
    expected_updated_at: plan.updated_at,
  });
  expect(activated.status, JSON.stringify(activated.error)).toBe(200);
  return activated.data;
}

type Row = {
  module: "ketik" | "pdkt" | "telefun";
  at: string;
  userId: string;
  subject: "self" | "participant" | null;
  pesertaId?: string;
  score: number | null;
  status: string | null;
  legacyStatus?: string;
};

function insert(row: Row) {
  const subject =
    row.subject === "participant"
      ? `'participant', ${q(row.pesertaId!)}, 'Peserta latihan', 'Batch latihan', 'Tim Chat'`
      : row.subject === "self"
        ? `'self', NULL, NULL, NULL, NULL`
        : `NULL, NULL, NULL, NULL, NULL`;
  const cols = `simulation_subject_type, simulation_subject_peserta_id, simulation_subject_name, simulation_subject_batch_name, simulation_subject_team`;
  const score = row.score === null ? "NULL" : String(row.score);
  const status = row.status === null ? "NULL" : q(row.status);
  const id =
    row.module === "ketik"
      ? sql(
          `INSERT INTO ketik_history (user_id, date, scenario_title, consumer_name, final_score, review_status, ${cols})
           VALUES (${q(row.userId)}, ${q(row.at)}, 'Latihan TNA', 'Konsumen', ${score}, ${status}, ${subject}) RETURNING id;`,
        )
      : row.module === "pdkt"
        ? sql(
            `INSERT INTO pdkt_history (user_id, timestamp, config, emails, evaluation, evaluation_status, ${cols})
             VALUES (${q(row.userId)}, ${q(row.at)}, '{"scenarios":[]}'::jsonb, '[]'::jsonb,
               ${row.score === null ? "NULL" : `'{"score": ${row.score}}'::jsonb`}, ${status}, ${subject}) RETURNING id;`,
          )
        : sql(
            `INSERT INTO telefun_history (user_id, created_at, scenario_title, consumer_name, score, scoring_status, status, ${cols})
             VALUES (${q(row.userId)}, ${q(row.at)}, 'Latihan TNA', 'Konsumen', ${score}, ${status},
               ${q(row.legacyStatus ?? "completed")}, ${subject}) RETURNING id;`,
          );
  historyIds[row.module].push(id);
  return id;
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
  agent = await createUserWithJwt(fixture.env, "agent", namespace);
  // p0 has a linked agent account (K19b); p1 has none.
  sql(
    `UPDATE profiler_peserta SET akun_id=${q(agent.userId)} WHERE id=${q(p0)};`,
  );
  programId = sql(
    "SELECT id FROM tna_programs WHERE code='effective-probing';",
  );
  today = sql("SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date;");
  year = sql(`SELECT year FROM qa_periods WHERE id='${baselinePeriod}';`);
  app = (await import("../../api/src/app")).default as unknown as Hono;

  // Window K18 = start_date 00:00 WIB .. evaluation_due_date 23:59:59 WIB.
  const startUtc = `${Number(year)}-01-31T17:00:00Z`; // 1 Feb 00:00 WIB
  const beforeStart = `${Number(year)}-01-31T16:59:59Z`;
  const mid = `${Number(year)}-03-15T03:00:00Z`;
  const afterDue = sql(
    `SELECT to_char(((${q(today)}::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');`,
  );
  const lastDueSecond = sql(
    `SELECT to_char((((${q(today)}::date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta') - interval '1 second') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');`,
  );
  const T = users.trainer.userId;
  const A = agent.userId;
  // KETIK p0: counted = self at start boundary (80) + trainer-run participant (90).
  insert({
    module: "ketik",
    at: startUtc,
    userId: A,
    subject: "self",
    score: 80,
    status: "completed",
  });
  insert({
    module: "ketik",
    at: mid,
    userId: T,
    subject: "participant",
    pesertaId: p0,
    score: 90,
    status: "completed",
  });
  // Not counted: before window, after window, not reviewed, legacy NULL subject,
  // a trainer's own self session, a deleted-later session counted for now.
  insert({
    module: "ketik",
    at: beforeStart,
    userId: A,
    subject: "self",
    score: 50,
    status: "completed",
  });
  insert({
    module: "ketik",
    at: afterDue,
    userId: A,
    subject: "self",
    score: 50,
    status: "completed",
  });
  insert({
    module: "ketik",
    at: mid,
    userId: A,
    subject: "self",
    score: null,
    status: "failed",
  });
  insert({
    module: "ketik",
    at: mid,
    userId: A,
    subject: null,
    score: 50,
    status: "completed",
  });
  insert({
    module: "ketik",
    at: mid,
    userId: T,
    subject: "self",
    score: 50,
    status: "completed",
  });
  // KETIK p1: one trainer-run participant session at the last due second.
  insert({
    module: "ketik",
    at: lastDueSecond,
    userId: T,
    subject: "participant",
    pesertaId: p1,
    score: 70,
    status: "completed",
  });
  // Telefun p0: scored participant session + legacy self row (scoring_status NULL,
  // status completed, score present) -> 2 sessions, avg 6.7.
  insert({
    module: "telefun",
    at: mid,
    userId: T,
    subject: "participant",
    pesertaId: p0,
    score: 7.4,
    status: "completed",
  });
  insert({
    module: "telefun",
    at: mid,
    userId: A,
    subject: "self",
    score: 6,
    status: null,
    legacyStatus: "completed",
  });
  // Telefun p1: failed scoring and a legacy row without score -> 0 sessions.
  insert({
    module: "telefun",
    at: mid,
    userId: T,
    subject: "participant",
    pesertaId: p1,
    score: null,
    status: "failed",
  });
  insert({
    module: "telefun",
    at: mid,
    userId: T,
    subject: "participant",
    pesertaId: p1,
    score: null,
    status: null,
    legacyStatus: "completed",
  });
  // PDKT has no target in these plans; a completed session must not appear.
  insert({
    module: "pdkt",
    at: mid,
    userId: A,
    subject: "self",
    score: 88,
    status: "completed",
  });
});

test.afterAll(async () => {
  for (const [module, ids] of Object.entries(historyIds)) {
    if (ids.length)
      sql(
        `DELETE FROM ${module}_history WHERE id IN (${ids.map(q).join(",")});`,
      );
  }
  const periods = [...fixture.ids.periods, ...fixture.ids.extraPeriods].join(
    "','",
  );
  sql(
    `BEGIN; DELETE FROM tna_plans WHERE need_id IN (SELECT id FROM tna_needs WHERE period_id IN ('${periods}')); DELETE FROM tna_needs WHERE period_id IN ('${periods}'); COMMIT;`,
  );
  sql(`UPDATE profiler_peserta SET akun_id=NULL WHERE id=${q(p0)};`);
  expect((await admin.auth.admin.deleteUser(agent.userId)).error).toBeNull();
  await fixture.cleanup();
});

const expectedLive = (
  participants: { id: string; peserta_id: string | null }[],
) => {
  const byPeserta = new Map(participants.map((p) => [p.peserta_id, p.id]));
  return [
    {
      participant_id: byPeserta.get(p0),
      peserta_id: p0,
      modules: {
        ketik: { sessions: 2, avg_score: 85, status: "memenuhi" },
        telefun: { sessions: 2, avg_score: 6.7, status: "memenuhi" },
      },
    },
    {
      participant_id: byPeserta.get(p1),
      peserta_id: p1,
      modules: {
        ketik: { sessions: 1, avg_score: 70, status: "berjalan" },
        telefun: { sessions: 0, avg_score: null, status: "belum_mulai" },
      },
    },
  ].sort((a, b) =>
    String(a.participant_id).localeCompare(String(b.participant_id)),
  );
};

test("draft and target-less plans expose targets but no progress", async () => {
  const draft = await draftPlan([
    { module: "telefun", min_sessions: 1 },
    { module: "ketik", min_sessions: 2 },
  ]);
  const draftDetail = await detail(draft.id);
  expect(draftDetail.practice_targets).toEqual([
    { module: "ketik", min_sessions: 2 },
    { module: "telefun", min_sessions: 1 },
  ]);
  expect(draftDetail.practice).toBeNull();

  const plain = await activePlan();
  const plainDetail = await detail(plain.id);
  expect(plainDetail.practice_targets).toEqual([]);
  expect(plainDetail.practice).toBeNull();
});

test("active plan counts both session sources inside the WIB window, completed only", async () => {
  const plan = await activePlan([
    { module: "ketik", min_sessions: 2 },
    { module: "telefun", min_sessions: 1 },
  ]);
  const result = await detail(plan.id);
  expect(result.practice?.state).toBe("live");
  expect(result.practice?.participants).toEqual(
    expectedLive(result.participants),
  );
  expect(result.practice?.summary).toEqual([
    { module: "ketik", min_sessions: 2, met: 1, total: 2 },
    { module: "telefun", min_sessions: 1, met: 1, total: 2 },
  ]);
  // K21: counts and averages only, never session content or consumer data.
  const json = JSON.stringify(result.practice);
  for (const forbidden of ["Konsumen", "Latihan TNA", "messages", "user_id"])
    expect(json).not.toContain(forbidden);

  // P-4: a deleted session no longer counts while the plan is live.
  const counted = historyIds.ketik[1]!;
  sql(`DELETE FROM ketik_history WHERE id=${q(counted)};`);
  historyIds.ketik.splice(1, 1);
  const after = await detail(plan.id);
  const p0Row = after.practice!.participants.find((p) => p.peserta_id === p0)!;
  expect(p0Row.modules.ketik).toEqual({
    sessions: 1,
    avg_score: 80,
    status: "berjalan",
  });
  // Restore the fixture for the next test.
  insert({
    module: "ketik",
    at: `${Number(year)}-03-15T03:00:00Z`,
    userId: users.trainer.userId,
    subject: "participant",
    pesertaId: p0,
    score: 90,
    status: "completed",
  });
});

test("completed plan shows the frozen snapshot regardless of later history changes", async () => {
  const plan = await activePlan([
    { module: "ketik", min_sessions: 2 },
    { module: "telefun", min_sessions: 1 },
  ]);
  const started = await admin.rpc("tna_start_plan_evaluation", {
    p_actor_id: users.trainer.userId,
    p_plan_id: plan.id,
    p_expected_updated_at: plan.updated_at,
    p_evaluation_period_id: evaluationPeriod,
  });
  expect(started.error).toBeNull();
  const preview = await detail(plan.id);
  expect(preview.practice?.state).toBe("live");
  expect(preview.practice?.participants).toEqual(
    expectedLive(preview.participants),
  );
  const practiceById = new Map(
    preview.practice!.participants.map((p) => [p.participant_id, p.modules]),
  );
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
        practice: practiceById.get(participant_id),
      }),
    ),
    p_verdict: preview.evaluation!.verdict,
    p_conclusion_note: "Hasil evaluasi ditinjau bersama progres latihan.",
    p_follow_up: "selesai_tuntas",
  });
  expect(completed.error).toBeNull();

  // History changes after completion must not move the frozen numbers.
  insert({
    module: "telefun",
    at: `${Number(year)}-03-16T03:00:00Z`,
    userId: users.trainer.userId,
    subject: "participant",
    pesertaId: p1,
    score: 9,
    status: "completed",
  });
  const frozen = await detail(plan.id);
  expect(frozen.practice?.state).toBe("frozen");
  expect(frozen.practice?.participants).toEqual(
    expectedLive(frozen.participants),
  );
  expect(frozen.practice?.summary).toEqual([
    { module: "ketik", min_sessions: 2, met: 1, total: 2 },
    { module: "telefun", min_sessions: 1, met: 1, total: 2 },
  ]);
});
