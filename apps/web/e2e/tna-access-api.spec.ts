import { tnaApiRequest } from "./helpers/tnaApi";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  createUserWithJwt,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

// Later tests call TNA RPCs as client roles. If the grant precondition fails,
// stop: calling a function whose EXECUTE is revoked crashes this Postgres image.
test.describe.configure({ mode: "serial" });

const namespace = randomUUID();
const fixture = createTnaFixture(namespace);
const MUTATION_FUNCTIONS = [
  "tna_create_need(uuid,jsonb)",
  "tna_create_plan(uuid,jsonb,jsonb)",
  "tna_update_draft_plan(uuid,uuid,timestamptz,jsonb,jsonb)",
  "tna_activate_plan(uuid,uuid,timestamptz,jsonb,jsonb)",
  "tna_cancel_plan(uuid,uuid,timestamptz)",
];
const users: Record<string, Awaited<ReturnType<typeof createUserWithJwt>>> = {};
const admin = createAdmin(fixture.env);
let app: Hono;
let needId: string | undefined;
let planId: string | undefined;

function client(role: string) {
  if (role === "anon")
    return createClient(fixture.env.apiUrl, fixture.env.anonKey, {
      auth: { persistSession: false },
    });
  return createClient(fixture.env.apiUrl, fixture.env.anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${users[role]!.token}` } },
  });
}

// A backend crash makes the postmaster restart every auxiliary process, so the
// checkpointer start time changes exactly when the database went through recovery.
function checkpointerStart(): string {
  return sqlOne(
    fixture.env,
    "SELECT backend_start FROM pg_stat_activity WHERE backend_type = 'checkpointer';",
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
  const seeded = await fixture.seed();
  expect(await fixture.seed()).toBe(seeded);
  expect(fixture.countOwnedFindings()).toBe(18);
  Object.assign(users, seeded);
  for (const role of ["leader", "agent"] as const)
    users[role] = await createUserWithJwt(fixture.env, role, namespace);
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (planId)
    runSql(fixture.env, `DELETE FROM tna_plans WHERE id='${planId}';`);
  if (needId)
    runSql(fixture.env, `DELETE FROM tna_needs WHERE id='${needId}';`);
  await fixture.cleanup();
  await fixture.cleanup();
  for (const role of ["leader", "agent"]) {
    if (users[role]) {
      const result = await admin.auth.admin.deleteUser(users[role]!.userId);
      if (result.error) throw new Error("TNA test user cleanup failed");
    }
  }
  expect(fixture.countOwnedFindings()).toBe(0);
});

test("catalog uses production auth and admits only admin/trainer", async () => {
  for (const role of ["admin", "trainer", "leader", "agent"]) {
    const response = await tnaApiRequest(
      app,
      "http://localhost/api/v1/tna/programs",
      {
        headers: { Authorization: `Bearer ${users[role]!.token}` },
      },
    );
    expect(response.status, role).toBe(
      role === "admin" || role === "trainer" ? 200 : 403,
    );
    const body = await response.json();
    if (response.status === 200) {
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(7);
      expect(body.data.map((p: { code: string }) => p.code)).toContain(
        "effective-probing",
      );
    }
  }
  const noToken = await tnaApiRequest(
    app,
    "http://localhost/api/v1/tna/programs",
    {},
  );
  expect(noToken.status).toBe(401);
});

test("parameter metrics admit admin/trainer and reject leader/agent", async () => {
  const query = `service_type=chat&period_id=${fixture.ids.periods[2]}&compare_count=2`;
  for (const role of ["admin", "trainer", "leader", "agent"]) {
    const response = await tnaApiRequest(
      app,
      `http://localhost/api/v1/tna/parameters?${query}`,
      { headers: { Authorization: `Bearer ${users[role]!.token}` } },
    );
    expect(response.status, role).toBe(
      role === "admin" || role === "trainer" ? 200 : 403,
    );
    if (response.status === 200) {
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.items)).toBe(true);
    }
  }
  const noToken = await tnaApiRequest(
    app,
    `http://localhost/api/v1/tna/parameters?${query}`,
    {},
  );
  expect(noToken.status).toBe(401);
  const invalid = await tnaApiRequest(
    app,
    "http://localhost/api/v1/tna/parameters",
    {
      headers: { Authorization: `Bearer ${users.trainer!.token}` },
    },
  );
  expect(invalid.status).toBe(400);
});

test("mutation RPCs stay callable by client roles and helpers stay private", async () => {
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const signature of MUTATION_FUNCTIONS) {
      expect(
        sqlOne(
          fixture.env,
          `SELECT has_function_privilege('${role}', 'public.${signature}', 'EXECUTE');`,
        ),
        `${role} EXECUTE ${signature}`,
      ).toBe("t");
    }
  }
  // Only the five guarded entry points may live in the exposed schema.
  expect(
    runSql(
      fixture.env,
      `SELECT p.oid::regprocedure FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'tna\\_%';`,
    )
      .split("\n")
      .map((line) => line.replace(/^public\./, "").replaceAll(" ", ""))
      .sort(),
  ).toEqual(
    MUTATION_FUNCTIONS.map((s) =>
      s.replace("timestamptz", "timestampwithtimezone"),
    ).sort(),
  );
  for (const role of ["anon", "authenticated"]) {
    expect(
      sqlOne(
        fixture.env,
        `SELECT has_schema_privilege('${role}', 'tna_internal', 'USAGE');`,
      ),
      `${role} USAGE tna_internal`,
    ).toBe("f");
  }
});

