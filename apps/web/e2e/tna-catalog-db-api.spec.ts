import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  createUserWithJwt,
  sqlOne,
} from "./helpers/sidakRealBackend";

// TNA phase 5 T1 (plans/markdown/tna-phase-5.md D24, K32-K35, P-3, P-4):
// program catalog writers and a frozen program snapshot on activation. Real
// local Supabase only. Catalog presence is checked first so a missing schema
// is a safe RED that never calls anything new. Seed programs are never
// changed; every program here is a fixture with a unique code (P-4).
test.describe.configure({ mode: "serial" });

const namespace = randomUUID();
const suffix = namespace.slice(0, 8);
const fixture = createTnaFixture(namespace);
const env = fixture.env;
const admin = createAdmin(env);
const users: Record<string, Awaited<ReturnType<typeof createUserWithJwt>>> = {};
const createdNeeds: string[] = [];
const createdPlans: string[] = [];
const createdPrograms: string[] = [];

type Program = {
  id: string;
  code: string;
  name: string;
  updated_at: string;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
};

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
  if (createdPrograms.length) {
    const deleted = await admin
      .from("tna_programs")
      .delete()
      .in("id", createdPrograms);
    expect(deleted.error, "cleanup program fixture gagal").toBeNull();
  }
  await fixture.cleanup();
  for (const role of ["leader", "agent"]) {
    const result = await admin.auth.admin.deleteUser(users[role]!.userId);
    if (result.error) throw new Error("TNA test user cleanup failed");
  }
});

function programPayload(overrides: Record<string, unknown> = {}) {
  return {
    code: `uji-katalog-${suffix}-${createdPrograms.length}`,
    name: "Program uji katalog",
    description: "Program sintetis untuk uji katalog TNA.",
    gap_type: "skill",
    trigger_clusters: ["hold_waktu_tunggu"],
    service_types: ["call"],
    suggested_modules: ["ketik", "telefun"],
    ...overrides,
  };
}

async function createProgram(overrides: Record<string, unknown> = {}) {
  const result = await admin.rpc("tna_create_program", {
    p_actor_id: users.trainer!.userId,
    p_program: programPayload(overrides),
  });
  if (result.data?.id) createdPrograms.push(result.data.id);
  return result as { data: Program | null; error: { message: string } | null };
}

function updateProgram(
  program: Pick<Program, "id" | "updated_at">,
  patch: Record<string, unknown>,
) {
  return admin.rpc("tna_update_program", {
    p_actor_id: users.admin!.userId,
    p_program_id: program.id,
    p_expected_updated_at: program.updated_at,
    p_program: patch,
  }) as unknown as Promise<{
    data: Program | null;
    error: { message: string } | null;
  }>;
}

function setActive(
  program: Pick<Program, "id" | "updated_at">,
  active: boolean,
) {
  return admin.rpc("tna_set_program_active", {
    p_actor_id: users.trainer!.userId,
    p_program_id: program.id,
    p_expected_updated_at: program.updated_at,
    p_active: active,
  }) as unknown as Promise<{
    data: Program | null;
    error: { message: string } | null;
  }>;
}

async function makePlan(programId: string) {
  const need = await admin.rpc("tna_create_need", {
    p_actor_id: users.trainer!.userId,
    p_payload: {
      service_type: "chat",
      period_id: fixture.ids.periods[2],
      indicator_id: fixture.ids.indicators[0],
      compare_count: 2,
      validation_snapshot: { metric_version: 1, findings: 4 },
      validated_cluster_id: "kurang_menggali",
      cause_note: "Catatan TNA katalog sintetis",
      gap_type: "skill",
      outcome: "training",
    },
  });
  expect(need.error).toBeNull();
  createdNeeds.push(need.data.id);
  const date = sqlOne(
    env,
    "SELECT (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text;",
  );
  const plan = await admin.rpc("tna_create_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan: {
      need_id: need.data.id,
      program_id: programId,
      title: "Rencana katalog sintetis",
      intervention_type: "kelas",
      start_date: date,
      end_date: date,
      evaluation_due_date: sqlOne(env, `SELECT ('${date}'::date + 30)::text;`),
      target_max_rate_per_100: 100,
      target_max_spread_pct: 90,
    },
    p_participants: [{ peserta_id: fixture.ids.participants[0] }],
  });
  if (plan.data?.id) createdPlans.push(plan.data.id);
  return plan;
}

function activate(plan: { id: string; updated_at: string }) {
  return admin.rpc("tna_activate_plan", {
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
    p_participant_baselines: [
      {
        peserta_id: fixture.ids.participants[0],
        baseline_findings: 2,
        was_affected: true,
      },
    ],
  });
}

