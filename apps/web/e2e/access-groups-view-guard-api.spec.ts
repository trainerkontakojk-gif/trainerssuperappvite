import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import {
  createAdmin,
  createUserWithJwt,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Guard `public.v_access_groups_with_item_counts` (Supabase advisor:
 * security_definer_view). Supabase lokal disposable.
 *
 * View dibaca hanya oleh backend lewat service_role
 * (`getAccessGroups()` di `apps/api/src/services/admin-service.ts`).
 *
 * Kontrak:
 * - view memakai `security_invoker`, sehingga RLS tabel dasar berlaku;
 * - `authenticated` dan `anon` tidak punya grant ke view;
 * - user login (agent) tidak bisa membaca view lewat PostgREST;
 * - service_role tetap membaca view dengan item_count yang benar.
 */

installLoopbackFetchGuard();
const env = readLoopbackEnv();
const ns = randomUUID().slice(0, 8);
const quoted = (value: string) => `'${value.replace(/'/g, "''")}'`;

const created = {
  groupId: null as string | null,
  agentUserId: null as string | null,
  agentToken: "",
};

test.beforeAll(async () => {
  created.groupId = sqlOne(
    env,
    `INSERT INTO access_groups (name, scope_type) VALUES (${quoted(`e2e-view-guard-${ns}`)}, 'union') RETURNING id;`,
  );
  const agent = await createUserWithJwt(env, "agent", `view-guard-${ns}`);
  created.agentUserId = agent.userId;
  created.agentToken = agent.token;
});

test.afterAll(async () => {
  if (created.groupId)
    runSql(
      env,
      `DELETE FROM access_groups WHERE id=${quoted(created.groupId)};`,
    );
  if (created.agentUserId)
    await createAdmin(env).auth.admin.deleteUser(created.agentUserId);
});

test("view memakai security_invoker", () => {
  const options = sqlOne(
    env,
    `SELECT coalesce(array_to_string(reloptions, ','), '<none>')
     FROM pg_class WHERE oid = 'public.v_access_groups_with_item_counts'::regclass;`,
  );
  expect(options).toContain("security_invoker=true");
});

test("anon dan authenticated tidak punya grant ke view", () => {
  const grantees = runSql(
    env,
    `SELECT grantee FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='v_access_groups_with_item_counts'
       AND grantee IN ('anon','authenticated');`,
  );
  expect(grantees).toBe("");
});

test("agent tidak bisa membaca view lewat PostgREST", async () => {
  const client = createClient(env.apiUrl, env.anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${created.agentToken}` } },
  });
  const { data, error } = await client
    .from("v_access_groups_with_item_counts")
    .select("id")
    .eq("id", created.groupId!);
  expect(data).toBeNull();
  expect(error?.code).toBe("42501");
});

test("service_role tetap membaca view dengan item_count", async () => {
  const { data, error } = await createAdmin(env)
    .from("v_access_groups_with_item_counts")
    .select("id, item_count")
    .eq("id", created.groupId!)
    .single();
  expect(error).toBeNull();
  expect(data).toEqual({ id: created.groupId, item_count: 0 });
});
