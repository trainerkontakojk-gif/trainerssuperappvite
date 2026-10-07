# Dependency & Security Audit — 2026-10-06

Scope: seluruh workspace (apps/api, apps/telefun, apps/web, packages/types).
Sumber: `pnpm outdated -r`, `pnpm audit --prod --json`, `pnpm-lock.yaml`, `pnpm why -r`, registry npm.
Status: **audit saja — belum ada satu pun file manifest/lockfile yang diubah.**

## Prioritas 0 — Security (26 vuln prod: 2 critical, 13 high, 9 moderate, 2 low)

| Paket           | Terkunci | Jalur                                               | Butuh    | Severity |
| --------------- | -------- | --------------------------------------------------- | -------- | -------- |
| seroval         | 1.5.4    | @tanstack/react-router > @tanstack/router-core      | >=1.6.3  | critical |
| proxy-addr      | 2.0.7    | @google/genai > @modelcontextprotocol/sdk > express | >=2.0.8  | critical |
| fast-uri        | 3.1.5    | genai>mcp>ajv-formats>ajv ; serve>ajv               | >=3.1.8  | high     |
| brace-expansion | 1.1.18   | exceljs, serve (via minimatch)                      | 1.1.20+  | high     |
| brace-expansion | 2.1.4    | exceljs, serve                                      | 2.1.5+   | high     |
| image-size      | 1.2.1    | pptxgenjs                                           | >=2.0.3  | high     |
| compression     | 1.8.1    | serve                                               | >=1.8.2  | high     |
| hono            | 4.12.34  | **direct** (@trainers/api, @trainers/web)           | >=4.13.7 | moderate |
| ip-address      | 10.7.0   | genai>mcp>express-rate-limit                        | >=10.7.1 | moderate |
| dompurify       | 3.4.13   | jspdf                                               | >=3.4.16 | low      |

### Override di `pnpm-workspace.yaml` yang justru mengunci versi rentan

- `fast-uri: 3.1.5` → patched 3.1.8. Diperparah oleh `minimumReleaseAgeExclude: fast-uri@3.1.5` yang menahan versi patched.
- `brace-expansion@<2: 1.1.18` dan `brace-expansion@^2.0.1: 2.1.4` → keduanya di bawah patched.
- `dompurify: ^3.4.13` → rentan s/d 3.4.15, perlu `^3.4.16`.

Catatan: `serve` adalah dependency runtime `apps/web` (`start` script dipakai untuk serve staging), jadi tidak bisa dipindah ke devDependencies — perbaikannya harus lewat bump/override.

## Prioritas 1 — minor/patch (risiko rendah)

turbo 2.9.16→2.11.7 · vite 8.1.0→8.3.3 · @vitejs/plugin-react 6.0.3→6.1.2 · react/react-dom 19.2.6→19.3.0 (+@types 19.3.0) ·
@tanstack/react-router 1.170.4→1.170.41 · @tanstack/react-query 5.100.11→5.104.1 · @supabase/supabase-js 2.106.0→2.117.2 ·
@google/genai 2.9.0→2.27.0 · @hono/node-server 2.0.12→2.1.3 · hono 4.12.34→4.13.13 · eslint 10.4.0→10.12.0 ·
typescript-eslint 8.59.4→8.71.1 · prettier 3.8.3→3.9.9 · zustand 5.0.13→5.0.15 · recharts 3.8.1→3.10.1 · sonner 2.0.7→2.0.8 ·
docx 9.7.1→9.8.1 · pg + @types/pg · @playwright/test 1.60.0→1.63.0 · fast-check · postcss · globals · autoprefixer ·
tailwindcss + @tailwindcss/vite 4.0.7→4.3.3 (wajib naik bersamaan; `@tailwindcss/vite` dipin exact tanpa caret).

@google/genai: 2.14.0 menandai `LiveConnectConfig.GenerationConfig` deprecated; 2.18.0 menambah state `IDLE` di enum status koneksi Live. Pemakaian `generationConfig` ada di `apps/telefun/src/providers/GeminiLiveAdapter.ts:572` — uji Telefun setelah bump.

