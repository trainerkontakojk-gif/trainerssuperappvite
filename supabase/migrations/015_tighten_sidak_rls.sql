-- 015: Tighten SIDAK and Profiler RLS
-- Replaces broad "read_all" policies with role-specific policies.

-- profiler_peserta: trainers read/write all, agents read own
DROP POLICY IF EXISTS "read_all" ON public.profiler_peserta;
CREATE POLICY "read_admin_trainer" ON public.profiler_peserta FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
);
CREATE POLICY "read_own_peserta" ON public.profiler_peserta FOR SELECT USING (
  user_id = auth.uid()
);

-- qa_temuan: trainers read/write all, agents read own
DROP POLICY IF EXISTS "read_all" ON public.qa_temuan;
CREATE POLICY "read_admin_trainer" ON public.qa_temuan FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
);
CREATE POLICY "read_own_temuan" ON public.qa_temuan FOR SELECT USING (
  peserta_id IN (SELECT id FROM public.profiler_peserta WHERE user_id = auth.uid())
);

-- qa_dashboard_period_summary: trainers only (dashboard usually accessed via API which uses service_role)
DROP POLICY IF EXISTS "read_all" ON public.qa_dashboard_period_summary;
CREATE POLICY "read_admin_trainer" ON public.qa_dashboard_period_summary FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
);

-- qa_dashboard_agent_period_summary: trainers read all, agents read own
DROP POLICY IF EXISTS "read_all" ON public.qa_dashboard_agent_period_summary;
CREATE POLICY "read_admin_trainer" ON public.qa_dashboard_agent_period_summary FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
);
CREATE POLICY "read_own_summary" ON public.qa_dashboard_agent_period_summary FOR SELECT USING (
  agent_id IN (SELECT id FROM public.profiler_peserta WHERE user_id = auth.uid())
);

-- profiler_folders: trainers only
DROP POLICY IF EXISTS "read_all" ON public.profiler_folders;
CREATE POLICY "read_admin_trainer" ON public.profiler_folders FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
);

-- Note: Leader roles are intentionally not given direct SELECT access here 
-- because their access is complex and managed via the Backend API (sidak-service.ts)
-- which uses service_role to bypass RLS.
