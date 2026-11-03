import { expect, test } from "@playwright/test";
import {
  installLoopbackFetchGuard,
  readLoopbackEnv,
  runSql,
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Guard Supabase advisor `function_search_path_mutable` (lint 0011).
 * Supabase lokal disposable.
 *
 * Kontrak (plans/markdown/function-search-path-pin.md):
 * - setiap fungsi di `public` yang bukan milik extension mem-pin
 *   `search_path`, supaya nama tanpa schema tidak bisa dibayangi objek di
 *   path pemanggil (mis. `pg_temp`);
 * - `set_updated_at()` tetap mengisi `updated_at` dengan `search_path = ''`.
 */

installLoopbackFetchGuard();
const env = readLoopbackEnv();

test("tidak ada fungsi public tanpa search_path yang di-pin", () => {
  const unpinned = JSON.parse(
    sqlOne(
      env,
      `SELECT coalesce(json_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text), '[]'::json)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
         AND NOT EXISTS (SELECT 1 FROM pg_depend d
           WHERE d.objid = p.oid AND d.deptype = 'e')
         AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
           WHERE c LIKE 'search_path=%');`,
    ),
  );
  expect(unpinned).toEqual([]);
});

test("set_updated_at() memakai search_path kosong dan tetap mengisi updated_at", () => {
  const config = sqlOne(
    env,
    `SELECT coalesce(array_to_string(proconfig, ','), '<none>')
     FROM pg_proc WHERE oid = 'public.set_updated_at()'::regprocedure;`,
  );
  expect(config).toBe('search_path=""');

  const stamped = runSql(
    env,
    `BEGIN;
     CREATE TEMP TABLE e2e_search_path_stamp (id int, updated_at timestamptz);
     CREATE TRIGGER e2e_stamp BEFORE UPDATE ON e2e_search_path_stamp
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
     INSERT INTO e2e_search_path_stamp VALUES (1, '2000-01-01');
     UPDATE e2e_search_path_stamp SET id = 2;
     SELECT updated_at = now() FROM e2e_search_path_stamp;
     ROLLBACK;`,
  );
  expect(stamped).toBe("t");
});
