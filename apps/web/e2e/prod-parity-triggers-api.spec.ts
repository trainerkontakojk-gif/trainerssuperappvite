import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createAdmin,
  createUserWithJwt,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Trigger yang ada di prod tapi dulu tidak dibuat migration repo
 * (phase-37 parity audit; readback prod 2026-10-17). Supabase lokal
 * disposable, langsung ke database: kontraknya ada di trigger.
 *
 * - guard profil: user yang mengubah barisnya sendiri tidak bisa mengganti
 *   role/status/is_deleted. Jalur nyatanya adalah RPC SECURITY DEFINER yang
 *   membawa JWT user, jadi disimulasikan dengan `request.jwt.claims` di
 *   sesi postgres (grant kolom `authenticated` sudah memblokir UPDATE
 *   langsung lewat PostgREST).
 * - activity log: insert ke ketik/pdkt/telefun_history menulis satu baris
 *   `activity_logs`.
 * - updated_at: UPDATE pada pdkt_mailbox_items dan ketik_review_jobs
 *   memperbarui `updated_at`.
 *
 * Semua fungsi trigger memakai `search_path` kosong dan tidak bisa dieksekusi
 * PUBLIC/anon/authenticated.
 */

const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

let agent: Awaited<ReturnType<typeof createUserWithJwt>>;
let admin: Awaited<ReturnType<typeof createUserWithJwt>>;

/** Satu transaksi dengan JWT `sub` = `actorId` (null = service role). */
function asActor(actorId: string | null, statement: string): string {
  const claims =
    actorId === null
      ? ""
      : `SELECT set_config('request.jwt.claims', ${quoted(JSON.stringify({ sub: actorId, role: "authenticated" }))}, true);`;
  return runSql(env, `BEGIN; ${claims} ${statement}; COMMIT;`)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1)!;
}

function resetAgentProfile() {
  runSql(
    env,
    `UPDATE profiles SET role='agent', status='active', is_deleted=false, full_name='E2E agent' WHERE id=${quoted(agent.userId)};`,
  );
}

test.beforeAll(async () => {
  agent = await createUserWithJwt(env, "agent", `parity-${ns}`);
  admin = await createUserWithJwt(env, "admin", `parity-${ns}`);
});

test.afterAll(async () => {
  const ids = [agent, admin].filter(Boolean).map((user) => user.userId);
  if (ids.length)
    runSql(
      env,
      `DELETE FROM activity_logs WHERE user_id IN (${ids.map(quoted).join(",")});`,
    );
  for (const id of ids) {
    const { error } = await createAdmin(env).auth.admin.deleteUser(id);
    expect(error).toBeNull();
  }
});

test.describe("guard profil sensitif", () => {
  test.beforeEach(resetAgentProfile);

  test("user tidak bisa mengubah role/status/is_deleted barisnya sendiri", () => {
    const row = asActor(
      agent.userId,
      `UPDATE profiles SET role='admin', status='inactive', is_deleted=true, full_name='Nama Baru'
       WHERE id=${quoted(agent.userId)} RETURNING role||'|'||status||'|'||is_deleted||'|'||full_name`,
    );
    expect(row).toBe("agent|active|false|Nama Baru");
  });

  test("admin tetap bisa mengubah role user lain", () => {
    const row = asActor(
      admin.userId,
      `UPDATE profiles SET role='trainer' WHERE id=${quoted(agent.userId)} RETURNING role`,
    );
    expect(row).toBe("trainer");
  });

  test("service role (tanpa JWT) tetap bisa mengubah role", () => {
    const row = asActor(
      null,
      `UPDATE profiles SET status='inactive' WHERE id=${quoted(agent.userId)} RETURNING status`,
    );
    expect(row).toBe("inactive");
  });
});

