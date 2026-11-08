# Peta state machine implisit — Trainers SuperApp

> **Status terbaru — 8 November 2026: seluruh 32 butir telah memperoleh disposition lokal.** Lihat [hasil lanjutan dan batas bukti](hasil-lanjutan-state-machine-2026-11-08.md) serta [register](state-machine-closure-register-2026-11-08.json). Integrasi remote menunggu izin dua migration. Snapshot dan uraian risiko di bawah tetap historis; bukan daftar bug yang masih terbukti terbuka.

**Untuk:** Fajar

**Snapshot kode:** `6a6d9ba0b8d6130c4951a2fd5948c297b38d2ed4`

**Tanggal pemeriksaan:** 7 November 2026

**Jenis pekerjaan:** audit statis; tidak ada perubahan kode aplikasi.
**Tambahan:** pemeriksaan lanjutan 8 November 2026 terdapat di bagian 9; pemeriksaan sesudah perbaikan tambahan ada di bagian 10. Bagian awal merekam snapshot pertama; sejumlah area telah berubah di working tree sejak itu dan tidak boleh dianggap masih bermasalah tanpa validasi ulang.

## Status historis sebelum resume — telah digantikan hasil lanjutan

**Belum seluruh laporan ditutup.** Pernyataan "perbaikan selesai" merujuk paket perbaikan tambahan, bukan seluruh inventaris lifecycle aplikasi. Status di bawah membedakan perbaikan konkret, batas verifikasi, dan peta risiko yang masih memerlukan pemeriksaan.

- **Ditutup secara lokal untuk skenario yang diuji:** transisi backend akses leader, respons usang AuthModal, ketahanan draf balasan PDKT, dan form Kegiatan saat menyimpan. Bukti ada di [hasil perbaikan tambahan](hasil-perbaikan-state-machine-tambahan.md): API 7/7, browser fokus 6/6, dan rerun 4/4 dengan cakupan yang sebagian tumpang tindih. Ini bukan klaim seluruh suite lulus.
- **Temuan awal sudah ditangani dalam kode lokal:** publikasi SIDAK memakai RPC, impor Profiler tidak lagi otomatis mengulang write yang hasilnya tidak diketahui, hook akses mempunyai generation guard, dan callback OAuth menangani reject pembacaan sesi. Keberadaan perbaikan itu dibaca ulang. [Catatan pekerjaan awal](../plans/markdown/state-machine-report-fixes.md) mencatat pengujian beserta batasnya; pengujian lama tersebut tidak dijalankan ulang dalam rekonsiliasi status ini. Jangan membaca uraian snapshot awal sebagai bukti keempat masalah itu masih belum ditangani.
- **Selesai sebagian atau bukan bug yang terbukti:** pemulihan evaluasi PDKT sudah mempunyai retry manual untuk pekerjaan stale, tetapi belum menjadi worker durable dan belum dibuktikan lewat crash proses nyata. Pengaturan Telefun sudah dirapikan dan retry teruji; dugaan reset akibat props refresh belum direproduksi, bukan bug yang diklaim sudah diperbaiki. Harga efektif berdasarkan waktu adalah perilaku desain, bukan bug yang perlu ditutup dengan reducer.
- **Belum ditutup sebagai audit/refactor menyeluruh:** lifecycle besar panggilan/rekaman/scoring Telefun, antrean chat/review KETIK, dan sisa kandidat lintas modul pada laporan awal. Sebagian sudah mempunyai guard; status ini berarti cakupan belum selesai, bukan semua alur itu terbukti rusak. Empat kandidat pada bagian 10 juga masih terbuka untuk validasi E2E.
- **Belum ditutup di produksi:** tidak ada commit, push, deploy, atau penerapan migration remote dari paket perbaikan ini. Kode yang sudah benar di working tree belum berarti aplikasi live sudah memakainya.

Rekonsiliasi ini hanya membaca sumber dan memperjelas laporan. Tidak ada pengujian baru atau perubahan kode aplikasi yang dilakukan.

## Ringkasan untuk Fajar

Bayangkan aplikasi sebagai petugas yang menangani beberapa pekerjaan sekaligus: memulai panggilan, menyimpan rekaman, lalu menunggu penilaian. Setiap pekerjaan punya tahapan. Masalah muncul ketika tahapan itu tidak ditulis sebagai satu alur yang mudah diikuti, tetapi harus disimpulkan dari gabungan tombol, boolean, status server, waktu, dan callback di beberapa file. Itulah yang dimaksud _state machine implisit_ dalam laporan ini.

**Ram menemukan beberapa alur seperti itu**, terutama panggilan Telefun, chat KETIK, tahapan email PDKT, impor Profiler, dan beberapa alur pemuatan/akses bersama. Ada pula lifecycle backend yang sudah memiliki status bernama dan pengaman database, tetapi perpindahannya tetap tersebar di beberapa tempat. Keduanya berbeda: yang kedua **bukan otomatis buruk** dan tidak pantas disebut sama berisikonya dengan sekumpulan flag tanpa koordinasi.

**Yang paling layak diperhatikan lebih dulu:**

1. **Publikasi aturan SIDAK:** menonaktifkan versi lama dan menerbitkan versi baru dilakukan dalam dua operasi terpisah. Jika operasi kedua gagal setelah yang pertama berhasil, ada potensi kondisi antara yang tidak diinginkan. Ini temuan struktur kode; kejadian nyata dan perlindungan database tambahan masih perlu diuji.
2. **Panggilan dan rekaman Telefun:** ada banyak state, callback, ref, proses cleanup, serta rekonsiliasi. Ini alur paling sensitif terhadap urutan kejadian dan kegagalan jaringan. Di sisi lain, sudah ada pengaman idempotensi dan retry; jangan menyimpulkan bahwa panggilan sekarang pasti rusak.
3. **PDKT dan KETIK:** keduanya memiliki alur antarmuka dan evaluasi yang berjalan lintas frontend–backend. KETIK memakai antrean review durable di database; evaluasi PDKT yang ditinjau tidak menunjukkan antrean durable yang setara. Periksa pemulihannya sebelum menyamakan kedua alur.
4. **Akses dan impor:** permintaan status akses dapat tumpang tindih, sedangkan impor Profiler mengulang baris satu per satu setelah bulk gagal. Risiko spesifiknya dijelaskan di bawah; belum direproduksi.

**Jangan langsung merombak semuanya.** Aturan repo menyebut pola lama dilaporkan dan tidak dirombak kecuali pekerjaan memang menyentuh lifecycle tersebut (`AGENTS.md:18`). Untuk perubahan berikutnya, dahulukan tes E2E, petakan state yang benar-benar relevan, lalu pindahkan transisinya ke satu tempat secara bertahap.

## Cara membaca laporan ini

- **Implisit:** keadaan suatu proses harus disimpulkan dari beberapa flag, variabel, panel, callback, atau tempat penulisan yang terpisah.
- **Status bernama, transisi tersebar:** nama statusnya ada, tetapi validasi/perpindahannya tersebar lintas UI, API, worker, atau database. Ini dicatat sebagai konteks untuk audit aturan repo, bukan langsung divonis gagal.
- **Lebih eksplisit:** ada daftar status dan mekanisme/guard yang jelas. Dimasukkan sebagai pembanding supaya tidak semua lifecycle dianggap masalah.
- **Risiko** adalah kemungkinan berdasarkan struktur dan alur kode. Ini **bukan klaim bug produksi** kecuali secara khusus dinyatakan telah direproduksi.
- Referensi `path:baris` relatif terhadap root repo pada snapshot di atas. Baris dapat bergeser setelah kode berubah.

