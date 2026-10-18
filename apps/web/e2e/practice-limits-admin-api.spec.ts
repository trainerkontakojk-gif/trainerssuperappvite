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
import { tnaApiRequest } from "./helpers/tnaApi";

// Real local Supabase + production API app: editing daily practice limits and
// approving an account with its role and participant. Plan:
// plans/markdown/kontrol-user-fase-4.md. Rules are global, so the spec runs
// serially and puts the seeded rules back afterwards.

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = `limits-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const users: Record<
  "admin" | "trainer" | "agent" | "otherTrainer" | "pending",
  Identity
> = {} as never;
let app: Hono;
let pesertaId = "";
let savedRules = "";

async function api(
  who: Identity,
  path: string,
  method = "GET",
  body?: unknown,
) {
  const response = await tnaApiRequest(app, `http://localhost/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${who.token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

const wibDay = (offsetDays = 0) =>
  new Date(Date.now() + 7 * 3600_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

test.beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    VITE_SUPABASE_URL: env.apiUrl,
    VITE_SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_URL: env.apiUrl,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    GEMINI_API_KEY: "e2e-only",
    OPENAI_API_KEY: "e2e-only",
  });
  installLoopbackFetchGuard();
  savedRules = runSql(
    env,
    `SELECT json_agg(r) FROM (SELECT module, role, daily_limit FROM practice_limit_rules) r;`,
  );
  users.admin = await createUserWithJwt(env, "admin", ns);
  users.trainer = await createUserWithJwt(env, "trainer", ns);
  users.otherTrainer = await createUserWithJwt(env, "trainer", `${ns}-b`);
  users.agent = await createUserWithJwt(env, "agent", ns);
  users.pending = await createUserWithJwt(env, "agent", `${ns}-new`);
  runSql(
    env,
    `UPDATE profiles SET status='pending', full_name='Yoga ${ns}' WHERE id='${users.pending.userId}';`,
  );
  const year = new Date().getFullYear();
  const yearId = sqlOne(
    env,
    `WITH ins AS (INSERT INTO profiler_years (year, label) VALUES (${year}, 'E2E ${year}') ON CONFLICT (year) DO NOTHING RETURNING id)
     SELECT id FROM ins UNION ALL SELECT id FROM profiler_years WHERE year=${year} LIMIT 1;`,
  );
  runSql(
    env,
    `INSERT INTO profiler_folders (name, year_id) VALUES ('Batch ${ns}', '${yearId}');`,
  );
  pesertaId = sqlOne(
    env,
    `INSERT INTO profiler_peserta (batch_name, nama, tim, jabatan, email_ojk)
     VALUES ('Batch ${ns}', 'Yoga ${ns}', 'Tim Call', 'Agent', '${users.pending.email}')
     RETURNING id;`,
  );
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (savedRules)
    runSql(
      env,
      `UPDATE practice_limit_rules r SET daily_limit = s.daily_limit, updated_by = NULL
       FROM json_to_recordset('${savedRules}') AS s(module text, role text, daily_limit int)
       WHERE r.module = s.module AND r.role = s.role;`,
    );
  if (pesertaId)
    runSql(env, `DELETE FROM profiler_peserta WHERE id='${pesertaId}';`);
  runSql(env, `DELETE FROM profiler_folders WHERE name='Batch ${ns}';`);
  const admin = createAdmin(env);
  for (const who of Object.values(users)) {
    await admin.from("activity_logs").delete().eq("user_id", who.userId);
    await admin.auth.admin.deleteUser(who.userId);
  }
});

test("trainers and admins read and change the role rules; agents cannot", async () => {
  expect((await api(users.agent, "/admin/practice-limits")).status).toBe(403);
  expect(
    (
      await api(users.agent, "/admin/practice-limits/rules", "PUT", {
        rules: [{ module: "ketik", role: "agent", daily_limit: 9 }],
      })
    ).status,
  ).toBe(403);

  const overview = await api(users.trainer, "/admin/practice-limits");
  expect(overview.status, JSON.stringify(overview.body)).toBe(200);
  const rule = (module: string, role: string) =>
    overview.body.data.rules.find(
      (r: { module: string; role: string }) =>
        r.module === module && r.role === role,
    );
  expect(rule("ketik", "trainer").daily_limit).toBeNull();
  expect(overview.body.data.today.started).toEqual(
    expect.objectContaining({ ketik: expect.any(Number) }),
  );

  // Trainer and admin rules are not editable: always unlimited.
  expect(
    (
      await api(users.trainer, "/admin/practice-limits/rules", "PUT", {
        rules: [{ module: "ketik", role: "trainer", daily_limit: 1 }],
      })
    ).status,
  ).toBe(400);

  const saved = await api(
    users.trainer,
    "/admin/practice-limits/rules",
    "PUT",
    {
      rules: [
        { module: "ketik", role: "agent", daily_limit: 5 },
        { module: "telefun", role: "leader", daily_limit: null },
      ],
    },
  );
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const after = await api(users.admin, "/admin/practice-limits");
  const changed = after.body.data.rules.find(
    (r: { module: string; role: string }) =>
      r.module === "ketik" && r.role === "agent",
  );
  expect(changed).toMatchObject({
    daily_limit: 5,
    updated_by_name: "E2E trainer",
  });

  // The new rule is what the agent sees, and the change is logged.
  const quota = await api(users.agent, "/me/practice-quota");
  expect(
    quota.body.data.find((e: { module: string }) => e.module === "ketik"),
  ).toMatchObject({ limit: 5, source: "role" });
  expect(
    runSql(
      env,
      `SELECT action FROM activity_logs WHERE user_id='${users.trainer.userId}' AND type='practice_rules' ORDER BY created_at DESC LIMIT 1;`,
    ),
  ).toBe(
    "Mengubah aturan batas latihan: KETIK Agent 3 per hari menjadi 5 per hari; Telefun Leader Tutup menjadi Tanpa batas",
  );
});

