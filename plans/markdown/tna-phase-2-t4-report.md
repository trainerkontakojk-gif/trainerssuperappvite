# TNA Fase 2 — Laporan T4

## Status dan scope

**T4 selesai lokal.** Lane **C** sesuai kickoff Fajar, dengan gate root lengkap. Rencana: `tna-phase-2.md` rev. 2, D13/T4; K11–K15 dan pola D9 Fase 1 tetap. Implementasi langsung oleh sesi Pi ini; tanpa worker, delegasi, reviewer independen, atau UI T5/T6.

Git awal: branch `feat/tna-phase-2`, HEAD `737434d`. Dirty awal yang dilindungi: `.claude/launch.json`, `.impeccable/`, `mockups/`, `plans/markdown/shell-beranda-redesign.md`, `supabase/.branches/`. Tidak ada staging/commit/push/PR/deploy, akses produksi (termasuk read-only), perubahan remote, migrasi/reset, perubahan file SQL, dependency, AI, atau unit test. SQL dalam spec hanya mengubah fixture QA lokal namespace sendiri.

## Files dan kontrak

- `apps/api/src/services/tna/narrative.ts`: `buildTnaEvaluationNarrative` murni/deterministik. Memakai formatter angka D9 yang sama (Indonesia, satu desimal), periode UTC, arah perbandingan rate exact (bukan ambang tren D9), verdict typed, kalimat kohort/catatan/penutup D13. **Body `buildTnaNarrative` tidak diubah.**
- `apps/api/src/services/tna/read-service.ts`: GET detail mengisi **`evaluation_narrative`**. `evaluasi` memakai hasil live dengan `Pratinjau:`; `selesai` memakai `evaluation_snapshot` tersimpan, tanpa hitung ulang QA/kohort. Kalimat utama selalu memakai `baseline_snapshot` beku, bukan baseline hitung-ulang K12.
- `packages/types/src/tna.ts`: `TnaVerdict` diinfer dari enum existing; `TnaPlanDetail.evaluation_narrative?: string | null` mengikuti pola field evaluasi optional existing agar fixture UI lama tetap kompatibel. Respons backend selalu mengirim field ini; `null` di luar `evaluasi`/`selesai`. Detail existing berupa interface, bukan schema Zod baru; snapshot tetap melalui schema runtime existing.
- `apps/web/src/routes/tna/utils.ts`: tambah `verdictLabels: Record<TnaVerdict, string>` dan `followUpLabels: Record<TnaFollowUp, string>`. `planStatusLabels: Record<TnaPlanStatus, string>` **sudah** mencakup `evaluasi`/`selesai`, dipertahankan. Tidak ada perubahan komponen, hook, transport, atau pemakaian UI.
- `apps/web/e2e/tna-evaluation-metrics-api.spec.ts`: assertion string exact pada fixture T2 existing; tiga kasus tambahan terbatas: insufficient audited, tetap/naik dengan pembanding cukup, semua peserta tidak diaudit.
- `apps/web/e2e/tna-evaluation-flow-api.spec.ts`: assertion exact preview → complete HTTP → frozen detail → QA berubah.
- `plans/markdown/tna-phase-2.md`: hanya baris Status diperbarui; laporan ini.

### Keputusan null dan metadata

D13 tidak merinci `no_audit` atau delta peserta null. Mengikuti D9/D1: tanpa audit, narasi menjelaskan tingkat/sebaran belum dapat dihitung, tanpa angka nol/verdict palsu, tetap catatan insufficient dan penutup. Jika populasi/pembanding diaudit tetapi peserta tidak diaudit, narasi menyebut **0 dari N** dan data peserta belum cukup untuk dibandingkan, bukan delta nol. Keduanya dibuktikan E2E exact.

Label periode diambil lewat pembacaan JWT/RLS `qa_periods(id,month,year)` berdasarkan ID **snapshot evaluasi**; ini metadata, bukan hitung ulang QA. Parameter/layanan memakai metadata baseline beku, target dan N memakai rencana/peserta terkunci. Tidak menambah isi snapshot/kolom DB. Freeze yang diuji adalah perubahan **data QA**, bukan perubahan kalender master periode.

## RED → GREEN

