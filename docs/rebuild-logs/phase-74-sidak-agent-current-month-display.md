# Phase 74: SIDAK Agent Current Month Display

## 1. Goal & Context
Display the latest audited month name in parentheses next to the agent's average score percentage on the Directory Agent page (`/sidak/agents`). This aligns with legacy requirements and provides better UX so users can see the period context of the score at a glance.

## 2. Implemented Changes

### Shared Types
- Modified `packages/types/src/index.ts`:
  - Added optional `periodMonth?: number | null` property to `AgentDirectoryEntry` interface.

### Backend Services
- Modified `apps/api/src/services/sidak-service.ts`:
  - In `getAgentDirectorySummary`, resolved the latest period for each agent and assigned its month (1-12) to `periodMonth`.

### Frontend Components
- Modified `apps/web/src/components/sidak/AgentCard.tsx`:
  - Re-added the `%` symbol next to the score to achieve legibility parity.
  - Implemented a baseline-aligned flex layout containing the percentage score and the abbreviated audited month name in Indonesian (e.g. `(Mei)`, `(Apr)`).

### Tests
- Modified `apps/web/src/__tests__/sidak-agents-load-more-copy.test.tsx`:
  - Aligned the agent mock generator function to include `periodMonth: null` matching the interface.
- Created `apps/web/src/__tests__/AgentCard.test.tsx`:
  - Added 4 test cases verifying correct formatting of score with `%`, visibility of the abbreviated month name when available, fallback behavior (hiding month) when missing/null, and formatting for null scores (`--`).

## 3. Verification Results

### Automated Tests
- **Frontend test suite (`apps/web`):** 48 files passed, 453 tests passed (including new `AgentCard` component tests).
- **Backend test suite (`apps/api`):** 33 files passed, 473 tests passed.

All tests completed successfully.