## 1. Telefun — panggilan, rekaman, dan penilaian

### 1.1 Memulai, menjalani, dan mengakhiri panggilan

**Klasifikasi:** implisit, tersebar antara halaman, komponen panggilan, transport, dan server. **Prioritas pemeriksaan: tinggi.**

**Alur yang terlihat:** pengguna mulai → sesi server dibuat → telepon berdering/menghubungkan → panggilan berlangsung → pengguna mengakhiri atau terjadi kegagalan → cleanup; pada kondisi tertentu cleanup dapat dicoba lagi. Pembuatan sesi dan aktivasi UI ada di `apps/web/src/routes/telefun/index.tsx:270-396`.

Di `apps/web/src/routes/telefun/components/PhoneInterface.tsx:96-128`, keadaan tidak diwakili satu status: ada `connectionState`, `isRinging`, `isDisconnecting`, `cleanupRetryable`, `terminalFailure`, serta ref untuk end-call dan retry. Callback koneksi dan cleanup juga mengubah keadaan pada `PhoneInterface.tsx:280-339` dan `PhoneInterface.tsx:543-606`.

**Yang sudah membantu:** start dilindungi dari pemanggilan bersamaan, dan ada ref untuk menghindari pengakhiran ganda. Kegagalan cleanup tidak selalu langsung dianggap kegagalan rekaman.

**Yang perlu dijaga:** perubahan urutan callback, putus jaringan, retry, atau unmount bisa membuat beberapa flag berbeda menggambarkan fase yang tidak selaras. Itu risiko kombinasi state, bukan bukti bahwa kombinasi salah pasti terjadi. Saat lifecycle disentuh, uji E2E minimal: start ganda, gagal koneksi, akhir ganda, cleanup gagal lalu retry, serta hasil rekaman terlambat setelah retry.

### 1.2 Hasil rekaman dan antrean rekonsiliasi

**Klasifikasi:** status bernama, tetapi alur tersebar antara browser, API, dan penyimpanan. **Prioritas: tinggi.**

Setelah rekaman siap, UI mengunggah, memperbarui riwayat, dan meminta penilaian; bila ada kendala tertentu, rekonsiliasi dipakai untuk menyelesaikan pekerjaan yang tertunda (`apps/web/src/routes/telefun/index.tsx:450-555`). Antrean browser membedakan `recording_transition_pending` dan `remux_pending` (`apps/web/src/routes/telefun/services/telefun-recording-reconciliation-queue.ts:15-24`). Proses finalize, retry, remux, dan penghapusan entri berada di `apps/web/src/routes/telefun/services/telefun-recording-reconciliation.ts:385-465` dan `apps/web/src/routes/telefun/services/telefun-recording-reconciliation.ts:524-560`.

**Risiko yang perlu dipahami:** antrean berada di browser. Pemulihan tidak sama dengan jaminan antrean server: browser perlu kembali berjalan dengan konteks pengguna yang sesuai, dan storage bisa saja hilang. Ini keterbatasan arsitektur yang perlu dipertimbangkan, bukan bukti rekaman sudah hilang.

### 1.3 Status scoring dan worker

**Klasifikasi:** sebagian sudah eksplisit; integrasi lintas proses tetap kompleks.

UI memiliki daftar `idle`, `waiting_for_scoring`, `processing`, `completed`, `failed_retryable`, `failed_final`, dan `timed_out` di `apps/web/src/routes/telefun/sessionReconciler.ts:32-43`. Polling menggunakan token/abort agar respons lama tidak menghidupkan kembali sesi yang sudah berganti atau dihapus (`sessionReconciler.ts:24-29`).

Di server, scoring menggunakan klaim, kemudian complete atau fail; rerun memiliki jalur tersendiri (`apps/api/src/routes/telefun/recording-scoring.ts:237-270`, `apps/api/src/routes/telefun/recording-scoring.ts:346-480`, `apps/api/src/routes/telefun/rerun.ts:129-220`). Worker juga memiliki lifecycle klaim dan shutdown (`apps/api/src/workers/telefun-scoring-worker.ts:88-149`).

**Penilaian:** jangan menggabungkan status panggilan, status rekaman, dan status scoring menjadi satu nilai tanpa desain yang jelas: ketiganya proses berbeda. Saat salah satunya diubah, periksa kontrak token klaim dan retry lintas jalur. Audit statis ini tidak membuktikan seluruh race sudah tertangani.

### 1.4 WebRTC broker dan pembersihan

**Klasifikasi:** status bernama dengan transisi di beberapa bagian runtime; bukan sekadar boolean UI.

Binding memiliki nilai seperti `claimed`, `brokered`, `sideband_connected`, `ending`, dan `ended` (`apps/telefun/src/realtime-webrtc/call-manager-types.ts:32`). Finalisasi dan penanganan gagal tersebar di `apps/telefun/src/realtime-webrtc/call-manager.ts:610-729` dan `apps/telefun/src/realtime-webrtc/call-manager.ts:1160-1182`; attempt terlantar juga ditangani oleh `apps/telefun/src/realtime-webrtc/orphan-cleanup.ts:27` dan `apps/telefun/src/realtime-webrtc/orphan-cleanup.ts:107`.

**Yang perlu dijaga:** cleanup dapat harus dicoba ulang ketika hangup atau persistensi gagal. Nama status saja tidak membuktikan semua operasi sudah melalui satu fungsi transisi. Periksa guard dan fencing sebelum mengubahnya.

## 2. KETIK — chat dan telaah

### 2.1 Chat aktif, antrean pesan, dan respons konsumen

**Klasifikasi:** implisit. **Prioritas: tinggi.**

**Alur:** sesi aktif → pesan agen masuk antrean → disimpan → respons konsumen diproses/ditampilkan; sesi dapat kedaluwarsa atau ditutup; kegagalan append dan kegagalan respons mempunyai jalur retry berbeda.

Di `apps/web/src/routes/ketik/hooks/useServerKetikChat.ts:125-196`, antrean, `appendBusy`, `appendBlocked`, `responseBusy`, `responseBlocked`, `appendLoading`, `responseLoading`, `typing`, `expired`, dan `closed` tersebar antara ref dan state React. Pemrosesan antrean berada di `useServerKetikChat.ts:314-355`; pengiriman dan retry di `useServerKetikChat.ts:578-624`.

**Risiko:** perubahan pada timing balasan, penutupan sesi, atau retry harus mempertimbangkan gabungan state itu, bukan hanya satu boolean. UI berpotensi menampilkan keadaan yang sulit dipahami bila urutan kejadian baru tidak ditangani. Belum ada reproduksi bug dari audit ini.

### 2.2 Telaah AI di frontend

**Klasifikasi:** status utama bernama, dengan state polling tambahan. **Prioritas: menengah.**

`apps/web/src/routes/ketik/hooks/useKetikReviewStatus.ts:11-31` mendefinisikan tahapan seperti `idle`, `reviewing`, `loading-result`, `ready`, dan `failed`, tetapi juga menyimpan kondisi antrean dan kegagalan polling secara terpisah. Status server dipetakan dan hasil dimuat di `useKetikReviewStatus.ts:111-145`; polling berjalan di `useKetikReviewStatus.ts:169-189`.

