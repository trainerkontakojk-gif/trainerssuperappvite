-- Rollback for 20261019140000_practice_history_list_indexes.sql: drops the
-- three list indexes. No code depends on them; lists only get slower.
BEGIN;
DROP INDEX IF EXISTS public.telefun_history_owner_created_idx;
DROP INDEX IF EXISTS public.pdkt_history_owner_timestamp_idx;
DROP INDEX IF EXISTS public.pdkt_mailbox_items_activity_idx;
COMMIT;