## Prioritas 2 — major (butuh rencana terpisah)

**typescript 5.9.3 → 7.0.2.** TS7 = compiler native Go, memakai default TS6 + hard error untuk konstruk deprecated di TS6.
Blocker konkret di repo ini:

- `apps/api/tsconfig.json` dan `apps/web/tsconfig.json` memakai `baseUrl` → hard error di TS7 (paths harus relatif project root).
- `apps/web/tsconfig.json` menyetel `esModuleInterop: false` → hard error.
- TS7 mendefaultkan `rootDir: ./` dan `types: []` → api/web/types perlu `rootDir` + `types: ["node"]` eksplisit.
- Jalur yang disarankan vendor: 5.9 → 6.0 (dengan `--stableTypeOrdering`) → 7.0.

**vitest 4.1.6 → 5.0.3** (+@vitest/coverage-v8 5.0.3). Butuh Vite >=6.4 (terpenuhi 8.1) dan Node >=22.12 (terpenuhi). 20+ breaking; yang bisa senyap: `clearMocks` sekarang default `true` → hasil assertion mock bisa berubah tanpa error.

**zod 3.25.76 → 4.6.5** (40 file import zod) + **@hono/zod-validator 0.8.0 → 0.9.1** (pasangan zod 4). Tersedia codemod resmi `zod-v3-to-v4`.

**framer-motion 12.39.0 → 14.0.0** (51 file). Tidak ada breaking di React v14; proyek sudah pindah nama ke paket `motion` (import `motion/react`).

**lucide-react 0.475.0 → 1.52.0** (163 file). v1 menghapus brand icons dan mengeset `aria-hidden` secara default.

**jsdom 29.1.1 → 30.1.2** · **@testing-library/jest-dom 6.9.1 → 7.0.1** · **cn 0.2.6 → 0.4.0**.

**ecc-universal ^1.10.0 → 2.2.3** — tidak dipakai di kode (hanya `package.json` root + `allowBuilds`). Kandidat hapus.

## Prioritas 3 — tooling / runtime

- **pnpm 11.5.1 → 12.9.1** (rewrite Rust, format lockfile sama). Peringatan: pnpm 12 melempar `ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS` bila ada key tak dikenal di `pnpm-workspace.yaml` dan project mem-pin `packageManager` (kasus repo ini) → `overrides` / `allowBuilds` / `minimumReleaseAgeExclude` harus valid saat migrasi.
- **Node**: `.node-version` = 22, `@types/node` dipin override ke 22.19.19, tetapi tidak ada field `engines` di paket mana pun → runtime Vercel/Railway berpotensi berbeda dari lokal. LTS tersedia: 22 Jod (22.23.3), 24 Krypton (24.21.0).
- Tidak ada `.github/` → tidak ada CI, renovate, atau dependabot; update dependency murni manual.
- Spec tidak konsisten: `@supabase/supabase-js` 3 range berbeda (^2.0.0 / ^2.48.1 / ^2.45.4), `typescript` 2 range (^5.0.0 / ^5.5.0).

## Urutan eksekusi yang disarankan

1. Tier 0 (security: perbaiki override + bump hono) di branch terpisah.
2. Tier 1 (minor/patch) di branch yang sama, lalu `pnpm typecheck` + `pnpm test:fast`.
3. Tier 2 satu paket per PR; jangan digabung karena TS7 dan Vitest 5 dapat mengubah hasil type-check/test secara diam-diam.

---

# Hasil eksekusi — 2026-10-06 (moy)

Semua branch **lokal, belum di-push**. Dasar branch berantai (stacked): merge berurutan dari atas ke bawah; tiap branch sudah termasuk branch di atasnya.

