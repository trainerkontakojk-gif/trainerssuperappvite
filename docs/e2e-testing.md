# E2E testing — `apps/web`

Policy (target safety, lanes, gates, when a non-E2E test needs approval) lives in
[`AGENT_WORKFLOW.md`](AGENT_WORKFLOW.md) §7. This document is only the practical map of the
harnesses in `apps/web/e2e/` and the traps already paid for.

## Two sanctioned patterns

| Pattern                                        | Helper                                                                                                                               | Requires                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Hermetic** — mock every `/api` the page uses | `helpers/hermeticShell.ts`, or a feature harness such as `helpers/sidakTemuanDatesHarness.ts` / `helpers/sidakAgentReportFixture.ts` | nothing                                    |
| **Real backend** — real JWT, real Hono routers | `helpers/sidakRealBackend.ts`                                                                                                        | `apps/api/.env.integration`, loopback only |

## Dev server and service targets

`playwright.config.ts` and `playwright.access-web.config.ts` start **only** the web Vite dev
server (`pnpm --filter @trainers/web dev`), never the root `pnpm dev`: that one also boots the API
and Telefun with the root `.env`, which points at production, and the API's startup schedulers then
write to production. No browser spec needs those processes. Hermetic specs mock `/api`, and
real-backend specs forward `/api` to the in-process Hono app.

- The server gets `E2E_WEB_SERVER_ENV` from `helpers/e2eTargets.ts`. It points Supabase and Telefun
  at `127.0.0.1:9`, where nothing listens, so a request a spec forgot to mock fails on this machine.
  Mock Supabase paths against `E2E_SUPABASE_URL` / `E2E_SUPABASE_STORAGE_KEY`, never a project URL.
- `reuseExistingServer` is `false`. If `:3005` is busy (for example your own `pnpm dev`), the run
  fails instead of testing against a server whose env cannot be verified. Stop that server first.
- `e2e-target-isolation.spec.ts` guards both properties.
- The browser configs ignore `*-api.spec.ts`. API specs run under `playwright.api.config.ts` or
  `playwright.access-api.config.ts`, one project per env, because a shared worker leaks one spec's
  API env stubs into the next. A new API spec needs a project in one of those configs, or it never runs.

## Real-backend specs: never import `apps/api` statically

`apps/api/src/lib/env.ts` loads the root `.env.local` (production) and parses env once, at first
import; `lib/supabase.ts` builds `supabaseAdmin` from it. A spec that imports in-process API modules
must pin the loopback env first and load **every** `apps/api` module with a dynamic `import()` inside
that pin, then assert `lib/env` is loopback (`loadApiModules()` in `sidak-temuan-dates-api.spec.ts`).
A static `import … from "../../api/src/…"` is hoisted above the pin and binds the whole worker to
production. The fetch guard blocks the traffic, so the symptom is unexplained 400/500 responses,
not egress. The `[API] Supabase client initialized for project …` log line shows which project won.

## `mockSupabaseAuth` is UI-only

`helpers/mockAuth.ts` makes the app _believe_ it is logged in; its `access_token` is not a
JWT, and `apps/api` rejects it with `401 INVALID_TOKEN` (proven with a direct probe). A spec
that mocks auth and then calls the real `/api` can never pass. Use the hermetic pattern, or
`sidakRealBackend` for real data. Full rationale: [`plans/markdown/e2e-mocked-auth-contract.md`](../plans/markdown/e2e-mocked-auth-contract.md).

## Hermetic harness rules

- One fail-closed route handler owns every request: the local dev origin, the mocked Supabase
  auth paths, and the `/api` paths on the caller’s allowlist. Anything else is aborted.
- `expectHermetic(audit)` asserts no unmocked `/api`, no unmocked auth path, and no external egress.
- Call `waitForMockedApi(audit, [...])` **before** `expectHermetic`. Without it the check can pass
  vacuously: the initial fetches are still in flight, so `blockedApi` is empty because nothing has
  been requested yet.
- `expectedThirdPartyHosts` declares known decorative assets (for example the OJK logo on the KETIK
  and PDKT landings). They are still aborted — no egress — but not counted as unexpected traffic.
- **Mock resolution is first-match-wins.** The harness resolves `/api` mocks with `.find()`, so an
  override list must be spread **before** the defaults. An override appended last is silently
  ignored, and the resulting failure looks like a product bug rather than a fixture mistake.
- Run `assertLocalDevOnlyTarget()` in `beforeAll`; it proves the target is this repo’s Vite dev
  server and that the `/api` proxy points at loopback.

## Fixture shapes

- **API rows are not client types.** `/api/v1/telefun/sessions` returns DB rows (`scenario_title`,
  `scoring_status`, …) which `mapTelefunSessionRow` maps to `CallRecord`. A camelCase fixture
  renders **empty rows with no error**, and the network guard stays silent because nothing leaked.
  Assert mapped fields explicitly so this fails loudly.
