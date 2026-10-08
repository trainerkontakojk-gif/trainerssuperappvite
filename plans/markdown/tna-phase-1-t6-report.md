# TNA Fase 1 — Laporan T6

## Status

**T6 selesai — thermo-nuclear: PASS untuk Fase 1 dengan batas verifikasi browser yang diminta Fajar.** Lane D; rencana `tna-phase-1.md` rev. 7. Tidak ada temuan material tersisa pada scope review. Ini self-review sesi utama, bukan review independen atau sertifikasi keamanan/WCAG.

Gate akhir: **53/53 spec API lulus**, root typecheck/lint/build exit 0, `git diff --check` exit 0 termasuk file baru melalui intent-to-add. Lint web memiliki **94 warning existing**, tanpa error; tidak diperbaiki di luar scope TNA.

Tidak menjalankan config browser default, unit/Vitest, root dev server, commit, push, deploy, atau migrasi lokal/remote. Bukti browser T5 yang diterima Fajar dipakai sebagai bukti historis; polesan copy/empty state T6 diperiksa sumber dan compile, **tidak diklaim terverifikasi browser baru**. Perbaikan config default yang memakai Supabase hosted adalah tugas terpisah.

## Scope review thermo-nuclear

Review mencakup diff produk/test TNA T0–T5 yang dilacak maupun sebelumnya untracked: shared types/capability, router/app API, seluruh `services/tna/*`, migrasi SQL, lima spec API dan helper fixture/transport/config, empat halaman/form/utilitas TNA, router web, APP_MODULES, rail/drawer/breadcrumb, token, access matrix, spec flow dan kontras. Laporan T0–T5 dipakai sebagai konteks historis, bukan pengganti pemeriksaan live code dan gate baru. File `.claude/launch.json` dan pekerjaan investigasi crash lain tidak diubah.

### Hasil penelusuran boundary

- **Akses:** semua endpoint TNA ada di auth v1 dan capability read/write admin/trainer; nav dan route guard mengikuti katalog capability. Leader/agent tidak diberi akses, bahkan dengan approval SIDAK/KTP. API nyata membuktikan 401/403 dan sukses role yang diizinkan.
- **JWT/RLS:** pembacaan metrik, metadata, katalog, kebutuhan, rencana/roster, dan validasi peserta memakai client JWT pengguna. Lima mutasi saja memanggil service-role RPC di write-service, dengan actor middleware dan guard SQL profil aktif admin/trainer. Activity log memakai service best-effort existing; bukan bagian transaksi RPC.
- **RPC/guard:** lima entry point public memanggil guard claims service-role sebelum validasi bisnis. EXECUTE klien sengaja tetap tersedia untuk menghindari bug crash saat ACL ditolak; hasil user/anon adalah `42501 TNA_FORBIDDEN`, bukan izin mutasi. Helper/trigger di schema `tna_internal` tidak terjangkau PostgREST. Pencarian migrasi tidak menemukan fungsi exposed lain yang memasang `request.jwt.claims` atau menerima nama GUC bebas dari input.
- **Persistensi/race:** create plan/roster dan edit draft/roster atomik; revision check + lock menolak stale edit/transisi bersamaan. Baseline hanya NULL → beku pada aktivasi; roster final dicocokkan di RPC. Trigger berlaku juga untuk service-role; marker tidak dapat menimpa baseline yang terisi atau membuka INSERT/DELETE. FK cleanup peserta tetap mempertahankan snapshot. Tidak ada endpoint delete permanen TNA.
- **Metrik:** QA dipaginasi penuh dan diurutkan id, agent non-service dikeluarkan, tiga bucket SIDAK dipertahankan. No-audit menghasilkan null, clean/phantom-only audit menghasilkan angka nol; tren dan urutan kandidat mengikuti implementasi rev. 7 yang diterima. Baseline dihitung ulang pada request aktivasi; preview tidak dipersist.
- **Error/types:** body metrik/actor need di-strip; plan/transisi strict; error bisnis 409/422 manusiawi, error DB tak dikenal 503 tanpa pesan mentah. Route chaining mempertahankan AppType/Hono RPC; browser mutations tetap menggunakan transport auth existing. Tidak ada dependency/AI/arsitektur baru atau file TNA >1.000 baris.

### File lintas modul yang wajib direview

- `apps/api/src/lib/scoring.ts:180–216`: `MAX_SAMPLING = 5` dan `getTemuanSessionKey()` adalah **pure lift** dari fungsi lama. Trim/fallback berbasis waktu/periode/indeks, grouping, pemilihan lima sesi terburuk, padding, dan formula skor tidak berubah. Tidak mengubah scoring lain di T6.
- `apps/api/src/services/sidak/dashboard-aggregation.ts:30–35`: signature `getScoreRows` menjadi generic; implementasi filter real/fallback phantom-only identik. TNA memanggilnya per agent+layanan+periode. Gate API mixed real+phantom dan paginasi 1.250 row lulus; tidak mengklaim seluruh browser dashboard SIDAK diuji ulang.
- `apps/web/src/components/layout/MobileDrawer.tsx:40–43,99`: exact path atau prefix dengan pemisah `/` menghindari false-active pada prefix modul lain; dashboard tetap exact-only. `aria-current` hanya untuk modul aktif; filter capability, penanganan maintenance Telefun, onClose, dan management links tidak berubah. Tidak menambah TNA ke MobileTabBar atau mengubah drawer lagi di T6. Bukti drawer/browser tetap T5.

## Temuan dan perbaikan

| Severity / lokasi                         | Bukti dan dampak                                                                                        | Perbaikan / verifikasi                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2 — `narrative.ts:41,70`, `index.tsx:64` | Narasi memakai kode `chat`; select memakai uppercase kode, bukan label SIDAK.                           | Pakai `SERVICE_LABELS` existing pada API dan web; **RED nyata** `(Chat)` vs `(chat)`, kemudian GREEN audited/no-audit dan full gate. Label SIDAK (`Call`, `Chat`, dst.) dipertahankan, tidak membuat terjemahan layanan baru. |
| P2 — `utils.ts:15`, index/need/plan       | Status internal seperti `draft`/`dibatalkan` tampil mentah.                                             | Map typed `Record<TnaPlanStatus,string>`: Draf/Aktif/Evaluasi/Selesai/Dibatalkan di daftar/detail. Assertion browser diadaptasi untuk Draf/Dibatalkan; tidak dijalankan pada T6.                                              |
| P2 — `index.tsx:137`                      | Flag insufficientData true pada daftar kosong menambah pesan “Data belum cukup” di samping empty state. | Pesan mensyaratkan `items.length > 0`; banner no-audit dan empty state tetap. Assertion browser empty/retry ditambah, pemeriksaan runtime browser ditunda sesuai instruksi.                                                   |
| P3 — `e2e/helpers/tnaApi.ts`              | Log status tiap request noisy; isolasi limiter tetap diperlukan.                                        | Hapus console.log saja; hash testId/IP bucket, auth/header/body dan request adapter tidak berubah. Full gate lulus; API produk masih mencatat status dan tidak ditemukan TNA 429.                                             |
| P3 — `metrics.ts:30`                      | Komentar menyebut dua bucket dan sesi audit-presence, tidak sesuai implementasi rev. 7.                 | Komentar tiga bucket: audit presence → populasi, scoreRows → sesi, findings → temuan; tidak mengubah formula.                                                                                                                 |
| P2 — dokumentasi TNA                      | Modules masih mengatakan UI T5 belum ada; database/auth belum mendokumentasikan boundary TNA.           | Sinkronkan modul/UI/API, tabel/indeks/RLS/lima RPC/trigger/schema privat, alasan guard crash, capability dan batas service-role, serta navigasi docs/config gate API-only.                                                    |

Tidak ditemukan P0/P1 baru yang memerlukan perubahan produk tambahan. Tidak memperluas review menjadi refactor shared hook, pengelolaan katalog, dukungan indikator unmapped, akses leader, atau evaluasi Fase 2.

## Files T6

- API: `apps/api/src/services/tna/{narrative,metrics}.ts` (label layanan; komentar bucket).
- UI: `apps/web/src/routes/tna/{index,need,plan}.tsx`, `utils.ts` (status/layanan/empty message).
- E2E: `apps/web/e2e/tna-plan-api.spec.ts` (label narasi audited/no-audit), `tna-flow.spec.ts` (label dan empty state; tidak dijalankan), `helpers/tnaApi.ts` (hapus log).
- Docs: `docs/{modules,database,auth-rbac,README}.md`.
- Plan/report: `plans/markdown/tna-phase-1.md`, laporan ini. Dirty work T0–T5 dipertahankan; intent-to-add hanya untuk pemeriksaan diff file baru, tidak men-stage konten.

## RED → GREEN dan gate

Semua runner/gate dieksekusi serial. Flag Turbo `--concurrency=1` membatasi satu task workspace aktif; tidak mengubah script/config repo. Remote caching dilaporkan disabled oleh Turbo.