1. Tambah assertion D13 sebelum implementasi. **RED focused: 1 failed**, exit **1**, karena `evaluation_narrative` **undefined**; semua POST/GET/activate 201/200 dan assertion angka kohort sudah lolos. Bukan error SQL/auth/setup.
2. Builder + field detail + map label ditambahkan. **GREEN focused: 1 passed**, exit **0**.
3. Setelah seluruh assertion dan artifact string aktual tersedia: kedua spec T2/T3 **19/19 passed**, exit **0** (9 metrics + 10 flow).
4. Regresi **seluruh project `tna-real-backend`: 54/54 passed**, exit **0**, termasuk 12/12 plan Fase 1; tanpa grep-invert atau pengecualian.
5. Root typecheck/lint/build serial masing-masing exit **0**, tanpa remote cache. Tidak ada perubahan produk sesudah GREEN/regresi/gate.

Enam kasus kickoff tercakup: tercapai, tercapai sebagian, tidak tercapai, pembanding kecil, insufficient, pratinjau. Snapshot selesai diuji sebelum dan sesudah data QA **baseline dan evaluasi** ditambah di metrics; flow juga mengubah QA sesudah complete HTTP lalu mengembalikannya. Narasi selesai identik tanpa prefix; narasi Fase 1 ikut tetap sama.

Angka manual mengikuti laporan T2: baseline utama **15/50 × 100 = 30**, spread **100%**; eval cukup **10/50 × 100 = 20**, delta peserta **−20**, pembanding **0**. Pembanding kecil baseline **14/45 × 100 = 31,1** tampilan dan eval **14/50 × 100 = 28,0**; sebagian n=4 dari 5. Drift baseline live berubah tetapi opening tetap **30,0**, sedangkan delta peserta menjadi **−30,0**.

Tambahan fixture tanpa rumus produk baru: insufficient **2/50 × 100 = 4**, spread **1/10 × 100 = 10%**, delta peserta **−32**, pembanding **−20**; tetap **15/50 × 100 = 30**, delta **0/0**; naik **30/50 × 100 = 60**, delta **+20/+40**. Flow memakai substrate existing **3/33 × 100 = 9,1**, spread **3/5 × 100 = 60%**.

## Perintah, exit code, dan log

Direktori bukti lokal/ignored: `.pi/orchestrator/tna-phase-2/t4-evidence/`. Log RED/GREEN/gate menyimpan `EXIT_CODE`. Semua runner serial, workers 1, retries 0; config API **tanpa webServer**. Helper membaca `.env.integration` fail-closed loopback, JWT nyata dan Hono in-process, fetch guard melarang egress non-loopback.

Alias **PW** berikut adalah prefix persis:

```sh
pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend
```

Alias **TS** untuk scoped Prettier (enam path persis):

```sh
apps/api/src/services/tna/narrative.ts
apps/api/src/services/tna/read-service.ts
packages/types/src/tna.ts
apps/web/src/routes/tna/utils.ts
apps/web/e2e/tna-evaluation-metrics-api.spec.ts
apps/web/e2e/tna-evaluation-flow-api.spec.ts
```

