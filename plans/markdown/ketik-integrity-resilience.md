# KETIK — integritas penilaian, ketahanan, dan riwayat

## Status

- Status: **A/C/B.1/B.2/D/E DONE lokal. Checkpoint A–D `63785527`; E ditutup melalui commit lokal atas instruksi user. Typecheck/lint lulus di checkout; build lulus pada salinan source identik karena pembacaan ancestor Downloads/.gitignore macet. Tanpa push/deploy/remote migration.**
- Planned at: commit `309facd`.
- Prioritas: P1 untuk integritas; P2 untuk ketahanan dan riwayat.
- Effort: A kecil, B besar, C sedang, D sedang, E besar.
- Risiko implementasi: Lane D (RLS, schema, API, permission, dan AI billing).
- Dasar: audit statis lokal atas sembilan klaim laporan KETIK. Celah INSERT skor sudah dibuktikan lewat E2E RED di database lokal, lalu ditutup dan diverifikasi GREEN. D memiliki pengukuran payload/EXPLAIN fixture lokal; bukan bukti percepatan produksi.
- Izin terbaru 2026-10-16: tuntaskan D termasuk caller AgentHome dan fixture E2E terkait, lalu commit lokal sebelum E. Push, deployment, perubahan database remote, dan biaya provider nyata tetap tidak diizinkan.

## Requirement

### Tujuan

1. Pengguna tidak dapat menulis skor/status penilaian langsung ke database.
2. Sesi baru memiliki skenario, model, waktu, dan transkrip yang dikuasai server.
3. Kegagalan AI, database, atau settings tampil jujur dengan pesan aman dan tindakan pemulihan.
4. Seluruh riwayat dapat diakses bertahap tanpa memuat transkrip pada daftar.
5. Telaah tidak bergantung pada umur satu HTTP request dan hasil lama tidak hilang saat telaah ulang gagal.
6. Pertahankan tampilan redesign, typed Hono RPC, atribusi peserta, template global, dan pencatatan penggunaan AI.

### Keputusan produk B/E — disetujui

Fajar mengizinkan agen/leader melihat dan mengubah skenario/model (jawaban nomor 1), mengikuti rekomendasi nomor 2–5, lalu mengonfirmasi bahwa perubahan dilakukan pada salinan pribadi, bukan sumber trainer. Keputusan ini menggantikan rekomendasi pembatasan materi pada versi awal plan; tidak ada klaim kerahasiaan skenario terhadap agen/leader.

| Keputusan                | Kontrak produk yang disetujui                                                                                                                                                                                 | Status    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Pengaturan agen/leader   | Boleh melihat dan mengubah skenario/model untuk dirinya sendiri pada salinan pribadi. Tidak boleh mengubah sumber milik trainer atau konfigurasi peserta lain.                                                | Disetujui |
| Sumber skenario agen     | Berasal dari penugasan eksplisit trainer/admin. Agen/leader boleh menyesuaikan salinan pribadi. Jika belum ada penugasan, beri pemberitahuan dan blokir mulai; jangan memakai skenario bawaan diam-diam.      | Disetujui |
| Telaah sesi agen sendiri | Manual oleh agen untuk sesi sendiri; trainer hanya untuk peserta dalam kewenangannya. Tidak ada telaah/regrade otomatis. Matriks otorisasi lintas pemilik harus ditulis dan diuji sebelum GREEN.              | Disetujui |
| Sesi lama                | Tetap dapat dibuka dan ditelaah ulang secara manual, dengan penanda transkrip legacy yang belum terverifikasi server. Tidak ada penilaian ulang otomatis.                                                     | Disetujui |
| Runtime worker           | Proses backend persisten, antrean database yang sudah ada, tanpa layanan antrean/dependency baru. Implementasi dan verifikasi lokal dahulu; host, aktivasi, dan deploy remote tetap memerlukan izin terpisah. | Disetujui |

Perubahan settings hanya berlaku untuk sesi berikutnya. Setelah sesi dimulai, snapshot dan transkrip tetap otoritatif server. Bentuk schema, endpoint penugasan, matriks ownership, serta protokol turn/lease masih harus dirinci berdasarkan live code sebelum implementasi; persetujuan produk bukan klaim kontrak teknis atau E2E sudah selesai.

**Paket A dan C dapat dikerjakan setelah persetujuan implementasi tanpa menunggu perubahan kebijakan B/E.** Jangan memblokir pencabutan INSERT skor karena desain distribusi skenario belum selesai.

## Current state dan bukti

- `supabase/migrations/002_ketik_pdkt_core.sql:175`:

  ```sql
  CREATE POLICY "ketik_history_insert_own" ON ketik_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);
  ```

  Tidak ditemukan pencabutan berikutnya pada migration lokal. Policy/grant database aktif belum diperiksa. Trigger atribusi pada `20260910000000_simulation_subject_attribution.sql` memvalidasi subjek, bukan skor.

- `apps/api/src/services/ketik/settings-history.ts:254–258`: query daftar mengambil `messages`, filter `user_id`, urut `date`, lalu `.limit(50)`. Jalur fallback juga memakai batas 50, bahkan bisa mengembalikan `[]` ketika gagal.
- `apps/api/src/routes/ketik.ts:224`: POST history menerima `messages` dari browser. `settings-history.ts:343` menyimpan `messages: params.messages`; `review-processor.ts:146` memakai `session.messages` untuk telaah.
- `apps/api/src/routes/ketik.ts:44–75`: generate memprioritaskan `scenarioDraft`, menerima karakter, model, riwayat, dan waktu browser. Prompt sistem tetap dibangun backend.
- `apps/api/src/lib/ai-models.ts:60`: `resolveModelProvider()` membatasi ke registry/default; pemilihan model tidak sepenuhnya bebas. Tetapi belum ada kebijakan per-sesi yang mencegah override model terdaftar.
- `packages/types/src/access.ts:28–31`: review hanya admin/trainer; settings read/write termasuk leader/agent. Ini akses yang sengaja dipertahankan dalam `plans/markdown/ketik-redesign.md:34–45`, bukan regresi redesign.
- `apps/api/src/routes/ketik.ts:371–376`: POST review memfilter pemilik dengan `resolveAccountScope(getActor(c)).userId`. Trainer tidak otomatis dapat menelaah sesi akun agen lain.
- `apps/web/src/routes/ketik/index.tsx:100–105`: kegagalan settings hanya warning; `ketikApi.ts:64–76` dapat memakai backup localStorage tanpa pemberitahuan pengguna.
- `apps/api/src/services/ketik/review-processor.ts:29,55`: model telaah hardcoded. `routes/ketik.ts` memiliki beberapa respons `err.message` dan `Session not found.`.
- `apps/api/src/routes/ketik.ts:499–503`: request menunggu `claimAndProcessKetikReviewJob()`. Job/lease/retry sudah tersedia dalam `review-lifecycle.ts` dan `review-state.ts`; jangan membangun sistem antrean kedua.
- `apps/web/src/routes/ketik/utils/landingSummary.ts:86–105`: ringkasan berasal dari daftar yang dimuat; rata-rata memakai lima sesi reviewed terakhir. Pagination saja tidak cukup jika jumlah bulanan ikut dihitung dari satu halaman.

## Design

### Batas scope bersama

Edit hanya path paket yang sedang dikerjakan. Snapshot `git status --short` dan `git diff --name-only HEAD` sebelum mulai. Working tree saat audit berisi pekerjaan Telefun dan shared UI yang tidak terkait; jangan reset, stash, format, atau mengklaimnya sebagai hasil paket ini.

- Backend: `apps/api/src/routes/ketik.ts`, `apps/api/src/services/ketik/*`, resolver model jika diperlukan.
- Kontrak: `packages/types/src/ketik.ts`, export terkait di `packages/types/src/index.ts`; `access.ts` hanya sesudah kebijakan disetujui.
- Frontend: `apps/web/src/routes/ketik/**`; shared settings helper hanya jika kebutuhan terisolasi KETIK tidak bisa dipenuhi di pemanggilnya dan scope diperluas dengan persetujuan.
- Database: migration baru KETIK dan rollback pasangannya; jangan edit migration historis.
- Verifikasi: `apps/web/e2e/ketik-flow.spec.ts`, spec API KETIK baru, helper KETIK jika diperlukan, dan entri project di `apps/web/playwright.api.config.ts`.
- Dokumentasi: plan ini, `docs/e2e-testing.md`, `docs/architecture.md`, `docs/database.md`, `docs/auth-rbac.md`, `docs/modules.md` sesuai kontrak yang berubah. `docs/deployment.md` hanya untuk petunjuk worker; tidak menjalankan deploy.
- Di luar scope: redesign visual baru, perubahan PDKT/Telefun/SIDAK/Monitoring yang tidak diperlukan, dependency baru, backfill/regrade massal, penghapusan tes massal, atau perubahan tooling/Turbo.

### Paket A — tutup penulisan skor langsung

**Prioritas P1; effort S; tidak bergantung paket lain.**

- Migration baru mencabut policy `ketik_history_insert_own`. Tinjau grants, policy lain, trigger, dan RPC exposed untuk memastikan tidak ada jalur authenticated yang setara.
- Jangan mengubah policy SELECT/ownership atau atribusi peserta yang sah. Backend `persistSession()` tetap satu jalur simpan menggunakan admin client dan otorisasi app-side.
- Rollback mengembalikan policy lama persis, dengan catatan bahwa rollback membuka kembali risiko integritas. Jalankan rollback hanya pada database disposable, kemudian apply kembali migration.
- Jangan menghapus skor/history lama. Inventarisasi data mencurigakan merupakan follow-up terpisah dan memerlukan izin.

### Paket B — sesi dan transkrip otoritatif server

**Prioritas P1; effort L; bergantung A dan keputusan produk.**

Kontrak yang diusulkan untuk disetujui sebelum coding:

1. Mulai sesi: backend memvalidasi subjek dan penugasan, membaca konfigurasi salinan pribadi yang tersimpan di server dan skenario aktif, lalu menyimpan snapshot immutable berisi pemilik, subjek, sumber penugasan, skenario/karakter, model, durasi, dan waktu mulai/kedaluwarsa. Browser menerima ID sesi, identitas konsumen, status, serta data UI minimum. Izin melihat/mengubah settings bukan izin menimpa snapshot sesi yang sudah dimulai.
2. Kirim pesan: browser mengirim ID sesi, ID request idempoten, versi/urutan yang diharapkan, dan pesan agen saja. Backend memvalidasi ownership/status/urutan/expiry dan batas panjang, menyimpan pesan agen, menghasilkan balasan dari snapshot + transkrip database, lalu menyimpan balasan konsumen yang benar-benar ditampilkan.
3. Akhiri sesi: browser mengirim ID sesi, bukan transkrip atau skor. Finalisasi idempoten memakai transkrip tersimpan; telaah hanya membaca transkrip tersebut.
4. Simpan provenance/version untuk membedakan sesi baru dan legacy. Bentuk tabel final (tabel sesi baru atau perluasan history) ditentukan dalam kontrak schema sebelum implementasi; jangan membuat dua sumber transkrip aktif.
5. Tentukan transaksi dan claim per turn: kunci/versi database mencegah dua request memproses turn yang sama. Jangan menahan transaksi database selama memanggil provider. Kegagalan provider meninggalkan turn yang dapat dicoba ulang tanpa menggandakan pesan. Jangan menjanjikan exactly-once biaya provider jika provider tidak mendukung idempotensi.
6. Waktu dihitung server; browser tidak menentukan elapsed/remaining untuk prompt. Provider timeout dan kegagalan simpan setelah respons harus punya status eksplisit, bukan sukses palsu.
7. Hapus jalur tulis lama yang menerima seluruh transkrip untuk sesi baru. Endpoint generate lama tidak boleh menjadi bypass menggunakan draft/model bebas. Tentukan respons penolakan legacy yang jelas setelah frontend beralih.
8. Bedakan sumber konfigurasi trainer, penugasan, dan salinan pribadi agen/leader. Pertahankan akses settings agen/leader sesuai keputusan; mutasi sumber trainer/peserta lain wajib ditolak di backend, bukan hanya disembunyikan di UI. Audit default/import dan endpoint `/scenarios` untuk mencegah fallback yang melewati kewajiban penugasan, bukan untuk menjanjikan materi rahasia.
9. Tetap gunakan `logAiUsage()` melalui jalur provider yang ada, dengan userId pemilik dan UsageContext. Hindari pencatatan ganda; jangan mengubah pricing.

