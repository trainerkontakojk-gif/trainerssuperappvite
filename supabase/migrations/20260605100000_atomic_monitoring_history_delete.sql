-- Migration: Atomic Monitoring History Delete
-- Move multi-table deletion ownership from the AI route into one service-role-only PostgreSQL RPC.

CREATE OR REPLACE FUNCTION public.delete_monitoring_history(
  p_module TEXT,
  p_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_module TEXT := lower(trim(p_module));
  v_deleted INTEGER := 0;
  v_source TEXT;
BEGIN
  -- Security guard: only service_role can execute
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  CASE v_module
    WHEN 'ketik' THEN
      -- Delete KETIK children first
      DELETE FROM public.ketik_session_reviews WHERE session_id = p_id;
      DELETE FROM public.ketik_typo_findings WHERE session_id = p_id;
      DELETE FROM public.ketik_review_jobs WHERE session_id = p_id;
      -- Delete KETIK history
      DELETE FROM public.ketik_history WHERE id = p_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_source := 'ketik_history';

    WHEN 'pdkt' THEN
      -- Delete PDKT history
      DELETE FROM public.pdkt_history WHERE id = p_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_source := 'pdkt_history';

    WHEN 'telefun' THEN
      -- Delete Telefun history (children like coaching_summary and replay_annotations are ON DELETE CASCADE)
      DELETE FROM public.telefun_history WHERE id = p_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;

      IF v_deleted > 0 THEN
        v_source := 'telefun_history';
      ELSIF to_regclass('public.results') IS NOT NULL THEN
        -- Support legacy Telefun data in results table
        EXECUTE
          'DELETE FROM public.results WHERE id = $1 AND module = ''telefun'''
          USING p_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_source := 'results';
      END IF;

    ELSE
      RAISE EXCEPTION 'unsupported monitoring module';
  END CASE;

  -- Ensure exactly one row was deleted
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'monitoring history not found';
  END IF;

  RETURN jsonb_build_object(
    'module', v_module,
    'id', p_id,
    'source', v_source,
    'deleted', true
  );
END;
$$;

-- Security: Restricted execution
REVOKE EXECUTE ON FUNCTION public.delete_monitoring_history(TEXT, UUID)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_monitoring_history(TEXT, UUID)
  TO service_role;
