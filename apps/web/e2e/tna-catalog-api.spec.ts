import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import type { TnaPlan, TnaPlanDetail, TnaProgram } from "@trainers/types";
import { tnaApiRequest } from "./helpers/tnaApi";
import { createTnaFixture } from "./helpers/tnaFixture";
import {
  createAdmin,
  createUserWithJwt,
  runSql,
} from "./helpers/sidakRealBackend";

// TNA phase 5 T2 (plans/markdown/tna-phase-5.md D25, K32-K36, P-1-P-4):
// catalog API on the real local backend. Seed programs are never changed;
// every program here is a fixture with a unique code (P-4).
test.describe.configure({ mode: "serial" });

const namespace = randomUUID();
const suffix = namespace.slice(0, 8);
const fixture = createTnaFixture(namespace);
const admin = createAdmin(fixture.env);
let users: Awaited<ReturnType<typeof fixture.seed>>;
let app: Hono;
const denied: Awaited<ReturnType<typeof createUserWithJwt>>[] = [];
const createdPrograms: string[] = [];
let codeCounter = 0;

type CatalogProgram = TnaProgram & { plan_count: number };
type Detail = TnaPlanDetail & {
  program: {
    code: string;
    name: string;
    gap_type: string;
    source: "snapshot" | "catalog";
  };
};

