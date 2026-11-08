# Hasil perbaikan lifecycle tambahan

**Aplikasi:** Trainers SuperApp (`trainerssuperappvite`)

**Tanggal:** 8 November 2026

**Basis Git:** `6a6d9ba0b8d6130c4951a2fd5948c297b38d2ed4` beserta perubahan lokal yang sudah ada.
**Status dokumen:** perbaikan tambahan selesai dan terverifikasi secara lokal. Tidak ada perubahan produksi; suite browser menyeluruh tidak diklaim bersih.

## Yang diubah

### 1. Persetujuan akses leader

Approve/reject/revoke/penggantian grup memakai satu RPC transaksi: `transition_leader_access`. Request dikunci dan status asal diperiksa. Perubahan status dan grup berhasil bersama atau dibatalkan bersama; bukan lagi beberapa write dengan upaya pemulihan terpisah.

Reproduksi sebelum perbaikan berhasil memperlihatkan request tetap `approved` ketika penautan grup dan write kompensasi gagal. Setelah perbaikan, E2E melalui router asli dan database disposable lulus untuk rollback, dua approve bersamaan, konflik approve/reject, penggantian grup gagal, self-approval, grup invalid, dan penolakan pemanggil RPC anon/authenticated.

File utama:

- `apps/api/src/services/leader-access-transitions.ts`
- `apps/api/src/services/admin-service.ts`
- `apps/api/src/routes/admin.ts`
- `supabase/migrations/20261108000000_leader_access_transitions.sql`
- `supabase/rollbacks/rollback_20261108000000_leader_access_transitions.sql`

**Batas:** jaminan transaksi berlaku pada jalur API/RPC baru. Grant/RLS tabel untuk penulis lain tidak diubah. Migration baru hanya diterapkan pada database disposable untuk pengujian; belum pada remote.

### 2. Modal autentikasi

Status request disatukan melalui reducer. Respons request lama tidak lagi mengarahkan halaman atau memperbarui hasil UI setelah modal ditutup. Pemeriksaan sebelum perbaikan memang memperlihatkan navigasi ke dashboard setelah login yang ditunda diselesaikan pada modal yang sudah ditutup.

Menutup modal tidak disamakan dengan membatalkan akun yang telanjur dibuat provider: penyiapan profil signup tetap dicoba, tetapi hasil UI usang diabaikan. Ini bukan transaksi atomik antara Supabase Auth dan tabel profil; tidak ada akun yang dihapus sebagai kompensasi.

File: `apps/web/src/components/AuthModal.tsx`.

### 3. Draf balasan PDKT

Draf disimpan sebelum menunggu pengiriman. Request pending tidak dianggap sudah terkirim; keluar layar sebelum debounce selesai tetap mempertahankan ketikan terakhir. Draf dibuang hanya setelah callback mengonfirmasi keberhasilan dan isi penyimpanan masih sama dengan teks yang dikirim. Ada fase editing/confirming/sending/failed/sent dan guard pengiriman ganda.

Reproduksi sebelum perbaikan memperlihatkan penyimpanan draf kosong ketika pengguna keluar saat send pending. E2E mencakup keluar saat pending, kegagalan lalu retry, klik konfirmasi ganda, dan penghapusan draf setelah keberhasilan.

File: `apps/web/src/routes/pdkt/components/ReplyComposer.tsx`.

### 4. Form Kegiatan

Fase form dipusatkan dalam reducer. Field dikunci saat baca gambar/simpan berlangsung; handler juga memiliki guard untuk operasi yang tumpang tindih. Gagal simpan mempertahankan isi dan menampilkan pesan di dalam dialog, sehingga pengguna dapat mencoba lagi.

Sebelum perbaikan, E2E membuktikan field masih editable ketika request simpan ditahan. Perbaikan menghindari ketikan baru yang diam-diam dibuang oleh respons simpan lama.

File: `apps/web/src/routes/dashboard/kegiatan.tsx`.

### 5. Pengaturan Telefun

Tes gagal-simpan lalu retry sudah lulus sebelum perubahan. Karena itu **tidak dilaporkan sebagai bug kehilangan draf yang terbukti**. Fase save/error dirapikan menjadi reducer saat tes tetap hijau; single-flight dan kebiasaan mempertahankan draf tetap dipertahankan.

Reset draf karena props refresh belum direproduksi sebagai bug pada route aktual, sehingga perilaku sinkronisasi props tidak diubah secara spekulatif. Editor bersama `useCrudForm` dan modul pengaturan lainnya tidak dirombak.

File: `apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts`.

### Yang sengaja tidak diubah

- Harga AI terjadwal: status efektif diturunkan dari waktu; bukan bug yang perlu dipaksa menjadi reducer.
- Lifecycle panggilan/rekaman/scoring Telefun, antrean chat/review KETIK, dan lifecycle bisnis TNA tidak dirombak pada pekerjaan ini.
- Perbaikan lokal SIDAK, Profiler, callback OAuth, `useAccessStatus`, dan pemulihan evaluasi PDKT dari pekerjaan sebelumnya tetap dipertahankan.

