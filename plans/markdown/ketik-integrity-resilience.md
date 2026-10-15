# KETIK — integritas penilaian, ketahanan, dan riwayat

## Status

- Status: **DRAFT — plan saja, belum ada implementasi atau persetujuan migrasi/deploy.**
- Planned at: commit `309facd`.
- Prioritas: P1 untuk integritas; P2 untuk ketahanan dan riwayat.
- Effort: A kecil, B besar, C sedang, D sedang, E besar.
- Risiko implementasi: Lane D (RLS, schema, API, permission, dan AI billing).
- Dasar: audit statis lokal atas sembilan klaim laporan KETIK. Eksploitasi RLS dan performa database belum diuji.
- Tidak ada izin untuk commit, push, deployment, perubahan database remote, atau biaya provider nyata.

## Requirement

### Tujuan

1. Pengguna tidak dapat menulis skor/status penilaian langsung ke database.
2. Sesi baru memiliki skenario, model, waktu, dan transkrip yang dikuasai server.
3. Kegagalan AI, database, atau settings tampil jujur dengan pesan aman dan tindakan pemulihan.
4. Seluruh riwayat dapat diakses bertahap tanpa memuat transkrip pada daftar.
5. Telaah tidak bergantung pada umur satu HTTP request dan hasil lama tidak hilang saat telaah ulang gagal.
6. Pertahankan tampilan redesign, typed Hono RPC, atribusi peserta, template global, dan pencatatan penggunaan AI.

### Keputusan sebelum Paket B/E

Pembuatan plan tidak berarti keputusan berikut sudah disetujui. Catat jawaban Fajar di bagian ini sebelum mengimplementasikan paket yang bergantung padanya.

| Keputusan                | Rekomendasi                                                                                                                                                                                               | Status               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Pengaturan agen/leader   | Pisahkan preferensi pribadi dari pengelolaan skenario/model. Agen tidak membaca atau mengubah materi kasus yang dirahasiakan. Definisikan juga perilaku leader.                                           | Menunggu persetujuan |
| Sumber skenario agen     | Gunakan konfigurasi yang ditugaskan secara eksplisit oleh admin/trainer; jangan menganggap settings trainer otomatis global. Tentukan pemilik/penerima konfigurasi dan perilaku jika belum ada penugasan. | Menunggu persetujuan |
| Telaah sesi agen sendiri | Pertahankan manual dahulu untuk membatasi biaya. Tentukan siapa boleh memicu telaah milik agen; jika memilih otomatis, enqueue satu kali setelah sesi selesai.                                            | Menunggu persetujuan |
| Sesi lama                | Tetap dapat dibaca; tandai asal transkrip legacy. Jangan mengklaim transkrip lama terverifikasi server dan jangan menghitung ulang skor tanpa permintaan.                                                 | Menunggu persetujuan |
| Runtime worker           | Pilih proses worker persisten milik backend dengan antrean database yang sudah ada; tidak menambah broker/dependency. Host dan aktivasi perlu persetujuan operasional tersendiri.                         | Menunggu persetujuan |

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

