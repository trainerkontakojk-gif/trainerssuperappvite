# TNA Fase 1 — Laporan T0

## Status dan batas otorisasi

- Discovery T0 selesai terhadap rencana rev. 4; **belum merupakan izin T1**.
- Branch: `feat/tna-phase-1`, dibuat dari `main` lokal `956944d`.
- Baseline rencana: `9130d7d`. Tidak fetch/push/commit atau mengakses Supabase remote.
- T0 semula read-only. Fajar kemudian mengizinkan helper fixture sintetis lokal, beberapa periode/versi, akun admin/trainer melalui helper E2E, serta seed/cleanup. Perubahan hanya test tooling dan laporan; tidak ada edit produk atau migrasi.
- Implementasi TNA tetap Lane D. Verifikasi dalam laporan ini adalah prasyarat discovery/fixture, bukan gate implementasi TNA.

## S1 — Apakah `indicator_id` aman sebagai kunci parameter?

**Jawaban terbatas: aman untuk data persisted legacy-mapped yang diuji, tetapi bukan jaminan bahwa semua rule indicator dapat dicatat atau dibandingkan lintas versi.** Fixture sintetis tidak membuktikan kondisi database produksi.

Jalur kode saat rule indicator tidak memiliki legacy mapping:

1. `apps/api/src/routes/sidak/rule-versions.ts:346` menerima `legacy_indicator_id` opsional.
2. `apps/api/src/services/sidak/rule-versions.ts:499–507` memasukkan rule indicator tanpa membuat master `qa_indicators` atau mapping otomatis.
3. `apps/api/src/services/sidak/period-indicator.ts:168–180` mengembalikan `id: ri.legacy_indicator_id || ri.id`. Tanpa legacy, ID yang muncul adalah UUID snapshot rule indicator.
4. `apps/web/src/components/sidak/SidakInputManualForm.tsx:197–203` menggunakan ID pilihan itu sebagai `indicator_id`.
5. `apps/api/src/services/sidak/temuan-service.ts:195–203,245–253` memvalidasi `indicator_id` terhadap **qa_indicators**, bukan rule indicators. UUID snapshot yang tidak ada di master ditolak sebagai "Indikator tidak ditemukan di database".
6. `createTemuanBatch()` pada file yang sama (`:301–328`) tidak memasukkan baris invalid. Bila semuanya invalid, endpoint batch tetap mengembalikan HTTP 201 dengan `inserted: 0`; ini perilaku existing yang dikarakterisasi, **bukan** klaim keberhasilan penyimpanan.
7. Untuk item valid, service menyimpan `indicator_id: item.indicator_id` tanpa remapping. Dalam jalur batch yang diuji, `rule_version_id` terisi tetapi `rule_indicator_id` NULL.
8. Constraint database lokal yang diperiksa: `qa_temuan.indicator_id` FK ke `qa_indicators(id)`. Snapshot UUID tidak dapat menjadi nilai valid kecuali UUID tersebut juga memang ada di master.
9. Kloning versi dari versi sumber mempertahankan mapping lama atau NULL (`apps/api/src/services/sidak/rule-versions.ts:219–221`); UUID snapshot baru bukan identitas lintas versi yang stabil.

### Bukti runtime lokal

- Tiga periode, dua versi aturan, satu master indikator dengan dua snapshot mapped: seluruh 18 row seed memakai satu `indicator_id` master yang sama.
- Dua snapshot unmapped untuk parameter sintetis yang sama memiliki UUID berbeda dan NULL legacy mapping.
- Preview batch untuk snapshot unmapped: HTTP 200, valid 0, invalid "Indikator tidak ditemukan di database".
- Submit batch untuk snapshot unmapped: HTTP 201, inserted 0; tidak ada row QA dengan UUID tersebut.
- Submit untuk master mapped: HTTP 201, inserted 1; SQL read-after-write membuktikan master `indicator_id`, versi kedua, dan `rule_indicator_id` NULL.

### Keputusan yang masih diperlukan sebelum T1

Jangan mengganti kunci TNA dengan UUID snapshot atau menyatukan parameter berdasarkan nama secara otomatis. Rekomendasi: konfirmasikan bahwa Fase 1 membaca parameter persisted legacy-mapped saja, dengan keterbatasan SIDAK unmapped dicatat eksplisit. Bila Fajar menghendaki rule indicator unmapped juga bisa diaudit dan menjadi tren TNA, diperlukan rencana terpisah untuk canonical identity/mapping dan perbaikan jalur tulis SIDAK; jangan menyisipkan perbaikan itu diam-diam ke T1.

## S2 — JWT dan RLS

**Lulus terhadap fixture lokal.** Akun admin dan trainer dibuat melalui `createUserWithJwt()` dari `apps/web/e2e/helpers/sidakRealBackend.ts`, termasuk login Supabase nyata (bukan JWT yang ditandatangani manual).

