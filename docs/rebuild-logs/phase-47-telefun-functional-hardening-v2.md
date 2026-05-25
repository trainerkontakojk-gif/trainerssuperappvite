# Phase 47: Telefun Functional Hardening & Legacy Parity V2

**Date:** 2026-05-25
**Status:** DONE

## Goal

Close critical parity gaps and hardening defects in the Telefun module identified through a comprehensive legacy vs current codebase audit. Focus on P0 utility functions, bug fixes, and test coverage.

## Gaps Closed

### 1. Fix `resolveTelefunRealisticModeConfig` — Consumer Type ID Mapping (F15)

**File:** `apps/web/src/routes/telefun/services/guards.ts`

**Root cause:** The function was mapping `config.consumerName` (a display name string like "Budi Santoso") against a dictionary of type IDs, making it impossible to resolve the correct persona. Legacy code maps by consumer type IDs (`marah`, `bingung`, `kritis`, `ramah`, `terburu-buru`, `pasrah`).

**Fix:**
- Replaced `CONSUMER_TYPE_TO_PERSONA` with `CONSUMER_TYPE_ID_TO_PERSONA` mapping the 6 consumer type IDs to the 6 persona types (`marah→angry`, `bingung→confused`, `kritis→critical`, `ramah→cooperative`, `terburu-buru→rushed`, `pasrah→passive`)
- Reads `config.consumerType?.id` with fallback to `config.activeConsumerType?.id`
- Added null/undefined guard (`!config || !config.realisticModeEnabled`)

### 2. Fix `getTelefunTimeCueThreshold` — Guard Conditions (Duplicate)

**File:** `apps/web/src/routes/telefun/services/timingGuards.ts`

**Root cause:** `timingGuards.ts` had missing `totalSeconds > 50` / `totalSeconds > 20` guard conditions that existed in the duplicate `guards.ts` version. `PhoneInterface` imports from `timingGuards.ts`, so the guard was never enforced, causing time cues to fire on very short calls (e.g., 10s call would get "30s" cue at 5s elapsed).

**Fix:**
- Added `if (input.totalSeconds <= 0) return null` early return
- Added `input.totalSeconds > 50` guard before 30s cue
- Added `input.totalSeconds > 20` guard before 20s cue

### 3. Fix `ReviewModal` — Pass Coaching Recommendations

**File:** `apps/web/src/routes/telefun/components/ReviewModal.tsx:525`

**Root cause:** `recommendations={[]}` was hardcoded. The `recommendations` variable was correctly computed at line 202 from `coachingSummary?.recommendations` but never passed to `ReplayAnnotator`.

**Fix:** Changed `recommendations={[]}` to `recommendations={recommendations}`.

### 4. Add `isValidRecordingPath` — Recording Path Validation (H6)

**File:** `apps/web/src/routes/telefun/recordingPath.ts`

**Root cause:** Only `buildTelefunRecordingPath` existed. No path validation for ownership, extension, or traversal protection.

**Fix:** Added 3 new exports:
- `isValidRecordingPath(path, userId, sessionId, type)` — Validates UUID ownership (userId + sessionId), filename prefix matching type, extension whitelist (`VALID_EXTENSIONS`), and directory traversal blocking (`..` / `.`)
- `getOwnedRecordingPathOrNull(path, userId, sessionId, type)` — Convenience wrapper: returns path if valid, null otherwise

### 5. Create `replayAnnotationHelpers` — Annotation Utility Module (H1)

**File:** `apps/web/src/lib/replayAnnotationHelpers.ts`

**Root cause:** Complete module was missing from the codebase. The legacy code had `replayAnnotationHelpers.ts` with checksum generation, completeness detection, annotation sorting, priority-based truncation, and validation functions.

**Implementation:**
- `sortReplayAnnotationsByTimestamp()` — Non-mutating ascending sort
- `truncateAnnotationsByPriority()` — Priority-based reduction (critical_moment → improvement_area → strength → technique_used) when count exceeds `MAX_ANNOTATIONS` (30)
- `validateRecommendations()` — Clamps priority [1,5], truncates text to 200 chars, limits to 5 items
- `isValidAnnotation()` — Validates category, moment, text, and non-negative timestamp
- `isValidManualAnnotationText()` — Validates manual text length [1, 500]
- `createReplayAnnotationChecksum()` — Deterministic hash of AI annotation set (ignores manual annotations)
- `hasCompleteAiAnnotationSet()` — Compares current annotations against stored metadata (count + checksum)

### 6. Test Coverage — 4 New Test Files

| Test File | Tests | Coverage |
|---|---|---|
| `telefun-resolve-realistic-config.test.ts` | 12 | All 6 consumer type ID mappings + fallback + disruption types + null/disabled |
| `telefun-recording-path.test.ts` | 16 | Build + ownership mismatch + type mismatch + traversal + extensions |
| `telefun-timing-guards.test.ts` | 13 | Zero/negative total, guard conditions, cue already sent, short calls |
| `telefun-replay-annotation-helpers.test.ts` | 18 | Sort, truncate, validate, checksum, completeness |
| `telefun-voice-assessment-utils.test.ts` | 13 | Non-object null, missing fields, clamping, filters, truncation, defaults |
| `telefun-settings-model-default.test.ts` | 12 | Realistic mode parse, disruption truncation, model preserve, identity legacy format |

**Total:** 84 new tests across 6 files. Existing tests also updated (`telefun-recording-path.test.ts` grew from 12 lines/1 test → 183 lines/16 tests; `telefun-timing-guards.test.ts` grew from 19 lines/1 test → 80 lines/13 tests).

## Verification

- **Web tests:** `pnpm --filter @trainers/web test -- --run telefun` — **99/99 passed** (10 test files)
- **Web build:** `pnpm --filter @trainers/web build` — **passed** (5.91s)
- **Web lint:** 1 pre-existing error (`index.tsx:629` — `react-hooks/immutability`, unrelated to this phase), 0 new errors

## Files Changed

| File | Change |
|---|---|
| `apps/web/src/routes/telefun/services/guards.ts` | Fixed consumer type ID → persona mapping |
| `apps/web/src/routes/telefun/services/timingGuards.ts` | Added guard conditions for short calls |
| `apps/web/src/routes/telefun/components/ReviewModal.tsx` | Fixed recommendations passthrough |
| `apps/web/src/routes/telefun/recordingPath.ts` | Added `isValidRecordingPath` + `getOwnedRecordingPathOrNull` |
| `apps/web/src/lib/replayAnnotationHelpers.ts` | **New file** — annotation utility module |
| `apps/web/src/lib/voiceAssessmentUtils.ts` | Removed unused `hasRequiredAspectFields` |
| `apps/web/src/__tests__/telefun-resolve-realistic-config.test.ts` | **New file** — 12 tests |
| `apps/web/src/__tests__/telefun-recording-path.test.ts` | Expanded from 1 to 16 tests |
| `apps/web/src/__tests__/telefun-timing-guards.test.ts` | Expanded from 1 to 13 tests |
| `apps/web/src/__tests__/telefun-replay-annotation-helpers.test.ts` | **New file** — 18 tests |
| `apps/web/src/__tests__/telefun-voice-assessment-utils.test.ts` | **New file** — 13 tests |
| `apps/web/src/__tests__/telefun-settings-model-default.test.ts` | **New file** — 12 tests |

## Related Plan

`plan/markdown/telefun-functional-hardening-legacy-parity-v2.md`