test("phase 5 catalog columns, snapshot column, and writers are installed with legacy signatures intact", async () => {
  const columns = sqlOne(
    env,
    `SELECT coalesce(string_agg(column_name, ',' ORDER BY column_name), 'none') FROM information_schema.columns
      WHERE table_schema='public' AND (
        (table_name='tna_programs' AND column_name IN ('updated_at','created_by','updated_by'))
        OR (table_name='tna_plans' AND column_name='program_snapshot'));`,
  );
  expect(columns, "phase 5 columns missing").toBe(
    "created_by,program_snapshot,updated_at,updated_by",
  );
  const missing = sqlOne(
    env,
    `SELECT coalesce(string_agg(sig, ','), 'none') FROM unnest(ARRAY[
      'tna_create_program(uuid,jsonb)',
      'tna_update_program(uuid,uuid,timestamptz,jsonb)',
      'tna_set_program_active(uuid,uuid,timestamptz,boolean)',
      'tna_activate_plan(uuid,uuid,timestamptz,jsonb,jsonb)',
      'tna_create_plan(uuid,jsonb,jsonb)'
    ]) AS sig WHERE to_regprocedure('public.' || sig) IS NULL;`,
  );
  expect(missing, "TNA functions missing").toBe("none");
  // P-4: the seven seed programs stay as they were.
  expect(
    sqlOne(
      env,
      "SELECT count(*) FROM tna_programs WHERE created_by IS NULL AND is_active;",
    ),
  ).toBe("7");
});

