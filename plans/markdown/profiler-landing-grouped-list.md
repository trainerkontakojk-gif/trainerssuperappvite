# Beranda KTP: satu daftar terkelompok (Opsi B)

## Requirement

Beranda KTP (`/profiler` tanpa `?batch=`) menampilkan dua daftar folder yang sama: navigasi di panel kiri (dikelompokkan per tim) dan tabel datar "Folder / Tim / Peserta" di area utama. Fajar memilih Opsi B dari mockup "Redesign Beranda KTP":

- Di beranda, panel kiri disembunyikan; daftar tim → folder (pemilih tahun, pencarian, menu aksi, "Tim baru") tampil sekali, di area utama, berdampingan dengan "Ulang tahun terdekat".
- Tabel datar lama dihapus.
- Judul grup tim menampilkan total peserta tim.
- Di dalam folder, panel kiri tetap tampil dan punya baris "Ringkasan tahun" untuk kembali ke beranda.
- Viewport sempit: beranda tidak menampilkan tombol "Pilih folder" (daftar sudah ada di halaman); di dalam folder tombol itu tetap ada.

## Design

- `ProfilerYearOverview` merender `ProfilerLibraryNav` di dalam card, bukan tabel sendiri. Empty state "Belum ada arsip tahun" tetap saat tidak ada tahun.
- `ProfilerLibraryNav` mendapat prop opsional `onShowOverview`; bila ada, baris "Ringkasan tahun" tampil di atas daftar. Judul grup menampilkan total.
- `routes/profiler/index.tsx` hanya merender `<aside>` dan bar mobile saat ada folder aktif atau task.

## Tasklist

- [x] RED: perbarui `e2e/profiler-workspace.spec.ts` (tes beranda + kembali ke ringkasan).
- [x] GREEN: ubah tiga file di atas.
- [x] Jalankan spec Profiler terkait, typecheck dan lint web.
