# Kontrol pengguna — Fase 5a: keluar dari semua perangkat dan batas telaah ulang

Lane D (schema function, API contract, UI copy). Parent plan and mockup (approved by Fajar): https://claude.ai/artifact/3VQC3ERfjVLh8P6pLqMpT4, phase 5 "Kontrol tambahan". Phase 4: `kontrol-user-fase-4.md`.

## Requirement

- When an account is suspended (back to Menunggu), rejected, deleted, or given a lower role, every login still open on another phone or laptop ends at once. A higher role keeps the logins.
- Agent and leader can ask AI to re-score (Telaah ulang) one KETIK session once, because every re-score costs AI money. Trainer and admin have no limit. A retry after a failed first review is not a re-score.
- The KETIK result hides "Telaah ulang" when it is used up and says so; a refused request shows the server's reason and keeps the current result.

Masa aktif akun and Atur banyak orang sekaligus need new screens; they wait for Fajar's choice and a mockup.

## Design

- Migration `20261018200000_user_controls.sql` (safe to reapply):
  - `revoke_user_sessions(user)` deletes the account's `auth.sessions` rows (refresh tokens cascade). It is service role only.
  - `ketik_history.rerun_count`.
  - `enqueue_ketik_review` refuses a second re-score by an agent or leader with `RERUN_LIMIT`. An unknown actor role counts as limited.
  - The rollback restores the 20261016000935 function and drops both.
- API, `admin-service.ts`:
  - `updateUserStatus` (non-active), `deleteUser` and `updateUserRole` (lower rank) call `endAllLogins`.
  - The activity log adds "; semua login-nya diakhiri".
  - An old access token is then rejected (401), because Supabase Auth checks the session.
- API, KETIK: `POST /ketik/review` returns 429 `RERUN_LIMIT` with `KETIK_ERROR_MESSAGES.RERUN_LIMIT`. `GET /ketik/review/status/:id` adds `rerunsLeft` (null = no limit).
- Web: `useKetikReviewStatus` keeps `rerunsLeft` and `rerunRefusal`. `ReviewResult` hides the button and shows the note or reason. The rerun confirmation mentions the single re-score. The user page confirmation texts say open logins end.

## Tasklist

- [x] RED `user-controls-api.spec.ts` (3 tests), then migration and API.
- [x] RED two hermetic tests in `ketik-flow.spec.ts`, then UI.
- [x] Reapply list in `ketik-review-worker-api.spec.ts` includes the new migration.
- [x] Rollback tested locally.
- [ ] Production migration: waits for Fajar's permission.
