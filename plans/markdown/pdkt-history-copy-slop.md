# PDKT: halaman Riwayat, copy, dan pembersihan AI slop

Lane **D**: redesain UI yang signifikan (Riwayat pindah dari modal ke halaman) ditambah perubahan copy di seluruh PDKT. Tidak ada perubahan API, skema, atau akses. Branch `feat/pdkt-slop-copy-history` dari `origin/main` (`5429428`).

## Requirement

Fajar, 13 Okt 2026: dari sisi AI slop, copywriting, dan bagian Riwayat, PDKT belum diperbaiki. Keputusan:

- Riwayat menjadi halaman sendiri (`/pdkt/history`). Modal riwayat dihapus.
- Audit dan perbaikan AI slop serta copy mencakup seluruh PDKT: landing, kotak masuk, Pahami, Tanggapi, Telaah, Pengaturan, editor skenario, dan Riwayat.

### Masalah saat ini (bukti kode)

1. **Dua tampilan riwayat.**
   - `components/HistoryModal.tsx` dibuka dari landing (tombol "Riwayat", tautan "Lihat semua riwayat") dan dari menu kotak masuk.
   - `routes/pdkt/history.tsx` (`/pdkt/history`) ada, tetapi tidak ditautkan dari mana pun.
2. **Copy modal:**
   - "Riwayat Simulasi PDKT" dan "1 Sesi PDKT Tersimpan" memakai Title Case.
   - Ada istilah Inggris dan teknis: "Export CSV", "Target: …", "Pelaksana: email · role", "(record peserta tidak lagi tersedia)", dan "Tanpa Subjek".
   - "Hapus Semua" memakai `window.confirm`.
3. **Struktur modal:**
   - Skor hanya tampil di dalam badge.
   - Kartu per sesi berisi deretan meta kecil.
   - Tidak ada filter status atau pencarian.
   - Lebar dibatasi modal.
4. **Halaman `/pdkt/history` lama:**
   - Tabel `min-w-[920px]` (scroll samping di ponsel).
   - Ada eyebrow "PDKT" uppercase tracked di atas judul (dilarang `docs/design.md` §8).
   - Copy "snapshot yang tersimpan".
5. Temuan copy dan AI slop di bagian lain PDKT ada di audit (`T2`/`T3` di bawah).

### Hasil yang diharapkan: halaman Riwayat

- **Entri:** tombol "Riwayat" di landing, tautan "Lihat semua riwayat", dan menu kotak masuk membuka `/pdkt/history`.
- **Header:** tombol kembali ke PDKT, `h1` "Riwayat latihan", dan satu kalimat penjelas. Tanpa eyebrow.
- **Ringkasan inline** (teks, bukan kartu metrik): jumlah sesi, jumlah yang sudah ditelaah, dan rata-rata skor dari sesi yang ditelaah. Ringkasan disembunyikan bila belum ada sesi.
- **Filter:**
  - Status: Semua · Ditelaah · Sedang ditelaah · Gagal · Belum ditelaah. Hanya status yang ada datanya yang muncul, selain Semua.
  - Pencarian subjek email atau nama peserta.
- **Daftar:** tabel di ≥640px, baris bertumpuk di ponsel tanpa scroll samping.
  - Kolom: Email (subjek, dengan skenario di bawahnya), Peserta, Tanggal, Skor/Status, dan aksi.
  - Skor ditulis angka mono tebal, seperti tabel "Hasil telaah terbaru" di landing.
  - Status non-skor ditulis teks biasa, bukan badge warna-warni.
- **Buka sesi:** subjek dan tombol "Buka" menavigasi ke `/pdkt?sesi=<id>`. Landing lalu membuka sesi itu di kotak masuk (memakai `initialReplaySession` yang sudah ada), sehingga langsung ke tahap Telaah.
- **Hapus satu sesi dan hapus semua:** lewat dialog konfirmasi (bukan `window.confirm`). "Hapus semua riwayat" diletakkan terpisah dari aksi utama.
- **Unduh CSV:** tetap tersedia (label "Unduh CSV"). Kolom CSV tidak berubah.
- **State:**
  - Memuat: skeleton baris.
  - Gagal: pesan dan "Coba lagi".
  - Kosong: penjelasan dan "Mulai simulasi".
  - Hasil filter kosong: pesan dan "Reset filter".
