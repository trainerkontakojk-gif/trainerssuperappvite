# Phase 100: Profiler Reorder Auth & Grid View

## Requirements & Objective
We resolved two key issues in the Profiler module:
1. **Reorder Authorization Issue:** Fix the admin and trainer saving issue that threw `Gagal menyimpan urutan: unauthorized` when trying to save participant order.
2. **Grid View Re-design:** Implement a premium, responsive participant grid layout as the default view for the batch table view instead of a long vertical list.

---

## Architectural Changes & Implementation Details

### 1. Database & Backend API Fixes
- **SQL Migration:** Added a terminal migration `20260602000000_fix_bulk_reorder_profiler_peserta_auth.sql` which recreates `public.bulk_reorder_profiler_peserta`. It handles calls made by the `service_role` (backend admin client context where `auth.uid()` is null) properly while retaining role-based checks for `authenticated` roles directly from the database level if called.
- **Service Layer Refactoring:** Updated `apps/api/src/services/profiler-service.ts` to map internal database exceptions to user-friendly messages (`mapReorderError`) and enforce atomic updates without falling back to slow row-by-row updates.

### 2. Frontend Transport Cleanup
- Consolidated API transport wrapper in `apps/web/src/lib/profilerService.ts` by replacing the local custom `fetchApi` fetch logic with the unified `getApi` helper from `useApi.ts`. This ensures correct token headers, 401 interception, `X-Requested-With` CSRF tokens, and text/html error detection.

### 3. High-Fidelity UI Grid
- **ProfilerParticipantCard.tsx:** Created a new premium card component with glassmorphism-inspired borders, smooth transitions on hover (lift, shadow), alt tags, fallback initials, and drag handle integration.
- **ProfilerParticipantGrid.tsx:** A responsive CSS grid layout container displaying 1 column on mobile, 2 on tablet, and 3-4 on desktop without horizontal overflows.
- **Disabled Sort on Filter:** Modified `apps/web/src/routes/profiler/table.tsx` to disable the sort button with a tooltip when active filters/search are enabled, preventing incomplete, out-of-sync partial updates.

---

## Verification & Testing Results

- **API Unit Tests:** Added 6 new unit tests in `apps/api/src/__tests__/profiler-service.test.ts` to verify the mapped error behaviors and success states of `reorderPeserta` and `bulkReorderPeserta`. All 540 API tests passed.
- **Web Unit Tests:** Checked and confirmed all 509 frontend tests passed.
- **Build & Lint Verification:** Project successfully builds (`pnpm build`) and passes linter checks (`pnpm lint`) with 0 errors.