| #   | Branch                                  | Commit    | Isi                                                                                                                                |
| --- | --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `chore/deps-p0-security`                | `191dc60` | override security + hono; `pnpm audit --prod` 26 → **0**                                                                           |
| 2   | `chore/deps-p1-minor-patch`             | `0a441e4` | Tier 1 minor/patch; 3 range `@supabase/supabase-js` disatukan ke `^2.117.2` (memperbaiki error tipe duplikat-lib di e2e typecheck) |
| 3   | `chore/deps-major-remove-ecc-universal` | `d4d7b86` | hapus `ecc-universal` + entri `allowBuilds` (tidak diimpor di mana pun)                                                            |
| 4   | `chore/deps-major-framer-motion-14`     | `ffdd7aa` | `framer-motion` 12.39.0 → 14.0.0 (nama paket/import tidak diubah)                                                                  |
| 5   | `chore/deps-major-lucide-1`             | `5b1d991` | `lucide-react` 0.475.0 → 1.52.0 (162 file; brand icon tidak dipakai)                                                               |
| 6   | `chore/deps-major-zod-4`                | `1641a70` | `zod` 3.25.76 → 4.6.5 + `@hono/zod-validator` 0.9.1; `z.record()` diberi key type di 3 call site                                   |
| 7   | `chore/deps-major-typescript-7`         | `ed5fd21` | `typescript` 5.9.3 → 7.0.2 + side-by-side TS6 API (lihat catatan)                                                                  |
| 8   | `chore/deps-major-jsdom-30`             | `31f6ef4` | `jsdom` 29.1.1 → 30.1.2                                                                                                            |
| 9   | `chore/deps-major-jest-dom-7`           | `ceccc6e` | `@testing-library/jest-dom` 6.9.1 → 7.0.1                                                                                          |
| 10  | `chore/deps-major-cn-0-4`               | `25df48a` | `cn` 0.2.6 → 0.4.0 (masih export `cn`; ~20 komponen UI tidak berubah)                                                              |

## Baseline kegagalan tes (pre-existing, bukan efek bump)

- `pnpm test:fast` api: **7 gagal / 810 lulus (818)** — `auth-middleware` (1), `profiler-scope-filter` (5), `sidak-service` filterScope (1). Direproduksi di kondisi main yang sudah di-stash.
- web suite penuh (jsdom, `vitest run`): **7 file / 14 tes gagal / 1107 lulus (1121)**. Set file yang gagal identik di baseline, jsdom 30, dan jest-dom 7.
- `telefun-live-session-auth` gagal karena drift test vs kode: test masih expect `gemini-3.1-flash-live-preview`, sedangkan `DEFAULT_TELEFUN_LIVE_MODEL_ID = "gemini-3.8-live"` (commit `7435db0`). Bukan urusan dependency.

## Blocker & keputusan

### vitest 5.0.3 — DIBATALKAN (bug upstream)

`.rejects.toThrow(<string|RegExp>)` rusak di 5.0.3. Probe minimal di repo:

- vitest 4.1.6 → 4/4 lulus
- vitest 5.0.3 → 2/4 gagal: `TypeError: Cannot read properties of undefined (reading 'indexOf')`; bentuk regex memberi `expected [Function] to throw error matching /…/ but got ''`
- bentuk `.rejects.toThrow(new Error(...))` dan `try/catch` manual tetap bekerja

Repo punya **68** assertion pola ini (`grep -rE "\.rejects\.toThrow\(\s*[\"'/]"`). Upgrade ditunda sampai ada rilis 5.x yang memperbaiki; branch `chore/deps-major-vitest-5` sudah dihapus, `vitest` tetap 4.1.6. Catatan: `clearMocks` default `true` di v5 **bukan** penyebab kegagalan ini (sudah diuji dengan `clearMocks: false`).

### typescript 7.0.2 — perlu side-by-side TS 6 API

TS 7 tidak lagi mengirim API programatik, sehingga `typescript-eslint@8.71.1` crash: `typescript-eslint does not support TS 7.0`. Solusi resmi (Microsoft) dipakai di root `package.json`:

```json
"@typescript/native": "npm:typescript@^7.0.2",
"typescript": "npm:@typescript/typescript6@^6.0.2"
```

Hasil: API root = 6.0.2 (untuk eslint), `tsc` per-workspace = 7.0.2, `tsc6` = 6.0.3. Perubahan tsconfig yang **wajib** untuk TS 7:

