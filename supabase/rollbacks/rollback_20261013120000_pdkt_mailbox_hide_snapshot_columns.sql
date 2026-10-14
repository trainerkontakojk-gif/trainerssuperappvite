-- Rollback: 20261013120000_pdkt_mailbox_hide_snapshot_columns.sql
-- WARNING: restores direct client reads of the mailbox JSON snapshots, which
-- re-exposes the scenario answer key and consumer character to every
-- authenticated user. Roll back the API detail change first only if needed;
-- the API keeps working either way.

BEGIN;

REVOKE SELECT (
  id,
  user_id,
  status,
  created_at,
  updated_at,
  deleted_at,
  replied_at,
  sender_name,
  sender_email,
  subject,
  snippet,
  history_id,
  last_activity_at,
  created_by_user_id,
  client_request_id,
  share_batch_id,
  is_shared_copy,
  shared_at,
  source_mailbox_item_id,
  simulation_subject_type,
  simulation_subject_peserta_id,
  simulation_subject_name,
  simulation_subject_batch_name,
  simulation_subject_team
) ON public.pdkt_mailbox_items FROM authenticated;

GRANT SELECT ON TABLE public.pdkt_mailbox_items TO anon, authenticated;

COMMIT;
