-- Assignment snapshots are provenance, not a second active settings store.
-- The recipient's editable copy remains user_settings.settings.ketik.
BEGIN;

CREATE TABLE public.ketik_configuration_assignments (
  recipient_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_configuration jsonb NOT NULL CHECK (
    jsonb_typeof(source_configuration) = 'object'
    AND source_configuration - ARRAY[
      'scenarios', 'consumerTypes', 'activeConsumerTypeId', 'selectedModel',
      'simulationDuration', 'responsePacingMode'
    ]::text[] = '{}'::jsonb
  ),
  source_settings_version text NOT NULL,
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (recipient_id <> assigned_by)
);
CREATE INDEX ketik_configuration_assignments_assigner_idx
  ON public.ketik_configuration_assignments (assigned_by, recipient_id);
ALTER TABLE public.ketik_configuration_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ketik_configuration_assignments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ketik_configuration_assignments TO authenticated;
GRANT ALL ON public.ketik_configuration_assignments TO service_role;
CREATE POLICY ketik_assignment_read ON public.ketik_configuration_assignments
  FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id OR auth.uid() = assigned_by);

-- Invoker rights + service-role-only EXECUTE: never accept actor/configuration
-- from an authenticated SQL client. The Hono service supplies validated values.
CREATE FUNCTION public.assign_ketik_configuration(
  p_actor_id uuid,
  p_recipient_id uuid,
  p_source_settings_version text,
  p_recipient_settings_version text,
  p_expected_assignment_version uuid,
  p_configuration jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role text;
  v_recipient_role text;
  v_assignment public.ketik_configuration_assignments%ROWTYPE;
  v_source_version timestamptz;
  v_recipient_version timestamptz;
  v_settings jsonb;
  v_next_settings jsonb;
BEGIN
  SELECT role INTO v_actor_role FROM public.profiles
    WHERE id = p_actor_id AND status IN ('active', 'approved')
      AND NOT COALESCE(is_deleted, false) FOR SHARE;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'trainer') THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Assignment forbidden';
  END IF;

  -- The profile lock also serializes first assignments (no assignment row yet).
  SELECT role INTO v_recipient_role FROM public.profiles
    WHERE id = p_recipient_id AND status IN ('active', 'approved')
      AND NOT COALESCE(is_deleted, false) FOR UPDATE;
  IF v_recipient_role IS NULL OR v_recipient_role NOT IN ('agent', 'leader')
      OR p_actor_id = p_recipient_id THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Invalid assignment recipient';
  END IF;

  SELECT * INTO v_assignment FROM public.ketik_configuration_assignments
    WHERE recipient_id = p_recipient_id FOR UPDATE;
  IF v_assignment.recipient_id IS NOT NULL AND v_actor_role <> 'admin'
      AND v_assignment.assigned_by <> p_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'Assignment forbidden';
  END IF;
  IF v_assignment.version IS DISTINCT FROM p_expected_assignment_version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Assignment version conflict';
  END IF;

  SELECT updated_at INTO v_source_version FROM public.user_settings
    WHERE user_id = p_actor_id FOR SHARE;
  IF NOT (CASE WHEN p_source_settings_version = 'absent'
      THEN v_source_version IS NULL
      ELSE COALESCE(v_source_version = p_source_settings_version::timestamptz, false) END) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Source settings version conflict';
  END IF;

  SELECT settings, updated_at INTO v_settings, v_recipient_version
    FROM public.user_settings WHERE user_id = p_recipient_id FOR UPDATE;
  IF NOT (CASE WHEN p_recipient_settings_version = 'absent'
      THEN v_recipient_version IS NULL
      ELSE COALESCE(v_recipient_version = p_recipient_settings_version::timestamptz, false) END) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Recipient settings version conflict';
  END IF;
  IF v_settings IS NOT NULL AND (
      jsonb_typeof(v_settings) <> 'object' OR
      (v_settings ? 'ketik' AND jsonb_typeof(v_settings->'ketik') <> 'object')) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Recipient settings require repair';
  END IF;

  v_next_settings := COALESCE(v_settings, '{}'::jsonb) || jsonb_build_object(
    'ketik', COALESCE(v_settings->'ketik', '{}'::jsonb) || p_configuration
  );
  IF v_recipient_version IS NULL THEN
    INSERT INTO public.user_settings (user_id, settings)
      VALUES (p_recipient_id, v_next_settings)
      ON CONFLICT (user_id) DO NOTHING;
    -- A recipient may have created settings concurrently. Do not overwrite them.
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Recipient settings version conflict';
    END IF;
  ELSE
    UPDATE public.user_settings SET settings = v_next_settings
      WHERE user_id = p_recipient_id;
  END IF;

  INSERT INTO public.ketik_configuration_assignments AS assignment (
    recipient_id, assigned_by, source_configuration, source_settings_version
  ) VALUES (
    p_recipient_id, p_actor_id, p_configuration, p_source_settings_version
  ) ON CONFLICT (recipient_id) DO UPDATE SET
    assigned_by = EXCLUDED.assigned_by,
    source_configuration = EXCLUDED.source_configuration,
    source_settings_version = EXCLUDED.source_settings_version,
    version = gen_random_uuid(), assigned_at = clock_timestamp()
  RETURNING assignment.* INTO v_assignment;
  RETURN to_jsonb(v_assignment);
END;
$$;
REVOKE ALL ON FUNCTION public.assign_ketik_configuration(uuid, uuid, text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_ketik_configuration(uuid, uuid, text, text, uuid, jsonb)
  TO service_role;
COMMENT ON TABLE public.ketik_configuration_assignments IS
  'Trainer/admin assignment provenance. Editable recipient configuration lives in user_settings, not this snapshot.';

COMMIT;