test.describe("activity log sesi simulasi", () => {
  function lastLog(module: string): string {
    return sqlOne(
      env,
      `SELECT user_name||'|'||action||'|'||module||'|'||type FROM activity_logs
       WHERE user_id=${quoted(agent.userId)} AND module=${quoted(module)}
       ORDER BY created_at DESC LIMIT 1;`,
    );
  }

  test.beforeAll(resetAgentProfile);

  test("insert ketik_history mencatat aktivitas dengan judul skenario", () => {
    runSql(
      env,
      `INSERT INTO ketik_history (user_id, scenario_title, consumer_name)
       VALUES (${quoted(agent.userId)}, ${quoted(`Skenario ${ns}`)}, 'Konsumen');`,
    );
    expect(lastLog("ketik")).toBe(
      `E2E agent|menyelesaikan sesi Ketik: Skenario ${ns}|ketik|session`,
    );
  });

  test("insert pdkt_history mencatat aktivitas", () => {
    runSql(
      env,
      `INSERT INTO pdkt_history (user_id) VALUES (${quoted(agent.userId)});`,
    );
    expect(lastLog("pdkt")).toBe(
      "E2E agent|menyelesaikan sesi PDKT|pdkt|session",
    );
  });

  test("insert telefun_history mencatat aktivitas", () => {
    runSql(
      env,
      `INSERT INTO telefun_history (user_id, scenario_title, consumer_name)
       VALUES (${quoted(agent.userId)}, 'Telefun', 'Konsumen');`,
    );
    expect(lastLog("telefun")).toBe(
      "E2E agent|menyelesaikan sesi Telefun|telefun|session",
    );
  });
});

test.describe("updated_at otomatis", () => {
  test("UPDATE pdkt_mailbox_items memperbarui updated_at", () => {
    const id = sqlOne(
      env,
      `INSERT INTO pdkt_mailbox_items (user_id, created_by_user_id, sender_name, sender_email, scenario_snapshot, config_snapshot, inbound_email)
       VALUES (${quoted(agent.userId)}, ${quoted(agent.userId)}, 'Pengirim', 'pengirim@local.test', '{}', '{}', '{}') RETURNING id;`,
    );
    const fresh = sqlOne(
      env,
      `UPDATE pdkt_mailbox_items SET updated_at='2000-01-01' WHERE id=${quoted(id)}
       RETURNING updated_at > now() - interval '1 minute';`,
    );
    expect(fresh).toBe("t");
  });

  test("UPDATE ketik_review_jobs memperbarui updated_at", () => {
    const sessionId = sqlOne(
      env,
      `INSERT INTO ketik_history (user_id, scenario_title, consumer_name)
       VALUES (${quoted(agent.userId)}, 'Review', 'Konsumen') RETURNING id;`,
    );
    const jobId =
      runSql(
        env,
        `SELECT id FROM ketik_review_jobs WHERE session_id=${quoted(sessionId)};`,
      ) ||
      sqlOne(
        env,
        `INSERT INTO ketik_review_jobs (session_id) VALUES (${quoted(sessionId)}) RETURNING id;`,
      );
    const fresh = sqlOne(
      env,
      `UPDATE ketik_review_jobs SET updated_at='2000-01-01' WHERE id=${quoted(jobId)}
       RETURNING updated_at > now() - interval '1 minute';`,
    );
    expect(fresh).toBe("t");
  });
});

test("fungsi trigger memakai search_path kosong dan tidak bisa dieksekusi klien", () => {
  const rows = runSql(
    env,
    `SELECT p.proname||'|'||coalesce(array_to_string(p.proconfig, ','), '<none>')||'|'||
            (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN (
       'prevent_self_role_status_change', 'log_ketik_activity', 'log_pdkt_activity',
       'log_telefun_activity', 'handle_pdkt_mailbox_updated_at')
     ORDER BY 1;`,
  );
  expect(rows.split("\n")).toEqual([
    'handle_pdkt_mailbox_updated_at|search_path=""|false',
    'log_ketik_activity|search_path=""|false',
    'log_pdkt_activity|search_path=""|false',
    'log_telefun_activity|search_path=""|false',
    'prevent_self_role_status_change|search_path=""|false',
  ]);
});