Akses telaah lintas pemilik hanya untuk trainer terhadap peserta dalam kewenangannya sesuai keputusan di atas; tulis dan uji matriks role/ownership sebelum GREEN. Pemicu tetap manual, tanpa telaah otomatis atau perubahan pricing.

### Tahap B.1 — fondasi penugasan dan salinan pribadi

Implementasi B dibagi serial agar perubahan ownership dapat dibuktikan sebelum mengalihkan sesi. Tahap ini tidak mengklaim transkrip otoritatif atau memblokir endpoint chat lama; keduanya tetap kriteria B berikutnya.

- Sumber konfigurasi aktif tetap `user_settings.settings.ketik`. Tidak membuat sumber settings/transkrip aktif kedua. Salinan pribadi penerima menggunakan namespace yang sama pada akun penerima.
- Tabel baru `ketik_configuration_assignments`: satu baris per `recipient_id`, `assigned_by`, snapshot `source_configuration`, `source_settings_version`, UUID `version`, dan `assigned_at`. Snapshot hanya memuat scenarios, consumerTypes, activeConsumerTypeId, selectedModel, simulationDuration, responsePacingMode—bukan identitas, nomor telepon, atau template trainer.
- `GET /api/v1/ketik/assignments/self`: keempat role membaca assignment sendiri (null bila belum ditugaskan), beserta `recipientSettingsVersion`. Null bukan izin memakai skenario default; penegakan start menunggu tahap sesi B.
- `GET /api/v1/ketik/assignments/:recipientId`: admin/trainer membaca assignment penerima dan versi settings penerima, bukan isi preferences pribadi. Trainer hanya boleh membaca assignment yang ditugaskannya; target belum ditugaskan boleh diperiksa untuk membuat penugasan. Admin boleh mengelola seluruh assignment.
- `PUT /api/v1/ketik/assignments/:recipientId`: capability baru `ketik.assignments.write` (admin/trainer), body strict berisi `sourceSettingsVersion`, `recipientSettingsVersion`, `expectedAssignmentVersion` (null untuk pertama kali). Tidak menerima konfigurasi atau identitas sumber dari browser. Sumber adalah settings akun pemanggil yang dibaca server. Penerima harus akun agent/leader aktif, bukan diri sendiri/trainer/admin/deleted/inactive.
- RPC `assign_ketik_configuration` hanya dapat dieksekusi service_role dan memakai satu transaksi: kunci penerima, cek role/status serta ownership assignment, cek ketiga versi, upsert namespace training penerima tanpa menghapus identitas/template/modul lain, kemudian terbitkan snapshot assignment/version baru. Reassignment eksplisit boleh mengganti training copy, tetapi ditolak jika penerima sudah mengedit settings sejak versi yang dibaca trainer.
- Agent/leader tetap memakai PUT settings sendiri untuk mengedit salinan pribadinya. Perubahan sumber trainer tidak dipropagasikan otomatis. Trainer lain tidak dapat mengambil alih assignment; admin dapat melakukan reassignment eksplisit dengan versi terkini.
- RLS assignment hanya mengizinkan SELECT recipient/assigner; tidak ada INSERT/UPDATE/DELETE authenticated/anon atau EXECUTE RPC authenticated. Tidak ada backfill massal, provider call, UI assignment, perubahan akses review, atau migrasi remote dalam B.1.
- E2E nyata `ketik-assignment-api.spec.ts` / project `ketik-assignment-real-backend`: satu tes RED pertama membuktikan route belum tersedia; GREEN mencakup copy/edit/source isolation, preservasi data pribadi/modul lain, unassigned null, role/ownership, validasi strict, source/recipient/assignment conflicts termasuk request bersaing, RLS/direct RPC, dan kegagalan DB aman. Schema migration dan rollback diuji lokal, lalu migration di-reapply.

### Kontrak B.2 — sesi server (Lane D)

- `ketik_sessions` menyimpan snapshot immutable (config/scenario/subjek/assignment), pemilik, start request UUID, waktu mulai/expiry, versi turn, status active/ended/discarded dan transkrip **aktif**. Tabel turn menyimpan request UUID, teks agen untuk cek idempotensi, expected version, status dan lease fencing; bukan transkrip kedua untuk penilaian.
- Finalisasi RPC atomik memindahkan transkrip ke `ketik_history` dengan ID sesi yang sama dan provenance `server_v1`, lalu mengosongkan messages operational. Hanya satu transkrip aktif pada setiap fase. History/Monitoring/SIDAK tidak melihat sesi yang belum selesai. FK history menghapus metadata sesi/turn bila history dihapus. History lama provenance `legacy`; tidak dibackfill/regrade.
- API typed: POST `/sessions` strict `{requestId, simulationSubject?}`; GET `/sessions/:id` owner-only; POST `/sessions/:id/turns` strict `{requestId, expectedVersion, text}`; POST `/sessions/:id/finish` strict `{}`. Start dan finish idempoten. Browser tidak memasok config, identitas, waktu, skor, atau pesan konsumen.
- Start server membaca settings sendiri; agent/leader wajib memiliki assignment. Admin/trainer memakai konfigurasi akun sendiri dan resolver peserta JWT yang ada. RPC memeriksa ulang settings/assignment version serta status akun saat start. Snapshot tidak berubah setelah settings diedit/reassignment.
- Claim turn serial di DB: ownership, expiry/status, urutan, request/payload yang sama, dan satu turn unresolved per sesi. Pesan agen ditulis sekali sebelum AI; kegagalan menyisakan turn failed yang harus di-retry dengan request ID/payload sama. Lease mencakup timeout provider + retry internal/grace; reclaim hanya setelah expiry, hasil worker/request lama ditolak lewat fencing. Tidak ada transaksi ditahan selama AI. Tidak menjanjikan exactly-once billing setelah crash/timeout.
- Publish hanya menyimpan bagian consumer/system yang dinormalisasi server dengan parser pure bersama. AI/provider/save failure bukan sukses. Transkrip finished hanya dari database. Endpoint POST generate/history lama menjadi 410, tanpa panggilan provider/penyimpanan.
- Frontend mengirim pesan melalui antrean serial; textarea/Send tetap bisa dipakai selama loading, tanpa latest-wins yang membuang balasan sah. Retry memakai request ID sama dan menahan antrean berikutnya sampai turn pulih; error dan jumlah antrean terlihat. Waktu UI mengikuti expiry server; tidak menambah pesan konsumen lokal palsu. URL chat memungkinkan resume/reload lewat GET sesi. Perluasan path routing hanya search contract KETIK pada `apps/web/src/router.tsx`.
- UI penugasan mengikuti komponen/token existing: menu Penugasan khusus trainer/admin, pilih akun agent/leader aktif dari endpoint admin/users existing, tampilkan konflik/retry tanpa menimpa draft. GET source version di-refresh sebelum assignment; body tetap tiga versi B.1. Agent/leader melihat unassigned/error/retry dan start disabled; Pengaturan pribadi tetap tersedia. Tidak ada redesign, dependency, akses review baru, atau deploy dalam B.2 (izin review/legacy badge dirampungkan E).
- Acceptance UI: keyboard/dialog berlabel, target 44px, mobile 390px/desktop 1280px tanpa overflow; loading/empty/error/conflict/success jelas. E2E API nyata RED-first (snapshot/forgery/idempotensi/urutan/race/failed retry/expiry/fencing/legacy bypass/usage), regresi browser dan satu alur browser → Hono/auth/DB/provider transport lokal. RPC write service-role-only, SELECT owner JWT, rollback migration lokal lalu reapply.

### Paket C — error aman, model terpusat, settings fail-closed

**Prioritas P2; effort M; independen A/B.**

- Tetapkan kode error publik KETIK dan copy Bahasa Indonesia untuk gagal memuat settings, AI tidak tersedia/output invalid, sesi tidak ditemukan, simpan gagal, dan konflik settings. Pertahankan HTTP status yang benar; jangan menyamarkan semua kegagalan menjadi 404/200.
- Log detail teknis di backend tanpa token/transkrip sensitif; respons publik tidak membawa raw provider/database message, termasuk `data.error` dan status job. Error konflik/validasi terkurasi tetap boleh punya pesan spesifik yang aman.
- Ikuti pola `apps/api/src/routes/pdkt/route-utils.ts` dan `services/pdkt/mailbox-session.ts` untuk pemisahan log/detail publik; jangan mengubah PDKT.
- Pilihan model telaah primary/fallback berasal dari `apps/api/src/lib/ai-models.ts`; pertahankan perilaku model sekarang dan satu fallback, jangan mengganti biaya/semantik diam-diam.
- Pada halaman KETIK, tampilkan state settings loading/error/retry. Mulai simulasi dinonaktifkan sampai settings server berhasil. Backup localStorage tidak boleh menjadi sumber sesi baru secara diam-diam; hentikan fallback pada jalur KETIK atau kembalikan provenance eksplisit dan tetap blokir mulai sampai sinkron.
- Retry settings tidak memulai simulasi, tidak menimpa draft belum tersimpan, dan tidak mengubah identitas akun. Setelah B, sumber konfigurasi sesi tetap server.

### Paket D — pagination, detail terpisah, ringkasan akurat

Kontrak implementasi lokal D (Lane D): `GET /history` mengembalikan `{items,nextCursor,total,counts,reviewedCount,averageScore}` tanpa messages. Query strict `limit` 1–100 (default 20), `q` literal substring maksimum 120 karakter, status `all/completed/running/failed/not_started`, cursor opaque tervalidasi terikat q/status dengan timestamp presisi asli dan UUID. RPC baca SECURITY INVOKER service-role-only menerima owner dari JWT backend; filter selalu owner-scoped. `GET /history/summary` mengembalikan ringkasan penuh (bulan WIB, processing, window lima reviewed, fokus, tiga recent/follow-up). `GET /history/:id` mengambil detail/transkrip owner dan skor reviewed sebelum tanggal sesi untuk mempertahankan perbandingan. CSV browser memakai halaman 100, maksimum 10.000 baris/100 request; jika batas terlampaui atau request gagal, tidak mengunduh file parsial dan menampilkan error. Dataset stabil dijamin tanpa skip/duplikasi; export bukan snapshot transaksi lintas request. UI tetap komposisi lama, navigasi halaman berurutan Sebelumnya/Berikutnya dan state detail/export eksplisit. Perluasan scope 2026-10-16 terbatas pada caller `AgentHome.tsx` dan fixture `home-agent.spec.ts` agar memakai kontrak history baru.

**Prioritas P2; effort M; implementasikan setelah B agar kontrak sesi stabil.**

- Daftar memakai cursor stabil `(date DESC, id DESC)` dengan limit tervalidasi dan bounded; kirim ringkasan tanpa `messages`. Cursor invalid ditolak, tidak mengulang halaman pertama diam-diam.
- Detail sesi/transkrip diambil melalui endpoint owner-scoped saat replay/Telaah dibuka, termasuk saat deep-link langsung ke sesi lama. Jangan mencari sesi hanya di halaman pertama history.
- Ringkasan landing dihitung backend atas scope yang benar: jumlah sesi bulan WIB, jumlah processing, lima reviewed terakhir, fokus, dan daftar tindak lanjut. Tidak dihitung dari halaman daftar aktif.
- Pertahankan kontrak search/status/CSV secara eksplisit: filter/search dijalankan server; CSV mengekspor hasil filter seluruh halaman melalui jalur bounded dengan indikator progress/error, bukan hanya halaman terlihat tanpa pemberitahuan.
- Tambah indeks sesuai query final, kandidat `(user_id, date DESC, id DESC)`, dengan rollback. Catat EXPLAIN pada fixture lokal representatif sebelum/sesudah; jangan menetapkan klaim percepatan tanpa angka.
- Hapus fallback berlapis yang mengubah error database menjadi riwayat kosong. Jika dukungan legacy memang diperlukan, satu fallback berbatas dengan kondisi eksplisit dan kegagalan tetap terlihat.
- Update semua pemanggil kontrak KETIK yang ditemukan lewat pencarian. Jika perlu mengubah modul lain, minta perluasan scope, bukan membuat adapter diam-diam.

