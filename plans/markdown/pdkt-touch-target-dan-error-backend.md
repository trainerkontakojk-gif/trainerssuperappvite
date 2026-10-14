# PDKT: tombol 44px, kode error telaah, dan copy error backend

Plan untuk dikerjakan GPT 6.1 Sol. Ikuti `AGENTS.md` dan `docs/AGENT_WORKFLOW.md`. Muat `trainers-superapp-tdd` sebelum mengedit apa pun.

**Lane C.** Perubahan perilaku di `apps/web` (PDKT dan satu panel Monitoring), `apps/api` (layanan PDKT), dan `packages/types`. Tidak ada perubahan skema, RLS, atau migration. Kolom `pdkt_history.evaluation_error` tetap `TEXT`; yang berubah hanya isi yang ditulis.

Dibuat 2026-10-14 dari daftar sisa masalah PDKT di `main` (`d6c956f`). Nomor baris di bawah berasal dari commit itu. Lakukan drift-check dulu (T0).

## Latar belakang

Sisa masalah dari plan PDKT sebelumnya:

1. **Kontrol PDKT di luar Telaah masih di bawah 44px.** Root `html` berukuran 14px (`apps/web/src/index.css:250`), jadi `min-h-11` hanya setinggi 38,5px. Telaah sudah memakai `min-h-[44px]` (`pdkt-review-side-by-side.md`, bagian Audit follow-up), sedangkan bagian lain belum. Saat ini ada 53 pemakaian `min-h-11` di `apps/web/src/routes/pdkt`:

   | File                                                        | Jumlah |
   | ----------------------------------------------------------- | -----: |
   | `components/MailboxSidebar.tsx`                             |     10 |
   | `components/PdktLandingOverview.tsx`                        |      7 |
   | `components/settings/PdktConsumersTab.tsx`                  |      6 |
   | `components/settings/scenarios/ScenarioEditor.tsx`          |      6 |
   | `components/settings/scenarios/ScenarioList.tsx`            |      5 |
   | `components/SettingsModal.tsx`                              |      4 |
   | `simulation.tsx`                                            |      4 |
   | `components/EmailDetailPane.tsx`                            |      3 |
   | `components/ReplyComposer.tsx`                              |      3 |
   | `index.tsx`                                                 |      2 |
   | `components/CreateEmailModal.tsx`                           |      1 |
   | `components/EmailAttachments.tsx`                           |      1 |
   | `components/settings/scenarios/ScenarioRecipientsField.tsx` |      1 |

   Kontrol yang memakai `h-8`/`h-9`/`size-8`, atau `Button size="sm"`/`size="icon"` tanpa kelas tinggi, juga kurang dari 44px. Kontrol seperti ini harus ikut dicari.

2. **Telaah yang gagal menyimpan pesan error mentah.** `processPdktEvaluation` (`apps/api/src/services/pdkt/evaluation-service.ts:860-877`) menulis `err.message` ke `evaluation_error`. Isinya bisa teks provider AI (`response.error`, baris 609), teks internal ("Failed to save evaluation results"), atau pesan Inggris lain. Frontend PDKT sudah menyembunyikannya. **Panel Monitoring trainer masih menampilkannya apa adanya**: `apps/web/src/routes/monitoring/components/PdktEvaluationPanel.tsx:494-498` merender `{data.evaluation_error}`.

3. **Copy error backend PDKT masih kaku**, padahal glosarium di `pdkt-history-copy-slop-audit.md` sudah menetapkan penggantinya:
   - "Email mailbox tidak ditemukan." ada di `routes/pdkt/mailbox.ts:72`, `routes/pdkt/route-utils.ts:158`, dan `services/pdkt/mailbox-service.ts:50,91`.
   - "Sesi Anda telah berakhir. Silakan login kembali." ada di `route-utils.ts:144,166` dan `mailbox-service.ts:41`.
   - "Idempotency key digunakan untuk target berbeda." ada di `route-utils.ts` dan `mailbox-service.ts`.
   - "Data mailbox tidak valid." ada di `route-utils.ts`.

## Acceptance criteria

### A. Kontrol 44px

- A1. Pada viewport 390px dan 1280px, setiap kontrol interaktif yang terlihat di permukaan PDKT berikut minimal 44×44 CSS px. Kontrol interaktif mencakup `button`, `a[href]`, `[role=button]`, `[role=tab]`, `[role=checkbox]`, `[role=menuitem]`, `input[type=checkbox|radio]` beserta label yang membungkusnya, serta `select`/trigger combobox. Permukaannya:
  - landing `/pdkt`;
  - kotak masuk: sidebar beserta filter, bulk select, dan menu baris;
  - panel baca email (Pahami);
  - composer (Tanggapi);
  - dialog buat email;
  - lampiran;
  - dialog pengaturan: tab konsumen, daftar skenario, editor skenario, dan field penerima.
