# Phase 31: Dashboard User Management Legacy Parity

## 1. Requirement & Goals

1. Menyamakan fungsionalitas user management `dashboard/users`, `dashboard/access-groups`, `dashboard/access-approval`, dan `dashboard/activities` dengan legacy.
2. Menjaga role parity: trainer/admin tetap bisa mengelola area yang dibuka di legacy.
3. Menyatukan contract API, shared types, dan UI (hilangkan local interface drift).

## 2. Implementation Summary

- **Backend Route (`apps/api/src/routes/admin.ts`):**
  - Hapus global `adminOnly` middleware, ganti dengan `requireRole("admin", "trainer")` per route.
  - Tambah endpoint `POST /users/:id/reset-password` (server-side flow via `supabase.auth.admin.generateLink`).
  - `DELETE /users/:id` kini melewati `callerRole` untuk trainer-vs-admin guard.

- **Backend Service (`apps/api/src/services/admin-service.ts`):**
  - `getUsers()`: filter `is_deleted=false` agar deleted user tidak muncul default.
  - `deleteUser()`: cek `callerRole`, trainer tidak bisa hapus akun admin.
  - `resetUserPassword()`: server-side recovery link generation + activity log.
  - `reassignLeaderRequestGroups()`: rollback-safe (save old groups, restore on insert failure).
  - `getActivityLogs()`: limit dinaikkan dari 200 ke 500.

- **Frontend Users (`apps/web/src/routes/dashboard/users.tsx`):**
  - Ganti local `ManagedUser` interface dengan shared type dari `@trainers/types`.
  - Reset password via backend `POST /admin/users/:id/reset-password`, bukan client-side `supabase.auth.resetPasswordForEmail`.

- **Frontend Access Groups (`apps/web/src/routes/dashboard/access-groups.tsx`):**
  - Ganti local `ScopeOptions` dengan shared `AccessScopeOptions`.
  - Rebuild add-rule form: guided builder dengan tipe Team / Service / Specific Agent.
  - Tampilkan label human-readable (Team, Service, nama Agent) di item list.

- **Frontend Access Approval (`apps/web/src/routes/dashboard/access-approval.tsx`):**
  - Ganti local `LeaderRequest` dengan shared `PendingLeaderRequest` / `ApprovedLeaderAccess`.
  - Sesuaikan rendering dengan kontrak API (`leader_name`, `leader_email`, `access_group_ids`, `access_group_names`, `approved_at`, `created_at`).

- **Frontend Activities (`apps/web/src/routes/dashboard/activities.tsx`):**
  - Ganti local `ActivityLog` dengan shared type.
  - Kolom diubah ke: Waktu, Aktor, Aksi, Tipe, Modul + tombol Hapus.
  - Tambah `handleDelete` function.

- **Docs (`plan/markdown/dashboard-user-management-legacy-parity.md`):**
  - Spec-driven plan dengan Requirement, Design, Tasklist, Risk Register, Rollback Plan.

## 3. Verification & Validation

- **API Tests:** 16 files, 251 passed + 4 skipped.
- **Web Tests:** 20 files, 89 passed.
- **Full Suite:** `pnpm test` — 3 tasks, 3 successful.
- **TypeScript:** `tsc --noEmit` lulus untuk kedua workspace (web + api).
- **Production Build:** `pnpm build` berhasil.