### Paket E — telaah asynchronous yang durable

**Prioritas P2; effort L; bergantung C, keputusan trigger/worker, dan kontrak sesi B.**

- POST review memvalidasi ownership/capability, enqueue idempoten, lalu segera mengembalikan status processing/queued tanpa menunggu AI. Status HTTP/response disepakati dalam shared contract; polling tetap jujur.
- Gunakan `ketik_review_jobs` dan alur claim yang ada. Worker backend serial, concurrency 1, tidak memakai fire-and-forget promise di route. Runtime diusulkan pada `apps/api/src/workers/ketik-review-worker-{runtime,entrypoint}.ts` dengan script API; periksa contoh Telefun tanpa mengubahnya.
- Pertahankan batas retry, lease/reclaim, dan pengecekan pemilik lease. Selaraskan expiry lease dengan timeout provider dan grace period; polling tidak boleh menggagalkan job yang masih memiliki lease sah.
- Klaim kedaluwarsa dapat dipulihkan setelah restart. Worker lama yang kehilangan lease tidak boleh menulis hasil. Jangan mengklaim exactly-once panggilan provider saat crash.
- Publikasi hasil baru, skor, dan status selesai harus atomik; kegagalan di tengah persist tidak menghapus hasil lama atau membuat skor/review tidak konsisten. Telaah ulang menyimpan versi lama sampai hasil baru berhasil dipublikasikan. Buat migration/RPC backend-only bila diperlukan, dengan grants aman dan rollback.
- Worker shutdown berhenti menerima pekerjaan baru; selesaikan atau lepaskan claim secara aman. Error worker tetap kode publik aman. Dokumentasikan pengaktifan dan health sebelum mengalihkan request ke enqueue-only.
- Jangan aktifkan otomatis untuk semua sesi tanpa persetujuan biaya. Tidak mengubah Railway/hosting atau menjalankan deploy dalam paket ini.

## Tasklist — RED → GREEN → REFACTOR per paket

### 0. Drift check dan persiapan

- [x] Jalankan `git rev-parse --short HEAD`, `git status --short`, dan `git diff --stat 309facd..HEAD -- apps/api/src/routes/ketik.ts apps/api/src/services/ketik apps/web/src/routes/ketik packages/types/src/ketik.ts packages/types/src/access.ts supabase/migrations`.
- [x] Bandingkan live code dengan bukti di atas; pisahkan drift relevan dari dirty work yang tidak terkait.
- [x] Baca `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, `docs/e2e-testing.md`, skill `trainers-superapp-tdd`, dan manifest workspace. Saat implementasi gunakan `thermo-nuclear`; gunakan `impeccable` untuk state UI yang berubah. Knowledge tools mengikuti matriks repo, bukan wajib untuk setiap edit.
- [x] Pastikan database disposable loopback dan izin mutasi fixture/migration lokal tersedia. Jika belum, STOP dan minta izin/target; jangan memakai production atau mengganti dengan unit test.
- [x] Tetapkan nama migration unik setelah melihat urutan schema terkini; setiap migration baru wajib rollback.

### 1. Paket A

- [x] Buat `apps/web/e2e/ketik-integrity-api.spec.ts` dan project API dengan nama `ketik-integrity-real-backend`.
- [x] RED: JWT pengguna nyata mencoba direct INSERT history dengan nilai penilaian; ekspektasi ditolak. Pastikan kegagalan sebelum fix benar-benar karena insert diizinkan, bukan auth/fixture rusak.
- [x] GREEN: tambahkan migration policy dan rollback. Di database disposable saja, buktikan rollback mengembalikan perilaku lama lalu reapply mengembalikan proteksi.
- [x] Verifikasi backend tetap menyimpan sesi sah; read owner berhasil, cross-owner ditolak, atribusi self/peserta tidak berubah. Buat fixture skor melalui admin lokal hanya untuk verifikasi, bukan jalur publik baru.

### 2. Paket C

- [x] Tambahkan kasus error/settings pada `ketik-flow.spec.ts` dan spec baru `ketik-errors-api.spec.ts`, project `ketik-errors-real-backend`.
- [x] RED: simulasikan kegagalan settings dengan/tanpa backup, provider gagal, missing session, dan database gagal. Assert copy aman, bukan string teknis, serta tombol mulai diblokir.
- [x] GREEN: pusatkan model/error dan ubah settings load/retry tanpa menyentuh redesign.
- [x] Verifikasi retry sukses membuka akses mulai, konflik settings tidak menimpa data, dan retry gagal tetap error. Periksa endpoint review/status/worker juga, bukan hanya generate.

### 3. Paket B (setelah keputusan)

- [x] Catat keputusan produk final B/E dan kontrak teknis B.1 pada plan sebelum implementasi.
- [x] B.1: E2E penugasan RED (route 404) → GREEN, copy/edit pribadi/source isolation, role/ownership, tiga versi, first assignment + reassignment bersaing, transaksi gagal, RLS/direct RPC, dan error aman.
- [x] B.1: migration/rollback/reapply lokal; 12 tes assignment + 8 regresi API dan 28 regresi browser lulus; typecheck/lint/build lulus.
- [x] Rinci kontrak schema/API sesi B.2: snapshot, ownership, provenance legacy, idempotensi, urutan/state turn, claim/expiry dan transaksi provider sebelum implementasinya.
- [x] Tambahkan `ketik-session-api.spec.ts`, project `ketik-session-real-backend`; RED untuk override transkrip/skenario/model, akses lintas pemilik, duplicate request, request paralel, urutan salah, expired/ended session, dan endpoint lama sebagai bypass.
- [x] Implementasikan schema + backend + kontrak, kemudian alihkan frontend. Jangan mempertahankan dua jalur simpan aktif.
- [x] Provider test memakai transport provider deterministik lokal pada batas HTTP, bukan men-stub service penilaian produk. Bukti database dan otorisasi harus nyata. Bila SDK tidak bisa diarahkan dengan aman, STOP untuk persetujuan seam test terkecil.
- [x] Verifikasi satu alur browser nyata: mulai → beberapa pesan → provider failure/retry → akhiri → reload → transkrip database sama dengan tampilan → telaah menggunakan transkrip itu.
- [x] Periksa boundary settings/start/scenarios: tidak ada janji kerahasiaan skenario; actor/config/transkrip/waktu ditentukan server. Import tipe API di frontend type-only. Update kontrak/matriks akses sesi, provenance legacy, dan dokumentasi.
- [x] Matriks review baru serta penanda legacy di UI dirampungkan pada E, bukan diklaim selesai oleh tahap B.2.

### 4. Paket D

- [x] Tambahkan `ketik-history-api.spec.ts`, project `ketik-history-real-backend`, dan `ketik-history-browser.spec.ts`.
- [x] RED: seed lebih dari 50 sesi, termasuk timestamp sama, lintas bulan WIB, lintas owner, completed/failed/processing. Sesi lama harus bisa dibuka lewat deep-link dan transkrip tidak boleh ada di respons daftar.
- [x] GREEN integrasi penuh: caller AgentHome memakai page ringkasan melalui typed helper KETIK; E2E fokus 7/7 dan root lint/typecheck/build lulus pada penutupan D.
- [x] Verifikasi tidak ada duplikasi/lompatan untuk dataset stabil, bulan/five-review window benar, cursor rusak ditolak, detail cross-owner ditolak, CSV tidak diam-diam terpotong, dan error DB bukan `[]` sukses.
- [x] Rekam ukuran payload dan query plan sebelum/sesudah pada fixture sama. Tetapkan target berdasarkan baseline; tidak membuat target latency absolut tanpa pengukuran.

### 5. Paket E

- [x] Tambahkan `ketik-review-worker-api.spec.ts`, project `ketik-review-worker-real-backend`; worker diuji sebagai proses task-owned terhadap DB/provider lokal.
- [x] RED: provider ditahan lokal, POST review harus sudah selesai sementara hasil belum tersedia. Uji enqueue ganda, restart/reclaim, lease hilang, retry maksimum, dan shutdown.
- [x] GREEN: worker durable dan publikasi atomik. Jangan menyamakan respons enqueue sukses dengan hasil AI sukses.
- [x] Verifikasi crash pada fase persist tidak menghapus review lama; rerun gagal mempertahankan skor/review/status lama secara konsisten; dua pemicu tidak membuat dua job aktif.
- [x] Update polling/browser untuk antrean, progres, kegagalan, retry, dan hasil. Verifikasi manual/otomatis persis sesuai keputusan biaya/akses.
- [x] Dokumentasikan prasyarat aktivasi worker dan rollback operasional; jangan men-deploy atau mengaktifkan remote.

## Test plan dan perintah verifikasi

Pola API nyata: `apps/web/e2e/pdkt-evaluation-error-api.spec.ts` dan `helpers/sidakRealBackend.ts`. Pin env loopback **sebelum dynamic import apps/api**, pasang guard egress, gunakan JWT nyata dan cleanup fixture bernamespace. Jangan print credential. `mockSupabaseAuth` hanya untuk browser hermetic.

Pola UI: `apps/web/e2e/ketik-flow.spec.ts`, `helpers/hermeticShell.ts`, assertion target lokal dan `expectHermetic`. Mock UI membuktikan tampilan, bukan keamanan backend/RLS.

Daftarkan setiap spec API baru pada `apps/web/playwright.api.config.ts`; file `*-api.spec.ts` diabaikan config browser biasa. Jalankan serial, satu runner/proses auxiliary aktif; cleanup hanya proses milik task. RED dan GREEN dicatat per kasus dengan exit code dan alasan gagal.

```bash
# Setelah spec dibuat/didaftarkan: discovery harus menampilkan tes paket tersebut.
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-integrity-real-backend --list

# Paket A; exit 0 pada GREEN, direct authenticated write ditolak.
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-integrity-real-backend --workers=1 --trace on

# Paket C / B / D / E, hanya setelah project masing-masing dibuat.
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-errors-real-backend --workers=1 --trace on
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-session-real-backend --workers=1 --trace on
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-history-real-backend --workers=1 --trace on
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-review-worker-real-backend --workers=1 --trace on

# UI regression, setelah setiap paket yang mengubah frontend.
pnpm --filter @trainers/web exec playwright test ketik-flow.spec.ts --workers=1 --trace on

