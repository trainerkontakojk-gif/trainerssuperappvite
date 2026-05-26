# Auth Login, Reset Redirect, dan Approval Guard Hardening Plan

## 1. Requirement

### Tujuan
Hardening flow autentikasi di tiga area kritis:
1. **Login Flow** — Token sync, type safety untuk role `qa`, CSRF header, 401 interception
2. **Reset Password** — Guard halaman `/reset-password` agar tidak bisa diakses tanpa recovery session
3. **Waiting Approval** — Guard halaman `/waiting-approval` agar user aktif tidak bisa mengaksesnya

### Acceptance Criteria
- [ ] `aqa` role ditambahkan ke `UserProfile.role` dan `ManagedUser.role` union types
- [ ] `fetchApi` mencegat HTTP 401 dan auto-redirect ke `/` (login)
- [ ] `fetchApi` menambahkan header `X-Requested-With: XMLHttpRequest` untuk CSRF hardening
- [ ] Route `/reset-password` memiliki `beforeLoad` guard — redirect ke `/` jika tanpa recovery session
- [ ] Route `/waiting-approval` memiliki `beforeLoad` guard — redirect ke `/dashboard` jika user sudah aktif
- [ ] `waiting-approval.tsx` mengoptimalkan double-query polling
- [ ] Password validation di backend: min 8 karakter + min 1 huruf besar + min 1 angka
- [ ] Semua perubahan dilindungi regression tests (minimal 12 test cases)

### Edge Cases
- Token expired — `fetchApi` menerima 401, redirect ke `/`, clear localStorage
- User manual ketik `/reset-password` — sebelum 5s timeout, guard redirect ke `/`
- User aktif ketik `/waiting-approval` — guard redirect ke `/dashboard`
- User dihapus (is_deleted) saat di `/waiting-approval` — polling tetap berjalan, signOut + redirect
- Password reset tanpa sesi — redirect cepat (tidak menunggu 5s timeout)

### Constraint Teknis
- Tidak boleh regresi bundle size signifikan (semua perubahan kecil)
- Tidak boleh merubah behavior existing login/logout flow
- Password backend validation hanya untuk reset password, tidak untuk login

## 2. Design

### 2.1 Type Fix — `packages/types/src/index.ts`
Tambahkan `"qa"` ke union:
- `UserProfile.role`: `"admin" | "trainer" | "leader" | "agent" | "qa"`
- `ManagedUser.role`: `"admin" | "trainer" | "leader" | "agent" | "qa"`

### 2.2 CSRF Header — `apps/web/src/hooks/useApi.ts`
Tambahkan `"X-Requested-With": "XMLHttpRequest"` ke default headers di `fetchApi`.
Ini adalah standar CSRF hardening — backend bisa memvalidasi header ini untuk state-changing requests.

### 2.3 401 Interception — `apps/web/src/hooks/useApi.ts`
Setelah `res.json()`, cek `res.status === 401`. Jika iya:
1. Hapus semua localStorage (`auth_token`, `auth_profile`, `trainers_login_time`, `trainers_last_activity`)
2. Clear Zustand store
3. Redirect `window.location.href = "/"` (hard redirect)

### 2.4 Reset Password Guard — `apps/web/src/router.tsx`
Tambahkan `beforeLoad` pada `resetPasswordRoute`:
- Periksa apakah user ada dalam recovery flow via Supabase session check
- Jika tidak ada session atau bukan PASSWORD_RECOVERY, redirect ke `/`
- Ini menggantikan 5s timeout di komponen — guard berjalan SEBELUM komponen mount

### 2.5 Waiting Approval Guard — `apps/web/src/router.tsx`
Tambahkan `beforeLoad` pada `waitingApprovalRoute`:
- Cek session: jika tidak ada, redirect `/`
- Cek profile.status: jika `active`, redirect `/dashboard`
- Jika `is_deleted` atau status `inactive`, redirect `/`