- `apps/api`, `apps/web`: hapus `baseUrl` (opsi dihapus di TS 7; `paths` tetap relatif)
- `apps/web`: `esModuleInterop: false` → `true` (TS 7 hard error)
- `apps/api`: `rootDir: "../.."` eksplisit agar layout `dist/` tidak berubah (TS 7 mengubah default `rootDir` ke folder tsconfig)

## Catatan lain

- `AGENTS.md` ikut berubah di branch Tier 1: blok `<!-- BEGIN:turborepo-agent-rules -->` ditulis ulang otomatis oleh `turbo` 2.11.7 saat agen terdeteksi; turbo meminta blok itu tetap di-commit.
- `docs/dependency-audit-2026-10-06.md` tetap **untracked** (tidak pernah di-stage/commit/push), sesuai konvensi repo.

---

# Fase lanjutan — 2026-10-06

## 11. `chore/test-fix-stale-scope-tests` — `3506035`

Tes yang merah di `main` sejak refactor `2edf818` (sentralisasi data scope), bukan efek bump:

- `auth-middleware`: `qa` bukan role kanonik lagi (`ROLES = admin, trainer, leader, agent`) → middleware balas 403; tes diubah mengunci 403 + `next` tidak dipanggil.
- `profiler-scope-filter`: `getLeaderScopeSnapshot` pindah ke `services/access/leader-scope`; spy ke re-export `leader-access-service` tidak pernah mencegat pemanggil → spy dipindah ke modul kanonik.
- `sidak-service`: `filterScope` sekarang didorong ke query DB (`applyPesertaScope`), jadi fake query builder tidak bisa memfilter baris → fake helper mencatat call, dan tes mengunci `in('id', ['a1'])` yang dikirim service.
- `telefun-live-session-auth`: assert ke `DEFAULT_TELEFUN_LIVE_MODEL_ID`, bukan literal usang, supaya default tidak bisa drift diam-diam lagi.

Hasil: `test:fast` **hijau penuh** — api 72/72 file (817 lulus, 1 skip), web 67/67 file (560 lulus), telefun 38/38.

## 12. `chore/tooling-pnpm-12` — `0d10b9f`

- `packageManager` → `pnpm@12.9.1`. Key `pnpm-workspace.yaml` (overrides/allowBuilds) diterima tanpa `ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`; format lockfile tidak berubah.
- **Temuan baru:** audit pnpm 12 melaporkan `@modelcontextprotocol/sdk@1.30.0` (transitif `@google/genai`) sebagai **HIGH** — audit pnpm 11 melaporkan nol. Override `^1.31.0` ditambahkan, audit kembali 0. Artinya audit lama **under-report**.

## 13. `chore/tooling-engines-ci` — `609a9cc` + `edacbab`

- `engines.node: ">=22.12"` di root + 4 workspace (floor-nya berasal dari kebutuhan vite 8/vitest 4). Pin runtime deploy tetap `.node-version` = 22, sementara mesin lokal jalan Node 26 — perbedaan ini sekarang terdeklarasi, bukan tersembunyi.
- `.github/workflows/ci.yml`: `install --frozen-lockfile` → `lint` → `typecheck` → `test:fast` → `build` → `pnpm audit --prod` (blocking). Langkah `test:fast` kemudian dicabut di `cd16338` (lihat bagian terakhir).
- `.github/dependabot.yml`: minor/patch dikelompokkan per tipe dependency, **major sengaja tidak digrup** (butuh branch + verifikasi sendiri).

## Status akhir — 2026-10-07

Semua pekerjaan di dokumen ini sudah masuk `main` lewat tiga PR, masing-masing dengan merge commit supaya SHA asli tetap utuh:

