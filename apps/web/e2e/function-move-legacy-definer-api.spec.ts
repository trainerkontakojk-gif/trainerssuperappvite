import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  installLoopbackFetchGuard,
  readLoopbackEnv,
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Guard dua fungsi legacy SECURITY DEFINER yang hanya ada di production
 * (`consume_rate_limit`, `get_service_trend_dashboard`): tanpa cek pemanggil
 * dan tanpa caller di repo, jadi dipindah ke schema non-exposed
 * `app_internal` (docs/architecture.md, "Fungsi tanpa pemanggil PostgREST").
 * Supabase lokal disposable.
 *
 * Lokal tidak punya fungsi itu, jadi spec memasang definisi persis hasil
 * readback production (fixture) di transaksi yang di-rollback, lalu
 * menjalankan migration di atasnya.
 */

installLoopbackFetchGuard();
const env = readLoopbackEnv();

const MIGRATION = new URL(
  "../../../supabase/migrations/20261103100000_move_legacy_unguarded_definer_functions.sql",
  import.meta.url,
);
const FIXTURE = new URL(
  "./fixtures/legacy-unguarded-definer-functions.sql",
  import.meta.url,
);

function migrationBody(): string {
  return readFileSync(MIGRATION, "utf8").replace(/^(BEGIN|COMMIT);$/gm, "");
}

type MovedState = {
  publicRemains: string[];
  moved: {
    signature: string;
    definer: boolean;
    config: string[] | null;
    anon: boolean;
    authenticated: boolean;
  }[];
  clientUsage: boolean;
  trendStillRuns: string | null;
};

test("migration memindah kedua fungsi dari public ke app_internal tanpa akses client", () => {
  const migration = migrationBody();
  const state = JSON.parse(
    sqlOne(
      env,
      `BEGIN;
       ${readFileSync(FIXTURE, "utf8")}
       ${migration}
       ${migration}
       SELECT json_build_object(
         'publicRemains', (SELECT coalesce(json_agg(p.proname ORDER BY p.proname), '[]'::json)
           FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('consume_rate_limit', 'get_service_trend_dashboard')),
         'moved', (SELECT json_agg(json_build_object(
             'signature', p.oid::regprocedure::text,
             'definer', p.prosecdef,
             'config', p.proconfig,
             'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
             'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
             ORDER BY p.proname)
           FROM pg_proc p WHERE p.pronamespace = 'app_internal'::regnamespace
             AND p.proname IN ('consume_rate_limit', 'get_service_trend_dashboard')),
         'clientUsage', has_schema_privilege('anon', 'app_internal', 'USAGE')
           OR has_schema_privilege('authenticated', 'app_internal', 'USAGE'),
         'trendStillRuns', app_internal.get_service_trend_dashboard('{}'::uuid[])
           -> 'totalSummary' ->> 'totalDefects'
       );
       ROLLBACK;`,
    ),
  ) as MovedState;

  expect(state).toEqual({
    publicRemains: [],
    moved: [
      {
        signature: "app_internal.consume_rate_limit(text,integer,integer)",
        definer: true,
        config: ['search_path=""'],
        anon: false,
        authenticated: false,
      },
      {
        signature: "app_internal.get_service_trend_dashboard(uuid[])",
        definer: true,
        config: ['search_path=""'],
        anon: false,
        authenticated: false,
      },
    ],
    clientUsage: false,
    trendStillRuns: "0",
  });
});

test("anon tidak bisa memanggil kedua fungsi lewat PostgREST", async () => {
  for (const name of ["consume_rate_limit", "get_service_trend_dashboard"]) {
    const response = await fetch(`${env.apiUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(response.status, name).toBe(404);
    expect(await response.json(), name).toMatchObject({ code: "PGRST202" });
  }
});
