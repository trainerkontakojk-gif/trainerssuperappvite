-- Pin search_path on the public functions flagged by Supabase advisor lint
-- 0011 (function_search_path_mutable) on production, 2026-11-03.
-- See plans/markdown/function-search-path-pin.md.
--
-- set_updated_at() only touches NEW and now() (pg_catalog), so it takes an
-- empty path. The other names exist only on production (legacy drift, no repo
-- definition); they keep the path database callers already resolve and move
-- pg_temp last. They are matched by name across overloads and skipped when a
-- search_path is already set, so the block is a no-op locally and on re-run.
BEGIN;

ALTER FUNCTION public.set_updated_at() SET search_path = '';

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
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
        WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', fn);
  END LOOP;
END;
$$;

COMMIT;
