-- SIDAK Core Schema
-- Consolidated migration for QA Analyzer (Sistem Informasi Data Analisis Kualitas)

-- 1. Profiler (Agent Data)
CREATE TABLE IF NOT EXISTS public.profiler_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL UNIQUE CHECK (year BETWEEN 2000 AND 2100),
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiler_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  trainer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  year_id uuid REFERENCES public.profiler_years(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.profiler_folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiler_peserta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  batch_name text NOT NULL REFERENCES public.profiler_folders(name) ON DELETE CASCADE ON UPDATE CASCADE,
  nomor_urut integer NOT NULL DEFAULT 0,
  nama text NOT NULL,
  tim text NOT NULL,
  jabatan text NOT NULL,
  foto_url text,
  photo_frame jsonb,
  nik_ojk text,
  bergabung_date date,
  email_ojk text,
  no_telepon text,
  no_telepon_darurat text,
  nama_kontak_darurat text,
  hubungan_kontak_darurat text,
  jenis_kelamin text,
  agama text,
  tgl_lahir date,
  status_perkawinan text,
  pendidikan text,
  no_ktp text,
  no_npwp text,
  nomor_rekening text,
  nama_bank text,
  alamat_tinggal text,
  status_tempat_tinggal text,
  nama_lembaga text,
  jurusan text,
  previous_company text,
  pengalaman_cc text,
  catatan_tambahan text,
  keterangan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiler_tim_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL UNIQUE,
  trainer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiler_peserta_batch_name ON public.profiler_peserta(batch_name);
CREATE INDEX IF NOT EXISTS idx_profiler_peserta_tim ON public.profiler_peserta(tim);

-- 2. QA Periods
CREATE TABLE IF NOT EXISTS public.qa_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, year)
);

-- 3. QA Indicators (Legacy)
CREATE TABLE IF NOT EXISTS public.qa_indicators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'non_critical'
    CONSTRAINT qa_indicators_category_check
    CHECK (category IN ('critical', 'non_critical', 'none')),
  bobot numeric NOT NULL DEFAULT 0,
  has_na boolean NOT NULL DEFAULT false,
  threshold numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_type, name)
);

-- 4. QA Service Weights
CREATE TABLE IF NOT EXISTS public.qa_service_weights (
  service_type         text PRIMARY KEY,
  critical_weight      numeric NOT NULL DEFAULT 0.5,
  non_critical_weight  numeric NOT NULL DEFAULT 0.5,
  scoring_mode         text    NOT NULL DEFAULT 'weighted'
    CONSTRAINT scoring_mode_check
    CHECK (scoring_mode IN ('weighted', 'flat', 'no_category')),
  updated_at           timestamptz DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id),
  CONSTRAINT weights_sum_check
    CHECK (ABS(critical_weight + non_critical_weight - 1.0) < 0.001)
);

INSERT INTO qa_service_weights (service_type, critical_weight, non_critical_weight, scoring_mode) VALUES
  ('call',       0.50, 0.50, 'weighted'),
  ('chat',       0.50, 0.50, 'weighted'),
  ('email',      0.65, 0.35, 'weighted'),
  ('cso',        0.50, 0.50, 'weighted'),
  ('pencatatan', 0.90, 0.10, 'flat'),
  ('bko',        0.50, 0.50, 'no_category'),
  ('slik',       0.60, 0.40, 'weighted')
ON CONFLICT (service_type) DO NOTHING;

-- 6. QA Rule Versions (Versioned Rules)
CREATE TABLE IF NOT EXISTS public.qa_service_rule_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type        text NOT NULL,
  effective_period_id uuid NOT NULL REFERENCES public.qa_periods(id),
  status              text NOT NULL CHECK (status IN ('draft', 'published', 'superseded')),
  critical_weight     numeric NOT NULL DEFAULT 0.5,
  non_critical_weight numeric NOT NULL DEFAULT 0.5,
  scoring_mode        text NOT NULL DEFAULT 'weighted' CHECK (scoring_mode IN ('weighted', 'flat', 'no_category')),
  version_number      integer NOT NULL DEFAULT 1,
  change_reason       text,
  created_by          uuid REFERENCES auth.users(id),
  published_by        uuid REFERENCES auth.users(id),
  updated_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  published_at        timestamptz,
  superseded_at       timestamptz,
  superseded_by       uuid,
  superseded_by_version_id uuid REFERENCES public.qa_service_rule_versions(id),
  created_from_version_id  uuid REFERENCES public.qa_service_rule_versions(id),
  CONSTRAINT weights_sum_check_v
    CHECK (ABS(critical_weight + non_critical_weight - 1.0) < 0.001)
);

