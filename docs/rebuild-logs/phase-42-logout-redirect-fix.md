# Phase 42 — Logout Redirect Bug Fix

## Overview
Ditemukan bug di mana setelah pengguna mengklik tombol **Keluar** (logout), tampilan aplikasi tetap berada pada halaman dashboard ("Pusat Kendali") dengan visual side menu dan avatar pengguna "User", bukan dialihkan kembali ke landing page `/` atau login page.

## Masalah Utama (Root Cause)
1. **`handleLogout()` tidak memiliki navigasi redirect**: Menghapus token di localStorage dan memanggil `supabase.auth.signOut()` tetapi tidak mengalihkan user secara manual.
2. **Tidak adanya auth guard di route `/dashboard`**: Berbeda dengan modul SIDAK/Profiler yang diamankan dengan `requireRole`, dashboard default tidak memiliki `beforeLoad` guard sehingga browser diizinkan merender halamannya tanpa autentikasi aktif.
3. **Fallback guard visual di `Layout.tsx` lambat**: Menggunakan `useEffect` yang dievaluasi setelah render pertama selesai, memicu "flash" dashboard kosong sesaat sebelum `window.location.assign` sempat memicu reload.

## Perbaikan yang Dilakukan
1. **Redirect di `handleLogout`**: Menambahkan pembersihan state secara menyeluruh diikuti dengan pemanggilan `window.location.href = "/"` demi memastikan in-memory state bersih maksimal.
2. **Implementasi `requireAuth()` Guard**:
   - Menambahkan helper check session di `apps/web/src/router.tsx`.
   - Mengamankan route unprotected dengan guard: `/dashboard`, `/ketik`, `/pdkt`, `/pdkt/simulation`, `/telefun`, `/telefun/replay/$id`, dan `/account`.
3. **Redirect Melalui Event Listener**: Memperbarui callback `onAuthStateChange` di `authInit.ts` untuk mendeteksi event `SIGNED_OUT` secara global dan mengarahkan pengguna ke `/` jika berada di luar daftar route public.
4. **Pembersihan Fallback Guard**: Menghapus efek `useEffect` lambat di `Layout.tsx` yang sebelumnya memicu visual flash.

## Verifikasi
- Unit test suite baru ditambahkan di `apps/web/src/__tests__/logout-redirect.test.ts`.
- Eksekusi testing baseline sukses:
  ```bash
  ✓ src/__tests__/logout-redirect.test.ts (1 test)
  ```
