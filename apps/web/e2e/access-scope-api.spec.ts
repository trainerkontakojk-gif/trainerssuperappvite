import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Hono } from "hono";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

const env = readLoopbackEnv();
installLoopbackFetchGuard();
const admin = createAdmin(env);
const suffix = randomUUID();
const batch = `access-${suffix}`;
const users: Record<string, Awaited<ReturnType<typeof createUserWithJwt>>> = {};
const participantIds: string[] = [];
let folderId = "";
let groupId = "";
let indicatorId = "";
let periodId = "";
let createdPeriod = false;
let app: Hono;

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  for (const role of ["admin", "trainer", "leader", "agent"] as const)
    users[role] = await createUserWithJwt(env, role, suffix);
  users.empty = await createUserWithJwt(env, "leader", `${suffix}-empty`);
  folderId = sqlOne(
    env,
    `INSERT INTO profiler_folders(name) VALUES ('${batch}') RETURNING id;`,
  );
  for (const [name, linkedUser] of [
    ["Inside", users.agent!.userId],
    ["Outside", null],
  ] as const) {
    participantIds.push(
      sqlOne(
        env,
        `INSERT INTO profiler_peserta(batch_name,nama,tim,jabatan,nomor_urut,trainer_id)
      VALUES ('${batch}','${name}','Chat','Agent',${participantIds.length + 1},${linkedUser ? `'${linkedUser}'` : "NULL"}) RETURNING id;`,
      ),
    );
  }
  indicatorId = sqlOne(
    env,
    `INSERT INTO qa_indicators(service_type,name,bobot) VALUES ('chat','${batch}',1) RETURNING id;`,
  );
  periodId = sqlOne(
    env,
    "SELECT COALESCE((SELECT id::text FROM qa_periods WHERE year=2026 AND month=10),'missing');",
  );
  if (periodId === "missing") {
    periodId = sqlOne(
      env,
      "INSERT INTO qa_periods(year,month) VALUES (2026,10) RETURNING id;",
    );
    createdPeriod = true;
  }
  for (const id of participantIds)
    runSql(
      env,
      `INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,nilai,tahun,no_tiket,tanggal_layanan,tanggal_sampel)
    VALUES ('${id}','${periodId}','${indicatorId}','chat',1,2026,'${suffix}', '2026-10-06', '2026-10-06');`,
    );
  groupId = sqlOne(
    env,
    `INSERT INTO access_groups(name) VALUES ('${batch}') RETURNING id;`,
  );
  runSql(
    env,
    `INSERT INTO access_group_items(access_group_id,field_name,field_value) VALUES
    ('${groupId}','peserta_id','${participantIds[0]}'), ('${groupId}','service_type','chat');
    WITH request AS (INSERT INTO leader_access_requests(leader_user_id,module,status)
      VALUES ('${users.leader!.userId}','all','approved') RETURNING id)
    INSERT INTO leader_access_request_groups(request_id,access_group_id) SELECT id,'${groupId}' FROM request;`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (groupId) runSql(env, `DELETE FROM access_groups WHERE id='${groupId}';`);
  if (participantIds.length)
    runSql(
      env,
      `DELETE FROM profiler_peserta WHERE id IN (${participantIds.map((id) => `'${id}'`).join(",")});`,
    );
  if (indicatorId)
    runSql(env, `DELETE FROM qa_indicators WHERE id='${indicatorId}';`);
  if (createdPeriod)
    runSql(env, `DELETE FROM qa_periods WHERE id='${periodId}';`);
  if (folderId)
    runSql(env, `DELETE FROM profiler_folders WHERE id='${folderId}';`);
  for (const user of Object.values(users)) {
    const result = await admin.auth.admin.deleteUser(user.userId);
    if (result.error) throw result.error;
  }
});

async function get(role: string, path: string) {
  const response = await app.request(`http://localhost/api${path}`, {
    headers: { authorization: `Bearer ${users[role]!.token}` },
  });
  return { status: response.status, body: await response.json() };
}

test("real JWT + production auth middleware admits each supported role", async () => {
  for (const role of ["admin", "trainer", "leader", "agent"]) {
    const result = await get(role, "/v1/me");
    expect(result.status).toBe(200);
    expect(result.body.data.profile.role).toBe(role);
  }
});

test("leader without scope sees no participants in each participant resource", async () => {
  for (const path of [
    "/v1/sidak/agents",
    `/v1/sidak/folders/${batch}/agents`,
    "/v1/sidak/temuan",
    "/v1/profiler/peserta",
  ]) {
    const result = await get("empty", path);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const items = Array.isArray(result.body.data)
      ? result.body.data
      : (result.body.data.items ?? result.body.data.agents);
    expect(items, path).toEqual([]);
  }
  const heatmap = await get("empty", "/v1/sidak/heatmap?mode=agent&year=2026");
  expect(heatmap.status).toBe(200);
  expect(
    heatmap.body.data.days.every((day: { count: number }) => day.count === 0),
  ).toBe(true);
  const dashboard = await get("empty", "/v1/sidak/dashboard");
  expect(dashboard.status, JSON.stringify(dashboard.body)).toBe(200);
  expect(JSON.stringify(dashboard.body)).not.toContain(participantIds[0]);
  expect(JSON.stringify(dashboard.body)).not.toContain(participantIds[1]);
});

