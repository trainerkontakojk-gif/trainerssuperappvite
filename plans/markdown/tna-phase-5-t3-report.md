# TNA Fase 5 — Laporan T3 (UI katalog program)

- **Tanggal:** 2026-11-07. Baseline `e0e7925b` (`main`).
- **Rencana:** [`tna-phase-5.md`](tna-phase-5.md) rev. 2 (D26, K33, K34, K36, P-2, P-3). Lane **D** (antarmuka baru).
- **Skill:** `ui-ux-pro-max` sebelum implementasi, `impeccable` audit sesudahnya.
- **Target:** spec browser **hermetic** (semua API di-mock, dev server lokal `127.0.0.1:3005`). Tidak ada backend, data produksi, atau deploy.

## Catatan desain (ui-ux-pro-max)

- **Permukaan:** route baru `/tna/katalog` (guard `tna.read`), tab ketiga **Katalog program** di `TnaTabs`; baris "Program" di detail rencana.
- **Hierarki:** judul TNA → tab → **Klaster tanpa program** (penjelasan + daftar label, atau kalimat "Setiap klaster… sudah dipicu" bila kosong) → **Program** (tombol **Tambah program**, status mutasi, daftar).
- **Baris program, bukan grid kartu:** nama (semibold), `kode · jenis gap · Aktif/Nonaktif`, deskripsi, lalu `dl` dua kolom: klaster pemicu, layanan ("Semua layanan" bila kosong), latihan simulasi ("Tanpa latihan"), dipakai N rencana. Aktif di atas, nonaktif di bawah, urut nama.
- **Form di tempat, tanpa modal:** "Tambah program" membuka form di atas daftar; "Ubah" mengganti baris itu dengan form. Kode hanya ada saat membuat, dengan petunjuk bahwa kode tidak bisa diubah. Klaster, layanan, dan modul berupa checkbox; nilai yang dikirim selalu mengikuti urutan registry.
- **Nonaktifkan:** konfirmasi inline di baris itu, yang menyebut "Dipakai N rencana" dan bahwa rencana itu tetap berjalan. "Aktifkan" tanpa konfirmasi.
- **Keadaan:** memuat, gagal memuat + **Coba lagi** (katalog dan coverage terpisah), validasi klien (`role="alert"` per field), kode ganda dari server (form tetap terbuka, tanpa "Muat ulang"), revisi basi ("Program sudah berubah, muat ulang" + **Muat ulang**), sukses (`role="status"`).
- **Detail rencana:** "Program: {nama}" di bawah status; rencana yang memakai salinan saat aktivasi menambah "· dibekukan saat aktivasi".
- **Responsif dan aksesibilitas:** target sentuh ≥44px; tab TNA boleh bergulir horizontal di dalam nav sendiri, halaman tidak; tombol baris memakai `aria-label` yang memuat teks terlihat ("Ubah {nama}"); form ber-`aria-label`; fieldset dengan legend.
- **Token:** hanya `border-border`, `text-muted-foreground`, `text-foreground`, `text-destructive`; tanpa warna hardcode.
- **Bukan tujuan:** hapus program, impor/ekspor katalog, riwayat versi program.

## File

