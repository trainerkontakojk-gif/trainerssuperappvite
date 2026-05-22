-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 004_admin_core.sql
-- Description: Removes admin management tables (activity_logs, access_groups,
--              access_group_items, leader_access_requests, leader_access_request_groups),
--              the get_leader_approved_scope_items function, triggers, and RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--   (010_activity_logs_index only adds an index which can be rolled back separately)
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping these tables will permanently delete:
--   - activity_logs (all system audit trail data)
--   - access_groups, access_group_items (access control configurations)
--   - leader_access_requests, leader_access_request_groups (approval workflows)
--   BACKUP REQUIRED:
--     pg_dump -t public.activity_logs -t public.access_groups \
--       -t public.leader_access_requests > admin_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop function
DROP FUNCTION IF EXISTS public.get_leader_approved_scope_items(uuid, text);

-- 2. Drop triggers
DROP TRIGGER IF EXISTS update_access_groups_updated_at ON public.access_groups;
DROP TRIGGER IF EXISTS update_access_group_items_updated_at ON public.access_group_items;
DROP TRIGGER IF EXISTS update_leader_access_requests_updated_at ON public.leader_access_requests;

-- 3. Drop RLS policies
DROP POLICY IF EXISTS "Admin and trainers select and insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Admin and trainer manage access groups" ON public.access_groups;
DROP POLICY IF EXISTS "Admin and trainer manage access group items" ON public.access_group_items;
DROP POLICY IF EXISTS "Leader views own requests" ON public.leader_access_requests;
DROP POLICY IF EXISTS "Leader inserts own pending request" ON public.leader_access_requests;
DROP POLICY IF EXISTS "Admin and trainer manage leader access requests" ON public.leader_access_requests;
DROP POLICY IF EXISTS "Admin and trainer manage access request groups" ON public.leader_access_request_groups;
DROP POLICY IF EXISTS "Leader views own request groups" ON public.leader_access_request_groups;

-- 4. Drop indexes
DROP INDEX IF EXISTS public.idx_access_group_items_group_id;
DROP INDEX IF EXISTS public.idx_leader_access_requests_user_id;
DROP INDEX IF EXISTS public.idx_leader_access_requests_module;
DROP INDEX IF EXISTS public.idx_leader_access_requests_status;
DROP INDEX IF EXISTS public.uq_leader_access_requests_active_per_user_module;
DROP INDEX IF EXISTS public.idx_leader_access_request_groups_request_id;
DROP INDEX IF EXISTS public.idx_leader_access_request_groups_group_id;

-- 5. Drop tables (order matters due to FK constraints)
DROP TABLE IF EXISTS public.leader_access_request_groups CASCADE;
DROP TABLE IF EXISTS public.leader_access_requests CASCADE;
DROP TABLE IF EXISTS public.access_group_items CASCADE;
DROP TABLE IF EXISTS public.access_groups CASCADE;
DROP TABLE IF EXISTS public.activity_logs CASCADE;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT table_name AS missing_table, 'should not exist' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'activity_logs', 'access_groups', 'access_group_items',
    'leader_access_requests', 'leader_access_request_groups'
  )
UNION ALL
SELECT 'FUNCTION get_leader_approved_scope_items', COUNT(*)::text
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'get_leader_approved_scope_items';
