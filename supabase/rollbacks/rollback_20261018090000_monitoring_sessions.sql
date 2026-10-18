-- Rollback 20261018090000_monitoring_sessions.sql
-- Riwayat Monitoring kembali membaca semua sesi di API (fallback bawaan).

drop function if exists public.monitoring_sessions_page(text, text, timestamptz, timestamptz, text, uuid[], integer, integer);
drop view if exists public.monitoring_sessions;
drop index if exists public.idx_profiler_peserta_trainer_id;

notify pgrst, 'reload schema';
