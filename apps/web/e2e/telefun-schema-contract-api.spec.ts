import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createAdmin,
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  type LoopbackEnv,
} from "./helpers/sidakRealBackend";

/**
 * Telefun schema contract against the local database (replaces the old
 * migration-text unit test). Plan: plans/markdown/telefun-schema-contract-e2e.md.
 * Anon rejection of the coaching RPC lives in exposed-function-guard-api.spec.ts.
 */

// Columns apps/api and apps/telefun write to telefun_history.
const TELEFUN_HISTORY_COLUMNS = [
  "agent_recording_path",
  "disruption_results",
  "feedback",
  "persona_config",
  "realistic_mode_enabled",
  "recording_path",
  "score",
  "session_metrics",
  "voice_dashboard_metrics",
] as const;

let env: LoopbackEnv;
let userId: string | undefined;

test.beforeAll(() => {
  installLoopbackFetchGuard();
  env = readLoopbackEnv();
});

test.afterAll(async () => {
  // Deleting the user cascades to telefun_history and telefun_coaching_summary.
  if (userId) await createAdmin(env).auth.admin.deleteUser(userId);
});

function readCatalog<T>(query: string): T {
  return JSON.parse(runSql(env, `BEGIN READ ONLY; ${query}; ROLLBACK;`));
}

test("telefun_history declares every column the API writes", () => {
  const columns = readCatalog<
    string[]
  >(`SELECT coalesce(json_agg(column_name::text ORDER BY column_name), '[]'::json)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'telefun_history'`);

  const missing = TELEFUN_HISTORY_COLUMNS.filter((c) => !columns.includes(c));
  expect(missing).toEqual([]);
});

test("upsert_telefun_coaching_summary has one overload with NULL metadata defaults", () => {
  const overloads = readCatalog<
    {
      signature: string;
      arguments: string;
      authenticated: boolean;
      serviceRole: boolean;
    }[]
  >(`SELECT coalesce(json_agg(row_to_json(f) ORDER BY signature), '[]'::json) FROM (
      SELECT p.oid::regprocedure::text AS signature,
        pg_get_function_arguments(p.oid) AS arguments,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS "serviceRole"
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'upsert_telefun_coaching_summary'
    ) f`);

  expect(overloads).toEqual([
    {
      signature: "upsert_telefun_coaching_summary(uuid,jsonb,integer,text)",
      arguments:
        "p_session_id uuid, p_recommendations jsonb, " +
        "p_ai_annotation_count integer DEFAULT NULL::integer, " +
        "p_ai_annotation_checksum text DEFAULT NULL::text",
      authenticated: true,
      serviceRole: true,
    },
  ]);
});

test("service role upserts a coaching summary with 2 and with 4 named arguments", async () => {
  const admin = createAdmin(env);
  const created = await admin.auth.admin.createUser({
    email: `e2e-telefun-schema-${randomUUID()}@local.test`,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user!.id;

  const session = await admin
    .from("telefun_history")
    .insert({
      user_id: userId,
      scenario_title: "E2E schema contract",
      consumer_name: "E2E",
    })
    .select("id")
    .single();
  if (session.error) throw session.error;
  const sessionId = session.data.id as string;

  const readSummary = async () => {
    const { data, error } = await admin
      .from("telefun_coaching_summary")
      .select("user_id, recommendations")
      .eq("session_id", sessionId);
    if (error) throw error;
    return data;
  };

  // Same shape as apps/api/src/lib/telefun-analysis.ts.
  const twoArgs = await admin.rpc("upsert_telefun_coaching_summary", {
    p_session_id: sessionId,
    p_recommendations: [{ text: "Verifikasi identitas di awal", priority: 1 }],
  });
  expect(twoArgs.error).toBeNull();
  expect(await readSummary()).toEqual([
    {
      user_id: userId,
      recommendations: [{ text: "Verifikasi identitas di awal", priority: 1 }],
    },
  ]);

  // Same shape as apps/api/src/routes/telefun/annotations.ts.
  const fourArgs = await admin.rpc("upsert_telefun_coaching_summary", {
    p_session_id: sessionId,
    p_recommendations: [
      { text: "Konfirmasi data sebelum solusi", priority: 2 },
    ],
    p_ai_annotation_count: 0,
    // telefun_coaching_summary requires a lowercase SHA-256 hex checksum.
    p_ai_annotation_checksum: "0".repeat(64),
  });
  expect(fourArgs.error).toBeNull();
  expect(await readSummary()).toEqual([
    {
      user_id: userId,
      recommendations: [
        { text: "Konfirmasi data sebelum solusi", priority: 2 },
      ],
    },
  ]);
});
