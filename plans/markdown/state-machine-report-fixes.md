# Perbaikan risiko lifecycle dari laporan

## Requirement

Perbaiki risiko yang dapat dibuktikan dari laporan tanpa merombak lifecycle lain yang sudah memiliki guard. Pertahankan pekerjaan tak terkait. Target uji hanya loopback terisolasi; tidak ada perubahan database jarak jauh.

## Design

- Lane D: publikasi SIDAK harus atomik dan terserialisasi untuk pasangan layanan/periode; draft diperiksa kembali dan validasi SLIK tetap berlaku. Fungsi database hanya dapat dipanggil backend. Kegagalan tidak boleh menonaktifkan versi lama.
- Impor Profiler harus melaporkan jumlah yang dikembalikan server dan tidak mengulang penulisan yang hasil commit-nya tidak diketahui. Kolom file yang didukung harus diteruskan dan tersimpan, bukan dibuang validator API bulk.
- Permintaan akses leader harus mengabaikan respons lama serta menjaga state loading ketika permintaan saling tumpang tindih; kegagalan callback login harus memiliki hasil yang dapat ditindaklanjuti.
- Pemulihan PDKT: bedakan pekerjaan `pending`/`processing` yang melewati batas klaim lima menit dan tawarkan retry eksplisit melalui jalur klaim yang sudah ada. Jangan memulai panggilan AI secara otomatis, jangan menyatakan pekerjaan gagal hanya berdasarkan waktu, dan pertahankan fencing serta atribusi pemilik. Ini pemulihan yang diminta pengguna, bukan antrean durable tanpa browser.
- Lifecycle Telefun, KETIK, PDKT, dan lainnya dinilai berdasarkan bukti; jangan mengubah status berbeda menjadi satu atau menganggap risiko statis sebagai bug yang sudah terbukti.

## Tasklist

- [x] Buat dan jalankan Playwright RED untuk rollback dan publikasi bersamaan SIDAK; uji batas izin fungsi pada implementasi baru.
- [x] Terapkan transaksi database dan layanan, lalu uji GREEN pada target lokal.
- [x] Buat E2E RED/GREEN untuk hasil parsial, kehilangan respons, penyimpanan kolom impor, dan urutan respons akses yang terbalik.
- [x] Reproduksi reject `getSession()` dengan injeksi kegagalan di batas SDK, lalu tampilkan pemulihan tanpa mengekspos error internal.
- [ ] Telaah risiko sisa dalam laporan; catat yang belum dibuktikan atau membutuhkan perubahan arsitektur tersendiri.
- [x] Jalankan pemeriksaan lane yang aman dan laporkan hasil serta batasannya.
- [x] Tulis dan jalankan E2E RED/GREEN untuk telaah PDKT yang stale, retry eksplisit, pekerjaan yang masih baru, dan retry bersamaan; uji pula klaim lama yang selesai setelah retry.

## Hasil dan sisa pekerjaan

- SIDAK: RED membuktikan versi lama menjadi superseded setelah publish gagal dan dua draft dapat sama-sama published. GREEN: enam tes API/Postgres lokal mencakup rollback, publikasi bersamaan, draft yang sama, penolakan RPC oleh anon/authenticated, bobot SLIK, dan perubahan periode. Tes D5.1 katalog juga lulus. Kunci serialisasi hanya mengoordinasikan jalur publish baru; penulis lain ke tabel dan lifecycle edit/supersede lama tidak otomatis tercakup.
- File migration yang ada saat pemeriksaan lanjutan adalah `20261107181115_sidak_atomic_rule_publish.sql`, setelah `20261107120000_tna_phase5_catalog.sql` dalam urutan nama file repositori. Catatan sebelumnya yang menyebut `20261107090613` sudah tidak sesuai dengan file saat ini. Fungsi pernah diterapkan langsung di database lokal untuk tes tanpa menambah riwayat migration; riwayat database tujuan masih perlu diperiksa sebelum rilis. Jangan jalankan perubahan database jarak jauh tanpa izin Fajar.
- Profiler: dua tes API/Postgres lokal membuktikan penyimpanan kolom dan hasil bulk parsial; tes browser hermetic membuktikan jumlah yang dikonfirmasi dan bahwa kegagalan transport tidak memicu penulisan ulang. Tes browser tidak membuktikan response hilang setelah commit database nyata.
- Akses: tes browser membuktikan respons lama tidak menimpa pencabutan akses dan tidak mengakhiri loading request terbaru. Callback login: tes browser menyuntik reject pada batas SDK dan memverifikasi pesan aman; bukan bukti frekuensi kejadian pada provider nyata.
- PDKT: pada kode yang diperiksa, reply baru memulai evaluasi sebagai pekerjaan async di proses API; retry manual dapat mengklaim pekerjaan stale setelah lima menit, tetapi polling `processing` yang ditinjau tidak otomatis mengubahnya menjadi gagal atau memicu retry. Belum diuji dengan proses dimatikan dan belum dibuat worker durable. Telefun, KETIK, serta kandidat lain dari laporan belum diregresikan atau diubah; status bernama dan guard yang ada bukan bukti bahwa seluruh race tertangani.
- `pnpm typecheck --concurrency=1` dan `pnpm build --concurrency=1` lulus. ESLint file yang diubah lulus. `pnpm lint --concurrency=1` dihentikan saat resource monitor melaporkan swap kosong 677 MB, di bawah ambang 768 MB; jangan anggap lint root lulus. `graphify update .` belum dijalankan karena kondisi sumber daya yang sama.
- `purge` macOS mengembalikan `Operation not permitted`; tidak di-bypass. Sesuai persetujuan Fajar, OrbStack dan Hermes gateway dihentikan sementara. Perintah stop Hermes melaporkan SIGKILL setelah shutdown biasa gagal; status dan ketiadaan proses gateway diverifikasi.

### Kelanjutan PDKT — belum GREEN

- RED API: `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project pdkt-resilience-real-backend -g 'abandoned evaluations' --workers=1 --reporter=line` exit 1 karena `recovery` belum tersedia. Target adalah Supabase loopback berlabel `trainerssuperappvite`, dengan respons provider fixture.
- RED browser: `pnpm --dir apps/web exec playwright test pdkt-resilience.spec.ts -g 'stalled review offers' --workers=1 --reporter=line` exit 1 karena tombol pemulihan belum muncul. Harness memblokir egress.
- Setelah RED, implementasi lokal disiapkan untuk memaparkan `retry_available` setelah lima menit dan memberi pengguna tombol retry; tidak ada pemulihan otomatis atau worker durable. Implementasi ini **belum diuji GREEN**, belum typecheck, dan belum siap dianggap selesai. Ulangi kedua tes tersebut, lalu uji batas race polling, authorization, serta regresi terkait pada target loopback yang sehat.
- Monitor resource setelah RED browser: swap kosong 617 MB, di bawah 768 MB; OrbStack dihentikan kembali dan kunci heavy dilepas. Jangan mulai E2E atau Supabase sebelum gate kembali lulus.
- Inventaris statis tes Telefun mencakup gagal koneksi, cleanup retry/unmount, dan rekaman gagal; tes KETIK mencakup antrean, expiry, retry, serta lease fencing. Keberadaan tes tidak berarti tes telah dijalankan atau semua urutan tercakup.

### Kelanjutan setelah pemeriksaan resource

- GREEN browser PDKT: `pnpm --dir apps/web exec playwright test pdkt-resilience.spec.ts -g 'stalled review offers' --workers=1 --reporter=line` exit 0, 1 tes. Ini membuktikan pemulihan ditawarkan dan retry tidak dikirim tanpa klik, dengan respons API tiruan.
- Regresi browser hermetic: 9 tes terpilih lulus pada `pdkt-resilience.spec.ts`, `telefun-call.spec.ts`, dan `ketik-server-chat.spec.ts` (retry, antrean, expiry, gagal koneksi, klik ganda, dan dua jalur telaah). Ini tidak membuktikan seluruh urutan atau provider nyata.
- GREEN API PDKT dicoba lagi, tetapi exit 1 di setup `PGRST205`: tabel `public.profiles` tidak ditemukan. Pemeriksaan langsung PostgreSQL pada container berlabel `trainerssuperappvite` menemukan nol tabel di `public` dan tidak menemukan `supabase_migrations.schema_migrations`. Penyebab perubahan isi volume tidak diketahui. Tidak ada reset atau migrasi untuk mengatasinya. Fixture auth yang dibuat oleh percobaan gagal telah dihapus berdasarkan ID dan diverifikasi; empat container yang dinyalakan untuk tes dihentikan kembali.
- `pnpm typecheck --concurrency=1` awalnya gagal karena helper tes SIDAK mengembalikan `bodyText`, sementara test memperlakukannya sebagai `Response`. Parser test diperbaiki untuk kontrak helper; typecheck ulang exit 0. Versi tes SIDAK setelah koreksi ini belum dapat dijalankan ulang karena database lokal kosong, sehingga hasil SIDAK sebelumnya bukan bukti untuk versi tes saat ini.
- `pnpm lint --concurrency=1` exit 0 dengan peringatan; `pnpm build --concurrency=1` exit 0; `graphify update .` exit 0. Pemeriksaan end-to-end API, fencing/retry PDKT, dan replay migration tetap terbuka sampai target database lokal yang tepat pulih.
- Fajar menyetujui target tes lokal terpisah. Proyek sementara `remstate4ba792bb` di `/tmp/rem-state-machine-tb6a9zz4` memakai port API 55421 dan DB 55422, volume sendiri, dan salinan migration; 117 migration termasuk SIDAK diverifikasi di tabel riwayat. Setelah container sehat, tes API PDKT `abandoned evaluations` dan `fresh failed evaluation` masing-masing lulus; tes SIDAK tujuh kasus lulus. Provider tetap fixture, dan tes tidak mematikan proses API sungguhan untuk membuktikan pemulihan setelah crash. Container proyek ini dihentikan lagi setelah tes. Jangan mengubah database lokal lama atau database remote. Jangan mencetak `start.log`/file env karena mengandung kredensial lokal.
- Tes SIDAK versi saat ini awalnya RED: error database bocor ke respons HTTP. Service dan route kini memetakan hanya exception validasi/konflik yang dikenal, dan kesalahan lain menghasilkan pesan umum. Tujuh kasus SIDAK kemudian GREEN. Typecheck, lint root, dan build root lulus sesudah perbaikan ini. Tes API tambahan untuk klaim lama yang selesai setelah klaim retry juga lulus; tes itu memanipulasi waktu klaim dalam fixture dan menggunakan provider tiruan. Typecheck ulang dan lint spesifik tes lulus setelah tes ditambahkan. Seluruh kemungkinan race polling dan crash proses nyata belum dibuktikan.
- `graphify update .` terakhir exit 0 setelah tes tambahan; graph dan laporan diperbarui, visualisasi HTML tidak dibuat karena graph melampaui batas 5.000 node. `git diff --check` exit 0. OrbStack dan Hermes dihentikan lagi atas izin Fajar; perintah stop Hermes melaporkan bahwa proses perlu SIGKILL setelah tidak keluar secara normal.
