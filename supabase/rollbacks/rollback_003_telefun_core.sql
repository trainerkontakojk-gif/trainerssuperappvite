-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 003_telefun_core.sql
-- Description: Removes the telefun_history table, its indexes, RLS policies,
--              and the seeded ai_pricing_settings row for gemini-3.1-flash-live-preview.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Requires prior rollback of [005]
--   - 005_carbon_copy_parity extends telefun_history with additional columns
--     and creates telefun_coaching_summary and telefun_replay_annotations
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping telefun_history will permanently delete ALL voice simulation history.
--   BACKUP REQUIRED: pg_dump -t telefun_history > telefun_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Remove seeded pricing row
DELETE FROM ai_pricing_settings WHERE model_id = 'gemini-3.1-flash-live-preview';

-- 2. Drop RLS policies
DROP POLICY IF EXISTS "telefun_history_select_own" ON telefun_history;
DROP POLICY IF EXISTS "telefun_history_insert_own" ON telefun_history;
DROP POLICY IF EXISTS "telefun_history_update_own" ON telefun_history;

-- 3. Drop indexes
DROP INDEX IF EXISTS idx_telefun_history_user_id;
DROP INDEX IF EXISTS idx_telefun_history_created_at;

-- 4. Drop table
DROP TABLE IF EXISTS telefun_history CASCADE;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'TABLE telefun_history' AS object_type, COUNT(*) AS exists_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'telefun_history'
UNION ALL
SELECT 'PRICING ROW gemini-3.1-flash-live-preview', COUNT(*)
FROM ai_pricing_settings WHERE model_id = 'gemini-3.1-flash-live-preview';
