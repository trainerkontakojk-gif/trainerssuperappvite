# Dependency security patches — 2026-10-29

## Scope dan status

Patch keamanan minimum pada major yang sudah digunakan, plus Node lokal. Tidak ada upgrade rutin React/Vite/TanStack/SDK, migrasi major, commit, push, deploy, perubahan production env, atau DB mutation.

Status: **SELESAI untuk scope patch yang disetujui**. Gate produk PASS, termasuk rerun root lint/typecheck/build setelah koreksi peer; pembaruan cache lokal Graphify juga selesai (exit 0). Dua advisory dev-only tetap terbuka dan dirinci di bawah. Audit produksi yang bersih bukan bukti production sudah dipatch.

Plan: [`plans/markdown/dependency-security-patches.md`](../plans/markdown/dependency-security-patches.md).

## Hasil keamanan

| Pemeriksaan                          | Sebelum                                           | Setelah                              |
| ------------------------------------ | ------------------------------------------------- | ------------------------------------ |
| OSV, seluruh exact lockfile versions | 923 pasangan, 34 advisory unik                    | 917 pasangan, 2 advisory unik        |
| Paket yang match advisory            | 15                                                | 2, keduanya dev-only                 |
| Advisory tertutup dalam batch        | —                                                 | 32                                   |
| `pnpm audit --prod --json`           | Endpoint gagal pada audit awal; jangan dianggap 0 | **Exit 0; 0 advisory**               |
| `pnpm audit --json`                  | Audit awal memakai OSV                            | **Exit 1; 1 High + 1 Low, dev-only** |

OSV dan npm native audit final sepakat mengenai dua residual. Tidak ada ignore/advisory suppression ditambahkan. Count lockfile turun juga karena deduplikasi salinan lama; bukan karena dependency produk dihapus.

## Patch yang diterapkan

| Paket / surface                               | Versi sebelumnya | Versi patched |
| --------------------------------------------- | ---------------- | ------------- |
| Undici API + tooling branch 7                 | 7.30.0           | 7.30.1        |
| Undici cabang jsdom                           | 8.11.2           | 8.12.2        |
| DOMPurify                                     | 3.4.16           | 3.4.17        |
| Seroval                                       | 1.6.8            | 1.6.11        |
| fast-uri                                      | 3.1.8            | 3.1.9         |
| ip-address                                    | 10.7.3           | 10.7.4        |
| body-parser                                   | 2.3.0            | 2.4.0         |
| qs                                            | 6.16.0           | 6.16.1        |
| brace-expansion cabang 5                      | 5.0.9            | 5.0.12        |
| Browserslist cabang lama                      | 4.28.4           | 4.28.7        |
| baseline-browser-mapping cabang lama          | 2.10.38          | 2.11.0        |
| source-map-js cabang lama                     | 1.2.1            | 1.2.2         |
| systeminformation                             | 5.33.10          | 5.33.16       |
| Vitest + coverage + internal @vitest packages | 4.1.11           | 4.1.12        |

Implementasi: direct Undici di `apps/api/package.json`, pasangan Vitest/coverage di workspace manifests, dan override terarah di `pnpm-workspace.yaml`. Lockfile di-resolve oleh pnpm 12.9.1 lalu dipasang dengan `pnpm install --frozen-lockfile --ignore-scripts` (exit 0). Script dependency tidak dieksekusi selama pemasangan batch ini.

15 target package-version entries pada lockfile dicocokkan dengan SRI registry resmi; semuanya cocok. Package manager/bootstrap pnpm tetap 12.9.1.

Direct version drift hanya: Undici API dan Vitest/coverage. React 19.3.0, react-dom 19.3.0, Vite 8.3.4, TanStack Router 1.170.44, Query 5.104.3, GenAI 2.30.0, Supabase 2.118.0, Hono 4.13.13, shadcn 4.21.5, dan jsdom 30.1.2 tetap. Perubahan beberapa database browser transitif merupakan konsekuensi patch Browserslist/deduplikasi, bukan pembaruan direct package rutin.

## Node lokal dan runtime contract

- Node aktif lokal: **26.5.0 → 26.12.1**; bundled Undici sekarang **8.12.2**.
- Binary resmi: `https://nodejs.org/dist/v26.12.1/node-v26.12.1-darwin-x64.tar.xz`.
- SHA-256 diverifikasi terhadap SHASUMS256 resmi: `69316aaafb4dfcb25ac7b9a460f5c60928a37580284fde410144d0e6c8672d0f`.
- Instalasi: `/usr/local/lib/nodejs/node-v26.12.1-darwin-x64`.
- `/usr/local/bin/node` sekarang menunjuk binary di lokasi itu. Tidak mengubah konfigurasi Hermes atau shell.
- Binary Homebrew lama `/usr/local/Cellar/node/26.5.0_1/bin/node` tetap ada dan dijalankan ulang untuk membuktikan rollback binary masih valid. npm tetap 11.17.0; pnpm tetap 12.9.1. Tidak meng-upgrade formula/dependency Homebrew lain.
- `.node-version` dan base image `Dockerfile.render` dipin ke **22.23.4**, masih major 22. Tag Docker resmi `22.23.4-bookworm-slim` diverifikasi tersedia.
- Semua workspace engines: `^22.23.4 || ^24.22.1 || ^26.12.1`, mendeklarasikan minimum patch pada jalur yang didukung tanpa memigrasikan major. Field engines bukan guard runtime tersendiri; CI/image pin dan versi proses aktual tetap harus diverifikasi.
- `docs/deployment.md` disinkronkan. Wiki deployment hanya menunjuk dokumen kanonik untuk kontrak ini; tidak menduplikasi versi baru ke riwayat lama.

Rollback lokal bila benar-benar diperlukan: arahkan `/usr/local/bin/node` kembali ke `/usr/local/Cellar/node/26.5.0_1/bin/node`. Binary itu rentan dan dipertahankan hanya sebagai rollback, bukan runtime yang direkomendasikan. Homebrew upgrade/link mendatang dapat mengganti symlink manual ini; periksa `command -v node` dan `node --version` sesudahnya.

**Production belum dideploy/diverifikasi.** Repository pin dan perubahan Node lokal tidak meng-upgrade proses/container production yang sudah berjalan.

## Probe keamanan RED → GREEN

Fajar mengizinkan satu probe non-E2E terisolasi karena browser E2E biasa tidak dapat membuktikan process-level HTTP client crash. Artifact repeatable: `scripts/deployment/undici-response-security-smoke.mjs`.

Command:

```bash
node scripts/deployment/undici-response-security-smoke.mjs
```

Tiga child process menguji salinan actual dari owner API, jsdom, dan fetch bawaan Node. Seluruh fixture bind loopback/port ephemeral, child env allowlist tanpa credential, tidak ada aplikasi/DB/provider production yang di-boot.

| Kontrak                                   | RED                                                           | GREEN                      |
| ----------------------------------------- | ------------------------------------------------------------- | -------------------------- |
| Request valid sebelum stimulus            | Berhasil sebelum crash                                        | Status 200, body `ok`      |
| Enam lapis content-encoding + early close | Promise ditolak tetapi orphan stream melempar unhandled error | Ditolak tanpa crash        |
| Proses masih hidup + request normal kedua | Tidak tercapai, exit 1 pada ketiga child                      | Berhasil pada ketiga child |
| Timeout, signal, atau output invalid      | Selalu gagal, bukan PASS sintetis                             | Tidak terjadi              |

RED aktual: `ResponseContentLengthMismatchError`, `UND_ERR_RES_CONTENT_LENGTH_MISMATCH`, `Unhandled 'error' event` pada Undici 7.30.0, 8.11.2, dan Node built-in 8.7.0. GREEN aktual: Undici 7.30.1 / 8.12.2 / built-in 8.12.2, **3/3 child pass**. Tidak ada uncaughtException handler yang menelan crash.

Ini membuktikan satu kontrak keamanan tertentu (GHSA-xjj6-f33q-929c), bukan runtime exploit coverage untuk semua 32 advisory yang ditutup.

## Gate verifikasi

Semua E2E memakai env allowlist/loopback, fixture fail-closed, dan output scratch di luar repo. Tidak menjalankan suite unit/Vitest; pengecualian hanya probe yang disetujui.

| Gate                                       | Hasil                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Baseline E2E API Gemini proxy/direct/error | 12 passed                                                                    |
| Baseline browser landing/auth/sidebar      | 11 passed                                                                    |
| Final E2E API Gemini proxy/direct/error    | **12 passed**, exit 0                                                        |
| Final browser landing/auth/sidebar         | **11 passed**, exit 0                                                        |
| Final PDF download smoke                   | **1 passed**, exit 0; PDF nyata diunduh dan diperiksa                        |
| Root lint                                  | **PASS**, exit 0; 4/4 workspaces, 0 errors (API 8 warnings, web 66 warnings) |
| Root typecheck                             | **PASS**, exit 0; 4/4 workspaces, 0 cached                                   |
| Root build                                 | **PASS**, exit 0; 3/3 build tasks, 0 cached                                  |
| Probe lint (`eslint --no-ignore`)          | PASS                                                                         |
| Probe syntax (`node --check`)              | PASS                                                                         |
| Scoped Prettier manifests/plan/probe       | PASS, dengan baseline YAML drift terpisah di bawah                           |
| `git diff --check`                         | **PASS**, exit 0, final                                                      |
| Graphify local cache                       | **PASS**, exit 0 tanpa LLM; graph/report diperbarui                          |

Root gates dijalankan serial lewat `pnpm exec turbo run <lint|typecheck|build> --concurrency=1 --cache=local:w`. Ini mematikan pembacaan cache dan remote cache, agar hasil fresh dan tidak ada remote cache write. Build memakai VITE targets loopback, bukan secret/env production dari parent. Compiler aktual workspace: TypeScript 7.0.2; root programmatic API untuk ESLint tetap TypeScript 6.0.2.