- A2. Teks inline di dalam paragraf, seperti tautan "Lihat catatan N" di Telaah yang sudah memakai area sentuh 44px lewat pseudo-element, tidak perlu diubah. Bila area sentuhnya diperluas dengan teknik non-layout, pengukuran memakai area sentuh itu, bukan kotak teks.
- A3. Tidak ada scroll horizontal di 390px, dan tata letak desktop tidak berubah selain tinggi kontrol.
- A4. Semua test di `apps/web/e2e/pdkt-flow.spec.ts` tetap hijau.

### B. Kode error telaah

- B1. `pdkt_history.evaluation_error` hanya berisi salah satu kode dari `PDKT_EVALUATION_ERROR_CODES`, atau `null`:
  - `ai_unavailable`: AI tidak merespons atau provider gagal setelah semua percobaan;
  - `ai_invalid_output`: AI merespons, tapi hasilnya tetap tidak valid setelah semua percobaan;
  - `evaluation_failed`: penyebab lain, misalnya gagal menyimpan atau klaim gagal.
- B2. Pesan asli tetap ditulis lewat `console.error` di server dan tidak pernah dikirim ke klien.
- B3. Panel Monitoring tidak pernah merender `evaluation_error` mentah. Kode dipetakan ke copy tetap:
  - `ai_unavailable` → "AI belum bisa dihubungi saat menelaah. Coba telaah ulang beberapa saat lagi."
  - `ai_invalid_output` → "Hasil telaah AI tidak lengkap. Coba telaah ulang."
  - `evaluation_failed` dan **semua nilai lain**, termasuk teks lama yang sudah tersimpan di production → "Telaah gagal. Coba telaah ulang."
- B4. Frontend PDKT tetap memakai copy "Telaah gagal" / "AI belum bisa menelaah balasan ini…" yang sudah ada. Tidak ada perubahan perilaku di sana.

### C. Copy error backend

- C1. "Email mailbox tidak ditemukan." → **"Email tidak ditemukan."**
- C2. "Sesi Anda telah berakhir. Silakan login kembali." → **"Sesi Anda telah berakhir. Silakan masuk kembali."** Ini hanya berlaku di `apps/api/src/routes/pdkt` dan `apps/api/src/services/pdkt`.
- C3. "Idempotency key digunakan untuk target berbeda." → **"Permintaan ganda terdeteksi. Muat ulang halaman."**
- C4. "Data mailbox tidak valid." → **"Data email tidak valid."**
- C5. Kode HTTP dan `error.code` tidak berubah. Pencocokan string masuk di `pdktErrorMessage` (misalnya `msg.includes("mailbox tidak ditemukan")`) harus tetap mengenali pesan lama dan pesan baru. Pesan Postgres atau RPC lama masih bisa memuat frasa lama.

## Di luar scope

- Copy "login kembali" di modul lain, termasuk `apps/web/src/routes/monitoring/utils/formatting.tsx:144`, KETIK, dan Telefun.
- Tampilan Poin konsumen di Monitoring, telaah ulang otomatis untuk telaah lama, dan backfill data.
- Mengubah kolom `evaluation_error` menjadi enum atau constraint di database.
- Menghapus atau menjalankan unit test lama. Lihat "Unit test lama" di bawah.
- Tombol di modul selain PDKT, kecuali `PdktEvaluationPanel` untuk B3.

## Design

### A. Ukuran kontrol

