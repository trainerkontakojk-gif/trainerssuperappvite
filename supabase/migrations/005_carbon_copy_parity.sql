-- Migration: 005_carbon_copy_parity.sql
-- Extends schemas and definitions for PDKT Mailbox, Telefun Voice, and Profiler reordering.

-- 1. Extend pdkt_mailbox_items
ALTER TABLE public.pdkt_mailbox_items 
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS client_request_id TEXT,
  ADD COLUMN IF NOT EXISTS share_batch_id UUID,
  ADD COLUMN IF NOT EXISTS is_shared_copy BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_mailbox_item_id UUID REFERENCES public.pdkt_mailbox_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pdkt_mailbox_client_req 
  ON public.pdkt_mailbox_items (created_by_user_id, client_request_id) 
  WHERE client_request_id IS NOT NULL;

-- 2. PDKT Mailbox RPCs
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
          AND p.is_deleted = false
          AND LOWER(TRIM(p.role)) IN ('leader', 'agent', 'agents', 'leaders');
    END IF;

    RETURN v_source_item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_batch(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, JSONB) TO authenticated;

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

GRANT EXECUTE ON FUNCTION public.submit_pdkt_mailbox_reply(UUID, JSONB, INTEGER) TO authenticated;

-- 3. Extend telefun_history & create supporting replay tables
ALTER TABLE public.telefun_history 
  ADD COLUMN IF NOT EXISTS recording_path TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_recording_path TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS voice_assessment JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS session_metrics JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS voice_dashboard_metrics JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disruption_config JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disruption_results JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS persona_config JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS realistic_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.telefun_coaching_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES public.telefun_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendations JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telefun_coaching_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own coaching summaries"
  ON public.telefun_coaching_summary FOR SELECT
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.telefun_replay_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.telefun_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp_ms INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('strength', 'improvement_area', 'critical_moment', 'technique_used')),
  moment TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 500),
  is_manual BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telefun_replay_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own replay annotations"
  ON public.telefun_replay_annotations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own replay annotations"
  ON public.telefun_replay_annotations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND is_manual = true AND
    EXISTS (
      SELECT 1 FROM public.telefun_history
      WHERE id = session_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own replay annotations"
  ON public.telefun_replay_annotations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.upsert_telefun_coaching_summary(
  p_session_id UUID,
  p_recommendations JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_session_owner UUID;
  v_summary_id UUID;
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Access denied: Anonymous users cannot upsert coaching summaries.';
  END IF;

  IF auth.role() = 'service_role' THEN
    SELECT user_id INTO v_user_id FROM public.telefun_history WHERE id = p_session_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve user_id for this session.';
  END IF;

  SELECT user_id INTO v_session_owner FROM public.telefun_history WHERE id = p_session_id;

  IF v_session_owner IS NULL THEN
    RAISE EXCEPTION 'Session not found: %', p_session_id;
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF v_session_owner <> v_user_id THEN
      RAISE EXCEPTION 'Access denied: You do not own this session.';
    END IF;
  END IF;

  IF p_recommendations IS NULL OR jsonb_typeof(p_recommendations) <> 'array' THEN
    RAISE EXCEPTION 'Invalid input: recommendations must be a non-null JSON array.';
  END IF;

  IF jsonb_array_length(p_recommendations) > 5 THEN
    RAISE EXCEPTION 'Invalid input: recommendations must contain at most 5 items.';
  END IF;

  INSERT INTO public.telefun_coaching_summary (session_id, user_id, recommendations, generated_at)
  VALUES (p_session_id, v_user_id, p_recommendations, now())
  ON CONFLICT (session_id)
  DO UPDATE SET
    recommendations = EXCLUDED.recommendations,
    generated_at = EXCLUDED.generated_at
  RETURNING id INTO v_summary_id;

  RETURN v_summary_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB) TO authenticated, service_role;

-- 4. Profiler Peserta Reordering
CREATE OR REPLACE FUNCTION public.bulk_reorder_profiler_peserta(p_updates JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_total_rows INTEGER;
  v_distinct_ids INTEGER;
  v_distinct_order_numbers INTEGER;
  v_updated_rows INTEGER;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT lower(coalesce(role, '')) INTO v_role FROM public.profiles WHERE id = v_user_id;

  IF v_role NOT IN ('trainer', 'trainers', 'admin') THEN
    RAISE EXCEPTION 'Akses ditolak: role tidak memiliki izin untuk reorder peserta';
  END IF;

  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' OR jsonb_array_length(p_updates) = 0 THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT id) INTO v_total_rows, v_distinct_ids
  FROM jsonb_to_recordset(p_updates) AS u(id UUID, nomor_urut INTEGER);

  IF v_total_rows <> v_distinct_ids THEN
    RAISE EXCEPTION 'Payload reorder mengandung id duplikat';
  END IF;

  SELECT COUNT(DISTINCT nomor_urut) INTO v_distinct_order_numbers
  FROM jsonb_to_recordset(p_updates) AS u(id UUID, nomor_urut INTEGER);

  IF v_total_rows <> v_distinct_order_numbers THEN
    RAISE EXCEPTION 'Payload reorder mengandung nomor_urut duplikat';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_updates) AS u(id UUID, nomor_urut INTEGER)
    WHERE u.id IS NULL OR u.nomor_urut IS NULL OR u.nomor_urut < 1
  ) THEN
    RAISE EXCEPTION 'Payload reorder tidak valid';
  END IF;

  UPDATE public.profiler_peserta AS p
  SET nomor_urut = u.nomor_urut
  FROM jsonb_to_recordset(p_updates) AS u(id UUID, nomor_urut INTEGER)
  WHERE p.id = u.id;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows <> v_total_rows THEN
    RAISE EXCEPTION 'Sebagian data reorder tidak ditemukan atau tidak ter-update';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_reorder_profiler_peserta(JSONB) TO authenticated;

-- 5. Storage Buckets configuration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('telefun-recordings', 'telefun-recordings', false, 52428800, 
        ARRAY['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4']::TEXT[])
ON CONFLICT (id) DO UPDATE SET 
  public = false, 
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users upload own telefun recordings" ON storage.objects;
CREATE POLICY "Users upload own telefun recordings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'telefun-recordings' 
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users read own telefun recordings" ON storage.objects;
CREATE POLICY "Users read own telefun recordings" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'telefun-recordings' 
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Users update own telefun recordings" ON storage.objects;
CREATE POLICY "Users update own telefun recordings" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'telefun-recordings' 
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  )
  WITH CHECK (
    bucket_id = 'telefun-recordings' 
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );
