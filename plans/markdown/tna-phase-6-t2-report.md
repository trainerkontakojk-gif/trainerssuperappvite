# TNA Fase 6 — Laporan T2 (ekspor ringkasan rencana)

- **Tanggal:** 2026-11-07. Baseline `e90120c1` (`main`).
- **Rencana:** [`tna-phase-6.md`](tna-phase-6.md) rev. 2 (K40, D30). Lane **C** (UI baru di halaman yang ada, tanpa API atau migrasi baru).
- **Target:** spec browser **hermetic** (semua API di-mock, dev server lokal `127.0.0.1:3005`).

## Perilaku

- Tombol **Ekspor ringkasan** di detail rencana berstatus `aktif`, `evaluasi`, atau `selesai` (rencana yang punya baseline beku). Draf dan dibatalkan tidak punya tombol.
- File diunduh sebagai satu HTML mandiri siap cetak: `TNA-{judul}-{YYYY-MM-DD}.html`. File dibuat di browser dari respons `GET /tna/plans/:id` yang sudah dimuat; tidak ada endpoint baru (T0 §3). Simpan sebagai PDF lewat dialog cetak browser.
- **Isi:**
  - **Kop:** judul, "Diekspor {tanggal jam} WIB", status, program (dengan keterangan "dibekukan saat aktivasi" bila memakai snapshot), parameter dan layanan.
  - **Rencana dan target:** intervensi, jadwal, jatuh tempo evaluasi, target tingkat/sebaran, target latihan simulasi.
  - **Baseline beku:** tingkat, sebaran, temuan/sesi.
  - **Ringkasan TNA** (narasi server).
  - **Peserta saat aktivasi.**
  - **Progres latihan simulasi** bila ada target. Bila progres gagal dimuat, file menyatakannya alih-alih menulis angka.
  - **Ringkasan evaluasi** sejak `evaluasi`:
    - narasi;
    - metrik populasi periode evaluasi;
    - efek bersih, atau catatan pembanding terlalu kecil;
    - tabel evaluasi per peserta, dengan "Tidak diaudit" untuk peserta yang tidak diaudit;
    - verdict, kesimpulan, dan tindak lanjut **hanya saat `selesai`**. Saat `evaluasi`, narasi tetap berawalan "Pratinjau:".
  - **Penutup:** "Perbandingan dan ringkasan ini indikatif, bukan bukti sebab-akibat."
- Semua nilai dari database melewati `esc`. Angka memakai format Indonesia (`number`), dan nilai kosong tampil "Belum tersedia", tidak pernah `null`/`undefined`.

## File

| File                                            | Isi                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/tna/plan-export.ts`        | Baru: `buildTnaPlanHtml`, `canExportTnaPlan`, `downloadTnaPlanHtml`.                                |
| `apps/web/src/routes/tna/html-export.ts`        | Baru: `esc`, `fileSlug`, `fileDate`, `downloadHtml`, dipakai bersama ekspor EFEK dan rencana.       |
| `apps/web/src/routes/tna/efek-export.ts`        | Memakai helper bersama. Nama file EFEK dipertahankan persis (tanpa memangkas tanda hubung di tepi). |
| `apps/web/src/routes/tna/plan.tsx`              | Tombol di samping status/program.                                                                   |
| `apps/web/e2e/tna-export-flow.spec.ts`          | Spec baru (5 test).                                                                                 |
| `plans/markdown/tna-phase-6-ekspor-selesai.png` | Render file ekspor rencana selesai.                                                                 |

## Spec (`tna-export-flow.spec.ts`)

1. **Aktif:**
   - judul berisi `<b>` dan `&` ter-escape di `<title>` dan isi;
   - nama file sesuai pola;
   - kop, target, jadwal, target latihan ("KETIK 3 sesi"), baseline, narasi, dan peserta ada;
   - tanpa bagian evaluasi;
   - tanpa `undefined`/`null`/`NaN`;
   - tidak ada `/api` tak dimock.
2. **Selesai:**
   - narasi evaluasi, verdict, kesimpulan, tindak lanjut, populasi, efek bersih −20, kedua peserta dengan "Tidak diaudit";
   - file dirender dan di-screenshot.
3. **Evaluasi berjalan:** "Pratinjau:", tanpa verdict dan kesimpulan.
4. **Draf dan dibatalkan:** tanpa tombol.
5. **Mobile 390:** tombol ≥ 44px, tanpa scroll horizontal.

## Bukti eksekusi (satu runner pada satu waktu)

| Langkah             | Perintah (di `apps/web`)                                                                                     | Hasil                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| RED                 | `pnpm exec playwright test tna-export-flow.spec.ts`                                                          | exit 1, 4 failed (tombol belum ada); test draf/dibatalkan lulus karena memang tanpa tombol |
| GREEN               | sama                                                                                                         | exit 0, **5 passed** (percobaan pertama)                                                   |
| Sesudah polesan     | sama, plus render screenshot; label "Jatuh tempo evaluasi" menggantikan "Evaluasi jatuh tempo" yang berulang | exit 0, **5 passed**                                                                       |
| Regresi browser TNA | `tna-catalog-flow tna-practice-flow tna-flow tna-evaluation-flow tna-efek tna-export-flow`                   | exit 0, **60 passed** (termasuk unduhan EFEK sesudah refaktor helper)                      |
| Typecheck web + E2E | `pnpm --filter @trainers/web typecheck`                                                                      | exit 0                                                                                     |
| Lint, format, spasi | `eslint` dan `prettier --check` pada file tersentuh; `git diff --check`                                      | exit 0                                                                                     |

## Berikutnya

T3: tab "Hasil rencana" (`/tna/hasil`) memakai `GET /tna/effectiveness`, badge jatuh tempo memakai `GET /tna/plans/due-count`, dan mock bersama di harness (P-5) dengan satu run penuh suite browser hermetic.
