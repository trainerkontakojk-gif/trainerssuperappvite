# Phase 99: AI Usage Categories Extraction & KETIK Review State Machine

## Summary

In this phase, we performed targeted maintainability extraction on 2 critical areas: AI usage action classification and KETIK review lifecycle state management. Both were refactored from inline procedural code into pure, testable modules.

### 1. AI Usage Categories Centralization

Extracted inline `SIMULATION_ACTIONS`/`REVIEW_ACTIONS` sets from `apps/api/src/routes/ai.ts` into a centralized definition map.

**New file**: `apps/api/src/lib/ai-usage-categories.ts`
- `USAGE_ACTION_DEFINITIONS` array with 14 action definitions, each with `action`, `category`, `itemKey`, and `itemLabel`
- `getUsageActionDefinition(action)` — returns definition with `"uncategorized"` fallback
- `isUsageActionInCategory(action, category)` — predicate replacing set lookups
- Replaced all `SIMULATION_ACTIONS.has(...)` / `REVIEW_ACTIONS.has(...)` in both `/usage/summary` and `/monitoring/aggregation` endpoints
- Added granular item labels: `"Create Email"`, `"Lampiran AI"`, `"Penilaian AI"`, `"Simulasi Voice"`, etc.

### 2. AI Usage Summary Service Extraction

Extracted 127 lines of inline `/usage/summary` route logic into a dedicated service with enriched `breakdownItems`.

**New file**: `apps/api/src/services/ai-usage-summary-service.ts`
- `getAiUsageSummary()` — single function encapsulating DB query + aggregation + breakdown computation
- Returns `breakdownItems` array with per-key labeled items (e.g., `{ key: "pdkt_create_email", label: "Create Email", category: "simulation", calls, tokens, cost }`)
- `apps/api/src/routes/ai.ts` reduced from 148→21 lines for `/usage/summary` handler

### 3. KETIK Review State Machine

Extracted complex inline review state logic from `review-lifecycle.ts` into a pure deterministic state machine.

**New file**: `apps/api/src/services/ketik/review-state.ts`
- `resolveKetikReviewState()` — pure function with 12 distinct transition cases:
  - `historyStatus === "completed"` with/without review row
  - `historyStatus === "failed"` (terminal, no DB write needed)
  - No job found (pending/processing depending on history)
  - Job completed with/without review row
  - Job failed (mark history failed)
  - Job processing with lease expired (30s grace period, mark both failed)
  - Job processing within lease (return processing)
  - Job queued with 5min TTL timeout (mark both failed)
  - Job queued within TTL (return processing)
- Returns `KetikReviewStateDecision` with `status`, `resultReady`, `errorMessage`, `shouldMarkHistoryFailed`, `shouldMarkJobFailed`, `jobFailureMessage`
- `review-lifecycle.ts` reduced from 153→50 lines, now reads like a declarative state machine caller
- Clean separation: DB writes happen in caller, state computation in pure function

### 4. PDKT Attachment Warning Rendering

Added `attachmentWarning` AlertCard in `EmailDetailPane.tsx` showing amber warning when AI image generation produces diagnostics (e.g., provider limitations, fallback usage).

## Verification

- **Unit Tests**:
  - Added `apps/api/src/__tests__/ketik-review-lifecycle.test.ts` — tests for extracted review state machine
  - Added `apps/api/src/__tests__/pdkt-evaluation-prompt.test.ts` — tests for evaluation prompt edge cases
  - Updated `pdkt-image-generation.test.ts` — attachment warning passthrough test
  - Updated `ai-usage-summary-breakdown.test.ts` — enriched breakdownItems contract test
  - Updated usage modal/summary tests for new response shape
- **Lint Check**: All lint passes with 0 errors
- **Build**: All packages build successfully