1. Mulai sesi: backend memvalidasi subjek, memilih konfigurasi yang diizinkan dan skenario aktif, lalu menyimpan snapshot immutable berisi pemilik, subjek, skenario/karakter, model, durasi, dan waktu mulai/kedaluwarsa. Browser menerima ID sesi, identitas konsumen, status, serta data UI minimum; bukan skrip/deskripsi tersembunyi.
2. Kirim pesan: browser mengirim ID sesi, ID request idempoten, versi/urutan yang diharapkan, dan pesan agen saja. Backend memvalidasi ownership/status/urutan/expiry dan batas panjang, menyimpan pesan agen, menghasilkan balasan dari snapshot + transkrip database, lalu menyimpan balasan konsumen yang benar-benar ditampilkan.
3. Akhiri sesi: browser mengirim ID sesi, bukan transkrip atau skor. Finalisasi idempoten memakai transkrip tersimpan; telaah hanya membaca transkrip tersebut.
4. Simpan provenance/version untuk membedakan sesi baru dan legacy. Bentuk tabel final (tabel sesi baru atau perluasan history) ditentukan dalam kontrak schema sebelum implementasi; jangan membuat dua sumber transkrip aktif.
5. Tentukan transaksi dan claim per turn: kunci/versi database mencegah dua request memproses turn yang sama. Jangan menahan transaksi database selama memanggil provider. Kegagalan provider meninggalkan turn yang dapat dicoba ulang tanpa menggandakan pesan. Jangan menjanjikan exactly-once biaya provider jika provider tidak mendukung idempotensi.
6. Waktu dihitung server; browser tidak menentukan elapsed/remaining untuk prompt. Provider timeout dan kegagalan simpan setelah respons harus punya status eksplisit, bukan sukses palsu.
7. Hapus jalur tulis lama yang menerima seluruh transkrip untuk sesi baru. Endpoint generate lama tidak boleh menjadi bypass menggunakan draft/model bebas. Tentukan respons penolakan legacy yang jelas setelah frontend beralih.
8. Pisahkan endpoint/preferensi pribadi dari konfigurasi trainer sesuai keputusan. Cabut akses API, bukan hanya menyembunyikan tombol. Default skenario juga berasal dari shared package yang diimpor web: audit bundle/import dan endpoint `/scenarios`; memindahkan randomisasi saja tidak merahasiakan materi yang masih dibundel.
9. Tetap gunakan `logAiUsage()` melalui jalur provider yang ada, dengan userId pemilik dan UsageContext. Hindari pencatatan ganda; jangan mengubah pricing.

Tidak otomatis menambahkan akses lintas pemilik atau telaah otomatis. Jika dipilih, tulis matriks role/ownership dan batas biaya secara eksplisit sebelum GREEN.

### Paket C — error aman, model terpusat, settings fail-closed

**Prioritas P2; effort M; independen A/B.**

- Tetapkan kode error publik KETIK dan copy Bahasa Indonesia untuk gagal memuat settings, AI tidak tersedia/output invalid, sesi tidak ditemukan, simpan gagal, dan konflik settings. Pertahankan HTTP status yang benar; jangan menyamarkan semua kegagalan menjadi 404/200.
- Log detail teknis di backend tanpa token/transkrip sensitif; respons publik tidak membawa raw provider/database message, termasuk `data.error` dan status job. Error konflik/validasi terkurasi tetap boleh punya pesan spesifik yang aman.
- Ikuti pola `apps/api/src/routes/pdkt/route-utils.ts` dan `services/pdkt/mailbox-session.ts` untuk pemisahan log/detail publik; jangan mengubah PDKT.
- Pilihan model telaah primary/fallback berasal dari `apps/api/src/lib/ai-models.ts`; pertahankan perilaku model sekarang dan satu fallback, jangan mengganti biaya/semantik diam-diam.
- Pada halaman KETIK, tampilkan state settings loading/error/retry. Mulai simulasi dinonaktifkan sampai settings server berhasil. Backup localStorage tidak boleh menjadi sumber sesi baru secara diam-diam; hentikan fallback pada jalur KETIK atau kembalikan provenance eksplisit dan tetap blokir mulai sampai sinkron.
- Retry settings tidak memulai simulasi, tidak menimpa draft belum tersimpan, dan tidak mengubah identitas akun. Setelah B, sumber konfigurasi sesi tetap server.

### Paket D — pagination, detail terpisah, ringkasan akurat

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

