-- New replies belong to the reply-time selection, not the immutable mailbox
-- creator subject. Existing history and mailbox attribution are never rewritten.
-- Unique RPC name avoids PostgREST overload ambiguity.
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_reply_with_subject(
    p_mailbox_id UUID,
    p_agent_reply JSONB,
    p_time_taken INTEGER,
    p_subject_type TEXT,
    p_subject_peserta_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_replier_name TEXT;
    v_user_status TEXT;
    v_user_deleted BOOLEAN;
    v_item RECORD;
    v_history_id UUID;
    v_updated_thread JSONB;
    v_now TIMESTAMPTZ := now();
    v_hist_name TEXT;
    v_hist_batch TEXT;
    v_hist_team TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT role, full_name, status, is_deleted
      INTO v_user_role, v_replier_name, v_user_status, v_user_deleted
      FROM public.profiles WHERE id = v_user_id;
    IF NOT FOUND OR COALESCE(v_user_deleted, FALSE)
      OR LOWER(TRIM(COALESCE(v_user_status, ''))) NOT IN ('active', 'approved') THEN
        RAISE EXCEPTION 'FORBIDDEN: akun tidak aktif' USING ERRCODE = '42501';
    END IF;

    -- Caller chooses only a type/ID; never trust supplied names or the mailbox.
    IF p_subject_type IS NULL OR p_subject_type NOT IN ('self', 'participant')
      OR (p_subject_type = 'self' AND p_subject_peserta_id IS NOT NULL)
      OR (p_subject_type = 'participant' AND p_subject_peserta_id IS NULL) THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: pilihan peserta tidak valid';
    END IF;
    IF p_subject_type = 'participant' THEN
        IF LOWER(TRIM(COALESCE(v_user_role, ''))) NOT IN ('admin', 'trainer') THEN
            RAISE EXCEPTION 'FORBIDDEN: participant attribution requires admin/trainer';
        END IF;
        SELECT nama, batch_name, tim INTO v_hist_name, v_hist_batch, v_hist_team
          FROM public.profiler_peserta WHERE id = p_subject_peserta_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: peserta tidak ditemukan';
        END IF;
        v_hist_name := NULLIF(btrim(v_hist_name), '');
        IF v_hist_name IS NULL THEN
            RAISE EXCEPTION 'VALIDATION_ERROR: data peserta tidak valid';
        END IF;
    ELSE
        v_hist_name := COALESCE(NULLIF(btrim(v_replier_name), ''), 'Diri sendiri');
    END IF;

    -- The mailbox is shared with active users (existing PDKT contract). Lock
    -- before the terminal-state checks so exactly one reply/evaluation wins.
    SELECT * INTO v_item FROM public.pdkt_mailbox_items
     WHERE id = p_mailbox_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mailbox item not found';
    END IF;
    IF v_item.status = 'replied' THEN
        RETURN jsonb_build_object('history_id', v_item.history_id, 'created', false);
    END IF;
    IF v_item.status = 'deleted' THEN
        RAISE EXCEPTION 'Cannot reply to a deleted email';
    END IF;

    v_updated_thread := jsonb_build_array(v_item.inbound_email) || p_agent_reply;
    INSERT INTO public.pdkt_history (
        user_id, timestamp, config, emails, evaluation_status, time_taken,
        simulation_subject_type, simulation_subject_peserta_id,
        simulation_subject_name, simulation_subject_batch_name, simulation_subject_team
    ) VALUES (
        v_user_id, v_now, v_item.config_snapshot, v_updated_thread, 'processing', p_time_taken,
        p_subject_type, p_subject_peserta_id, v_hist_name, v_hist_batch, v_hist_team
    ) RETURNING id INTO v_history_id;

    UPDATE public.pdkt_mailbox_items
       SET status = 'replied', replied_at = v_now, history_id = v_history_id,
           emails_thread = v_updated_thread, last_activity_at = v_now, updated_at = v_now
     WHERE id = p_mailbox_id;

    RETURN jsonb_build_object('history_id', v_history_id, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_pdkt_mailbox_reply_with_subject(UUID, JSONB, INTEGER, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply_with_subject(UUID, JSONB, INTEGER, TEXT, UUID) TO authenticated;

-- Keep both old signatures and their return shapes. Without a selection,
-- attribute to the verified replier's self, never inherit creator metadata.
-- The legacy UUID wrapper already delegates to this outcome function.
CREATE OR REPLACE FUNCTION public.submit_pdkt_mailbox_reply_with_outcome(
    p_mailbox_id UUID,
    p_agent_reply JSONB,
    p_time_taken INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN public.submit_pdkt_mailbox_reply_with_subject(
        p_mailbox_id, p_agent_reply, p_time_taken, 'self', NULL
    );
END;
$$;

-- Existing legacy client RPC ACLs remain unchanged; the new RPC independently
-- validates auth.uid(), including when reached via a SECURITY DEFINER wrapper.
NOTIFY pgrst, 'reload schema';
