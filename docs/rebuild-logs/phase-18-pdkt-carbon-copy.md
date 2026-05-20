# Phase 18: PDKT Carbon Copy (Legacy Parity)

## Verdict
PDKT is now a carbon copy of the legacy module. All 9 core behavior slices match, with robust test suites passing locally.

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
| Mailbox RPC | Completed | `supabase/migrations/005_carbon_copy_parity.sql` | None (Grants, status criteria, and idempotent return fully aligned) |
| AI template | Completed | `apps/api/src/services/pdkt-service.ts` | None (Legacy prompt helpers and word count rules ported) |
| Settings | Completed | `apps/web/src/routes/pdkt/pdktSettings.ts` | None (Config generation and fallback model coercion centralized) |
| Mailbox UX | Completed | `apps/web/src/routes/pdkt/simulation.tsx` | None (Evaluation polling, retry, and usage delta display completed) |
| Tests | Completed | `apps/api/src/__tests__/pdkt.test.ts`, `apps/web/src/__tests__/pdkt-mailbox.test.tsx` | None (Ported backend and frontend test cases pass) |

## Verification Commands
- `pnpm --filter @trainers/api test` (Passes)
- `pnpm --filter @trainers/web test` (Passes)
- `pnpm test` (Passes)
- `pnpm build` (Passes)
