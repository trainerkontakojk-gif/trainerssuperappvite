# PDKT: jangan kirim error mentah dari pembuatan template dan email konsumen

Plan untuk dikerjakan GPT 6.1 Sol. Ikuti `AGENTS.md` dan `docs/AGENT_WORKFLOW.md`. Muat `trainers-superapp-tdd` sebelum mengedit apa pun.

**Lane C.** Perubahan perilaku backend di `apps/api` (layanan dan route PDKT) dengan pembuktian E2E real-backend. Tidak ada perubahan skema, RLS, migration, bentuk respons API, kode HTTP, atau `error.code`. Yang berubah hanya isi `error.message` pada jalur gagal.

Dibuat 2026-10-14 di atas `main` `751bbd5`, sebagai lanjutan [`pdkt-touch-target-dan-error-backend.md`](pdkt-touch-target-dan-error-backend.md). Plan itu sudah menutup kebocoran yang sama di `/pdkt/mailbox/evaluate` dan `evaluation_error`. Nomor baris di bawah berasal dari `751bbd5`. Lakukan drift-check dulu (T0).

## Latar belakang

Tiga route di `apps/api/src/routes/pdkt/simulation.ts` meneruskan `result.error` dari layanan ke klien lewat `jsonAiError` (HTTP 502, `code: "AI_ERROR"`):

| Route                          | Baris | Sumber `result.error`                                                                        |
| ------------------------------ | ----: | -------------------------------------------------------------------------------------------- |
| `POST /pdkt/generate-template` |    84 | `generateScenarioEmailTemplate` (`services/pdkt/session-service.ts:86`)                      |
| `POST /pdkt/session/init`      |   151 | `initializeEmailSession` (`session-service.ts:240`)                                          |
| `POST /pdkt/session/create`    |   236 | `createMailboxSession` → `initializeEmailSession` (`services/pdkt/mailbox-session.ts:77-84`) |

Isi `result.error` terbagi dua jenis:

- **Pesan kurasi** dalam bahasa Indonesia. Pesan ini aman dan berguna, jadi **tetap dikirim**. Contohnya:
  - "Template masih mengandung placeholder: …" (`session-service.ts:109`, `:199`, `:277`);
  - "Hasil template terlalu pendek/panjang …" (`:206`) dan "… melanggar aturan nama …" (`:213`);
  - "Email awal masih melanggar …" (`:371`) dan "Email awal terlalu pendek/panjang …" (`:378`);
  - "Skenario tidak ditemukan." (`:246`).
- **Pesan mentah** dari blok `catch` umum. Pesan ini **bocor**:
  - `generateScenarioEmailTemplate` `catch` (`:222-231`) mengembalikan `error.message` apa adanya.
  - `initializeEmailSession` `catch` (`:453-461`) mengembalikan `error.message` apa adanya, **tanpa log server**.

  Isinya bisa berupa teks provider AI, URL endpoint provider, nama model, atau error internal berbahasa Inggris. Di E2E real-backend, isinya berupa pesan fetch guard `[e2e guard] egress non-loopback diblokir: https://generativelanguage.googleapis.com/...`.

Ada juga kebocoran kecil yang serupa. `generate-template` dan `session/init` (`simulation.ts:62-72`, `:132-142`) mengirim `err.message` dari `resolvePdktGenerationConfig` lewat `jsonNotFound`. Saat ini satu-satunya `throw` di fungsi itu berupa teks tetap campuran Inggris, "Scenario atau consumer type tidak ditemukan." (`session-service.ts:493`). Meski begitu, error tak terduga lain di dalam fungsi itu tetap akan ikut bocor.

**Paparan.** UI PDKT hanya memakai `session/create` (`apps/web/src/routes/pdkt/simulation.tsx:750`), dan toast-nya sudah memakai copy tetap ("Email konsumen belum bisa dibuat. …"). Meski begitu, pesan mentah tetap terlihat di respons jaringan, dan `generate-template` serta `session/init` bisa dipanggil langsung oleh pengguna yang berhak (`apps/web/e2e/helpers/accessMatrix.ts:104-106`).