- **#2** `feat/management-pages-redesign` → `eaa4e15`. Dua commit (`19aec69` redesign management pages, `4556ddb` docs RLS) yang sebelumnya hanya ada di `main` lokal dan ikut terbawa di branch lain. Di-merge lebih dulu supaya #1 dan #3 hanya berisi perubahannya sendiri.
- **#3** `test/sidak-jsdom-to-e2e` → `195f2cb`. Keenam spec jsdom yang merah sudah dipindah ke E2E hermetic lalu dihapus (copy "dari 3" dan "Lihat semua ranking" dikonfirmasi final). Pekerjaan ini menemukan bug nyata: `/sidak/ranking` mengabaikan `service_type`/`year` dari link dashboard; diperbaiki di `1621fa4` (plan: `plans/markdown/sidak-ranking-deep-link.md`). `ParetoChart` dan `ParetoImprovementInsight` yang tidak terpakai ikut dihapus. Rincian: `plans/025-migrate-web-unit-tests-to-e2e.md` (post-closure follow-up).
- **#1** `chore/tooling-engines-ci` → `26dd691`. Sebelum merge, branch di-update dari `main`, lalu CI `verify` dan E2E lokal dijalankan di atas dependency baru: `dashboard-trend-forecast`, `sidak-dashboard-insights`, `sidak-ranking`, `sidak-agent-detail`, `authenticated-shell`, `management-pages` → 42/42.

Catatan dari verifikasi #1:

- Playwright 1.63 butuh build Chromium baru. Setelah menarik `main`, jalankan `npx playwright install chromium` di `apps/web`; tanpa itu semua E2E gagal dalam milidetik dengan `Executable doesn't exist`.
- Di mesin dengan pnpm standalone (`@pnpm/exe`), `pnpm install` menambahkan entri `@pnpm/exe@12.9.1` ke `packageManagerDependencies` di `pnpm-lock.yaml`, bahkan dengan `--frozen-lockfile`. Itu spesifik mesin dan tidak di-commit; CI tidak menghasilkannya.

## Sisa yang belum dikerjakan

- `test:full` masih merah dengan kegagalan yang **sama persis seperti di `main` sebelum pekerjaan ini**:
  - api: 11 file / 52 test. Mock `../middleware/role` tanpa `requireCapability` (semua `pdkt-*-route`), export `TRAINER_ROLES` yang sudah hilang (`sidak-decomposition-structural`), pesan error yang sudah dimanusiakan (`leader-access-scope-rpc`), plus `auth-middleware`, `profiler-scope-filter`, dan `sidak-service`. Tiga yang terakhir diperbaiki `3506035`, sekarang sudah di `main`, jadi angka api seharusnya turun; belum diukur ulang.
  - web: 3 file / 9 test. `sidak-dashboard-forecast-state` (`Link` tanpa router), `telefun-scenario-description-limit` (tombol "Masalah"), `telefun-live-session-auth` (ID model).
- `test:fast` tetap di luar CI sampai ada persetujuan dan injeksi env (lihat bagian berikut).
- `vitest` 5 tetap ditahan (bug upstream, lihat di atas).
- Kosmetik: sparkline `KpiCard` di `/sidak/dashboard` memakai `ResponsiveContainer` tanpa `initialDimension` dan mencetak peringatan Recharts `width(-1) and height(-1)`.

## Langkah CI dikecualikan dulu (`cd16338`)

CI pertama **gagal** di `pnpm test:fast`, bukan karena bump: `apps/api/src/lib/env.ts` memuat `.env.local` lalu `process.exit(1)` kalau env wajib tidak ada. Di mesin lokal `.env.local` ada; di runner bersih tidak ada → 14 file spec mati dengan pesan menyesatkan `[vitest] There was an error when mocking a module` + `process.exit unexpectedly called with "1"`. Angka CI: 738 lulus, 1 skip (bukan 817 seperti lokal).

Langkah tes **dicabut dari CI** untuk sekarang, bukan diperbaiki dengan injeksi env, karena AGENTS.md mewajibkan persetujuan Fajar sebelum menambah/menjalankan non-E2E test dan menganggap manifest unit suite sebagai legacy inventory. CI sekarang: install frozen → lint → typecheck → build → `pnpm audit --prod` (blocking). Alasan ini ditulis sebagai komentar di `ci.yml` supaya tidak "diperbaiki" orang lain tanpa konteks.
