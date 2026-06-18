-- ============================================================
-- Fix ai_billing_settings: enforce singleton pattern
-- Problem: POST /monitoring/billing used .insert(), creating
-- append-only rows. GET fetches ORDER BY created_at DESC LIMIT 1
-- which works in normal cases, but edge cases (race, extra inserts)
-- could pick wrong row. Fallback to 15000 masks the issue.
--
-- Solution: Add a `key` column with UNIQUE constraint so only
-- one row exists. Admin/trainer updates always affect ALL users.
-- ============================================================

-- 1. Add key column (nullable first for safe alter)
ALTER TABLE ai_billing_settings
  ADD COLUMN IF NOT EXISTS key TEXT;

-- 2. Backfill existing rows: keep only the latest, mark it as 'default'
DO $$
DECLARE
  latest_id UUID;
BEGIN
  -- Find the most recent row
  SELECT id INTO latest_id
    FROM ai_billing_settings
    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    LIMIT 1;

  IF latest_id IS NOT NULL THEN
    -- Mark the latest row as default
    UPDATE ai_billing_settings SET key = 'default' WHERE id = latest_id;
    -- Delete all other rows (they are stale duplicates)
    DELETE FROM ai_billing_settings WHERE id != latest_id;
  END IF;
END $$;

-- 3. If no rows exist at all, seed with default 15000
INSERT INTO ai_billing_settings (key, usd_to_idr_rate)
  SELECT 'default', 15000
  WHERE NOT EXISTS (SELECT 1 FROM ai_billing_settings WHERE key = 'default');

-- 4. Now make key NOT NULL and add UNIQUE constraint
ALTER TABLE ai_billing_settings
  ALTER COLUMN key SET NOT NULL,
  ALTER COLUMN key SET DEFAULT 'default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_billing_settings_key_unique'
  ) THEN
    ALTER TABLE ai_billing_settings
      ADD CONSTRAINT ai_billing_settings_key_unique UNIQUE (key);
  END IF;
END $$;

-- 5. Add comment for documentation
COMMENT ON TABLE ai_billing_settings IS 'Singleton table: exactly one row (key=default). Admin/trainer updates apply globally.';
COMMENT ON COLUMN ai_billing_settings.key IS 'Singleton key. Always "default". UNIQUE constraint enforces one-row pattern.';