## Acceptance criteria

- AC1. Bila pembuatan template gagal karena error tak terduga (provider AI gagal, jaringan, atau parse), `POST /pdkt/generate-template` menjawab 502 `AI_ERROR` dengan pesan tetap **"AI belum bisa membuat template. Coba lagi beberapa saat lagi."**
- AC2. Bila pembuatan email konsumen gagal karena error tak terduga, `POST /pdkt/session/init` dan `POST /pdkt/session/create` menjawab 502 `AI_ERROR` dengan pesan tetap **"AI belum bisa membuat email konsumen. Coba lagi beberapa saat lagi."**
- AC3. Pesan kurasi yang tercantum di Latar belakang tetap dikirim persis seperti sekarang. Jangan mengubah teks, status, atau urutan pengecekannya.
- AC4. Pesan asli dari AC1 dan AC2 ditulis ke log server lewat `console.error`, termasuk jalur `initializeEmailSession` yang saat ini belum punya log.
- AC5. Respons gagal ketiga route tidak pernah memuat `http`, `fetch`, `egress`, `e2e-only`, atau nama model.
- AC6. Bila `resolvePdktGenerationConfig` gagal, `generate-template` dan `session/init` menjawab 404 `NOT_FOUND` dengan **"Skenario atau karakter konsumen tidak ditemukan."** Pesan ini tidak berasal dari `err.message`. Pesan dari `throw` di `session-service.ts:493` juga diganti dengan teks yang sama.
- AC7. Bentuk respons sukses, kode HTTP, `error.code`, dan `details.retryDraft` di `session/create` tidak berubah. Semua test di `apps/web/e2e/pdkt-flow.spec.ts` tetap hijau.

## Di luar scope

- Menghapus `generate-template` atau `session/init`. Keputusan Fajar (2026-10-14): kedua route dipertahankan; penghapusannya dievaluasi terpisah.
- Route modul lain (KETIK, Telefun) yang mungkin punya pola serupa. Catat temuannya di laporan saja.
- Copy toast frontend PDKT; isinya sudah aman.
- Unit test lama, termasuk `pdkt-settings-history-regression.test.tsx`: jangan dijalankan atau ditambah.

## Design

- **Satu tempat perbaikan, di layanan.** Ganti isi kedua blok `catch` umum di `session-service.ts`:
  - `generateScenarioEmailTemplate`: pertahankan `console.error("[PDKT] Template error:", error)`, lalu kembalikan `{ success: false, error: PDKT_TEMPLATE_AI_ERROR }`.
  - `initializeEmailSession`: tambahkan `console.error("[PDKT] Session init error:", error)`, lalu kembalikan `{ success: false, error: PDKT_SESSION_AI_ERROR }`.
  - Definisikan kedua konstanta copy di `session-service.ts`. Pakai juga sebagai fallback `|| "…"` di `simulation.ts:84`, `:151`, `:155`, `:236`, dan di `mailbox-session.ts:83`, menggantikan "Gagal generate template." / "Gagal inisialisasi sesi email." / "Gagal membuat sesi mailbox.".
  - Route tetap meneruskan `result.error`, karena setelah perubahan ini isinya selalu pesan kurasi atau konstanta tetap. Jangan menambahkan pemetaan kedua di route; satu jalur saja.
- **Periksa semua `return { success: false, error: … }` di kedua fungsi** dengan `grep`. Setiap cabang harus berupa literal kurasi, template literal dari data skenario sendiri (misalnya nama placeholder), atau konstanta baru. Cabang lain yang meneruskan `err.message` harus diganti. Ini termasuk `catch` lokal untuk gambar atau lampiran yang hasilnya mungkin ikut masuk `error` (`:426`).
- **AC6:** di `simulation.ts`, kedua `catch` `resolvePdktGenerationConfig` memakai literal "Skenario atau karakter konsumen tidak ditemukan." dan mencatat `err` di log. Ubah juga `throw` di `session-service.ts:493` dan fallback di `mailbox-session.ts:68-74` ke teks yang sama. Di `mailbox-session.ts`, pesan ini melewati `pdktErrorMessage`. Periksa bahwa mapper tidak menimpanya menjadi pesan generik. Bila ternyata ditimpa, tambahkan pencocokan di `pdktErrorMessage` yang mempertahankan teks ini, dan buktikan dengan E2E.

