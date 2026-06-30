-- Minimal indexes for current SIDAK/Profiler folder hierarchy and summary refresh paths.
-- Scope intentionally follows live code paths:
-- - SIDAK folder hierarchy expands root folders through profiler_folders.parent_id.
-- - SIDAK summary refresh deletes/rebuilds rows by period/service and folder scope.

CREATE INDEX IF NOT EXISTS idx_profiler_folders_parent_name_id
  ON public.profiler_folders(parent_id, name, id);

CREATE INDEX IF NOT EXISTS idx_qa_dashboard_period_summary_folder_period
  ON public.qa_dashboard_period_summary(folder_id, period_id);

CREATE INDEX IF NOT EXISTS idx_qa_dashboard_agent_period_summary_period_service
  ON public.qa_dashboard_agent_period_summary(period_id, service_type);
