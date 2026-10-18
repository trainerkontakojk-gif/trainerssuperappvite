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

// Real local Supabase + production API app. Plan:
// plans/markdown/kontrol-user-fase-5b.md. An account can get a last day
// (masa aktif); after it the API refuses the account and ends its logins.
// Trainers can approve, limit, set the last day for, or suspend up to 100
// accounts at once, with a result per person.

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = `acct-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const identities: Identity[] = [];
const peserta: string[] = [];
let app: Hono;
let admin: Identity;
let trainer: Identity;

/** Asia/Jakarta day `offset` days from today, as YYYY-MM-DD. */
const wibDay = (offset = 0) =>
  new Date(Date.now() + 7 * 3600_000 + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
const longDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

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

async function user(
  role: "admin" | "trainer" | "leader" | "agent",
  tag: string,
  name?: string,
): Promise<Identity> {
  const who = await createUserWithJwt(env, role, `${ns}-${tag}`);
  identities.push(who);
  if (name)
    runSql(
      env,
      `UPDATE profiles SET full_name='${name}' WHERE id='${who.userId}';`,
    );
  return who;
}

const column = (who: Identity, name: string) =>
  sqlOne(
    env,
    `SELECT coalesce(${name}::text, 'null') FROM profiles WHERE id='${who.userId}';`,
  );
const openLogins = (who: Identity) =>
  Number(
    sqlOne(
      env,
      `SELECT count(*) FROM auth.sessions WHERE user_id='${who.userId}';`,
    ),
  );
const lastLog = (actor: Identity, target: Identity) =>
  sqlOne(
    env,
    `SELECT action FROM activity_logs WHERE user_id='${actor.userId}' AND target_user_id='${target.userId}' ORDER BY created_at DESC LIMIT 1;`,
  );

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
  admin = await user("admin", "admin");
  trainer = await user("trainer", "trainer");
  app = (await import("../../api/src/app")).default as unknown as Hono;
});

test.afterAll(async () => {
  if (peserta.length)
    runSql(
      env,
      `DELETE FROM profiler_peserta WHERE id IN (${peserta.map((id) => `'${id}'`).join(",")});
       DELETE FROM profiler_folders WHERE name='Batch ${ns}';`,
    );
  const db = createAdmin(env);
  for (const who of identities) {
    await db
      .from("practice_limit_overrides")
      .delete()
      .eq("user_id", who.userId);
    await db.from("activity_logs").delete().eq("user_id", who.userId);
    await db.from("activity_logs").delete().eq("target_user_id", who.userId);
    await db.auth.admin.deleteUser(who.userId);
  }
});

test("a trainer sets an account's last day; past days, self and admins are refused", async () => {
  const agent = await user("agent", "until", "Rina Kartika");
  const until = wibDay(30);

  const saved = await api(
    trainer,
    `/admin/users/${agent.userId}/active-until`,
    "PUT",
    {
      active_until: until,
    },
  );
  expect(saved.status).toBe(200);
  expect(column(agent, "active_until")).toBe(until);
  expect(lastLog(trainer, agent)).toBe(
    `Mengubah masa aktif Rina Kartika menjadi sampai ${longDay(until)}`,
  );
  // Today is the last allowed day, so the account still works.
  runSql(
    env,
    `UPDATE profiles SET active_until='${wibDay(0)}' WHERE id='${agent.userId}';`,
  );
  expect((await api(agent, "/me/practice-quota")).status).toBe(200);

  const past = await api(
    trainer,
    `/admin/users/${agent.userId}/active-until`,
    "PUT",
    {
      active_until: wibDay(-1),
    },
  );
  expect(past.status).toBe(400);
  expect(past.body.error.code).toBe("PAST_END_DATE");

  const cleared = await api(
    trainer,
    `/admin/users/${agent.userId}/active-until`,
    "PUT",
    {
      active_until: null,
    },
  );
  expect(cleared.status).toBe(200);
  expect(column(agent, "active_until")).toBe("null");
  expect(lastLog(trainer, agent)).toBe(
    "Mengubah masa aktif Rina Kartika menjadi tanpa batas waktu",
  );

  const self = await api(
    trainer,
    `/admin/users/${trainer.userId}/active-until`,
    "PUT",
    {
      active_until: until,
    },
  );
  expect(self.status).toBe(400);
  const onAdmin = await api(
    trainer,
    `/admin/users/${admin.userId}/active-until`,
    "PUT",
    {
      active_until: until,
    },
  );
  expect(onAdmin.status).toBe(403);
  expect(column(admin, "active_until")).toBe("null");

  // A user cannot extend their own account through the database either.
  runSql(
    env,
    `UPDATE profiles SET active_until='${wibDay(1)}' WHERE id='${agent.userId}';`,
  );
  const { createClient } = await import("@supabase/supabase-js");
  const own = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${agent.token}` } },
  });
  await own
    .from("profiles")
    .update({ active_until: null })
    .eq("id", agent.userId);
  expect(column(agent, "active_until")).toBe(wibDay(1));
});