| Perintah                                                                                                                  | Exit | Bukti                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| `git status --short; git branch --show-current; git rev-parse --short HEAD`                                               | 0    | Prasyarat cocok; `before-status.txt`                                                          |
| `graphify query buildTnaNarrative`                                                                                        | 0    | `graphify-query.log`: caller read service, route, snapshot/types; dikonfirmasi kode live      |
| `pnpm exec tsx -e` readLoopbackEnv + history/readiness lokal                                                              | 0    | `preflight.log`: kedua versi migrasi, readiness=1                                             |
| **PW** `tna-evaluation-metrics-api.spec.ts --grep 'comparison sufficient' --workers=1` sebelum implementasi               | 1    | `red.log`: undefined vs string exact, 1 failed                                                |
| `pnpm exec prettier --write` **TS**                                                                                       | 0    | `format.log`                                                                                  |
| **PW** `tna-evaluation-metrics-api.spec.ts --grep 'comparison sufficient' --workers=1` sesudah implementasi               | 0    | `green-focused.log`: 1 passed                                                                 |
| `pnpm exec prettier --write apps/web/e2e/tna-evaluation-metrics-api.spec.ts apps/web/e2e/tna-evaluation-flow-api.spec.ts` | 0    | `format-tests.log`                                                                            |
| **PW** `tna-evaluation-metrics-api.spec.ts tna-evaluation-flow-api.spec.ts --workers=1`                                   | 0    | `green.log`: 19 passed + string aktual                                                        |
| **PW** `--workers=1`                                                                                                      | 0    | `regression.log`: 54 passed, semua spec API TNA                                               |
| `pnpm typecheck --concurrency=1 --cache=local:rw`                                                                         | 0    | `typecheck.log`: 4/4, 0 cache hit; termasuk E2E TS dan kelengkapan map label                  |
| `pnpm lint --concurrency=1 --cache=local:rw`                                                                              | 0    | `lint.log`: 0 error, 8 API + 90 web warning existing di luar file T4                          |
| `pnpm build --concurrency=1 --cache=local:rw`                                                                             | 0    | `build.log`: 3/3, 0 cache hit; warning `__dirname` pada vite.config.ts existing               |
| `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                                                | 0    | `graphify-update.log`: AST satu worker, tanpa LLM; HTML viz dilewati karena >5000 node        |
| `pnpm exec tsx .pi/orchestrator/tna-phase-2/t4-evidence/local-check.ts`                                                   | 0    | `local-check.log`: readiness=1; 0 E2E users/needs/plans/participants; kedua migrasi tetap ada |
| `git diff --exit-code -- supabase`                                                                                        | 0    | `sql-unchanged.log`: file SQL/fondasi tidak berubah                                           |
| `pnpm exec prettier --write plans/markdown/tna-phase-2-t4-report.md`                                                      | 0    | `format-report.log`                                                                           |
| `pnpm exec prettier --check` **TS** `plans/markdown/tna-phase-2.md plans/markdown/tna-phase-2-t4-report.md`               | 0    | `format-check.log`                                                                            |
| `git diff --check` + scoped new-report whitespace/scope check                                                             | 0    | `diff-check.log`                                                                              |

Context7 tidak diperlukan: hanya pola internal dan Intl existing; tidak mengadopsi API library/dependency baru. Tidak menjalankan unit/legacy suites, browser/UI suite, atau dev server. Stack Supabase milik pengguna tetap berjalan; tidak ada proses runner/server task-owned tersisa.

## String narasi aktual

Disalin **verbatim** dari `T4_NARRATIVE` pada `green.log` setelah assertion exact lolos. Tahun/nama UUID berubah antar-run sesuai isolasi fixture; angka dan teks tidak dihitung oleh builder produk di assertion. Duplikasi identik sebelum/sesudah QA berubah ditampilkan sekali.

### 1. live evaluation changes period, completes server snapshot once and freezes detail

> Evaluasi Maret 2023: tingkat ketidaksesuaian parameter tna-fixture-615db389-7512-45dc-a8f9-0e0090961b8d-alpha (Chat) tetap dari 9,1 menjadi 9,1 per 100 sesi sampel (target ≤ 1,0), dengan sebaran 60,0% → 60,0% (target ≤ 10,0%). Target tidak tercapai. Kelompok pembanding terlalu kecil untuk dibandingkan. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 2. comparison sufficient: exact cohorts, scalar delta and SQL-compatible snapshot

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) berubah -20,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) berubah 0,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 3. comparison sufficient: exact cohorts, scalar delta and SQL-compatible snapshot

> Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) berubah -20,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) berubah 0,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 4. comparison small: intersection excludes baseline-only and evaluation-only agents

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) turun dari 31,1 menjadi 28,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 80,0%). Target tidak tercapai. Kelompok pembanding terlalu kecil untuk dibandingkan. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 5. participant not audited: null evaluation and participant threshold

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 80,0%). Target tercapai sebagian. Peserta yang diaudit (4 dari 5) berubah -20,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) berubah 0,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 6. evaluation no_audit: null metrics, null verdict, no fabricated zeros

> Pratinjau: Evaluasi Februari 2023: belum ada audit untuk parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat), sehingga tingkat dan sebaran belum dapat dihitung. Kelompok pembanding terlalu kecil untuk dibandingkan. Catatan: data periode evaluasi belum cukup untuk kesimpulan kuat. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 7. baseline drift: frozen participant data, labeled legacy recompute, target verdict unaffected

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) berubah -30,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) berubah 0,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 8. insufficient evaluation: audited low findings keeps verdict with a caution

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) turun dari 30,0 menjadi 4,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 10,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) berubah -32,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) berubah -20,0. Catatan: data periode evaluasi belum cukup untuk kesimpulan kuat. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 9. not achieved with sufficient comparison: exact unchanged and increasing direction

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) tetap dari 30,0 menjadi 30,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 80,0%). Target tidak tercapai. Peserta yang diaudit (5 dari 5) berubah 0,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) berubah 0,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 10. not achieved with sufficient comparison: exact unchanged and increasing direction

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) naik dari 30,0 menjadi 60,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 80,0%). Target tidak tercapai. Peserta yang diaudit (5 dari 5) berubah 20,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) berubah 40,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 11. no participants audited: absent cohort delta is not a fabricated zero

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (0 dari 5) belum memiliki data yang cukup untuk dibandingkan, sedangkan kelompok pembanding (5 agent) berubah 0,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 12. phantom batch: mixed ignores padding, phantom-only stays audited

> Pratinjau: Evaluasi Februari 2023: tingkat ketidaksesuaian parameter tna-fixture-3da1bf86-0b9e-4575-a792-c63238d2ac0f-alpha (Chat) turun dari 30,0 menjadi 18,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 90,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) berubah -24,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) berubah 0,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

## Thermo-nuclear — self-review T4

**Verdict: PASS untuk scope T4 lokal**, bukan review independen/release.

- Tidak ada perubahan auth/RLS/writer/RPC/SQL/formula SIDAK atau konsumsi angka request. Pembacaan JWT/RLS existing tetap; error invariant gagal tertutup.
- D13 deterministik; baseline utama beku, cohort berasal dari snapshot evaluasi yang sama dengan field `evaluation`. Snapshot selesai tidak dihitung ulang; insufficient tetap berverdict dengan catatan, sementara delta null tidak dibuat nol.
- D9 existing tidak diubah; formatter angka dipakai ulang. Typed Record mencakup semua enum tanpa map string bebas; typecheck penuh lulus.
- Spec hanya memperluas kontrak owning T2/T3; semua file <1000 baris, tidak ada dependency/arsitektur/duplikasi UI baru.
- Report/status, Prettier, scope dan diff-check diperiksa. Dirty awal tetap, tidak ada file staged.
- **Gap yang sengaja ditunda:** pemakaian map/narasi dalam UI dan browser E2E milik **T5**; sinkronisasi docs final, reviewer independen dan gate rilis milik **T6**. Tidak mengklaim visual QA atau deployment.

## T4b — revisi wording dan checkpoint lokal T4

**Status: selesai lokal.** Lane B (wording/format internal); artefak intent: D13 revisi dan prompt Fajar 2026-10-13. HEAD awal `737434d`, branch `feat/tna-phase-2`. Seluruh diff T4 dipertahankan. Hanya implementasi builder evaluasi di `narrative.ts` diubah; body `buildTnaNarrative` Fase 1 identik. Dua spec existing diperbarui, satu kasus batas ditambah. Tidak ada dependency, unit test, akses produksi, push, atau pekerjaan T5.

### RED → GREEN dan batas pembulatan

- Assertion exact diganti sebelum implementasi. Run pertama terhenti oleh timeout tool 200 detik (exit runner tidak tersedia), kemudian diulang sampai selesai: **9 failed / 11 passed**, exit 1. Delapan kegagalan adalah diff wording; satu fixture batas masih gagal aktivasi karena target 20 melebihi baseline 1,5.
- Target fixture batas diperbaiki menjadi 1. Bukan perubahan validasi produk. Aturan opening lama dipasang kembali sementara: **RED batas 1 failed**, exit 1, diff `turun dari 1,5 menjadi 1,5` vs `tetap di 1,5`. Kohort saat pembuktian RED batas sudah memakai wording baru.
- Fixture batas nyata: baseline populasi 15/1000 × 100 = 1,5; evaluasi 15/1001 × 100 ≈ 1,4985. Peserta 10/500 → 10/502 (delta negatif bukan nol), pembanding 5/500 → 5/499 (delta positif bukan nol). Assertion angka memastikan arah asli, kemudian string exact memastikan ketiganya **tetap**.
- Percobaan GREEN awal: 19 passed / 1 failed (target fixture); sesudah koreksi: 19 passed / 1 timeout pada tes cancel existing, 60 detik, disertai error cleanup SQL yang disamarkan helper. Tidak mengubah timeout/config/produk cancel. Uji ulang cancel dengan konfigurasi sama **1 passed**; kedua spec utuh kemudian **20 passed**, regresi seluruh project **55 passed**.
- Semua runner serial, workers 1, retries 0, tanpa webServer. Helper fail-closed loopback + JWT nyata; tidak ada hosted target.
- Tidak mengubah file migrasi/SQL atau menjalankan migrasi manual. Catatan: suite existing yang diminta mencakup tes replay/rollback writer lokal K15; suite itu dijalankan utuh, bukan dikecualikan.

### Perintah dan exit code T4b

Bukti lokal ignored: `.pi/t4b-evidence/`. **PW** = `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project=tna-real-backend`. **SPECS** = `tna-evaluation-metrics-api.spec.ts tna-evaluation-flow-api.spec.ts`.

| Perintah                                                                                   | Exit           | Log / hasil                                                  |
| ------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------ |
| **PW SPECS** `--workers=1` (RED awal)                                                      | tidak tersedia | `red.log`, tool timeout 200 detik                            |
| **PW SPECS** `--workers=1` (RED lengkap)                                                   | 1              | `red-complete.log`, 9 failed / 11 passed                     |
| **PW** `tna-evaluation-metrics-api.spec.ts --grep 'rounding boundary' --workers=1`         | 1              | `red-boundary.log`, diff string, 1 failed                    |
| **PW SPECS** `--workers=1` (GREEN awal)                                                    | 1              | `green.log`, 19 passed / fixture target invalid              |
| **PW SPECS** `--workers=1` (sesudah koreksi fixture)                                       | 1              | `green-final.log`, 19 passed / cancel timeout                |
| **PW** `tna-evaluation-flow-api.spec.ts --grep 'cancel requires valid reason' --workers=1` | 0              | `cancel-recheck.log`, 1 passed                               |
| **PW SPECS** `--workers=1`                                                                 | 0              | `green-confirmed.log`, **20/20**                             |
| **PW** `--workers=1`                                                                       | 0              | `regression.log`, **55/55**, tanpa pengecualian              |
| `pnpm typecheck --concurrency=1 --cache=local:rw`                                          | 0              | `typecheck.log`, 4 tasks, 2 cached                           |
| `pnpm lint --concurrency=1 --cache=local:rw`                                               | 0              | `lint.log`, 4 tasks, 2 cached; warning existing, 0 error     |
| `pnpm build --concurrency=1 --cache=local:rw`                                              | 0              | `build.log`, 3 tasks, 1 cached                               |
| `GRAPHIFY_MAX_WORKERS=1 graphify update .`                                                 | 0              | `graphify.log`, cache lokal, visualisasi dilewati >5000 node |

Scoped formatter/check dan diff-check akhir semuanya **exit 0**; enam file TypeScript tidak berubah oleh format akhir sesudah gate. Hasil dicatat di `format-final.log`, `format-check.log`, `diff-check.log`. Path persis: enam file TypeScript pada alias **TS** di atas, `plans/markdown/tna-phase-2.md`, `plans/markdown/tna-phase-2-t4-report.md`.

Self-review: tidak mengubah angka metrik, snapshot, verdict, API writer, auth/RLS atau formatter D9. Opening membandingkan string angka tampilan; kohort memformat absolut delta dan membandingkan terhadap format nol sehingga signed zero juga menjadi tetap. Kasus null/no_audit/insufficient/pembanding kecil/pratinjau/penutup tetap tercakup. Context7/Graphify query tidak diperlukan untuk pola lokal ini; Graphify update dijalankan sekali.

### String aktual T4b

Berikut string verbatim unik dari `T4_NARRATIVE` di `green-confirmed.log`; bagian string T4 di atas adalah bukti historis sebelum revisi, bukan wording yang berlaku.

### 1. live evaluation changes period, completes server snapshot once and freezes detail

> Evaluasi Maret 2021: tingkat ketidaksesuaian parameter tna-fixture-70f24893-af78-47ba-9c6c-b220b6f71757-alpha (Chat) tetap di 9,1 per 100 sesi sampel (target ≤ 1,0), dengan sebaran 60,0% → 60,0% (target ≤ 10,0%). Target tidak tercapai. Kelompok pembanding terlalu kecil untuk dibandingkan. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 2. comparison sufficient: exact cohorts, scalar delta and SQL-compatible snapshot

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) turun 20,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) tetap. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 3. comparison sufficient: exact cohorts, scalar delta and SQL-compatible snapshot

> Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) turun 20,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) tetap. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 4. comparison small: intersection excludes baseline-only and evaluation-only agents

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) turun dari 31,1 menjadi 28,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 80,0%). Target tidak tercapai. Kelompok pembanding terlalu kecil untuk dibandingkan. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 5. participant not audited: null evaluation and participant threshold

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 80,0%). Target tercapai sebagian. Peserta yang diaudit (4 dari 5) turun 20,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) tetap. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 6. evaluation no_audit: null metrics, null verdict, no fabricated zeros

> Pratinjau: Evaluasi Februari 2021: belum ada audit untuk parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat), sehingga tingkat dan sebaran belum dapat dihitung. Kelompok pembanding terlalu kecil untuk dibandingkan. Catatan: data periode evaluasi belum cukup untuk kesimpulan kuat. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 7. baseline drift: frozen participant data, labeled legacy recompute, target verdict unaffected

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) turun 30,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) tetap. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 8. insufficient evaluation: audited low findings keeps verdict with a caution

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) turun dari 30,0 menjadi 4,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 10,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) turun 32,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) turun 20,0. Catatan: data periode evaluasi belum cukup untuk kesimpulan kuat. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 9. not achieved with sufficient comparison: exact unchanged and increasing direction

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) tetap di 30,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 80,0%). Target tidak tercapai. Peserta yang diaudit (5 dari 5) tetap, sedangkan kelompok pembanding (5 agent) tetap. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 10. not achieved with sufficient comparison: exact unchanged and increasing direction

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) naik dari 30,0 menjadi 60,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 80,0%). Target tidak tercapai. Peserta yang diaudit (5 dari 5) naik 20,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) naik 40,0. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 11. rounding boundary: nonzero population and cohort changes display tetap

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) tetap di 1,5 per 100 sesi sampel (target ≤ 1,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai sebagian. Peserta yang diaudit (5 dari 5) tetap, sedangkan kelompok pembanding (5 agent) tetap. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 12. no participants audited: absent cohort delta is not a fabricated zero

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) turun dari 30,0 menjadi 20,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 100,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (0 dari 5) belum memiliki data yang cukup untuk dibandingkan, sedangkan kelompok pembanding (5 agent) tetap. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### 13. phantom batch: mixed ignores padding, phantom-only stays audited

> Pratinjau: Evaluasi Februari 2021: tingkat ketidaksesuaian parameter tna-fixture-1c8b4398-5e64-483b-b6d2-2f320c3a52f7-alpha (Chat) turun dari 30,0 menjadi 18,0 per 100 sesi sampel (target ≤ 20,0), dengan sebaran 100,0% → 90,0% (target ≤ 100,0%). Target tercapai. Peserta yang diaudit (5 dari 5) turun 24,0 per 100 sesi, sedangkan kelompok pembanding (5 agent) tetap. Perbandingan ini indikatif, bukan bukti sebab-akibat.

### Checkpoint

Commit lokal diotorisasi: `feat(tna): add phase 2 evaluation narrative and labels`. Hanya delapan path T4/T4b yang di-stage eksplisit. Tidak stage/sentuh `.claude/launch.json`, `.impeccable/`, `mockups/`, `plans/markdown/shell-beranda-redesign.md`, `supabase/.branches/`. Tidak push. T5 harus memakai checkpoint ini dalam sesi berikutnya.
