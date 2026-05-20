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

## Verification
- `pnpm --filter @trainers/api test` - **89 passed** (including PDKT service/evaluation tests)
- `pnpm --filter @trainers/web test` - **44 passed** (includes PDKT mailbox + settings tests)
- `pnpm test` - All 3 workspaces pass
- `pnpm build` - Full monorepo build succeeds

## Key Changes (Round 2)
- **SettingsModal**: Added `framer-motion` import; model coercion via `coercePdktModelId`; `scrollIntoView` guard; removed unused handlers (`handleToggleAllScenarios`, `handleRemoveScenario`)
- **Landing page**: Full rewrite with `ModuleWorkspaceIntro` (shared), settings/history/usage modals, session delta, mailbox route integration
- **Router**: `/pdkt/history` changed from separate component to redirect to `/pdkt` (matching KETIK pattern); removed unused `PdktHistory` lazy import

## Visual Landing Parity
- `/pdkt` now uses the same `ModuleWorkspaceIntro` shell as KETIK.
- The first screen matches the intended PDKT workspace layout: hero panel, purple accent, and workspace action stack.
- `/pdkt/simulation` remains supported as a compatibility workspace route.
- `/pdkt/history` redirects to `/pdkt` (matching KETIK pattern).
- Action order: `Mulai Simulasi` (purple primary), `Pengaturan`, `Riwayat`, `Usage Bulan Ini`.
- Old card grid (`Tentang PDKT`, `Riwayat Sesi`) removed.
