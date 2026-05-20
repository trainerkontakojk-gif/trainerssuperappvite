# Phase 18: PDKT Carbon Copy (Legacy Parity)

## Verdict
PDKT is not yet a carbon copy of the legacy module.

## Legacy Behaviors To Match
- Persistent mailbox with open/replied/deleted states
- Admin/trainer fanout with idempotent source mailbox row return
- AI-generated inbound email with realistic writing mode
- Template mode with consumer-name placement
- Licensed-company vs fictional-company prompt policy
- Custom identity and model settings
- Async evaluation with retry and stale claim protection
- Evaluation polling and usage delta display
- History delete/clear behavior

## Rebuild Status
| Area | Status | Evidence | Required Work |
| --- | --- | --- | --- |
| Mailbox RPC | Partial | `supabase/migrations/005_carbon_copy_parity.sql` | Verify status policy and grants |
| AI template | Partial | `apps/api/src/services/pdkt-service.ts` | Port legacy prompt helpers and validation |
| Settings | Partial | `apps/web/src/routes/pdkt/components/SettingsModal.tsx` | Centralize config generation and model coercion |
| Mailbox UX | Partial | `apps/web/src/routes/pdkt/simulation.tsx` | Add legacy polling and usage delta semantics |
| Tests | Partial | `apps/api/src/__tests__/pdkt.test.ts` | Port focused legacy tests |

## Verification Commands
- `pnpm --filter @trainers/api test`
- `pnpm --filter @trainers/web test`
- `pnpm test`
- `pnpm build`
