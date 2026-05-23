# Phase 23: Profiler Parity Fixes + UI Bug Fixes

## Verdict

Fixed all 27 gaps found during profiler parity audit against `reference-repo`. All button functions, user flows, and visual display now match legacy behavior. Plus fixed a critical UI bug where dropdown folder switching froze on loading.

## Scope

- Profiler backend: cascade delete, rename sync, batch-move, duplicate with participants
- Profiler frontend: 2 new modal components (AddMemberPicker, DuplicateFolderModal)
- Shared types: `labelJabatan` expansion (6→9 entries), `JabatanKey` type
- 8 sub-route page fixes (labelJabatan, batch-move, trainer_id, QA link, etc.)
- `useQueryParams` rewrite to react to TanStack Router navigation
- html2canvas-tailwind-fix port for correct PNG/PDF export colors
- isReadOnly auth context integration via `useProfilerAccess` hook
- Label consistency: "NIP OJK" → "NIK OJK" across 5 files (11 locations)

## Changes

| Area | Change | Files |
|------|--------|-------|
| Backend service | Cascade delete folder (peserta + folder), rename sync batch_name, batch-move endpoint, duplicate folder return participants | `apps/api/src/services/profiler-service.ts`, `apps/api/src/routes/profiler.ts` |
| Shared types | `labelJabatan` expanded to 9 values, `JabatanKey` union, `labelTim` added | `packages/types/src/index.ts` |
| Frontend service | `movePesertaToBatch`, `copyPesertaToFolder`, `getGlobalPesertaPool` methods added; `duplicateFolder` return type updated | `apps/web/src/lib/profilerService.ts` |
| New components | `AddMemberPicker` (port 194 lines), `DuplicateFolderModal` (port 122 lines) | `apps/web/src/routes/profiler/components/` |
| Landing page | Wired up modals, fixed DuplicateFolder onSuccess handler, Trash2 icon + backdrop dismiss in delete modal | `apps/web/src/routes/profiler/index.tsx` |
| Table page | Batch-move via 1 API call, shared labelJabatan, "Lihat Analisis QA" per-row button | `apps/web/src/routes/profiler/table.tsx` |
| Analytics page | Jabatan labels via `labelJabatan` resolution (chart + modal) | `apps/web/src/routes/profiler/analytics.tsx` |
| Add page | Shared `labelJabatan`, `trainer_id` sent via `supabase.auth.getUser()` | `apps/web/src/routes/profiler/add.tsx` |
| Import page | `choices` arrays for Excel dropdown validation | `apps/web/src/routes/profiler/import.tsx` |
| Export/Slides | Shared `labelJabatan`, `html2canvas-tailwind-fix` integrated | `apps/web/src/routes/profiler/{slides,export}.tsx` |
| Teams page | isReadOnly via `useProfilerAccess`, DEFAULT_TIMS sync | `apps/web/src/routes/profiler/teams.tsx` |
| Critical bug fix | `useQueryParams` rewrite — `useEffect([], [])` → `useLocation()` from TanStack Router, fixes dropdown stuck loading | `apps/web/src/hooks/useQueryParams.ts` |
| New hooks | `useProfilerAccess` hook reads user role from profiles table, returns `{isReadOnly, role}` | `apps/web/src/hooks/useProfilerAccess.ts` (NEW) |
| New lib | `html2canvas-tailwind-fix.ts` — inline computed styles, strip oklch() for correct canvas render | `apps/web/src/lib/html2canvas-tailwind-fix.ts` (NEW) |
| Plans | Profiler parity audit + low-priority fixes plans | `plan/markdown/profiler-parity-audit.md`, `plan/markdown/profiler-low-priority-fixes.md` |

## Verification

- `pnpm build` — Monorepo build passes
- `pnpm --filter @trainers/api test` — 238 passed, 4 skipped
- `pnpm --filter @trainers/web test` — 61 passed, 0 failed (12 test files)
- `pnpm test` — all workspaces pass

## Notes

- `isReadOnly` now reads from Supabase auth session + profiles table. Falls back to `trainer` role (editable) if no session/profile found.
- There are remaining chunk-size warnings for large vendor bundles (Recharts, xlsx, pptxgenjs, jspdf, exceljs) — pre-existing, not introduced by this patch.
- Old workspace copies of `AddMemberPicker.tsx` and `DuplicateFolderModal.tsx` were deleted from `components/workspace/`.
