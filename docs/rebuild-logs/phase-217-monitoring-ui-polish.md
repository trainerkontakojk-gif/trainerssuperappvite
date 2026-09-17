# Phase 217 — Monitoring UI Polish & Table Usability

**Date**: 2026-09-17
**Status**: DONE

## Summary

Memperjelas navigasi tab pada `/monitoring`, menghilangkan konflik tinggi
variant line-tabs yang menyebabkan label/border tampak terpotong, dan menjaga
kolom aksi tabel tetap terjangkau pada tabel yang lebih lebar.

## Perubahan

### Tab monitoring

- Tab `Riwayat Simulasi`, `Penggunaan Token`, dan `Harga & Kurs` memakai
  line-style dengan teks `text-sm`, semibold, padding interaksi yang nyaman,
  jarak antartab yang jelas, serta underline `primary` pada state aktif.
- `TabsList` variant `line` memakai tinggi otomatis.
- Tinggi fixed `h-8` hanya dimiliki variant tabs default, sehingga tidak lagi
  diwariskan ke line-tabs.
- Border kotak aktif di halaman monitoring dihilangkan; hierarki aktif
  disampaikan melalui foreground dan underline.
- Breadcrumb `Dashboard / Monitoring` duplikatif di dalam halaman dihapus;
  breadcrumb tetap dimiliki oleh app header.

### Riwayat simulasi

- Scroll region tabel diberi label aksesibilitas dan dapat difokuskan keyboard.
- Header tabel sticky saat konten digulir.
- Kolom `Aksi` sticky di sisi kanan dengan lebar minimum yang stabil.
- Kolom `Waktu` memakai lebar minimum dan `nowrap` untuk mencegah pemenggalan
  tanggal/waktu yang mengganggu scanning.
- Tabel mempertahankan overflow horizontal terkontrol untuk data operasional
  yang memang memiliki banyak kolom.

## Design system

Halaman tetap menggunakan primitive UI lokal bergaya shadcn/Base UI dari
`apps/web/src/components/ui/`, dengan Tailwind CSS variables, CVA, dan Lucide.
Tidak menambahkan library UI kedua atau mengubah design system global.

## Verification

- `pnpm --filter @trainers/web exec vitest run src/__tests__/monitoring-unauthorized.test.tsx src/__tests__/monitoring-redesign.test.tsx --reporter=dot --maxWorkers=1`
  - **44 tests passed**
- `pnpm --filter @trainers/web build`
  - **PASS** — TypeScript dan Vite build selesai tanpa compile error.
  - Runner tetap menampilkan warning deprecation Node dan fallback builtin
    Tailwind/Oxc yang tidak memblokir build.
- `git diff --check`
  - **PASS**
- Visual smoke test build lokal pada viewport 1280px dengan fixture read-only:
  - tiga tab terdeteksi;
  - `Riwayat Simulasi` aktif;
  - 236 sesi ter-render;
  - tidak ada clipping tab atau kolom aksi.
