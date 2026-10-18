# Kontrol pengguna — Fase 5b: masa aktif akun dan pilih banyak

Lane D (schema, auth middleware, API contract, UI). Mockup approved by Fajar ("Setuju", 2026-10-18): https://claude.ai/artifact/8YYtzPV81pza4ne35eiGsC. Phase 5a: `kontrol-user-fase-5.md`.

## Requirement

- Masa aktif akun: an account may get a last WIB day (`profiles.active_until`, null = no limit). After that day the account cannot sign in and its open logins end; data stays. Extending lets it back in without approving it again. Past days are refused; trainers cannot change admins; nobody changes their own.
- The user page shows a Masa aktif row with Ubah (amber when 7 days or fewer remain). The approve dialog can set it. The users list shows "Masa aktif habis" with a "Habis" filter. The login page says "Masa aktif akun Anda berakhir {tanggal}. Hubungi trainer Anda untuk memperpanjang."
- Pilih banyak: checkboxes on the users list (only accounts the manager may change), select the page, then "Pilih semua N hasil filter", at most 100, cleared when the filter or search changes. Actions: Setujui (all pending), Batas latihan (agents and leaders; trainers and admins are named as skipped), Masa aktif, Tangguhkan (all active; ends logins). Off actions stay visible with the reason. The result names each success and each failure with its reason; failures stay checked. No bulk delete or bulk role change.

## Design

- Migration `20261018210000_account_active_until.sql` (safe to reapply): adds the column and keeps `active_until` in the self-edit guard trigger. Users can only update `full_name` (column grant). Rollback restores the 20261017130000 guard and drops the column.
- API:
  - `authMiddleware` reads the profile with `select("*")` (works before the migration), refuses an expired account with 403 `ACCOUNT_EXPIRED` and ends its logins.
  - `PUT /admin/users/:id/active-until`; `POST /admin/users/:id/approve` accepts `active_until`.
  - `POST /admin/users/bulk-approve | bulk-suspend | bulk-active-until | bulk-practice-limit | bulk-peserta-suggestions`, 1–100 distinct ids. Each person goes through the single-account function (`account-controls-service.ts`), five at a time; a past day refuses the whole request.
- Shared helpers in `packages/types/src/account-controls.ts` (WIB day, expiry, message, schemas).
- Web: `ActiveUntilDialog` (+ field), `BulkApproveDialog`, `BulkUserActions`, `LimitDialog` bulk mode, `fetchAuthProfile` reads `*`, router guards sign an expired session out to `/?auth=login&message=expired`.

## Tasklist

- [x] RED `account-controls-api.spec.ts` (7 tests), then migration and API.
- [x] RED `account-controls.spec.ts` (4 hermetic tests, verified failing on the old UI), then UI.
- [x] Rollback and reapply tested locally.
- [ ] Production migration: waits for Fajar's permission.
