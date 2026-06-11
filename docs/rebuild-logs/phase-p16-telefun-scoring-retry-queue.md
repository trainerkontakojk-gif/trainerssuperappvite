# P1.6 Telefun Durable Scoring Retry Queue

## Summary

Menambahkan durable retry queue untuk voice assessment Telefun. Kegagalan transient
(timeout, network, 5xx) dijadwalkan ulang dengan exponential backoff alih-alih langsung
menampilkan error ke user. Worker backend memproses antrian secara otomatis.

## Files Modified/Added

### Migration
- `supabase/migrations/20260611201000_telefun_scoring_retry_queue.sql` — New migration
- `supabase/rollbacks/rollback_20260611201000_telefun_scoring_retry_queue.sql` — Rollback

### Backend — New Files
- `apps/api/src/lib/telefun-scoring-errors.ts` — Error classification + backoff
- `apps/api/src/services/telefun-scoring-service.ts` — Scoring orchestration
- `apps/api/src/workers/telefun-scoring-worker.ts` — Worker entrypoint

### Backend — Modified Files
- `apps/api/src/routes/telefun/recordings.ts` — Auto-enqueue after recording save

### Frontend — Modified Files
- `apps/web/src/routes/telefun/components/VoiceAssessmentSection.tsx` — Status-aware UI

### Tests
- `apps/api/src/__tests__/telefun-scoring-errors.test.ts` — 24 tests
- `apps/api/src/__tests__/telefun-scoring-service.test.ts` — 17 tests
- `apps/api/src/__tests__/telefun-scoring-worker-integration.test.ts` — 7 tests
- `apps/api/src/__tests__/telefun-scoring-retry-migration.test.ts` — 10 tests

Total: 58 tests, 0 failures.

## Architecture

```
┌────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Route Handler  │────>│  Scoring Service     │────>│  DB (RPC layer) │
│  /score/:id     │     │  (orchestrator)      │     │                  │
└────────────────┘     └──────────────────────┘     └─────────────────┘
                              │      │                       │
                              v      v                       v
                       ┌──────────┐ ┌──────────┐   ┌─────────────────┐
                       │ Claim    │ │ Process  │   │ Reschedule/     │
                       │ (atomic) │ │ (AI)     │   │ Complete/Fail   │
                       └──────────┘ └──────────┘   └─────────────────┘

┌────────────────┐     ┌──────────────────────┐
│  Worker (cron) │────>│  Scoring Service     │
│  every 30s     │     │  fetchPendingJobs →   │
│                │     │  claimJob →           │
│                │     │  processScoringJob    │
└────────────────┘     └──────────────────────┘
```

## Error Classification

| Pattern | Type | Examples |
|---------|------|---------|
| Agent audio not found | Permanent | `No agent audio available` |
| Invalid AI output | Permanent | `Invalid assessment shape` |
| 4xx errors (except 429) | Permanent | `400 Bad Request` |
| Network/Timeout | Transient | `Timeout`, `ECONNREFUSED` |
| Storage download fail | Transient | `Failed to download audio` |
| Rate limit (429) | Transient | `429 Too Many Requests` |
| 5xx errors | Transient | `503 Service Unavailable` |
| Unknown | Permanent | Default (prevents infinite retry) |

## Exponential Backoff

| Attempt | Delay |
|---------|-------|
| 1 | 30 seconds |
| 2 | 2 minutes |
| 3 | 5 minutes |
| 4+ | Cap at 5 minutes |

Max attempts: 3 (after which job is permanently failed).

## RPC Contracts

### Updated: `claim_telefun_scoring(p_session_id UUID, p_claim_timeout_seconds INT DEFAULT 120)`
Returns `BOOLEAN`. Now also checks `scoring_next_attempt_at` — will NOT claim jobs
whose next_attempt_at is in the future. Clears next_attempt_at on successful claim.

### New: `reschedule_telefun_scoring(p_session_id UUID, p_error TEXT, p_next_attempt_at TIMESTAMPTZ)`
Returns `BOOLEAN`. Sets status='failed' with error message and schedules next retry.
Only applies to sessions with status IN ('processing', 'failed').

### New: `enqueue_telefun_scoring(p_session_id UUID)`
Returns `BOOLEAN`. Sets status='pending' and next_attempt_at=now().
Does NOT enqueue if status='completed' (idempotent).

All RPCs are SECURITY DEFINER, service_role only.

## Worker Configuration

Run as cron job (every 30-60 seconds):

```bash
TELEFUN_SCORING_WORKER_ENABLED=true \
  TELEFUN_SCORING_WORKER_BATCH_SIZE=5 \
  TELEFUN_SCORING_WORKER_INTERVAL_MS=30000 \
  npx tsx apps/api/src/workers/telefun-scoring-worker.ts
```

### Env Vars
- `TELEFUN_SCORING_WORKER_ENABLED` — Set "true" to enable (default: disabled)
- `TELEFUN_SCORING_WORKER_INTERVAL_MS` — Poll interval (default: 30000ms)
- `TELEFUN_SCORING_WORKER_BATCH_SIZE` — Max jobs per batch (default: 5)

### Railway Cron Setup
Add `railway.toml` or Railway CLI cron:
```toml
[cron]
interval = "30s"
command = "TELEFUN_SCORING_WORKER_ENABLED=true npx tsx apps/api/src/workers/telefun-scoring-worker.ts"
```

Or use `node-cron` within the API process.

## Monitoring Queries

### Pending jobs count
```sql
SELECT COUNT(*) FROM telefun_history
WHERE scoring_status IN ('pending', 'failed')
  AND (scoring_next_attempt_at IS NULL OR scoring_next_attempt_at <= now());
```

### Stale leases (processing > 2 minutes without update)
```sql
SELECT id, scoring_claimed_at, scoring_attempt_count
FROM telefun_history
WHERE scoring_status = 'processing'
  AND scoring_claimed_at < now() - interval '2 minutes';
```

### Failed jobs (permanent failures)
```sql
SELECT id, scoring_last_error, scoring_attempt_count, scoring_completed_at
FROM telefun_history
WHERE scoring_status = 'failed';
```

### Job throughput
```sql
SELECT
  scoring_status,
  COUNT(*) as count,
  AVG(scoring_attempt_count) as avg_attempts
FROM telefun_history
GROUP BY scoring_status;
```

## Recovery Procedure

1. **Worker not running**: Set `TELEFUN_SCORING_WORKER_ENABLED=true` and start process.
   Pending jobs will be picked up.

2. **Stale leases**: Claim RPC auto-recovers processing jobs older than 120s.
   Can also manually reset:
   ```sql
   UPDATE telefun_history
   SET scoring_status = 'pending', scoring_next_attempt_at = now()
   WHERE scoring_status = 'processing'
     AND scoring_claimed_at < now() - interval '5 minutes';
   ```

3. **Dead letter investigation**: Check `scoring_last_error` for failed jobs.
   If fixable, reset to pending:
   ```sql
   UPDATE telefun_history
   SET scoring_status = 'pending', scoring_next_attempt_at = now(),
       scoring_attempt_count = 0, scoring_last_error = NULL
   WHERE id = '<session-id>';
   ```

4. **Rollback**: Apply rollback SQL then restart API.
   ```bash
   psql $DATABASE_URL -f supabase/rollbacks/rollback_20260611201000_telefun_scoring_retry_queue.sql
   ```