| File                                           | Isi                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/tna/catalog.tsx`          | Halaman katalog: coverage, daftar, mutasi buat/ubah/aktif-nonaktif.                                        |
| `apps/web/src/routes/tna/ProgramForm.tsx`      | Form program dengan validasi `createTnaProgramSchema`/`updateTnaProgramSchema`.                            |
| `apps/web/src/routes/tna/TnaTabs.tsx`          | Tab "Katalog program"; nav bisa bergulir di layar sempit.                                                  |
| `apps/web/src/routes/tna/plan.tsx`             | Baris "Program" dari `detail.program`.                                                                     |
| `apps/web/src/routes/tna/utils.ts`             | `gapTypeLabels`; `tnaResponse` menerima pesan konflik (default tetap "Rencana sudah berubah, muat ulang"). |
| `apps/web/src/router.tsx`                      | Route `/tna/katalog`.                                                                                      |
| `apps/web/src/components/layout/nav-config.ts` | Breadcrumb "Katalog program".                                                                              |
| `apps/web/e2e/tna-catalog-flow.spec.ts`        | Spec browser hermetic baru (7 test).                                                                       |
| `plans/markdown/tna-phase-5-*.png`             | Screenshot katalog desktop/mobile terang/gelap dan form mobile.                                            |

## Spec (`tna-catalog-flow.spec.ts`)

1–2. Katalog 1440 dan 390: tab dari `/tna`, URL dan breadcrumb, klaster tanpa program (tanpa "Lainnya"), baris aktif/nonaktif dengan label dan jumlah rencana, urutan aktif dulu, tanpa scroll horizontal, screenshot terang dan gelap. 3. Tambah: kode tidak valid ditolak di klien tanpa request; body `POST` persis (urutan registry); 409 kode ganda tampil, form tetap terbuka, tanpa "Muat ulang". 4. Ubah: form tanpa kode, terisi; body `PATCH` membawa `expected_updated_at` dan urutan registry; pesan "Program disimpan"; form tertutup. 5. Nonaktifkan: konfirmasi menyebut "Dipakai 2 rencana" dan "tetap berjalan"; body `{ active: false, expected_updated_at }`; 409 basi → "Program sudah berubah, muat ulang" + **Muat ulang**. 6. Katalog gagal dimuat → pesan server + **Coba lagi**. 7. Detail rencana: aktif dengan salinan → nama salinan + "dibekukan saat aktivasi"; draft → nama katalog tanpa keterangan.

## Audit impeccable

- `impeccable context` dimuat; `impeccable detect` pada `catalog.tsx`, `ProgramForm.tsx`, `plan.tsx`, `TnaTabs.tsx`: exit 0, **tidak ada temuan**.
- Pemeriksaan visual screenshot (desktop + mobile, terang + gelap):
  - **[P2] Breadcrumb salah** — halaman katalog tertulis "TNA › Rencana". **Diperbaiki** di `nav-config.ts`; spec kini memeriksa "Katalog program".
  - **[P3] Rincian program bertumpuk di mobile** — label dan nilai `dl` satu kolom tanpa jeda sehingga sulit dipindai. **Diperbaiki:** dua kolom (`max-content` + sisa) di semua lebar.
- Skor (penilaian sendiri): A11y 3, Performance 4, Responsive 4, Theming 4, Integrity 4 → **19/20**.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah                 | Perintah (di `apps/web`)                                                   | Hasil                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| RED                     | `pnpm exec playwright test tna-catalog-flow.spec.ts`                       | exit 1, 7 failed (tab/route/elemen belum ada)                                                                                          |
| GREEN percobaan 1       | sama                                                                       | 5 passed, 2 failed: `getByLabel("Nama")` juga cocok dengan checkbox "Salah nama…" (spec diperbaiki ke `exact`)                         |
| GREEN percobaan 2       | sama                                                                       | 6 passed, 1 failed: klaster yang tidak disentuh terkirim dalam urutan tersimpan. Diperbaiki: state awal form mengikuti urutan registry |
| GREEN                   | sama                                                                       | exit 0, **7 passed**                                                                                                                   |
| Setelah perbaikan audit | sama                                                                       | exit 0, **7 passed**                                                                                                                   |
| Regresi browser TNA     | `tna-catalog-flow tna-practice-flow tna-flow tna-evaluation-flow tna-efek` | exit 0, **55 passed**                                                                                                                  |
| Typecheck web + E2E     | `pnpm --filter @trainers/web typecheck`                                    | exit 0                                                                                                                                 |
| Lint                    | `eslint` pada 8 file tersentuh                                             | exit 0, 0 error; 38 warning `react-refresh` lama di `router.tsx` baris 31–84 (bukan dari perubahan ini)                                |
| Whitespace              | `git diff --check`                                                         | exit 0                                                                                                                                 |

## Berikutnya

T4: query read-only produksi untuk parameter SIDAK lama tanpa master (izin K37 sudah ada).
