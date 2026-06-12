-- Rollback: 015_tighten_sidak_rls
-- Restores original "read_all" policies that were replaced by role-specific policies.
-- NOTE: The original "read_all" policies gave broad SELECT access to all authenticated users.
-- This rollback is safe — it simply widens access.

-- 1. profiler_peserta
DROP POLICY IF EXISTS "read_admin_trainer" ON public.profiler_peserta;
DROP POLICY IF EXISTS "read_all" ON public.profiler_peserta;
CREATE POLICY "read_all" ON public.profiler_peserta FOR SELECT USING (auth.role() = 'authenticated');

-- 2. qa_temuan
DROP POLICY IF EXISTS "read_admin_trainer" ON public.qa_temuan;
DROP POLICY IF EXISTS "read_all" ON public.qa_temuan;
CREATE POLICY "read_all" ON public.qa_temuan FOR SELECT USING (auth.role() = 'authenticated');

-- 3. qa_dashboard_period_summary
DROP POLICY IF EXISTS "read_admin_trainer" ON public.qa_dashboard_period_summary;
DROP POLICY IF EXISTS "read_all" ON public.qa_dashboard_period_summary;
CREATE POLICY "read_all" ON public.qa_dashboard_period_summary FOR SELECT USING (auth.role() = 'authenticated');

-- 4. qa_dashboard_agent_period_summary
DROP POLICY IF EXISTS "read_admin_trainer" ON public.qa_dashboard_agent_period_summary;
DROP POLICY IF EXISTS "read_all" ON public.qa_dashboard_agent_period_summary;
CREATE POLICY "read_all" ON public.qa_dashboard_agent_period_summary FOR SELECT USING (auth.role() = 'authenticated');

-- 5. profiler_folders
DROP POLICY IF EXISTS "read_admin_trainer" ON public.profiler_folders;
DROP POLICY IF EXISTS "read_all" ON public.profiler_folders;
CREATE POLICY "read_all" ON public.profiler_folders FOR SELECT USING (auth.role() = 'authenticated');

-- Verification
SELECT policyname, tablename, cmd FROM pg_policies
WHERE tablename IN ('profiler_peserta', 'qa_temuan', 'qa_dashboard_period_summary', 'qa_dashboard_agent_period_summary', 'profiler_folders')
ORDER BY tablename, policyname;