test("real JWT reads fixture substrate; TNA tables deny direct DML and RPC", async () => {
  for (const role of ["admin", "trainer"]) {
    for (const [table, ids] of [
      ["qa_temuan", fixture.ids.findings],
      ["qa_periods", fixture.ids.periods],
      ["profiler_peserta", fixture.ids.participants],
    ] as const) {
      const result = await client(role)
        .from(table)
        .select("id")
        .in("id", [...ids]);
      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(ids.length);
    }
  }
  const need = await admin.rpc("tna_create_need", {
    p_actor_id: users.trainer!.userId,
    p_payload: {
      service_type: "chat",
      period_id: fixture.ids.periods[2],
      indicator_id: fixture.ids.indicators[0],
      compare_count: 2,
      validation_snapshot: { metric_version: 1, findings: 3 },
      validated_cluster_id: "kurang_menggali",
      cause_note: "Catatan sintetis untuk validasi",
      gap_type: "skill",
      outcome: "training",
    },
  });
  expect(need.error).toBeNull();
  needId = need.data.id;
  const programs = await client("trainer")
    .from("tna_programs")
    .select("*")
    .eq("code", "effective-probing")
    .single();
  expect(programs.error).toBeNull();
  const plan = await admin.rpc("tna_create_plan", {
    p_actor_id: users.trainer!.userId,
    p_plan: {
      need_id: needId,
      program_id: programs.data!.id,
      title: "Rencana sintetis",
      intervention_type: "kelas",
      start_date: "2099-04-01",
      end_date: "2099-04-02",
      evaluation_due_date: "2099-05-02",
      target_max_rate_per_100: 5,
      target_max_spread_pct: 10,
    },
    p_participants: [{ peserta_id: fixture.ids.participants[0] }],
  });
  expect(plan.error).toBeNull();
  planId = plan.data.id;
  for (const table of [
    "tna_programs",
    "tna_needs",
    "tna_plans",
    "tna_plan_participants",
  ]) {
    const visible = await client("trainer").from(table).select("*");
    expect(visible.error).toBeNull();
    expect(visible.data!.length).toBeGreaterThan(0);
    const row = visible.data!.find(
      (r: { id: string; plan_id?: string }) =>
        table === "tna_programs" ||
        r.id === needId ||
        r.id === planId ||
        r.plan_id === planId,
    );
    expect(row).toBeDefined();
    for (const role of ["admin", "trainer", "leader", "agent"]) {
      const db = client(role);
      const read = await db.from(table).select("id");
      expect(read.error).toBeNull();
      if (role === "leader" || role === "agent") expect(read.data).toEqual([]);
      for (const mutation of [
        () => db.from(table).insert({ ...row, id: randomUUID() }),
        () => db.from(table).update({ id: randomUUID() }).eq("id", row.id),
        () => db.from(table).delete().eq("id", row.id),
      ]) {
        const result = await mutation();
        expect(result.error?.code, `${role} ${table}`).toBe("42501");
      }
    }
  }
  const rpcArgs = {
    tna_create_need: { p_actor_id: users.trainer!.userId, p_payload: {} },
    tna_create_plan: {
      p_actor_id: users.trainer!.userId,
      p_plan: {},
      p_participants: [],
    },
    tna_update_draft_plan: {
      p_actor_id: users.trainer!.userId,
      p_plan_id: planId,
      p_expected_updated_at: plan.data.updated_at,
      p_plan: {},
      p_participants: null,
    },
    tna_activate_plan: {
      p_actor_id: users.trainer!.userId,
      p_plan_id: planId,
      p_expected_updated_at: plan.data.updated_at,
      p_baseline: {},
      p_participant_baselines: [],
    },
    tna_cancel_plan: {
      p_actor_id: users.trainer!.userId,
      p_plan_id: planId,
      p_expected_updated_at: plan.data.updated_at,
    },
  };
  const before = {
    postmaster: checkpointerStart(),
    plan: sqlOne(
      fixture.env,
      `SELECT status || '|' || updated_at FROM tna_plans WHERE id='${planId}';`,
    ),
    needs: sqlOne(fixture.env, "SELECT count(*) FROM tna_needs;"),
  };
  for (const role of ["anon", "admin", "trainer", "leader", "agent"]) {
    for (const [fn, args] of Object.entries(rpcArgs)) {
      const result = await client(role).rpc(fn, args);
      expect(result.error?.code, `${role} ${fn}`).toBe("42501");
      expect(result.error?.message, `${role} ${fn}`).toBe("TNA_FORBIDDEN");
    }
  }
  // Rejection is a normal error: no recovery cycle, no state change.
  expect(checkpointerStart()).toBe(before.postmaster);
  expect(
    sqlOne(
      fixture.env,
      `SELECT status || '|' || updated_at FROM tna_plans WHERE id='${planId}';`,
    ),
  ).toBe(before.plan);
  expect(sqlOne(fixture.env, "SELECT count(*) FROM tna_needs;")).toBe(
    before.needs,
  );
  // Helpers are unreachable through the API: the schema is not exposed and the
  // old public helper names no longer exist.
  const privateSchema = await client("trainer")
    .schema("tna_internal")
    .rpc("assert_service_role");
  expect(privateSchema.error?.code).toBe("PGRST106");
  const oldHelper = await client("trainer").rpc("tna_require_actor", {
    p_actor_id: users.trainer!.userId,
  });
  expect(oldHelper.error?.code).toBe("PGRST202");
  // No actor spoofing through the service-only boundary either.
  const forgedActor = await admin.rpc("tna_create_need", {
    p_actor_id: users.leader!.userId,
    p_payload: {},
  });
  expect(forgedActor.error?.message).toBe("TNA_ACTOR_FORBIDDEN");
  expect(
    sqlOne(
      fixture.env,
      `SELECT count(*) FROM tna_plan_participants WHERE plan_id='${planId}';`,
    ),
  ).toBe("1");
});
