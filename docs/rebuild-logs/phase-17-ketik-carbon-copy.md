# Phase 17: KETIK Carbon Copy (Legacy Parity)

## Summary

Menyamakan modul KETIK Vite dengan full module legacy:

- Landing page menggunakan `ModuleWorkspaceIntro` dengan state `home | chat`
- Settings modal (5 tabs: Scenarios, Consumers, Identity, Templates, System)
- History modal dengan review, replay, dan delete
- Usage modal dengan delta sesi
- Session Review modal dengan auto-polling
- Session Replay modal dengan stepping
- Chat Interface dengan timer, pacing, quick template, image tag, status tick

## Key Changes

### Backend (API)

- `GET /api/v1/ketik/settings` - Load settings (fallback ke default)
- `PUT /api/v1/ketik/settings` - Save settings (user-scoped)
- `GET /api/v1/ketik/history` - List history (user-scoped)
- `POST /api/v1/ketik/history` - Create new session
- `DELETE /api/v1/ketik/history` - Clear all history
- `DELETE /api/v1/ketik/history/:id` - Delete single session
- `GET /api/v1/ketik/review/:sessionId` - Get review detail + typos

### Frontend (Web)

- `/ketik` - Unified landing dengan ModuleWorkspaceIntro + in-place chat shell
- `/ketik/simulation` - Redirect ke `/ketik`
- `/ketik/history` - Redirect ke `/ketik`
- `SettingsModal` - Full 5-tab settings CRUD
- `HistoryModal` - Riwayat + replay + delete + clear
- `UsageModal` - AI usage bulan ini + delta sesi
- `SessionReviewModal` - Scores, AI summary, strengths, weaknesses, typos, coaching
- `SessionReplayModal` - Stepping replay with typo highlights
- `ChatInterface` - Timer, quick templates, image tags, status ticks, CSV export

### Shared Types (`packages/types`)

- `KetikQuickTemplate`, `KetikIdentitySettings`, `KetikAppSettings`
- `DEFAULT_KETIK_SCENARIOS`, `DEFAULT_KETIK_CONSUMER_TYPES`, `DEFAULT_KETIK_QUICK_TEMPLATES`, `DEFAULT_KETIK_SETTINGS`
- `KetikSessionHistoryItem`, `KetikReviewDetail`

## New Files

- `apps/api/src/__tests__/ketik-service.test.ts` - 7 test cases untuk settings/history
- `apps/web/src/__tests__/ketik-landing.test.tsx` - 5 test cases untuk landing page
- `apps/web/src/routes/ketik/ketikApi.ts` - Typed API client
- `apps/web/src/routes/ketik/components/ModuleWorkspaceIntro.tsx`
- `apps/web/src/routes/ketik/components/ChatInterface.tsx`
- `apps/web/src/routes/ketik/components/SettingsModal.tsx`
- `apps/web/src/routes/ketik/components/HistoryModal.tsx`
- `apps/web/src/routes/ketik/components/UsageModal.tsx`
- `apps/web/src/routes/ketik/components/SessionReviewModal.tsx`
- `apps/web/src/routes/ketik/components/SessionReplayModal.tsx`

## Changed Files

- `apps/api/src/services/ketik-service.ts` - Added getSettings, saveSettings, getHistory, persistSession, deleteSession, clearHistory, getReviewDetail
- `apps/api/src/routes/ketik.ts` - Added 7 new endpoints
- `apps/web/src/router.tsx` - Changed /ketik/simulation dan /ketik/history jadi redirect
- `packages/types/src/index.ts` - Added KETIK types + defaults
- `apps/web/src/routes/ketik/index.tsx` - Complete rewrite

## Bugfixes (Round 2)

- **Import path**: `motion/react` → `framer-motion` in all 8 KETIK components (matching existing web deps)
- **API test mock**: `deleteSession`/`clearHistory` now use Proxy-based query builder for chained `.eq().eq()`
- **Frontend test mock**: Added active scenario + consumer type so `startSimulation` doesn't bail early
- **Timer regex**: Changed from `/4:5[0-9]/` to `/5:00/` (timer starts at `duration * 60` = 300s)
- **scrollIntoView**: Mocked in test setup (jsdom doesn't implement it)
- **Auth guard**: Added `session?.access_token` check in `startSimulation` before proceeding
- **sessionDeltaPending**: Added state and passing to UsageModal for post-session delta tracking

## Bugfixes (Round 3)

- **Duration options**: `[3, 5, 10, 15, 20, 30]` → `[5, 10, 15]` + Custom input toggle (matching legacy)
- **Consumers/Identity tab split**: Fixed structural corruption where identity content was nested inside consumers tab
- **Category select wrapper**: Added missing `</div>` closing the `relative` wrapper around the `<select>`/SVG caret
- **ModuleWorkspaceIntro**: Moved from local `./components/` to shared `../../components/` for reuse by PDKT

## Verification

- `pnpm --filter @trainers/api test` - **89 passed** (settings load/save, history CRUD, AI review + PDKT additions)
- `pnpm --filter @trainers/web test` - **44 passed** (landing, modals, simulation, scrollIntoView fix + PDKT tests)
- `pnpm build` - Full monorepo build succeeds (types, API, web)
