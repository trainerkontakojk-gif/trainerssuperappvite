-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 001_sidak_core.sql
-- Description: Removes all SIDAK/QA schema objects including profiler tables,
--              QA periods, indicators, temuan, service weights, rule versions,
--              dashboard summaries, triggers, RLS policies, and grants.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Requires prior rollback of [011]
--   - 011_materialized_view_dashboard references qa_temuan and profiler_peserta
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping these tables will permanently delete ALL QA/SIDAK operational data:
--   - profiler_years, profiler_folders, profiler_peserta, profiler_tim_list
--   - qa_periods, qa_indicators, qa_service_weights, qa_temuan
--   - qa_service_rule_versions, qa_service_rule_indicators
--   - qa_dashboard_period_summary, qa_dashboard_agent_period_summary
--   BACKUP REQUIRED:
--     pg_dump -t public.profiler_peserta -t public.qa_temuan -t public.qa_periods \
--       -t public.qa_indicators -t public.qa_service_weights > sidak_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop triggers
DROP TRIGGER IF EXISTS update_profiler_peserta_updated_at ON public.profiler_peserta;
DROP TRIGGER IF EXISTS update_qa_indicators_updated_at ON public.qa_indicators;
DROP TRIGGER IF EXISTS update_qa_temuan_updated_at ON public.qa_temuan;
DROP TRIGGER IF EXISTS update_qa_service_rule_versions_updated_at ON public.qa_service_rule_versions;
DROP TRIGGER IF EXISTS update_qa_service_rule_indicators_updated_at ON public.qa_service_rule_indicators;

-- 2. Drop function (shared trigger function, only if no other tables use it)
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- 3. Drop RLS policies
DROP POLICY IF EXISTS "read_all" ON public.profiler_years;
DROP POLICY IF EXISTS "read_all" ON public.profiler_folders;
DROP POLICY IF EXISTS "read_all" ON public.profiler_peserta;
DROP POLICY IF EXISTS "read_all" ON public.profiler_tim_list;
DROP POLICY IF EXISTS "read_all" ON public.qa_periods;
DROP POLICY IF EXISTS "read_all" ON public.qa_indicators;
DROP POLICY IF EXISTS "read_all" ON public.qa_service_weights;
DROP POLICY IF EXISTS "read_all" ON public.qa_temuan;
DROP POLICY IF EXISTS "read_all" ON public.qa_service_rule_versions;
DROP POLICY IF EXISTS "read_all" ON public.qa_service_rule_indicators;
DROP POLICY IF EXISTS "read_all" ON public.qa_dashboard_period_summary;
DROP POLICY IF EXISTS "read_all" ON public.qa_dashboard_agent_period_summary;

DROP POLICY IF EXISTS "write_trainer" ON public.profiler_years;
DROP POLICY IF EXISTS "write_trainer" ON public.profiler_folders;
DROP POLICY IF EXISTS "write_trainer" ON public.profiler_peserta;
DROP POLICY IF EXISTS "write_trainer" ON public.profiler_tim_list;
DROP POLICY IF EXISTS "write_trainer" ON public.qa_periods;
DROP POLICY IF EXISTS "write_trainer" ON public.qa_indicators;
DROP POLICY IF EXISTS "write_trainer" ON public.qa_service_weights;
DROP POLICY IF EXISTS "write_trainer" ON public.qa_temuan;
DROP POLICY IF EXISTS "write_trainer" ON public.qa_service_rule_versions;
DROP POLICY IF EXISTS "write_trainer" ON public.qa_service_rule_indicators;
DROP POLICY IF EXISTS "write_trainer" ON public.qa_dashboard_period_summary;
DROP POLICY IF EXISTS "write_trainer" ON public.qa_dashboard_agent_period_summary;

-- 4. Drop indexes
DROP INDEX IF EXISTS public.idx_profiler_peserta_batch_name;
DROP INDEX IF EXISTS public.idx_profiler_peserta_tim;
DROP INDEX IF EXISTS public.idx_qa_indicators_service_type;
DROP INDEX IF EXISTS public.idx_qa_temuan_period_service;
DROP INDEX IF EXISTS public.idx_qa_temuan_peserta_period;
DROP INDEX IF EXISTS public.idx_qa_temuan_indicator_id;
DROP INDEX IF EXISTS public.idx_qa_temuan_rule_version;
DROP INDEX IF EXISTS public.idx_qa_temuan_phantom;
DROP INDEX IF EXISTS public.qa_dashboard_period_summary_unique_idx;

-- 5. Drop tables (order matters due to FK constraints)
DROP TABLE IF EXISTS public.qa_dashboard_agent_period_summary CASCADE;
DROP TABLE IF EXISTS public.qa_dashboard_period_summary CASCADE;
DROP TABLE IF EXISTS public.qa_temuan CASCADE;
DROP TABLE IF EXISTS public.qa_service_rule_indicators CASCADE;
DROP TABLE IF EXISTS public.qa_service_rule_versions CASCADE;
DROP TABLE IF EXISTS public.qa_service_weights CASCADE;
DROP TABLE IF EXISTS public.qa_indicators CASCADE;
DROP TABLE IF EXISTS public.qa_periods CASCADE;
DROP TABLE IF EXISTS public.profiler_tim_list CASCADE;
DROP TABLE IF EXISTS public.profiler_peserta CASCADE;
DROP TABLE IF EXISTS public.profiler_folders CASCADE;
DROP TABLE IF EXISTS public.profiler_years CASCADE;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT table_name AS missing_table, 'should not exist' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiler_years', 'profiler_folders', 'profiler_peserta', 'profiler_tim_list',
    'qa_periods', 'qa_indicators', 'qa_service_weights', 'qa_temuan',
    'qa_service_rule_versions', 'qa_service_rule_indicators',
    'qa_dashboard_period_summary', 'qa_dashboard_agent_period_summary'
  );
