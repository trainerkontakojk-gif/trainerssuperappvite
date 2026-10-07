# Text Size Floor

## Requirement

`docs/design.md` §7 menetapkan teks yang dibaca minimal 11px. Kenyataannya:

- `html { font-size: 14px }` membuat `text-xs` Tailwind (0.75rem) dirender 10.5px. Kelas ini dipakai 710 kali di `apps/web/src`.
- Ada 305 ukuran manual `text-[6px]`–`text-[10px]`; 73 di antaranya di SIDAK (`components/sidak`, `routes/sidak`).

Keputusan Fajar (2026-10-07): perbaiki secara global dan mulai dari SIDAK, dengan batas 11px.

Acceptance:

1. `text-xs` dirender ≥ 11px di seluruh aplikasi.
2. Tidak ada teks terlihat < 11px di dashboard SIDAK dan detail agen SIDAK (tab Ringkasan dan Temuan).
3. Tidak ada `text-[6–10px]` tersisa di `components/sidak` dan `routes/sidak`.
4. Layout yang sudah diuji E2E tidak regresi (seluruh suite Playwright default).

Di luar scope: ukuran manual 6–10px di modul selain SIDAK (232 tempat: Telefun, Monitoring, KETIK, PDKT, Profiler, layout) dikerjakan per modul berikutnya.

## Design

Constraint record (`ui-ux-pro-max`):

- Surface: seluruh aplikasi web (global), lalu layar SIDAK.
- Token yang dipertahankan: root 14px, skala Tailwind lain, font, warna. Hanya `--text-xs` di `@theme` yang diubah ke `11px`. Line-height bawaan Tailwind (`calc(1 / 0.75)`, unitless) tetap, jadi baris ikut naik proporsional.
- SIDAK: setiap `text-[6–10px]` diganti `text-xs` (sekarang 11px), sehingga nilai arbitrer hilang dan semuanya memakai satu token. Kelas responsif yang jadi duplikat (`text-xs sm:text-xs`) dirapikan.
- Elemen lebar tetap yang teksnya membesar diperiksa. `SidakInputImportPanel` label baris `R{n}` memakai `w-6`, sehingga diganti `min-w-6 shrink-0` agar nomor baris tiga digit tidak terpotong.
- Non-goal: tidak mengubah hierarki, warna, atau struktur komponen.

## Tasklist

- [x] RED: `e2e/typography-floor.spec.ts` (global `text-xs`), plus scan teks di `sidak-dashboard-insights.spec.ts` dan `sidak-agent-detail.spec.ts` lewat `e2e/helpers/typographyFloor.ts`. Gagal pada nilai lama (10.5px).
- [x] GREEN: `--text-xs: 11px` di `@theme`; 73 penggantian di 22 file SIDAK; `min-w-6` di label baris import.
- [x] Seluruh suite Playwright default.
- [x] `impeccable` audit pada layar SIDAK yang berubah.
- [x] `thermo-nuclear` review.
- [x] Root typecheck, lint, build, `git diff --check`.

## Hasil

- RED: tiga tes gagal pada nilai lama (`text-xs` 10.5px; 46 teks di detail agen, 69 di dashboard SIDAK).
- GREEN: ketiga tes lulus.
- Suite Playwright default di dev server web lokal (port 3005, tanpa backend): 383 lulus, 17 gagal, 3 dilewati, 12 tidak jalan.
  - 16 gagal butuh Supabase lokal (`apps/api/.env.integration`), dan guard loopback memblokir egress remote. Ini lingkungan, bukan regresi.
  - `telefun-history.spec.ts` "landing Telefun dirender tanpa menyentuh backend" juga gagal tanpa baris `--text-xs`. Locator `getByText(/Telefun/).first()` mengenai tooltip sidebar yang tersembunyi. Kegagalan ini sudah ada sebelumnya.
- `impeccable detect` pada 22 file yang berubah: tidak ada temuan.
- Root `pnpm typecheck` exit 0, e2e typecheck exit 0, `pnpm lint` exit 0 (warning lama saja), `pnpm build` exit 0, `git diff --check` bersih.