- Pola yang dipakai adalah pola Telaah: `min-h-[44px]`, ditambah `min-w-[44px]` untuk tombol ikon. Jangan mengganti token global, jangan mengubah varian `Button` di `components/ui` karena dipakai lintas modul, dan jangan mengubah ukuran root font.
- Ganti semua `min-h-11` di `apps/web/src/routes/pdkt/**` dengan `min-h-[44px]` (dan `min-w-11` dengan `min-w-[44px]`). Setelah itu cari kontrol yang belum punya tinggi minimum (`h-8`, `h-9`, `size-8`, `size-9`, `Button size="sm"`/`"icon"`) di file yang sama. Biarkan hasil pengukuran E2E yang menentukan mana yang perlu diubah; jangan menebak dari kelas saja.
- Checkbox kecil boleh tetap 16px secara visual selama label atau pembungkusnya yang bisa diklik berukuran 44×44.
- Helper E2E baru `apps/web/e2e/helpers/touchTarget.ts`:
  - `findTargetsBelow(page, rootLocator, min = 44)` mengembalikan daftar `{ name, width, height }` untuk kontrol interaktif yang terlihat (selector seperti di A1) dengan `getBoundingClientRect()` < `min`.
  - Lewati elemen `aria-hidden`, `disabled` yang tidak terlihat, dan tautan inline di dalam `p`/`li` yang memang bagian dari kalimat (A2).
  - Assertion memakai `expect(findings).toEqual([])` supaya pesan gagal menyebut kontrol yang bermasalah.
  - Test lama yang mengukur 44px secara inline (`pdkt-flow.spec.ts` sekitar baris 2103, 2183, 2277, 2687) boleh tetap seperti sekarang. Jangan refactor test lama.

### B. Kode error

- `packages/types/src/pdkt.ts`: tambahkan
  ```ts
  export const PDKT_EVALUATION_ERROR_CODES = [
    "ai_unavailable",
    "ai_invalid_output",
    "evaluation_failed",
  ] as const;
  export type PdktEvaluationErrorCode =
    (typeof PDKT_EVALUATION_ERROR_CODES)[number];
  ```
- `evaluateAgentResponse` (`evaluation-service.ts`, return gagal sekitar baris 711-719): tambahkan `errorCode` pada hasil gagal. Isinya `"ai_invalid_output"` bila `lastError instanceof InvalidPdktEvaluationResponseError`, selain itu `"ai_unavailable"`. Field `error` (pesan) tetap ada untuk log dan pemanggil lain. Cari semua pemanggil `evaluateAgentResponse` dengan Graphify dan `grep`, lalu pastikan tidak ada yang meneruskan `error` ke klien.
- `processPdktEvaluation`: bawa kode itu sampai ke `catch`. Pilih satu cara, misalnya kelas kecil `PdktEvaluationFailure extends Error { code }` yang dilempar pada baris 818-820. Di `catch`, tulis `evaluation_error: err instanceof PdktEvaluationFailure ? err.code : "evaluation_failed"`. Jangan membuat dua jalur paralel.
- Periksa semua penulis `evaluation_error` lainnya dengan `grep -rn "evaluation_error" apps/api/src` dan `supabase/migrations` (RPC atau trigger). Penulis lain yang menyimpan teks bebas harus ikut memakai kode, atau dilaporkan bila letaknya di SQL. Migration ada di luar scope, jadi hentikan pekerjaan dan laporkan bila temuan ini ada.
- `PdktEvaluationPanel.tsx`: ganti render mentah dengan fungsi kecil `pdktEvaluationErrorCopy(value: string | null)` sesuai B3. Letakkan di file utilitas Monitoring yang sudah ada (misalnya `monitoring/utils/formatting.tsx`) atau di komponen itu sendiri bila hanya dipakai di sana.

### C. Copy

- Ubah literal di empat file backend PDKT. Di `pdktErrorMessage`, cabang pencocokan masuk tetap menerima `mailbox tidak ditemukan` (frasa lama) dan `email tidak ditemukan`.
- `apps/web/e2e/pdkt-flow.spec.ts:1372` memakai "Email mailbox tidak ditemukan." sebagai **contoh teks server mentah** yang harus disembunyikan frontend. Biarkan test itu apa adanya, karena maknanya tetap benar.

## Tasklist

- [x] **T0 — Persiapan.**
  - Baca `AGENTS.md`, `docs/AGENT_WORKFLOW.md`, dan `docs/e2e-testing.md`.
  - Drift-check semua file dan baris di atas terhadap `HEAD`. Bila berbeda material, berhenti dan laporkan.
  - Query Graphify untuk pemanggil `evaluateAgentResponse`, `processPdktEvaluation`, `pdktErrorMessage`, dan `PdktEvaluationPanel`.
  - Patuhi aturan satu run: hanya satu Playwright atau dev server pada satu waktu. Jangan menjalankan suite default.
