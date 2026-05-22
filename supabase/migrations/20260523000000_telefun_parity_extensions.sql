-- ═══════════════════════════════════════════════════════
-- Migration: Telefun Parity Extensions
-- Adds missing tables, columns, and storage for full parity.
-- ═══════════════════════════════════════════════════════

-- 1. Create telefun-recordings bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('telefun-recordings', 'telefun-recordings', false, 52428800, 
        ARRAY['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4']::text[])
ON CONFLICT (id) DO UPDATE SET 
  public = false, 
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS Policies for telefun-recordings
DROP POLICY IF EXISTS "Users upload own telefun recordings" ON storage.objects;
CREATE POLICY "Users upload own telefun recordings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'telefun-recordings' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read own telefun recordings" ON storage.objects;
CREATE POLICY "Users read own telefun recordings" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'telefun-recordings' 
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'qa')
      )
    )
  );

DROP POLICY IF EXISTS "Users update own telefun recordings" ON storage.objects;
CREATE POLICY "Users update own telefun recordings" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'telefun-recordings' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'telefun-recordings' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own telefun recordings" ON storage.objects;
CREATE POLICY "Users delete own telefun recordings" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'telefun-recordings' 
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

-- 3. Extend telefun_history with parity columns
ALTER TABLE telefun_history 
  ADD COLUMN IF NOT EXISTS recording_path TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS agent_recording_path TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS voice_assessment JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS session_metrics JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS voice_dashboard_metrics JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disruption_config JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disruption_results JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS persona_config JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS realistic_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Create telefun_coaching_summary table
CREATE TABLE IF NOT EXISTS telefun_coaching_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES telefun_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendations JSONB NOT NULL,
  ai_annotation_count INTEGER DEFAULT NULL,
  ai_annotation_checksum TEXT DEFAULT NULL,
  ai_annotation_completed_at TIMESTAMPTZ DEFAULT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telefun_coaching_summary_ai_annotation_count_check
    CHECK (ai_annotation_count IS NULL OR ai_annotation_count >= 0),
  CONSTRAINT telefun_coaching_summary_ai_annotation_checksum_check
    CHECK (ai_annotation_checksum IS NULL OR ai_annotation_checksum ~ '^[a-f0-9]{64}$')
);

ALTER TABLE telefun_coaching_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own coaching summaries" ON telefun_coaching_summary;
CREATE POLICY "Users can view their own coaching summaries" ON telefun_coaching_summary
  FOR SELECT USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'qa')
    )
  );

REVOKE ALL ON telefun_coaching_summary FROM anon, public;
GRANT SELECT ON telefun_coaching_summary TO authenticated;

CREATE INDEX IF NOT EXISTS idx_telefun_coaching_summary_user_id ON telefun_coaching_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_telefun_coaching_summary_session_id ON telefun_coaching_summary(session_id);

-- 5. Create telefun_replay_annotations table
CREATE TABLE IF NOT EXISTS telefun_replay_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES telefun_history(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp_ms INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('strength', 'improvement_area', 'critical_moment', 'technique_used')),
  moment TEXT NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) <= 500),
  is_manual BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE telefun_replay_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own replay annotations" ON telefun_replay_annotations;
CREATE POLICY "Users can view their own replay annotations" ON telefun_replay_annotations
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'qa')
    )
  );

DROP POLICY IF EXISTS "Users can insert their own replay annotations" ON telefun_replay_annotations;
CREATE POLICY "Users can insert their own replay annotations" ON telefun_replay_annotations
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND is_manual = true AND
    EXISTS (
      SELECT 1 FROM telefun_history
      WHERE id = session_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own replay annotations" ON telefun_replay_annotations;
CREATE POLICY "Users can delete their own replay annotations" ON telefun_replay_annotations
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id AND is_manual = true
  );

REVOKE ALL ON telefun_replay_annotations FROM anon, public;
GRANT SELECT, INSERT, DELETE ON telefun_replay_annotations TO authenticated;

