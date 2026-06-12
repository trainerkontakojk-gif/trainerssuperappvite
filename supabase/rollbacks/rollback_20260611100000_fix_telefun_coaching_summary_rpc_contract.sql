-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260611100000_fix_telefun_coaching_summary_rpc_contract.sql
-- Description: Recreates the 2-argument overload of
--              upsert_telefun_coaching_summary(UUID, JSONB) that was dropped
--              by migration 20260611100000. This restores the legacy RPC
--              signature originally created in migration 005_carbon_copy_parity.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: telefun_history and telefun_coaching_summary tables must exist
--
-- No data loss: Function creation only.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

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

-- Restore the default PUBLIC EXECUTE privilege removed from the final 4-arg RPC.
GRANT EXECUTE ON FUNCTION public.upsert_telefun_coaching_summary(UUID, JSONB, INTEGER, TEXT)
  TO PUBLIC;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: both values should be true
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT
  to_regprocedure(
    'public.upsert_telefun_coaching_summary(uuid,jsonb)'
  ) IS NOT NULL AS legacy_two_argument_function_exists,
  has_function_privilege(
    'anon',
    'public.upsert_telefun_coaching_summary(uuid,jsonb,integer,text)',
    'EXECUTE'
  ) AS public_execute_visible_to_anon_on_four_argument_function;
