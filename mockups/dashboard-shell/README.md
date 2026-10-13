# Mockup HTML — Shell & Beranda

Usulan redesain shell aplikasi (sidebar, header, tab bar mobile) dan Beranda `/dashboard` setelah login. Mockup ini berdiri sendiri: tidak mengubah route, API, atau komponen di `apps/web`.

## Buka

Font diambil dari `../landing-page/assets/`, jadi buka lewat HTTP dari root repo:

```sh
python3 -m http.server 4179 --bind 127.0.0.1 --directory mockups
```

Lalu buka `http://127.0.0.1:4179/dashboard-shell/`. Bar putus-putus di atas hanya kontrol mockup (pratinjau peran Admin/Leader/Agent dan catatan redesain), bukan bagian produk.

## Catatan batasan

- **Surface:** shell untuk semua route terautentikasi, dan Beranda per peran.
- **Hierarki Beranda:** urutannya Perlu tindakan → Tren temuan QA + temuan per layanan → Aktivitas terakhir / Skor tim + Pintasan. Agent melihat Latihan → Riwayat sesi.
- **Responsif:** di ≥1024px, sidebar 248px bisa diciutkan menjadi rail 64px (dengan tooltip). Di bawah 1024px, sidebar diganti header dengan tombol menu (drawer `<dialog>`) dan tab bar bawah. Tab bar berisi 4 tab sesuai peran ditambah "Lainnya". Tidak ada overflow horizontal di 320, 390, 768, 1280, dan 1440px.
- **Token:** `--bg/--surface/--border/--fg/--fg2/--fg3/--inv-*` dari `docs/design.md`, dan warna modul `--module-*` dari `apps/web/src/index.css`. Tipografi Outfit + Inter.
- **Akses peran:** daftar modul per peran mengikuti `packages/types/src/access.ts`. Telefun dan TNA hanya untuk admin+trainer. KTP dan SIDAK tidak tampil untuk agent.
- **State:** aktif (`aria-current`), hover, dan focus-visible. Grup SIDAK memakai `aria-expanded`. Menu pengguna bisa ditutup dengan Esc. Palet ⌘K/Ctrl+K bisa dipakai dengan panah dan Enter, dan menampilkan pesan bila hasil kosong. Animasi dimatikan saat `prefers-reduced-motion`.
- **Aksesibilitas (audit Impeccable, 13 Okt 2026):** axe WCAG 2.2 AA 0 pelanggaran di desktop gelap/terang, rail ciut, ⌘K, menu pengguna, mobile Leader/Agent, dan drawer. Semua target produk ≥44px; kontrol di bar mockup dikecualikan karena bukan bagian produk. Ada skip link dan `<main>`. Setelah navigasi, fokus pindah ke `h1` halaman baru dan judul dokumen ikut berubah. Teks memakai `--fg2`; `--fg3` hanya untuk ikon/dekorasi, karena nilai `--fg3` di `docs/design.md` gagal kontras 4,5:1.
- **Bukan bagian dari mockup ini:** isi halaman modul, data nyata, penerapan ke React. Pencarian ⌘K adalah fitur baru dan perlu persetujuan sebelum dibangun.

Semua angka, nama, dan aktivitas adalah ilustrasi.