Kedua JWT berhasil membaca semua row fixture di `qa_temuan` (18), `qa_periods` (3), dan `profiler_peserta` (6), dengan anon client + Authorization user JWT. Tidak ada service-role pada pembacaan yang membuktikan S2. Service-role hanya dipakai untuk setup/cleanup fixture lokal sesuai izin Fajar.

## S3 — Ekstraksi scoring

Secara statis cocok: `calculateQAScoreFromTemuan()` memakai trim `no_tiket`, fallback `__no_ticket_${created_at ?? period_id ?? i}`, dan konstanta sampling lokal 5. Tidak ada ekstraksi atau perubahan scoring pada T0. Kesetaraan output sesudah pure lift tetap wajib dibuktikan E2E saat T2; **belum diklaim terverifikasi runtime**.

## S5 — Target lokal dan harness

- Docker dan Supabase lokal aktif; `docker info` dan `supabase status --output json` exit 0.
- `.env.integration` tersedia, endpoint API/DB loopback, API cocok dengan stack lokal aktif. Nilai secret tidak dicantumkan.
- Helper baru mengecek kedua URL sebelum membuat client/menulis SQL dan memasang fail-closed loopback fetch guard.
- `apps/web/playwright.tna-t0.config.ts` menjalankan spec API lokal secara serial tanpa root dev server, frontend, AI, atau provider remote. Tidak ada perubahan config Playwright default.

## Helper fixture dan cleanup

`apps/web/e2e/helpers/tnaFixture.ts`:

- `createTnaFixture(randomUUID())` mengembalikan `env`, ID owned, `seed()`, `cleanup()`.
- Tiga periode sintetis tahun 2080–2099, dua versi chat, dua snapshot mapped dan dua unmapped, satu folder, enam peserta, 18 row QA.
- Lima agent service (salah satu phantom-only), satu QA yang harus dikecualikan; setiap periode memiliki tiga temuan service, satu clean real row, satu phantom, dan satu temuan QA.
- UUID deterministik per namespace. Seed ulang pada handle yang sama tidak menggandakan data; namespace yang sama bisa dibuat lagi sesudah cleanup.
- Seed data relasional transaksional. Cleanup memakai UUID/peserta/email owned saja; tidak memulihkan backup, tidak menghapus data lain, dan dapat dijalankan berulang.
- Caller T1–T4 harus membersihkan dependent `tna_*` fixture miliknya sebelum cleanup substrat SIDAK. Helper ini tidak bypass trigger immutable TNA.
- Calendar collision dengan fixture lain gagal, bukan mengadopsi/mengubah periode yang tidak dimiliki. Pakai namespace baru dan eksekusi serial.
- Password acak dibuat helper existing; tidak disimpan ke source atau laporan. Error SQL helper baru disanitasi supaya URL database tidak masuk pesan error.

Spec menguji seed dua kali, cleanup dua kali, jumlah row owned nol, reseed, serta akun uji terhapus. Pemeriksaan akhir SQL juga menemukan folder/agent/indikator/versi milik fixture 0; total lokal kembali ke sebelum pengujian: QA 0, periode 1, rule indicators 13, peserta 0.

## Drift kode

`git diff --stat 9130d7d..HEAD -- <affected paths>` menunjukkan penghapusan service laporan AI SIDAK, penyesuaian report-data, nav, dan router. Whitelist `Sidebar.tsx`, filter `MobileDrawer.tsx`, `buildBreadcrumb`, `resolveDataScope` (modul sidak/ktp), `fetchAllPages`, dan scoring masih sesuai rencana. Graphify query `calculateQAScoreFromTemuan` exit 0; live source menjadi bukti utama.

## Bukti verifikasi

| Perintah                                                                                                                    | Hasil                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @trainers/web exec playwright test --config /tmp/tna-t0-playwright.config.mts` (RED)                         | Exit 1; helper baru belum ada, gagal import/collection sesuai prasyarat yang belum dibuat               |
| Perintah sama, percobaan implementasi pertama                                                                               | Exit 1; seed membutuhkan folder karena FK `profiler_peserta.batch_name`; diperbaiki hanya dalam fixture |
| Perintah sama setelah fixture diperbaiki                                                                                    | Exit 0; 1 passed                                                                                        |
| `pnpm --filter @trainers/web exec playwright test --config playwright.tna-t0.config.ts`                                     | Exit 0; focused E2E API fixture lulus                                                                   |
| `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json`                                                        | Exit 0                                                                                                  |
| `pnpm --filter @trainers/web exec eslint e2e/helpers/tnaFixture.ts e2e/tna-fixture-api.spec.ts playwright.tna-t0.config.ts` | Exit 0                                                                                                  |

Prettier/diff-check dan pengulangan final dicatat pada laporan sesi. Tidak ada unit/Vitest, root typecheck/lint/build, migrasi, atau gate T1–T4 yang dijalankan. Config sementara di `/tmp` bukan artifact handoff; config repo adalah cara mengulang verifikasi.

## Handoff

**T1 belum dimulai.** Tunggu konfirmasi Fajar atas batas cakupan S1 serta izin melanjutkan T1. Tidak mengubah status/persetujuan rencana utama secara otomatis.