- Prefer shared constants and builders over hand-written copies: `DEFAULT_KETIK_SETTINGS` and
  `TEXT_SIMULATION_MODELS` from `@trainers/types`, `emptyUsageBreakdown()` from `src/lib/usage-snapshot.ts`.
  Then the spec fails when the UI drifts from the shared contract instead of going stale.

## Measurement and timing traps

- **Touch-target size:** measure `offsetHeight`, not `getBoundingClientRect()`. A dialog enter
  animation scales the box (44px renders as 41.8px = 44 × 0.95) and the rect-based assertion fails
  falsely.
- **Cold Vite module graph:** the first assertion of a heavy page can exceed the 5s `expect` budget
  right after a file change. `openAgentDetail()` therefore sets an explicit 20s budget. Note that
  `test.slow()` protects the test timeout, not `expect.timeout`.
- **Text matching is substring-based:** `getByText(string)` and `getByRole(name)` both match
  substrings, so `"Gemini 3.5 Flash"` also matches `"Gemini 3.5 Flash Lite"` and `"Lainnya"` also
  matches `"+ Tambah Kategori Lainnya"`. Scope the locator to a dialog and use `exact: true`.
- **Number formatting follows the browser locale.** `toLocaleString()` renders `15000` as `15,000`
  under en-US, so a text assertion such as `/15\.000/` fails for a reason unrelated to the app.
  Assert the input value or another locale-independent property instead.
- **A 401 is usually not an inline error.** A global session handler can react before the
  component’s own error path, so the user-visible outcome is a return to the landing page rather
  than the friendly text a `mapError` helper would produce. Assert the outcome the user actually
  gets — it is the stronger contract anyway.

## KETIK — riwayat penuh (paket D)

- `ketik-history-api.spec.ts` / project `ketik-history-real-backend`: JWT/Hono/DB loopback asli; 65 sesi, timestamp sama (microseconds), batas bulan WIB, owner lain, pagination stabil, filter/search literal, summary, cursor/limit invalid, detail owner, kegagalan DB aman dan RPC anon/authenticated ditolak. Fixture tambahan 2.001 sesi membuktikan count tidak terpotong oleh cap PostgREST. EXPLAIN sebelum/sesudah indeks memakai fixture yang sama; attachment payload membandingkan bentuk respons HTTP lama (50 sesi dengan transkrip) dan baru (20 ringkasan). Rollback/reapply hanya di DB loopback, mempertahankan jumlah/skor.
- `home-agent.spec.ts`: fixture page KETIK tanpa messages membuktikan integrasi Beranda dengan kontrak pagination, riwayat gabungan KETIK/PDKT, state kosong dan kegagalan sebagian.
- `ketik-history-browser.spec.ts`: hermetic dengan 205 sesi; deep-link lama dan detail retry, pagination server, race search, replay/focus, CSV seluruh halaman dan hasil filter, kegagalan ekspor tanpa file parsial, screenshot 390/1280px. Bukan bukti backend nyata; suite API membuktikan batas backend dan regresi JWT browser sesi menguji integrasi transport nyata.

```bash
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-history-real-backend --workers=1 --trace on
pnpm --filter @trainers/web exec playwright test ketik-history-browser.spec.ts --workers=1 --trace on
```

Artifact di `apps/web/test-results/` ignored dan dapat memuat auth lokal; jangan commit.

## KETIK — integritas dan kegagalan

- `ketik-integrity-api.spec.ts` (`ketik-integrity-real-backend`) memakai JWT nyata
  dan PostgREST/RLS lokal untuk membuktikan INSERT skor/status langsung ditolak,
  penyimpanan backend tetap berhasil, read/update owner tidak melonggarkan RLS,
  serta atribusi peserta tetap dibatasi trainer/admin. Terapkan migration
  `20261015120000_ketik_history_backend_insert_only.sql` pada database disposable
  sebelum GREEN; rollback mengembalikan kegagalan tes INSERT yang sama.
- `ketik-errors-api.spec.ts` (`ketik-errors-real-backend`) memakai Hono/auth/DB nyata
  dan menyuntik kegagalan pada batas HTTP database/provider. Provider tidak
  dihubungi; detail internal sentinel tidak boleh muncul pada respons publik.
  Spec juga memeriksa primary/fallback model, polling/worker, dan konflik settings.
- `ketik-assignment-api.spec.ts` (`ketik-assignment-real-backend`) memakai JWT,
  Hono, dan database nyata untuk copy training tanpa identitas/template trainer,
  edit pribadi/source isolation, version conflicts dan request bersaing, role/RLS,
  serta direct RPC denial. Trigger gagal bernamespace milik run membuktikan
  rollback transaksi settings + provenance; kegagalan HTTP membuktikan error aman.
  Terapkan migration `20261015130000_ketik_configuration_assignments.sql` setelah
  migration history di atas. Rollback/reapply dilakukan eksternal pada DB disposable.
  Tidak ada panggilan provider atau test UI penugasan dalam tahap fondasi ini.
