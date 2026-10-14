-- Restore the exact Phase 1 writer body; leave all existing K15 links/data
-- and Phase 2 columns intact. Roll back the API link feature before using this.
-- Apply this BEFORE rolling back the Phase 2 foundation.
BEGIN;

CREATE OR REPLACE FUNCTION public.tna_create_need(p_actor_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_needs;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  IF NOT EXISTS (SELECT 1 FROM public.qa_indicators WHERE id=(p_payload->>'indicator_id')::uuid
    AND service_type=p_payload->>'service_type') THEN RAISE EXCEPTION 'TNA_INVALID_INDICATOR'; END IF;
  INSERT INTO public.tna_needs(service_type,indicator_id,period_id,compare_count,validation_snapshot,
    suggested_cluster_id,validated_cluster_id,cause_note,gap_type,outcome,created_by)
  VALUES (p_payload->>'service_type',(p_payload->>'indicator_id')::uuid,(p_payload->>'period_id')::uuid,
    (p_payload->>'compare_count')::integer,p_payload->'validation_snapshot',p_payload->>'suggested_cluster_id',
    p_payload->>'validated_cluster_id',btrim(p_payload->>'cause_note'),p_payload->>'gap_type',p_payload->>'outcome',p_actor_id)
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