### 2.6 Optimize Double Query — `apps/web/src/routes/waiting-approval.tsx`
Refactor polling query: gunakan single query dengan `.select("status, is_deleted")` dan handle error gracefully tanpa retry penuh — jika query gagal karena `is_deleted` kolom hilang, fallback ke `select("status")` lalu `is_deleted: false`.

### 2.7 Backend Password Validation — `apps/api/src/routes/admin.ts`
Tambahkan validasi password complexity di endpoint `POST /users/:id/reset-password`:
- Minimal 8 karakter
- Minimal 1 huruf besar (A-Z)
- Minimal 1 angka (0-9)
Return error 400 dengan pesan deskriptif jika tidak memenuhi.

### 2.8 Regression Tests
| # | File | Test Case |
|---|------|-----------|
| 1 | `apps/web/src/__tests__/login-flow.test.ts` | UserProfile accepts `aqa` role |
| 2 | (same) | fetchApi adds X-Requested-With header |
| 3 | (same) | fetchApi fires hard redirect on 401 |
| 4 | (same) | fetchApi clears localStorage on 401 |
| 5 | `apps/web/src/__tests__/reset-password-guard.test.ts` | Guard redirects without session |
| 6 | (same) | Guard redirects with non-recovery session |
| 7 | (same) | Guard allows PASSWORD_RECOVERY session |
| 8 | `apps/web/src/__tests__/approval-guard.test.ts` | Guard redirects active user to /dashboard |
| 9 | (same) | Guard redirects no-session to / |
| 10 | (same) | Guard allows pending user |
| 11 | (same) | Polling handles is_deleted detection |
| 12 | `apps/api/src/__tests__/reset-password-validation.test.ts` | Rejects password < 8 chars |
| 13 | (same) | Rejects password without uppercase |
| 14 | (same) | Rejects password without digit |
| 15 | (same) | Accepts valid password |

## 3. Tasklist

| # | Task | File | Priority | Est. |
|---|------|------|----------|------|
| 1 | Tambahkan `aqa` ke type unions | `packages/types/src/index.ts` | P0 | 2m |
| 2 | CSRF header + 401 interception | `apps/web/src/hooks/useApi.ts` | P0 | 10m |
| 3 | Reset password route guard | `apps/web/src/router.tsx` | P0 | 15m |
| 4 | Waiting approval route guard | `apps/web/src/router.tsx` | P0 | 10m |
| 5 | Optimize waiting approval double query | `apps/web/src/routes/waiting-approval.tsx` | P1 | 10m |
| 6 | Backend password complexity validation | `apps/api/src/routes/admin.ts` | P1 | 10m |
| 7 | Writing regression tests | `apps/web/src/__tests__/`, `apps/api/src/__tests__/` | P0 | 30m |
| 8 | Run lint + all tests | root | P0 | 5m |

### Dependencies
- Task 2 (CSRF) independent
- Task 3, 4 depend on importing supabase dan fetchAuthProfile di router
- Task 5 independent
- Task 6 independent
- Task 7 (tests) depend on tasks 1-6

### Risk Register
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| 401 interception terlalu agresif | Low | High | Hanya intercept pada endpoint `/v1/*`, bukan public routes |
| Password complexity terlalu ketat | Low | Medium | Hanya untuk reset password endpoint, bisa disesuaikan |
| Guard redirect loop | Low | High | Guard cek role sebelum redirect, hindari re-route ke halaman yang sama |
| Type widening breaks existing code | Low | Medium | `aqa` adalah penambahan union, bukan pengurangan — backward compatible |

### Rollback Plan
- Semua perubahan adalah non-destructive additions
- Type fix: revert union types
- 401 interception: revert ke throw error tanpa redirect
- Route guards: hapus `beforeLoad`, kembalikan ke tanpa guard
- Password validation: hapus validasi, kembalikan ke client-only check
