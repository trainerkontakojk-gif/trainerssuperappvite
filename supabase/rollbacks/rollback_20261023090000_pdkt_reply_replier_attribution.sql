-- Revert API/web first. Restore creator-derived attribution for FUTURE replies.
-- No historical rows or mailbox metadata are changed or removed.
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_reply_with_outcome(
    p_mailbox_id UUID,
    p_agent_reply JSONB,
    p_time_taken INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_user_role TEXT;
    v_replier_name TEXT;
    v_user_status TEXT;
    v_user_deleted BOOLEAN;
    v_item RECORD;
    v_history_id UUID;
    v_updated_thread JSONB;
    v_now TIMESTAMPTZ;
    v_hist_type TEXT;
    v_hist_peserta UUID;
    v_hist_name TEXT;
    v_hist_batch TEXT;
    v_hist_team TEXT;
BEGIN
    v_user_id := auth.uid();
    v_now := now();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_item FROM public.pdkt_mailbox_items WHERE id = p_mailbox_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mailbox item not found';
    END IF;

    -- Validate the retrying actor before the replied fast path. Otherwise a
    -- shared-mailbox retry could receive an existing history ID without an
    -- active profile/role check and start work under the wrong actor.
    SELECT role, full_name, status, is_deleted INTO v_user_role, v_replier_name, v_user_status, v_user_deleted FROM public.profiles WHERE id = v_user_id;
    IF NOT FOUND OR COALESCE(v_user_deleted, FALSE) OR LOWER(TRIM(COALESCE(v_user_status,''))) NOT IN ('active','approved') THEN
        RAISE EXCEPTION 'FORBIDDEN: akun tidak aktif';
    END IF;
    IF v_item.simulation_subject_type = 'participant'
      AND LOWER(TRIM(COALESCE(v_user_role, ''))) NOT IN ('admin', 'trainer') THEN
        RAISE EXCEPTION 'FORBIDDEN: participant reply requires admin/trainer';
    END IF;

    IF v_item.status = 'replied' THEN
        RETURN jsonb_build_object('history_id', v_item.history_id, 'created', false);
    END IF;
    IF v_item.status = 'deleted' THEN
        RAISE EXCEPTION 'Cannot reply to a deleted email';
    END IF;

    IF v_item.simulation_subject_type = 'participant' THEN
        IF LOWER(TRIM(COALESCE(v_user_role, ''))) NOT IN ('admin', 'trainer') THEN
            RAISE EXCEPTION 'FORBIDDEN: participant reply requires admin/trainer';
        END IF;
        v_hist_type := 'participant';
        v_hist_peserta := v_item.simulation_subject_peserta_id;
        v_hist_name := v_item.simulation_subject_name;
        v_hist_batch := v_item.simulation_subject_batch_name;
        v_hist_team := v_item.simulation_subject_team;
    ELSIF v_item.simulation_subject_type = 'self' THEN
        v_hist_type := 'self';
        v_hist_peserta := NULL;
        v_hist_name := NULLIF(btrim(COALESCE(v_replier_name, '')), '');
        IF v_hist_name IS NULL THEN
            v_hist_name := 'Diri sendiri';
        END IF;
        v_hist_batch := NULL;
        v_hist_team := NULL;
    ELSE
        v_hist_type := NULL;
        v_hist_peserta := NULL;
        v_hist_name := NULL;
        v_hist_batch := NULL;
        v_hist_team := NULL;
    END IF;

    v_updated_thread := jsonb_build_array(v_item.inbound_email) || p_agent_reply;

    INSERT INTO public.pdkt_history (
        user_id, timestamp, config, emails, evaluation_status, time_taken,
        simulation_subject_type, simulation_subject_peserta_id,
        simulation_subject_name, simulation_subject_batch_name, simulation_subject_team
    ) VALUES (
        v_user_id, v_now, v_item.config_snapshot, v_updated_thread, 'processing', p_time_taken,
        v_hist_type, v_hist_peserta, v_hist_name, v_hist_batch, v_hist_team
    ) RETURNING id INTO v_history_id;

    UPDATE public.pdkt_mailbox_items
    SET status = 'replied', replied_at = v_now, history_id = v_history_id,
        emails_thread = v_updated_thread, last_activity_at = v_now, updated_at = now()
    WHERE id = p_mailbox_id;

    RETURN jsonb_build_object('history_id', v_history_id, 'created', true);
END;
$$;


DROP FUNCTION IF EXISTS public.submit_pdkt_mailbox_reply_with_subject(UUID, JSONB, INTEGER, TEXT, UUID);
NOTIFY pgrst, 'reload schema';
