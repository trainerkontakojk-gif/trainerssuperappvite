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

// Real local Supabase + production API app: account-to-participant links,
// the user detail payload, and password reset for user management.

const env = readLoopbackEnv();
installLoopbackFetchGuard();
const admin = createAdmin(env);
const suffix = randomUUID();
const batch = `link-${suffix}`;
const MAILPIT = "http://127.0.0.1:54324";
const users: Record<string, Awaited<ReturnType<typeof createUserWithJwt>>> = {};
const peserta: Record<"rina" | "karina" | "other", string> = {
  rina: "",
  karina: "",
  other: "",
};
let folderId = "";
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
  for (const role of ["admin", "trainer", "agent"] as const)
    users[role] = await createUserWithJwt(env, role, suffix);
  users.agent2 = await createUserWithJwt(env, "agent", `${suffix}-2`);
  folderId = sqlOne(
    env,
    `INSERT INTO profiler_folders(name) VALUES ('${batch}') RETURNING id;`,
  );
  const add = (nama: string, email: string | null, urut: number) =>
    sqlOne(
      env,
      `INSERT INTO profiler_peserta(batch_name,nama,tim,jabatan,nomor_urut,email_ojk)
       VALUES ('${batch}','${nama}','Chat','Agent',${urut},${email ? `'${email}'` : "NULL"}) RETURNING id;`,
    );
  peserta.rina = add(`Rina ${suffix}`, users.agent!.email, 1);
  peserta.karina = add(`Karina ${suffix}`, null, 2);
  peserta.other = add(`Other ${suffix}`, null, 3);
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
  runSql(
    env,
    `INSERT INTO qa_temuan(peserta_id,period_id,indicator_id,service_type,nilai,tahun,no_tiket,tanggal_layanan,tanggal_sampel)
     VALUES ('${peserta.rina}','${periodId}','${indicatorId}','chat',1,2026,'${suffix}','2026-10-06','2026-10-06');`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  runSql(
    env,
    `DELETE FROM activity_logs WHERE target_user_id IN (${Object.values(users)
      .map((u) => `'${u.userId}'`)
      .join(",")});`,
  );
  runSql(env, `DELETE FROM profiler_peserta WHERE batch_name='${batch}';`);
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

async function call(
  role: string,
  method: string,
  path: string,
  json?: unknown,
) {
  const response = await app.request(`http://localhost/api/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${users[role]!.token}`,
      ...(json === undefined ? {} : { "content-type": "application/json" }),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  return { status: response.status, body: await response.json() };
}

const linkedAccount = (id: string) =>
  runSql(
    env,
    `SELECT coalesce(akun_id::text,'') FROM profiler_peserta WHERE id='${id}';`,
  );

test("linking an agent gives the agent its own SIDAK data", async () => {
  const before = await call(
    "agent",
    "GET",
    "/sidak/dashboard?year=2026&service_type=chat",
  );
  expect(before.status, JSON.stringify(before.body)).toBe(200);
  expect(before.body.data.summary.totalAgents).toBe(0);

  const options = await call(
    "admin",
    "GET",
    `/admin/peserta-options?user_id=${users.agent!.userId}`,
  );
  expect(options.status, JSON.stringify(options.body)).toBe(200);
  expect(options.body.data[0]).toMatchObject({
    id: peserta.rina,
    email_match: true,
    linked_user: null,
  });
  // A suggestion only: nothing is linked until someone presses Tautkan.
  expect(linkedAccount(peserta.rina)).toBe("");

  const linked = await call(
    "admin",
    "PUT",
    `/admin/users/${users.agent!.userId}/peserta`,
    { peserta_id: peserta.rina },
  );
  expect(linked.status, JSON.stringify(linked.body)).toBe(200);
  expect(linkedAccount(peserta.rina)).toBe(users.agent!.userId);

  const after = await call(
    "agent",
    "GET",
    "/sidak/dashboard?year=2026&service_type=chat",
  );
  expect(after.body.data.summary.totalAgents).toBe(1);
  expect(after.body.data.summary.totalDefects).toBeGreaterThan(0);

  const list = await call("admin", "GET", "/admin/users");
  const row = list.body.data.find(
    (u: { id: string }) => u.id === users.agent!.userId,
  );
  expect(row.linked_peserta).toMatchObject({
    id: peserta.rina,
    batch_name: batch,
    tim: "Chat",
  });

  const detail = await call(
    "trainer",
    "GET",
    `/admin/users/${users.agent!.userId}`,
  );
  expect(detail.status, JSON.stringify(detail.body)).toBe(200);
  expect(detail.body.data.peserta.id).toBe(peserta.rina);
  expect(detail.body.data.user.email).toBe(users.agent!.email);
  expect(detail.body.data.history[0].action).toContain(`Rina ${suffix}`);

  const profile = await call(
    "trainer",
    "GET",
    `/profiler/peserta/${peserta.rina}/account`,
  );
  expect(profile.status, JSON.stringify(profile.body)).toBe(200);
  expect(profile.body.data).toMatchObject({
    id: users.agent!.userId,
    email: users.agent!.email,
    role: "agent",
  });
});

test("a participant links to one account and an account to one participant", async () => {
  const taken = await call(
    "trainer",
    "PUT",
    `/admin/users/${users.agent2!.userId}/peserta`,
    { peserta_id: peserta.rina },
  );
  expect(taken.status).toBe(409);
  expect(taken.body.error.message).toContain("sudah tertaut");
  expect(linkedAccount(peserta.rina)).toBe(users.agent!.userId);

  const moved = await call(
    "trainer",
    "PUT",
    `/admin/users/${users.agent!.userId}/peserta`,
    { peserta_id: peserta.karina },
  );
  expect(moved.status, JSON.stringify(moved.body)).toBe(200);
  expect(linkedAccount(peserta.rina)).toBe("");
  expect(linkedAccount(peserta.karina)).toBe(users.agent!.userId);

  const unlinked = await call(
    "trainer",
    "DELETE",
    `/admin/users/${users.agent!.userId}/peserta`,
  );
  expect(unlinked.status).toBe(200);
  expect(linkedAccount(peserta.karina)).toBe("");
  const detail = await call(
    "admin",
    "GET",
    `/admin/users/${users.agent!.userId}`,
  );
  expect(detail.body.data.peserta).toBeNull();
});

test("two links racing for one participant: exactly one wins", async () => {
  const results = await Promise.all(
    (["agent", "agent2"] as const).map((who) =>
      call("admin", "PUT", `/admin/users/${users[who]!.userId}/peserta`, {
        peserta_id: peserta.other,
      }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const winner = results[0]!.status === 200 ? "agent" : "agent2";
  expect(linkedAccount(peserta.other)).toBe(users[winner]!.userId);
  await call("admin", "DELETE", `/admin/users/${users[winner]!.userId}/peserta`);
  expect(linkedAccount(peserta.other)).toBe("");
});

test("only admin and trainer link, and a trainer never changes an admin", async () => {
  const agent = await call(
    "agent",
    "PUT",
    `/admin/users/${users.agent2!.userId}/peserta`,
    { peserta_id: peserta.other },
  );
  expect(agent.status).toBe(403);

  const trainerOnAdmin = await call(
    "trainer",
    "PUT",
    `/admin/users/${users.admin!.userId}/peserta`,
    { peserta_id: peserta.other },
  );
  expect(trainerOnAdmin.status).toBe(403);
  const self = await call(
    "trainer",
    "PUT",
    `/admin/users/${users.trainer!.userId}/peserta`,
    { peserta_id: peserta.other },
  );
  expect(self.status).toBe(400);
  expect(linkedAccount(peserta.other)).toBe("");
});

test("the KTP editor cannot set the account link", async () => {
  const response = await call(
    "trainer",
    "PUT",
    `/profiler/peserta/${peserta.other}`,
    {
      keterangan: "diubah",
      akun_id: users.agent2!.userId,
    },
  );
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(linkedAccount(peserta.other)).toBe("");
  expect(
    runSql(
      env,
      `SELECT keterangan FROM profiler_peserta WHERE id='${peserta.other}';`,
    ),
  ).toBe("diubah");
});

test("reset password emails the stored address, not one from the browser", async () => {
  const victim = `someone-else-${suffix}@local.test`;
  const sent = await call(
    "trainer",
    "POST",
    `/admin/users/${users.agent2!.userId}/reset-password`,
    { email: victim },
  );
  expect(sent.status, JSON.stringify(sent.body)).toBe(200);
  expect(sent.body.data.email).toBe(users.agent2!.email);

  const inbox = async (address: string) => {
    const response = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    );
    return ((await response.json()).messages ?? []) as { Subject: string }[];
  };
  await expect
    .poll(async () => (await inbox(users.agent2!.email)).length)
    .toBeGreaterThan(0);
  expect(await inbox(victim)).toHaveLength(0);

  const trainerOnAdmin = await call(
    "trainer",
    "POST",
    `/admin/users/${users.admin!.userId}/reset-password`,
  );
  expect(trainerOnAdmin.status).toBe(403);
  expect(await inbox(users.admin!.email)).toHaveLength(0);
});