**Yang sudah baik:** gangguan polling dibedakan dari kegagalan pekerjaan server. **Yang perlu dijaga:** hasil lama yang masih valid saat rerun gagal merupakan cabang khusus; jangan menghapus hasil itu hanya karena permintaan terbaru gagal.

### 2.3 Sesi server dan antrean review KETIK

**Klasifikasi:** status bernama dan dijaga DB; perlu dibaca lintas beberapa tempat, bukan contoh sederhana boolean tersembunyi.

Sesi server memiliki lifecycle `active → ended` atau `active → discarded`; turn mempunyai status processing, completed, atau failed. Constraint awal dan idempotensi request ada di `supabase/migrations/20261015140000_ketik_server_sessions.sql:4-17`; service membungkus operasi terkait di `apps/api/src/services/ketik/server-sessions.ts:348-452`.

Review durable menggunakan antrean `queued → processing → completed`, atau kembali antre/gagal sesuai hasil dan batas retry. Klaim menggunakan lock/lease dan settlement memeriksa token di `supabase/migrations/20261016000935_ketik_durable_review_worker.sql:60-117`; pembungkusnya ada di `apps/api/src/services/ketik/review-lifecycle.ts:33-92` dan worker di `apps/api/src/workers/ketik-review-worker-runtime.ts:49-115`.

**Yang sudah membantu:** lease dan token merupakan pengaman nyata terhadap pekerjaan lama yang mencoba menyelesaikan klaim baru. **Batas audit:** migrasi awal saja tidak membuktikan bahwa tidak ada migrasi berikutnya yang mengganti fungsi; periksa definisi database terakhir sebelum mengambil keputusan implementasi.

### 2.4 Riwayat dan replay

**Klasifikasi:** status pemuatan/replay tersebar, dengan perlindungan request lama. **Prioritas: rendah–menengah.**

Riwayat KETIK memuat daftar, membuka replay, menangani error, dan mengonfirmasi hapus. Nomor request dipakai agar hasil replay lama tidak menimpa pilihan baru (`apps/web/src/routes/ketik/history.tsx:73-143`). Ini contoh pengaman yang perlu dipertahankan, bukan alasan otomatis untuk refactor.

## 3. PDKT — kotak masuk, balasan, dan evaluasi

### 3.1 Tahap pahami → tanggapi → telaah

**Klasifikasi:** implisit. **Prioritas: tinggi.**

Status email dan panel bersama-sama menentukan layar: `replied` ditambah review terbuka menjadi **telaah**; `open` ditambah reply terbuka menjadi **tanggapi**; selain itu **pahami**. Logika langsung terlihat di `apps/web/src/routes/pdkt/simulation.tsx:569-576`. Pemilihan email, detail yang dimuat belakangan, filter, serta auto-select ikut memengaruhi konteks (`simulation.tsx:201-227`, `simulation.tsx:262-287`).

**Risiko:** saat status server, URL/panel, pilihan email, dan detail belum sinkron, tampilan ditentukan oleh kombinasi keadaan itu. Tampilan default pada masa transisi bisa memang disengaja; perlu E2E untuk membedakan desain dari cacat.

### 3.2 Pembuatan email, draft, dan replay

**Klasifikasi:** lifecycle gabungan. **Prioritas: menengah.**

Pembuatan melalui pemeriksaan pengaturan dan identitas, membuat sesi dengan request ID, memuat ulang daftar, lalu memilih email (`apps/web/src/routes/pdkt/simulation.tsx:398-463`). Jalur simpan ulang draft juga mengatur pilihan dan filter (`simulation.tsx:374-395`). Replay history dapat membuat item frontend sintetis berstatus `replied`, dengan kemampuan hapus dinonaktifkan (`apps/web/src/routes/pdkt/utils/replaySession.ts:11-66`; pemilihan `simulation.tsx:338-358`).

**Yang perlu dijaga:** item replay sintetis bukan item mailbox server biasa. Perubahan navigasi atau hapus harus tetap membedakan keduanya.

### 3.3 Evaluasi AI per email

**Klasifikasi:** status bernama, orkestrasi tersebar antara UI dan backend. **Prioritas: tinggi.**

Di UI, evaluasi terbaca sebagai `pending`, `processing`, `completed`, `failed`, atau unavailable; polling dan retry berada di `apps/web/src/routes/pdkt/utils/usePdktEvaluations.ts:61-115` dan `usePdktEvaluations.ts:123-280`. UI memakai masa tenggang untuk menghindari pembacaan status gagal lama sesaat setelah retry.

Di backend, `apps/api/src/services/pdkt/evaluation-service.ts:801-853` mengklaim pekerjaan berdasarkan status dan waktu; klaim yang dianggap stale menggunakan ambang lima menit. Penyimpanan selesai/gagal diperiksa terhadap `evaluation_started_at` klaim yang sama (`evaluation-service.ts:889-926`).

**Yang perlu diperiksa:** berbeda dari antrean review KETIK yang ditinjau, audit ini belum menemukan queue worker durable PDKT yang setara. Jika proses hilang setelah klaim, pastikan ada jalur pemrosesan ulang yang benar-benar berjalan. **Belum dapat dipastikan** apakah ada mekanisme pemulihan lain di luar jalur yang diperiksa; jangan simpulkan bahwa semua evaluasi pasti macet.

### 3.4 Mailbox dan penghapusan

**Klasifikasi:** status bernama dengan guard database dan alur UI terpisah.

Mailbox mengenal `open`, `replied`, dan `deleted` pada schema awal (`supabase/migrations/002_ketik_pdkt_core.sql:122-140`). Reply serta pembuatan history dibungkus RPC; route hanya memicu evaluasi ketika hasil menyatakan reply baru dibuat (`apps/api/src/routes/pdkt/mailbox.ts:229-256`). UI memiliki konfirmasi dan jalur hapus tunggal/bulk (`apps/web/src/routes/pdkt/utils/usePdktMailboxDelete.ts:29-122`).

**Yang sudah membantu:** pemisahan antara reply baru dan replay/idempotensi. Saat mengubah proses hapus, uji pula hasil bulk parsial, bukan hanya sukses semua.

## 4. SIDAK — aturan, input, impor, dan filter

### 4.1 Publikasi versi aturan QA

**Klasifikasi:** status bernama, perpindahan tersebar dalam beberapa write. **Prioritas: tinggi untuk validasi.**

**Alur:** draft dibuat/diedit → diterbitkan → versi published lama dapat menjadi superseded. Pemeriksaan draft dan validasi ada di `apps/api/src/services/sidak/rule-versions.ts:293-342`. Fungsi kemudian menonaktifkan versi lama di `rule-versions.ts:363-389`, lalu memperbarui versi baru menjadi published di `rule-versions.ts:391-409`.

**Fakta yang terlihat:** dua update tersebut adalah operasi terpisah di kode service, dan update publish yang terlihat memfilter `id`, bukan `status = draft`.

**Risiko, belum direproduksi:** jika write kedua gagal setelah write pertama berhasil, versi lama mungkin sudah superseded sementara versi baru belum terbit. Dua publikasi bersamaan juga perlu diuji. Sebelum menyimpulkan dampak final, periksa semua constraint, trigger, RPC, dan migrasi database terkini. Jangan jalankan eksperimen pada database produksi.

**Usulan saat pekerjaan ini memang disentuh:** buat E2E pada target lokal/test-only untuk gagal di antara kedua tahap dan untuk dua publikasi bersamaan. Pertimbangkan transaksi/RPC dan guard status setelah perilaku yang diinginkan dikonfirmasi.

### 4.2 Form temuan dan impor SIDAK

**Klasifikasi:** tahapan async UI tersebar. **Prioritas: menengah.**

Form bergantung pada konteks agen/periode/layanan, lalu memvalidasi, melakukan preview, mungkin meminta konfirmasi duplikat, dan menyimpan (`apps/web/src/routes/sidak/hooks/useTemuanForm.ts:88-212`). Impor melalui pembacaan file, validasi/preview, konfirmasi duplikat, dan batch save (`apps/web/src/routes/sidak/hooks/useTemuanImport.ts:190-208`, `useTemuanImport.ts:331-424`).

**Risiko yang perlu diuji:** klik berulang selama tahap preview atau perubahan filter ketika request lama belum selesai. Sebagian jalur memakai pemeriksaan sequence/current (`apps/web/src/routes/sidak/input.tsx:117-145`, `input.tsx:362-429`); periksa jalur aktual sebelum menyimpulkan ada race.

### 4.3 Scope filter dan pemuatan dashboard

**Klasifikasi:** keadaan turunan dan pemuatan gabungan, bukan selalu satu lifecycle bisnis. **Prioritas: rendah–menengah.**

Scope menggabungkan URL, session storage, default, dan reset (`apps/web/src/hooks/useSidakScope.ts:41-96`, `useSidakScope.ts:127-199`). Dashboard menunggu data dan kesiapan tim (`apps/web/src/routes/sidak/dashboard.tsx:132-145`); forecast juga menormalisasi filter serta memuat ulang hasil (`apps/web/src/routes/sidak/forecast.tsx:100-178`, `forecast.tsx:305-345`).

**Catatan:** ini disebut agar batas pengaruh state terlihat, bukan berarti setiap filter atau boolean perlu menjadi state machine tersendiri.

## 5. Profiler — impor dan workspace

### 5.1 Impor peserta

**Klasifikasi:** wizard implisit. **Prioritas: tinggi untuk integritas data impor.**

**Alur:** unduh template/pilih file → validasi dan tinjau → simpan per chunk → tampilkan jumlah berhasil/gagal → mulai lagi. `step`, `busy`, daftar baris, error, hasil tersimpan, dan failures disimpan terpisah di `apps/web/src/routes/profiler/components/import/ProfilerImportFlow.tsx:241-249`; pemrosesan file dan perpindahan step di `ProfilerImportFlow.tsx:269-307`.

Jika bulk create gagal, UI mencoba satu per satu (`ProfilerImportFlow.tsx:315-343`). **Risiko potensial:** jika server sudah menyimpan sebagian tetapi respons bulk gagal/hilang, percobaan ulang per baris bisa berhadapan dengan data yang sudah masuk. Ini bergantung pada atomisitas dan idempotensi endpoint—keduanya belum dipastikan oleh audit ini.

**Tes yang berguna:** respons bulk hilang setelah commit, satu baris invalid, duplikasi, dan hasil parsial; cocokkan jumlah yang dilaporkan dengan data yang benar-benar tersimpan pada database lokal/test.

### 5.2 Workspace dan akses

**Klasifikasi:** pemuatan dan pemilihan konteks gabungan. **Prioritas: rendah–menengah.**

Hak baca-saja dan pemuatan tahun/folder/peserta berada di `apps/web/src/hooks/useProfilerAccess.ts:4-11` dan `apps/web/src/routes/profiler/index.tsx:110-172`. Pergantian konteks memakai pembatalan lokal pada sebagian pemuatan. Ini dicatat sebagai konteks: **tidak setiap status loading atau tab adalah masalah.**

## 6. TNA — rencana dan evaluasi

### 6.1 Lifecycle rencana pelatihan

**Klasifikasi:** lifecycle bisnis yang statusnya bernama; transisi dan aturan tersebar antara UI, service, RPC, trigger, dan schema. **Prioritas: menengah karena dampak bisnis tinggi, tetapi sudah memiliki sejumlah guard.**

State rencana: `draft → aktif → evaluasi → selesai`; jalur pembatalan menghasilkan `dibatalkan`. Status awal tercantum di `supabase/migrations/20261008120000_tna_phase1.sql:37-55`; aktivasi memakai revisi yang diharapkan di `apps/api/src/services/tna/write-service.ts:119-172`. Aturan transisi evaluasi dan penyelesaian ada di `supabase/migrations/20261011130000_tna_phase2_evaluation.sql:254-270` dan `supabase/migrations/20261011130000_tna_phase2_evaluation.sql:345-388`.

**Yang sudah membantu:** optimistic revision, validasi server, serta penguncian di database. Practice snapshot dihitung di server dan dibekukan ketika evaluasi diselesaikan (`apps/api/src/services/tna/write-service.ts:236-293`; `supabase/migrations/20261104120000_tna_phase3_practice.sql:111-149`).

**Yang perlu dijaga:** status progres latihan yang dihitung bukan status plan itu sendiri. Jangan menyatukan keduanya hanya karena sama-sama punya label tahapan.

### 6.2 Loading, mutasi, dan konflik revisi

**Klasifikasi:** state async frontend tersebar. **Prioritas: menengah.**

UI membedakan loading/error/data dan proses mutasi; konflik revisi mengunci mutasi sampai reset/reload. Lihat `apps/web/src/routes/tna/shared.tsx:46-69`, `apps/web/src/routes/tna/utils.ts:112-147`, dan `apps/web/src/routes/tna/plan.tsx:42-53`. Saat mengubah form, pertahankan pengalaman yang menjelaskan mengapa data harus dimuat ulang, bukan hanya mengganti `busy`.

## 7. Login, akses, dan request bersama

### 7.1 Bootstrap login dan callback

**Klasifikasi:** lifecycle async implisit. **Prioritas: menengah.**

Saat aplikasi dimulai: cek sesi → simpan/buang sesi → muat profil → tentukan akses (`apps/web/src/store/authInit.ts:7-66`, `apps/web/src/lib/fetchAuthProfile.ts:6-32`). Callback login memeriksa sesi lalu profil dan navigasi (`apps/web/src/routes/auth-callback.tsx:14-50`).

**Risiko spesifik:** `getSession()` dipanggil di luar `try` yang menangani kegagalan pemuatan profil (`auth-callback.tsx:17-43`). Jika promise tersebut benar-benar reject, kode yang terlihat tidak menetapkan pesan error, sehingga layar pemrosesan berpotensi bertahan. Belum direproduksi; periksa dulu perilaku library pada kegagalan yang realistis.

### 7.2 Permintaan dan persetujuan akses leader

**Klasifikasi:** status server bernama, loading/error dan refresh tersebar. **Prioritas: menengah.**

`apps/web/src/hooks/useAccessStatus.ts:6-48` mengambil status saat mount, focus, dan perubahan visibility. Kode yang terlihat tidak memakai generation guard untuk membedakan respons lama dan baru. `submitRequest()` menulis permintaan `pending`, lalu mengambil ulang status (`useAccessStatus.ts:50-79`).

**Risiko:** dua fetch yang tumpang tindih mungkin selesai tidak berurutan; hasil lama dapat menimpa hasil baru atau `loading` berhenti sementara fetch lain masih berjalan. Ini analisis urutan kode, bukan masalah akses yang sudah direproduksi.

Halaman menunggu persetujuan juga melakukan pemeriksaan berkala (`apps/web/src/routes/waiting-approval.tsx:25-84`). Perhatikan perilaku jaringan gagal dan saat halaman disembunyikan/ditampilkan kembali.

### 7.3 Hook request bersama

**Klasifikasi:** lifecycle request generik; sudah ada pengaman respons usang. **Prioritas: rendah.**

`apps/web/src/hooks/useApi.ts:5-77` mengelola loading, data, error, dan pembersihan. Generation counter melindungi terhadap respons lama/unmount. Ini contoh bahwa beberapa flag dapat dipakai untuk operasi sederhana dengan penjagaan yang jelas; tidak otomatis perlu dirombak.

## 8. Kandidat lain dan batas antara yang penting dengan sekadar toggle

- **Riwayat simulasi SIDAK:** list/detail/load-more punya loading, error dan abort/generation guard (`apps/web/src/hooks/useSidakAgentSimulations.ts:19-156`). Ini proses pemuatan, bukan status bisnis sesi itu sendiri.
- **Hapus mailbox PDKT:** pilihan tunggal/bulk → konfirmasi → deleting → hasil/refetch (`apps/web/src/routes/pdkt/utils/usePdktMailboxDelete.ts:29-122`). Penting jika mengubah penghapusan, terutama hasil parsial.
- **Monitoring, Dashboard, Kegiatan, shared components, dan modul lain:** masuk inventaris awal, tetapi tidak semuanya ditelusuri mendalam per handler. Ketiadaan butir khusus **tidak membuktikan** tidak ada lifecycle tersembunyi di sana.
- **Mute, buka dialog, tab aktif, dan filter sederhana:** tidak otomatis dihitung sebagai lifecycle. Baru menjadi bagian penting bila kombinasinya menentukan tahapan atau izin transisi proses lain.

## Status perbaikan lokal dari temuan tambahan

Implementasi dan bukti pengujian temuan tambahan dicatat terpisah di [Hasil perbaikan lifecycle tambahan](hasil-perbaikan-state-machine-tambahan.md). Bagian 9 di bawah adalah hasil penemuan sebelum perbaikan; jangan membacanya sebagai daftar masalah yang semuanya masih belum ditangani. Pekerjaan ini tidak menghapus seluruh pola legacy dan tidak menerapkan migration ke produksi.

## 9. Pemeriksaan tambahan — 8 November 2026

**Jawaban singkat: masih ada alur yang belum dipetakan tersendiri pada lintasan pertama.** Bagian ini menambah lima subalur implisit/tersebar dan satu lifecycle berbasis waktu. Jumlah ini bukan jumlah total state machine seluruh aplikasi dan bukan jumlah bug.

### Penting: kode lokal telah berubah

Saat pemeriksaan tambahan, `HEAD` masih `6a6d9ba0b8d6130c4951a2fd5948c297b38d2ed4`, tetapi working tree berisi perubahan pada beberapa area yang dibahas di laporan awal. Bagian 1–8 tetap merupakan **snapshot pemeriksaan pertama**, bukan vonis untuk kode lokal terbaru.

Dua perubahan dibaca langsung sebagai contoh:

- `apps/web/src/hooks/useAccessStatus.ts:6-75` sekarang memiliki union `AccessState`, `useReducer`, serta pemeriksaan generation. Risiko respons lama yang dijelaskan pada bagian 7.2 tidak boleh diperlakukan sebagai temuan belum diperbaiki pada kode ini.
- `apps/api/src/services/sidak/rule-versions.ts:303-335` sekarang memanggil RPC `publish_sidak_rule_version`, bukan dua write service seperti snapshot awal. Ini bukti perubahan implementasi, **bukan bukti bahwa migration telah diterapkan pada production** atau seluruh race sudah selesai.

Perubahan pada Profiler, callback login, dan PDKT juga terlihat di Git. Laporan pekerjaan lain `plans/markdown/state-machine-report-fixes.md` menyebut perbaikan dan pengujian; klaim pengujian tersebut tidak dijalankan ulang atau disertifikasi di lintasan tambahan ini. Tidak ada kode sumber atau pekerjaan lokal tersebut yang diubah oleh pemeriksaan ini.

### 9.1 Persetujuan akses leader di backend

**Jenis:** status bernama, tetapi transisi dan langkah kompensasi tersebar. **Prioritas telaah: tinggi.** Ini berbeda dari perbaikan hook pembaca status di frontend.

**Alur bisnis:** permintaan `pending` dapat menjadi `approved` atau `rejected`; akses `approved` dapat menjadi `revoked`. Persetujuan juga perlu menautkan grup akses. UI mengoordinasikan pilihan, edit grup, konfirmasi cabut, dan permintaan async melalui state terpisah (`apps/web/src/routes/dashboard/access-approval.tsx:71-79`, `apps/web/src/routes/dashboard/access-approval.tsx:160-205`).

Di backend, approve membaca request `pending`, memperbaruinya menjadi `approved`, lalu memasukkan relasi grup. Jika insert relasi gagal, status diubah kembali ke `pending` (`apps/api/src/services/admin-service.ts:536-585`). **Update approve yang terlihat memfilter ID saja**, sementara reject dan revoke memfilter status yang diharapkan (`apps/api/src/services/admin-service.ts:589-622`). Penggantian grup juga terdiri atas baca, cek ulang, hapus relasi lama, insert relasi baru, dan percobaan pemulihan ketika gagal (`apps/api/src/services/admin-service.ts:663-720`).

**Mengapa penting:** ini bukan sekadar label UI. Hasil beberapa operasi harus tetap konsisten agar status akses dan grup data tidak berbeda. Ada potensi konflik approve/reject atau kegagalan pemulihan di tengah rangkaian write; kejadian dan dampaknya **belum direproduksi**, dan trigger/constraint aktif belum ditelusuri lengkap. Jangan mengklaim akses bocor berdasarkan kode service ini saja. Periksa transaksi dan guard sebelum merancang perbaikannya.

### 9.2 Pendaftaran dan masuk melalui modal autentikasi

**Jenis:** lifecycle async implisit. **Prioritas: menengah.** Berbeda dari halaman callback OAuth yang sudah tercantum di bagian 7.1.

`AuthModal` menggabungkan mode login/register/forgot dengan `loading`, `forgotLoading`, `googleLoading`, error, dan success message (`apps/web/src/components/AuthModal.tsx:45-81`). Login melewati autentikasi, menunggu sesi siap, membaca profil, memeriksa pending/inactive/deleted/kedaluwarsa, lalu navigasi (`apps/web/src/components/AuthModal.tsx:83-171`). Pendaftaran melalui `signUp`, lalu insert profil `pending` di langkah terpisah (`apps/web/src/components/AuthModal.tsx:175-231`).

**Mengapa masuk peta:** keberhasilan autentikasi belum sama dengan keberhasilan menyiapkan akun aplikasi. Selain itu, menutup modal mereset flag lokal, tetapi tidak terlihat membatalkan request async di fungsi penutupan. Perilaku close → buka kembali ketika respons lama masih datang serta pendaftaran yang berhenti di antara dua langkah perlu diuji. Trigger profil atau perilaku Supabase dapat memengaruhi hasil; audit ini tidak menyatakan akun yatim pasti terjadi.

### 9.3 Draf balasan PDKT: simpan lokal → konfirmasi → kirim → buang draf

**Jenis:** subalur implisit, terpisah dari evaluasi AI. **Prioritas: menengah.**

`apps/web/src/routes/pdkt/components/ReplyComposer.tsx:52-94` menggabungkan teks, timer simpan 500 ms, `confirmOpen`, `sentRef`, serta `isLoading` dari induk. Saat unmount, teks terakhir disimpan bila belum dianggap terkirim; pengiriman lebih dulu menandai `sentRef`, menunggu hasil callback, dan hanya membuang draf setelah hasil yang diterima bukan `false`.

**Yang sudah membantu:** ada penyimpanan terakhir saat keluar sebelum debounce selesai. Komponen juga diberi key per email pada `apps/web/src/routes/pdkt/components/PdktReplyStage.tsx:52-58`, sehingga jangan mengasumsikan pergantian email pasti mencampur draf.

**Yang perlu dijaga:** kontrak callback gagal dan urutan unmount selama pengiriman. Jika callback reject alih-alih mengembalikan `false`, jalurnya tidak sama dengan kegagalan boolean yang ditangani. Itu skenario bersyarat yang perlu diperiksa terhadap pemanggil, bukan bukti draf saat ini sudah hilang.

### 9.4 Pengaturan simulasi: editor bersarang dan simpan pengaturan

**Jenis:** lifecycle gabungan antara draf editor dan simpan async. **Prioritas: menengah; contoh yang diverifikasi adalah Telefun.**

`apps/web/src/hooks/useCrudForm.ts:20-25` menyimpan mode tambah/edit melalui kombinasi `isOpen`, `editingId`, dan draf. Transisi add/edit/close serta perubahan generation berada pada `apps/web/src/hooks/useCrudForm.ts:44-67`.

Pengaturan Telefun membungkus dua editor itu dengan `localSettings`, `isSaving`, `saveError`, dan `saveInFlightRef` (`apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts:86-128`). Saat menyimpan, draf editor yang berubah divalidasi dan digabung; baru kemudian pengaturan dikirim. Gagal simpan mempertahankan editor agar bisa dicoba lagi (`apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts:225-275`). Pembukaan modal/perubahan props juga mereset draf (`apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts:130-158`).

**Makna praktis:** menyimpan skenario ke daftar lokal belum berarti pengaturan tersimpan ke server. Pengaman single-flight sudah ada. Yang perlu diuji saat area ini diubah adalah perubahan props ketika sedang mengedit, draft yang belum lengkap, dan retry setelah simpan gagal. Belum ada bug runtime yang direproduksi.

### 9.5 Kelola Kegiatan: baca gambar → validasi → simpan → tampilkan hasil

**Jenis:** alur async implisit pada form pengelolaan, bukan sekadar toggle tampil/sembunyi. **Prioritas: menengah–rendah.**

`apps/web/src/routes/dashboard/kegiatan.tsx:105-121` menyimpan form terbuka, item yang diedit, file, preview, error, `saving`, target hapus, dan `pendingAction` secara terpisah. Submit melewati pembacaan gambar dan validasi, memilih create/update, memperbarui daftar lokal, lalu menutup form (`apps/web/src/routes/dashboard/kegiatan.tsx:190-272`). Penutupan form diblokir saat menyimpan (`apps/web/src/routes/dashboard/kegiatan.tsx:175-183`). Publish/hide dan delete mempunyai handler terpisah (`apps/web/src/routes/dashboard/kegiatan.tsx:275-330`).

**Yang perlu dijaga:** state form, proses baca file, hasil request, dan pembaruan daftar harus tetap merujuk operasi/item yang sama. Ini inventaris struktur alur; tidak ada kegagalan penyimpanan yang direproduksi dan boolean publikasi sendiri tidak dianggap bug atau alasan refactor.

### 9.6 Harga AI terjadwal — lifecycle yang ditentukan waktu

**Jenis:** state turunan berbasis waktu, bukan kumpulan flag yang harus otomatis diganti reducer. **Prioritas dokumentasi: menengah karena memengaruhi biaya.**

UI memilih harga berlaku sekarang atau tanggal mendatang, kemudian menyimpan atau membatalkan jadwal (`apps/web/src/routes/monitoring/components/PricingEditDialog.tsx:53-90`; `apps/web/src/routes/monitoring/components/PricingTab.tsx:80-123`). Backend menentukan harga efektif dari `effective_from <= now` dan harga berikutnya dari jadwal mendatang (`apps/api/src/services/ai-pricing-service.ts:129-155`). Jadwal hanya dapat dibatalkan sebelum berlaku (`apps/api/src/services/ai-pricing-service.ts:258-278`).

**Mengapa disebut:** perpindahan terjadwal → efektif terjadi karena waktu saat pembacaan, bukan harus ada update kolom `status` atau worker yang menggantinya. Ini contoh yang bisa terlewat jika pencarian hanya mencari `setState`/UPDATE status. Bukan temuan bug; perubahan perlu menjaga batas waktu WIB, harga yang sudah berlaku, serta konsistensi tampilan dengan pencatatan biaya—jalur pencatatan biaya tidak ditelusuri ulang di sini.

### Batas pemeriksaan tambahan

Seluruh bukti bagian 9 berasal dari pembacaan kode langsung; tidak ada tes, provider AI, database, atau server yang dijalankan untuk lintasan ini. Komponen presentasional `SessionReview` dan `SessionReviewDialog` tidak dijadikan temuan lifecycle tersendiri: keduanya terutama merender data/props. `MicCheck` juga memiliki status union dan fungsi `update` terpusat, sehingga tidak disamakan dengan boolean panggilan tersebar hanya karena memiliki state tambahan.

Daftar ini memperluas peta, **belum menutup semua celah cakupan**. Lima subalur pertama dan contoh harga terjadwal tidak boleh dijumlahkan begitu saja dengan seluruh judul sebelumnya: ada subalur dalam modul yang sama, bukan enam modul baru.

## 10. Masih ada lagi? Pemeriksaan sesudah perbaikan tambahan

**Tanggal:** 8 November 2026. **Cara pemeriksaan:** membaca kode lokal terbaru, tanpa tes, build, provider AI, atau akses database. HEAD tetap sama, dengan perubahan lokal yang telah dijelaskan sebelumnya.

**Masih ada. Ram memetakan empat subalur tambahan yang belum dibahas tersendiri.** Ini bukan empat bug produksi yang telah terbukti, dan bukan pengulangan lima perbaikan sebelumnya. Dua kandidat yang paling layak diuji lebih dulu adalah urutan respons Riwayat Monitoring dan pergantian file impor EFEK. Catatan bukti terstruktur ada di [ledger pemeriksaan lanjutan](state-machine-lanjutan-2026-11-08.json).

### 10.1 Riwayat Monitoring: ganti filter → muat data → hapus → refresh

**Jenis:** lifecycle request implisit. **Prioritas:** menengah–tinggi untuk validasi. **Keyakinan:** tinggi terhadap pola kode; dampak runtime belum direproduksi. **Perkiraan usaha:** S–M. **Risiko perbaikan:** rendah–menengah, karena harus menjaga filter, pagination, dan refresh setelah hapus.

Dalam bahasa sederhana: Fajar mengganti filter, tetapi beberapa permintaan lama mungkin masih berjalan. Daftar, jumlah sesi, dan indikator memuat harus tetap milik filter yang sedang dipilih, bukan milik respons yang kebetulan tiba paling akhir.

`HistoryTab` menyimpan `data`, `loading`, `error`, target hapus, dan `deletePending` terpisah. `fetchPage()` langsung menulis hasil/error dan mematikan loading, tanpa generation check atau pembatalan di fungsi itu (`apps/web/src/routes/monitoring/components/HistoryTab.tsx:127-161`). Setelah hapus, handler dapat mengubah halaman atau memanggil `fetchPage()` lagi (`HistoryTab.tsx:179-200`). Parent memasang `<HistoryTab />` tanpa key filter (`apps/web/src/routes/monitoring/MonitoringPage.tsx:127-134`); wrapper RPC juga tidak menyediakan pengaman urutan respons UI secara otomatis (`apps/web/src/lib/api/rpc-client.ts:443-480`).

**Risiko bersyarat:** bila dua request selesai terbalik, respons filter lama dapat menggantikan hasil filter baru, atau request lama dapat mematikan indikator loading request yang lebih baru. Ini masalah konsistensi tampilan yang perlu diuji, bukan bukti kebocoran akses atau kesalahan otorisasi server.

**Yang sudah tersedia:** pola generation guard ada di hook bersama `apps/web/src/hooks/useApi.ts:44-74`, tetapi pemuatan khusus di HistoryTab tidak memakai hook itu. Perbaikannya tidak harus berupa reducer besar: yang penting hanya hasil dari konteks request terbaru yang boleh diterapkan.

**E2E yang dibutuhkan:** tahan respons filter A, pindah ke B, selesaikan B lalu A; pastikan baris, jumlah, pagination, error, dan loading tetap mencerminkan B. Sertakan refresh sesudah hapus ketika filter berubah.

### 10.2 Impor EFEK: baca file → cocokkan nama → tinjau → impor

**Jenis:** wizard async implisit, terpisah dari impor Profiler dan lifecycle plan TNA. **Prioritas:** menengah–tinggi untuk validasi. **Keyakinan:** tinggi terhadap koordinasi yang terlihat; belum direproduksi. **Perkiraan usaha:** M. **Risiko perbaikan:** menengah karena menyentuh pilihan peserta dan payload impor.

Alurnya memiliki beberapa pekerjaan berbeda: membaca Excel/CSV, mengurai baris, meminta pencocokan nama ke Profiler, memilih kandidat untuk nama ambigu, lalu mengirim sesi pelatihan.

`fileName`, `reading`, `rows`, `problems`, `matches`, dan `chosen` disimpan terpisah. `onFile()` melakukan await saat membaca dan mencocokkan nama, lalu menulis state tanpa identitas/generation file (`apps/web/src/routes/tna/efek-import.tsx:59-109`). Input file tetap bisa memanggil `onFile()` lagi; tidak ada disabled saat reading atau mutation pada input tersebut (`efek-import.tsx:181-190`). Tombol impor memeriksa mutation busy, jumlah sesi, dan batas ukuran hasil, tetapi bukan generation pembacaan (`efek-import.tsx:337-354`).

**Risiko bersyarat:** file A diproses lambat, kemudian Fajar memilih B; hasil pembacaan/pencocokan A dapat tiba belakangan dan mengganti preview atau pilihan yang seharusnya milik B. Tahap membaca dan mencocokkan perlu mempunyai pemilik operasi yang sama. Belum ada bukti peserta salah benar-benar tersimpan.

**Jangan salah sasaran:** penyimpanan backend sudah melalui `efek_save_sessions` dalam satu pemanggilan RPC (`apps/api/src/services/efek/sessions.ts:150-161`, `sessions.ts:203-218`). Definisi migration memvalidasi actor, program, dan ID peserta, lalu menyimpan sesi/relasi di dalam fungsi (`supabase/migrations/20261019160000_efek_training_sessions.sql:64-121`). Pencarian migration tidak menemukan definisi tekstual pengganti, tetapi database aktif tidak dibaca. Risiko yang dicatat di sini terutama pemilikan hasil async di frontend, bukan vonis bahwa backend memakai rangkaian write tanpa transaksi.

**E2E yang dibutuhkan:** pilih file A dan B berisi nama berbeda, tahan pembacaan/pencocokan A, selesaikan B lebih dulu, kemudian A. Preview dan payload harus tetap milik B; uji juga pergantian file ketika impor sudah berjalan.

### 10.3 Pengaturan KETIK: template global tersimpan, pengaturan pribadi belum tentu

**Jenis:** workflow gabungan dua resource dengan revision terpisah. **Prioritas:** menengah. **Keyakinan:** tinggi terhadap urutan write; pengalaman kegagalan parsial belum diuji. **Perkiraan usaha:** M. **Risiko perbaikan:** menengah, karena template global digunakan banyak akun.

Ini bukan sekadar salinan masalah pengaturan Telefun. Pada KETIK, satu tombol Simpan dapat melakukan dua jenis penyimpanan: template standar bersama, lalu pengaturan pribadi pengguna.

Jika template global berubah, handler menunggu `onSaveTemplates(...)`, kemudian baru memanggil `onSave(settingsToSave)`. Penutupan editor/modal baru dilakukan setelah keduanya selesai; kegagalan masuk satu catch umum (`apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts:392-438`). Client memakai endpoint dan revision berbeda untuk kedua resource (`apps/web/src/routes/ketik/ketikApi.ts:144-165`); route juga memisahkan `/templates` dan `/settings` (`apps/api/src/routes/ketik.ts:74-152`).

**Risiko bersyarat:** template global sudah berhasil disimpan, tetapi penyimpanan pribadi gagal atau konflik. Pesan gagal umum tidak otomatis menjelaskan bahwa sebagian perubahan sudah berlaku untuk pengguna lain. Retry juga perlu tetap menghormati revision masing-masing dan mempertahankan draf.

**Yang bukan bug:** pemisahan kepemilikan global/pribadi memang didokumentasikan (`docs/modules.md:59-62`), dan masing-masing write mempunyai guard versi. Service global melakukan compare-and-swap (`apps/api/src/services/ketik/global-templates.ts:69-140`); settings pribadi memakai guarded write (`apps/api/src/services/ketik/settings-history.ts:201-228`). Jangan memaksakan rollback global hanya karena write pribadi gagal—itu dapat merusak perubahan yang sudah sah untuk resource bersama.

**E2E yang dibutuhkan:** write template sukses, write settings pribadi gagal/409, lalu retry. Pastikan pengguna diberi informasi tahap mana yang sudah tersimpan dan draf yang belum tersimpan tetap tersedia. Ini validasi hasil parsial, bukan alasan menghapus pemisahan resource.

### 10.4 Catatan manual Telefun: draf → simpan → refresh → bersihkan input

**Jenis:** subalur draf async implisit, bukan state panggilan/rekaman/scoring. **Prioritas:** menengah. **Keyakinan:** tinggi terhadap urutan perubahan state; belum direproduksi. **Perkiraan usaha:** S. **Risiko perbaikan:** rendah–menengah, terutama pengalaman mengetik selama request berjalan.

`ReplayAnnotator` menyimpan teks, kategori, momen, timestamp, dan `isSubmitting` secara terpisah. Submit mengirim snapshot saat itu, menunggu callback, lalu mengosongkan teks (`apps/web/src/routes/telefun/components/ReplayAnnotator.tsx:192-229`). Textarea masih dapat diedit ketika pending, sedangkan tombol Simpan yang dinonaktifkan (`ReplayAnnotator.tsx:382-405`).

**Risiko bersyarat:** Fajar menulis tambahan selama catatan sebelumnya sedang dikirim. Saat request lama berhasil, `setText("")` bisa membuang ketikan baru yang belum termasuk payload lama. Solusinya bisa membekukan editor selama simpan atau hanya membersihkan draf bila masih sama dengan snapshot yang diakui; tidak perlu merombak seluruh Telefun.

