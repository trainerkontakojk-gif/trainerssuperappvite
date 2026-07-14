# Auth Callback (Google OAuth)

Dokumen ini menjelaskan alur callback OAuth Google yang ditangani oleh route `/auth/callback`.

## Overview

Saat user melakukan login via Google OAuth, Supabase mengarahkan user ke `/auth/callback` dengan session tokens di URL hash. Route ini memproses session, me-resolve profile, dan redirect ke tujuan yang sesuai.

## Flow

```
User klik "Masuk dengan Google"
  → Supabase OAuth popup/redirect
  → Redirect ke /auth/callback#access_token=...&refresh_token=...
  → AuthCallbackPage memproses:
     1. supabase.auth.getSession() — ekstrak session dari URL hash
     2. fetchAuthProfile(userId) — ambil profile dari backend
     3. Navigate ke tujuan berdasarkan status profile
```

## Destination Logic

| Profile Status | Redirect Target | Keterangan |
|----------------|-----------------|------------|
| `active` | `/dashboard` | User aktif, langsung ke dashboard |
| `pending` | `/waiting-approval` | Menunggu approval admin/trainer |
| `rejected` | `/waiting-approval` | Ditolak (akan di-handling oleh auth guard) |
| `null` (tidak ditemukan) | `/waiting-approval` | Ghost profile, default-deny |

## Error Handling

| Kondisi | Pesan Error |
|---------|-------------|
| OAuth error dari Supabase | "Login Google gagal diselesaikan. Silakan kembali dan coba lagi." |
| Session tidak ditemukan | "Sesi login Google tidak ditemukan. Silakan kembali dan coba lagi." |
| Profile fetch gagal | "Profil login tidak dapat dimuat. Silakan kembali dan coba lagi." |

Error ditampilkan di halaman dengan link "Kembali ke halaman login" (`/`).

## File Terkait

| File | Tanggung Jawab |
|------|----------------|
| `apps/web/src/routes/auth-callback.tsx` | Komponen halaman callback |
| `apps/web/src/routes/auth-callback-contract.ts` | Pure routing contract + error messages |
| `apps/web/src/components/AuthModal.tsx` | Redirect Google OAuth ke `/auth/callback` |
| `apps/web/src/store/authInit.ts` | `/auth/callback` di daftar public routes |
| `apps/web/src/components/Layout.tsx` | `/auth/callback` di-render tanpa sidebar |
| `apps/web/src/__tests__/auth-callback-contract.test.ts` | Regression tests |

## Regression Tests

Test memverifikasi:

1. Status `active` → redirect ke `/dashboard`
2. Status `pending` → redirect ke `/waiting-approval`
3. Error dari Supabase → pesan error yang benar
4. Session null → pesan error yang benar
5. Profile fetch error → pesan error yang benar

## Konfigurasi Supabase

Pastikan URL redirect terdaftar di Supabase Dashboard → Authentication → URL Configuration:

```
Site URL: https://<your-domain>
Additional Redirect URLs:
  https://<your-domain>/**
  https://<your-domain>/auth/callback
  https://<your-domain>/reset-password
```

## Catatan Teknis

- Route ini menggunakan `replace: true` saat navigate untuk menghindari history entry yang tidak perlu (user bisa back ke callback page).
- Component melakukan cleanup via `cancelled` flag untuk menghindari state update setelah unmount.
- Route ini termasuk dalam daftar public routes di `authInit.ts` sehingga tidak di-redirect saat sign out.