CREATE TABLE IF NOT EXISTS public.qa_service_rule_indicators (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id     uuid NOT NULL REFERENCES public.qa_service_rule_versions(id) ON DELETE CASCADE,
  legacy_indicator_id uuid,
  service_type        text NOT NULL,
  name                text NOT NULL,
  category            text NOT NULL CHECK (category IN ('critical', 'non_critical', 'none')),
  bobot               numeric NOT NULL,
  has_na              boolean NOT NULL DEFAULT false,
  threshold           numeric,
  sort_order          integer DEFAULT 0,
  created_by          uuid REFERENCES auth.users(id),
  updated_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- 5. QA Temuan (Findings)
CREATE TABLE IF NOT EXISTS public.qa_temuan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peserta_id uuid NOT NULL REFERENCES public.profiler_peserta(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.qa_periods(id) ON DELETE CASCADE,
  indicator_id uuid NOT NULL REFERENCES public.qa_indicators(id) ON DELETE RESTRICT,
  rule_version_id uuid REFERENCES public.qa_service_rule_versions(id),
  rule_indicator_id uuid REFERENCES public.qa_service_rule_indicators(id),
  service_type text NOT NULL,
  no_tiket text,
  is_phantom_padding boolean NOT NULL DEFAULT false,
  phantom_batch_id text,
  nilai integer NOT NULL CHECK (nilai BETWEEN 0 AND 3),
  ketidaksesuaian text,
  sebaiknya text,
  tahun integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_indicators_service_type ON public.qa_indicators(service_type);
CREATE INDEX IF NOT EXISTS idx_qa_temuan_period_service ON public.qa_temuan(period_id, service_type);
CREATE INDEX IF NOT EXISTS idx_qa_temuan_peserta_period ON public.qa_temuan(peserta_id, period_id);
CREATE INDEX IF NOT EXISTS idx_qa_temuan_indicator_id ON public.qa_temuan(indicator_id);
CREATE INDEX IF NOT EXISTS idx_qa_temuan_rule_version ON public.qa_temuan(rule_version_id);
CREATE INDEX IF NOT EXISTS idx_qa_temuan_phantom ON public.qa_temuan(is_phantom_padding) WHERE is_phantom_padding = true;

-- 7. QA Dashboard Summary Cache
CREATE TABLE IF NOT EXISTS public.qa_dashboard_period_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.qa_periods(id) ON DELETE CASCADE,
  service_type text,
  folder_id uuid REFERENCES public.profiler_folders(id) ON DELETE CASCADE,
  total_agents integer NOT NULL DEFAULT 0,
  total_defects integer NOT NULL DEFAULT 0,
  avg_defects_per_audit numeric NOT NULL DEFAULT 0,
  zero_error_rate numeric NOT NULL DEFAULT 0,
  avg_agent_score numeric NOT NULL DEFAULT 0,
  compliance_rate numeric NOT NULL DEFAULT 0,
  compliance_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS qa_dashboard_period_summary_unique_idx
  ON public.qa_dashboard_period_summary (
    period_id,
    COALESCE(service_type, ''),
    COALESCE(folder_id, '00000000-0000-0000-0000-000000000000')
  );

CREATE TABLE IF NOT EXISTS public.qa_dashboard_agent_period_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.profiler_peserta(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.qa_periods(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  final_score numeric NOT NULL DEFAULT 0,
  non_critical_score numeric NOT NULL DEFAULT 0,
  critical_score numeric NOT NULL DEFAULT 0,
  session_count integer NOT NULL DEFAULT 0,
  findings_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, period_id, service_type)
);

-- 8. BKO Indicators Seed
INSERT INTO qa_indicators (service_type, name, category, bobot, has_na) VALUES
  ('bko', 'Ketepatan Waktu',                           'none', 0.40, false),
  ('bko', 'Kesesuaian Informasi pada Email',           'none', 0.10, false),
  ('bko', 'Akurasi Kriteria Pemberian SP',             'none', 0.10, false),
  ('bko', 'Kesesuaian Penanganan Pengaduan',           'none', 0.10, false),
  ('bko', 'Kesesuaian Data pada Kertas Kerja',         'none', 0.15, false),
  ('bko', 'Kesesuaian Data pada APPK',                 'none', 0.15, false)
ON CONFLICT (service_type, name) DO NOTHING;

-- 9. RLS Policies
ALTER TABLE public.profiler_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiler_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiler_peserta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiler_tim_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_service_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_temuan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_service_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_service_rule_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_dashboard_period_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_dashboard_agent_period_summary ENABLE ROW LEVEL SECURITY;

-- Read policies for authenticated users
CREATE POLICY "read_all" ON public.profiler_years FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.profiler_folders FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.profiler_peserta FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.profiler_tim_list FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.qa_periods FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.qa_indicators FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.qa_service_weights FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.qa_temuan FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.qa_service_rule_versions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.qa_service_rule_indicators FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.qa_dashboard_period_summary FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "read_all" ON public.qa_dashboard_agent_period_summary FOR SELECT USING (auth.role() = 'authenticated');

-- Write policies for admin/trainer roles
CREATE POLICY "write_trainer" ON public.profiler_years FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.profiler_folders FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.profiler_peserta FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.profiler_tim_list FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.qa_periods FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.qa_indicators FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.qa_service_weights FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.qa_temuan FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.qa_service_rule_versions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);
CREATE POLICY "write_trainer" ON public.qa_service_rule_indicators FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer', 'trainers'))
);

