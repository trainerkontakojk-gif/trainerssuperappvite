# Mockup HTML — Trainers SuperApp

Konsep responsif berbasis motion. Hero hanya wordmark "Trainers SuperApp" di papan split-flap: saat dibuka, petak berputar melewati nama modul (KETIK/PDKT → TELEFUN/KTP → SIDAK/TNA, berwarna modul) lalu mendarat di wordmark; diarahkan kursor atau diketuk, papan mengocok ulang. Di bawahnya: papan jadwal enam modul (kode berputar masuk saat terlihat), panggung sticky yang memainkan adegan tiap modul saat langkahnya digulir, siklus Latih → Evaluasi → Susun dengan garis yang terisi saat scroll, CTA masuk/akses, dan footer berisi papan "Trainers SuperApp" kecil, tautan ke tiap modul di panggung, serta tautan platform. Identitas mengikuti `docs/design.md`: Outfit + Inter, dark default, divider tipis, warna modul sebagai orientasi, tanpa gradien, blob, atau bayangan.

## Buka

Buka `index.html` langsung di browser. Pertahankan folder `assets/` di sebelah HTML agar font lokal tersedia. Tidak memerlukan build, koneksi internet, atau server aplikasi.

Untuk preview HTTP dari root repo:

```sh
python3 -m http.server 4178 --bind 127.0.0.1 --directory mockups/landing-page
```

Lalu buka `http://127.0.0.1:4178`.

## Batas dan penerimaan

- Prototipe lokal terisolasi (Lane B); tidak mengubah route, auth, API, atau landing aplikasi.
- HTML/CSS/JS lokal. Font disalin dari `apps/web/public/fonts`, dengan lisensi yang sama.
- Panggung modul mengikuti langkah yang aktif saat scroll; tombol "Lihat modul …", tema terang/gelap, menu mobile, dan dialog informasi bekerja dengan keyboard.
- `prefers-reduced-motion`: semua papan langsung menampilkan teks akhir tanpa putaran, adegan langsung tampil dalam keadaan akhir, garis siklus diam. Intro papan selesai dalam ±4,5 detik dan animasi berulang berhenti dalam ±5 detik (WCAG 2.2.2).
- Ukuran display tetap di bawah batas 6rem `docs/design.md`: huruf papan hero maksimal ±4,4rem (petak 88px), judul section maksimal 4rem.
- Papan split-flap merender karakter lewat `data-ch` + `::before` dan diberi `aria-hidden`; nama yang dibaca pembaca layar berasal dari teks `sr-only`.
- Tombol masuk/akses menjelaskan tujuan alur asli melalui dialog demo. Tidak mengumpulkan kredensial atau mengirim data.
- Konten chat/email/telepon/skor/peserta merupakan ilustrasi. Tidak ada AI, panggilan suara, maupun backend.
- Layout tidak boleh overflow pada 320, 390, 768, 1024, dan 1440 piksel.
- HTML dapat dibuka melalui `file://` ataupun HTTP lokal tanpa request eksternal.

## Verifikasi Playwright

Dari root repo dengan dependensi web yang sudah terpasang:

```sh
node mockups/landing-page/verify.cjs
git diff --check
```

E2E membuka server `127.0.0.1` pada port sementara, memblokir request di luar origin lokal, mengecek hero hanya berisi wordmark, intro papan melewati tiga frame modul lalu mendarat di wordmark, hover mengocok ulang, papan jadwal modul mendarat saat terlihat, reduced motion langsung statis, enam adegan panggung saat scroll, tema, dialog, menu mobile, dan overflow. Server serta browser berhenti otomatis. Screenshot tersimpan di direktori temp OS `trainers-landing-mockup`, atau lokasi `MOCKUP_SCREENSHOT_DIR` jika ditentukan.

RED awal (redesign split-flap): verifikasi gagal karena hero belum memiliki papan `.flapboard .flap`. GREEN: perintah di atas lulus, termasuk pemeriksaan WCAG otomatis untuk tema gelap dan terang serta pembukaan langsung lewat `file://`. Pemeriksaan otomatis bukan sertifikasi aksesibilitas atau pengujian perangkat fisik.

Pemeriksaan visual desktop/mobile dilakukan menggunakan Chromium. Detector `impeccable detect` bersih setelah transisi lebar diganti `transform` dan animasi berulang dibatasi.

Dua pengecualian tersimpan melalui `impeccable hooks ignore-value` di `.impeccable/config.json`, khusus `mockups/landing-page/index.html`: `overused-font=inter` karena font diwajibkan `docs/design.md`, dan `cramped-padding=*` karena false positive pada wrapper (tombol 44px, metadata email berpadding vertikal 10px, CTA berpadding 36–48px). Tidak ada rule global atau file yang dinonaktifkan.

Tidak ada unit test, root build, atau migrasi yang diperlukan untuk artefak mandiri ini. Browser skill khusus tidak tersedia pada sesi ini; pengecekan memakai Playwright terpasang.