test("approved leader receives only the selected participant", async () => {
  for (const path of [
    `/v1/sidak/folders/${batch}/agents`,
    `/v1/profiler/peserta?batch_name=${batch}`,
  ]) {
    const result = await get("leader", path);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    const items = Array.isArray(result.body.data)
      ? result.body.data
      : (result.body.data.items ?? result.body.data.agents);
    expect(items.map((item: { id: string }) => item.id)).toEqual([
      participantIds[0],
    ]);
  }
  const denied = await get("leader", `/v1/sidak/agents/${participantIds[1]}`);
  expect(denied.status).toBe(403);
});

test("scope RPC failure returns 503 SCOPE_UNAVAILABLE without widening access", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.includes("/rpc/get_leader_scope_snapshot"))
      return Response.json(
        { code: "E2E_SCOPE_FAILURE", message: "Local injected RPC failure" },
        { status: 400 },
      );
    return original(input, init);
  }) as typeof fetch;
  try {
    for (const path of [
      "/v1/sidak/heatmap?mode=agent&year=2026",
      "/v1/sidak/agents",
      "/v1/profiler/peserta",
    ]) {
      const result = await get("leader", path);
      expect(result.status, path).toBe(503);
      expect(result.body.error.code).toBe("SCOPE_UNAVAILABLE");
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("unknown and retired profile roles fail closed through production auth middleware", async () => {
  const original = globalThis.fetch;
  let injectedRole = "unknown";
  globalThis.fetch = (async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const response = await original(input, init);
    if (
      url.includes("/rest/v1/profiles") &&
      url.includes(users.agent!.userId) &&
      response.ok
    ) {
      const profile = await response.json();
      return Response.json(
        Array.isArray(profile)
          ? profile.map((row) => ({ ...row, role: injectedRole }))
          : { ...profile, role: injectedRole },
        { status: response.status, headers: response.headers },
      );
    }
    return response;
  }) as typeof fetch;
  try {
    for (injectedRole of [
      "unknown",
      "qa",
      "tl",
      "spv",
      "om",
      "trainers",
      "agents",
      "leaders",
    ]) {
      const result = await get("agent", "/v1/me");
      expect(result.status, injectedRole).toBe(403);
      expect(result.body.error.code).toBe("FORBIDDEN");
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("agent dashboard contains only findings from the linked participant", async () => {
  const agent = await get(
    "agent",
    "/v1/sidak/dashboard?year=2026&service_type=chat",
  );
  const leader = await get(
    "leader",
    "/v1/sidak/dashboard?year=2026&service_type=chat",
  );
  expect(agent.status, JSON.stringify(agent.body.error)).toBe(200);
  expect(leader.status, JSON.stringify(leader.body.error)).toBe(200);
  expect(agent.body.data.summary.totalAgents).toBe(1);
  expect(agent.body.data.summary.totalDefects).toBeGreaterThan(0);
  expect(agent.body.data.summary.totalDefects).toBe(
    leader.body.data.summary.totalDefects,
  );
});

test("profile role constraint rejects the retired user value", async () => {
  let cleanupError: unknown;
  try {
    const result = await admin
      .from("profiles")
      .update({ role: "user" })
      .eq("id", users.agent!.userId);
    expect(result.error?.code).toBe("23514");
  } finally {
    const restored = await admin
      .from("profiles")
      .update({ role: "agent" })
      .eq("id", users.agent!.userId);
    cleanupError = restored.error;
  }
  expect(cleanupError).toBeNull();
});

test("signup trigger provisions agent with pending approval", async () => {
  const created = await admin.auth.admin.createUser({
    email: `signup-${suffix}@local.test`,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user!.id;
  let cleanupError: unknown;
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("role,status")
      .eq("id", id)
      .single();
    if (error) throw error;
    expect(data).toEqual({ role: "agent", status: "pending" });
  } finally {
    const deleted = await admin.auth.admin.deleteUser(id);
    cleanupError = deleted.error;
  }
  expect(cleanupError).toBeNull();
});

test("admin and trainer retain access to all participants in the fixture batch", async () => {
  for (const role of ["admin", "trainer"]) {
    for (const path of [
      `/v1/sidak/folders/${batch}/agents`,
      `/v1/profiler/peserta?batch_name=${batch}`,
    ]) {
      const result = await get(role, path);
      expect(result.status, JSON.stringify(result.body.error)).toBe(200);
      const items = Array.isArray(result.body.data)
        ? result.body.data
        : (result.body.data.items ?? result.body.data.agents);
      expect(items.map((item: { id: string }) => item.id).sort()).toEqual(
        [...participantIds].sort(),
      );
    }
  }
});

test("agent without a linked participant sees an empty personal dashboard", async () => {
  let cleanupError: unknown;
  const detached = await admin
    .from("profiler_peserta")
    .update({ trainer_id: null })
    .eq("id", participantIds[0]!);
  if (detached.error) throw detached.error;
  try {
    const result = await get(
      "agent",
      "/v1/sidak/dashboard?year=2026&service_type=chat",
    );
    expect(result.status, JSON.stringify(result.body.error)).toBe(200);
    expect(result.body.data.summary.totalAgents).toBe(0);
    expect(result.body.data.summary.totalDefects).toBe(0);
  } finally {
    const restored = await admin
      .from("profiler_peserta")
      .update({ trainer_id: users.agent!.userId })
      .eq("id", participantIds[0]!);
    cleanupError = restored.error;
  }
  expect(cleanupError).toBeNull();
});