# Gate akhir Lane D, satu per satu; semuanya harus exit 0.
pnpm typecheck --concurrency=1
pnpm lint --concurrency=1
pnpm build --concurrency=1
git diff --check
```

Command A/C dan gate akhir yang sudah dijalankan dicatat pada Evidence pelaksanaan. Project sesi B dan history D sudah dibuat; project worker E sudah dibuat dan diverifikasi; command aktual tercatat pada evidence E. Terapkan migration hanya melalui harness lokal yang divalidasi, dengan kredensial tidak dicetak; jangan menyalin perintah deploy remote.

Jangan menjalankan `pnpm test`, Vitest, test:core/fast/full atau menambah unit test tanpa persetujuan Fajar. Bila E2E tidak dapat membuktikan invariant tertentu, jelaskan invariant dan minta pengecualian; jangan mengganti gate sendiri. Jangan menghapus unit test lama sebelum coverage E2E setara terbukti.

## Done criteria

Per paket: semua tasklist terkait selesai, RED yang relevan terekam, GREEN/relevant E2E lulus, root typecheck/lint/build lulus, migration/rollback lokal terbukti bila ada, diff direview, hanya path scope yang berubah oleh executor, dan status plan diperbarui dengan command/exit code/artifact.

Keseluruhan:

- [x] Direct authenticated INSERT penilaian ditolak di DB disposable dengan grants/policy nyata.
- [x] Sesi baru tidak menerima transkrip/konfigurasi/waktu otoritatif dari browser; provenance legacy tetap berbeda di DB.
- [x] Penugasan dan sumber/salinan pribadi mengikuti keputusan tertulis; tidak ada bypass draft/model lama.
- [x] Izin review agen/trainer baru dan penanda legacy di UI mengikuti kontrak E.
- [x] Error publik KETIK aman pada jalur A/C yang diuji; settings failure/backup tidak menjadi sukses diam-diam. Fallback riwayat lama sudah dihapus dan failure diuji pada D.
- [x] Sesi ke-51+, deep-link, search/filter/CSV, dan summary bulanan tetap akurat; daftar tidak membawa messages.
- [x] POST review tidak menunggu AI; worker restart/reclaim dan rerun gagal teruji tanpa kehilangan hasil lama.
- [x] AI usage tetap tercatat dengan pemilik/konteks yang benar; tidak ada provider nyata dipanggil saat E2E.
- [x] Trace/report Playwright dapat diulang pada target lokal; tidak ada perubahan remote.

## STOP conditions

- In-scope code drift mengubah asumsi kontrak; rekonsiliasi plan sebelum edit.
- Target DB/provider bukan loopback disposable, izin fixture/migration lokal belum diberikan, atau env integrasi tidak ada.
- Keputusan produk B/E belum disetujui; lanjutkan hanya paket independen yang diizinkan.
- Perbaikan memerlukan dependency/infrastruktur baru, perubahan scope modul lain, atau menyentuh dirty work milik sesi lain.
- Test tidak dapat membuktikan invariant dengan harness aman; minta persetujuan sebelum alternatif non-E2E.
- Migration gagal karena baseline lokal berbeda; jangan reset database atau memaksa schema production sebagai jalan pintas.
- Gate baru/tidak terjelaskan gagal; jangan memperbaiki pekerjaan Telefun/shared UI yang tidak terkait agar gate hijau.

## Urutan dan catatan pemeliharaan

Urutan rekomendasi: **A → C → B → D → E**. A/C bisa disiapkan tanpa keputusan B/E, tetapi tetap dikerjakan serial. Setelah B, snapshot sesi menjadi satu sumber fakta: perubahan settings hanya berlaku untuk sesi berikutnya. Setelah D, ringkasan landing tidak boleh kembali dihitung dari satu halaman. Setelah E, enqueue-only tidak boleh diaktifkan pada deployment yang belum memiliki worker sehat. Rollback keamanan/schema/worker memerlukan review eksplisit, bukan tombol pemulihan otomatis.

## Evidence pelaksanaan

### Batas izin dan drift

- Implementasi diminta Fajar; Docker/Supabase lokal dan migration/rollback database tes diizinkan secara eksplisit. Tidak ada izin/aksi remote, commit, push, deploy, atau biaya AI nyata.
- Baseline implementasi `a60b943`, working tree awal bersih. Dibanding planned-at `309facd`, drift KETIK hanya pada tiga file frontend di luar perubahan A/C (settings UI dan quote/score display); backend, access, schema asumsi A tidak berubah.
- OrbStack dinyalakan dan stack Supabase minimal dijalankan dengan `supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor` (exit 0). API/DB diuji loopback sebelum mutasi; tidak ada reset/seed massal.
- Inspeksi DB lokal menemukan policy INSERT lama aktif dan grant INSERT authenticated. Local baseline tidak memiliki tabel legacy `results`; fixture cleanup hanya menerima kondisi absent `PGRST205` itu, tidak membuat tabel baru.
- Context7 `/supabase/supabase`: service_role memiliki BYPASSRLS; grants dan row policies merupakan dua pemeriksaan terpisah. Graphify query `persistSession` cocok dengan jalur admin client; inspeksi source/schema tetap sumber kebenaran.

### Paket A — hasil

- RED awal tersandung fixture peserta (batch_name wajib) dan cleanup tabel legacy absent; diperbaiki pada harness, bukan produk. Empat user fixture dari percobaan gagal dibersihkan berdasarkan namespace run tersebut.
- RED yang sah: spec integritas exit 1 karena INSERT skor/status sebagai agent **berhasil**, sehingga kode error RLS yang diharapkan tidak ada. Artifact: `apps/web/test-results/ketik-integrity-red/`.
- Migration `20261015120000_ketik_history_backend_insert_only.sql` dijalankan via psql dengan guard host loopback, exit 0. Ini apply SQL lokal, bukan klaim history CLI/remote sudah diperbarui.
- GREEN: ketiga tes integritas lulus; direct INSERT ditolak untuk agent/leader/trainer/admin, backend menyimpan sesi pending tanpa skor kiriman, read owner-only dan no-update RLS tetap berlaku, participant attribution trainer-only.
- Rollback SQL exit 0 → tes direct INSERT kembali RED (exit 1, kegagalan yang sama). Migration langsung di-reapply exit 0; final API run membuktikan proteksi aktif lagi. Artifact rollback: `apps/web/test-results/ketik-integrity-rollback/`.

### Paket C — hasil

- RED API exit 1: sentinel detail database bocor di respons GET settings.
- RED UI exit 1: kedua kasus dengan/tanpa backup tidak menemukan state error; log menunjukkan pemakaian defaults/backup lama.
- GREEN: safe copy/kode publik di shared types, model telaah primary/fallback terpusat tanpa pergantian model, error lookup DB dibedakan dari missing session, polling/worker tidak mengirim pesan internal. Unexpected review failure kini 500 (bukan catch-all 400); missing session tetap 404 dan settings conflict tetap 409.
- Settings load/error/retry menahan Mulai simulasi dan Pengaturan sampai GET server berhasil. Backup tidak lagi menjadi fallback otomatis. Respons settings yang terlambat diabaikan oleh state UI saat unmount/pergantian akun.
- Lima tes API error membuktikan private detail, missing session, provider failure, primary/fallback, legacy job error, worker, template failure, dan settings conflict tanpa overwrite.
- Regresi browser KETIK penuh: **28 passed**, termasuk dua kasus settings failure/backup, retry gagal/sukses tanpa auto-start, chat, Telaah, rerun, Riwayat, settings draft/save, dan kontras yang sudah ada.
- Audit Impeccable: **PASS untuk perubahan state settings**; detector menghasilkan `[]`. Screenshot Playwright 390px dan 1280px dibaca langsung: pesan/tombol retry terlihat, tidak overflow; target retry minimal 44px dibuktikan E2E. Tidak mengklaim audit ulang seluruh produk.
- Thermo-nuclear self-review: **Verdict PASS untuk A/C**. Batas input → RLS/backend persistence → public error → state UI ditelusuri; tidak ada temuan material terbuka pada scope A/C. Tanpa delegasi/reviewer independen, penghapusan tes legacy, atau dependency baru. Spec browser modul sudah >1.000 baris pada baseline; dua kasus baru tetap ditempatkan pada owning flow KETIK sesuai kebijakan curation, bukan membuat suite duplikat.

### Commands dan artifact

Semua command berikut benar-benar dijalankan serial:

| Command                                                                                                                                                                                                                      | Hasil                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-integrity-real-backend --workers=1 --trace on`                                                                           | RED sah exit 1; setelah migration GREEN 3 passed exit 0 |
| Command integritas dengan `--grep 'direct authenticated' --output test-results/ketik-integrity-rollback` setelah rollback                                                                                                    | Expected RED exit 1; proteksi di-reapply sesudahnya     |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-errors-real-backend --workers=1 --trace on --output test-results/ketik-errors-red`                                       | RED exit 1, respons membocorkan sentinel                |
| `pnpm --filter @trainers/web exec playwright test ketik-flow.spec.ts --grep 'settings failure blocks' --workers=1 --trace on --output test-results/ketik-settings-red`                                                       | RED exit 1, dua kasus gagal sesuai bug                  |
| Command UI fokus dengan `--output test-results/ketik-settings-green`                                                                                                                                                         | 2 passed, exit 0                                        |
| `pnpm --filter @trainers/web exec playwright test ketik-flow.spec.ts --workers=1 --trace on --output test-results/ketik-regression`                                                                                          | 28 passed, exit 0                                       |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-integrity-real-backend --project ketik-errors-real-backend --workers=1 --trace on --output test-results/ketik-api-final` | 8 passed, exit 0                                        |
| `pnpm typecheck --concurrency=1`                                                                                                                                                                                             | exit 0, 4 workspace berhasil                            |
| `pnpm lint --concurrency=1`                                                                                                                                                                                                  | exit 0; web melaporkan 71 warning, tanpa error          |
| `pnpm build --concurrency=1`                                                                                                                                                                                                 | exit 0, 3 task build berhasil                           |
| `git diff --check`                                                                                                                                                                                                           | exit 0                                                  |

Trace/screenshot tersimpan dalam output ignored `apps/web/test-results/`, tidak ditambahkan ke Git (trace dapat memuat sesi auth tes lokal). Tidak ada Vitest/non-E2E test dijalankan.

### Tahap B.1 — hasil dan evidence

- Keputusan final pengguna dicatat sebelum coding; tidak membatasi akses pengaturan agen/leader yang sengaja diperbolehkan. Sumber trainer dan salinan pribadi dipisahkan tanpa membuat store settings aktif kedua.
- Graphify query `getSettingsSnapshot` mengarah ke admin client, global templates, parser settings, dan frontend settings draft. Live source tetap otoritatif. Context7 `/supabase/supabase` menegaskan perlunya REVOKE EXECUTE dari PUBLIC/anon/authenticated secara eksplisit sebelum grant role spesifik; fungsi B.1 SECURITY INVOKER dengan grant service_role-only.
- Satu focused E2E ditulis terlebih dahulu. RED sah exit 1: `GET assignments/self` mendapat 404, bukan 200. Artifact `apps/web/test-results/ketik-assignment-red/`, log `/tmp/ketik-assignment-red.log`.
- Percobaan GREEN pertama mendeteksi validasi karakter terlalu ketat terhadap sentinel `random` yang memang didukung modul. Diperbaiki dengan mempertahankan perilaku tersebut. Fixture sumber juga diselaraskan dengan merge skenario default yang memang berlaku; tidak mengubah parser produk untuk memudahkan tes.
- Migration `20261015130000_ketik_configuration_assignments.sql` dan rollback dijalankan via helper psql ber-guard loopback, exit 0. Seperti A, ini apply SQL lokal, bukan pembaruan ledger CLI/remote. Setelah rollback, focused E2E kembali RED dengan 500 karena kontrak DB belum tersedia; cleanup tetap berhasil. Migration di-reapply exit 0 sebelum final GREEN.
- **12 tes assignment lulus**: copy source server tanpa identitas/template trainer, edit pribadi dan source tidak ikut berubah, leader, admin reassignment dan batas trainer lain, input strict/recipient aktif, ketiga versi, dua request bersaing pada first assignment dan reassignment, RLS/direct RPC denial untuk seluruh role, kegagalan transaksi setelah settings ditulis tetap rollback total, transport error aman, race perubahan sumber setelah service read, dan sumber `absent` saat admin melakukan penugasan eksplisit.
- Typed client diverifikasi lewat `hc<KetikRouteType>` dengan transport menuju app Hono nyata. Percobaan memakai AppType penuh salah prefix dan menyentuh batas kedalaman tipe; kemudian nullable data validator juga dideteksi typecheck. Keduanya diperbaiki sesuai pola per-module client repo, tanpa cast `any` atau pelemahan compiler; root typecheck akhir lulus.
- Thermo-nuclear self-review **PASS untuk B.1**: input → capability → sumber server → RPC/version locks → settings/provenance → DTO/error → pembacaan settings penerima diperiksa; tidak ada temuan material terbuka pada scope fondasi. Publication result diberi tipe assignment non-null, berbeda dari GET unassigned. Tidak ada reviewer independen, dependency baru, penghapusan test, atau perubahan runtime modul lain.
- UI tidak diubah pada B.1, sehingga tidak ada audit visual penugasan atau klaim bahwa UI/start telah terintegrasi. Regresi browser menguji alur KETIK yang sudah ada, bukan otorisasi assignment.

