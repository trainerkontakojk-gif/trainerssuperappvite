-- One row lock and transaction for every leader request transition, including
-- group reassignment. Never compensate a committed status with another write.
CREATE OR REPLACE FUNCTION public.transition_leader_access(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_action text,
  p_group_ids uuid[] DEFAULT NULL,
  p_note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request public.leader_access_requests%ROWTYPE;
  v_expected text;
  v_next text;
  v_groups uuid[];
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_action IS NULL OR p_action NOT IN ('approve','reject','revoke','groups') THEN
    RAISE EXCEPTION 'LEADER_ACCESS_INVALID_ACTION';
  END IF;
  PERFORM 1 FROM public.profiles
    WHERE id=p_reviewer_id AND role IN ('admin','trainer')
      AND status='active' AND COALESCE(is_deleted,false)=false
      AND (active_until IS NULL OR active_until >= (pg_catalog.now() AT TIME ZONE 'Asia/Jakarta')::date)
    FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEADER_ACCESS_FORBIDDEN'; END IF;

  SELECT * INTO v_request FROM public.leader_access_requests
    WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEADER_ACCESS_NOT_FOUND'; END IF;
  v_expected := CASE WHEN p_action IN ('approve','reject') THEN 'pending' ELSE 'approved' END;
  IF v_request.status <> v_expected THEN RAISE EXCEPTION 'LEADER_ACCESS_CONFLICT'; END IF;
  IF p_action IN ('approve','groups') AND v_request.leader_user_id=p_reviewer_id THEN
    RAISE EXCEPTION 'LEADER_ACCESS_SELF_REVIEW';
  END IF;

  IF p_action IN ('approve','groups') THEN
    SELECT pg_catalog.array_agg(DISTINCT g ORDER BY g) INTO v_groups
      FROM pg_catalog.unnest(p_group_ids) AS g WHERE g IS NOT NULL;
    IF COALESCE(pg_catalog.cardinality(v_groups),0)=0 THEN
      RAISE EXCEPTION 'LEADER_ACCESS_INVALID_GROUPS';
    END IF;
    -- Prevent a group being removed/disabled between validation and linking.
    PERFORM id FROM public.access_groups
      WHERE id=ANY(v_groups) AND is_active=true ORDER BY id FOR SHARE;
    IF (SELECT count(*) FROM public.access_groups WHERE id=ANY(v_groups) AND is_active=true)
        <> pg_catalog.cardinality(v_groups) THEN
      RAISE EXCEPTION 'LEADER_ACCESS_INVALID_GROUPS';
    END IF;
  END IF;

  v_next := CASE p_action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected'
            WHEN 'revoke' THEN 'revoked' ELSE 'approved' END;
  UPDATE public.leader_access_requests
    SET status=v_next, reviewed_by=p_reviewer_id,
        review_note=CASE WHEN p_action IN ('reject','revoke') THEN p_note ELSE review_note END
    WHERE id=p_request_id AND status=v_expected;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEADER_ACCESS_CONFLICT'; END IF;

  IF p_action IN ('approve','groups') THEN
    DELETE FROM public.leader_access_request_groups WHERE request_id=p_request_id;
    INSERT INTO public.leader_access_request_groups(request_id,access_group_id)
      SELECT p_request_id,g FROM pg_catalog.unnest(v_groups) AS g;
  END IF;
END;
$$;

-- Project convention: deny non-service callers inside the exposed RPC, not
-- via a REVOKE EXECUTE path affected by the PostgreSQL 17.6 issue.
GRANT EXECUTE ON FUNCTION public.transition_leader_access(uuid,uuid,text,uuid[],text)
  TO anon, authenticated, service_role;
