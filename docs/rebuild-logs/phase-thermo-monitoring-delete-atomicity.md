# Phase Rebuild Log: Thermo Phase 1 Monitoring Delete Atomicity

## Overview

- **Root Cause**: Monitoring history deletion in `apps/api/src/routes/ai.ts` was non-atomic, performing multiple sequential deletes without a transaction. It also lacked proper error checking and used an incorrect table name for Telefun coaching summaries.
- **Solution**: Implemented a transactional PostgreSQL RPC `delete_monitoring_history` that handles all child deletions atomically. Refactored the Hono route to delegate to a typed service that calls this RPC.
- **Atomicity**: Single transaction via RPC ensuring all related rows are deleted or none.
- **Security**: RPC restricted to `service_role` only.

## Changes

### Backend (API)

- **RPC Migration**: `supabase/migrations/20260605100000_atomic_monitoring_history_delete.sql`
  - Creates `public.delete_monitoring_history(p_module TEXT, p_id UUID)`.
  - Dispatches based on module (`ketik`, `pdkt`, `telefun`).
  - Handles KETIK children: `ketik_session_reviews`, `ketik_typo_findings`, `ketik_review_jobs`.
  - Handles Telefun legacy support in `results` table.
  - Relies on FK cascade for `telefun_coaching_summary` and `telefun_replay_annotations`.
  - REVOKE from `public`, `anon`, `authenticated`.
  - GRANT to `service_role`.
- **Delete Service**: `apps/api/src/services/monitoring-history-delete-service.ts`
  - Typed wrapper for the RPC call.
  - Maps database errors (e.g., "not found") to domain errors (`NOT_FOUND`).
  - Defensive payload validation, including module-to-source consistency.
- **Route Refactor**: `apps/api/src/routes/ai.ts`
  - Replaced ~35 lines of manual orchestration with a single service call.
  - Added strict Zod validation for `module` (enum) and `id` (UUID).
  - Human-friendly error mapping without exposing unexpected internal error text.

### Documentation

- **Monitoring Doc**: `docs/MONITORING_TOKEN_USAGE_BILLING.md`
  - Added "Penghapusan Riwayat (Atomic Delete)" section.
  - Updated Access Matrix with delete capability.

## Verification Evidence

### Automated Tests

- **Migration Contract**: `apps/api/src/__tests__/monitoring-history-delete-migration.test.ts`
  - PASS: Asserted RPC definition, security-definer, search_path, and privilege grants.
  - PASS: Verified canonical Telefun table names and FK cascades.
- **Service Unit Tests**: `apps/api/src/__tests__/monitoring-history-delete-service.test.ts`
  - PASS: Success payload handling.
  - PASS: NOT_FOUND mapping.
  - PASS: DELETE_FAILED mapping.
  - PASS: Malformed, unknown-source, and module/source-mismatch rejection.
- **Route Integration Tests**: `apps/api/src/__tests__/monitoring-history-delete-route.test.ts`
  - PASS: Role guard (403 for agents).
  - PASS: Invalid module/UUID (400).
  - PASS: Success delegation (200).
  - PASS: Error mapping (404/500) and internal-message redaction.

Targeted verification result after review:

```text
Test Files  5 passed (5)
Tests       29 passed (29)
```

Full API regression result:

```text
Test Files  68 passed (68)
Tests       626 passed | 1 skipped (627)
```

### Structural Checks

- **Grep Gate**: `rg -n "telefun_coaching_summaries|ketik_session_reviews.*delete|telefun_history.*delete" apps/api/src/routes/ai.ts`
  - Result: No matches (confirmed direct table orchestration removed).
- **TypeScript Compile**: `tsc -p apps/api/tsconfig.json --noEmit`
  - Result: PASS.
- **Lint Check**: `pnpm --filter @trainers/api lint`
  - Result: PASS.
- **Official Supabase Docs Check**:
  - Confirmed JavaScript RPC invocation contract.
  - Confirmed `SECURITY DEFINER` requires explicit justification and a controlled `search_path`.
  - Context7 was not callable in the review session, so official Supabase documentation was used as the fallback source.

## Migration Status

- **Static Validation**: PASS.
- **Replay Validation**: Attempted, but the validator exited before connecting because neither `DATABASE_URL` nor `SUPABASE_DB_URL` was available.

## Post-Execution Review Fixes

The initial agent implementation was close to the plan but not fully compliant.
The review added:

- fail-closed `auth.role() IS DISTINCT FROM 'service_role'` handling,
- strict validation of the RPC `source` field and module/source pairing,
- redaction of unexpected internal error messages,
- assertions that invalid module/UUID requests never call the delete service,
- formatting cleanup and a grep-compatible plural-table regression guard.

## Constraints Observed

- No Telefun scoring or other thermo phases implemented.
- No changes to frontend contract or URL patterns.
- Atomic and truthful 404/500 responses.
