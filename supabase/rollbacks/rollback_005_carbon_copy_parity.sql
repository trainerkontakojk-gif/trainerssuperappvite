-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 005_carbon_copy_parity.sql
-- Description: Removes extensions to pdkt_mailbox_items, telefun_history columns,
--              telefun_coaching_summary, telefun_replay_annotations tables,
--              RPC functions (submit_pdkt_mailbox_batch, submit_pdkt_mailbox_reply,
--              upsert_telefun_coaching_summary, bulk_reorder_profiler_peserta),
--              and telefun-recordings storage bucket with policies.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--
-- ⚠️  DATA LOSS WARNING:
--   - Dropping columns from pdkt_mailbox_items loses shared copy metadata
--   - Dropping telefun_coaching_summary loses all coaching recommendations
--   - Dropping telefun_replay_annotations loses all replay annotations
--   - Removing telefun-recordings bucket deletes all stored audio recordings
--   BACKUP REQUIRED:
--     pg_dump -t public.telefun_coaching_summary -t public.telefun_replay_annotations > carbon_copy_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop functions
DROP FUNCTION IF EXISTS public.submit_pdkt_mailbox_batch(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.submit_pdkt_mailbox_reply(UUID, JSONB, INTEGER);
DROP FUNCTION IF EXISTS public.upsert_telefun_coaching_summary(UUID, JSONB);
DROP FUNCTION IF EXISTS public.bulk_reorder_profiler_peserta(JSONB);

-- 2. Drop storage policies for telefun-recordings
DROP POLICY IF EXISTS "Users upload own telefun recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users read own telefun recordings" ON storage.objects;
DROP POLICY IF EXISTS "Users update own telefun recordings" ON storage.objects;

-- 3. Remove telefun-recordings bucket
DELETE FROM storage.objects WHERE bucket_id = 'telefun-recordings';
DELETE FROM storage.buckets WHERE id = 'telefun-recordings';

-- 4. Drop telefun_replay_annotations
DROP POLICY IF EXISTS "Users can view their own replay annotations" ON public.telefun_replay_annotations;
DROP POLICY IF EXISTS "Users can insert their own replay annotations" ON public.telefun_replay_annotations;
DROP POLICY IF EXISTS "Users can delete their own replay annotations" ON public.telefun_replay_annotations;
DROP TABLE IF EXISTS public.telefun_replay_annotations CASCADE;

-- 5. Drop telefun_coaching_summary
DROP POLICY IF EXISTS "Users can view their own coaching summaries" ON public.telefun_coaching_summary;
DROP TABLE IF EXISTS public.telefun_coaching_summary CASCADE;

-- 6. Remove added columns from telefun_history
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS recording_path;
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS agent_recording_path;
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS voice_assessment;
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS session_metrics;
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS voice_dashboard_metrics;
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS disruption_config;
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS disruption_results;
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS persona_config;
ALTER TABLE public.telefun_history DROP COLUMN IF EXISTS realistic_mode_enabled;

-- 7. Remove added columns from pdkt_mailbox_items
DROP INDEX IF EXISTS idx_pdkt_mailbox_client_req;
ALTER TABLE public.pdkt_mailbox_items DROP COLUMN IF EXISTS created_by_user_id;
ALTER TABLE public.pdkt_mailbox_items DROP COLUMN IF EXISTS client_request_id;
ALTER TABLE public.pdkt_mailbox_items DROP COLUMN IF EXISTS share_batch_id;
ALTER TABLE public.pdkt_mailbox_items DROP COLUMN IF EXISTS is_shared_copy;
ALTER TABLE public.pdkt_mailbox_items DROP COLUMN IF EXISTS shared_at;
ALTER TABLE public.pdkt_mailbox_items DROP COLUMN IF EXISTS source_mailbox_item_id;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'TABLE telefun_coaching_summary' AS object_type, COUNT(*) AS exists_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'telefun_coaching_summary'
UNION ALL
SELECT 'TABLE telefun_replay_annotations', COUNT(*)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'telefun_replay_annotations'
UNION ALL
SELECT 'FUNCTION submit_pdkt_mailbox_batch', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'submit_pdkt_mailbox_batch'
UNION ALL
SELECT 'FUNCTION submit_pdkt_mailbox_reply', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'submit_pdkt_mailbox_reply'
UNION ALL
SELECT 'FUNCTION upsert_telefun_coaching_summary', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'upsert_telefun_coaching_summary'
UNION ALL
SELECT 'FUNCTION bulk_reorder_profiler_peserta', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'bulk_reorder_profiler_peserta'
UNION ALL
SELECT 'BUCKET telefun-recordings', COUNT(*)
FROM storage.buckets WHERE id = 'telefun-recordings'
UNION ALL
SELECT 'COLUMN pdkt_mailbox_items.created_by_user_id', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pdkt_mailbox_items' AND column_name = 'created_by_user_id';