- **Peserta yang datanya sudah dihapus:** nama dari snapshot, dengan catatan "data peserta sudah dihapus". Label bersama `formatSimulationSubjectLabel` (dipakai KETIK/Telefun) tidak diubah.

### Kriteria penerimaan (E2E hermetic)

1. Tombol "Riwayat" di landing membuka `/pdkt/history` dengan `h1` "Riwayat latihan". Tidak ada dialog riwayat.
2. Daftar menampilkan skor 85 untuk sesi yang ditelaah dan status teks untuk sesi lain. Filter status dan pencarian menyaring baris.
3. "Buka" pada sesi yang ditelaah membawa ke kotak masuk dengan tahap Telaah terbuka.
4. Hapus satu sesi lewat dialog memanggil `DELETE /pdkt/history/:id` dan barisnya hilang. Batal tidak memanggil apa pun.
5. Keadaan kosong, gagal (dengan Coba lagi), dan peserta yang datanya dihapus tampil dengan copy baru.
6. Di 390px tidak ada scroll horizontal. Teks minimal `MIN_TEXT_PX` dan kontrol minimal 44px.

### Di luar scope

- API `/pdkt/history` dan bentuk respons (tidak ada paginasi server).
- Riwayat KETIK/Telefun dan label bersama `formatSimulationSubjectLabel`.
- Unit test legacy (`pdkt-history.test.tsx` dan lain-lain): tidak dijalankan atau ditambah tanpa izin Fajar. Daftarnya dicatat di laporan sebagai inventaris yang basi.

## Design

