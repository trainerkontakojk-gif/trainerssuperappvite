import { expect, test } from "@playwright/test";
import {
  installLoopbackFetchGuard,
  readLoopbackEnv,
  sqlOne,
} from "./helpers/sidakRealBackend";

/**
 * Guard Supabase advisor `unindexed_foreign_keys` (lint 0001) untuk tabel TNA.
 * Supabase lokal disposable.
 *
 * Kontrak (plans/markdown/tna-programs-fk-indexes.md): setiap foreign key di
 * tabel `public.tna_*` punya index yang kolom depannya sama dengan kolom
 * foreign key tersebut, sesuai aturan advisor.
 */

installLoopbackFetchGuard();
const env = readLoopbackEnv();

test("setiap foreign key di tabel public.tna_* punya index penutup", () => {
  const unindexed = JSON.parse(
    sqlOne(
      env,
      `SELECT coalesce(json_agg(c.conname ORDER BY c.conname), '[]'::json)
       FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE c.contype = 'f' AND n.nspname = 'public'
         AND t.relname LIKE 'tna\\_%'
         AND NOT EXISTS (
           SELECT 1 FROM pg_index i
           WHERE i.indrelid = c.conrelid
             AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
         );`,
    ),
  );
  expect(unindexed).toEqual([]);
});