## Bukti verifikasi

Log berada di `/Users/nadindyta/.hermes/profiles/ram/cache/scratch/state-machine-additional/`.

- API/database: Playwright `leader-access-atomic-real-backend` **7 lulus** pada run awal GREEN (`access-green.log`). Migration dipastikan tercatat dan fixture request kosong sebelum database disposable dihentikan. Assertion self-approval kemudian diperketat; rerun versi akhir juga **7 lulus**, exit 0 (`access-final.log`). Migration tetap tercatat dan fixture request kembali kosong setelah run terakhir.
- Browser fokus: `lifecycle-ui-recovery.spec.ts` **6 lulus**, exit 0 (`ui-final.log`). Payload login tertunda kemudian diperjelas menjadi sesi valid dari fixture. Rerun pasca-review **4 lulus**, exit 0 (`ui-review-final.log`): dua kasus autentikasi dan dua regresi tambah/layout Kegiatan. Kedua kasus autentikasi adalah pengulangan/penguatan cakupan, bukan dua tes unik tambahan.
- Typecheck awal dan ulang setelah seluruh perubahan review: **exit 0**. Command final `NODE_OPTIONS=--max-old-space-size=1024 pnpm typecheck --concurrency=1` (`typecheck-final.log`), termasuk pemeriksaan tipe E2E web.
- Lint awal dan ulang setelah perubahan akhir: **exit 0**, dengan warning. Command final `NODE_OPTIONS=--max-old-space-size=768 pnpm lint --concurrency=1` (`lint-final.log`). Warning lama tidak diperbaiki di luar scope.
- `NODE_OPTIONS=--max-old-space-size=1024 pnpm build --concurrency=1`: **exit 0** (`build.log`). Tidak ada perubahan kode produk setelah build ini; perubahan sesudahnya terbatas pada penguatan fixture/assertion tes dan dokumentasi.
- Regresi browser yang diperluas tidak dinyatakan bersih: run 20 tes sempat menghasilkan 17 lulus/3 gagal; run berikutnya terputus oleh batas waktu foreground host, dan run fokus 8 kasus mengalami timeout pada prerequisite/hidrasi dan tes Kegiatan. Tes yang memakai clock penuh diperbaiki agar hanya mengontrol debounce, bukan membekukan animasi dialog. Assertion perilaku tetap dipertahankan. Hasil rerun akhir dicatat terpisah, bukan menimpa riwayat kegagalan.

### Kegagalan infrastruktur yang sudah dipulihkan

Percobaan awal menyalakan kembali target database gagal karena membuka GUI OrbStack tidak otomatis menyalakan service yang sebelumnya dihentikan (`proc_134df1a5be5e`, exit 1). Setelah service dinyalakan dengan `orbctl start`, target disposable dijalankan lagi dan E2E API final benar-benar lulus 7/7. Migration dibaca kembali dari riwayat dan fixture request berjumlah nol sebelum target dihentikan. Kegagalan startup itu tidak dihitung sebagai tes API yang berjalan, dan tidak disembunyikan oleh hasil wrapper shell.

Run fokus browser 8 kasus yang lebih awal juga **gagal** (4 lulus/4 gagal karena timeout); exit wrapper shell-nya 0 tetapi perintah Playwright exit 1. Status yang dipakai untuk penerimaan adalah run terarah sesudahnya, bukan exit wrapper tersebut. Suite browser menyeluruh tetap tidak diklaim bersih.

### Gate akhir tambahan

- `graphify update .`: **exit 0** (`graph-final.log`).
- `git diff --check`: **exit 0** pada pemeriksaan akhir.
- Baseline hash dirty tree: tidak ada perubahan tak terduga pada pekerjaan lokal lama. Edit pada file bersama terbatas pada tambahan project E2E, indeks rollback, rencana milik tugas ini, dan tautan hasil pada laporan awal.
- API final 7/7, browser fokus 6/6, dan rerun pasca-review 4/4 adalah run berbeda dengan cakupan yang sebagian tumpang tindih. Jangan menjumlahkannya sebagai tes unik atau mengartikannya sebagai seluruh suite aplikasi lulus.

## Review

Review read-only independen menemukan celah bukti tes, bukan cacat produk baru yang terkonfirmasi. Kasus signup setelah close sudah ditambahkan ketika review selesai; payload login kini menyertakan sesi valid secara eksplisit, dan self-approval membaca kembali request yang tepat. Rerun API dan browser setelah penguatan bukti sudah lulus; typecheck, lint, build, dan pembaruan indeks juga lulus. Detail serta batas cakupannya tercatat pada bagian bukti di atas.

## Batas rilis

Tidak ada commit, push, deploy, atau mutasi database remote pada pekerjaan ini. Migration `20261108000000` wajib tersedia **sebelum API baru dirilis**; tanpa RPC ini, perubahan akses akan gagal dengan pesan aman. Rollback mengembalikan API lebih dulu, kemudian menghapus RPC. Penerapan migration/deploy produksi memerlukan izin Fajar.
