# SIDAK — Aksesibilitas tab, tabel, dan grafik detail agen

## Requirement

Tutup audit #3, #6, #7, dan #13 di `/sidak/agents/$id` (Lane C, perubahan lintas komponen UI). Panah kiri/kanan dan Home/End memindahkan fokus tanpa memilih tab; Enter/Spasi atau klik memilih tab dan memperbarui URL. Setiap tab menunjuk panel yang ada dan memperoleh nama panel dari tab itu saja. Dua tabel bisa digulir dengan keyboard, dengan header kolom eksplisit. Grafik Tren dapat dibaca tanpa mode aplikasi pembaca layar.

## Design

- Gunakan navigasi manual Base UI. Biarkan Base UI menghubungkan ID tab dan panel; simpan kelima panel di DOM, tetapi tetap tunda isi dan request sampai tab dibuka seperti sebelumnya.
- Beri kedua area gulir nama yang menjelaskan fungsinya, fokus yang terlihat, dan perilaku gulir bawaan browser. Pertahankan header baris dan tambahkan scope kolom.
- Pada detail agen saja, paparkan grafik sebagai gambar bernama. Nilai total bulanan tampil sebagai teks di bawah grafik sekaligus menjadi deskripsinya, dan angka parameter tersedia di tabel yang sudah ada. Grafik di halaman lain dan tooltip pointer tidak berubah.
- Hapus nama yang tidak bermakna pada wrapper Quickview. Jangan ubah strip responsif, ukuran target, token warna, heading, atau perilaku heatmap di luar scope.

## Tasklist

- [x] Tambahkan E2E hermetik untuk fokus/aktivasi/relasi tab, gulir tabel pada 375 px, dan semantik grafik; RED: empat kasus gagal pada kode lama.
- [x] Implementasikan perbaikan lokal tanpa perubahan API.
- [x] Jalankan suite tab detail agen (11 lulus), typecheck/lint/build workspace web, dan `git diff --check`.