## Tasklist

- [x] **T0 — Persiapan.**
  - Baca `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, dan `docs/e2e-testing.md`.
  - Drift-check semua baris di atas terhadap `HEAD`. Bila berbeda material, berhenti dan laporkan.
  - Query Graphify untuk pemanggil `generateScenarioEmailTemplate`, `initializeEmailSession`, `createMailboxSession`, dan `resolvePdktGenerationConfig`. Pastikan tidak ada pemanggil lain yang bergantung pada isi `error` mentah.
  - Patuhi aturan satu run: hanya satu Playwright, dev server, atau Supabase lokal pada satu waktu.
- [x] **T1 — RED E2E real-backend.** Perluas `apps/web/e2e/pdkt-evaluation-error-api.spec.ts`. Ikuti polanya: Supabase lokal, app in-process, key AI `e2e-only`, dan `installLoopbackFetchGuard`, sehingga panggilan provider gagal secara nyata.
  1. `POST /pdkt/generate-template` sebagai trainer (capability `pdkt.templates.generate`) dengan body valid sesuai `generateEmailPromptSchema` → 502, `error` `toEqual({ code: "AI_ERROR", message: "AI belum bisa membuat template. Coba lagi beberapa saat lagi." })`.
  2. `POST /pdkt/session/init` sebagai agent dengan `scenarioDraft` dan `consumerTypeDraft` valid → 502 dengan pesan AC2.
  3. `POST /pdkt/session/create` sebagai agent → 502 dengan pesan AC2. Pastikan tidak ada baris `pdkt_mailbox_items` baru untuk `client_request_id` tersebut.
  4. Untuk ketiga respons, `JSON.stringify(body)` tidak cocok dengan `/http|fetch|egress|e2e-only|gemini|gpt/i`.
  5. `POST /pdkt/session/init` dengan `scenarioId` tak dikenal dan tanpa draft → 404 `NOT_FOUND` dengan pesan AC6.

  Jalankan dengan `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 --project=pdkt-evaluation-errors-real-backend`. Konfirmasi bahwa test gagal pada assertion pesan, bukan karena setup. Bila salah satu route gagal **sebelum** memanggil provider (misalnya karena validasi body atau resolusi model), betulkan fixture-nya. Fixture yang salah tidak dihitung sebagai bukti RED.

  Bila pesan kurasi (AC3) yang muncul alih-alih error provider, misalnya karena hasil AI kosong dianggap pelanggaran panjang, catat di laporan. Lalu cari pemicu yang benar-benar sampai ke `catch`. Bila tidak ada, berhenti dan tanya Fajar. Jangan menambah unit test tanpa izin.

- [x] **T2 — GREEN.** Implementasikan sesuai Design, lalu jalankan ulang perintah T1 sampai hijau.
- [x] **T3 — Review.** Jalankan `thermo-nuclear` atas diff dan perbaiki semua P1/P2. Pastikan juga semua cabang pesan kurasi (AC3) tidak berubah dengan membandingkan `git diff` pada literal-literal itu.
- [x] **T4 — Verifikasi akhir, satu run per perintah.**
  - `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 e2e/pdkt-evaluation-error-api.spec.ts e2e/pdkt-mailbox-privacy-api.spec.ts`
  - `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 --project=gate-stub`, sebagai run terpisah. `access-matrix-api.spec.ts` memanggil `session/init`, dan konfigurasi mewajibkan project ini terpisah dari project real-backend (`playwright.api.config.ts:6`).
  - `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts`
  - `pnpm typecheck --concurrency=1`, `pnpm lint --concurrency=1`, `pnpm build --concurrency=1`
  - `git diff --check`
  - `graphify update .` sekali di akhir
  - `supabase stop` setelah selesai, tanpa menghapus data.
- [x] **T5 — Laporan.** Isi bagian "Hasil" di bawah: perintah persis, exit code, jumlah test, dan nama log di `plans/artifacts/pdkt-simulation-ai-error-copy/`. Jangan commit atau push kecuali Fajar memintanya.

## Risiko

- **Retry AI di pembuatan template dan sesi bisa membuat test lambat.** Gunakan timeout test yang cukup. Jangan mengubah logika retry demi test.
- **Pesan kurasi bisa ikut tertimpa** bila konstanta baru dipasang di route, bukan di layanan. Design sengaja menaruhnya di `catch` layanan.
- **`createMailboxSession` punya jalur non-AI** (gagal simpan → `retryDraft`) yang sudah melewati `pdktErrorMessage`. Jangan ubah jalur itu; AC7 menjaga `details.retryDraft`.

## Hasil

### Status

**Selesai, belum di-commit.** HEAD saat mulai tetap `751bbd5`, sesuai plan; tidak ada drift material. Dirty tree awal hanya plan ini, dan isi requirement/design dipertahankan. Pelaksana menggunakan **Lane D** untuk hardening batas error server/klien (lebih ketat dari label C di plan), tanpa memperluas scope atau mengubah kontrak bentuk respons.

### Files

- `apps/api/src/services/pdkt/session-service.ts`: dua konstanta copy AI; catch template memakai konstanta; catch email konsumen kini mencatat error asli dengan `console.error` dan memakai konstanta; throw resolusi config memakai teks Indonesia tetap.
- `apps/api/src/services/pdkt/mailbox-session.ts`: kegagalan resolusi config dicatat di server dan dikembalikan sebagai literal tetap, bukan `err.message`; fallback AI memakai konstanta layanan. Seluruh blok persistence/save failure/retryDraft tidak berubah.
- `apps/api/src/routes/pdkt/simulation.ts`: dua catch resolusi config memakai literal tetap dan log; fallback memakai konstanta layanan. Route tetap meneruskan pesan kurasi `result.error`; tidak ada pemetaan AI kedua.
- `apps/api/src/routes/pdkt/route-utils.ts`: pencocokan **exact** untuk pesan skenario/karakter, agar `/session/create` tidak menimpanya menjadi pesan generik atau memantulkan error yang tidak dikenal.
- `apps/web/e2e/pdkt-evaluation-error-api.spec.ts`: tiga E2E baru di spec pemilik; masing-masing menguji tiga route. Fixture bersama, JWT nyata, key AI palsu, dan fetch guard lama dipakai ulang. Cleanup dibatasi pada `client_request_id` unik milik run ini.
- `docs/modules.md`: kontrak error pembuatan template/email dan keberadaan ketiga route dicatat.
- Plan ini: checklist dan hasil/evidence diisi. Tidak ada perubahan frontend, schema, RLS, migration, dependency, atau unit test.

### Bukti dan perintah

Semua log di **`plans/artifacts/pdkt-simulation-ai-error-copy/`**. Direktori artifact diabaikan Git, tetapi Claude bisa membaca file langsung pada working tree yang sama; plan ini menjadi indeks yang tidak diabaikan Git. Perintah berlog (kecuali suite browser) menggunakan `set -o pipefail; <perintah> 2>&1 | tee <direktori>/<log>`. Suite browser diarahkan ke log dan exit code aslinya dipropagasikan.

| Tahap                                  | Perintah persis                                                                                                                                                            | Exit / jumlah test                                                           | Log                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| RED provider                           | `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 --project=pdkt-evaluation-errors-real-backend --grep 'simulation creation errors'` | **1**, 1 gagal dengan enam assertion copy/leak gagal, meliputi ketiga route  | `t1-provider-red.log`                       |
| RED config                             | `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 --project=pdkt-evaluation-errors-real-backend --grep 'simulation config errors'`   | **1**, 1 gagal dengan tiga assertion copy gagal, meliputi ketiga route       | `t1-config-red.log`                         |
| Baseline kurasi sebelum implementasi   | `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 --project=pdkt-evaluation-errors-real-backend --grep 'curated placeholder errors'` | **0**, 1 lolos                                                               | `t1-curated-baseline.log`                   |
| GREEN                                  | `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 --project=pdkt-evaluation-errors-real-backend`                                     | **0**, 6 lolos                                                               | `t2-green.log`                              |
| API final                              | `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 e2e/pdkt-evaluation-error-api.spec.ts e2e/pdkt-mailbox-privacy-api.spec.ts`        | **0**, 9 lolos                                                               | `final-api.log`                             |
| Gate akses final, proses terpisah      | `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 --project=gate-stub`                                                               | **0**, 24 lolos                                                              | `final-gate-stub.log`                       |
| Browser PDKT final                     | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts`                                                                                                           | **0**, 83 lolos                                                              | `final-pdkt.log`                            |
| Typecheck root                         | `pnpm typecheck --concurrency=1`                                                                                                                                           | **0**, 4 task sukses; API/web dieksekusi, types/Telefun cache hit            | `final-typecheck.log`                       |
| Lint root                              | `pnpm lint --concurrency=1`                                                                                                                                                | **0**, 4 task sukses; 0 error, 8 warning API + 80 warning web pada kode lama | `final-lint.log`                            |
| Build root                             | `pnpm build --concurrency=1`                                                                                                                                               | **0**, 3 task sukses; API/web dieksekusi, Telefun cache hit                  | `final-build.log`                           |
| Diff check                             | `git diff --check`                                                                                                                                                         | **0**                                                                        | hasil tool; dijalankan lagi setelah laporan |
| Formatting file yang sebelumnya bersih | `pnpm exec prettier --check apps/web/e2e/pdkt-evaluation-error-api.spec.ts apps/api/src/routes/pdkt/simulation.ts apps/api/src/routes/pdkt/route-utils.ts`                 | **0**                                                                        | hasil tool                                  |
| Graphify final, sekali                 | `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                                                                                                 | **0**, satu worker AST, tanpa LLM                                            | `graphify-update.log`                       |
| Cleanup stack lokal                    | `supabase stop`                                                                                                                                                            | **0**, data dibackup pada volume lokal, tidak dihapus                        | `supabase-stop.log`                         |

**Total regresi final: 116 E2E lolos** (9 API + 24 gate akses + 83 PDKT). Semua runner/gate dijalankan serial; tidak ada worker/subagent tambahan.

T1 dibagi menjadi dua run RED terfokus agar kegagalan pertama pada suite serial tidak menyembunyikan bukti config. Assertion `expect.soft` mengumpulkan kegagalan copy ketiga route dalam satu kontrak E2E, tetapi status dan pemeriksaan database tetap hard assertion. Tidak ada test setup gagal yang dihitung sebagai RED.

### Pembuktian acceptance criteria

- **AC1/AC2/AC5:** ketiga panggilan memakai app Hono asli in-process, JWT Supabase lokal nyata, body valid dan `selectedModel` valid, serta key AI `e2e-only`. Trace RED melewati SDK/provider, `callAI`, dan fungsi generasi; respons ketiga route benar-benar `502 AI_ERROR` dengan URL provider/model mentah sebelum perbaikan. Fetch guard memblokir provider sebelum egress; bukan panggilan remote dengan key palsu, dan bukan mock layanan/database. GREEN mengecek copy persis dan seluruh body tidak cocok dengan `/http|fetch|egress|e2e-only|gemini|gpt/i`.
- Tidak ada row mailbox untuk `client_request_id` generasi yang gagal; query admin lokal memeriksa error query null dan hasil kosong **sebelum** assertion copy. Khusus `/session/create`, id tersebut diteruskan oleh schema ke layanan persistence.
- **AC3:** baseline dan GREEN membuktikan pesan placeholder persis sama pada ketiga route. Audit source membandingkan delapan assignment `error` literal/template-literal terhadap HEAD: semuanya identik. Cabang panjang/gaya tetap ada dalam urutan semula; tidak dipicu dengan AI sukses terpisah. Lihat `source-review.log`.
- **AC4:** log GREEN memuat satu `[PDKT] Template error:` dan dua `[PDKT] Session init error:` dengan pesan asli fetch guard; error tetap hanya di server. Prefix yang sama terlihat pada log API final. Tidak ada key/token nyata yang dimasukkan ke laporan.
- **AC6:** skenario tak dikenal diuji pada **semua tiga route**, bukan hanya init. Sebelum perbaikan, template/init mengirim campuran Inggris dan create mengirim copy generik; setelah perbaikan ketiganya `404 NOT_FOUND` dengan literal baru. Ini sekaligus membuktikan pencocokan mapper `/session/create`.
- **AC7:** status/code dan bentuk response tidak diubah; audit source membuktikan seluruh suffix `mailbox-session.ts` mulai `const inboundMessage = sessionResult.message` identik dengan HEAD, termasuk persistence, idempotency dan `retryDraft`. Suite PDKT penuh tetap hijau. Kegagalan simpan database tidak diinjeksi dalam E2E baru; tidak diklaim sebagai pembuktian runtime baru untuk cabang itu.

### Review

**Thermo-nuclear: PASS untuk scope perubahan.** Self-review lengkap diff, source, test, dan trace input → schema/auth → resolver → service → API/persistence. Security-focused review memeriksa bahwa catch umum tidak lagi meneruskan string/Error provider, mapper baru hanya mempertahankan literal yang dikenal, dan route tidak menimpa validasi kurasi. Tidak ada P1/P2 baru yang tersisa dalam scope. Ini bukan klaim reviewer independen atau audit seluruh modul.

- `source-review.log` mencatat literal kurasi dan blok save/retry yang identik dengan HEAD. Ini audit source/struktur, bukan unit test.
- File layanan/mailbox sebelumnya sudah tidak Prettier-clean; format legacy dipertahankan dan hanya blok milik task diedit. Spec baru serta route yang sebelumnya bersih diformat/check ulang.
- Catch gambar lokal tidak menulis `error` kegagalan generasi: ia mempertahankan keberhasilan email dan menulis `attachmentDiagnostics.message`. Field diagnostik sukses yang sudah ada tidak diubah; hardening field sukses itu dapat menjadi follow-up terpisah. Pembuktian AC5 di sini khusus respons generasi gagal, bukan klaim semua payload sukses bebas metadata provider.
- UI/audit visual tidak diperlukan karena tidak ada perubahan UI. Context7 dilewati karena kontrak/pemakaian API library eksternal tidak berubah. Tidak ada sinkronisasi Wiki remote.

### Operasional dan catatan

- `supabase start` exit **0**, memakai volume lokal yang sudah ada; health loopback `http://127.0.0.1:54321/auth/v1/health` HTTP **200**. Tidak menjalankan migration/reset. Log startup tidak disalin ke artifact karena status CLI dapat memuat kredensial lokal.
- Graphify dipakai untuk keempat simbol; hasil mencampur node facade legacy dengan source terurai. Query exact terhadap graph lokal dicatat dalam `graphify-callers.log` dan `graphify-exact-callers.log`, lalu diverifikasi memakai `rg`, import facade, dan source live. Tidak ada pemanggil runtime lain yang ditemukan di luar simulation route/mailbox session. Cache graph tidak di-force-add.
- Supabase dihentikan setelah selesai tanpa menghapus data; pemeriksaan proses tidak menemukan Vite/Playwright/Graphify task-owned tersisa. Tidak ada root `pnpm dev`, akses production, provider egress, commit, push, deploy, migration, backfill, unit test baru atau unit runner.
- Kedua route `generate-template` dan `session/init` tetap dipertahankan, sesuai keputusan Fajar. Tidak memindai/mengubah route KETIK atau Telefun dalam task ini.
