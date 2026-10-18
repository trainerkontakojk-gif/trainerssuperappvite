# Kontrol pengguna — Fase 3: Telefun untuk semua dan sisa jatah

Lane D (capability, API contract, schema function, UI). Parent plan and mockup: https://claude.ai/artifact/3VQC3ERfjVLh8P6pLqMpT4. Phase 2: `kontrol-user-fase-2.md`.

## Requirement

- Telefun appears in the menu for every role. The "Akses Terbatas" window is removed. Starting a call stays limited by the daily quota from phase 2 (agent/leader default 0).
- KETIK, PDKT and Telefun show one line with today's remaining quota under the start button (mockup wording). When used up, or at zero, the start button is off and the line says why and when it resets (00.00 WIB). Unlimited accounts see no line.
- Opening Telefun to agent/leader must not open AI spend outside the quota: routes that call AI with no daily limit stay with admin/trainer.

## Audit (Telefun routes for agent/leader)

Every route that reads or changes rows already falls back to the caller's own rows without `telefun.manage`. Two routes spend AI without a daily limit:

- `POST /telefun/score/:id/rerun` (Telaah ulang) → `requireCapability("telefun.manage")`; the button is hidden for other roles, and the "Jalankan Telaah ulang" hint too.
- `POST /telefun/annotations/generate/:id` (not used by the web app) → `requireCapability("telefun.manage")`.
- `POST /telefun/score/:id` (first scoring; failed sessions can be retried) → `aiRateLimitMiddleware`.

## Design

- Migration `20261018170000_practice_quota_status.sql`: `resolve_practice_limit(user, module, day)` (override, then role rule, else 0), used by `consume_practice_quota` and the new `practice_quota_status(user)`; service role only. Rollback restores the phase-2 `consume_practice_quota` body.
- API: `GET /me/practice-quota` (`account.read`) → `PracticeQuotaStatus[]`.
- Types: `PracticeQuotaStatus`; `telefun.use` granted to leader and agent.
- Web: `usePracticeQuota(module)` and `QuotaLine`; wired into KETIK start, PDKT "Email baru" (settings stay usable), Telefun "Mulai simulasi"; quota is refetched after each start attempt. Telefun start errors show the server's quota message. `MaintenanceModal`, `TelefunWarningContext` and the `hasTelefunAccess`/`openMaintenance` props are removed. Agent mobile tabs gain Telefun.

Out of scope: refunding a Telefun start whose call never connected (later), the Batas latihan page and override dialog (phase 4).

## Tasklist

- [x] Audit Telefun routes; guard the two unlimited AI routes.
- [x] Migration + rollback + README row; rollback and re-apply tested locally (phase-2 quota specs pass on the rolled-back schema).
- [x] API endpoint, types, hook, line, page wiring, gate removal.
- [x] E2E: `practice-quota-api.spec.ts` (status endpoint, agent Telefun start refused at zero, rerun 403), access matrix, KETIK/PDKT/Telefun hermetic quota lines, agent Telefun without the window and without Telaah ulang, nav matrix, home agent, agent month-count scope.
- [ ] Root typecheck, lint, build; thermo-nuclear review; CHANGELOG; PR; merge when CI is green.
