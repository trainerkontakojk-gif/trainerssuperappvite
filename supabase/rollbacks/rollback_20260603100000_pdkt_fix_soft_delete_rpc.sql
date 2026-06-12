-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260603100000_pdkt_fix_soft_delete_rpc.sql
-- Description: Reverts soft_delete_pdkt_mailbox_item to the version BEFORE
--              the COALESCE fix (from migration 20260603090000_pdkt_shared_mailbox_policy).
--              The original version uses created_by_user_id directly instead of
--              COALESCE(created_by_user_id, user_id).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: pdkt_mailbox_items and profiles tables must exist
--
-- No data loss: Function body replacement only.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.soft_delete_pdkt_mailbox_item(p_mailbox_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role TEXT;
    v_creator_id UUID;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor_id;
    SELECT created_by_user_id INTO v_creator_id FROM public.pdkt_mailbox_items WHERE id = p_mailbox_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mailbox item not found';
    END IF;

    -- Policy: admin/trainer can delete any. Others only their own.
    IF LOWER(TRIM(v_actor_role)) IN ('admin', 'trainer') OR v_creator_id = v_actor_id THEN
        UPDATE public.pdkt_mailbox_items
        SET status = 'deleted',
            deleted_at = now(),
            updated_at = now()
        WHERE id = p_mailbox_id;
    ELSE
        RAISE EXCEPTION 'Forbidden: Anda hanya dapat menghapus email yang Anda buat sendiri.';
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_pdkt_mailbox_item(UUID) TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: Function should exist
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'FUNCTION soft_delete_pdkt_mailbox_item' AS object_type, COUNT(*) AS exists_count
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'soft_delete_pdkt_mailbox_item'
  AND routine_type = 'FUNCTION';
