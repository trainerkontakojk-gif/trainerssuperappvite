-- Rollback 20261103090000_pin_function_search_path.sql: unpin search_path.
-- Only touches functions whose path still equals the value the forward
-- migration set, so a path pinned later by another change is left alone.
BEGIN;

ALTER FUNCTION public.set_updated_at() RESET search_path;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_super_admin', 'is_approved_trainer',
        'get_qa_dashboard_data', 'get_qa_dashboard_range_data',
        'get_qa_dashboard_range_trend_data', 'get_qa_trend_data',
        '_qa_session_scores', 'get_agent_list_with_scores',
        'get_qa_agent_directory_summary', 'qa_score_agent')
      AND 'search_path=public, extensions, pg_temp' = ANY (p.proconfig)
  LOOP
    EXECUTE format('ALTER FUNCTION %s RESET search_path', fn);
  END LOOP;
END;
$$;

COMMIT;
