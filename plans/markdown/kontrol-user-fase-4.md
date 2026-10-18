# Kontrol pengguna — Fase 4: halaman Batas latihan

Lane D (capability, API contract, schema function, UI). Parent plan and mockup (approved by Fajar): https://claude.ai/artifact/3VQC3ERfjVLh8P6pLqMpT4. Phase 3: `kontrol-user-fase-3.md`.

## Requirement

- Admin and trainer change the daily limit per role (agent, leader) for KETIK, PDKT and Telefun on `/dashboard/batas-latihan`. Trainer and admin are always unlimited. Fajar decided (2026-10-18) that trainers edit role rules too, overriding the mockup note.
- Admin and trainer give one agent or leader a different limit for one module (a number, unlimited, or closed), optionally until a WIB date, with a note. The exception shows on the page, on the user page and in the users list, and can be returned to the role rule.
- Approving a pending account sets its role and, optionally, its KTP participant in one dialog. An Email OJK match is a suggestion only; "Tautkan nanti" is always possible.
- The users list gets a "Batas latihan" column and a "Belum tertaut" filter.

## Design

- Migration `20261018190000_practice_today_summary.sql`: `practice_today_summary()` returns today's started counts per module and how many people reached their limit; service role only. Rollback drops it.
- Types: capability `practice.limits.manage` (admin, trainer); `PracticeLimitRule`, `PracticeLimitOverride`, `PracticeLimitsOverview`, `UserPracticeLimit`; schemas `updatePracticeRulesSchema`, `setPracticeOverrideSchema`, `practiceModuleParamSchema`, `approveUserSchema`; `ManagedUser.practice_overrides`, `ManagedUserDetail.practice_limits`.
- API: `apps/api/src/services/practice-limits-service.ts` (overview, rules, overrides, user limits) and `adminService.approveUser`. Routes in `apps/api/src/routes/admin.ts`. Enforcement stays in the phase 2/3 database functions.
- Web: page `routes/dashboard/practice-limits.tsx`; `LimitDialog`, `ApproveDialog`, `UserPracticeLimits` under `routes/dashboard/components/users/`; users list and user page wired to them; nav entry "Batas latihan".

## Tasklist

- [x] RED API spec `practice-limits-admin-api.spec.ts`, then service, routes, migration.
- [x] RED hermetic spec `practice-limits.spec.ts` (failed 3/3 on the old UI), then page, dialogs, list column and filter.
- [x] Update `management-pages.spec.ts` (Setujui opens the dialog) and `user-detail.spec.ts` fixture; access matrix rows.
- [x] Rollback tested locally (drop, re-apply, service role only).
- [ ] Production migration: waits for Fajar's permission.

## Verification

- `pnpm exec playwright test -c playwright.api.config.ts --project gate-stub --project practice-limits-real-backend` → 31 passed.
- Hermetic: `practice-limits.spec.ts`, `user-detail.spec.ts`, `management-pages.spec.ts` → 12 passed.
- `pnpm typecheck`, `pnpm lint` (0 errors), `pnpm build`.