test("after the last day the account is refused and its logins end; extending lets it back in", async () => {
  const expired = await user("agent", "expired");
  const lastDay = wibDay(-1);
  runSql(
    env,
    `UPDATE profiles SET active_until='${lastDay}' WHERE id='${expired.userId}';`,
  );
  expect(openLogins(expired)).toBe(1);

  const refused = await api(expired, "/me/practice-quota");
  expect(refused.status).toBe(403);
  expect(refused.body.error.code).toBe("ACCOUNT_EXPIRED");
  expect(refused.body.error.message).toBe(
    `Masa aktif akun Anda berakhir ${longDay(lastDay)}. Hubungi trainer Anda untuk memperpanjang.`,
  );
  expect(openLogins(expired)).toBe(0);

  // Extended before its next request: it works again, no re-approval.
  const extended = await user("agent", "extended");
  runSql(
    env,
    `UPDATE profiles SET active_until='${lastDay}' WHERE id='${extended.userId}';`,
  );
  expect(
    (
      await api(
        trainer,
        `/admin/users/${extended.userId}/active-until`,
        "PUT",
        {
          active_until: wibDay(7),
        },
      )
    ).status,
  ).toBe(200);
  expect((await api(extended, "/me/practice-quota")).status).toBe(200);
  expect(column(extended, "status")).toBe("active");
});

test("approving can set the last day at once", async () => {
  const pending = await user("agent", "approve-until");
  runSql(
    env,
    `UPDATE profiles SET status='pending' WHERE id='${pending.userId}';`,
  );
  const until = wibDay(60);
  const approved = await api(
    trainer,
    `/admin/users/${pending.userId}/approve`,
    "POST",
    {
      role: "agent",
      peserta_id: null,
      active_until: until,
    },
  );
  expect(approved.status).toBe(200);
  expect(column(pending, "status")).toBe("active");
  expect(column(pending, "active_until")).toBe(until);

  const other = await user("agent", "approve-past");
  runSql(
    env,
    `UPDATE profiles SET status='pending' WHERE id='${other.userId}';`,
  );
  const past = await api(
    trainer,
    `/admin/users/${other.userId}/approve`,
    "POST",
    {
      role: "agent",
      peserta_id: null,
      active_until: wibDay(-1),
    },
  );
  expect(past.status).toBe(400);
  expect(column(other, "status")).toBe("pending");
});

function seedPeserta(email: string, nama: string): string {
  const id = randomUUID();
  peserta.push(id);
  runSql(
    env,
    `INSERT INTO profiler_folders(name) VALUES ('Batch ${ns}') ON CONFLICT (name) DO NOTHING;
     INSERT INTO profiler_peserta(id,batch_name,nama,tim,jabatan,email_ojk)
     VALUES ('${id}','Batch ${ns}','${nama}','Tim Email','Agent','${email.toUpperCase()}');`,
  );
  return id;
}

test("bulk approve suggests participants by email and reports each person", async () => {
  const budi = await user("agent", "bulk-budi", "Budi Santoso");
  const yoga = await user("agent", "bulk-yoga", "Yoga Pratama");
  const rudi = await user("agent", "bulk-rudi", "Rudi Hartono");
  for (const who of [budi, yoga])
    runSql(
      env,
      `UPDATE profiles SET status='pending' WHERE id='${who.userId}';`,
    );
  const budiPeserta = seedPeserta(budi.email, "Budi Santoso");

  const suggested = await api(
    trainer,
    "/admin/users/bulk-peserta-suggestions",
    "POST",
    {
      user_ids: [budi.userId, yoga.userId],
    },
  );
  expect(suggested.status).toBe(200);
  expect(suggested.body.data).toEqual([
    {
      user_id: budi.userId,
      peserta: {
        id: budiPeserta,
        nama: "Budi Santoso",
        batch_name: `Batch ${ns}`,
        tim: "Tim Email",
      },
    },
    { user_id: yoga.userId, peserta: null },
  ]);

  const until = wibDay(45);
  const result = await api(trainer, "/admin/users/bulk-approve", "POST", {
    user_ids: [budi.userId, yoga.userId, rudi.userId],
    role: "agent",
    active_until: until,
    links: [{ user_id: budi.userId, peserta_id: budiPeserta }],
  });
  expect(result.status).toBe(200);
  expect(result.body.data.results).toEqual([
    { user_id: budi.userId, name: "Budi Santoso", ok: true, error: null },
    { user_id: yoga.userId, name: "Yoga Pratama", ok: true, error: null },
    {
      user_id: rudi.userId,
      name: "Rudi Hartono",
      ok: false,
      error: "Akun ini sudah tidak menunggu persetujuan.",
    },
  ]);
  expect(column(budi, "status")).toBe("active");
  expect(column(yoga, "active_until")).toBe(until);
  expect(
    sqlOne(
      env,
      `SELECT akun_id FROM profiler_peserta WHERE id='${budiPeserta}';`,
    ),
  ).toBe(budi.userId);
  expect(lastLog(trainer, yoga)).toContain("Yoga Pratama");
});

