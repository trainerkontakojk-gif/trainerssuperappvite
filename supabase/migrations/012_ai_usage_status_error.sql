-- Migration 012: Add status and error_message columns to ai_usage_logs
-- Requirements: 13.1, 13.5, 13.7, 14.1

-- Add status column with CHECK constraint and default for backward compatibility
ALTER TABLE ai_usage_logs ADD COLUMN status TEXT NOT NULL DEFAULT 'success'
  CHECK (status IN ('success', 'failed', 'timeout'));

-- Add nullable error_message column (app-level max 1000 chars)
ALTER TABLE ai_usage_logs ADD COLUMN error_message TEXT;

-- Create index on status column to support filtered queries by request status
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_status ON ai_usage_logs(status);
