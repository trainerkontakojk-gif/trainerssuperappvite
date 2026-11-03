-- Rollback 20261103100000_move_legacy_unguarded_definer_functions.sql: move
-- both functions back to public with the client EXECUTE they had before. This
-- re-exposes them to the anon key; only with Fajar's approval.
BEGIN;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.oid IN (
      to_regprocedure('app_internal.consume_rate_limit(text,integer,integer)'),
      to_regprocedure('app_internal.get_service_trend_dashboard(uuid[])'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA public', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', fn);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
