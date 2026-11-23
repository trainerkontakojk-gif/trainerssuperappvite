# Mode gelap: color-scheme, default mengikuti sistem, tanpa flash — 23 November 2026

Lane C: `apps/web` saja (`index.html`, `index.css`, `useThemeMode`), lintas file, tanpa kontrak API, schema, atau auth.

## Requirement

1. Kontrol native (scrollbar, date picker, form control) mengikuti tema: halaman mendeklarasikan `color-scheme`.
2. Tanpa override tersimpan, aplikasi mengikuti preferensi OS (termasuk perubahan live). Memuat halaman tidak pernah menulis `localStorage`.
3. Tema diterapkan sebelum React mount, sehingga pengguna mode gelap tidak melihat flash terang, juga di bawah CSP produksi `script-src 'self'` (`vercel.json`, `apps/web/public/serve.json`, `docs/deployment.md`).
4. Toggle tetap dua keadaan di UI. Override disimpan di kunci `theme` yang sama (`"light"`/`"dark"`), hanya jika berbeda dari preferensi sistem; memilih tema yang sama dengan sistem menghapus kunci.
5. Sinkron antar tab (`storage`) dan `themechange` tetap bekerja. Varian `dark` Tailwind tetap bergantung pada `.dark` di `<html>`.

## Design

- `index.html`: `<meta name="color-scheme" content="light dark">` diikuti `<script src="/theme-init.js">` klasik (bukan module, bukan defer). File same-origin `apps/web/public/theme-init.js` dipakai, bukan inline, karena CSP produksi memblokir inline script. Skrip kecil itu (try/catch) membaca `theme`, mengisi `content` meta (nilai tersimpan atau `light dark`) dan men-toggle `.dark` dari nilai tersimpan, atau dari `prefers-color-scheme`.
- `index.css`: `:root { color-scheme: light dark }`, lalu `:root:has(> head > meta[name="color-scheme"][content="dark"|"light"])` memetakan meta kembali ke cascade. Tidak ada default hardcode.
- `useThemeMode`: satu union eksplisit `ThemePreference = "system" | ThemeMode`; tema yang dirender = `preference === "system" ? sistem : preference`. `setTheme(target)` menyimpan literal bila target != sistem, menghapus kunci bila sama. Efek mount hanya menerapkan DOM (meta + class), tidak menulis storage. Listener `matchMedia` memperbarui tema saat tidak ada override. Semua akses storage dibungkus try/catch.
- Konsumen (`Layout`, `ThemeToggle`, `LandingHeader`, `Sidebar`, `UserMenu`, `MobileDrawer`) tidak berubah: API `{ theme, setTheme }` tetap.

## Tasklist

- [x] Plan ini.
- [x] RED: `apps/web/e2e/theme-color-scheme.spec.ts` (sistem gelap tanpa nilai tersimpan; toggle simpan/hapus kunci; skrip awal menerapkan tema tanpa modul aplikasi).
- [x] RED: `static-security.spec.ts` "theme bootstrap" pada build produksi dengan header CSP asli (inline script terblokir: `dark: false`).
- [x] Implementasi `index.html`, `public/theme-init.js`, `index.css`, `useThemeMode.ts`.
- [x] GREEN (theme-color-scheme 4/4, static-security 6/6), typecheck web, eslint file yang berubah.
- [x] Review thermo-nuclear: preferensi disimpan di memori (store `useSyncExternalStore`) agar toggle tetap jalan saat key `theme` tidak bisa diakses; `/theme-init.js` di `serve.json` memakai `Cache-Control: public, max-age=0, must-revalidate`; kasus pre-React tanpa nilai tersimpan; catatan di `docs/deployment.md` dan `docs/design.md`.
- [x] RED tambahan: header cache (serve.json HEAD → `immutable`), storage tidak bisa diakses (hook sebelumnya → tombol tidak berganti). GREEN: theme-color-scheme 5/5, static-security 8/8.