test("service role creates programs with validated, server-owned fields", async () => {
  const created = await createProgram();
  expect(created.error).toBeNull();
  expect(created.data).toMatchObject({
    name: "Program uji katalog",
    is_active: true,
    created_by: users.trainer!.userId,
    updated_by: users.trainer!.userId,
    trigger_clusters: ["hold_waktu_tunggu"],
    suggested_modules: ["ketik", "telefun"],
  });

  const duplicate = await admin.rpc("tna_create_program", {
    p_actor_id: users.trainer!.userId,
    p_program: programPayload({ code: created.data!.code }),
  });
  expect(duplicate.error?.message).toBe("TNA_PROGRAM_CODE_EXISTS");

  const invalid: Record<string, unknown>[] = [
    { code: "Huruf-Besar" },
    { code: "ab" },
    { code: "1-mulai-angka" },
    { name: "  x " },
    { description: "pendek" },
    { gap_type: "lain" },
    { trigger_clusters: "hold_waktu_tunggu" },
    { trigger_clusters: ["kurang_menggali", "kurang_menggali"] },
    { trigger_clusters: [""] },
    { service_types: [1] },
    { suggested_modules: ["efek"] },
    { suggested_modules: ["ketik", "ketik"] },
    { is_active: false },
    { created_by: users.admin!.userId },
  ];
  for (const override of invalid) {
    const result = await admin.rpc("tna_create_program", {
      p_actor_id: users.trainer!.userId,
      p_program: programPayload({
        code: `uji-invalid-${suffix}`,
        ...override,
      }),
    });
    expect(result.error?.message, JSON.stringify(override)).toBe(
      "TNA_INVALID_PROGRAM",
    );
  }
  const missingKey = programPayload({
    code: `uji-invalid-${suffix}`,
  }) as Record<string, unknown>;
  delete missingKey.description;
  const result = await admin.rpc("tna_create_program", {
    p_actor_id: users.trainer!.userId,
    p_program: missingKey,
  });
  expect(result.error?.message).toBe("TNA_INVALID_PROGRAM");

  const leaderActor = await admin.rpc("tna_create_program", {
    p_actor_id: users.leader!.userId,
    p_program: programPayload({ code: `uji-invalid-${suffix}` }),
  });
  expect(leaderActor.error?.message).toBe("TNA_ACTOR_FORBIDDEN");
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM tna_programs WHERE code='uji-invalid-${suffix}';`,
    ),
  ).toBe("0");
});

test("updates and activation toggles need a fresh revision and never change the code", async () => {
  const created = (await createProgram()).data!;
  const updated = await updateProgram(created, {
    name: "Program uji katalog diubah",
    description: "Deskripsi program uji yang sudah diperbarui.",
    gap_type: "proses",
    trigger_clusters: ["proses_ideb_slik", "komunikasi_layanan"],
    service_types: [],
    suggested_modules: ["pdkt"],
  });
  expect(updated.error).toBeNull();
  expect(updated.data).toMatchObject({
    code: created.code,
    name: "Program uji katalog diubah",
    gap_type: "proses",
    trigger_clusters: ["proses_ideb_slik", "komunikasi_layanan"],
    service_types: [],
    suggested_modules: ["pdkt"],
    created_by: users.trainer!.userId,
    updated_by: users.admin!.userId,
  });
  expect(Date.parse(updated.data!.updated_at)).toBeGreaterThan(
    Date.parse(created.updated_at),
  );

  const stale = await updateProgram(created, { name: "Nama basi program" });
  expect(stale.error?.message).toBe("TNA_PROGRAM_STALE");
  const withCode = await updateProgram(updated.data!, { code: "kode-baru" });
  expect(withCode.error?.message).toBe("TNA_INVALID_PROGRAM");
  const empty = await updateProgram(updated.data!, {});
  expect(empty.error?.message).toBe("TNA_INVALID_PROGRAM");
  const unknown = await updateProgram(
    { id: randomUUID(), updated_at: created.updated_at },
    { name: "Program tidak ada" },
  );
  expect(unknown.error?.message).toBe("TNA_PROGRAM_NOT_FOUND");

  const inactive = await setActive(updated.data!, false);
  expect(inactive.error).toBeNull();
  expect(inactive.data!.is_active).toBe(false);
  const staleToggle = await setActive(updated.data!, true);
  expect(staleToggle.error?.message).toBe("TNA_PROGRAM_STALE");
  const plan = await makePlan(created.id);
  expect(plan.error?.message, "inactive program blocks new plans").toBe(
    "TNA_PROGRAM_INACTIVE",
  );
  const active = await setActive(inactive.data!, true);
  expect(active.error).toBeNull();
  expect(active.data!.is_active).toBe(true);

  // Even the service role cannot rename a code directly or store a module
  // outside the catalog.
  const rename = await admin
    .from("tna_programs")
    .update({ code: `kode-lain-${suffix}` })
    .eq("id", created.id);
  expect(rename.error?.message).toBe("TNA_PROGRAM_CODE_IMMUTABLE");
  const badModule = await admin
    .from("tna_programs")
    .update({ suggested_modules: ["efek"] })
    .eq("id", created.id);
  expect(badModule.error?.code).toBe("23514");
});

test("client roles read the catalog but never write it or call the writers", async () => {
  const before = checkpointerStart();
  const created = (await createProgram()).data!;
  for (const role of ["admin", "trainer", "leader", "agent"]) {
    const db = client(role);
    const read = await db
      .from("tna_programs")
      .select("code")
      .eq("id", created.id);
    expect(read.error, role).toBeNull();
    expect(read.data, role).toEqual(
      role === "admin" || role === "trainer" ? [{ code: created.code }] : [],
    );
    for (const mutation of [
      () => db.from("tna_programs").insert(programPayload()),
      () =>
        db
          .from("tna_programs")
          .update({ name: "Diubah klien" })
          .eq("id", created.id),
      () => db.from("tna_programs").delete().eq("id", created.id),
    ]) {
      const result = await mutation();
      expect(result.error?.code, `${role} direct DML`).toBe("42501");
    }
    for (const [fn, args] of [
      [
        "tna_create_program",
        { p_actor_id: users.trainer!.userId, p_program: programPayload() },
      ],
      [
        "tna_update_program",
        {
          p_actor_id: users.trainer!.userId,
          p_program_id: created.id,
          p_expected_updated_at: created.updated_at,
          p_program: { name: "Diubah klien" },
        },
      ],
      [
        "tna_set_program_active",
        {
          p_actor_id: users.trainer!.userId,
          p_program_id: created.id,
          p_expected_updated_at: created.updated_at,
          p_active: false,
        },
      ],
    ] as const) {
      const rpc = await db.rpc(fn, args);
      expect(rpc.error?.message, `${role} ${fn}`).toBe("TNA_FORBIDDEN");
    }
  }
  expect(
    sqlOne(
      env,
      `SELECT name || '|' || is_active FROM tna_programs WHERE id='${created.id}';`,
    ),
  ).toBe("Program uji katalog|true");
  expect(checkpointerStart(), "database restarted during client calls").toBe(
    before,
  );
  expect(sqlOne(env, "SELECT 1;")).toBe("1");
});

test("activation freezes the program snapshot and nothing can change it afterwards", async () => {
  const program = (await createProgram({ gap_type: "knowledge" })).data!;
  const plan = await makePlan(program.id);
  expect(plan.error).toBeNull();
  expect(plan.data.program_snapshot).toBeNull();

  // Server-owned: a draft cannot carry or receive a snapshot.
  const draftWrite = await admin
    .from("tna_plans")
    .update({ program_snapshot: { code: "palsu", name: "Palsu" } })
    .eq("id", plan.data.id);
  expect(draftWrite.error?.message).toBe("TNA_PROGRAM_SNAPSHOT_IMMUTABLE");

  const activated = await activate(plan.data);
  expect(activated.error).toBeNull();
  expect(activated.data.program_snapshot).toEqual({
    code: program.code,
    name: "Program uji katalog",
    gap_type: "knowledge",
  });

  const renamed = await updateProgram(program, {
    name: "Program uji katalog berganti nama",
  });
  expect(renamed.error).toBeNull();
  expect(
    sqlOne(
      env,
      `SELECT program_snapshot->>'name' FROM tna_plans WHERE id='${plan.data.id}';`,
    ),
  ).toBe("Program uji katalog");

  const overwrite = await admin
    .from("tna_plans")
    .update({ program_snapshot: null })
    .eq("id", plan.data.id);
  expect(overwrite.error?.message).toBe("TNA_PROGRAM_SNAPSHOT_IMMUTABLE");

  // The program a plan uses can be deactivated; the plan keeps its snapshot.
  const off = await setActive(renamed.data!, false);
  expect(off.error).toBeNull();
  expect(
    sqlOne(
      env,
      `SELECT status || '|' || (program_snapshot->>'code') FROM tna_plans WHERE id='${plan.data.id}';`,
    ),
  ).toBe(`aktif|${program.code}`);
});
