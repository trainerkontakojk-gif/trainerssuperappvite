# Telefun Fase 4 — contoh ucapan lisan

## Requirement

Tambahkan tepat tiga contoh yang disetujui pada masing-masing enam tipe dari dokumen persetujuan §G. Pertahankan contoh lama, invarian Fase 3, pemilihan voice, dan contoh sebagai referensi nada, bukan kutipan atau kuota. Jangan menambah fakta atau panggilan provider.

## Design

Tambahkan literal §G ke daftar tipe yang sesuai di `getSpeechExamples`; perluas E2E matriks agar memeriksa daftar lengkap, eksklusivitas tipe dan larangan pada contoh baru. Pertahankan teks dan urutan prompt lainnya.

## Tasklist

- [ ] E2E RED lalu GREEN dengan enam tipe.
- [ ] Verifikasi flow, typecheck web dan E2E, lint, format, diff dan review secara serial dengan resource gate.
- [ ] Perbarui dokumentasi, changelog dan laporan Shared.