CREATE INDEX IF NOT EXISTS idx_telefun_replay_annotations_session_id ON telefun_replay_annotations(session_id);
CREATE INDEX IF NOT EXISTS idx_telefun_replay_annotations_user_id ON telefun_replay_annotations(user_id);

-- 6. upsert_telefun_coaching_summary RPC
CREATE OR REPLACE FUNCTION public.upsert_telefun_coaching_summary(
  p_session_id UUID,
  p_recommendations JSONB,
  p_ai_annotation_count INTEGER DEFAULT NULL,
  p_ai_annotation_checksum TEXT DEFAULT NULL
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
  v_rec JSONB;
  v_priority NUMERIC;
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Access denied: Anonymous users cannot upsert coaching summaries.';
  END IF;

  IF auth.role() = 'service_role' THEN
    SELECT user_id INTO v_user_id FROM telefun_history WHERE id = p_session_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve user_id for this session.';
  END IF;

  SELECT user_id INTO v_session_owner
  FROM telefun_history
  WHERE id = p_session_id;

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

  FOR v_rec IN SELECT value FROM jsonb_array_elements(p_recommendations) LOOP
    IF jsonb_typeof(v_rec) <> 'object' THEN
      RAISE EXCEPTION 'Invalid recommendation: each item must be a JSON object.';
    END IF;

    IF (SELECT count(*) FROM jsonb_object_keys(v_rec) k WHERE k NOT IN ('text', 'priority')) > 0 THEN
      RAISE EXCEPTION 'Invalid recommendation: object keys must only be "text" and "priority".';
    END IF;

    IF NOT (v_rec ? 'text') OR jsonb_typeof(v_rec->'text') <> 'string' THEN
      RAISE EXCEPTION 'Invalid recommendation: "text" field is required and must be a string.';
    END IF;

    IF btrim(v_rec->>'text') = '' THEN
      RAISE EXCEPTION 'Invalid recommendation: "text" field cannot be empty or whitespace only.';
    END IF;

    IF length(v_rec->>'text') > 200 THEN
      RAISE EXCEPTION 'Invalid recommendation: "text" field must not exceed 200 characters.';
    END IF;

    IF NOT (v_rec ? 'priority') OR jsonb_typeof(v_rec->'priority') <> 'number' THEN
      RAISE EXCEPTION 'Invalid recommendation: "priority" field is required and must be a number.';
    END IF;

    v_priority := (v_rec->>'priority')::numeric;
    IF v_priority <> floor(v_priority) THEN
      RAISE EXCEPTION 'Invalid recommendation: "priority" must be an integer.';
    END IF;

    IF v_priority < 1 OR v_priority > 5 THEN
      RAISE EXCEPTION 'Invalid recommendation: "priority" must be between 1 and 5.';
    END IF;
  END LOOP;

  IF (p_ai_annotation_count IS NULL) <> (p_ai_annotation_checksum IS NULL) THEN
    RAISE EXCEPTION 'Invalid input: annotation count and checksum must be provided together.';
  END IF;

  INSERT INTO telefun_coaching_summary (
    session_id,
    user_id,
    recommendations,
    generated_at,
    ai_annotation_count,
    ai_annotation_checksum,
    ai_annotation_completed_at
  )
  VALUES (
    p_session_id,
    v_user_id,
    p_recommendations,
    now(),
    p_ai_annotation_count,
    p_ai_annotation_checksum,
    CASE WHEN p_ai_annotation_count IS NULL THEN NULL ELSE now() END
  )
  ON CONFLICT (session_id)
  DO UPDATE SET
    recommendations = EXCLUDED.recommendations,
    generated_at = EXCLUDED.generated_at,
    ai_annotation_count = EXCLUDED.ai_annotation_count,
    ai_annotation_checksum = EXCLUDED.ai_annotation_checksum,
    ai_annotation_completed_at = EXCLUDED.ai_annotation_completed_at
  RETURNING id INTO v_summary_id;

  RETURN v_summary_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB, INTEGER, TEXT) TO authenticated, service_role;
