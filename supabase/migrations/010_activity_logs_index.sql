-- Migration 010: Create B-tree index on activity_logs(created_at DESC)
-- Purpose: Improve performance for date-based queries on activity_logs
-- Uses CONCURRENTLY to avoid blocking reads during creation

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs(created_at DESC);
