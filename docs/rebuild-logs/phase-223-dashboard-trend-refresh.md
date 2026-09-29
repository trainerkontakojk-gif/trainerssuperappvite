# Phase 223 — Dashboard Quality Trend Visual Refresh

**Tanggal:** 2026-09-29 · **Rute:** `/dashboard`

## Perubahan

- Memulihkan kartu role-aware **Pintasan Cepat** dan **Workspace Terpadu** dengan ikon, judul, deskripsi, serta affordance panah. Link, urutan, role guard, dan handler Telefun tetap dipertahankan.
- Menata ulang **Tren Performa Kualitas** dalam satu permukaan: grafik sebagai area utama di desktop, ringkasan di kolom samping; pada tablet/mobile ringkasan turun di bawah grafik.
- Mengelompokkan filter layanan, tahun, rentang bulan, dan kontrol prediksi. Tab layanan membungkus baris di viewport kecil agar label tidak terpotong.
- Menambahkan legenda teks untuk seri grafik dan prediksi serta merapikan ringkasan menjadi pasangan label/nilai.
- Tidak mengubah rumus, KPI, data, API, filter state/callback, forecast behavior, role/route behavior, ataupun panel dashboard lain.

## Verifikasi

- ESLint scoped: lulus tanpa error; dua warning di `dashboard.tsx` tetap ada (`isAgent` tidak terpakai dan dependency `isManager` belum tercantum).
- `pnpm --filter @trainers/web typecheck`: lulus.
- `pnpm --filter @trainers/web build`: lulus.
- `git diff --check`: lulus.
- Preview lokal menggunakan mock fail-closed, bukan data produksi; 375/768/1440 px pada light/dark, tanpa horizontal overflow atau error halaman. Gambar diperiksa secara visual.
- Unit/Vitest dan E2E tidak dijalankan untuk perubahan presentasi ini. Perintah Impeccable `audit` tidak tersedia di executable; detector yang tersedia mengembalikan `[]`.

## File Implementasi

- `apps/web/src/routes/dashboard.tsx`
- `apps/web/src/routes/dashboard/DashboardTrendPanel.tsx`
