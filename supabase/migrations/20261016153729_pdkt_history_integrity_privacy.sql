-- PDKT history is written only by the existing reply RPC/backend evaluator.
-- Scalar owner reads retain RLS; private JSON is projected by the API after
-- visibility is checked with the user's JWT. No rows or snapshots are removed.
BEGIN;

DROP POLICY IF EXISTS pdkt_history_insert_own ON public.pdkt_history;
REVOKE INSERT, UPDATE, SELECT ON public.pdkt_history FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id, user_id, timestamp, evaluation, evaluation_status, evaluation_error,
  evaluation_started_at, evaluation_completed_at, time_taken, created_at,
  simulation_subject_type, simulation_subject_peserta_id, simulation_subject_name,
  simulation_subject_batch_name, simulation_subject_team
) ON public.pdkt_history TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdkt_history TO service_role;

COMMIT;
