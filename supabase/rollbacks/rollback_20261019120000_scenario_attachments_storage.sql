-- Rollback for 20261019120000_scenario_attachments_storage.sql: drops the
-- backfill helpers. The scenario-attachments bucket and its files stay: rows
-- written or backfilled since the migration hold their URLs, and deleting the
-- files would break those attachments. Revert the API first so new saves stop
-- uploading; old code still shows URL attachments.
BEGIN;
DROP FUNCTION IF EXISTS public.scenario_attachment_backfill_apply(text, uuid[], text[], text[]);
DROP FUNCTION IF EXISTS public.scenario_attachment_backfill_fetch(text, uuid[], text[]);
DROP FUNCTION IF EXISTS public.scenario_attachment_backfill_scan(text, uuid, integer);
DROP FUNCTION IF EXISTS public.scenario_attachment_swap(text, text[], text[]);
DROP FUNCTION IF EXISTS public.scenario_attachment_literal_pattern();
DROP FUNCTION IF EXISTS public.scenario_attachment_backfill_columns(text);
COMMIT;