-- 10. Triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiler_peserta_updated_at ON public.profiler_peserta;
CREATE TRIGGER update_profiler_peserta_updated_at
  BEFORE UPDATE ON public.profiler_peserta
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_qa_indicators_updated_at ON public.qa_indicators;
CREATE TRIGGER update_qa_indicators_updated_at
  BEFORE UPDATE ON public.qa_indicators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_qa_temuan_updated_at ON public.qa_temuan;
CREATE TRIGGER update_qa_temuan_updated_at
  BEFORE UPDATE ON public.qa_temuan
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_qa_service_rule_versions_updated_at ON public.qa_service_rule_versions;
CREATE TRIGGER update_qa_service_rule_versions_updated_at
  BEFORE UPDATE ON public.qa_service_rule_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_qa_service_rule_indicators_updated_at ON public.qa_service_rule_indicators;
CREATE TRIGGER update_qa_service_rule_indicators_updated_at
  BEFORE UPDATE ON public.qa_service_rule_indicators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11. Grants
REVOKE ALL ON public.profiler_years FROM anon, public;
REVOKE ALL ON public.profiler_folders FROM anon, public;
REVOKE ALL ON public.profiler_peserta FROM anon, public;
REVOKE ALL ON public.profiler_tim_list FROM anon, public;
REVOKE ALL ON public.qa_periods FROM anon, public;
REVOKE ALL ON public.qa_indicators FROM anon, public;
REVOKE ALL ON public.qa_service_weights FROM anon, public;
REVOKE ALL ON public.qa_temuan FROM anon, public;
REVOKE ALL ON public.qa_service_rule_versions FROM anon, public;
REVOKE ALL ON public.qa_service_rule_indicators FROM anon, public;
REVOKE ALL ON public.qa_dashboard_period_summary FROM anon, public;
REVOKE ALL ON public.qa_dashboard_agent_period_summary FROM anon, public;

GRANT SELECT ON public.profiler_years TO authenticated;
GRANT SELECT ON public.profiler_folders TO authenticated;
GRANT SELECT ON public.profiler_peserta TO authenticated;
GRANT SELECT ON public.profiler_tim_list TO authenticated;
GRANT SELECT ON public.qa_periods TO authenticated;
GRANT SELECT ON public.qa_indicators TO authenticated;
GRANT SELECT ON public.qa_service_weights TO authenticated;
GRANT SELECT ON public.qa_temuan TO authenticated;
GRANT SELECT ON public.qa_service_rule_versions TO authenticated;
GRANT SELECT ON public.qa_service_rule_indicators TO authenticated;
GRANT SELECT ON public.qa_dashboard_period_summary TO authenticated;
GRANT SELECT ON public.qa_dashboard_agent_period_summary TO authenticated;

GRANT ALL ON public.profiler_years TO service_role;
GRANT ALL ON public.profiler_folders TO service_role;
GRANT ALL ON public.profiler_peserta TO service_role;
GRANT ALL ON public.profiler_tim_list TO service_role;
GRANT ALL ON public.qa_periods TO service_role;
GRANT ALL ON public.qa_indicators TO service_role;
GRANT ALL ON public.qa_service_weights TO service_role;
GRANT ALL ON public.qa_temuan TO service_role;
GRANT ALL ON public.qa_service_rule_versions TO service_role;
GRANT ALL ON public.qa_service_rule_indicators TO service_role;
GRANT ALL ON public.qa_dashboard_period_summary TO service_role;
GRANT ALL ON public.qa_dashboard_agent_period_summary TO service_role;