- [x] **T1 — RED E2E, kontrol 44px.** Buat helper `touchTarget.ts`, lalu tambahkan test di `pdkt-flow.spec.ts` dengan pola hermetic yang sudah ada (`openWorkspace`, `pdktMocks`, dan seterusnya). Buat satu test per permukaan di A1, dan untuk setiap test jalankan `for` di dalam test atas viewport 390 dan 1280. Jalankan dengan `--grep`, lalu pastikan test gagal karena ukuran kontrol, bukan karena fixture.
- [x] **T2 — RED E2E, Monitoring.** Di `apps/web/e2e/monitoring.spec.ts`, tambahkan tiga test berdasarkan fixture sekitar baris 191:
  1. `evaluation_error: "ai_unavailable"` → copy B3 tampil;
  2. `evaluation_error: "TypeError: fetch failed at https://generativelanguage..."` → copy "Telaah gagal. Coba telaah ulang." tampil dan teks mentah tidak ada di halaman;
  3. `evaluation_error: null` → tidak ada teks error.

  Jalankan, lalu konfirmasi bahwa test 1 dan 2 gagal.

- [x] **T3 — RED E2E real-backend, kode error dan copy.** Buat `apps/web/e2e/pdkt-evaluation-error-api.spec.ts` dengan pola `pdkt-mailbox-privacy-api.spec.ts`: app in-process, Supabase lokal, `installLoopbackFetchGuard`, dan key AI `e2e-only`.
  1. Siapkan mailbox dan balasan lewat RPC `submit_pdkt_mailbox_reply_with_outcome`. Panggil route telaah ulang (`history.ts` sekitar baris 169) sebagai pemilik. Poll `pdkt_history` dengan admin client sampai `evaluation_status = "failed"`, dengan batas waktu yang cukup untuk `retryDelaysMs`. Assert bahwa `evaluation_error` termasuk dalam `PDKT_EVALUATION_ERROR_CODES` dan tidak memuat `e2e-only`, `fetch`, `http`, atau teks Inggris mentah.
  2. `GET /pdkt/mailbox/<uuid acak>` sebagai agent → 404 dengan `error.message === "Email tidak ditemukan."`
  3. Request dengan JWT kedaluwarsa atau tidak valid ke route PDKT yang melewati `pdktErrorMessage` → pesan memuat "masuk kembali", bukan "login". Bila middleware auth menjawab lebih dulu dengan pesan generik, hapus assertion ini dan catat di laporan. Jangan memaksakan test ini.

  Jalankan dengan target lokal dan pastikan semuanya gagal pada assertion produk. Bila jalur pemicu telaah tidak sampai ke `catch` di `processPdktEvaluation`, misalnya karena gagal lebih awal saat resolusi model, **berhenti dan laporkan ke Fajar** dengan usulan alternatif terkecil. Jangan menambah unit test tanpa izin.

- [x] **T4 — GREEN.** Implementasikan A, B, dan C sesuai Design. Jalankan ulang ketiga grep RED sampai hijau.
- [x] **T5 — Review.** Jalankan `thermo-nuclear` atas seluruh diff dan perbaiki semua P1/P2. Jalankan audit `impeccable` untuk perubahan ukuran kontrol: cek screenshot 390 dan 1280, terang dan gelap, di landing, kotak masuk, dan pengaturan.
- [x] **T6 — Verifikasi akhir, satu run per perintah.**
  - `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts`
  - `pnpm --dir apps/web exec playwright test e2e/monitoring.spec.ts`
  - `pnpm --dir apps/web exec playwright test e2e/pdkt-evaluation-error-api.spec.ts e2e/pdkt-mailbox-privacy-api.spec.ts`
  - `pnpm typecheck --concurrency=1`, `pnpm lint --concurrency=1`, `pnpm build`
  - `git diff --check`
  - `graphify update .` sekali di akhir
- [x] **T7 — Laporan.** Isi bagian "Hasil" di bawah: perintah persis, exit code, dan jumlah test. Jangan commit atau push kecuali Fajar memintanya.

## Unit test lama (jangan dijalankan)

- `apps/api/src/__tests__/pdkt-mailbox-batch-route.test.ts:451` mengharapkan "Silakan login kembali.". Ganti literalnya ke copy baru supaya tidak makin basi, tapi jangan jalankan suite itu. Catat di laporan bahwa assertion ini tidak diverifikasi.
- Cari literal lama lainnya dengan `grep -rn "Email mailbox\|login kembali\|Idempotency key" apps/api/src/__tests__ apps/web/src/__tests__`. Perlakukan dengan cara yang sama dan catat semuanya.
- Jangan menambahkan unit test, dan jangan memasukkan apa pun ke `scripts/test-core.json` atau `scripts/test-fast.json`.

## Risiko

