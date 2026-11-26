# SIDAK — Tindak lanjut audit Modern Web Guidance

## Requirement

Lane C, khusus `/sidak/agents/$id`: fokus kembali ke tab aktif saat masuk ulang, indikator aktif bertahan dalam forced colors, scrollbar native tetap tersedia bersama fade, MonthRail dapat digulir dengan keyboard saat overflow, dan kedua tabel punya caption native tanpa mengganti nama aksesibelnya.

## Design

- Pertahankan fokus panah dan aktivasi manual lewat Base UI. Di luar tablist, hanya tab aktif menjadi titik masuk. Gunakan border pada pseudo-element indikator dan batasi perubahan ke pemicu tab di detail agen.
- Jangan sembunyikan scrollbar atau ubah swipe/fade. Pada MonthRail, jadikan area grafik bernama dan fokusable hanya saat benar-benar perlu digulir.
- Pertahankan wrapper tabel, scope header, dan judul visual. Pakai caption nonvisual sebagai nama tabel.

## Tasklist

- [x] Reproduksi lima kegagalan di E2E hermetik sebelum perbaikan.
- [x] Implementasikan perbaikan lokal; tinjau dengan Modern Web Guidance dan Impeccable (forced colors/desktop, strip 375 px).
- [x] E2E tab 13 lulus dan layout 15 lulus; typecheck, lint, build web dan diff check lulus.
