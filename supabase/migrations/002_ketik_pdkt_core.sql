-- ═══════════════════════════════════════════════════════
-- Migration 002: KETIK, PDKT & AI Usage Core Schema
-- ═══════════════════════════════════════════════════════

-- ── AI Pricing & Billing ──────────────────────────────
CREATE TABLE ai_pricing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL UNIQUE,
  input_price_usd_per_million NUMERIC NOT NULL DEFAULT 0,
  output_price_usd_per_million NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai_billing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usd_to_idr_rate NUMERIC NOT NULL DEFAULT 15000,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  input_price_usd_per_million NUMERIC NOT NULL DEFAULT 0,
  output_price_usd_per_million NUMERIC NOT NULL DEFAULT 0,
  usd_to_idr_rate NUMERIC NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC NOT NULL DEFAULT 0,
  estimated_cost_idr NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ai_usage_logs_user_id ON ai_usage_logs(user_id);
CREATE INDEX idx_ai_usage_logs_module ON ai_usage_logs(module);
CREATE INDEX idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);
CREATE INDEX idx_ai_usage_logs_model_id ON ai_usage_logs(model_id);

-- ── KETIK Tables ──────────────────────────────────────
CREATE TABLE ketik_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL DEFAULT now(),
  scenario_title TEXT NOT NULL,
  consumer_name TEXT NOT NULL,
  consumer_phone TEXT,
  consumer_city TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_score NUMERIC,
  empathy_score NUMERIC,
  probing_score NUMERIC,
  typo_score NUMERIC,
  compliance_score NUMERIC,
  review_status TEXT DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ketik_history_user_id ON ketik_history(user_id);
CREATE INDEX idx_ketik_history_date ON ketik_history(date);

CREATE TABLE ketik_session_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ketik_history(id) ON DELETE CASCADE,
  ai_summary TEXT,
  strengths JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  coaching_focus JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ketik_typo_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES ketik_history(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  original_word TEXT NOT NULL,
  corrected_word TEXT NOT NULL,
  severity TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ketik_review_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES ketik_history(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PDKT Tables ───────────────────────────────────────
CREATE TABLE pdkt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  evaluation JSONB,
  evaluation_status TEXT DEFAULT 'pending'
    CHECK (evaluation_status IN ('pending', 'processing', 'completed', 'failed')),
  evaluation_error TEXT,
  evaluation_started_at TIMESTAMPTZ,
  evaluation_completed_at TIMESTAMPTZ,
  time_taken INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdkt_history_user_id ON pdkt_history(user_id);
CREATE INDEX idx_pdkt_history_timestamp ON pdkt_history(timestamp);

CREATE TABLE pdkt_mailbox_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'replied', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  subject TEXT,
  snippet TEXT,
  scenario_snapshot JSONB NOT NULL,
  config_snapshot JSONB NOT NULL,
  inbound_email JSONB NOT NULL,
  emails_thread JSONB NOT NULL DEFAULT '[]'::jsonb,
  history_id UUID REFERENCES pdkt_history(id) ON DELETE SET NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pdkt_mailbox_user_id ON pdkt_mailbox_items(user_id);
CREATE INDEX idx_pdkt_mailbox_status ON pdkt_mailbox_items(status);

-- ── RLS Policies ──────────────────────────────────────
ALTER TABLE ai_pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ketik_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE ketik_session_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ketik_typo_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ketik_review_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdkt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdkt_mailbox_items ENABLE ROW LEVEL SECURITY;

-- Pricing/billing: read-only for authenticated, admin-only writes
CREATE POLICY "ai_pricing_settings_select" ON ai_pricing_settings
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ai_billing_settings_select" ON ai_billing_settings
  FOR SELECT USING (auth.role() = 'authenticated');

-- Usage logs: users see own, admins see all
CREATE POLICY "ai_usage_logs_select_own" ON ai_usage_logs
  FOR SELECT USING (auth.uid() = user_id);

-- KETIK: users see own data
CREATE POLICY "ketik_history_select_own" ON ketik_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ketik_history_insert_own" ON ketik_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ketik_session_reviews_select_own" ON ketik_session_reviews
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ketik_history WHERE ketik_history.id = session_id AND ketik_history.user_id = auth.uid())
  );

CREATE POLICY "ketik_typo_findings_select_own" ON ketik_typo_findings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ketik_history WHERE ketik_history.id = session_id AND ketik_history.user_id = auth.uid())
  );

CREATE POLICY "ketik_review_jobs_select_own" ON ketik_review_jobs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM ketik_history WHERE ketik_history.id = session_id AND ketik_history.user_id = auth.uid())
  );

-- PDKT: users see own data
CREATE POLICY "pdkt_history_select_own" ON pdkt_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pdkt_history_insert_own" ON pdkt_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pdkt_mailbox_select_own" ON pdkt_mailbox_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pdkt_mailbox_insert_own" ON pdkt_mailbox_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pdkt_mailbox_update_own" ON pdkt_mailbox_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Seed Data ─────────────────────────────────────────
INSERT INTO ai_pricing_settings (model_id, input_price_usd_per_million, output_price_usd_per_million) VALUES
  ('gemini-3.1-flash-lite', 0.15, 0.60),
  ('gemini-3-flash-preview', 0.15, 0.60),
  ('gemini-3.1-pro-preview', 1.25, 5.00),
  ('gemini-2.0-flash-lite', 0.075, 0.30),
  ('gemini-2.0-flash-preview-tts', 0.15, 0.60),
  ('openai/gpt-oss-120b:free', 0, 0),
  ('google/gemini-3.1-flash-lite', 0.15, 0.60),
  ('google/gemini-2.0-flash-lite', 0.075, 0.30),
  ('openai/gpt-4o-mini', 0.15, 0.60),
  ('qwen/qwen3.5-flash-02-23', 0.10, 0.40)
ON CONFLICT (model_id) DO NOTHING;

INSERT INTO ai_billing_settings (usd_to_idr_rate) VALUES (15000);