| File                                         | Perubahan                                                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/pdkt/history.tsx`                    | Ditulis ulang menjadi halaman Riwayat baru. Fetch, mapping, dan CSV dipakai ulang dari modul bersama di bawah.                         |
| `routes/pdkt/utils/sessionHistory.ts` (baru) | Tipe `SessionHistory`, `mapHistoryRow`, `downloadHistoryCsv`, dan helper label sesi. Dipindah dari `HistoryModal.tsx` dan `index.tsx`. |
| `components/HistoryModal.tsx`                | Dihapus. Importir tipe `SessionHistory` pindah ke `utils/sessionHistory.ts`.                                                           |
| `routes/pdkt/index.tsx`                      | Tombol Riwayat dan "Lihat semua riwayat" menavigasi ke `/pdkt/history`. Membaca `?sesi=` untuk membuka sesi.                           |
| `routes/pdkt/simulation.tsx`                 | Menu riwayat kotak masuk menavigasi ke `/pdkt/history`. Modal dilepas.                                                                 |
| `router.tsx`                                 | `validateSearch` `/pdkt` menerima `sesi` opsional.                                                                                     |
| `components/ConfirmDialog.tsx`               | `components/sidak/ConfirmDialog.tsx` dipindah ke lokasi bersama (2 importir SIDAK diperbarui), lalu dipakai Riwayat.                   |

## Tasklist

Satu run Playwright pada satu waktu. Semua RED-first, hermetic, lokal.

- [x] **T1 — Halaman Riwayat**
  - [x] RED: spec Riwayat di `pdkt-flow.spec.ts` (kriteria 1–6) gagal di kode lama. Spec modal lama diganti.
  - [x] GREEN: modul bersama, halaman baru, navigasi landing/kotak masuk, `?sesi=`, dan dialog konfirmasi.

### Keputusan audit (Fajar, 13 Okt 2026)

Audit lengkap ada di [`pdkt-history-copy-slop-audit.md`](pdkt-history-copy-slop-audit.md): 65 temuan (A = copy, B = AI slop). Item yang ditandai "verify against mockup" sudah dicocokkan dengan artifact "Redesign PDKT":

- **Hero landing:** dirapikan, bentuk tetap.
  - Paragraf dipadatkan.
  - Daftar centang "Kasus selalu baru · Tanpa bocoran jawaban · Ditelaah AI" dihapus (A5/B3).
  - Tombol "Atur skenario" dihapus karena sama dengan "Pengaturan" (A33).
  - Animasi tahap dan tata letak tetap.
- **Label aspek** (`lib/pdkt-dimensions.ts`, juga Monitoring): "Arah penerima · Kualitas OJK · Kejelasan · Ejaan · Format balasan" (A7 versi istilah QA).
- **Skenario "ditulis sendiri":** deskripsi tidak ditampilkan ke peserta di dialog Buat email (A20).
- **Sesuai mockup, dipertahankan:**
  - Telaah tetap berupa beberapa kartu (B7). Yang dirapikan hanya kotak bersarang "Perbaiki ini dulu", menjadi pemisah garis seperti di mockup.
  - Garis kiri 2px pada baris kotak masuk yang dipilih (B13).
  - Skor memakai font mono (B17, kecuali angka uang di popover).
  - `<mark>` bergaris bawah oranye (B14, boleh diganti `underline decoration-2` dengan tampilan sama).
- **Di luar scope** (dipakai lintas modul): label bersama `formatSimulationSubjectLabel` dan "Target simulasi" di `SimulationSubjectPicker` (A12 bagian lib, A41). Pesan error backend tidak diubah di API; frontend memetakan ke copy yang ramah (A2–A4).
- **A27:** identitas palsu yang memakai nama publik figur nyata diganti nama karangan.

- [x] **T2 — Copy seluruh PDKT** dengan glosarium audit. Assertion E2E disesuaikan.
- [x] **T3 — AI slop seluruh PDKT**: semua `window.confirm` diganti `ConfirmDialog`, badge/kontras/token dirapikan. B6, B10, B18, B19, B22, dan dekorasi demo (B5) sengaja tidak diubah karena berasal dari mockup.
- [x] **T4 — Gate**
  - [x] Review `thermo-nuclear`: NEEDS_FIX → semua P1/P2 diperbaiki.
    - Status "masih dihitung" tidak lagi tertahan setelah balasan gagal (RED dibuktikan).
    - A27 diterapkan di katalog identitas backend; daftar web yang mati dihapus.
    - `CONFLICT` tidak lagi disebut "dihapus".
    - Mapper riwayat tunggal.
    - Asersi URL `?sesi` deterministik.
    - Link sesi 44px dan catatan peserta terhapus juga di ponsel.
    - Copy popover sesuai yang diukur ("Balasan terakhir").
    - Spec baru: hapus semua riwayat, `?sesi` tidak dikenal, konfirmasi Pulihkan bawaan.
  - [x] Audit `impeccable`: detector bersih di file yang diubah; screenshot desktop, ponsel 390px, terang dan gelap diperiksa.
  - [x] Root `pnpm typecheck`, `pnpm lint` (0 error), dan `pnpm build` exit 0.
  - [x] E2E PDKT, Monitoring, SIDAK periode/pengaturan, main-landmark, beranda agen, usage: 85 lolos.
    - 1 gagal yang sudah ada sebelumnya: `monitoring.spec.ts` "sesi kedaluwarsa" mencari judul landing lama "Lima modul. Satu pengalaman." yang hilang sejak #52.
  - [x] `git diff --check` bersih dan `graphify update .`.

### Inventaris unit test legacy yang basi (tidak dijalankan)

- `pdkt-mailbox-bulk.test.tsx`: `window.confirm` dan copy toast hapus massal lama.
- `pdkt-mailbox.test.tsx`: "Gagal Memuat Email" dan modal "Riwayat Simulasi PDKT".
- `pdkt-settings-modal.test.tsx`: "Pilih Gambar / PDF".
- `monitoring-redesign.test.tsx` dan `monitoring-assessment-completeness.test.tsx`: label aspek lama ("Arah Penerima", "Template").

### Di luar scope, dicatat

- Nama publik figur nyata masih ada di identitas KETIK (`ketikIdentity.ts`, `packages/types/src/ketik.ts`) dan Telefun (`telefunSettings.ts`).
- Backend masih menyimpan `err.message` mentah di `evaluation_error` (frontend kini menyembunyikannya).