- **Retry AI membuat T3 lambat.** Gunakan batas poll yang wajar. Jangan mengubah `retryDelaysMs` hanya demi test.
- **Tinggi 44px bisa menggeser tata letak padat** seperti baris kotak masuk dan footer dialog. Periksa di 390px.
- **Teks lama di production** masih berupa pesan mentah. B3 menangani ini lewat fallback "Telaah gagal. Coba telaah ulang.", jadi tidak perlu backfill.

## Hasil

### Hasil akhir — selesai, belum di-commit

**102 E2E lolos:** 83 PDKT, 13 Monitoring, 6 API. Typecheck, lint, build serial, dan `git diff --check` semuanya exit 0. Lint masih memiliki warning lama; tidak ada error. Tiga belas test pengukuran kontrol menguji masing-masing viewport 390px dan 1280px, termasuk keadaan gagal dan editor/lampiran tambahan yang ditemukan saat review.

Laporan lengkap dengan perintah persis, exit code, batas pembuktian, temuan review, dan akses bukti untuk Claude: **[`pdkt-touch-target-dan-error-backend-report.md`](pdkt-touch-target-dan-error-backend-report.md)**.

Log RED/GREEN serta 12 screenshot ada di `plans/artifacts/pdkt-touch-target-dan-error-backend/`. Direktori ini diabaikan Git tetapi bisa dibaca Claude langsung di working tree. Laporan Markdown di atas tidak diabaikan Git. Tidak ada commit/push, migration, reset/backfill, atau perubahan production. Supabase lokal dihentikan setelah verifikasi tanpa menghapus data.

Catatan deviasi: command API menggunakan `--config=playwright.api.config.ts --workers=1` karena browser config mengabaikan spec API. Graphify aktual berjalan dua kali karena batch repair terakhir ditemukan setelah update awal; update final memakai satu worker AST. Semua rincian dan log ada di laporan.

### Checkpoint awal (historis) — BLOCKED pada prasyarat T0

Belum ada perubahan kode produk atau test. Tidak ada commit/push. Plan ini tetap belum di-commit dan bisa dibaca Claude langsung dari working tree.

**Drift-check:** `git rev-parse --short HEAD` → `d6c956f` (exit 0), sesuai basis plan. `rg -o 'min-h-11' apps/web/src/routes/pdkt | wc -l` → **53** (exit 0). Live code masih menyimpan pesan mentah di catch `processPdktEvaluation`, dan pemanggil runtime ditemukan di route mailbox/history. Penelusuran `evaluation_error` di API dan migration tidak menemukan penulis SQL teks bebas lain; migration hanya mendefinisikan kolom `TEXT`.

**Graphify:** query `evaluateAgentResponse`, `processPdktEvaluation`, `pdktErrorMessage`, dan `PdktEvaluationPanel` dijalankan (exit 0), lalu diperiksa silang dengan `rg` dan source hidup. Graph mengandung node legacy; live source menjadi acuan. Tidak menjalankan `graphify update .` karena kode belum berubah.

**Blocker lokal (bukan RED produk):**

- `docker ps --format '{{.Names}} {{.Status}}'` → exit **1**: socket `/Users/nadindyta/.orbstack/run/docker.sock` tidak ada; daemon Docker/OrbStack tidak aktif.
- Probe Python membaca hanya `SUPABASE_URL` dari `apps/api/.env.integration`, memvalidasi hostname loopback, lalu memakai `urllib.request.urlopen(url + '/auth/v1/health', timeout=5)` → exit **1**. Target `http://127.0.0.1:54321`; hasil `URLError: <urlopen error [Errno 61] Connection refused>`. Tidak mencetak key/JWT atau membaca database production.
- Pemeriksaan proses tidak menemukan Playwright/dev server aktif pada saat discovery.

**Prasyarat kelanjutan:** aktifkan Docker/OrbStack dan sediakan Supabase lokal disposable yang sesuai `.env.integration`. Jangan menjalankan migration/reset tanpa persetujuan Fajar. Setelah target lokal sehat, lanjutkan T1–T3 RED sebelum implementasi T4. Belum menjalankan E2E, unit test, typecheck, lint, build, atau audit visual.

**Catatan harness:** konfigurasi browser `playwright.config.ts` mengabaikan `*-api.spec.ts`. Spec T3 harus didaftarkan sebagai project tersendiri pada konfigurasi API dan dijalankan dengan `--config=playwright.api.config.ts --workers=1`; perintah T6 API tanpa `--config` tidak akan menjalankan spec tersebut. Ini mengikuti `docs/e2e-testing.md`, bukan alasan untuk melemahkan pembuktian.

