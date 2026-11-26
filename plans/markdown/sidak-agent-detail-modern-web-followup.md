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

## Requirement — warna dan target QA (#4, #11)

Lane C: detail agen memakai token warna semantik. Label aksesibel bulan memakai target yang sama dengan garis, ringkasan, dan pengelompokan skor.

## Design — warna dan target QA

- Gunakan token status untuk teks, isian dan tint; bedakan warna tindakan destruktif untuk teks dari warna isian tombol. Simpan pasangan warna intensitas kalender di CSS tema yang sama dengan token lain. Jangan ubah rentang kuartil, interaksi, atau ring pilihan/fokus.
- Gunakan `SIDAK_QA_TARGET` tanpa mengubah nilai target, format label, atau aturan skor.

## Tasklist — warna dan target QA

- [x] E2E hermetik: RED sebelum migrasi; GREEN untuk override token status dan heatmap, lima tingkat intensitas, dan kontras angka tanggal di tema terang, gelap, serta forced colors.
- [x] Migrasi kelas warna dan label MonthRail; lima E2E fokus, typecheck, lint dan build web lulus.
- [x] Batch awal terhenti pada tes simpan tanggal saat profil masih dimuat. Setelah perubahan dialog di bawah, suite modal yang terpisah lulus 5/5 tanpa mengubah timeout.

## Requirement — heading, fokus, dan status (#12, #8, #9, #14, #15)

Lane C: heading detail agen berurutan dengan tipografi konsisten. Dialog mengandalkan Base UI dan hanya menampilkan satu kontrol per tanggal. Heatmap mengumumkan tanggal terpilih dan menunjukkan loading saat satuan berubah. Quickview dapat dicoba lagi tanpa memuat ulang profil.

## Design — heading, fokus, dan status

- Pertahankan struktur visual: judul bagian `h2`, judul yang berada di dalamnya `h3` atau lebih rendah sesuai struktur. Judul detail memakai `font-display`.
- Pakai pengelolaan fokus Base UI. Pertahankan label eksplisit pada input tanggal; gunakan `fieldset` dan `legend` untuk kelompok tanggal.
- Pisahkan pengumuman loading dari hasil yang belum mutakhir. Jaga tombol filter tetap bisa difokuskan. Sediakan satu status sopan untuk tanggal dan jumlah temuan tanpa memasukkan tombol tiket ke dalamnya.
- Retry Quickview memakai refetch yang sama untuk permintaan itu saja; jangan ubah aturan konteks, audit, atau kontrak API.

## Tasklist — heading, fokus, dan status

- [x] Buktikan kegagalan heading, kelompok tanggal, status heatmap, dan tombol retry lewat Playwright lokal dengan API sintetis.
- [x] E2E akhir: 11 tes detail agen dan layout, 5 tes modal, dan 3 tes pemakai token skor bersama lulus.
- [x] Tinjau screenshot modal 375 px dan heatmap desktop, jalankan detektor Impeccable, typecheck, lint dan build web.

## Requirement — penanda heatmap dan dokumentasi tema

Lane C: penanda pilihan dan fokus pada kalender bersama tidak memakai `box-shadow` dan tetap terbaca di tema terang, gelap, dan forced colors. Dokumentasi menyebut ikut sistem sebagai default tanpa mengubah perilaku tema.

## Design — penanda heatmap dan dokumentasi tema

Pertahankan dua garis kontras di dalam kotak tanpa mengubah hit area, navigasi, atau warna intensitas. Gunakan border dan outline inset, serta pertahankan outline warna sistem dalam forced colors.

## Tasklist — penanda heatmap dan dokumentasi tema

- [x] Perbarui regresi kontras kalender: RED mendeteksi bayangan lama; GREEN memeriksa penanda fokus dan pilihan tanpa bayangan dengan kontras minimal 3:1.
- [x] Selaraskan dokumentasi; 7 E2E fokus lulus termasuk forced colors, navigasi keyboard, pitch 24 px, dan alur heatmap detail agen. Screenshot terang desktop dan gelap 375 px ditinjau; detektor Impeccable, typecheck, lint, build, dan diff check lulus.
