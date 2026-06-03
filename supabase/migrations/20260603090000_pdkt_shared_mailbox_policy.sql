-- Migration: 20260603090000_pdkt_shared_mailbox_policy.sql
-- Updates PDKT Mailbox to a shared/canonical mailbox structure without per-user fanout.

-- 1. Backfill created_by_user_id where it's NULL
UPDATE public.pdkt_mailbox_items
SET created_by_user_id = user_id
WHERE created_by_user_id IS NULL;

-- 2. Update select policy to allow all authenticated users to read all shared mailbox items
DROP POLICY IF EXISTS "pdkt_mailbox_select_own" ON public.pdkt_mailbox_items;
CREATE POLICY "pdkt_mailbox_select_all" ON public.pdkt_mailbox_items
  FOR SELECT TO authenticated USING (true);

-- 3. Update the submit_pdkt_mailbox_batch RPC function
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
    v_source_item_id UUID;
    v_existing_id UUID;
BEGIN
    v_creator_id := auth.uid();
    
    IF v_creator_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Idempotency check: search by created_by_user_id and client_request_id
    IF p_client_request_id IS NOT NULL THEN
        SELECT id INTO v_existing_id
        FROM public.pdkt_mailbox_items
        WHERE created_by_user_id = v_creator_id
          AND client_request_id = p_client_request_id
          AND is_shared_copy = false
        LIMIT 1;

        IF v_existing_id IS NOT NULL THEN
            RETURN v_existing_id;
        END IF;
    END IF;

    -- Insert only ONE canonical row
    INSERT INTO public.pdkt_mailbox_items (
        user_id,
        created_by_user_id,
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
        is_shared_copy
    ) VALUES (
        v_creator_id,
        v_creator_id,
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
        false
    ) RETURNING id INTO v_source_item_id;

    RETURN v_source_item_id;
END;
$$;

-- 4. Update the submit_pdkt_mailbox_reply RPC function to work with shared rows
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

    -- Select the canonical mailbox item (since it's shared, do not enforce user_id = v_user_id)
    SELECT * INTO v_item
    FROM public.pdkt_mailbox_items
    WHERE id = p_mailbox_id
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
        last_activity_at = v_now,
        updated_at = v_now
    WHERE id = p_mailbox_id;

    RETURN v_history_id;
END;
$$;

-- 5. Add a delete RPC function for security-controlled soft-deletes
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

-- Grant permissions explicitly
GRANT EXECUTE ON FUNCTION public.soft_delete_pdkt_mailbox_item(UUID) TO authenticated;
