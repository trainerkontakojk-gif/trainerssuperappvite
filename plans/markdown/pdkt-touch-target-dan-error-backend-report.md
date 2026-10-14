# PDKT — laporan implementasi dan bukti

## Status

**Selesai, working tree belum di-commit.** Plan: [`pdkt-touch-target-dan-error-backend.md`](pdkt-touch-target-dan-error-backend.md). Basis `HEAD`: `d6c956f`. Plan menyebut Lane C; verifikasi memakai gate root yang lebih ketat karena perubahan serialisasi error provider menyentuh batas server/klien. Tidak ada commit, push, deployment, migration, reset, backfill, atau perubahan production.

## Akses bukti untuk Claude

Semua bukti ada di working tree yang sama, **bukan file sementara `/tmp`**:

- Laporan ini dan bagian **Hasil** pada plan adalah indeks permanen yang tidak diabaikan Git.
- Log lengkap dan screenshot: `plans/artifacts/pdkt-touch-target-dan-error-backend/`.
- Direktori artifact memang diabaikan `.gitignore` (`artifacts/`), tetapi tetap ada dan bisa dibaca Claude lewat Read/Bash lokal. Jangan mengandalkan `git diff` untuk menemukan artifact. Tidak di-force-add.
- Contoh: baca `plans/artifacts/pdkt-touch-target-dan-error-backend/final-pdkt-after-repair.log` atau buka `plans/artifacts/pdkt-touch-target-dan-error-backend/skenario-390-light.png`.

## Files / perubahan

- `apps/web/src/routes/pdkt/**`: seluruh **53** `min-h-11` diganti `min-h-[44px]`; `min-w-11` juga diganti. Kontrol lain yang terbukti kecil lewat E2E ikut diperbaiki: jeda ilustrasi, switch skenario, tutup dialog, filter kategori, mode email, select kategori/kesulitan, hapus penerima/karakter/lampiran, dan retry landing. Token global, root font, serta varian Button lintas modul tidak berubah.
- `apps/web/e2e/helpers/touchTarget.ts`: helper pengukuran hit area, termasuk label checkbox/radio. Menunggu animasi finite sebelum `getBoundingClientRect()` untuk menghindari false RED akibat skala masuk dialog; animasi infinite tidak ditunggu. Test lama tidak direfactor.
- `apps/web/e2e/pdkt-flow.spec.ts`: **13** test pengukuran, masing-masing menguji 390 dan 1280px, termasuk menu, bulk selection, keadaan gagal, editor karakter, dan lampiran skenario. Assertion overflow halaman tetap aktif.
- `packages/types/src/pdkt.ts`, `apps/api/src/services/pdkt/evaluation-service.ts`: konstanta/type kode error; kegagalan AI membawa kode melalui satu kelas error, catch hanya menulis kode. Konteks email tidak valid memakai `evaluation_failed`; output AI tidak valid memakai `ai_invalid_output`; kegagalan provider memakai `ai_unavailable`. Pesan asli tetap masuk log.
- `apps/web/src/routes/monitoring/components/PdktEvaluationPanel.tsx`, `apps/web/e2e/monitoring.spec.ts`: copy tetap untuk tiga kode, fallback aman untuk error legacy, dan tidak ada pesan error ketika null. Lima kasus browser diverifikasi.
- `apps/api/src/routes/pdkt/mailbox.ts`, `route-utils.ts`, `services/pdkt/mailbox-service.ts`: copy backend baru; mapper tetap mengenali frasa lama dan baru. HTTP/error.code tidak diganti. Review pemanggil menemukan endpoint sinkron `/pdkt/mailbox/evaluate` yang juga mengirim `result.error` mentah; endpoint itu kini mencatat pesan di server dan mengirim copy aman, dengan E2E RED→GREEN tersendiri.
- `apps/web/e2e/pdkt-evaluation-error-api.spec.ts`, `apps/web/playwright.api.config.ts`: spec real-backend dan project API tersendiri, agar env tidak bercampur antar-spec.
- `apps/api/src/__tests__/pdkt-mailbox-batch-route.test.ts`: hanya literal assertion `masuk kembali` diperbarui, **tidak dijalankan**. Hasil pencarian lain berada di test auth/Monitoring di luar scope; dibiarkan.
- `docs/modules.md`: kontrak kode error, copy, dan ukuran kontrol didokumentasikan.

## Tests — RED dan GREEN

Semua test perilaku yang ditambahkan adalah Playwright E2E, tanpa unit test baru. Seluruh perintah Playwright dijalankan serial dengan satu worker. Perintah berlog memakai wrapper `set -o pipefail; <perintah> 2>&1 | tee plans/artifacts/pdkt-touch-target-dan-error-backend/<nama-log>`.