- [ ] Jalankan `git rev-parse --short HEAD`, `git status --short`, dan `git diff --stat 309facd..HEAD -- apps/api/src/routes/ketik.ts apps/api/src/services/ketik apps/web/src/routes/ketik packages/types/src/ketik.ts packages/types/src/access.ts supabase/migrations`.
- [ ] Bandingkan live code dengan bukti di atas; pisahkan drift relevan dari dirty work yang tidak terkait.
- [ ] Baca `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, `docs/e2e-testing.md`, skill `trainers-superapp-tdd`, dan manifest workspace. Saat implementasi gunakan `thermo-nuclear`; gunakan `impeccable` untuk state UI yang berubah. Knowledge tools mengikuti matriks repo, bukan wajib untuk setiap edit.
- [ ] Pastikan database disposable loopback dan izin mutasi fixture/migration lokal tersedia. Jika belum, STOP dan minta izin/target; jangan memakai production atau mengganti dengan unit test.
- [ ] Tetapkan nama migration unik setelah melihat urutan schema terkini; setiap migration baru wajib rollback.

### 1. Paket A

- [ ] Buat `apps/web/e2e/ketik-integrity-api.spec.ts` dan project API dengan nama `ketik-integrity-real-backend`.
- [ ] RED: JWT pengguna nyata mencoba direct INSERT history dengan nilai penilaian; ekspektasi ditolak. Pastikan kegagalan sebelum fix benar-benar karena insert diizinkan, bukan auth/fixture rusak.
- [ ] GREEN: tambahkan migration policy dan rollback. Di database disposable saja, buktikan rollback mengembalikan perilaku lama lalu reapply mengembalikan proteksi.
- [ ] Verifikasi backend tetap menyimpan sesi sah; read owner berhasil, cross-owner ditolak, atribusi self/peserta tidak berubah. Buat fixture skor melalui admin lokal hanya untuk verifikasi, bukan jalur publik baru.

### 2. Paket C

- [ ] Tambahkan kasus error/settings pada `ketik-flow.spec.ts` dan spec baru `ketik-errors-api.spec.ts`, project `ketik-errors-real-backend`.
- [ ] RED: simulasikan kegagalan settings dengan/tanpa backup, provider gagal, missing session, dan database gagal. Assert copy aman, bukan string teknis, serta tombol mulai diblokir.
- [ ] GREEN: pusatkan model/error dan ubah settings load/retry tanpa menyentuh redesign.
- [ ] Verifikasi retry sukses membuka akses mulai, konflik settings tidak menimpa data, dan retry gagal tetap error. Periksa endpoint review/status/worker juga, bukan hanya generate.

### 3. Paket B (setelah keputusan)

- [ ] Catat keputusan dan kontrak schema/API, ownership, provenance, idempotensi, state turn, dan kompatibilitas legacy pada plan ini sebelum coding.
- [ ] Tambahkan `ketik-session-api.spec.ts`, project `ketik-session-real-backend`; RED untuk override transkrip/skenario/model, akses lintas pemilik, duplicate request, request paralel, urutan salah, expired/ended session, dan endpoint lama sebagai bypass.
- [ ] Implementasikan schema + backend + kontrak, kemudian alihkan frontend. Jangan mempertahankan dua jalur simpan aktif.
- [ ] Provider test memakai transport provider deterministik lokal pada batas HTTP, bukan men-stub service penilaian produk. Bukti database dan otorisasi harus nyata. Bila SDK tidak bisa diarahkan dengan aman, STOP untuk persetujuan seam test terkecil.
- [ ] Verifikasi satu alur browser nyata: mulai → beberapa pesan → provider failure/retry → akhiri → reload → transkrip database sama dengan tampilan → telaah menggunakan transkrip itu.
- [ ] Periksa payload settings/start/scenarios dan bundle untuk materi rahasia sesuai kebijakan. Update matriks akses dan dokumentasi sesi legacy.

### 4. Paket D

- [ ] Tambahkan `ketik-history-api.spec.ts`, project `ketik-history-real-backend`, dan kasus browser pada suite KETIK.
- [ ] RED: seed lebih dari 50 sesi, termasuk timestamp sama, lintas bulan WIB, lintas owner, completed/failed/processing. Sesi lama harus bisa dibuka lewat deep-link dan transkrip tidak boleh ada di respons daftar.
- [ ] GREEN: pagination/detail/summary/search/export dan indeks, kemudian hapus ketergantungan frontend pada daftar penuh.
- [ ] Verifikasi tidak ada duplikasi/lompatan untuk dataset stabil, bulan/five-review window benar, cursor rusak ditolak, detail cross-owner ditolak, CSV tidak diam-diam terpotong, dan error DB bukan `[]` sukses.
- [ ] Rekam ukuran payload dan query plan sebelum/sesudah pada fixture sama. Tetapkan target berdasarkan baseline; tidak membuat target latency absolut tanpa pengukuran.

### 5. Paket E

- [ ] Tambahkan `ketik-review-worker-api.spec.ts`, project `ketik-review-worker-real-backend`; worker diuji sebagai proses task-owned terhadap DB/provider lokal.
- [ ] RED: provider ditahan lokal, POST review harus sudah selesai sementara hasil belum tersedia. Uji enqueue ganda, restart/reclaim, lease hilang, retry maksimum, dan shutdown.
- [ ] GREEN: worker durable dan publikasi atomik. Jangan menyamakan respons enqueue sukses dengan hasil AI sukses.
- [ ] Verifikasi crash pada fase persist tidak menghapus review lama; rerun gagal mempertahankan skor/review/status lama secara konsisten; dua pemicu tidak membuat dua job aktif.
- [ ] Update polling/browser untuk antrean, progres, kegagalan, retry, dan hasil. Verifikasi manual/otomatis persis sesuai keputusan biaya/akses.
- [ ] Dokumentasikan prasyarat aktivasi worker dan rollback operasional; jangan men-deploy atau mengaktifkan remote.

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
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

Perintah di atas diverifikasi keberadaan script/config dasarnya saat planning, **belum dijalankan**. Project KETIK API merupakan deliverable baru; perintahnya belum tersedia sampai tasklist terkait dibuat. Terapkan migration hanya melalui harness lokal yang divalidasi, dengan kredensial tidak dicetak; jangan menyalin perintah deploy remote.

Jangan menjalankan `pnpm test`, Vitest, test:core/fast/full atau menambah unit test tanpa persetujuan Fajar. Bila E2E tidak dapat membuktikan invariant tertentu, jelaskan invariant dan minta pengecualian; jangan mengganti gate sendiri. Jangan menghapus unit test lama sebelum coverage E2E setara terbukti.

## Done criteria

Per paket: semua tasklist terkait selesai, RED yang relevan terekam, GREEN/relevant E2E lulus, root typecheck/lint/build lulus, migration/rollback lokal terbukti bila ada, diff direview, hanya path scope yang berubah oleh executor, dan status plan diperbarui dengan command/exit code/artifact.

Keseluruhan:

- [ ] Direct authenticated INSERT penilaian ditolak di DB disposable dengan grants/policy nyata.
- [ ] Sesi baru tidak menerima transkrip/konfigurasi otoritatif dari browser; legacy tidak dipromosikan sebagai terverifikasi.
- [ ] Akses agen/leader/trainer dan sumber skenario mengikuti keputusan tertulis; tidak ada bypass draft/model lama.
- [ ] Error publik aman; settings failure/backup tidak menjadi sukses diam-diam.
- [ ] Sesi ke-51+, deep-link, search/filter/CSV, dan summary bulanan tetap akurat; daftar tidak membawa messages.
- [ ] POST review tidak menunggu AI; worker restart/reclaim dan rerun gagal teruji tanpa kehilangan hasil lama.
- [ ] AI usage tetap tercatat dengan pemilik/konteks yang benar; tidak ada provider nyata dipanggil saat E2E.
- [ ] Trace/report Playwright dapat diulang pada target lokal; tidak ada perubahan remote.

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

Belum ada implementasi, E2E, typecheck, lint, build, atau migration yang dijalankan untuk plan ini. Isi bagian ini per paket saat implementasi dengan SHA, command, exit code, path artifact, keputusan, dan blocker yang benar-benar teramati.
