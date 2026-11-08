-- Publish and supersede as one transaction. Serializing per service/period
-- prevents two draft publications from both becoming effective.
CREATE OR REPLACE FUNCTION public.publish_sidak_rule_version(
  p_id uuid,
  p_user_id uuid,
  p_change_reason text,
  p_change_reason_is_set boolean,
  p_effective_period_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.qa_service_rule_versions%ROWTYPE;
  v_result public.qa_service_rule_versions%ROWTYPE;
  v_service_type text;
  v_period uuid;
  v_number integer;
  v_critical numeric;
  v_non_critical numeric;
  v_now timestamptz;
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT service_type, COALESCE(p_effective_period_id, effective_period_id)
    INTO v_service_type, v_period
    FROM public.qa_service_rule_versions WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versi aturan tidak ditemukan';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('sidak_rule_publish:' || v_service_type),
    pg_catalog.hashtext(v_period::text)
  );
  SELECT * INTO v_existing FROM public.qa_service_rule_versions
    WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Versi aturan tidak ditemukan';
  END IF;
  IF v_existing.status <> 'draft' THEN
    RAISE EXCEPTION 'Hanya versi draft yang bisa dipublikasikan';
  END IF;
  IF v_existing.service_type <> v_service_type OR
     COALESCE(p_effective_period_id, v_existing.effective_period_id) <> v_period THEN
    RAISE EXCEPTION 'Versi aturan berubah; muat ulang dan coba lagi';
  END IF;
  v_now := pg_catalog.clock_timestamp();

  IF v_service_type = 'slik' THEN
    SELECT COALESCE(SUM(bobot) FILTER (WHERE category = 'critical'), 0),
           COALESCE(SUM(bobot) FILTER (WHERE category = 'non_critical'), 0)
      INTO v_critical, v_non_critical
      FROM public.qa_service_rule_indicators WHERE rule_version_id = p_id;
    IF abs(v_critical - 1) >= 0.001 OR abs(v_non_critical - 1) >= 0.001 THEN
      RAISE EXCEPTION 'Total bobot parameter SLIK pada kategori Critical dan Non Critical masing-masing harus 100%%';
    END IF;
  END IF;

  v_number := v_existing.version_number;
  IF p_effective_period_id IS NOT NULL AND p_effective_period_id <> v_existing.effective_period_id THEN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_number
      FROM public.qa_service_rule_versions
      WHERE service_type = v_service_type AND effective_period_id = v_period;
  END IF;

  UPDATE public.qa_service_rule_versions
    SET status = 'superseded', superseded_by = p_user_id,
        superseded_at = v_now, superseded_by_version_id = p_id
    WHERE service_type = v_service_type AND effective_period_id = v_period
      AND status = 'published' AND id <> p_id;

  UPDATE public.qa_service_rule_versions
    SET status = 'published', published_by = p_user_id, published_at = v_now,
        effective_period_id = v_period, version_number = v_number,
        change_reason = CASE WHEN p_change_reason_is_set THEN p_change_reason ELSE change_reason END
    WHERE id = p_id AND status = 'draft'
    RETURNING * INTO v_result;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hanya versi draft yang bisa dipublikasikan';
  END IF;
  RETURN pg_catalog.to_jsonb(v_result);
END;
$$;

-- PostgreSQL 17.6 in this project must reject inside the function, rather
-- than through REVOKE EXECUTE on an exposed RPC (see docs/architecture.md).
GRANT EXECUTE ON FUNCTION public.publish_sidak_rule_version(uuid, uuid, text, boolean, uuid) TO anon, authenticated, service_role;
