-- Promote the canonical SLIK sub-parameter template as the January 2026
-- baseline. The previously published SLIK rule was temporary dummy data.
--
-- This migration fails closed if SLIK findings already exist, so an established
-- scoring history can never be silently reinterpreted.

DO $$
DECLARE
  target_period_id uuid;
  target_version_id uuid;
  existing_findings bigint;
  published_at_time timestamptz := now();
BEGIN
  SELECT id
  INTO target_period_id
  FROM public.qa_periods
  WHERE month = 1
    AND year = 2026
  LIMIT 1;

  IF target_period_id IS NULL THEN
    RAISE EXCEPTION 'Periode Januari 2026 tidak ditemukan';
  END IF;

  SELECT COUNT(*)
  INTO existing_findings
  FROM public.qa_temuan
  WHERE service_type = 'slik';

  IF existing_findings > 0 THEN
    RAISE EXCEPTION
      'Baseline SLIK tidak dapat diganti karena sudah ada % temuan SLIK',
      existing_findings;
  END IF;

  SELECT version.id
  INTO target_version_id
  FROM public.qa_service_rule_versions AS version
  WHERE version.service_type = 'slik'
    AND version.status = 'draft'
    AND version.effective_period_id = target_period_id
    AND version.change_reason =
      'Template SLIK dengan sub-parameter sesuai matriks QA'
  ORDER BY version.version_number DESC
  LIMIT 1;

  IF target_version_id IS NULL THEN
    RAISE EXCEPTION
      'Draft template sub-parameter SLIK untuk Januari 2026 tidak ditemukan';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.qa_service_rule_indicators
    WHERE rule_version_id = target_version_id
  ) <> 13 THEN
    RAISE EXCEPTION
      'Draft template SLIK harus memiliki tepat 13 item penilaian';
  END IF;

  UPDATE public.qa_service_rule_versions
  SET
    status = 'superseded',
    superseded_at = published_at_time,
    superseded_by_version_id = target_version_id,
    updated_at = published_at_time
  WHERE service_type = 'slik'
    AND effective_period_id = target_period_id
    AND status = 'published'
    AND id <> target_version_id;

  UPDATE public.qa_service_rule_versions
  SET
    status = 'published',
    published_at = published_at_time,
    effective_period_id = target_period_id,
    critical_weight = 0.60,
    non_critical_weight = 0.40,
    scoring_mode = 'weighted',
    change_reason =
      'Baseline SLIK Januari 2026 dengan parameter dan sub-parameter QA',
    updated_at = published_at_time
  WHERE id = target_version_id;
END
$$;
