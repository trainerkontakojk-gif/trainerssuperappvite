-- T3 / K15: extend the existing guard-first writer, without changing its
-- signature, privileges, RLS, unique plan index, or any existing data.
BEGIN;

CREATE OR REPLACE FUNCTION public.tna_create_need(p_actor_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_needs; previous_id uuid;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  IF p_payload->'previous_plan_id' IS NOT NULL AND p_payload->'previous_plan_id' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_payload->'previous_plan_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'TNA_PREVIOUS_PLAN_INVALID';
    END IF;
    BEGIN
      previous_id := (p_payload->>'previous_plan_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'TNA_PREVIOUS_PLAN_INVALID';
    END;
    IF NOT EXISTS (
      SELECT 1 FROM public.tna_plans p JOIN public.tna_needs n ON n.id=p.need_id
      WHERE p.id=previous_id AND p.status='selesai' AND p.follow_up='perlu_rencana_lanjutan'
        AND n.service_type=p_payload->>'service_type'
        AND n.indicator_id::text=lower(p_payload->>'indicator_id')
    ) THEN RAISE EXCEPTION 'TNA_PREVIOUS_PLAN_INVALID'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.qa_indicators WHERE id=(p_payload->>'indicator_id')::uuid
    AND service_type=p_payload->>'service_type') THEN RAISE EXCEPTION 'TNA_INVALID_INDICATOR'; END IF;
  INSERT INTO public.tna_needs(service_type,indicator_id,period_id,compare_count,validation_snapshot,
    suggested_cluster_id,validated_cluster_id,cause_note,gap_type,outcome,created_by,previous_plan_id)
  VALUES (p_payload->>'service_type',(p_payload->>'indicator_id')::uuid,(p_payload->>'period_id')::uuid,
    (p_payload->>'compare_count')::integer,p_payload->'validation_snapshot',p_payload->>'suggested_cluster_id',
    p_payload->>'validated_cluster_id',btrim(p_payload->>'cause_note'),p_payload->>'gap_type',p_payload->>'outcome',p_actor_id,previous_id)
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;

-- CREATE OR REPLACE retains EXECUTE; never exercise the denied-ACL crash path.
NOTIFY pgrst, 'reload schema';
COMMIT;
