-- Add hierarchical QA parameter metadata and bootstrap the SLIK scoring template.
--
-- Compatibility strategy:
-- - `name` remains the scored leaf indicator.
-- - `parameter_group` is the optional parent parameter shown in the UI.
-- - Services without sub-parameters keep `parameter_group = NULL`.
-- - SLIK keeps the existing weighted scoring mode (NC 40% / Critical 60%).
-- - SLIK keeps SIDAK's 0-3 value scale; value 3 is the full-compliance
--   equivalent of value 1 in the supplied reference sheet.

ALTER TABLE public.qa_indicators
  ADD COLUMN IF NOT EXISTS parameter_group text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.qa_service_rule_indicators
  ADD COLUMN IF NOT EXISTS parameter_group text;

ALTER TABLE public.qa_indicators
  DROP CONSTRAINT IF EXISTS qa_indicators_service_type_name_key;

DROP INDEX IF EXISTS public.uq_qa_indicators_service_type_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_qa_indicators_service_group_name
  ON public.qa_indicators (
    service_type,
    COALESCE(parameter_group, ''),
    name
  );

UPDATE public.qa_service_weights
SET
  critical_weight = 0.60,
  non_critical_weight = 0.40,
  scoring_mode = 'weighted',
  updated_at = now()
WHERE service_type = 'slik';

INSERT INTO public.qa_service_weights (
  service_type,
  critical_weight,
  non_critical_weight,
  scoring_mode
)
VALUES ('slik', 0.60, 0.40, 'weighted')
ON CONFLICT (service_type) DO NOTHING;

-- Preserve legacy SLIK library rows for historical FK compatibility, but keep
-- them out of future drafts after the canonical leaf template is installed.
UPDATE public.qa_indicators
SET is_active = false
WHERE service_type = 'slik';

WITH slik_template (
  parameter_group,
  name,
  category,
  bobot,
  has_na,
  sort_order
) AS (
  VALUES
    (
      'Kesesuaian verifikasi (Verifikasi)',
      'Kesesuaian Data',
      'non_critical',
      0.15::numeric,
      false,
      10
    ),
    (
      'Kesesuaian verifikasi (Verifikasi)',
      'Kesesuaian Foto',
      'non_critical',
      0.15::numeric,
      false,
      20
    ),
    (
      NULL,
      'Kelengkapan Pengiriman Hasil iDeb (Penarikan)',
      'non_critical',
      0.40::numeric,
      false,
      30
    ),
    (
      'Kesesuaian Verifikasi Ulang (Penarikan)',
      'Kesesuaian Data',
      'non_critical',
      0.15::numeric,
      false,
      40
    ),
    (
      'Kesesuaian Verifikasi Ulang (Penarikan)',
      'Kesesuaian Foto',
      'non_critical',
      0.15::numeric,
      false,
      50
    ),
    (
      NULL,
      'Ketidaksesuaian penolakan permohonan iDeb SLIK',
      'critical',
      0.15::numeric,
      false,
      60
    ),
    (
      NULL,
      'Kesesuaian dan kelengkapan pengiriman alasan penolakan permohonan iDeb SLIK',
      'critical',
      0.10::numeric,
      false,
      70
    ),
    (
      NULL,
      'Kesesuaian hasil iDeb (Penarikan)',
      'critical',
      0.30::numeric,
      false,
      80
    ),
    (
      'Kesesuaian verifikasi (Tim Verifikasi) dan verifikasi ulang (Tim Penarikan)',
      'Kesesuaian Data',
      'critical',
      0.10::numeric,
      false,
      90
    ),
    (
      'Kesesuaian verifikasi (Tim Verifikasi) dan verifikasi ulang (Tim Penarikan)',
      'Kesesuaian Foto',
      'critical',
      0.05::numeric,
      false,
      100
    ),
    (
      'Kesesuaian verifikasi (Tim Verifikasi) dan verifikasi ulang (Tim Penarikan)',
      'Kesesuaian verifikasi Dokumen',
      'critical',
      0.05::numeric,
      false,
      110
    ),
    (
      'Kesesuaian Input Data Pendaftaran (Layanan Walk In)',
      'Kesesuaian Input Data Debitur/Pemohon',
      'critical',
      0.10::numeric,
      false,
      120
    ),
    (
      'Kesesuaian Input Data Pendaftaran (Layanan Walk In)',
      'Kesesuaian Input Dokumen iDeb SLIK',
      'critical',
      0.15::numeric,
      false,
      130
    )
)
INSERT INTO public.qa_indicators (
  service_type,
  parameter_group,
  name,
  category,
  bobot,
  has_na,
  sort_order,
  is_active
)
SELECT
  'slik',
  template.parameter_group,
  template.name,
  template.category,
  template.bobot,
  template.has_na,
  template.sort_order,
  true
FROM slik_template AS template
ON CONFLICT (
  service_type,
  (COALESCE(parameter_group, '')),
  name
)
DO UPDATE SET
  category = EXCLUDED.category,
  bobot = EXCLUDED.bobot,
  has_na = EXCLUDED.has_na,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

-- Create a reviewable revision from the latest published SLIK rule. The
-- published snapshot remains immutable; a trainer still controls publication.
INSERT INTO public.qa_service_rule_versions (
  service_type,
  effective_period_id,
  status,
  critical_weight,
  non_critical_weight,
  scoring_mode,
  version_number,
  change_reason,
  created_by,
  created_from_version_id
)
SELECT
  published.service_type,
  published.effective_period_id,
  'draft',
  0.60,
  0.40,
  'weighted',
  (
    SELECT COALESCE(MAX(existing.version_number), 0) + 1
    FROM public.qa_service_rule_versions AS existing
    WHERE existing.service_type = published.service_type
      AND existing.effective_period_id = published.effective_period_id
  ),
  'Template SLIK dengan sub-parameter sesuai matriks QA',
  published.created_by,
  published.id
FROM public.qa_service_rule_versions AS published
WHERE published.id = (
  SELECT latest.id
  FROM public.qa_service_rule_versions AS latest
  WHERE latest.service_type = 'slik'
    AND latest.status = 'published'
  ORDER BY latest.published_at DESC NULLS LAST, latest.version_number DESC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1
  FROM public.qa_service_rule_versions AS draft
  WHERE draft.service_type = 'slik'
    AND draft.status = 'draft'
);

-- Populate SLIK drafts that were created before the template existed, but never
-- mutate published snapshots. Trainers can review and publish the completed draft.
INSERT INTO public.qa_service_rule_indicators (
  rule_version_id,
  legacy_indicator_id,
  service_type,
  parameter_group,
  name,
  category,
  bobot,
  has_na,
  threshold,
  sort_order,
  created_by
)
SELECT
  version.id,
  indicator.id,
  indicator.service_type,
  indicator.parameter_group,
  indicator.name,
  indicator.category,
  indicator.bobot,
  indicator.has_na,
  indicator.threshold,
  indicator.sort_order,
  version.created_by
FROM public.qa_service_rule_versions AS version
CROSS JOIN public.qa_indicators AS indicator
WHERE version.service_type = 'slik'
  AND version.status = 'draft'
  AND indicator.service_type = 'slik'
  AND indicator.is_active = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.qa_service_rule_indicators AS existing
    WHERE existing.rule_version_id = version.id
  );