| Perintah                                                                                                                                                                       | Exit / hasil                                                                                                | Log                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------- |
| `pnpm --filter @trainers/web exec playwright test tna-plan-api.spec.ts --config=playwright.api.config.ts --project=tna-real-backend --grep='D9 renders'` (setelah lokal aktif) | **1**, RED sah: expected `(Chat)`, actual `(chat)` pada narasi GET plan                                     | `/tmp/tna-t6/red.log`       |
| `pnpm --filter @trainers/web exec playwright test tna-plan-api.spec.ts --config=playwright.api.config.ts --project=tna-real-backend --grep='D9 renders\|no-audit draft'`       | **0, 2 passed**                                                                                             | `/tmp/tna-t6/green.log`     |
| `pnpm --filter @trainers/web exec playwright test --config=playwright.api.config.ts --workers=1`                                                                               | **0, 53 passed**: gate-stub 24 + real-backend TNA 29, tanpa skip/retry                                      | `/tmp/tna-t6/api-gate.log`  |
| `pnpm typecheck --concurrency=1`                                                                                                                                               | **0**, 4 workspace sukses, termasuk web E2E typecheck; semua cache miss                                     | `/tmp/tna-t6/typecheck.log` |
| `pnpm lint --concurrency=1`                                                                                                                                                    | **0**, 4 workspace sukses; web 0 error / 94 warning existing (jumlah sama dengan T5), tidak ada warning TNA | `/tmp/tna-t6/lint.log`      |
| `pnpm build --concurrency=1`                                                                                                                                                   | **0**, 3 task sukses, cache miss; produksi API/Telefun/web, tidak deploy                                    | `/tmp/tna-t6/build.log`     |
| `GRAPHIFY_MAX_WORKERS=1 graphify update . --no-cluster`                                                                                                                        | **0**, AST/cache lokal diperbarui, satu worker, tanpa LLM/subagent                                          | `/tmp/tna-t6/graphify.log`  |
| `git add -N <file baru TNA produk/test/migrasi/laporan T0–T4,T6>` kemudian `git diff --check`                                                                                  | **0**, mencakup file sebelumnya untracked                                                                   | Output kosong               |

Regression artifact API dapat diulang lewat command full gate di atas: config tidak memiliki webServer, projects dipisahkan untuk mencegah module-env stub bercampur dengan real backend, workers 1, retries 0. Fixture random namespace/SQL serta JWT Supabase nyata; endpoint API/DB diperiksa loopback `127.0.0.1:54321/54322` sebelum akses, dan fetch guard menolak egress non-loopback. Tidak ada provider AI dipanggil.

### Kegagalan awal yang sudah dijelaskan

Sesi pertama berhenti **STOP S5** karena database lokal Connection refused dan socket OrbStack tidak aktif. Percobaan CLI awal juga exit 1 karena flag `--project` variadic mengonsumsi nama spec. Setelah Fajar menyatakan lokal aktif, stack Supabase repo terverifikasi healthy dan command memakai `--project=...`; RED sah lalu GREEN/gate selesai. Tidak mengulang crash guard, reset database, memulai infrastruktur otomatis, atau melemahkan assertion.

Prettier awal exit 2 karena glob menargetkan `utils.tsx` padahal file `utils.ts`; diperbaiki dengan command `pnpm exec prettier --write apps/web/src/routes/tna/utils.ts` (exit 0). Formatting file lain berhasil; reformat tabel historis di luar TNA dikembalikan agar diff tetap scoped. Plan/report dan source final diperiksa kembali. Scoped lint `pnpm --dir apps/web exec eslint src/routes/tna e2e/helpers/tnaApi.ts e2e/tna-plan-api.spec.ts e2e/tna-flow.spec.ts` exit 0, tanpa warning (`/tmp/tna-t6/scoped-lint.log`). `pnpm exec prettier --check` pada source T6, README/modules, dan laporan ini exit 0; heading/target dokumentasi TNA diperiksa struktural dengan Python (exit 0). Final `git diff --check` exit 0; `git diff --name-only --cached` kosong.

Graphify query awal `--help` tidak diperlakukan CLI sebagai bantuan; retry path write-service memberi hubungan tidak relevan untuk analisis boundary. Fallback ke imports/callers live, `rg`, tipe/schema/tests/diff. Tidak menambah external API/dependency atau mengubah kontrak library; Context7 lookup baru tidak diperlukan (kontrak Hono existing T4/T5 dipertahankan).

## Kesehatan dan cleanup lokal

Pemeriksaan read-only setelah full gate:

- `docker logs supabase_db_trainerssuperappvite --since <waktu mulai API gate>` exit 0: **signal 11 = 0**. Log API: **PGRST000 = 0, PGRST001 = 0, respons TNA 429 = 0**.
- `docker exec ... psql -U postgres -d postgres -Atc <query counts>` exit 0: kebutuhan/rencana/roster TNA, QA/peserta fixture, akun `e2e-browser-*`, aktivitas TNA, program nonaktif fixture semuanya **0**.
- Tidak ada runner Playwright/Turbo/dev server milik task tersisa; Supabase yang diaktifkan pengguna tetap berjalan, tidak dihentikan.

Tidak mengklaim backend membaca QA dan aktivasi RPC dalam satu transaksi yang mengunci QA: baseline berasal dari pembacaan backend pada request, sedangkan RPC menjamin revision/roster/transisi atomik. Grant/guard/migrasi tidak diubah pada T6. Keberhasilan lokal bukan izin migrasi remote.