| Tahap                                    | Perintah                                                                                                                                           | Exit / hasil                                                                                                              | Nama log                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| T1 RED awal                              | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'touch target 44px'`                                                        | 1; 10 gagal, 5 karena ukuran, 5 karena fixture mobile belum memilih email                                                 | `t1-red.log`                                    |
| T1 RED setelah fixture mobile diperbaiki | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'touch target 44px: (kotak masuk\|Pahami\|Tanggapi\|buat email\|lampiran)'` | 1; 5 gagal pada ukuran kontrol                                                                                            | `t1-workspace-red.log`                          |
| T1 GREEN awal                            | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'touch target 44px'`                                                        | 0; 10 lolos                                                                                                               | `t1-green-first.log`                            |
| T2 RED                                   | `pnpm --dir apps/web exec playwright test e2e/monitoring.spec.ts --grep 'PDKT evaluation error safe copy'`                                         | 1; 2 gagal pada copy, null lolos                                                                                          | `t2-red.log`                                    |
| T2 GREEN                                 | perintah T2 yang sama                                                                                                                              | 0; 3 lolos (kemudian diperluas menjadi 5 kasus)                                                                           | `t2-green.log`                                  |
| T3 RED kode tersimpan                    | `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 --project=pdkt-evaluation-errors-real-backend`             | 1; 1 gagal pada kode, 2 tidak dijalankan karena serial                                                                    | `t3-red.log`                                    |
| T3 RED copy 404                          | perintah T3 + `--grep 'missing email\|invalid JWT'`                                                                                                | 1; 1 gagal pada copy, 1 tidak dijalankan                                                                                  | `t3-copy-red.log`                               |
| T3 GREEN awal                            | perintah T3                                                                                                                                        | 0; 3 lolos                                                                                                                | `t3-green.log`                                  |
| T3 RED endpoint sinkron                  | perintah T3 + `--grep 'failed telaah'`                                                                                                             | 1; probe agent menerima 403, lalu fixture memakai trainer yang berwenang; RED berikutnya 502 dengan pesan provider mentah | `t3-sync-red.log`, `t3-sync-red-authorized.log` |
| T3 GREEN endpoint sinkron                | perintah T3                                                                                                                                        | 0; 3 lolos                                                                                                                | `t3-sync-green.log`                             |
| Repair RED                               | `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'touch target 44px: (landing gagal\|editor konsumen\|lampiran skenario)'`   | 1; 3 gagal pada ukuran 24,5–38,5px                                                                                        | `t1-repair-red.log`                             |
| Repair GREEN                             | perintah repair yang sama                                                                                                                          | 0; 3 lolos, kedua viewport                                                                                                | `t1-repair-green.log`                           |

Pemisah `\|` di tabel hanya escape Markdown; argumen grep yang dieksekusi memakai `|` biasa.

**Real backend:** JWT Supabase lokal nyata, mailbox fixture lokal, balasan lewat `submit_pdkt_mailbox_reply_with_outcome`, retry lewat router asli, polling row sampai `failed`, dan pembacaan status lewat API. API diimport dinamis setelah pin env loopback. Key AI hanya `e2e-only`; fetch guard memblokir provider sebelum egress. Error mencapai catch asli, bukan gagal sebelum penyimpanan. Tidak ada mock service/database.

**Batas pembuktian:** jalur provider gagal nyata menghasilkan `ai_unavailable`. Persistence `ai_invalid_output`/kegagalan save tidak dipicu secara terpisah; klasifikasinya direview pada source, dan copy ketiga kode diuji browser. JWT tidak valid dijawab middleware auth sebelum `pdktErrorMessage`, sehingga assertion copy `masuk kembali` tidak dipaksakan, sesuai pengecualian plan. Copy 404 dibuktikan API; copy idempotency/validasi/sesi direview pada source, bukan diklaim sebagai cabang real-backend yang sudah dipicu. Tidak ada unit test pengganti.

## Verifikasi akhir

**102 E2E lolos:** 83 PDKT + 13 Monitoring + 6 API. Monitoring/API tidak berubah pada repair ukuran kontrol terakhir; suite PDKT lengkap dan gate root dijalankan lagi setelah repair.

| Perintah persis                                                                                                                                                     | Exit / hasil                                                                                    | Log                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts`                                                                                                    | 0; **83 lolos** setelah repair (run sebelumnya 80 lolos)                                        | `final-pdkt-after-repair.log`      |
| `pnpm --dir apps/web exec playwright test e2e/monitoring.spec.ts`                                                                                                   | 0; **13 lolos**                                                                                 | `final-monitoring.log`             |
| `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --workers=1 e2e/pdkt-evaluation-error-api.spec.ts e2e/pdkt-mailbox-privacy-api.spec.ts` | 0; **6 lolos**                                                                                  | `final-api.log`                    |
| `pnpm typecheck --concurrency=1`                                                                                                                                    | 0; 4 task sukses, termasuk compile E2E web; setelah repair 3 cache hit dan web dieksekusi ulang | `final-typecheck-after-repair.log` |
| `pnpm lint --concurrency=1`                                                                                                                                         | 0; 0 error, 8 warning API + 80 warning web pada kode lama                                       | `final-lint-after-repair.log`      |
| `pnpm build --concurrency=1`                                                                                                                                        | 0; 3 task sukses; setelah repair API/Telefun cache hit, web dibangun ulang                      | `final-build-after-repair.log`     |
| `git diff --check`                                                                                                                                                  | 0                                                                                               | hasil tool, tanpa log terpisah     |
| `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                                                                                          | 0; graph lokal diperbarui setelah repair                                                        | `graphify-update-after-repair.log` |

Perintah API berbeda dari contoh T6 karena konfigurasi browser mengabaikan `*-api.spec.ts`. Tidak mengubah suite default atau suite-list unit.

## Review

### Thermo-nuclear — self-review, bukan reviewer independen

**Verdict: PASS.** Diff lengkap dan file baru dibaca ulang; jalur service → persistence → API → Monitoring ditelusuri. Tidak ada P1/P2 tersisa pada scope. Temuan kontrol dalam keadaan tambahan diperbaiki dengan RED→GREEN, bukan ditebak dari kelas. Tidak ada perubahan skor, retry delay, klaim/lease, RLS, schema, business logic frontend, atau log usage. Pertumbuhan spec PDKT yang sudah besar disengaja: plan secara eksplisit meminta test di suite pemilik dan melarang refactor test lama.

### Impeccable — scope perubahan ukuran kontrol

**Verdict: PASS.** Dua belas screenshot Chromium (390/1280 × light/dark × landing/kotak masuk/pengaturan) diinspeksi. Tidak ada page overflow, footer dialog bertumpuk, atau regresi tata letak yang terlihat. Tab pengaturan mobile tetap mempunyai scroll internal seperti sebelumnya. Ini emulasi viewport, bukan pembuktian perangkat fisik/gesture sentuh.

- Capture: `pnpm --dir apps/web exec playwright test e2e/pdkt-flow.spec.ts --grep 'touch target 44px: (landing|kotak masuk|skenario)'` → exit 0, 3 lolos; `visual-capture.log`.
- PNG: `{landing,kotak masuk,skenario}-{390,1280}-{light,dark}.png` dalam direktori artifact.
- Contact sheet yang dibaca: `audit-landing.jpg`, `audit-kotak masuk.jpg`, `audit-skenario.jpg`.
- Detector: `/Users/nadindyta/.pi/agent/skills/impeccable/scripts/impeccable detect --json $(git diff --name-only -- apps/web/src)` → exit 0, `impeccable-detect.json` berisi `[]`. Detector dijalankan pada batch awal; repair terakhir direview pada source dan pengukuran E2E, bukan diklaim tercakup detector awal.

## Notes / operasional

- OrbStack diaktifkan setelah izin Fajar. Container lokal yang sudah ada pulih tanpa migration; auth health menjadi HTTP 200. Setelah verifikasi, `supabase stop` → exit 0; data disimpan pada Docker volume, tidak dihapus. Tidak ada Vite/Playwright/Graphify task-owned yang tertinggal.
- Graphify pertama dijalankan terlalu awal sebelum repair terakhir; CLI memakai default 4 worker AST internal (tanpa LLM/subagent). Setelah mengetahui itu, update batch repair dibatasi `GRAPHIFY_MAX_WORKERS=1`. Jadi ada **dua** update aktual, bukan mengklaim hanya satu. Cache graph tidak di-force-add.
- Kontras/typography dan navigasi lama tetap lolos dalam suite penuh. Warning Vite tentang `__dirname` serta warning lint lama tidak diperbaiki karena di luar scope.
- Tidak ada unit test yang dihapus/ditambah/dijalankan. Assertion unit copy lama yang diperbarui belum diverifikasi dengan runner unit, sesuai plan.
- Poin konsumen Monitoring, auto-backfill/auto-telaah legacy, dan copy `login kembali` di modul lain tetap di luar scope.
