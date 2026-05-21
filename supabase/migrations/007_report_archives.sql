-- Migration 007: Report Archives
-- Menyimpan report yang sudah digenerate untuk dibuka kembali

CREATE TABLE IF NOT EXISTS report_archives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('data', 'ai')),
  filter_params JSONB NOT NULL DEFAULT '{}',
  report_data JSONB NOT NULL DEFAULT '{}',
  report_html TEXT,
  report_json JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_report_archives_user_id ON report_archives(user_id);
CREATE INDEX IF NOT EXISTS idx_report_archives_created_at ON report_archives(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_archives_type ON report_archives(report_type);

-- RLS
ALTER TABLE report_archives ENABLE ROW LEVEL SECURITY;

-- Agent: lihat report sendiri
DROP POLICY IF EXISTS "users_view_own_reports" ON report_archives;
CREATE POLICY "users_view_own_reports"
  ON report_archives FOR SELECT
  USING (auth.uid() = user_id);

-- Admin/trainer/qa: lihat semua lewat service role (backend)
-- Backend selalu pakai service role, jadi RLS tidak membatasi admin

-- Insert hanya untuk user sendiri (via service role check di backend)
DROP POLICY IF EXISTS "users_insert_own_reports" ON report_archives;
CREATE POLICY "users_insert_own_reports"
  ON report_archives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Delete hanya untuk user sendiri
DROP POLICY IF EXISTS "users_delete_own_reports" ON report_archives;
CREATE POLICY "users_delete_own_reports"
  ON report_archives FOR DELETE
  USING (auth.uid() = user_id);

-- Update hanya untuk user sendiri (updated_at trigger jika perlu)
DROP POLICY IF EXISTS "users_update_own_reports" ON report_archives;
CREATE POLICY "users_update_own_reports"
  ON report_archives FOR UPDATE
  USING (auth.uid() = user_id);