**Yang sudah benar:** parent menampilkan error dan melemparnya kembali bila penambahan gagal (`apps/web/src/routes/telefun/components/TelefunReviewStage.tsx:403-426`), sehingga catch anak mempertahankan teks. Komponen telaah juga diberi key berdasarkan ID rekaman (`apps/web/src/routes/telefun/index.tsx:762-775`). Karena itu Ram tidak menuduh semua kegagalan menghapus draf atau pergantian sesi pasti mencampur catatan.

**E2E yang dibutuhkan:** tahan POST catatan, coba edit teks, lalu selesaikan POST; pastikan ketikan baru tidak hilang diam-diam atau editor memang terkunci dengan jelas. Pertahankan tes gagal-simpan yang menjaga isi draf.

### Pembanding: hasil parsial aksi massal pengguna bukan otomatis bug

Pilih akun → konfirmasi → proses per akun → tampilkan berhasil/gagal → retry akun gagal adalah lifecycle lain yang tersebar di UI dan service. Namun hasil parsialnya **disengaja**: backend menangkap hasil tiap akun dan melanjutkan akun lain (`apps/api/src/services/account-controls-service.ts:51-78`). UI menerima daftar hasil dan meneruskan ID gagal (`apps/web/src/routes/dashboard/components/users/BulkUserActions.tsx:83-104`); halaman pengguna mempertahankan ID itu sebagai pilihan untuk percobaan berikutnya (`apps/web/src/routes/dashboard/users.tsx:422-430`). Ini dicatat sebagai konteks, **tidak dihitung sebagai kandidat bug transaksi batch baru**.

### Kesimpulan dan batas lintasan ini

- Prioritas validasi berikutnya: **urutan respons Monitoring** dan **penggantian file impor EFEK**, lalu hasil parsial simpan KETIK serta draf catatan Telefun.
- Lifecycle besar panggilan/rekaman Telefun dan antrean chat KETIK dari laporan awal juga belum dirombak oleh lima perbaikan tambahan. Selesainya pekerjaan tambahan bukan berarti semua pola legacy sudah hilang.
- Tidak ada tes yang dijalankan pada lintasan ini. File E2E terkait memang ditemukan, tetapi keberadaan file tidak membuktikan skenario di atas sudah tercakup atau lulus. Hasil pengujian pekerjaan sebelumnya tidak disalin menjadi bukti baru.
- Hanya bagian/rentang bukti yang dicatat pada ledger yang ditelaah; inventaris folder dan hasil Graphify bukan pembacaan manual seluruh file. Tidak ada klaim kelengkapan seluruh aplikasi.
- Tidak ada kode aplikasi, migration, konfigurasi runtime, atau database yang diubah. Perubahan lintasan ini hanya laporan serta ledger pemeriksaannya.

## Urutan tindak lanjut dari snapshot awal

**Catatan:** urutan di bawah ditulis sebelum perubahan lokal yang dijelaskan pada bagian 9. Validasi ulang status perbaikannya sebelum membuat pekerjaan baru.

Ini urutan **untuk dipertimbangkan ketika area terkait disentuh**, bukan instruksi melakukan refactor massal:

1. **SIDAK publish:** periksa schema/trigger terkini dan uji atomisitas serta publish bersamaan pada lingkungan test. Tujuannya memastikan selalu ada versi aturan efektif yang benar.
2. **Telefun:** dokumentasikan kontrak terpisah untuk panggilan, rekaman, dan scoring; prioritaskan E2E gagal koneksi, retry cleanup, dan rekaman terlambat. Jangan menyatukan tiga proses berbeda secara paksa.
3. **PDKT evaluasi:** buktikan bagaimana pekerjaan pulih setelah proses mati; uji retry dan polling yang membaca status lama.
4. **KETIK chat:** uji antrean pesan, respons, kedaluwarsa, penutupan, dan retry dalam berbagai urutan; pertahankan lease/fencing backend.
5. **Profiler impor dan akses leader:** pastikan perilaku hasil parsial/response hilang, lalu uji dua fetch akses yang selesai terbalik.
6. **Sisanya:** prioritaskan sesuai perubahan fitur, bukan jumlah boolean. Status eksplisit dan guard yang sudah ada harus dipertahankan.

## Cakupan, metode, dan kejujuran hasil

- Root yang diperiksa: `~/Downloads/_Projects/trainerssuperappvite`. Pada awal pemeriksaan ulang, `HEAD` adalah commit yang tercantum di atas; saat itu satu file audit Cloudflare yang tidak terkait sudah untracked dan tidak disentuh.
- Graphify dipakai sebagai orientasi, tetapi hasil graph merujuk sebagian path lama sehingga **kode aktual** menjadi sumber utama.
- Inventaris otomatis terhadap file `.ts`, `.tsx`, dan `.sql` produksi yang tracked maupun untracked di `apps/` dan `packages/` menemukan **824 file**: 542 web, 202 API, 45 Telefun, 35 types. Ini **jumlah inventaris**, bukan klaim bahwa 824 file telah dibaca manual. Migrasi relevan ditelusuri terpisah; inventaris ini tidak menghitung seluruh migrasi `supabase/`.
- Pencarian pola status/flag menghasilkan kandidat, lalu sebagian alur ditelusuri oleh empat pemeriksa. Pola penamaan bukan bukti lengkap: mesin yang memakai nama lain, proses lintas file, SQL dinamis, atau sistem eksternal masih dapat terlewat. **Karena itu laporan ini belum dapat menjamin menemukan semua state machine dalam seluruh aplikasi.** Coverage mendalam berbeda antar modul; terutama Dashboard, Monitoring, Kegiatan, komponen bersama lain, dan seluruh versi migrasi perlu lintasan tambahan jika diperlukan inventaris yang benar-benar menyeluruh.
- Referensi penting untuk Telefun PhoneInterface, KETIK chat, PDKT stage/evaluation, SIDAK publish, Profiler impor, auth callback, dan hook akses dibaca langsung kembali pada penggabungan laporan. Referensi lain merupakan hasil penelusuran pemeriksa dan dicantumkan agar mudah ditindaklanjuti, bukan jaminan seluruhnya telah diverifikasi ulang satu per satu.
- **Penyimpangan proses pengujian:** dua pemeriksa menjalankan sebagian suite Vitest non-E2E tanpa izin spesifik, padahal `AGENTS.md:22-24` meminta izin sebelum tes non-E2E. Itu tidak seharusnya terjadi. Mereka melaporkan beberapa tes gagal dan satu suite menolak konfigurasi yang mengarah ke database produksi; laporan itu **belum diaudit ulang sebagai temuan produk**, jadi tidak dipakai untuk menyimpulkan ada bug produksi atau bahwa suite bersih. Tidak ada tes E2E yang dijalankan untuk laporan ini. Tidak ada mutasi database yang dilaporkan.
- Audit ini tidak mengakses atau mengubah server produksi. Tidak ada perbaikan kode, migrasi, commit, push, atau deploy yang dilakukan sebagai bagian laporan.

**Kesimpulan:** peta ini cukup untuk memulai diskusi dan menghindari refactor membabi buta, tetapi bukan sertifikat bahwa semua kemungkinan sudah ditemukan atau semua risiko sudah terbukti. Jika dibutuhkan klaim kelengkapan menyeluruh, lanjutkan audit berbasis daftar file per modul dan verifikasi migrasi aktif, dengan hasil cakupan yang dapat dihitung.