Command final serial dan hasil aktual:

| Command                                                                                                                                                                                                                                                                 | Hasil                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-assignment-real-backend --workers=1 --trace on --output test-results/ketik-assignment-red`                                                                          | RED exit 1 (404)                                        |
| Command assignment dengan `--grep 'copies server settings' --output test-results/ketik-assignment-rollback` setelah rollback                                                                                                                                            | Expected RED exit 1 (500); migration di-reapply         |
| Command focused sesudah koreksi typed client dengan `--output test-results/ketik-assignment-rpc-green`                                                                                                                                                                  | 1 passed, exit 0                                        |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-integrity-real-backend --project ketik-errors-real-backend --project ketik-assignment-real-backend --workers=1 --trace on --output test-results/ketik-b1-api-final` | 20 passed, exit 0                                       |
| `pnpm --filter @trainers/web exec playwright test ketik-flow.spec.ts --workers=1 --trace on --output test-results/ketik-b1-browser`                                                                                                                                     | 28 passed, exit 0                                       |
| `pnpm typecheck --concurrency=1`                                                                                                                                                                                                                                        | exit 0, 4 workspace; termasuk E2E compile               |
| `pnpm lint --concurrency=1`                                                                                                                                                                                                                                             | exit 0, 4 workspace; 71 warning web/0 error             |
| `pnpm build --concurrency=1`                                                                                                                                                                                                                                            | exit 0, 3 task                                          |
| `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                                                                                                                                                                                              | exit 0, graph ignored diperbarui sekali untuk batch B.1 |

Log gate: `/tmp/ketik-b1-{api-final,browser,typecheck,lint,build,graphify}.log`. Trace/report ignored di output masing-masing; tidak ditambahkan Git karena dapat membawa sesi auth lokal. Tidak ada non-E2E test, provider berbayar, atau perubahan remote.

Penutupan B.1: pemeriksaan katalog lokal mengonfirmasi SECURITY DEFINER=false, EXECUTE anon/authenticated=false dan service_role=true; history maupun assignment hanya memiliki policy SELECT. User fixture assignment dan fungsi trigger fixture tersisa 0. `supabase stop` exit 0; empat container task berhenti dengan data tetap pada volume backup. Tidak ada runner/Vite/worker milik task tertinggal. Scoped Prettier check dan `git diff --check` lulus.

### Penutupan verifikasi lokal A/C

- Gate root diulang setelah perubahan terakhir: typecheck 4/4 (3 cache hit), lint 4/4 (3 cache hit, 71 warning web/0 error), build 3/3 (2 cache hit), semuanya exit 0.
- `GRAPHIFY_MAX_WORKERS=1 graphify update .` selesai exit 0 setelah percobaan pertama terinterupsi sebelum menghasilkan output. Cache graph ignored diperbarui; tidak dimasukkan Git.
- Inspeksi akhir DB lokal: hanya policy SELECT owner tersisa pada `ketik_history`; user fixture KETIK tersisa 0. Satu-satunya public function yang mereferensikan tabel itu adalah `delete_monitoring_history(text,uuid)`, bukan jalur penulisan skor baru.
- `supabase stop` exit 0; empat container stack task ini berhenti dan data lokal tetap pada volume backup. Tidak ada Vite/test runner/worker task yang ditinggalkan. OrbStack engine tidak dimatikan karena merupakan layanan mesin, bukan dev server produk.

### Sisa pekerjaan

- **B.2 DONE LOKAL**: snapshot/transkrip server, assignment UI/start, serial turns/retry/resume, finalisasi dan legacy write 410 terverifikasi. Regresi gabungan API 30/30, browser 37/37 dan root gates lulus. UI badge legacy serta izin review baru tetap E.
- **D DONE LOKAL**: pagination/detail/summary/search/CSV dan indeks tersedia; perluasan scope AgentHome disetujui dan integrasi E2E 7/7, root lint/typecheck/build lulus. Lihat evidence penutupan D di bagian akhir.
- **E DONE lokal**: enqueue manual, worker persisten, publikasi atomik dan UI queue/legacy selesai serta teruji. Host/aktivasi/deploy remote belum diizinkan.
- Pemeriksaan awal menemukan runner Playwright PDKT milik sesi Codex lain aktif (root PID 45657, parent app-server PID 44964). Tidak dihentikan atau ditumpangi runner/gate berat kedua. Pemeriksaan ulang menunjukkan proses runner terkait sudah keluar; lanjut B.1 secara serial dan periksa ulang resource sebelum command berat.
- Review asynchronous tetap belum selesai. Sesi baru menggunakan transkrip server; legacy bukan terverifikasi server dan label UI legacy tetap pekerjaan E. Kerahasiaan skenario terhadap agen/leader bukan tujuan sesuai keputusan terbaru.

### B.2 — implementasi dan verifikasi akhir

- Kontrak B.2 dipersist sebelum implementasi. RED start mendapat 404; legacy write diharapkan 410, sebelumnya gagal. Assignment/start UI RED membuktikan agen belum ditugaskan masih bisa mulai. Perbaikan memindahkan snapshot/clock/transkrip/claim/finish ke backend; frontend hanya ID/versi/teks agen.
- Migration `20261015140000` diuji lokal melalui `/tmp/ketik-b2-migration-check.py`: rollback ditolak saat sesi aktif, finish kosong membolehkan rollback, skor fixture 83 tetap sama, reapply dan cleanup lulus. Log `/tmp/ketik-b2-migration-check.log`; ledger CLI lokal tidak diperbarui, remote tidak disentuh.
- API sesi 10/10 lulus (`/tmp/ketik-session-boundaries.log`): immutable setelah settings diubah, assignment wajib, forgery/ownership/version/expiry, duplicate tanpa AI ekstra, provider retry, concurrent request/reclaim/fencing, JWT RLS/RPC denial, atomic finish failure/retry, legacy 410.
- Browser live dengan JWT/session asli (bukan mockAuth) lulus: provider HTTP gagal sekali → retry UUID sama → dua turn → reload tanpa AI ekstra → finish → telaah manual. Prompt review persis messages history; tidak ada auto-review. Log `/tmp/ketik-session-browser-final.log`, artifact ignored `test-results/ketik-session-browser-final/`. Supabase auth/profile dan Hono/DB nyata melalui bridge transport fail-closed, provider hanya fixture HTTP lokal.
- Regresi API lama terbukti gagal karena endpoint history/generate kini 410. A dialihkan ke sesi server + assignment dan C ke turn server; fixture review dibuat langsung melalui admin DB lokal, bukan jalur write legacy. A/C kembali 8/8 lulus; tidak menghidupkan bypass lama.
- Coverage E2E antrean/Send/Enter/expiry menggantikan dua blok unit clock/composer dan satu kasus greeting yang obsolete. Kasus avatar yang tidak terkait tetap dipertahankan (fixture prop disesuaikan); tidak ada entri manifest untuk file itu. Tidak ada unit test ditambah atau dijalankan.
- UI memakai komponen/token existing, target 44px, keyboard retry/Escape dan pemulihan focus. Inspeksi screenshot 390px/1280px menunjukkan dialog/error/sukses tidak overflow. Dummy input 1px Base UI `aria-hidden=true` bukan target interaksi dan dikecualikan dari pengukuran; tombol tutup kecil diganti tindakan Tutup 44px yang sudah tersedia.
- Scope tambahan terbatas: search contract KETIK `tahap=chat` di router, tipe GET users existing pada facade RPC untuk dialog, pure parser/identity dipindah ke shared types dan frontend re-export; tidak ada dependency/modul runtime lain diubah. Suite `ketik-flow.spec.ts` sudah >1.000 baris sebelum tahap ini; tetap dipertahankan agar tidak memecah/merombak tes lama di luar scope.

#### Review akhir B.2

- **Thermo-nuclear Verdict: PASS (self-review)**. P2 yang ditemukan saat inspeksi akhir: `useServerKetikChat.ts` meneruskan pesan antrean setelah polling resume menyatakan konsumen menutup chat. RED `resume completion never sends queued text` membuktikan bubble agen yang belum terkirim muncul; guard state/expiry ditambah sebelum optimisme/POST dan pada hasil poll, lalu GREEN 7/7 serta regresi akhir 37/37. Marker sent kini hanya dari konfirmasi server; copy finish menjelaskan hanya pesan tersimpan yang disertakan. Evidence `/tmp/ketik-resume-close-red.log` dan `/tmp/ketik-server-chat-final.log`. Tidak ada temuan material terbuka pada scope B.2; D/E tetap batas eksplisit. Tidak ada reviewer independen.
- **Impeccable Verdict: PASS**. P2 target tutup kecil diselesaikan dengan Tutup 44px/Escape/focus return; error/conflict memerlukan tindakan eksplisit. Verifikasi source terpisah dari runtime: screenshot akhir 390px dan 1280px dibaca, overflow/target/keyboard dibuktikan E2E. Tidak ada klaim audit desain seluruh aplikasi.
- Lint awal menemukan impurity/ref saat render dan deklarasi state terlambat pada kode baru; diperbaiki tanpa disable rule/compiler. Final web tetap 71 warning lama/0 error; API tetap warning lama. Tidak menyentuh sumber warning modul lain.
- Perapian scope mengembalikan 29 blok format-only pada suite browser lama memakai `edit`; token emitted JS sebelum/sesudah identik. Tidak membuang perubahan perilaku/tes milik A/C/B.2. Scoped Prettier tidak memaksa seluruh legacy suite menjadi format baru.
- Durasi snapshot dibulatkan ke menit utuh sesuai kolom history INTEGER; pilihan UI yang ada tetap integer. Antrean frontend maksimal 20 pesan belum selesai (termasuk turn berjalan); antrean lokal belum dikirim dapat hilang jika pengguna mengabaikan peringatan meninggalkan halaman. Tidak menjanjikan durable offline queue atau exactly-once biaya provider.

| Command (serial)                                                                                                                                                                                                                                                                                             | Hasil aktual                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `python3 /tmp/ketik-b2-migration-check.py`                                                                                                                                                                                                                                                                   | exit 0: active rollback guard, history score tetap 83, rollback/reapply dan cleanup |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-integrity-real-backend --project ketik-errors-real-backend --project ketik-assignment-real-backend --project ketik-session-real-backend --workers=1 --trace on --output test-results/ketik-b2-api-final` | 30 passed, exit 0                                                                   |
| `E2E_KETIK_LIVE=1 pnpm --filter @trainers/web exec playwright test ketik-flow.spec.ts ketik-server-chat.spec.ts ketik-session-browser.spec.ts --workers=1 --trace on --output test-results/ketik-b2-browser-final`                                                                                           | 37 passed, exit 0, termasuk JWT asli dan telaah manual                              |
| `pnpm typecheck --concurrency=1`                                                                                                                                                                                                                                                                             | exit 0, 4/4 (termasuk E2E compile)                                                  |
| `pnpm lint --concurrency=1`                                                                                                                                                                                                                                                                                  | exit 0, 4/4; web 71 warning/0 error                                                 |
| `pnpm build --concurrency=1`                                                                                                                                                                                                                                                                                 | exit 0, 3/3                                                                         |
| `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                                                                                                                                                                                                                                   | exit 0, ignored cache akhir; 15.655 nodes/29.550 edges                              |

Log akhir: `/tmp/ketik-b2-{api-final,browser-final,typecheck,lint,build,graphify}.log`. Artifact ignored di output command masing-masing; jangan add trace auth lokal ke Git. Tidak ada non-E2E test ditambah/dijalankan, dependency/provider berbayar/commit/push/deploy/remote migration.

Catatan Git akhir: branch aktual `feat/ketik-integrity-resilience`, HEAD `717ff0d9` (commit landing di atas baseline KETIK `a60b943`). Ringkasan awal masih menyebut main/a60b943; reflog menunjukkan commit/checkout lain, tetapi sesi ini tidak menjalankan commit atau switch branch. Tiga file landing pada commit itu tidak diedit/diklaim sebagai pekerjaan KETIK; root gates akhir lulus pada working tree aktual. Jangan reset atau memindahkan branch untuk menyamakan ringkasan lama.

Penutupan B.2: scoped Prettier check lulus (legacy suite tidak diformat massal), blok Markdown seimbang, bundle JS tidak membawa identifier kredensial backend, dan `git diff --check` lulus. Katalog lokal mengonfirmasi keempat RPC SECURITY INVOKER, EXECUTE anon/authenticated=false dan service_role=true; history/sessions/turns hanya policy SELECT. Fixture user/fungsi KETIK tersisa 0. `supabase stop` exit 0, empat container task berhenti dan data tetap pada Docker volume. Tidak ada runner/Vite/Graphify/worker milik task tertinggal; OrbStack engine tidak dimatikan. Implementasi berikutnya D → E; commit/push/remote apply/deploy tetap memerlukan izin terpisah.

### D — evidence lokal dan STOP 2026-10-16

#### Titik lanjut yang diverifikasi

Resume membaca ulang Status, tasklist 4/5, Evidence dan STOP conditions, lalu menjalankan `git status --short`, `git diff --stat` dan `git branch --show-current` (exit 0). Branch tetap `feat/ketik-integrity-resilience`. Pekerjaan A/C/B.1/B.2 dan perubahan D yang belum di-commit dipertahankan; tidak mengulang E2E/typecheck yang sudah hijau. Hasil di bawah berasal dari log/artifact pelaksanaan D yang masih tersedia, bukan klaim rerun saat resume.

`trainers-superapp-tdd` adapter repo telah dibaca sebelum implementasi; klasifikasi Lane D dan kontrak D dipersist sebelum GREEN. Graphify dua query tidak menemukan jalur KETIK yang relevan; fallback source/import/caller dipakai. Context7 `/supabase/supabase-js` mengonfirmasi ordering/filter/count; changelog Supabase diperiksa. Tidak ada non-E2E test dijalankan.

#### Implementasi dan RED/GREEN

- `ketik-history-api.spec.ts` dan project `ketik-history-real-backend` tersedia. RED awal tiga kasus gagal sesuai kontrak: array lama, filter/summary absen, error DB menjadi sukses kosong. GREEN mencakup owner-scoped pagination/detail/summary, cursor strict terikat q/status dengan presisi microseconds, search literal/status server, limit 1–100, serta proyeksi tanpa messages. Detail mengembalikan skor sesi reviewed sebelum tanggalnya untuk perbandingan lama.
- Fallback berlapis pada service history dihapus. Dua kasus unit `getHistory` yang obsolete dihapus sesudah coverage E2E pengganti hijau; kasus lain dalam file dan entri suite file tetap ada. Tidak menambah/menjalankan unit test.
- Migration `20261015145210_ketik_history_pagination.sql` menambah RPC SECURITY INVOKER service-role-only dan indeks `(user_id,date DESC,id DESC)`; rollback hanya menghapus RPC/index. SQL apply lokal via `/tmp/ketik-d-sql.py` exit 0 (guard loopback). E2E rollback/reapply mempertahankan jumlah dan skor; missing RPC menghasilkan 500 eksplisit. Ledger CLI dan database remote tidak diubah.
- Browser memuat detail terpisah untuk deep-link/replay; summary memakai backend. CSV mengambil seluruh hasil filter per 100, maksimum 10.000 sesi/100 request, dengan progress/error dan tanpa unduhan parsial. Dataset stabil tanpa duplikasi/lompatan; export lintas request bukan snapshot transaksi.
- E2E browser menggunakan 205 sesi. Review menemukan count akun lama sempat terlihat saat berganti akun: RED sah, lalu state dipisahkan per akun dan GREEN. Detail error mempertahankan URL dan menawarkan retry. Target pager 44px, Escape/focus return, overflow serta screenshot 390/1280px diverifikasi. Trace console hanya menunjukkan HTTP 500/502 yang disengaja dan aset diblokir harness; tidak ditemukan exception JavaScript aplikasi.
- Katalog lokal: `ketik_history_page|SECURITY DEFINER=false|anon EXECUTE=false|authenticated=false|service_role=true`; history hanya SELECT policy. Fixture user history/live tersisa 0 pada pemeriksaan akhir. Tidak ada perubahan izin review/worker E.

#### Payload dan EXPLAIN

Fixture sama: 2.001 sesi owner, termasuk 2.000 transkrip synthetic. Bentuk respons HTTP lama (50 sesi dengan transkrip) **126.966 byte**; respons baru (20 ringkasan + metadata) **5.855 byte**. Target fixture baru <25% baseline lulus; perbandingan ini juga mengubah jumlah baris 50 → 20, bukan pengukuran murni penghapusan messages. Count/summary processing 2.000 terbukti tidak terkena cap row PostgREST.

EXPLAIN (ANALYZE, BUFFERS) sebelum/sesudah indeks memakai fixture/query yang sama: **0,146 ms → 0,261 ms** pada satu sampel. Keduanya memilih `idx_ketik_history_date` + Incremental Sort; indeks baru tidak dipilih pada fixture ini. Tidak ada klaim percepatan dari indeks baru atau target latency produksi. Query plan/payload tersedia sebagai attachment trace tes `counts exceed...`, serta ekstraksi `/tmp/ketik-d-{plan-before-index,plan-after-index,payload-comparison}.json`.

#### Command, hasil dan artifact

| Command                                                                                                                                                                                                                                                                                                                                          | Hasil aktual                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-history-real-backend --workers=1 --trace on --output test-results/ketik-history-red`                                                                                                                                                         | exit 1, 3 expected RED; `/tmp/ketik-d-red.log`                                                                 |
| `pnpm --filter @trainers/web exec playwright test ketik-history-browser.spec.ts --workers=1 --trace on --output test-results/ketik-history-browser-red`                                                                                                                                                                                          | exit 1, 2 expected RED; `/tmp/ketik-d-browser-red.log`                                                         |
| `pnpm --filter @trainers/web exec playwright test ketik-history-browser.spec.ts --grep 'account changes' --workers=1 --trace on --output test-results/ketik-history-account-red`                                                                                                                                                                 | exit 1, expected count akun lama masih terlihat; `/tmp/ketik-d-account-red.log`                                |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-integrity-real-backend --project ketik-errors-real-backend --project ketik-assignment-real-backend --project ketik-session-real-backend --project ketik-history-real-backend --workers=1 --trace on --output test-results/ketik-d-api-final` | exit 0, 35 passed, termasuk 5 history dan rollback/reapply; `/tmp/ketik-d-api-final.log`                       |
| `pnpm --filter @trainers/web exec playwright test ketik-flow.spec.ts ketik-server-chat.spec.ts ketik-history-browser.spec.ts --workers=1 --trace on --output test-results/ketik-d-browser-regression`                                                                                                                                            | exit 0, 38 passed sebelum perbaikan tambahan isolasi akun; `/tmp/ketik-d-browser-regression.log`               |
| `pnpm --filter @trainers/web exec playwright test ketik-history-browser.spec.ts --workers=1 --trace on --output test-results/ketik-history-browser-reviewed`                                                                                                                                                                                     | exit 0, 3 passed setelah perbaikan isolasi akun; `/tmp/ketik-d-browser-reviewed.log`                           |
| `E2E_KETIK_LIVE=1 pnpm --filter @trainers/web exec playwright test ketik-history-browser.spec.ts ketik-session-browser.spec.ts --workers=1 --trace on --output test-results/ketik-d-browser-final-reviewed`                                                                                                                                      | exit 0, 4 passed, termasuk CSV bounded dan JWT/browser/Hono/DB asli; `/tmp/ketik-d-browser-final-reviewed.log` |
| `pnpm typecheck --concurrency=1`                                                                                                                                                                                                                                                                                                                 | exit 0, 4/4; `/tmp/ketik-d-typecheck-final.log`                                                                |
| `pnpm lint --concurrency=1`                                                                                                                                                                                                                                                                                                                      | exit 1; web 2 error/73 warning, API 8 warning; `/tmp/ketik-d-lint-final.log`                                   |
| `pnpm build --concurrency=1`                                                                                                                                                                                                                                                                                                                     | **Belum dijalankan untuk D**: fail-fast pada lint/STOP scope. Build hijau B.2 bukan bukti build D.             |
| Impeccable detector pada history/index/landing overview/review stage                                                                                                                                                                                                                                                                             | exit 0, `[]`; `/tmp/ketik-d-impeccable.json`. Screenshot/focus/target diverifikasi terpisah.                   |

Artifact E2E di `apps/web/test-results/` ignored; trace dapat membawa auth lokal, jangan commit. Proses tool sesi sebelumnya sudah tidak tersedia saat resume; status direkonsiliasi dari log lengkap dan artifact yang masih ada. Tidak menjalankan ulang gate hijau untuk merekonstruksi handle proses.

#### STOP saat resume sebelumnya (diselesaikan pada penutupan D di bawah)

1. **Scope blocker:** `apps/web/src/routes/dashboard/home/AgentHome.tsx:91` membaca `ketikClient.history.$get()` sebagai `KetikSessionHistoryItem[]`, lalu `(ketik.value ?? []).map(fromKetik)` pada baris 109. Kontrak D adalah objek `KetikHistoryPage`, sehingga caller ini perlu diubah beserta fixture E2E. GET history tidak dapat kembali menjadi array/daftar transkrip terbatas tanpa melanggar kontrak D. File AgentHome tidak diedit (`git diff -- <path>` kosong). Proposal kecil hanya disimpan di `/tmp/ketik-d-agenthome-proposal.patch`, belum diterapkan atau diuji. Instruksi terbaru melarang perubahan modul non-KETIK. Ini memenuhi STOP condition: **"Perbaikan memerlukan dependency/infrastruktur baru, perubahan scope modul lain, atau menyentuh dirty work milik sesi lain."**
2. **Gate blocker:** lint D gagal `no-empty-pattern` di `apps/web/e2e/ketik-history-api.spec.ts:133` dan `:273` (`async ({}, info)`). Ada dua warning baru cleanup ref pada `history.tsx:82` dan `hooks/useKetikHistoryPage.ts:119`; warning web menjadi 73 dari 71 sebelumnya. Tidak mengklaim lint hijau atau menyamarkannya sebagai warning lama. Perbaikan ini masih in-scope, tetapi implementasi dihentikan pada STOP scope sesuai instruksi terbaru.
3. **Urutan paket:** D belum memenuhi GREEN integrasi/final gates. **E tidak dimulai** dan seluruh checkbox E tetap pending. Build, final integration review serta Graphify update batch D ditunda, bukan diklaim lulus. Self-review D menemukan serta menutup isolasi akun, tetapi verdict integrasi tetap **BLOCKED** oleh caller AgentHome dan lint.

Titik lanjut setelah batas scope direkonsiliasi: selesaikan caller AgentHome beserta fixture E2E terkait, perbaiki dua error lint/warning baru, jalankan gate yang belum hijau saja, lalu update batch Graphify dan tutup D sebelum memulai E. Tidak ada commit/push/deploy, database/migration remote, atau worker remote.

Penutupan STOP: `supabase stop --project-id trainerssuperappvite` exit 0 (`/tmp/ketik-d-stop.log`), empat container project berhenti dan data tersimpan pada volume; tidak ada runner/Vite/worker task aktif. `git diff --check` exit 0. Hanya plan/index diubah pada turn resume; product code maupun caller non-KETIK tidak diedit. Working tree sebelumnya tetap utuh.

### D — lanjut 2026-10-16

User menyetujui rekomendasi menuntaskan D dan commit lokal sebelum E. Scope tambahan hanya `apps/web/src/routes/dashboard/home/AgentHome.tsx` dan `apps/web/e2e/home-agent.spec.ts`. Lane D; adapter repo trainers-superapp-tdd dibaca. Snapshot awal `/tmp/ketik-d-resume-before.txt`; seluruh dirty work A/C/B/D dipertahankan. RED memakai fixture page baru pada suite Beranda existing, kemudian perbaikan caller, lint/ref cleanup, root gates serial dan Graphify batch. Tidak ada implementasi E atau izin push/remote.

#### Penutupan D — integrasi dan gate

- RED Beranda menggunakan fixture kontrak page tanpa transkrip: `pnpm --filter @trainers/web exec playwright test home-agent.spec.ts --grep 'gabungan terbaru' --workers=1 --trace on --output test-results/ketik-d-home-red` exit 1. Kegagalan sah: `(ketik.value ?? []).map is not a function`, tabel riwayat tidak muncul. Log `/tmp/ketik-d-home-red.log`.
- GREEN memakai `ketikApi.getHistory({limit: SESSION_LIMIT})` (5 sesi) dan `KetikHistorySummaryItem`, lalu membaca `items`. Menghapus cast array lama; fetch KETIK/PDKT tetap paralel dengan `Promise.allSettled`, state kosong/gagal sebagian dipertahankan. Fixture Beranda mengikuti envelope pagination tanpa messages.
- Dua `no-empty-pattern` pada spec API diganti fixture request bernama `_request`; tidak mengubah assertion API. Cleanup replay/export memakai fungsi invalidasi yang sama saat setup/cleanup, mempertahankan fencing response dan membuang dua warning ref baru tanpa disable lint.
- `pnpm --filter @trainers/web exec playwright test home-agent.spec.ts ketik-history-browser.spec.ts --workers=1 --trace on --output test-results/ketik-d-integration-green` exit 0, **7 passed**. Mencakup Beranda, old deep-link/retry, search/pagination/replay/CSV dan pergantian akun. Tujuh trace diperiksa, tidak ada event `pageError`. Log `/tmp/ketik-d-integration-green.log`; trace ignored di `apps/web/test-results/ketik-d-integration-green/`.
- `pnpm lint --concurrency=1` exit 0, 4/4 (3 cache hit), web 71 warning/0 error dan API 8 warning/0 error. `pnpm typecheck --concurrency=1` exit 0, 4/4 (3 cache hit), termasuk compile E2E. `pnpm build --concurrency=1` exit 0, 3/3 (tanpa cache). Log `/tmp/ketik-d-resume-{lint,typecheck,build}.log`.
- **Thermo-nuclear self-review: PASS untuk penutupan D.** Caller/type boundary, query owner/projection/cursor, error path, invalidasi async dan CSV bounded ditelusuri. Tidak ada temuan material baru yang belum diselesaikan; tidak ada file produk melintasi 1.000 baris. Suite ketik-flow sudah 1.205 baris pada HEAD dan menjadi 1.572 pada checkpoint A/C/B/D; tidak dirombak dalam lanjutan kecil ini. Tidak ada reviewer independen atau subagent. React best practices mempertahankan fetch independen paralel dan memakai helper kanonik. Tidak ada perubahan layout/visual baru sehingga audit Impeccable D sebelumnya tetap evidence visual, bukan klaim rerun audit.
- Graphify query `AgentHome` menemukan caller dan dependency shell/type; source/rg tetap otoritatif. Context7 tidak diulang karena lanjutan hanya kontrak internal dan cleanup React, tanpa perubahan API eksternal/dependency. Checklist Supabase direview pada source history/RPC: owner dari backend, projection terkontrol, SECURITY INVOKER/service-role-only. Tidak menjalankan DB/CLI/migration/query baru dalam lanjutan ini.
- API 35/35, regresi browser 38/38 dan JWT/browser final 4/4 pada evidence D sebelumnya **tidak dijalankan ulang**; backend/schema tidak diubah dalam penutupan ini. Bukti tersebut tetap hasil pelaksanaan sebelumnya, terpisah dari E2E/gate baru di atas. Tidak ada non-E2E test dijalankan.
- Checkpoint mencakup seluruh dirty work KETIK A/C/B/D yang dipertahankan sejak awal, ditambah caller/fixture Beranda yang diizinkan. E tetap pending; tidak ada push, deployment, perubahan database remote atau provider berbayar.

- `GRAPHIFY_MAX_WORKERS=1 graphify update .` exit 0, cache ignored diperbarui sekali untuk batch D. Log `/tmp/ketik-d-resume-graphify.log`. Scoped Prettier check exit 0 pada lima file lanjutan dan plan/index/docs E2E; `git diff --check` dan `git diff --cached --check` exit 0. Snapshot path awal + dua path Beranda tepat sama dengan 65 path checkpoint; tidak ada path baru di luar scope, trace/auth/.env atau cache graph dalam index.

### E — kontrak teknis sebelum implementasi (2026-10-16)

Baseline checkpoint `63785527`, working tree bersih. User meminta lanjut E; izin commit checkpoint D tidak diperluas menjadi push/deploy/aktivasi worker remote. Implementasi E lokal mengikuti Lane D, trainers-superapp-tdd, Supabase, thermo-nuclear dan Impeccable untuk state UI yang berubah; proses berat serial tanpa subagent.

- Gunakan tabel job existing, tambah token lease UUID dan request UUID. RPC enqueue mengunci history lalu job, memverifikasi actor aktif dan scope di transaksi; request identik tidak mengantre ulang, active job tunggal. Request publik strict `{sessionId: UUID, requestId?: UUID, rerun?: boolean}`; workerId dari browser ditolak. Queued/processing mengembalikan HTTP 202, completed/failed idempoten HTTP 200. UI mengirim UUID per pemicu manual. Batas trainer lintas pemilik memakai opsi konservatif yang disarankan lewat pertanyaan opsional: hanya penerima assignment KETIK yang dikelolanya; admin seluruh sesi, agent/leader self. Tidak ada jawaban eksplisit baru untuk memperluas scope peserta umum. Matriks tersebut diuji sebelum final GREEN.
- Claim backend-only dengan `FOR UPDATE SKIP LOCKED`, lock order history lalu job konsisten. Token baru per claim/reclaim, increment attempt atomik, maksimum tiga attempt. Lease minimum 600 detik = dua timeout Gemini 180s + fallback OpenAI 120s + grace persist 120s; runtime mengikuti batas registry model dan tidak mengizinkan lease lebih pendek. Tidak ada transaksi selama provider berjalan. Worker serial, tanpa enqueue/review otomatis atas sesi yang belum diminta user.
- RPC publish memeriksa status/token/lease yang belum expired di bawah lock, lalu mengganti review/typos, skor/history dan status job dalam satu transaksi. Gagal pada langkah mana pun rollback seluruh publish. Rerun tidak mengubah skor/review/status history completed sampai publish sukses; failure job eksplisit dengan `previousKept=true`, hasil lama tetap terbaca. Legacy results jika tabel tersedia diperbarui di transaksi yang sama; tidak membuat tabel legacy baru.
- Polling read-only, memisahkan job queued/processing/failed dan hasil lama yang masih tersedia. Tidak mengubah lease expired/queue lama menjadi terminal gagal; worker bertanggung jawab reclaim/max attempts. Tidak ada client timeout 120 detik yang memalsukan kegagalan server. Kegagalan polling dan antrean ditampilkan jujur, tanpa progress persen buatan. Badge legacy berasal dari provenance database, bukan asumsi browser.
- Worker standalone opt-in `KETIK_REVIEW_WORKER_ENABLED=true`; poll interval tervalidasi, health loopback. SIGTERM/SIGINT menghentikan admission; tunggu active task dengan deadline bounded, bila belum selesai token dilepas/fenced sebelum exit atau lease menjadi recovery backstop bila DB gagal. SDK request yang telat tidak boleh publish setelah shutdown/reclaim.
- E2E memakai JWT/Hono/DB asli dan provider HTTP deterministik lokal. Worker diuji sebagai child process entrypoint produk, preload transport test-only mengalihkan HTTP provider ke loopback dan menolak egress lain. RED pertama: POST telah kembali 202 tanpa provider dipanggil sebelum worker hidup. Lanjut coverage duplicate, authorization, restart/reclaim/token lama, max retry, persist fail/old result, shutdown, RPC denial, rollback/reapply dan UI manual/legacy/queue/poll failure. Tidak ada non-E2E test.

#### E — implementasi dan evidence sebelum penutupan gate

- Route baru `ketik-reviews.ts` hanya enqueue, shared schema strict menolak workerId/actor dari browser. Runtime standalone tidak di-embed otomatis ke API; script `start:ketik-review-worker` hanya opt-in. Legacy HTTP worker retired 410. Worker concurrency satu, claim token per lease, attempt maksimum tiga, shutdown fencing/reclaim dan health loopback tanpa data sensitif.
- Migration dibuat lewat `supabase migration new ketik_durable_review_worker`, lalu SQL apply/iterasi/rollback/reapply hanya pada DB disposable melalui `/tmp/ketik-e-sql.py` ber-guard host loopback. Tidak memperbarui ledger CLI/remote. RPC enqueue/claim/settle/read memakai SECURITY INVOKER dan ACL service_role-only. Table SELECT lama dipersempit agar token tidak ikut terbaca owner JWT. Review/typo/skor/job serta legacy results (jika tabel ada) dipublikasikan satu transaksi. Rerun mempertahankan hasil published lama; missing-result dapat dipulihkan lewat retry manual baru.
- RED enqueue: `/tmp/ketik-e-enqueue-red.log`, exit 1, provider ditahan dan POST tidak kembali 202 tanpa worker; GREEN `ketik-e-enqueue-green`, 1 passed. RED worker entrypoint sebelum tersedia: `/tmp/ketik-e-worker-red.log`, exit 1; enam test worker pertama kemudian GREEN. Ini bukan klaim setiap invariant atomicity diuji pada kode lama; invariant tambahan dibuktikan melalui fault injection/DB nyata setelah implementasi.
- RED UI awal `/tmp/ketik-e-ui-red.log`: legacy label dan notice hasil rerun lama setelah reload belum ada. Satu kegagalan GREEN awal berasal dari dua mock status dengan prioritas salah; fixture diperbaiki. RED summary `/tmp/ketik-e-queue-summary-red.log` dan lost acknowledgement `/tmp/ketik-e-lost-ack-red.log` membuktikan landing tidak refresh setelah acceptance/poll confirmation. Callback update dipanggil hanya setelah backend mengonfirmasi queued/processing, menjaga hasil published saat rerun. Empat test UI final lulus.
- RED security `/tmp/ketik-e-token-red.log` membuktikan SELECT lease_token masih diizinkan JWT owner; GRANT kolom aman + REVOKE table SELECT memperbaikinya. `/tmp/ketik-e-null-lease-red.log` membuktikan settle menerima lease expiry NULL; `/tmp/ketik-e-claim-null-red.log` membuktikan parameter NULL bypass guard SQL. Guard eksplisit memperbaiki keduanya. `/tmp/ketik-e-missing-review-red.log` membuktikan retry sesi completed tanpa row hasil dilewati (200); enqueue sekarang mengantrekan recovery manual (202).
- RED health `/tmp/ketik-e-health-red.log`: active task melampaui usia lease masih healthy 200. Age bound sekarang menghasilkan 503, dan poll timestamp diperbarui sesudah cycle settlement sukses. Preload test-only memakai SIGUSR2 untuk memajukan clock child yang sedang menahan HTTP provider; tidak ada clock seam atau handler SIGUSR2 di produk. Tidak menunggu 600 detik dan tidak menurunkan batas lease produksi.
- `ketik-e-poll-race-red` justru exit 0 sebelum perubahan khusus; ini coverage tambahan yang sudah GREEN, **bukan** RED bug yang diperbaiki. Test menjaga completed result dari response polling terlambat.
- E API akhir (command di bawah) **13 passed**, termasuk duplicate trigger, concurrency DB claims, usage pemilik, active/expired/missing lease, SIGKILL/restart, worker lama masih hidup, maximum attempts, publication trigger failure mempertahankan review/typos/score lama, explicit retry, SIGTERM, disabled/invalid activation, health-age degradation, role/assignment/revocation, RPC denial semua role/anon, token SELECT denial, dan rollback/reapply dengan data published tetap ada. Tidak ada provider berbayar/egress provider nyata.
- DDL test sempat diikuti transient 500 pada RPC berikutnya; focused state case tanpa DDL lulus. Dokumentasi resmi PostgREST (Context7 `/postgrest/postgrest`) menjelaskan reload schema cache/debounce NOTIFY 100ms. Rollback/reapply dipindah ke akhir suite, dan readiness membutuhkan tiga respons API valid berturut-turut dalam batas 5 detik. Tidak menambah fallback/menyembunyikan 500 pada produk.
- Regresi API A/C/B/D + gate role: run awal 59 cases menghasilkan 55 passed, 2 failed, 2 skipped. Dua failure: schema cache D setelah reapply belum siap dan copy 404 berubah. D harness memakai bounded readiness, copy produk kembali memakai `KETIK_ERROR_MESSAGES.NOT_FOUND`. Rerun history/errors kemudian 9 passed + 1 assertion C stale (masih mengharapkan synchronous 200); assertion dialihkan ke enqueue 202 → worker claim nyata. Final C + E 15 passed; history D 5/5 hijau pada rerun. Project lain yang sudah hijau tidak diulang tanpa alasan. Tidak mengklaim satu run 59/59 hijau.
- Regresi browser besar berhenti pada nested dialog Pengaturan existing (element detached): 27 passed, 1 failed, 15 skipped. Focused rerun tanpa perubahan produk lulus, kemudian rerun focused Pengaturan + unassigned agent 2/2 lulus. Tidak memperbaiki/meringankan assertion atau timeout Pengaturan. Sisa empat file browser **14/14** lulus, termasuk JWT/Hono/DB/provider-transport asli chat → finish → review oleh runtime produk. UI E akhir **4/4** lulus setelah callback recovery terakhir. Ini verifikasi lintas run, bukan klaim satu run 44/44 hijau tanpa flake.
- Browser plugin + skill `browser` tidak tercantum pada host; menggunakan Playwright repo dengan guard hermetic/loopback dan artifact berulang. Empat screenshot queued/previous-kept 390px/1280px dibaca langsung, tidak overflow; button status retry >=44px dan Enter bekerja. Detector Impeccable pada ReviewStage/hook exit 0 `[]`; tidak ada audit ulang seluruh UI. Trace/report ignored berpotensi membawa JWT lokal dan tidak di-stage.
- Setelah E2E no-job/processing/missing-result/read-only setara lulus, satu unit legacy `ketik-review-lifecycle.test.ts` (3 cases) serta tepat dua entri manifest dihapus, bersama resolver `review-state.ts` yang tidak lagi dipakai runtime. Unit lain tidak ditambah/dijalankan/dihapus massal. Processor menolak missing claim token sebelum AI/persist; parameter opsional di signature mempertahankan compile inventory pemanggil legacy, tidak menyediakan jalur write tanpa token.
- **Thermo-nuclear self-review PASS untuk scope E**, tanpa subagent/reviewer independen. Route/service/runtime dibatasi per tanggung jawab, lock order konsisten history→job, request/lease boundary diperiksa, publish atomic, status read-only, dan DTO/ACL memisahkan token dari browser. Source produk tidak melintasi 1.000 baris; E API suite tetap di bawah 1.000. React best practices: tidak ada polling overlap otomatis, response attempt lama difence saat unmount/ganti sesi; fetch status → result memang dependent. Tidak ada dependency baru atau perubahan runtime modul lain; shared fixture accessMatrix hanya row KETIK review.
- Context7 Supabase RPC/ordering digunakan; changelog Supabase dibaca dari index resmi dan PostgreSQL SELECT locking dirujuk. Security advisors lokal sebelum/sesudah hanya melaporkan warning existing `public.set_updated_at` mutable search_path; fungsi E tidak dilaporkan. Legacy D5.1 global no-revoked-functions precondition sudah tidak cocok dengan RPC backend-only A/B/D sebelum E; tidak dijalankan/diperlemah, dan tidak memberi EXECUTE pengguna demi gate lama. Batas ini dicatat di architecture; harmonisasi inventory legacy terpisah dari E.

| Command / artifact                                                                                                                                                                                                                                                                     | Hasil aktual                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-review-worker-real-backend --workers=1 --max-failures=1 --trace on --output test-results/ketik-e-worker-verified`                                                                  | exit 0, 13 passed; `/tmp/ketik-e-worker-verified.log`                                              |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-review-worker-real-backend --project ketik-errors-real-backend --workers=1 --max-failures=1 --trace on --output test-results/ketik-e-api-final`                                    | exit 0, 15 passed sebelum tambahan edge guards akhir; C 5/5, E 10/10; `/tmp/ketik-e-api-final.log` |
| `E2E_KETIK_LIVE=1 pnpm --filter @trainers/web exec playwright test ketik-server-chat.spec.ts ketik-history-browser.spec.ts ketik-review-worker-browser.spec.ts ketik-session-browser.spec.ts --workers=1 --max-failures=1 --trace on --output test-results/ketik-e-browser-completion` | exit 0, 14 passed; `/tmp/ketik-e-browser-completion.log`                                           |
| `pnpm --filter @trainers/web exec playwright test ketik-review-worker-browser.spec.ts --workers=1 --max-failures=1 --trace on --output test-results/ketik-e-ui-final`                                                                                                                  | exit 0, 4 passed; `/tmp/ketik-e-ui-final.log`                                                      |
| `pnpm --filter @trainers/web exec playwright test ketik-flow.spec.ts --grep 'perubahan ditandai\|agent without assignment' --workers=1 --max-failures=1 --trace on --output test-results/ketik-e-settings-final`                                                                       | exit 0, 2 passed; `/tmp/ketik-e-settings-final.log` (grep actual memakai regex `perubahan ditandai | agent without assignment`) |
| `supabase db advisors --local --type security --level warn --output json`                                                                                                                                                                                                              | exit 0; 1 existing warning set_updated_at; `/tmp/ketik-e-advisors-final.json`                      |

Typecheck root awal gagal karena narrowing union `result.status` hilang dalam callback setter (TS2345). Perbaikan capture `const queueStatus` menjaga narrowing tanpa cast/perubahan runtime; log awal `/tmp/ketik-e-typecheck-initial.log`. Hasil root gates akhir dicatat setelah selesai, bukan diasumsikan dari gate D.

#### Penutupan E — gate dan artifact akhir

- `pnpm typecheck --concurrency=1` exit 0, 4/4 (3 cache hit), `/tmp/ketik-e-typecheck.log`.
- Lint pertama exit 1: sembilan `no-undef` pada preload E2E baru dan satu warning cleanup ref baru. Deklarasi global Node/browser ditambahkan hanya pada helper, dan invalidasi run dipakai bersama setup/cleanup hook tanpa disable rule. `pnpm lint --concurrency=1` final exit 0, 4/4 (3 cache hit); web 71 warning/0 error, API 8 warning/0 error existing. Log `/tmp/ketik-e-lint-final.log`.
- Build checkout macet saat Tailwind native membaca ancestor `/Users/nadindyta/Downloads/.gitignore`; diagnostic `cat` file tersebut juga timeout, sementara CSS repo dapat dibaca. Dua proses task dihentikan (exit 137), termasuk percobaan satu native thread. Tidak mengubah file pribadi di luar repo atau source/config build.
- `pnpm build --concurrency=1` pada `/tmp/ketik-e-build-snapshot` exit 0, 3/3, 24.589s; `/tmp/ketik-e-build-snapshot.log`. Salinan memakai semua source tracked/untracked in-scope dan dependensi/lockfile yang sama; perbandingan SHA-256 seluruh file source sebelum pembaruan status docs menghasilkan **0 mismatch**. Build ini membuktikan source saat ini, bukan bahwa masalah I/O ancestor checkout telah diselesaikan. Warning Vite existing `__dirname` tetap ada. Bundle browser tidak memuat identifier `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, atau `OPENAI_API_KEY` (ini pemeriksaan identifier, bukan audit secret menyeluruh).
- Artifact lama di folder output tidak lagi tersedia saat penutupan; hasil log lama dipertahankan, tetapi tidak mengklaim trace lama masih ada. Dua suite E direkam ulang pada source snapshot identik, output di luar checkout agar tidak tertimpa: command API final di atas dengan `--output /tmp/ketik-e-final-api-artifacts` exit 0, **13 passed (55.5s)**, log `/tmp/ketik-e-api-recorded.log`; command UI final dengan `--output /tmp/ketik-e-final-ui-artifacts` exit 0, **4 passed (47.5s)**, log `/tmp/ketik-e-ui-recorded.log`. Total 13 trace API dan 4 trace UI tersedia lokal; mengandung auth test dan tidak untuk commit/share publik.
- Empat trace UI tidak memuat event `pageError`. Tiga console resource 500 sesuai fault injection: dua GET status dan satu POST review lost acknowledgement; tidak ada error console tak terjelaskan pada empat trace tersebut. Screenshot queued/previous-kept tersedia ulang pada artifact UI.
- Catalog DB setelah rollback/reapply final: kelima fungsi E `prosecdef=false`, EXECUTE anon/authenticated=false, service_role=true; authenticated SELECT lease_token/request_id=false dan status=true. Fixture pengguna `ketik-worker-*`, job, serta fungsi fault injection semuanya 0. Tidak menjalankan non-E2E test atau guard legacy global yang sudah tercatat tidak kompatibel; tidak mengklaim CI penuh.

