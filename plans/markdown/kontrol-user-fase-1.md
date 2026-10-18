# Kontrol pengguna — Fase 1: tautan akun ke peserta KTP dan halaman pengguna

Lane D (schema, admin API contract, access scope, significant UI). Mockup approved by Fajar on 2026-10-18 ("lanjut"): https://claude.ai/artifact/3VQC3ERfjVLh8P6pLqMpT4 (source `/mnt/project-files/telaah-kontrol-user/`).

## Requirement

- Admin and trainer can link an app account to exactly one KTP participant (`profiler_peserta`), change it, or remove it. A participant links to at most one account. Accounts may stay unlinked.
- The agent data scope (SIDAK/KTP "self") reads the new link, not `trainer_id`.
- `/dashboard/users/:id` replaces the side panel: account (role, status, registered, last sign-in), linked participant, KETIK assignment, leader access, change history, reset password, suspend/restore, delete (admin only).
- The users list shows the linked participant and opens the user page on row click.
- The KTP profile shows an "Akun aplikasi" row.
- Reset password actually sends the recovery email, to the address stored on the account, not one supplied by the browser. Trainers cannot reset or change admin accounts; nobody changes their own account from this page.
- Email match between account and `email_ojk` is only a suggestion; a person always presses Tautkan.

## Design

Database (`20261018130000_profiler_peserta_akun_link.sql`):

- `profiler_peserta.akun_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL`, unique partial index where not null. `trainer_id` stays as legacy "added by" and is no longer read for scope.
- `activity_logs.target_user_id uuid NULL` with an index on `(target_user_id, created_at desc)` so the user page can show its history.
- `link_profiler_peserta_account(akun, peserta)`: service-role-only RPC that moves or sets the link in one transaction (row lock, unique-violation → `taken`).
- Conservative copy from `trainer_id`: only when it points at an agent/leader account used by exactly one participant.
- `monitoring_sessions` view reads `akun_id` instead of `trainer_id`.

API (`apps/api`, all under `requireCapability("admin.users")` unless noted):

- `GET /admin/users` adds `linked_peserta {id,nama,batch_name,tim}`.
- `GET /admin/users/:id` returns the detail payload.
- `GET /admin/peserta-options?q=&user_id=` returns up to 20 participants with their linked account, plus an email-match suggestion for `user_id`.
- `PUT /admin/users/:id/peserta {peserta_id}` links; 409 when the participant belongs to another account. `DELETE /admin/users/:id/peserta` unlinks.
- `POST /admin/users/:id/reset-password` takes no body email; it reads the stored email and sends `resetPasswordForEmail`.
- `GET /profiler/peserta/:id/account` (`profiler.read`, scoped) returns the linked account summary for the KTP profile.
- `PUT /profiler/peserta/:id` strips `id`, `akun_id`, `trainer_id`, `created_at` so the KTP editor cannot forge a link.
- Admin mutations log with `target_user_id` and human-readable text.

Web (`apps/web`): route `/dashboard/users/$id`, page `routes/dashboard/user-detail.tsx`, `components/users/LinkPesertaDialog.tsx`, users list column + row link, side panel removed, KTP "Akun aplikasi" row.

Out of scope here (next PRs): auto-attributing agent practice to the linked participant, practice quotas, Telefun gaps, Batas latihan page.

## Tasklist

- [x] RED: `e2e/user-peserta-link-api.spec.ts` (real local backend) and `e2e/user-detail.spec.ts` (hermetic UI).
- [x] Migration + rollback + README row; local replay.
- [x] Types, API service/routes, scope change, profiler strip.
- [x] Web page, dialog, list, KTP row.
- [x] GREEN focused specs; root typecheck, lint, build; thermo-nuclear self-review; screenshots desktop/phone (impeccable skill not installed in this host).
- [x] CHANGELOG, docs/auth-rbac.md note.
- [ ] PR, merge when CI is green.
