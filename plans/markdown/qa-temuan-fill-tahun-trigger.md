# SIDAK: capture prod-only `trg_fill_tahun` on `qa_temuan`

## Requirement

Prod has `trg_fill_tahun` (BEFORE INSERT on `public.qa_temuan`) that fills a
NULL `tahun` from `qa_periods.year`. No repo migration creates it, so local and
E2E databases leave `tahun` NULL on inserts that omit it, while prod fills it.
The repo must create the same behavior.

## Design

- Lane D (schema). Roles touched: none directly; the trigger fires for every
  role that can insert into `qa_temuan`. No data loss.
- Migration `20261017120000_qa_temuan_fill_tahun_trigger`:
  `CREATE OR REPLACE FUNCTION public.fill_tahun_from_period()` plus
  `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER`. Idempotent against prod.
- Hardened versus prod: `SET search_path = ''`, `public.qa_periods`, and
  `REVOKE ALL ... FROM PUBLIC, anon, authenticated` (trigger firing needs no
  EXECUTE grant). The function stays SECURITY INVOKER, as on prod.
- Rollback drops the trigger and function; filled values stay.
- Prod apply is not part of this change. It needs Fajar's explicit OK:
  `supabase db query --linked -f <migration>` then
  `supabase migration repair --linked --status applied 20261017120000`.

## Tasklist

- [x] RED: `sidak-temuan-tahun-trigger-api.spec.ts` (insert without `tahun`
      gets the period year; explicit `tahun` kept; `search_path=""`).
- [x] Migration + rollback + rollbacks README entry.
- [x] Clean local replay, spec GREEN.
- [x] Rollback round-trip on local.
- [x] Re-check the other phase-37 trigger gaps against local (report in the
      shared notes folder).
