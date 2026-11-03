-- Move two production-only legacy SECURITY DEFINER functions out of the
-- exposed `public` schema. See plans/markdown/function-search-path-pin.md
-- ("Production readback") and docs/architecture.md, "Fungsi tanpa pemanggil
-- PostgREST".
--
-- consume_rate_limit(text,integer,integer) lets the anon key upsert arbitrary
-- security_rate_limits rows; get_service_trend_dashboard(uuid[]) returns QA
-- defect and audited-agent counts for any period ids. Neither checks its caller
-- and no repo code calls either (Telefun and the API use
-- consume_telefun_realtime_rate_limit). app_internal gives client roles no
-- USAGE and is not in PGRST_DB_SCHEMAS, so /rpc no longer routes to them.
-- Bodies already use search_path = '' with schema-qualified names, so they keep
-- working after the move. Both are missing locally, so this is a no-op there
-- and on re-run.
BEGIN;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.oid IN (
      to_regprocedure('public.consume_rate_limit(text,integer,integer)'),
      to_regprocedure('public.get_service_trend_dashboard(uuid[])'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA app_internal', fn);
    -- fn is an oid, so it now prints as app_internal.<name>(...).
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
