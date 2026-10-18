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
// plans/markdown/kontrol-user-fase-5.md. Suspending, rejecting, deleting or
// demoting an account ends every open login at once, and agents and leaders
// can ask AI to re-score a KETIK session once.

test.describe.configure({ mode: "serial" });

const env = readLoopbackEnv();
const ns = `controls-${randomUUID().slice(0, 8)}`;
type Identity = Awaited<ReturnType<typeof createUserWithJwt>>;
const identities: Identity[] = [];
const sessions: string[] = [];
let app: Hono;
let admin: Identity;
let trainer: Identity;

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
): Promise<Identity> {
  const who = await createUserWithJwt(env, role, `${ns}-${tag}`);
  identities.push(who);
  return who;
}

const openLogins = (who: Identity) =>
  Number(
    sqlOne(
      env,
      `SELECT count(*) FROM auth.sessions WHERE user_id='${who.userId}';`,
    ),
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
  for (const id of sessions)
    runSql(env, `DELETE FROM ketik_history WHERE id='${id}';`);
  const db = createAdmin(env);
  for (const who of identities) {
    await db.from("activity_logs").delete().eq("user_id", who.userId);
    await db.from("activity_logs").delete().eq("target_user_id", who.userId);
    await db.auth.admin.deleteUser(who.userId);
  }
});

test("suspending, rejecting and deleting an account ends its open logins", async () => {
  for (const [tag, change] of [
    ["suspend", { status: "pending" }],
    ["reject", { status: "rejected" }],
    ["delete", null],
  ] as const) {
    const agent = await user("agent", tag);
    expect((await api(agent, "/me/practice-quota")).status).toBe(200);
    expect(openLogins(agent)).toBe(1);

    const changed = change
      ? await api(trainer, `/admin/users/${agent.userId}/status`, "PUT", change)
      : await api(trainer, `/admin/users/${agent.userId}`, "DELETE");
    expect(changed.status, tag).toBe(200);

    expect(openLogins(agent), tag).toBe(0);
    const old = await api(agent, "/me/practice-quota");
    expect(old.status, tag).toBe(401);
  }
  const log = sqlOne(
    env,
    `SELECT action FROM activity_logs WHERE user_id='${trainer.userId}' AND type='update_status' ORDER BY created_at DESC LIMIT 1;`,
  );
  expect(log).toContain("semua login-nya diakhiri");
});

test("a lower role ends open logins; a higher role keeps them", async () => {
  const demoted = await user("trainer", "demote");
  const promoted = await user("agent", "promote");

  expect(
    (
      await api(admin, `/admin/users/${demoted.userId}/role`, "PUT", {
        role: "agent",
      })
    ).status,
  ).toBe(200);
  expect(openLogins(demoted)).toBe(0);
  expect((await api(demoted, "/me/practice-quota")).status).toBe(401);

  expect(
    (
      await api(admin, `/admin/users/${promoted.userId}/role`, "PUT", {
        role: "leader",
      })
    ).status,
  ).toBe(200);
  expect(openLogins(promoted)).toBe(1);
  expect((await api(promoted, "/me/practice-quota")).status).toBe(200);
});

function seedReviewedSession(ownerId: string): string {
  const id = randomUUID();
  sessions.push(id);
  runSql(
    env,
    `INSERT INTO ketik_history (id, user_id, scenario_title, consumer_name, messages, review_status, final_score)
     VALUES ('${id}', '${ownerId}', 'Rerun ${ns}', 'Konsumen', '[]'::jsonb, 'completed', 60);
     INSERT INTO ketik_session_reviews (session_id, ai_summary, strengths, weaknesses, coaching_focus)
     VALUES ('${id}', 'Old', '["a"]'::jsonb, '["b"]'::jsonb, '["c"]'::jsonb);`,
  );
  return id;
}

/** What the worker leaves behind when a re-score finishes. */
function finishJob(sessionId: string) {
  runSql(
    env,
    `UPDATE ketik_review_jobs SET status='completed' WHERE session_id='${sessionId}';
     UPDATE ketik_history SET review_status='completed' WHERE id='${sessionId}';`,
  );
}

test("agents and leaders can re-score a KETIK session once; trainers have no limit", async () => {
  const agent = await user("agent", "rerun");
  const session = seedReviewedSession(agent.userId);

  let status = await api(agent, `/ketik/review/status/${session}`);
  expect(status.body.data.rerunsLeft).toBe(1);

  const first = await api(agent, "/ketik/review", "POST", {
    sessionId: session,
    rerun: true,
  });
  expect(first.status).toBe(202);
  finishJob(session);

  status = await api(agent, `/ketik/review/status/${session}`);
  expect(status.body.data.rerunsLeft).toBe(0);
  const second = await api(agent, "/ketik/review", "POST", {
    sessionId: session,
    rerun: true,
  });
  expect(second.status).toBe(429);
  expect(second.body.error.code).toBe("RERUN_LIMIT");
  expect(second.body.error.message).toBe(
    "Telaah ulang untuk sesi ini sudah dipakai. Agent dan leader bisa menelaah ulang 1 kali per sesi.",
  );

  // A trainer re-scoring their own session is not limited.
  const own = seedReviewedSession(trainer.userId);
  expect(
    (await api(trainer, `/ketik/review/status/${own}`)).body.data.rerunsLeft,
  ).toBeNull();
  for (let round = 0; round < 2; round += 1) {
    const again = await api(trainer, "/ketik/review", "POST", {
      sessionId: own,
      rerun: true,
    });
    expect(again.status, `round ${round}`).toBe(202);
    finishJob(own);
  }
});