test("bulk suspend ends logins and skips what a trainer may not touch", async () => {
  const a = await user("agent", "suspend-a", "Agen Satu");
  const b = await user("leader", "suspend-b", "Leader Dua");
  const result = await api(trainer, "/admin/users/bulk-suspend", "POST", {
    user_ids: [a.userId, b.userId, admin.userId, trainer.userId],
  });
  expect(result.status).toBe(200);
  const byId = Object.fromEntries(
    result.body.data.results.map((row: { user_id: string }) => [
      row.user_id,
      row,
    ]),
  );
  expect(byId[a.userId].ok).toBe(true);
  expect(byId[b.userId].ok).toBe(true);
  expect(byId[admin.userId]).toMatchObject({
    ok: false,
    error: "Trainer tidak dapat mengubah akun admin.",
  });
  expect(byId[trainer.userId]).toMatchObject({
    ok: false,
    error: "Akun Anda sendiri tidak bisa diubah dari halaman ini.",
  });
  expect(column(a, "status")).toBe("pending");
  expect(openLogins(a)).toBe(0);
  expect(openLogins(b)).toBe(0);
  expect(column(admin, "status")).toBe("active");

  // Already suspended: reported, not changed again.
  const again = await api(trainer, "/admin/users/bulk-suspend", "POST", {
    user_ids: [a.userId],
  });
  expect(again.body.data.results[0]).toMatchObject({
    ok: false,
    error: "Hanya akun yang aktif yang bisa ditangguhkan.",
  });
});

test("bulk last day and bulk practice limit apply the same change to each person", async () => {
  const a = await user("agent", "many-a", "Agen A");
  const b = await user("leader", "many-b", "Leader B");
  const t = await user("trainer", "many-t", "Trainer T");
  const until = wibDay(10);

  const days = await api(trainer, "/admin/users/bulk-active-until", "POST", {
    user_ids: [a.userId, b.userId],
    active_until: until,
  });
  expect(days.status).toBe(200);
  expect(days.body.data.results.every((row: { ok: boolean }) => row.ok)).toBe(
    true,
  );
  expect(column(b, "active_until")).toBe(until);
  const pastDays = await api(
    trainer,
    "/admin/users/bulk-active-until",
    "POST",
    {
      user_ids: [a.userId],
      active_until: wibDay(-3),
    },
  );
  expect(pastDays.status).toBe(400);

  const limit = await api(trainer, "/admin/users/bulk-practice-limit", "POST", {
    user_ids: [a.userId, b.userId, t.userId],
    module: "telefun",
    limit: { daily_limit: 2, ends_on: until, note: "Persiapan sertifikasi" },
  });
  expect(limit.status).toBe(200);
  expect(limit.body.data.results.map((row: { ok: boolean }) => row.ok)).toEqual(
    [true, true, false],
  );
  expect(limit.body.data.results[2].error).toBe(
    "Trainer dan admin selalu tanpa batas latihan, jadi tidak perlu pengecualian.",
  );
  expect(
    sqlOne(
      env,
      `SELECT daily_limit FROM practice_limit_overrides WHERE user_id='${a.userId}' AND module='telefun';`,
    ),
  ).toBe("2");

  const cleared = await api(
    trainer,
    "/admin/users/bulk-practice-limit",
    "POST",
    {
      user_ids: [a.userId, b.userId],
      module: "telefun",
      limit: null,
    },
  );
  expect(cleared.status).toBe(200);
  expect(
    sqlOne(
      env,
      `SELECT count(*) FROM practice_limit_overrides WHERE user_id IN ('${a.userId}','${b.userId}');`,
    ),
  ).toBe("0");
});

test("a bulk action takes 1 to 100 distinct accounts", async () => {
  const many = Array.from({ length: 101 }, () => randomUUID());
  expect(
    (
      await api(trainer, "/admin/users/bulk-suspend", "POST", {
        user_ids: many,
      })
    ).status,
  ).toBe(400);
  expect(
    (await api(trainer, "/admin/users/bulk-suspend", "POST", { user_ids: [] }))
      .status,
  ).toBe(400);
  const one = randomUUID();
  expect(
    (
      await api(trainer, "/admin/users/bulk-suspend", "POST", {
        user_ids: [one, one],
      })
    ).status,
  ).toBe(400);
});
