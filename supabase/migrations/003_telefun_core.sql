-- ═══════════════════════════════════════════════════════
-- Migration 003: Telefun Core Schema
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telefun_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_title TEXT NOT NULL,
  consumer_name TEXT NOT NULL,
  consumer_gender TEXT DEFAULT 'female',
  duration_seconds INT DEFAULT 0,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'active', 'completed', 'failed')),
  score NUMERIC,
  messages JSONB DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  coaching_focus JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telefun_history_user_id ON telefun_history(user_id);
CREATE INDEX IF NOT EXISTS idx_telefun_history_created_at ON telefun_history(created_at);

ALTER TABLE telefun_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telefun_history_select_own" ON telefun_history;
CREATE POLICY "telefun_history_select_own" ON telefun_history
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "telefun_history_insert_own" ON telefun_history;
CREATE POLICY "telefun_history_insert_own" ON telefun_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "telefun_history_update_own" ON telefun_history;
CREATE POLICY "telefun_history_update_own" ON telefun_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

INSERT INTO ai_pricing_settings (model_id, input_price_usd_per_million, output_price_usd_per_million)
VALUES ('gemini-3.1-flash-live-preview', 3.0, 12.0)
ON CONFLICT (model_id) DO NOTHING;
