# Dashboard — Pulihkan kartu navigasi, rapikan tren kualitas

## Requirement

- Kembalikan tampilan kartu `Pintasan Cepat` dan `Workspace Terpadu` seperti baseline Git sebelum perubahan visual sesi ini: ikon modul, judul/deskripsi, dan panah. Pertahankan seluruh href, role/access guard, urutan, teks, dan handler Telefun.
- Fokus redesain hanya pada `Tren Performa Kualitas`: jadikan judul/konteks, filter periode dan layanan, grafik, serta Ringkasan Performa lebih padu dan mudah dipindai.
- Jangan mengubah data/KPI, sumber dan cakupan metrik, filter behavior, API, route, forecast logic, atau panel dashboard lain.
- Batasi file produk pada `apps/web/src/routes/dashboard.tsx` dan `apps/web/src/routes/dashboard/DashboardTrendPanel.tsx`. Worktree memiliki perubahan SIDAK tak terkait; jangan sentuh/stage/commit perubahan tersebut.

## Design

- Referensi kartu: `git show HEAD:apps/web/src/routes/dashboard.tsx` untuk gaya pada baseline yang dimaksud; struktur kartu lama terverifikasi di HEAD. Gunakan satu link/card utuh dengan ikon/title/deskripsi/panah; jangan sisipkan tombol lain. Pertahankan warna aksen lama, tetapi teks deskripsi wajib tetap terbaca dalam mode gelap sesuai ambang kontras desain.
- Satu permukaan untuk section tren—tanpa Card-in-Card. Tempatkan heading dan angka cakupan lintas layanan secara jelas, lalu kelompokkan kontrol filter, chart, dan ringkasan di hierarki yang sama. Bedakan eksplisit cakupan angka lintas layanan dengan data ringkasan yang mengikuti tab layanan.
- Desktop: grafik menjadi area utama dan Ringkasan Performa sebagai kolom sekunder yang cukup lebar. Tablet/mobile: kontrol wrap tanpa clipping; service tabs wrap onto additional rows instead of cutting labels off behind a horizontal-scroll edge; ringkasan turun di bawah grafik.
- Pertahankan legibility kedua tema, fokus keyboard, loading/empty/error/forecast states, semua label dan seri grafik. Chart time-series wajib memiliki legend/label dan tooltip; jangan mengandalkan warna saja untuk membedakan layanan. Ikuti `docs/design.md` dan hasil panduan UI/UX Pro Max yang relevan.

## Tasklist

1. Snapshot `git status --short`; jangan menimpa perubahan lain. Bandingkan segmen JSX kartu dengan `HEAD` dan pulihkan presentasinya saja.
2. Rapikan pembungkus tren di `dashboard.tsx` menjadi satu permukaan, tanpa mengubah props, render guard, `Suspense`, angka global, atau handlers.
3. Redesain layout kontrol/chart/ringkasan di `DashboardTrendPanel.tsx`; pertahankan state, rumus, data, tabs/select/month picker, tombol forecast, dan callback persis.
4. Jalankan detector/impeccable audit, render lokal dengan mock fail-closed yang hanya mengizinkan request app/API test yang eksplisit; ambil dan inspeksi screenshot 375/768/1440 px, light/dark, tanpa data/kredensial produksi. Audit clipping/overflow dan keyboard focus.
5. Jalankan scoped ESLint/typecheck/build, root `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`; jalankan `graphify update .` sekali jika kode berubah. Tinjau final diff dan pastikan file produk hanya dua path yang diizinkan.
6. Laporkan hasil visual dan gate berdasarkan output aktual. Setelah permintaan eksplisit Fajar, commit hanya perubahan dashboard dan dokumentasi yang disetujui; jangan push/deploy atau stage perubahan SIDAK yang tidak terkait.

## Verification notes

Perubahan yang diminta bersifat visual/layout. Jangan menambah atau menjalankan unit/Vitest. Gunakan bukti screenshot lokal ter-mock dan compile/lint gates; jangan klaim audit aksesibilitas penuh hanya dari screenshot. Berhenti bila ada request keluar dari daftar mock atau gate gagal karena penyebab baru yang belum dijelaskan.
