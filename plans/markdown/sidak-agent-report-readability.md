# SIDAK Agent Report — Readability Overhaul (Tahap 1 + 2) + XLSX

Lane: **C** (perubahan perilaku lintas file pada laporan unduhan; tanpa schema,
auth/RLS, API publik, atau AI usage).

## Requirement

Permintaan Fajar (2026-10-06): laporan unduhan `/sidak/agents/:id` masih
berantakan dan tidak human readable. Disetujui: **tahap 1 + 2**, dan **CSV + MD
diganti XLSX**.

Masalah yang terbukti dari file unduhan nyata (fixture sintetis, PDF + HTML):

1. Tidak ada kesimpulan; pembaca langsung disuguhi angka.
2. Baris cakupan teknis diulang di hampir setiap seksi; catatan meta
   ("Grafik menampilkan N periode…", "backend", "clean session").
3. Data diulang: skor bulanan = tabel ringkasan + 3 grafik + 3 tabel data.
4. Grafik skor sumbu 0–100 untuk skor 80–95 (garis datar, tanpa target);
   grafik temuan per parameter menumpuk banyak garis putus-putus.
5. Warna perbandingan terbalik: temuan lebih banyak dari tim diberi hijau.
6. Header tabel PDF tidak sejajar dengan kolom rata kanan; judul
   "Akar Masalah" hilang di PDF.
7. Label mentah: `cca`, `CALL`, `non_critical`, `01/2026`, "Score Deduction",
   "NC Score"; selisih skor ditulis "%" padahal poin.
8. Riwayat temuan per tiket sangat panjang; teks identik diulang.
9. CSV multi-seksi tidak nyaman di spreadsheet; MD duplikat isi.

### Acceptance (dibuktikan dari file yang diunduh lewat menu nyata)

- Menu menawarkan **Excel (.xlsx)**, HTML Interaktif, HTML Statis, PDF.
  CSV dan Markdown tidak ada lagi.
- XLSX: file zip asli, sheet bernama (Ringkasan, Skor Bulanan, Temuan, Tiket,
  Akar Masalah, Tren Temuan, Perbandingan), baris header tebal + beku, angka
  sebagai angka, teks berawalan `=`/`+`/`-`/`@` tetap sel teks (tidak pernah
  formula), label manusiawi, sesi tanpa temuan tidak jadi baris.
- HTML & PDF:
  - Seksi **Kesimpulan Utama** deterministik (tanpa AI) di awal: skor bulan
    terpilih vs target 95, capaian target tahun ini, parameter temuan
    terbanyak, fokus coaching (akar masalah teratas).
  - Cakupan ditulis sekali di header; seksi hanya menulis cakupan bila
    berbeda dari header (tiket = bulan terpilih, akar masalah = s.d. bulan
    terpilih, benchmark = cakupan backend).
  - Label manusiawi via satu kamus: layanan `Call`, jabatan `CCA`, kategori
    `Critical`/`Non-critical`, bulan `Februari 2026`, angka desimal koma.
  - Skor: tetap satu metrik satu grafik (keputusan Phase 222), tetapi sumbu Y
    di-zoom dan ada garis target 95; tabel data per grafik dihapus karena
    angkanya sama dengan tabel Rekap Skor Bulanan.
  - Tren temuan: grafik total + **tabel** parameter × periode (menggantikan
    grafik spaghetti parameter).
  - Perbandingan: lebih banyak temuan dari rata-rata = merah (buruk), lebih
    sedikit = hijau.
  - Detail temuan dikelompokkan per parameter; teks identik digabung dengan
    daftar kemunculan (bulan, nomor tiket, nilai). Nomor tiket tetap tampil.
  - Footer satu-dua kalimat manusiawi, tanpa jargon backend.
- PDF: header kolom rata kanan sejajar dengan nilainya; judul "Akar Masalah"
  ada; selisih skor dalam "poin".

## Design

- `apps/web/src/utils/agentReportModel.ts` (baru): kamus label + model laporan
  bersama (highlights, grouping temuan per parameter, label cakupan manusiawi,
  tone perbandingan). Dipakai HTML, PDF, dan XLSX supaya satu definisi.
- `agentReportHtml.ts`: struktur dokumen baru; mempertahankan varian
  statis/interaktif (tab: Ringkasan, Skor, Tren, Temuan). Filter seri tren
  dihapus karena grafik parameter diganti tabel.
- `agentReportPdf.ts`: perbaiki `drawHeader`, struktur baru mengikuti HTML,
  grafik skor mini berdampingan (3 kolom) dengan garis target.
- `agentReportXlsx.ts` (baru): `exceljs` (dependency web yang sudah ada,
  impor dinamis).
- `exportAgentReport.ts`: hapus `generateCSV`/`generateMD` dan helper CSV;
  format `xlsx` menggantikan `csv`/`md`. `useAgentDetail.ts` + menu sidebar
  ikut.
- Keamanan formula XLSX: semua teks ditulis sebagai string sel (`t="s"`/
  inline), tidak pernah `{ formula }`; dibuktikan dari file unduhan.

## Tasklist

1. RED: spec baru `apps/web/e2e/sidak-agent-report-readability.spec.ts`
   (menu 4 format, XLSX, kesimpulan, label, tone, header PDF, Akar Masalah,
   pengelompokan temuan) — jalankan, konfirmasi gagal karena alasan yang benar.
2. GREEN: model + label → HTML → PDF → XLSX → hook/menu.
3. Perbarui spec lama yang mengunci kontrak lama (CSV/MD, judul grafik/tabel
   data skor, label `01/2026`, filter seri) dan date-invariance → XLSX.
   Hapus test CSV/MD yang digantikan test XLSX.
4. Hapus `generateCSV`/`generateMD` beserta helper yang tak terpakai.
5. Docs: `docs/feature-agent-detail-export-csv-md-html.md`, phase log.
6. Verifikasi: focused E2E, `tsc`, eslint file tersentuh, build web,
   `thermo-nuclear`, `git diff --check`, `graphify update .`.