test("a per-user exception with an end date wins, shows on the user page and the list, and can be returned to the role rule", async () => {
  const path = `/admin/users/${users.agent.userId}/practice-limits/telefun`;
  // An end date in the past is refused; so is an exception for a trainer.
  expect(
    (
      await api(users.trainer, path, "PUT", {
        daily_limit: 2,
        ends_on: wibDay(-1),
        note: null,
      })
    ).status,
  ).toBe(400);
  const forTrainer = await api(
    users.trainer,
    `/admin/users/${users.otherTrainer.userId}/practice-limits/telefun`,
    "PUT",
    { daily_limit: 2, ends_on: null, note: null },
  );
  expect(forTrainer.status).toBe(400);
  expect(forTrainer.body.error.message).toContain("tanpa batas");

  const until = wibDay(7);
  const set = await api(users.trainer, path, "PUT", {
    daily_limit: 2,
    ends_on: until,
    note: "Persiapan sertifikasi",
  });
  expect(set.status, JSON.stringify(set.body)).toBe(200);

  const quota = await api(users.agent, "/me/practice-quota");
  expect(
    quota.body.data.find((e: { module: string }) => e.module === "telefun"),
  ).toMatchObject({ limit: 2, source: "override", ends_on: until });

  const detail = await api(users.trainer, `/admin/users/${users.agent.userId}`);
  expect(detail.status, JSON.stringify(detail.body)).toBe(200);
  expect(
    detail.body.data.practice_limits.find(
      (e: { module: string }) => e.module === "telefun",
    ),
  ).toMatchObject({
    limit: 2,
    role_limit: 0,
    source: "override",
    ends_on: until,
    note: "Persiapan sertifikasi",
  });
  expect(detail.body.data.history[0].action).toContain(
    "Mengubah batas Telefun E2E agent menjadi 2 per hari sampai",
  );

  const list = await api(users.trainer, "/admin/users");
  expect(
    list.body.data.find((u: { id: string }) => u.id === users.agent.userId)
      .practice_overrides,
  ).toEqual([{ module: "telefun", daily_limit: 2, ends_on: until }]);
  const overview = await api(users.trainer, "/admin/practice-limits");
  expect(
    overview.body.data.overrides.find(
      (o: { user_id: string }) => o.user_id === users.agent.userId,
    ),
  ).toMatchObject({
    module: "telefun",
    daily_limit: 2,
    user_role: "agent",
    note: "Persiapan sertifikasi",
    updated_by_name: "E2E trainer",
  });

  // An exception that ended yesterday is no longer listed or applied.
  runSql(
    env,
    `UPDATE practice_limit_overrides SET ends_on='${wibDay(-1)}' WHERE user_id='${users.agent.userId}';`,
  );
  const ended = await api(users.trainer, "/admin/practice-limits");
  expect(
    ended.body.data.overrides.some(
      (o: { user_id: string }) => o.user_id === users.agent.userId,
    ),
  ).toBe(false);

  expect((await api(users.trainer, path, "DELETE")).status).toBe(200);
  expect(
    runSql(
      env,
      `SELECT count(*) FROM practice_limit_overrides WHERE user_id='${users.agent.userId}';`,
    ),
  ).toBe("0");
});

test("approving sets the role, links the participant, then activates; it cannot be repeated", async () => {
  const options = await api(
    users.trainer,
    `/admin/peserta-options?user_id=${users.pending.userId}`,
  );
  expect(options.body.data[0]).toMatchObject({
    id: pesertaId,
    email_match: true,
  });

  // A trainer cannot approve someone as admin.
  const asAdmin = await api(
    users.trainer,
    `/admin/users/${users.pending.userId}/approve`,
    "POST",
    { role: "admin", peserta_id: null },
  );
  expect(asAdmin.status).toBe(403);
  expect(
    runSql(
      env,
      `SELECT role||'/'||status FROM profiles WHERE id='${users.pending.userId}';`,
    ),
  ).toBe("agent/pending");

  const approved = await api(
    users.trainer,
    `/admin/users/${users.pending.userId}/approve`,
    "POST",
    { role: "leader", peserta_id: pesertaId },
  );
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
  expect(
    runSql(
      env,
      `SELECT role||'/'||status FROM profiles WHERE id='${users.pending.userId}';`,
    ),
  ).toBe("leader/active");
  expect(
    runSql(
      env,
      `SELECT akun_id FROM profiler_peserta WHERE id='${pesertaId}';`,
    ),
  ).toBe(users.pending.userId);

  const again = await api(
    users.trainer,
    `/admin/users/${users.pending.userId}/approve`,
    "POST",
    { role: "agent", peserta_id: null },
  );
  expect(again.status).toBe(409);
});
