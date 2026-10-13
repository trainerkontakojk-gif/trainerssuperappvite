-- Migration: 20261013120000_pdkt_mailbox_hide_snapshot_columns.sql
-- Plan: plans/markdown/pdkt-mailbox-scenario-privacy.md
--
-- The shared mailbox policy (`pdkt_mailbox_select_all`, USING (true)) plus the
-- default Supabase table grant let every authenticated user read every column
-- of every mailbox row through PostgREST with their own JWT. That exposed the
-- scenario answer key (`scenario_snapshot.expectedAnswer`), the consumer
-- character (`config_snapshot.consumerType`) and the email recipient
-- (`inbound_email.to` / `recipientContext`) to simulation participants.
--
-- Client roles keep row visibility (RLS is unchanged) but may only SELECT the
-- scalar columns. The four JSON snapshots are read by the API after its own
-- visibility check and by the SECURITY DEFINER RPCs, which run as the owner.
--
-- A table-level SELECT grant overrides per-column revokes, so it is revoked
-- first and the scalar columns are granted back explicitly. Columns added to
-- this table later are NOT readable by clients until granted here (fail-closed).

REVOKE SELECT ON TABLE public.pdkt_mailbox_items FROM anon, authenticated;

GRANT SELECT (
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
) ON public.pdkt_mailbox_items TO authenticated;
