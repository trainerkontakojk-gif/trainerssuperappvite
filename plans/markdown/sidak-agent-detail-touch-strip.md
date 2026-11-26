# SIDAK — Target sentuh dan strip tab detail agen

## Requirement

Tutup audit #5 dan #10 di `/sidak/agents/$id` (Lane C). Di perangkat dengan pointer sentuh, target kembali, muat ulang, aksi profil, filter, tab, toggle Heatmap dan batang bulan harus minimal 44×44 CSS px. Pada lebar 375 px, tab aktif harus utuh saat dibuka lewat tautan atau dipilih; tepi strip yang masih bisa digulir diberi fade. Gulir strip tidak boleh memilih tab atau melompatkan halaman.

## Design

- Gunakan `any-pointer: coarse` dan ukuran CSS px eksplisit karena ukuran `rem` aplikasi dapat lebih kecil dari 16 px. Pertahankan kerapatan desktop dengan mouse.
- Perlebar kolom bulan di perangkat sentuh; pada area sempit hanya grafik yang bergulir horizontal, garis target tetap sejajar dengan batang dan labelnya tetap terbaca di tepi area grafik.
- Pertahankan swipe native pada strip tab. Ukur overflow aktual untuk fade berbasis token; beri ruang pada tab aktif dengan menggeser area tab saja tanpa animasi atau perubahan fokus. Pertahankan aktivasi manual Base UI.
- Tidak ada perubahan grafik heatmap, mekanisme pengambilan data, target QA, atau token status warna.

## Tasklist

- [x] E2E hermetik: RED pada target kembali (35 px) dan fade yang belum ada.
- [x] Perbaiki layout dan interaksi lokal; audit Impeccable Adapt/Polish dengan tangkapan layar desktop dan 375 px serta input sentuh sintetis Chromium.
- [x] Suite layout 14 lulus sebelum polish; setelah polish tiga kasus terfokus dan 11 kasus suite tab lulus. Typecheck/lint/build web dan `git diff --check` lulus.
