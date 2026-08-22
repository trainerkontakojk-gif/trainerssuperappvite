-- Evaluasi Edukatif KETIK: education JSONB pada ketik_session_reviews
-- Nullable + default null agar histori lama tetap valid (fallback rule-based di backend).
ALTER TABLE ketik_session_reviews
  ADD COLUMN IF NOT EXISTS education JSONB DEFAULT NULL;

COMMENT ON COLUMN ketik_session_reviews.education IS
  'Edukasi per-dimensi: dimensionGuidance[] + overallNextSteps[] + typosEnriched';
