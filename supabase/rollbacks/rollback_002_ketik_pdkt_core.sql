-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 002_ketik_pdkt_core.sql
-- Description: Removes KETIK, PDKT, and AI usage/pricing/billing tables,
--              their indexes, and RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Requires prior rollback of [003, 005]
--   - 003_telefun_core inserts into ai_pricing_settings
--   - 005_carbon_copy_parity extends pdkt_mailbox_items and adds functions
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping these tables will permanently delete:
--   - ai_pricing_settings, ai_billing_settings, ai_usage_logs (all AI billing data)
--   - ketik_history, ketik_session_reviews, ketik_typo_findings, ketik_review_jobs
--   - pdkt_history, pdkt_mailbox_items
--   BACKUP REQUIRED:
--     pg_dump -t ai_usage_logs -t ketik_history -t pdkt_history > ketik_pdkt_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop RLS policies
DROP POLICY IF EXISTS "ai_pricing_settings_select" ON ai_pricing_settings;
DROP POLICY IF EXISTS "ai_billing_settings_select" ON ai_billing_settings;
DROP POLICY IF EXISTS "ai_usage_logs_select_own" ON ai_usage_logs;
DROP POLICY IF EXISTS "ketik_history_select_own" ON ketik_history;
DROP POLICY IF EXISTS "ketik_history_insert_own" ON ketik_history;
DROP POLICY IF EXISTS "ketik_session_reviews_select_own" ON ketik_session_reviews;
DROP POLICY IF EXISTS "ketik_typo_findings_select_own" ON ketik_typo_findings;
DROP POLICY IF EXISTS "ketik_review_jobs_select_own" ON ketik_review_jobs;
DROP POLICY IF EXISTS "pdkt_history_select_own" ON pdkt_history;
DROP POLICY IF EXISTS "pdkt_history_insert_own" ON pdkt_history;
DROP POLICY IF EXISTS "pdkt_mailbox_select_own" ON pdkt_mailbox_items;
DROP POLICY IF EXISTS "pdkt_mailbox_insert_own" ON pdkt_mailbox_items;
DROP POLICY IF EXISTS "pdkt_mailbox_update_own" ON pdkt_mailbox_items;

-- 2. Drop indexes
DROP INDEX IF EXISTS idx_ai_usage_logs_user_id;
DROP INDEX IF EXISTS idx_ai_usage_logs_module;
DROP INDEX IF EXISTS idx_ai_usage_logs_created_at;
DROP INDEX IF EXISTS idx_ai_usage_logs_model_id;
DROP INDEX IF EXISTS idx_ketik_history_user_id;
DROP INDEX IF EXISTS idx_ketik_history_date;
DROP INDEX IF EXISTS idx_pdkt_history_user_id;
DROP INDEX IF EXISTS idx_pdkt_history_timestamp;
DROP INDEX IF EXISTS idx_pdkt_mailbox_user_id;
DROP INDEX IF EXISTS idx_pdkt_mailbox_status;

-- 3. Drop tables (order matters due to FK constraints)
DROP TABLE IF EXISTS pdkt_mailbox_items CASCADE;
DROP TABLE IF EXISTS pdkt_history CASCADE;
DROP TABLE IF EXISTS ketik_review_jobs CASCADE;
DROP TABLE IF EXISTS ketik_typo_findings CASCADE;
DROP TABLE IF EXISTS ketik_session_reviews CASCADE;
DROP TABLE IF EXISTS ketik_history CASCADE;
DROP TABLE IF EXISTS ai_usage_logs CASCADE;
DROP TABLE IF EXISTS ai_billing_settings CASCADE;
DROP TABLE IF EXISTS ai_pricing_settings CASCADE;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT table_name AS missing_table, 'should not exist' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'ai_pricing_settings', 'ai_billing_settings', 'ai_usage_logs',
    'ketik_history', 'ketik_session_reviews', 'ketik_typo_findings', 'ketik_review_jobs',
    'pdkt_history', 'pdkt_mailbox_items'
  );
