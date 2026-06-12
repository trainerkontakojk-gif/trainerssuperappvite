# PDKT Mailbox RPC Integration Tests

## Overview

Integration tests for `submit_pdkt_mailbox_batch`, `submit_pdkt_mailbox_reply`, and `soft_delete_pdkt_mailbox_item` PostgreSQL RPC functions. Tests run against a real local Supabase instance (not mocked).

## Prerequisites

- Docker Desktop (running)
- Supabase CLI (`brew install supabase/tap/supabase`)
- Node.js 22+, pnpm 11

## Running Tests

### 1. Bootstrap Supabase

```bash
bash scripts/integration/supabase-bootstrap.sh
```

This will:
- Check Docker is running
- Stop any conflicting Supabase instances
- Start Supabase (excluding storage-api for stability)
- Write `apps/api/.env.integration` with connection details

### 2. Run Integration Tests

```bash
# From project root
pnpm test:db-integration

# Or directly from apps/api
pnpm --filter @trainers/api test:db-integration
```

## Test Architecture

### Files

| File | Purpose |
|------|---------|
| `scripts/integration/supabase-bootstrap.sh` | Bootstrap script for Supabase |
| `apps/api/.env.integration` | Auto-generated env vars (gitignored) |
| `apps/api/src/__tests__/helpers/db-integration-client.ts` | Client helpers (service_role, anon, authenticated) |
| `apps/api/src/__tests__/fixtures/pdkt-mailbox-fixtures.ts` | Fixture data (scenario, config, inbound email) |
| `apps/api/src/__tests__/pdkt-mailbox-rpc-integration.integration.test.ts` | RPC integration tests (17 test cases) |
| `apps/api/vitest.config.db-integration.ts` | Vitest config for integration tier |

### Test Tier Isolation

- **Excluded from unit/fast tiers**: `*.integration.test.ts` files are excluded in `vitest.config.ts`
- **Separate config**: `vitest.config.db-integration.ts` has longer timeouts (30s) and sequential execution
- **Non-memoized**: `turbo.json` sets `cache: false` for integration tests

### Test Isolation

Each test creates its own mailbox items with unique `client_request_id` values. The `afterAll` hook performs bulk cleanup of all test data. Users are created fresh via the Auth Admin API for each suite run.

## Troubleshooting

### Storage container unhealthy

```bash
supabase start -x storage-api,imgproxy
```

### Auth service errors

The auth service may need a restart after schema changes:
```bash
docker restart supabase_auth_trainerssuperappvite
```

### Port conflicts

If ports 54321/54322 are already allocated, another Supabase project may be running:
```bash
supabase stop --project-id trainers-superapp-next
```

### Re-run from clean state

```bash
supabase stop
bash scripts/integration/supabase-bootstrap.sh
pnpm test:db-integration
```

## Covered Scenarios

### submit_pdkt_mailbox_batch
- Happy path: inserts full mailbox item with all fields
- Idempotency: same `client_request_id` + creator returns existing item
- Unauthorized: anon client is rejected

### submit_pdkt_mailbox_reply
- Atomic: history row created + mailbox updated in one RPC
- Idempotent: second reply returns same history_id
- Deleted mailbox: rejected with error
- Non-existent mailbox: rejected
- Unauthorized: anon client is rejected

### soft_delete_pdkt_mailbox_item
- Owner delete: agent can delete own item
- Admin delete: trainer can delete anyone's item
- Leader restriction: leader cannot delete another user's item
- Non-existent: rejected with error
- Unauthorized: anon client is rejected

### RPC Signature & Grants
- Return types verified (UUID, VOID)
- Authenticated role grant: all three RPCs executable by authenticated user
