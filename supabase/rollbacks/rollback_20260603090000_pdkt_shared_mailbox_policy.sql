-- Rollback: 20260603090000_pdkt_shared_mailbox_policy.sql
-- Restores the pre-shared PDKT mailbox behavior from 005_carbon_copy_parity.sql.
-- WARNING: This rollback does not delete mailbox/history data created while the
-- shared mailbox migration was active. Review those rows before any cleanup.

BEGIN;

-- 1. Restore owner-only mailbox SELECT policy.
DROP POLICY IF EXISTS "pdkt_mailbox_select_all" ON public.pdkt_mailbox_items;
DROP POLICY IF EXISTS "pdkt_mailbox_select_own" ON public.pdkt_mailbox_items;
CREATE POLICY "pdkt_mailbox_select_own" ON public.pdkt_mailbox_items
  FOR SELECT USING (auth.uid() = user_id);

-- 2. Restore the legacy fanout batch RPC.
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_batch(
    p_client_request_id TEXT,
    p_sender_name TEXT,
    p_sender_email TEXT,
    p_subject TEXT,
    p_snippet TEXT,
    p_scenario_snapshot JSONB,
    p_config_snapshot JSONB,
    p_inbound_email JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id UUID;
    v_creator_role TEXT;
    v_batch_id UUID;
    v_source_item_id UUID;
    v_existing_id UUID;
BEGIN
    v_creator_id := auth.uid();
    v_batch_id := gen_random_uuid();

    IF v_creator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT role INTO v_creator_role FROM public.profiles WHERE id = v_creator_id;

    IF p_client_request_id IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM public.pdkt_mailbox_items
        WHERE created_by_user_id = v_creator_id
          AND client_request_id = p_client_request_id
          AND user_id = v_creator_id
          AND is_shared_copy = false
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            RETURN v_existing_id;
        END IF;
    END IF;

    INSERT INTO public.pdkt_mailbox_items (
        user_id,
        created_by_user_id,
        client_request_id,
        share_batch_id,
        sender_name,
        sender_email,
        subject,
        snippet,
        scenario_snapshot,
        config_snapshot,
        inbound_email,
        emails_thread,
        status,
        is_shared_copy
    ) VALUES (
        v_creator_id,
        v_creator_id,
        p_client_request_id,
        v_batch_id,
        p_sender_name,
        p_sender_email,
        p_subject,
        p_snippet,
        p_scenario_snapshot,
        p_config_snapshot,
        p_inbound_email,
        jsonb_build_array(p_inbound_email),
        'open',
        false
    ) RETURNING id INTO v_source_item_id;

    IF LOWER(TRIM(v_creator_role)) IN ('admin', 'trainer', 'trainers') THEN
        INSERT INTO public.pdkt_mailbox_items (
            user_id,
            created_by_user_id,
            source_mailbox_item_id,
            share_batch_id,
            client_request_id,
            sender_name,
            sender_email,
            subject,
            snippet,
            scenario_snapshot,
            config_snapshot,
            inbound_email,
            emails_thread,
            status,
            is_shared_copy,
            shared_at
        )
        SELECT
            p.id,
            v_creator_id,
            v_source_item_id,
            v_batch_id,
            p_client_request_id,
            p_sender_name,
            p_sender_email,
            p_subject,
            p_snippet,
            p_scenario_snapshot,
            p_config_snapshot,
            p_inbound_email,
            jsonb_build_array(p_inbound_email),
            'open',
            true,
            now()
        FROM public.profiles p
        WHERE p.id != v_creator_id
          AND p.status = 'approved'
          AND (p.is_deleted IS NULL OR p.is_deleted = false)
          AND LOWER(TRIM(p.role)) IN ('leader', 'agent', 'agents', 'leaders');
    END IF;

    RETURN v_source_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) TO authenticated;

-- 3. Restore the legacy owner-only reply RPC.
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_reply(
    p_mailbox_id UUID,
    p_agent_reply JSONB,
    p_time_taken INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_item RECORD;
    v_history_id UUID;
    v_updated_thread JSONB;
    v_now TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    v_now := now();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_item
    FROM public.pdkt_mailbox_items
    WHERE id = p_mailbox_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mailbox item not found';
    END IF;

    IF v_item.status = 'replied' THEN
        RETURN v_item.history_id;
    END IF;

    IF v_item.status = 'deleted' THEN
        RAISE EXCEPTION 'Cannot reply to a deleted email';
    END IF;

    v_updated_thread := jsonb_build_array(v_item.inbound_email) || p_agent_reply;

    INSERT INTO public.pdkt_history (
        user_id,
        timestamp,
        config,
        emails,
        evaluation_status,
        time_taken
    ) VALUES (
        v_user_id,
        v_now,
        v_item.config_snapshot,
        v_updated_thread,
        'processing',
        p_time_taken
    ) RETURNING id INTO v_history_id;

    UPDATE public.pdkt_mailbox_items
    SET
        status = 'replied',
        replied_at = v_now,
        history_id = v_history_id,
        emails_thread = v_updated_thread,
        last_activity_at = v_now
    WHERE id = p_mailbox_id;

    RETURN v_history_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply(UUID, JSONB, INTEGER) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply(UUID, JSONB, INTEGER) TO authenticated;

-- 4. Remove the shared-mailbox delete RPC introduced by the forward migration.
REVOKE EXECUTE ON FUNCTION public.soft_delete_pdkt_mailbox_item(UUID) FROM authenticated;
DROP FUNCTION IF EXISTS public.soft_delete_pdkt_mailbox_item(UUID);

COMMIT;

-- Verification hints:
-- SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pdkt_mailbox_items';
-- SELECT proname FROM pg_proc WHERE proname IN ('submit_pdkt_mailbox_batch', 'submit_pdkt_mailbox_reply', 'soft_delete_pdkt_mailbox_item');