- `ketik-session-api.spec.ts` (`ketik-session-real-backend`) membuktikan
  snapshot, assignment wajib, strict input, idempotensi/versi/expiry, failed retry,
  race/reclaim/fencing, RLS/RPC denial, finalisasi atomik dan penolakan legacy 410.
  Terapkan migration `20261015140000_ketik_server_sessions.sql` setelah dua di atas.
  Provider hanya HTTP fixture deterministik; tidak ada request keluar/biaya AI.
- `ketik-server-chat.spec.ts` membuktikan antrean serial, typing/Send/Enter saat
  loading, failed resume/retry, expiry, assignment error/retry tanpa auto-start,
  serta dialog konflik/sukses 390px/1280px, keyboard/focus dan target 44px.
- `ketik-session-browser.spec.ts` opt-in dengan `E2E_KETIK_LIVE=1`: session/JWT
  Supabase asli, auth/profile lokal dan semua API Hono nyata melalui bridge
  transport browser (bukan mockAuth atau stub service). Mulai → gagal provider →
  retry UUID sama → dua turn → reload → finish → telaah manual; pesan dalam prompt
  review harus sama persis dengan history. Guard menolak egress lain, provider
  hanya respons HTTP lokal, dan fixture/usage dihapus. Tanpa flag, tes di-skip;
  flag bukan pengganti guard env/target loopback. Trace berisi auth lokal: jangan commit.
- `ketik-flow.spec.ts` membuktikan settings gagal dengan/tanpa backup tidak bisa
  memulai simulasi, retry gagal tetap gagal, dan retry sukses tidak otomatis
  memulai chat. Screenshot error desktop/mobile disimpan pada output tes.

Jalankan serial:

```bash
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-integrity-real-backend --project ketik-errors-real-backend --project ketik-assignment-real-backend --project ketik-session-real-backend --workers=1 --trace on
pnpm --filter @trainers/web exec playwright test ketik-flow.spec.ts ketik-server-chat.spec.ts --workers=1 --trace on
E2E_KETIK_LIVE=1 pnpm --filter @trainers/web exec playwright test ketik-session-browser.spec.ts --workers=1 --trace on
```

## Repository hygiene

`apps/web/test-results/` is run output: it is gitignored and no longer tracked, because every
Playwright run deletes its contents and used to dirty the tree on every invocation.

## Layout

One spec per module flow under `apps/web/e2e/`. Shared fixtures and harnesses live in
`apps/web/e2e/helpers/`; keep a harness free of feature-specific state when more than one spec uses it.

## KETIK — worker telaah persisten (paket E)

`ketik-review-worker-api.spec.ts` / project `ketik-review-worker-real-backend`
menggunakan JWT, Hono, Postgres/RLS asli pada loopback. Worker dijalankan sebagai
child process entrypoint produk dengan `helpers/ketikWorkerTransport.mjs` preload
**test-only**: HTTP SDK provider dialihkan ke server fixture loopback, egress lain
ditolak, tidak ada service bisnis/penilaian yang di-stub. Coverage mencakup POST
202 tanpa AI sebelum worker aktif, duplicate enqueue, usage pemilik, health,
SIGKILL/restart/reclaim, fencing worker lama yang masih hidup, lease NULL,
tiga attempt maksimum, rollback persist tanpa kehilangan hasil lama, SIGTERM,
role/assignment/revocation, RPC denial termasuk JWT admin/anon, token SELECT
denial, serta migration rollback/reapply tanpa kehilangan skor. Disabled/invalid
activation diuji lewat proses produk yang exit 1 sebelum claim/provider.
Preload test-only memakai SIGUSR2 untuk memajukan clock child dan membuktikan
health memburuk saat task melampaui usia lease; produk tidak memiliki clock seam
atau handler sinyal tersebut. Parameter claim/release NULL juga diuji terhadap
guard database.

`ketik-review-worker-browser.spec.ts` membuktikan agen memicu telaah manual,
provenance legacy, queued/processing yang jujur, polling gagal/retry tanpa raw
error atau timeout browser palsu, hasil rerun lama setelah reload, dan response
polling terlambat. Screenshot 390/1280px serta assertion overflow disimpan di
artifact ignored. `ketik-flow.spec.ts` memakai matriks izin baru; tidak ada
POST review saat membuka sesi atau finish chat. E2E JWT browser sesi menjalankan
runtime worker produk terhadap DB/provider test yang sama, tanpa auto-review;
worker child-process/restart dibuktikan oleh suite API terpisah.

```bash
pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-review-worker-real-backend --workers=1 --trace on
E2E_KETIK_LIVE=1 pnpm --filter @trainers/web exec playwright test ketik-review-worker-browser.spec.ts ketik-flow.spec.ts ketik-session-browser.spec.ts --workers=1 --trace on
```

Setelah coverage read-only polling/no-job/processing/missing-result lulus,
`ketik-review-lifecycle.test.ts` dan entri tepatnya di dua manifest legacy dihapus,
beserta resolver state lama yang tidak lagi dipakai runtime. Unit suite lain
tetap inventory legacy dan tidak dijalankan sebagai gate fase E.