Catatan transparansi:

- Percobaan pertama wrapper ditolak Turbo sebelum lint mulai karena kombinasi `--force` + `--cache` tidak diterima. Diperbaiki menjadi local write-only cache; log percobaan awal dipertahankan dan tidak dihitung sebagai product lint failure/PASS.
- ESLint tidak mencakup `scripts/**` secara default; probe diperiksa eksplisit dengan `--no-ignore`. Empat deklarasi global Node yang kurang pada probe baru telah diperbaiki sebelum gate final.
- Prettier pada `pnpm-workspace.yaml` melaporkan konversi quote di release-age exclusions yang sudah ada. Diff formatter baseline vs current dibandingkan: identik, 22 +/- lines, tidak ada drift baru dari patch. Tidak memformat ulang bagian unrelated.
- Pemeriksaan peer setelah install menemukan override Browserslist terlalu luas dan mempersempit peer constraint cabang sehat. Override diganti menjadi `@babel/helper-compilation-targets@7.29.7>browserslist`. `pnpm peers check` final: **No peer dependency issues found**. Koreksi hanya mengembalikan peer range `update-browserslist-db` ke `>=4.21.0`; package identities, snapshot bindings, importers, dan binary terpasang tidak berubah. Gate compile diulang dengan label `peer-corrected` agar evidence metadata akhir terpisah.
- Skill `thermo-nuclear` tidak tersedia pada host. Review specialist dilakukan langsung dengan checklist dependency/security, ownership, major-boundary, lock drift, SRI, native audit, OSV, dan E2E; tidak mengarang tool atau mendispatch agent.
- Graphify mengekstrak 2.019 file dan memperbarui cache dengan 18.128 nodes / 34.709 edges. `graph.html` dilewati otomatis karena melewati limit visualisasi 5.000 nodes; `graph.json` dan `GRAPH_REPORT.md` berhasil diperbarui. Cache tetap ignored, tidak di-stage.

## Residual / blocker yang sengaja tidak disamarkan

| Paket                                 | Severity | Scope dan alasan belum diperbaiki                                                                                                                                                                                                                           |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zod 3.25.76 / GHSA-mrhx-c7xc-m3w5     | High     | Dev-only melalui shadcn, registry/MCP tooling, dan React Hooks lint plugin. Fixed range advisory >=4.6.6. Major 3→4 berada di luar persetujuan batch ini; jangan global override tanpa tinjauan seluruh consumer. Zod aplikasi tetap 4.6.7 dan tidak match. |
| deepmerge 4.3.1 / GHSA-gcqx-w48m-w2h4 | Low      | Dev-only melalui shadcn/registry. Native audit menyatakan patch belum dipublikasikan; latest masih 4.3.1. Perlu patch upstream atau keputusan terpisah mengenai penggantian/removal tooling.                                                                |

Tidak mengklaim full audit bersih. Jangan menjalankan tooling terkait pada input/registry yang tidak dipercaya sambil menunggu penyelesaian residual. Update rutin/major tetap ditunda sesuai scope.

## Evidence dan hygiene

Evidence lokal: `/Users/nadindyta/.hermes/cache/scratch/trainers-security-fix-20261029/`.

- `baseline.json`, `scope-verification.json`: hash/status awal, whitelist file owned, direct version drift.
- `undici-red.json`, `undici-green.json`: crash sebelum patch dan recovery sesudah patch.
- `audit-prod.json`, `audit-all.json`, `osv-final.json`, `osv-final-batch-*.json`.
- `patch-metadata.json`, `patch-integrity-verified.json`, `lock-version-diff.json`.
- `node-download.json`, `node-SHASUMS256.txt`, `node-upgrade.json`, backup symlink rollback.
- `e2e-api-{baseline,final}.log`, `e2e-browser-{baseline,final}.log`, output E2E terkait.
- `compile-gates-verified.json`, `*-verified.log` setelah gate selesai.
- `compile-gates-peer-corrected.json`, `*-peer-corrected.log` untuk rerun final setelah koreksi peer; `peers-final.log` dan `peer-correction-verification.json`.
- `pdf-artifact.json` dan `e2e-pdf-artifacts/Laporan_Audit_fixture.pdf`: salinan byte-identik PDF fixture yang benar-benar diunduh (11.219 bytes). Run pertama memakai lokasi default helper di OS temp; PDF diarsipkan ke scratch dengan checksum terverifikasi, dan runner berikutnya menetapkan `TMPDIR` scratch secara eksplisit.
- `format-baseline-comparison.json`.

Hash `plans/markdown/telefun-tone-direction.md` sama dengan awal. Direktori untracked Telefun dipertahankan. Tidak ada reset/stash/clean atau edit product source untuk menutupi gate. Laporan dan plan baru dibiarkan untracked; tidak di-stage/commit/push.
