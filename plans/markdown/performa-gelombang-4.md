# Performa gelombang 4: riwayat ringan dan koneksi Telefun

Lane C (API contract + UI data loading). Sumber: audit `/mnt/project-files/audit-performa/laporan.md`.

## 4a. Riwayat PDKT ringan

- `GET /api/v1/pdkt/history?view=list` mengembalikan baris ringkas (`detail: "summary"`): kolom skalar, skor, id/judul skenario pertama, subjek email terakhir. Dipilih dengan proyeksi JSON PostgREST, jadi isi email dan evaluasi penuh tidak keluar dari database.
- `GET /api/v1/pdkt/history/:id` mengembalikan satu sesi penuh (RLS dicek lewat klien user, 404 bila tidak terlihat).
- Web: Riwayat, workspace, dan landing memakai `view=list`. Replay di landing mengambil sesi penuh; Telaah di workspace mengambil evaluasi penuh saat dibuka.
- Pagination sengaja tidak dibuat: baris ringkas ~300 B, sehingga filter dan pencarian di klien tetap instan.
- E2E: `pdkt-resilience-api` (kontrak list/detail) dan `pdkt-flow` describe "PDKT riwayat ringkas".

## 4b. Daftar riwayat Telefun ringan (berikutnya)

## 4c. Koneksi Telefun saat nada dering (berikutnya)

## 4d. Indeks DB (migrasi + langkah untuk Fajar)