async function call<T = TnaProgram>(
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

function sql(query: string) {
  try {
    return runSql(fixture.env, query);
  } catch {
    throw new Error("TNA SQL probe failed; raw command suppressed");
  }
}

function programBody(overrides: Record<string, unknown> = {}) {
  codeCounter += 1;
  return {
    code: `uji-api-${suffix}-${codeCounter}`,
    name: "Program uji API katalog",
    description: "Program sintetis untuk uji API katalog TNA.",
    gap_type: "skill",
    trigger_clusters: ["hold_waktu_tunggu"],
    service_types: ["call"],
    suggested_modules: ["telefun"],
    ...overrides,
  };
}

async function createProgram(
  overrides: Record<string, unknown> = {},
  token = users.trainer.token,
) {
  const result = await call("/programs", "POST", programBody(overrides), token);
  if (result.status === 201) createdPrograms.push(result.data.id);
  return result;
}

function activityCount(action: string) {
  return sql(
    `SELECT count(*) FROM activity_logs WHERE module='tna' AND action = '${action}';`,
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
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  // Plans first (cascade), then needs, then the fixture programs.
  sql(
    `DELETE FROM tna_plans WHERE need_id IN (SELECT id FROM tna_needs WHERE period_id IN ('${fixture.ids.periods.join("','")}'));
     DELETE FROM tna_needs WHERE period_id IN ('${fixture.ids.periods.join("','")}');`,
  );
  if (createdPrograms.length)
    sql(
      `DELETE FROM tna_programs WHERE id IN ('${createdPrograms.join("','")}');`,
    );
  for (const user of denied)
    expect((await admin.auth.admin.deleteUser(user.userId)).error).toBeNull();
  await fixture.cleanup();
});

test("create validates against the code registries, owns server fields, and logs", async () => {
  const created = await createProgram({
    name: "  Program uji API katalog  ",
    trigger_clusters: ["hold_waktu_tunggu", "komunikasi_layanan"],
    service_types: ["call", "chat"],
    suggested_modules: ["ketik", "telefun"],
  });
  expect(created.status).toBe(201);
  expect(created.data).toMatchObject({
    name: "Program uji API katalog",
    is_active: true,
    trigger_clusters: ["hold_waktu_tunggu", "komunikasi_layanan"],
    service_types: ["call", "chat"],
    suggested_modules: ["ketik", "telefun"],
    created_by: users.trainer.userId,
  });
  expect(
    activityCount(`Menambah program TNA: ${created.data.code}`),
    "creation logged",
  ).toBe("1");

  const duplicate = await call(
    "/programs",
    "POST",
    programBody({ code: created.data.code }),
  );
  expect(duplicate.status).toBe(409);
  expect(duplicate.error?.code).toBe("TNA_PROGRAM_CODE_EXISTS");

  for (const override of [
    { trigger_clusters: ["bukan_klaster"] },
    { service_types: ["fax"] },
    { suggested_modules: ["efek"] },
    { trigger_clusters: ["hold_waktu_tunggu", "hold_waktu_tunggu"] },
    { code: "Kode Besar" },
    { name: "ab" },
    { description: "pendek" },
    { gap_type: "lain" },
    { is_active: false },
    { created_by: users.admin.userId },
  ]) {
    const result = await call("/programs", "POST", programBody(override));
    expect(result.status, JSON.stringify(override)).toBe(422);
    expect(result.error?.code, JSON.stringify(override)).toBe(
      "TNA_INVALID_PROGRAM",
    );
  }
  expect(
    sql(
      `SELECT count(*) FROM tna_programs WHERE code LIKE 'uji-api-${suffix}-%';`,
    ),
    "only the valid program was stored",
  ).toBe("1");
});

test("catalog list includes inactive programs with plan counts; the default list stays active-only", async () => {
  const program = (await createProgram()).data;
  const off = await call(`/programs/${program.id}/active`, "POST", {
    active: false,
    expected_updated_at: program.updated_at,
  });
  expect(off.status).toBe(200);
  expect(off.data.is_active).toBe(false);
  expect(activityCount(`Menonaktifkan program TNA: ${program.code}`)).toBe("1");

  const active = await call<TnaProgram[]>("/programs");
  expect(active.status).toBe(200);
  expect(active.data.some((p) => p.id === program.id)).toBe(false);
  expect(active.data.every((p) => p.is_active)).toBe(true);
  expect(active.data[0]).not.toHaveProperty("plan_count");

  const catalog = await call<CatalogProgram[]>("/programs?include_inactive=1");
  expect(catalog.status).toBe(200);
  const row = catalog.data.find((p) => p.id === program.id);
  expect(row).toMatchObject({ is_active: false, plan_count: 0 });
  const seed = catalog.data.find((p) => p.code === "effective-probing");
  expect(seed?.plan_count).toBe(
    Number(
      sql(
        "SELECT count(*) FROM tna_plans WHERE program_id=(SELECT id FROM tna_programs WHERE code='effective-probing');",
      ),
    ),
  );

  const stale = await call(`/programs/${program.id}/active`, "POST", {
    active: true,
    expected_updated_at: program.updated_at,
  });
  expect(stale.status).toBe(409);
  expect(stale.error?.code).toBe("TNA_PROGRAM_STALE");
  const on = await call(`/programs/${program.id}/active`, "POST", {
    active: true,
    expected_updated_at: off.data.updated_at,
  });
  expect(on.status).toBe(200);
  expect(on.data.is_active).toBe(true);
  expect(activityCount(`Mengaktifkan program TNA: ${program.code}`)).toBe("1");
});

test("PATCH edits fields with a fresh revision and rejects code, stale, unknown, and empty edits", async () => {
  const program = (await createProgram()).data;
  const edited = await call(`/programs/${program.id}`, "PATCH", {
    expected_updated_at: program.updated_at,
    name: "Program uji API diubah",
    trigger_clusters: ["proses_ideb_slik"],
    service_types: [],
    suggested_modules: [],
  });
  expect(edited.status).toBe(200);
  expect(edited.data).toMatchObject({
    code: program.code,
    name: "Program uji API diubah",
    trigger_clusters: ["proses_ideb_slik"],
    service_types: [],
    suggested_modules: [],
    updated_by: users.trainer.userId,
  });
  expect(activityCount(`Mengubah program TNA: ${program.code}`)).toBe("1");

  const cases: Array<[string, unknown, number, string]> = [
    [
      program.id,
      { expected_updated_at: program.updated_at, name: "Nama basi program" },
      409,
      "TNA_PROGRAM_STALE",
    ],
    [
      program.id,
      { expected_updated_at: edited.data.updated_at, code: "kode-baru-api" },
      422,
      "TNA_INVALID_PROGRAM",
    ],
    [
      program.id,
      { expected_updated_at: edited.data.updated_at },
      422,
      "TNA_INVALID_PROGRAM",
    ],
    [
      program.id,
      {
        expected_updated_at: edited.data.updated_at,
        trigger_clusters: ["bukan_klaster"],
      },
      422,
      "TNA_INVALID_PROGRAM",
    ],
    [
      randomUUID(),
      { expected_updated_at: edited.data.updated_at, name: "Program hilang" },
      404,
      "TNA_PROGRAM_NOT_FOUND",
    ],
  ];
  for (const [id, body, status, code] of cases) {
    const result = await call(`/programs/${id}`, "PATCH", body);
    expect(result.status, JSON.stringify(body)).toBe(status);
    expect(result.error?.code, JSON.stringify(body)).toBe(code);
  }
  const badId = await call("/programs/bukan-uuid", "PATCH", {
    expected_updated_at: edited.data.updated_at,
    name: "Program apa pun",
  });
  expect(badId.status).toBe(400);
  expect(sql(`SELECT name FROM tna_programs WHERE id='${program.id}';`)).toBe(
    "Program uji API diubah",
  );
});

test("coverage lists clusters no active program triggers, never lainnya", async () => {
  const before = await call<{ uncovered_clusters: string[] }>(
    "/programs/coverage",
  );
  expect(before.status).toBe(200);
  expect(before.data.uncovered_clusters).not.toContain("lainnya");
  expect(before.data.uncovered_clusters).not.toContain("kurang_menggali");
  const target = "proses_ideb_slik";
  const startsUncovered = before.data.uncovered_clusters.includes(target);

  const program = (
    await createProgram({ trigger_clusters: [target, "lainnya"] })
  ).data;
  const covered = await call<{ uncovered_clusters: string[] }>(
    "/programs/coverage",
  );
  expect(covered.data.uncovered_clusters).not.toContain(target);
  expect(covered.data.uncovered_clusters).not.toContain("lainnya");

  const off = await call(`/programs/${program.id}/active`, "POST", {
    active: false,
    expected_updated_at: program.updated_at,
  });
  expect(off.status).toBe(200);
  const after = await call<{ uncovered_clusters: string[] }>(
    "/programs/coverage",
  );
  expect(after.data.uncovered_clusters.includes(target)).toBe(startsUncovered);
});

test("plans keep the program snapshot after a rename; drafts show the current catalog name", async () => {
  const program = (
    await createProgram({
      name: "Program snapshot awal",
      trigger_clusters: ["kurang_menggali"],
      service_types: [],
    })
  ).data;
  const need = await call<{ id: string }>("/needs", "POST", {
    service_type: "chat",
    period_id: fixture.ids.periods[2],
    indicator_id: fixture.ids.metricsIndicators.alpha,
    compare_count: 2,
    validated_cluster_id: "kurang_menggali",
    cause_note: "Trainer memvalidasi tiket untuk rencana katalog.",
    gap_type: "skill",
    outcome: "training",
  });
  expect(need.status).toBe(201);
  const plan = await call<TnaPlan>("/plans", "POST", {
    need_id: need.data.id,
    program_id: program.id,
    title: "Rencana snapshot program",
    intervention_type: "kelas",
    start_date: "2099-06-01",
    end_date: "2099-06-02",
    evaluation_due_date: "2099-07-02",
    target_max_rate_per_100: 1,
    target_max_spread_pct: 10,
    participant_peserta_ids: [
      fixture.ids.participants[0],
      fixture.ids.participants[1],
    ],
  });
  expect(plan.status).toBe(201);

  const draftDetail = await call<Detail>(`/plans/${plan.data.id}`);
  expect(draftDetail.data.program).toEqual({
    code: program.code,
    name: "Program snapshot awal",
    gap_type: "skill",
    source: "catalog",
  });

  const activated = await call<TnaPlan>(
    `/plans/${plan.data.id}/activate`,
    "POST",
    { expected_updated_at: plan.data.updated_at },
  );
  expect(activated.status).toBe(200);
  expect(activated.data.program_snapshot).toEqual({
    code: program.code,
    name: "Program snapshot awal",
    gap_type: "skill",
  });

  const renamed = await call(`/programs/${program.id}`, "PATCH", {
    expected_updated_at: program.updated_at,
    name: "Program snapshot baru",
    gap_type: "proses",
  });
  expect(renamed.status).toBe(200);

  const detail = await call<Detail>(`/plans/${plan.data.id}`);
  expect(detail.status).toBe(200);
  expect(detail.data.program).toEqual({
    code: program.code,
    name: "Program snapshot awal",
    gap_type: "skill",
    source: "snapshot",
  });
  expect(detail.data.narrative).toContain("Program snapshot awal");
  expect(detail.data.narrative).not.toContain("Program snapshot baru");

  // A program in use can be deactivated; the plan stays readable.
  const off = await call(`/programs/${program.id}/active`, "POST", {
    active: false,
    expected_updated_at: renamed.data.updated_at,
  });
  expect(off.status).toBe(200);
  expect((await call<Detail>(`/plans/${plan.data.id}`)).status).toBe(200);
});

test("catalog endpoints admit admin and trainer only", async () => {
  const program = (await createProgram({}, users.admin.token)).data;
  expect(program.created_by).toBe(users.admin.userId);
  const operations: Array<[string, string, unknown?]> = [
    ["/programs?include_inactive=1", "GET"],
    ["/programs/coverage", "GET"],
    ["/programs", "POST", programBody()],
    [
      `/programs/${program.id}`,
      "PATCH",
      { expected_updated_at: program.updated_at, name: "Diubah role lain" },
    ],
    [
      `/programs/${program.id}/active`,
      "POST",
      { active: false, expected_updated_at: program.updated_at },
    ],
  ];
  for (const user of denied) {
    for (const [path, method, body] of operations) {
      const result = await call(path, method, body, user.token);
      expect(result.status, `${method} ${path}`).toBe(403);
    }
  }
  for (const [path, method, body] of operations) {
    const result = await call(path, method, body, null);
    expect(result.status, `anon ${method} ${path}`).toBe(401);
  }
  expect(
    sql(
      `SELECT name || '|' || is_active FROM tna_programs WHERE id='${program.id}';`,
    ),
  ).toBe("Program uji API katalog|true");
});