- `GRAPHIFY_MAX_WORKERS=1 graphify update .` exit 0; 15.763 nodes, 29.819 edges, 1.043 communities. Log `/tmp/ketik-e-graphify.log`; graph HTML dilewati karena >5.000 nodes (pesan tool), cache JSON/report updated dan tetap ignored. Tidak ada LLM extraction.
- Scoped Prettier check final exit 0 untuk route/service/runtime/hook/spec/helper/contract baru serta plan/index/docs E2E; `/tmp/ketik-e-format-final.log`. JSON manifests valid, rollback pair E ada, stale lifecycle entries sudah tidak ada; `git diff --check` exit 0. Hanya dua file superseded yang dihapus setelah coverage E2E setara.
- `supabase stop --project-id trainerssuperappvite` exit 0; `/tmp/ketik-e-stop.log`. Volume lokal disimpan; tidak ada task-owned Vite/Playwright/worker aktif. File environment salinan sementara dihapus; trace tetap lokal dengan auth test. E belum commit/stage/push/deploy, tidak ada perubahan schema/data/worker remote.

- Rekonsiliasi Git akhir: branch tetap `feat/ketik-integrity-resilience`, HEAD `6384c1e3` (merge timer/avatar #74), checkpoint `63785527` masih ancestor. Commit timer/avatar dipertahankan dan sudah termasuk source snapshot yang diverifikasi; executor E tidak membuat commit atau mengubah index.

### Commit lokal E

User memberikan instruksi eksplisit `commit` setelah penutupan E. Commit mencakup tepat perubahan E yang telah diverifikasi dan pembaruan status plan; tanpa push/deploy/migrasi remote. Tidak mengulang gate produk yang sudah lulus karena tidak ada perubahan runtime sejak verifikasi akhir.
