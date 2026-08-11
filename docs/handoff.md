# Handoff — Telefun OpenAI WebRTC Phase 5/6

- Generated: `2026-08-11T00:29:31Z`
- Last updated: `2026-08-11T05:32:15Z`
- Repository: `trainerssuperappvite`
- Candidate branch: `candidate/telefun-webrtc-phase6-20260811`
- Deployed staging application candidate: `2b2545ba90e8d1e50913236c7353729f4ef8ed65`
- Source-repair base: `8e9fdc3621f0f812f5a655e4935b2dd736b5b27f`
- Current repository identity: selalu cek `git branch --show-current` dan
  `git rev-parse HEAD`. Branch dapat berada di atas deployed candidate karena
  commit dokumentasi-only tidak ikut di-deploy.

## Purpose

Dokumen ini adalah titik lanjut untuk sesi/operator berikutnya. Ia memisahkan pekerjaan yang sudah selesai, bukti yang tersedia, pekerjaan yang belum diproses, dan guardrail agar operasi production tidak dijalankan ulang secara membabi buta.

## Current status

| Area                                    | Status                              | Meaning                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser SDP source repair               | **PASS, provider-free**             | Trigger `.trim()` direproduksi; canonical SDP diterima Chromium 10/10 dan legacy trimmed ditolak 10/10.                                                                  |
| Hosted Phase 5 database subgate         | **PASS**                            | Production lifecycle reconciliation serta canonical rollback/reapply selesai dan diverifikasi.                                                                           |
| Staging Web/API/Telefun                 | **PASS, restored flags off**        | Web/API/Telefun sehat HTTP 200; API dan Telefun kembali `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false` setelah paid smoke.                                                    |
| P1 authenticated provider-free gate     | **PASS**                            | Existing test account memuat profile dan PhoneInterface; capability/UI tetap disabled saat flags off, tanpa provider call atau durable mutation.                         |
| P02 source/artifact attestation         | **PASS with docs-only boundary**    | Railway terhubung ke candidate branch; docs HEAD `929d53a` dan non-doc application tree terbukti identik dengan deployed application candidate `2b2545b`.                |
| P2 provider-free runtime/browser drills | **PASS, bounded scope**             | Deny-all/restart/off restoration, emulated browser/device, fake mic, local peer/data channel, serta offline recovery lulus; physical device/cross-replica tidak diklaim. |
| Authorized paid OpenAI WebRTC smoke     | **PARTIAL PASS / STABILITY FAIL**   | Satu call tersambung dan mempersist transcript/usage/cost/recording, lalu berakhir sekitar heartbeat pertama karena distributed lease loss; tidak ada paid retry.        |
| Lease-renewal repair                    | **DB APPLIED / APP DEPLOY PENDING** | Exact ambiguity direproduksi dan migration additive terverifikasi di production canonical; candidate Telefun baru belum di-deploy.                                       |
| Phase 6 production rollout              | **NO-GO**                           | Connect/persistence/cleanup lulus, tetapi stable-call gate gagal sampai lease renewal diperbaiki dan diverifikasi ulang dengan authorization baru.                       |
| Commit/push                             | **DONE on candidate branch only**   | Application candidate dan docs follow-up terdahulu hanya dipush ke branch candidate; `main` dan production application tidak disentuh.                                   |

## Explicit scope and authorization

Fajar menjelaskan bahwa project ini tidak mempunyai staging database dan mengotorisasi database production canonical sebagai target, dengan syarat:

- hanya boundary **Telefun OpenAI WebRTC** yang boleh disentuh;
- database domain lain tidak boleh dirusak;
- jalur Telefun Gemini tidak boleh berubah;
- operasi wajib preflight-first, mempunyai private backup, exact-state precondition, dan post-write verification.

Authorization database tersebut hanya mencakup pekerjaan database yang dicatat di bawah. Secara terpisah, pada 2026-08-11 Fajar mengotorisasi commit/push ke branch candidate dan deployment **staging-only** Web/API/Telefun dengan WebRTC awalnya tetap off. Setelah P1/P02/P2 provider-free gates selesai, Fajar memberi authorization tambahan yang terbatas pada **satu** paid staging smoke untuk satu existing test account, model `gpt-realtime-2.1`, zero retry, dan temporary flag enablement.

Authorization paid tersebut sudah digunakan dan ditutup. Satu call dijalankan, tidak diulang, lalu API dan Telefun dikembalikan ke `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false`. Authorization itu tidak dapat dipakai ulang untuk:

- paid retry atau provider call baru;
- production application deployment;
- production database mutation baru;
- perubahan Gemini atau legacy OpenAI.

Pada `2026-08-11`, setelah exact lease-renewal repair lulus lokal, Fajar memberi
authorization baru yang terpisah untuk:

- apply hanya migration `20260811044655` ke production database canonical;
- commit dan push repair ke branch candidate, bukan `main`;
- redeploy runtime staging yang diperlukan dengan WebRTC tetap off saat rollout;
- setelah seluruh provider-free gate lulus, enable satu paid call manual pada
  existing account/model/voice yang sama, maksimum 30 detik, budget maksimum
  USD `0.10`, dan zero retry; setelah satu attempt, flags wajib dipulihkan off.

Semua credential, token, account identifier, raw transcript, dan provider secret tetap di luar repository. Batas production serta Gemini tetap dipertahankan.

## Completed work

### 1. Browser-side connection repair evidence

- Source sebelum candidate menjalankan `.trim()` pada SDP answer dan menghapus terminal `CRLF`.
- Chromium provider-free menolak bentuk lama dan menerima bentuk canonical candidate secara konsisten.
- Probe mengimpor implementation candidate, memblokir browser network, dan tidak menyimpan raw SDP, bearer value, prompt, URL sensitif, atau exception mentah.
- Tidak ada OpenAI/provider call yang dilakukan.
- Bukti lengkap: [Phase 6 execution log](rebuild-logs/phase-6-telefun-openai-webrtc-paid-smoke-connect-repair-execution.md) dan [Phase 6 audit](rebuild-logs/phase-6-telefun-openai-webrtc-paid-smoke-connect-audit.md).

### 2. Production database preflight and backup

Target linked Supabase project: `ruosnjmtywcrghjgqugz`.

Sebelum write:

- hosted migration, RLS, grants, function boundary, provider scope, dan lifecycle state diperiksa;
- exact rows/states yang akan disentuh dikunci dengan fail-close assertions;
- private backup disimpan di luar repository dengan mode `0600`.

| Snapshot             | Path                                                                                     | SHA-256                                                            |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Before writes        | `~/.hermes/backups/trainerssuperappvite/telefun-webrtc-production-20260810T233513Z.json` | `b905b1225bb184c20d78438340db2859dc1323836183fa11137f436245efd93b` |
| After reconciliation | `~/.hermes/backups/trainerssuperappvite/telefun-webrtc-production-20260810T234113Z.json` | `c29127ed51495c6cf2c74bf44104c4ce85451a8d10884c2a831e9fb69b3b271c` |

Backup jangan dipindah ke repository atau di-commit.

### 3. Surgical lifecycle reconciliation

Perubahan yang sudah diterapkan pada production database:

- empat attempt-less active histories difinalisasi sebagai failed;
- satu stale `claimed/pending` attempt difinalisasi melalui canonical Phase 5 RPCs;
- satu old orphan attempt/lease dipetakan ke terminal state kompatibel Phase 4;
- satu failed OpenAI usage-audit row yang belum ada ditambahkan;
- operasi menggunakan exact-ID/exact-state preconditions, transaction, timeout, advisory lock, dan postcondition assertions.

Tidak ada mass update dan tidak ada row Gemini/non-WebRTC yang ditargetkan.

### 4. Canonical Phase 5 rollback/reapply proof

Canonical sources:

- [`20260801142542_telefun_openai_webrtc_phase5_production_hardening.sql`](../supabase/migrations/20260801142542_telefun_openai_webrtc_phase5_production_hardening.sql)
- [`rollback_20260801142542_telefun_openai_webrtc_phase5_production_hardening.sql`](../supabase/rollbacks/rollback_20260801142542_telefun_openai_webrtc_phase5_production_hardening.sql)

Rollback dan reapply dijalankan back-to-back dalam **satu PostgreSQL transaction** dengan advisory lock. Snapshot equality dan assertions membuktikan:

- rows lease/rate-limit/metric dipulihkan identik;
- Phase 5 attempt columns dipulihkan identik;
- RLS dan service-role-only function/table grants tetap benar;
- constraints tetap menerima canonical terminal outcomes;
- migration-history row Phase 5 tetap tepat satu;
- transactional DDL mencegah external session melihat intermediate schema.

### 5. Final production verification

Live verification terakhir: `2026-08-10T23:49:47Z`.

| Invariant                                      |                                  Final state |
| ---------------------------------------------- | -------------------------------------------: |
| WebRTC histories                               |        10 total; 10 failed; 0 active/pending |
| WebRTC attempts                                |       6 total; 6 ended/failed; 0 nonterminal |
| Incomplete attempts with failed usage audit    |                                          6/6 |
| WebRTC leases                                  | 5 total; 5 released/failed; 0 active/cleanup |
| Phase-5-only outcomes                          |                                            0 |
| Rate-limit rows                                |                                           18 |
| Metric rows                                    |                                           12 |
| Phase 5 tables with RLS                        |                                          3/3 |
| Phase 5 functions restricted to `service_role` |                                        10/10 |
| Non-OpenAI rows in Phase 5 provider boundary   |                                            0 |
| Provider calls during work                     |                                            0 |

Local dan remote migration history sekarang sinkron sampai `20260811044655`.
Apply remote hanya memuat migration lease-renewal tersebut; tidak ada seed,
roles, atau migration lain yang ikut dijalankan.

### 6. Gemini boundary verification

Measured aggregate/timestamp baseline sebelum dan sesudah tetap sama:

| Gemini/non-WebRTC check       |                   Before and after |
| ----------------------------- | ---------------------------------: |
| Histories                     |                                 47 |
| Active/pending histories      |                                  4 |
| Latest history timestamp      | `2026-08-10T01:35:50.243204+00:00` |
| Gemini usage rows             |                                854 |
| Latest Gemini usage timestamp | `2026-08-03T08:25:43.485655+00:00` |

Klaim ini dibatasi pada aggregate counts dan latest timestamps yang benar-benar diukur; ini bukan klaim row-by-row equality seluruh tabel Gemini.

### 7. Documentation synchronized

Canonical evidence/status sudah diperbarui pada:

- [`database.md`](database.md)
- [`architecture.md`](architecture.md)
- [`telefun.md`](telefun.md)
- [`PHASE_PROGRESS.md`](PHASE_PROGRESS.md)
- [Phase 4 durable lifecycle log](rebuild-logs/phase-telefun-openai-webrtc-durable-lifecycle.md)
- [Phase 5 production hardening log](rebuild-logs/phase-telefun-openai-webrtc-production-hardening.md)
- [Phase 6 audit](rebuild-logs/phase-6-telefun-openai-webrtc-paid-smoke-connect-audit.md)
- [Phase 6 execution log](rebuild-logs/phase-6-telefun-openai-webrtc-paid-smoke-connect-repair-execution.md)
- ignored local plan: `plan/markdown/telefun-openai-webrtc-paid-smoke-connect-repair.md`

### 8. Model scope: mengapa Mini belum memakai jalur WebRTC

`gpt-realtime-2.1-mini` mendukung WebRTC dari sisi provider; dokumentasi resmi
OpenAI mencantumkan WebRTC, WebSocket, dan SIP sebagai endpoint yang didukung.
Ketiadaan jalur Mini pada aplikasi adalah batas implementasi **single-model
POC**, bukan keterbatasan provider.

Boundary saat ini sengaja hanya membuka `gpt-realtime-2.1`:

- registry model memberi Full transport `openai-audio` dan `openai-webrtc`,
  sedangkan Mini masih `openai-audio`;
- API capability, Web capability type, dan broker POC mengunci model Full;
- database `CHECK` dan claim RPC Phase 4/5 juga mengunci model Full;
- test regression memastikan pasangan Mini + `openai-webrtc` ditolak.

Referensi source utama:

- [`packages/types/src/ai-models.ts`](../packages/types/src/ai-models.ts)
- [`apps/api/src/routes/telefun/capabilities.ts`](../apps/api/src/routes/telefun/capabilities.ts)
- [`apps/telefun/src/realtime-webrtc/contracts.ts`](../apps/telefun/src/realtime-webrtc/contracts.ts)
- [OpenAI `gpt-realtime-2.1-mini` model page](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)

Jangan memasukkan Mini ke candidate Phase 6 ini. Perluasan Mini harus menjadi
change set additive terpisah setelah model Full lulus staging provider-free dan
runtime smoke yang diotorisasi, agar DB contract, capability, lifecycle,
pricing/usage, dan regression matrix kedua model dapat diuji tanpa mengganggu
Gemini atau legacy `openai-audio`.

## Staging deployment completed — 2026-08-11

Candidate `2b2545ba90e8d1e50913236c7353729f4ef8ed65` dipush ke branch
`candidate/telefun-webrtc-phase6-20260811` dan di-upload dari clean detached
worktree `/private/tmp/trainerssuperappvite-webrtc-candidate-2b2545b`.
Remote branch SHA dan worktree SHA identik.

| Service             | Deployment ID                          | Status      | Image digest                                                              |
| ------------------- | -------------------------------------- | ----------- | ------------------------------------------------------------------------- |
| `@trainers/web`     | `1ff6807a-721b-4a11-8be9-a6c141c7659e` | **SUCCESS** | `sha256:a6d45c018a80fce607d905c30755cd816792a8c0e749b392da348f2924cc489b` |
| `@trainers/api`     | `d747d8a4-e69c-4b4b-b676-e7e9d7c4d5b8` | **SUCCESS** | `sha256:31a4a5fadca797e7725cfb924673c432f6f24f921fae3e092eba95aefbe4d02e` |
| `@trainers/telefun` | `971ac812-cc90-4f4b-b41d-6b3527d89634` | **SUCCESS** | `sha256:c167eb06031cce87a96ba8f0a9f9944244cb58a1e33d455bae2cfe5878ee9433` |

Railway sempat menandai upload API/Telefun pertama sebagai `SKIPPED` karena
candidate tidak mengubah watched source path kedua service. Watch patterns
**staging-only** dikosongkan sementara, upload exact candidate dijalankan, lalu
watch patterns dipulihkan identik ke `/apps/api/**` dan `/apps/telefun/**`.
Tidak ada production Railway setting yang diubah dan semua `preDeployCommand`
tetap `null`, sehingga deploy tidak menjalankan migration.

Provider-free verification setelah deploy:

- Web, API `/api/health`, dan Telefun `/health` mengembalikan HTTP 200;
- `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false` pada API dan Telefun;
- exact staging Web origin hadir di API/Telefun, allowlist keduanya identik, dan
  internal token boundary cocok tanpa nilai secret dipersist;
- POST WebRTC dan preflight POST tersembunyi dengan 404 saat flag off; preflight
  DELETE cleanup 204 dan DELETE tanpa auth 401;
- Chromium 148 membuka landing staging tanpa console/page/request failure dan
  tanpa request ke OpenAI, Gemini, atau OpenRouter;
- 145 public Web files (5,338,019 bytes) dipindai. Exact value dan nama
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `GEMINI_API_KEY`, serta
  `OPENROUTER_API_KEY` tidak ditemukan di bundle;
- read-only database check pukul `2026-08-11T02:06:22Z` masih menunjukkan 10/10
  WebRTC history failed, 6/6 attempt ended/failed, dan 0 active lease/outcome;
- OpenAI WebRTC usage tetap 6 failed audit, 0 success, dengan row terbaru
  `2026-08-10T23:39:00Z`, sebelum deployment staging;
- Gemini usage terbaru `2026-08-11T01:15:10Z` dan history non-WebRTC terbaru
  `2026-08-10T01:35:50Z`, keduanya sebelum deployment pertama pukul
  `2026-08-11T01:52:24Z`. Total Gemini telah bergerak dari baseline historis
  854 menjadi 857 **sebelum** deploy; jangan mengatribusikannya ke staging.

Private staging evidence, mode `0600`:

- Path: `~/.hermes/backups/trainerssuperappvite/telefun-webrtc-staging-20260811T021115Z.json`
- SHA-256: `01a015df9393032417864c34db2c3b20b9afbd2ca6d5e109ae64ee8223635c39`

Railway local upload menyimpan `commitHash=null` dan `branch=null`. Provenance
saat ini berasal dari clean detached worktree, remote branch SHA parity, exact
SHA pada deployment message, deployment ID, dan image digest; jangan
menganggap upload awal itu sebagai Git-attested SHA dari Railway sendiri.

## P1/P02/P2 and paid-smoke follow-up — 2026-08-11

### P1 authenticated provider-free gate — PASS

- Existing active temporary Supabase test account digunakan sebagai authenticated identity; tidak ada user baru yang dibuat.
- Legacy fixture password tidak menjadi final session path. Session staging-safe untuk akun yang sama diperoleh melalui magic-link/OTP verification, lalu aplikasi memuat profile melalui normal Supabase session storage.
- Authenticated PhoneInterface berhasil dimuat. Capability API mengembalikan `enabled=false` dan `allowed=false`; opsi OpenAI WebRTC tidak tersedia ketika API dan Telefun flags off.
- Browser verifier memblokir provider dan mutation endpoints. Provider calls, broker starts, Telefun session/call writes, transcript writes, recording writes, dan durable lifecycle mutations selama probe tetap `0`.
- Account identifier, password, magic link, OTP, bearer token, refresh token, cookie, dan storage state tidak dipersist ke repository atau dokumentasi.

### P02 source/artifact attestation — PASS with explicit boundary

- Railway staging Web/API/Telefun dihubungkan ke branch `candidate/telefun-webrtc-phase6-20260811` dan diredeploy from source.
- Source attribution mengikuti docs-only branch HEAD `929d53a1e4366e0680882b7dc1c9f3ff8f2c4298`.
- Commit `929d53a` hanya mengubah tiga file dokumentasi. `git diff --quiet 2b2545b HEAD -- . ':(exclude)docs/**'` dan critical-subtree comparison keduanya lulus.
- Karena itu application code tree yang diuji tetap ekuivalen dengan application candidate `2b2545ba90e8d1e50913236c7353729f4ef8ed65`; jangan menyebut docs-only HEAD sebagai application-code change.

### P2 provider-free drills — PASS dalam bounded scope

- Deny-all allowlist + API/Telefun restart menghasilkan authenticated broker denial HTTP 403, capability tetap disabled, database unchanged, provider calls `0`, dan production database mutations `0`.
- Setelah restore ke full-off, restart menghasilkan broker 404, capability `enabled=false`/`allowed=false`, database tetap unchanged, dan provider calls `0`.
- Lima browser/device/network cases lulus: authenticated UI, emulated viewports, fake microphone where supported, local-only peer/data channel, offline fail-closed, dan recovery.
- Semua service staging beroperasi dengan satu replica. Cross-replica behavior dan physical-device audio tidak diklaim oleh evidence ini.

### One authorized paid smoke — connection PASS, stability FAIL

Fajar kemudian mengotorisasi satu paid staging smoke. Hanya satu call dijalankan; tidak ada retry.

| Gate                             | Result                                   |
| -------------------------------- | ---------------------------------------- |
| Provider connection              | **PASS**                                 |
| Model                            | `gpt-realtime-2.1`                       |
| Two-party transcript persistence | **PASS** — 2 events, agent + consumer    |
| Recording persistence            | **PASS** — `ready`                       |
| Usage persistence                | **PASS** — 2,344 total tokens            |
| DB-logged final cost             | **PASS** — USD `0.024416` / IDR `439`    |
| Terminal cleanup                 | **PASS** — attempt ended, lease released |
| Stable-call gate                 | **FAIL**                                 |
| Paid retry                       | **NOT RUN**                              |
| Phase 6 production rollout       | **NO-GO**                                |

Observed terminal chain:

1. Browser dan OpenAI sideband sudah connected; `sideband_connected_at` ke `ended_at` sekitar 10.0 detik.
2. Distributed lease renewal pertama gagal atau ditolak sekitar 10.6 detik setelah lease dibuat.
3. Lease masih mempunyai sekitar 19.4 detik dari original TTL ketika dinyatakan lost; ini bukan normal expiry.
4. Server finalizer menetapkan `source=lease_lost`, `reason=distributed_lease_lost`, dan outcome `network_lost`.
5. Browser kemudian melihat `data_channel_close`; ini downstream effect dari server-side lease loss, bukan initial provider/connect failure.
6. Railway evidence tidak memuat `provider_error`, `sideband_close`, `shutdown`, `start_failure`, atau `request_aborted` untuk call tersebut.

Exact RPC renewal failure pada call lama awalnya tidak observable karena
coordinator menelan renewal exception/rejection reason sebelum marker
`lease_lost`. Investigasi provider-free berikutnya sudah menemukan penyebabnya;
jangan mengatribusikannya ke Supabase outage atau provider error.

### Lease-renewal exact root cause and repair — DB applied, app deploy pending

- Function Phase 5 `renew_telefun_realtime_lease(...)` memakai
  `RETURNS TABLE(..., expires_at, ...)`, lalu `UPDATE` merujuk
  `expires_at > v_now` tanpa alias tabel. PostgreSQL memperlakukan nama itu
  ambigu antara output variable dan kolom tabel.
- Body production-equivalent direproduksi pada PostgreSQL 17 lokal dan gagal
  tepat dengan `column reference "expires_at" is ambiguous`. Body beralias
  berhasil memperbarui `heartbeat_at` dan `expires_at`.
- Candidate migration additive
  [`20260811044655_fix_telefun_realtime_lease_renewal.sql`](../supabase/migrations/20260811044655_fix_telefun_realtime_lease_renewal.sql)
  mengganti body RPC dengan row lock, referensi `lease.expires_at`, closed
  reasons `lease_not_found`/`owner_mismatch`/`inactive`/`expired`/`invalid_ttl`,
  dan grant hanya untuk `service_role`.
- [Safe rollback](../supabase/rollbacks/rollback_20260811044655_fix_telefun_realtime_lease_renewal.sql)
  mengembalikan reason contract lama yang collapsed, tetapi sengaja
  mempertahankan alias qualification agar rollback tidak menghidupkan outage.
- Runtime coordinator sekarang mempersist reason bounded
  `local_expiry`/`rpc_error`/`invalid_response`, closed RPC reason, atau
  `renewal_rejected`; raw exception dan unknown raw database reason tidak
  diteruskan.
- Local SQL proof menjalankan forward → safe rollback → forward dan memverifikasi
  renewal/heartbeat, owner mismatch, inactive, expired, not found, invalid TTL,
  anon denial, serta `service_role` execution.
- Verification lulus: focused Phase 5 `21/21`, Telefun `401/401`, API core
  `143/143`, Web core `151/151`, root typecheck, lint, build, format, dan
  `git diff --check`.
- Read-only Railway check `2026-08-11T05:02:45Z`: API dan Telefun staging tetap
  `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false`; lease TTL/heartbeat variables tidak
  diset sehingga source defaults tetap `30000/10000` ms.
- Fresh production preflight membuktikan migration absent, body hosted masih
  memuat predicate ambigu, grant tetap service-role-only, dan active WebRTC
  history/attempt/lease semuanya `0`.
- `supabase db push --dry-run` menampilkan tepat satu migration, lalu authorized
  apply memasang `20260811044655` ke production canonical.
- Hosted postcondition membuktikan alias `lease.expires_at`, row lock, seluruh
  closed reason, owner/security/grant identik, service-role RPC probe
  `invalid_ttl` HTTP 200, dan anon denial HTTP 401.
- Gemini/non-WebRTC aggregate boundary identik sebelum/sesudah: history `46`,
  active/pending `4`, latest history `2026-08-10T01:35:50.243204+00:00`, usage
  Gemini `857`, latest usage `2026-08-11T01:15:10.349369+00:00`.

Private exact-object/aggregate evidence (mode `0600`, jangan dipindah ke repo):

- preapply: `~/.hermes/backups/trainerssuperappvite/telefun-lease-renewal-preapply-20260811T053021Z.json` — SHA-256 `46fb69d18a918abaa8927855619a833d3ef70598a2a5038ca7937b215f78ec21`;
- postapply: `~/.hermes/backups/trainerssuperappvite/telefun-lease-renewal-postapply-20260811T053154Z.json` — SHA-256 `27111cae8fcdfc38cdc35c8631a8f09a37f94b23877f9cb118737724b944fa54`;
- rollback artifact SHA-256: `5bb942844dbaff08a7dd527e0fbb658fd9211a2d7ca890a61b033a2bc02e394d`.

Full-schema `pg_dump` sengaja tidak diklaim: temporary CLI login tidak berhak
lock tabel project-wide. Backup dipersempit fail-closed ke exact function
definition/metadata, aggregate boundary, dan canonical rollback. Sampai titik
ini belum ada Railway mutation/deploy, flag enablement, provider call, atau paid
retry.

Scoring masih `pending` pada post-call capture; skor UI `0/10` bukan bukti provider connection gagal.

### Post-smoke restoration — PASS

- API dan Telefun dikembalikan ke `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false`.
- Web, API, dan Telefun health mengembalikan HTTP 200.
- Authenticated capability kembali `enabled=false` dan `allowed=false`.
- Active WebRTC lifecycle counts setelah restore: attempts `0`, leases `0`, histories `0`.
- Paid provider calls: `1`; paid retries: `0`.

Private evidence berikut semuanya mode `0600` dan tidak boleh dipindah ke repository:

- P1 authenticated: `~/.hermes/backups/trainerssuperappvite/telefun-webrtc-authenticated-provider-free-20260811T030300859Z.json` — SHA-256 `a4101f685c3bb844ecee2a8f32fc25ab4cdd9d5351c6534211e0a36eea0ea2c1`.
- P2 browser matrix: `~/.hermes/backups/trainerssuperappvite/telefun-p2-browser-device-network-matrix-20260811T031654367Z.json` — SHA-256 `098efa3e3ec6a050a0daec885fb9002d7e1011923a9b045adef6122c1d8f89c0`.
- P2 deny-all runtime: `~/.hermes/backups/trainerssuperappvite/telefun-p2-runtime-on-deny-20260811T032832Z.json` — SHA-256 `b3f6a01d5bd2abfa0fdb3f8232bc62ba4023c45f1977a1674c7d0ccc6e99ff61`.
- P2 restored-off runtime: `~/.hermes/backups/trainerssuperappvite/telefun-p2-runtime-off-20260811T033028Z.json` — SHA-256 `8314ef78c1697b219aef91b0155810fb7bef4f7e546b02bdf32ab0f0565a26c5`.
- Paid preflight: `~/.hermes/backups/trainerssuperappvite/telefun-paid-smoke-preflight-20260811T035528Z.json` — SHA-256 `0ba4cdc16938d154c58196917098ef41cf7911257e495f01efbf52951b4b901b`.
- Paid enabled-state: `~/.hermes/backups/trainerssuperappvite/telefun-paid-smoke-enabled-20260811T035923Z.json` — SHA-256 `f6ec105ab15e973695a75ee73a26f15ee802ceb43f657df592742d5238108898`.
- Paid post-call DB: `~/.hermes/backups/trainerssuperappvite/telefun-paid-smoke-postcall-20260811T040857Z.json` — SHA-256 `e5128e9b153534f6c16f505023bda439ef03f8d196ef871fd99fac97807dbd68`.
- Paid Railway logs: `~/.hermes/backups/trainerssuperappvite/telefun-paid-smoke-railway-logs-20260811T040903Z.json` — SHA-256 `c807ec0de7e46ad620b631b3ccb9996f0cae8bcd423a7b5ceee818bec576d93a`.
- Paid disabled-state: `~/.hermes/backups/trainerssuperappvite/telefun-paid-smoke-disabled-20260811T041409Z.json` — SHA-256 `ba423394458d2bab9c6ef8589f4e2c085c86aa5e13f3008c2bc47847cb08e335`.
- Paid closing: `~/.hermes/backups/trainerssuperappvite/telefun-paid-smoke-closing-20260811T041933Z.json` — SHA-256 `d63c2283044847f8c9b1b23da28a8a2113cbaf48f423e405714cf3419ccf4ada`.

## Current repository/candidate state

Candidate application dan docs follow-up terdahulu telah dipisahkan menjadi empat commit dan dipush:

- `c0cd6b1` — provider-free Chromium SDP gate;
- `eaf0c79` — Phase 6, production database, dan handoff documentation;
- `2b2545b` — refreshed Graphify dependency output dan **deployed application candidate**;
- `929d53a` — provider-free staging deployment documentation only.

Perubahan handoff P1/P02/P2/paid-smoke dari sesi sebelumnya tetap dipertahankan
di working tree. Working tree sekarang juga memuat source repair, regression
tests, migration/rollback additive, dan dokumentasi lease-renewal. Semua ini
belum commit/push/deploy; future application candidate harus dibekukan dan
di-attest sebagai candidate baru, bukan dianggap sama dengan `2b2545b`.

Plan lokal berada di bawah `/plan/markdown/*` dan di-ignore oleh `.gitignore`;
jangan mengubah `.gitignore` hanya untuk men-track plan tersebut.

## Not processed / remaining work

| Priority       | Item                                   | Current blocker / required decision                                                                                                                                           |
| -------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator-gated | Freeze and deploy repaired candidate   | Source repair belum commit/push/deploy. Attest exact new SHA, deploy staging-only dengan flags false, lalu buktikan source/artifact parity dan hosted renewal contract.       |
| Authorized     | Stable paid verification after repair  | Fresh authorization tersedia untuk satu call manual ≤30 detik, same account/model/voice, budget maks USD 0.10, zero retry, setelah provider-free staging gates lulus.         |
| P2             | Cross-replica runtime evidence         | Staging services currently have one replica each; do not claim cross-replica behavior until an explicitly approved multi-replica drill exists.                                |
| P2             | Wider physical-device/audio matrix     | One manual Chrome desktop mic call connected, but multi-browser/mobile/physical-device coverage remains outside current evidence.                                             |
| P2             | Post-call scoring read-only follow-up  | Scoring was still `pending` at evidence capture. Recheck read-only if closing the scoring artifact is required; do not reinterpret UI `0/10` as connection failure.           |
| P2             | Web Railway variable ownership cleanup | Public bundle scan lulus, tetapi backend-only variable names masih terpasang pada Web service. Hapus hanya lewat configuration change terpisah setelah owner/scope disetujui. |
| P2             | External security review               | Belum dilakukan.                                                                                                                                                              |
| Separate scope | Mini WebRTC expansion                  | Provider mendukung Mini, tetapi registry/API/Web/broker/DB/test masih single-model Full. Harus change set additive terpisah.                                                  |
| Separate scope | Supabase Security Advisor findings     | Temuan project-wide pre-existing belum diremediasi dan tidak boleh dibundel diam-diam dengan Telefun Phase 5/6.                                                               |

## Security Advisor follow-up scope

Read-only advisor diulang pada 2026-08-11 dan menghasilkan 63 finding records:

- satu `security_definer_view` untuk `public.v_access_groups_with_item_counts`;
- 14 `function_search_path_mutable`;
- 22 anon dan 25 authenticated `SECURITY DEFINER` execute findings;
- satu leaked-password-protection finding.

Temuan tersebut project-wide dan dapat overlap pada object yang sama; angka bukan
jumlah object unik atau bukti compromise. Tidak ada remediation yang dijalankan.

Phase 5 sendiri sudah diverifikasi: ketiga table RLS-enabled dan kesepuluh function tidak executable oleh `public`, `anon`, atau `authenticated`.

Jika Security Advisor akan diperbaiki, lakukan sebagai task terpisah:

1. read-only inventory semua affected object dan dependency;
2. backup/export current definitions serta grants;
3. klasifikasikan true positive vs intentional contract;
4. usulkan surgical migration dan rollback;
5. uji RLS/auth/dependency sebelum production apply;
6. jangan menyentuh Telefun/Gemini atau database domain lain tanpa scope eksplisit.

## Next-session sequence

1. Baca handoff ini, kedua Phase 6 evidence logs, dan private closing evidence; paid authorization sudah consumed dan staging kembali flags off.
2. Verifikasi branch/status serta review uncommitted repair. `2b2545b` tetap deployed application candidate lama; source repair berikutnya harus menjadi candidate baru.
3. Pertahankan API/Telefun flags false. Jangan menjalankan paid retry atau provider call dari handoff ini.
4. Migration `20260811044655` sudah terpasang dan terverifikasi; jangan apply ulang.
5. Freeze/commit/push exact repair SHA dan deploy staging-only dengan flags false; buktikan artifact parity, health, dan provider-free contract.
6. Gunakan fresh paid authorization hanya setelah gates lulus: satu call manual ≤30 detik, budget maks USD 0.10, zero retry, lalu restore flags off.
7. Cross-replica, wider physical-device matrix, Web variable cleanup, dan external review tetap task terpisah dengan scope eksplisit.
8. Perluasan Mini dikerjakan sebagai additive phase terpisah setelah Full stable-call gate lulus.
9. Tangani Security Advisor hanya sebagai change set terpisah dengan preflight/backup/rollback sendiri.

## Do not repeat blindly

- Jangan rerun stale-row reconciliation hanya karena menemukan script/history lama; final invariant saat handoff sudah bersih.
- Jangan rerun rollback/reapply production tanpa fresh preflight, fresh backup, exact-state assertions, dan explicit scope.
- Jangan membuat migration duplikat, mengedit migration Phase 5 lama, atau apply ulang; additive canonical `20260811044655` sudah remote.
- Jangan menyentuh atau “membersihkan” row Gemini/non-WebRTC sebagai bagian dari Telefun OpenAI WebRTC.
- Jangan menyimpan backup production, raw SDP, token, environment value, atau provider secret di repository/evidence.
- Jangan push candidate ke `main`, deploy production application, mutate production DB, atau mengubah Gemini tanpa authorization baru.
- Jangan me-redeploy docs-only branch tip dan menyebutnya candidate yang sama; original application-code candidate adalah `2b2545b`, dan future repair harus menjadi candidate baru yang ter-attest.
- Jangan menggunakan kembali paid authorization yang sudah consumed, menyalakan WebRTC flags, atau menjalankan provider start dari handoff ini.
- Jangan paid retry untuk “memastikan” disconnect. Stable-call gate sudah gagal dengan bukti `lease_lost`; observability dan root-cause repair harus selesai lebih dulu.
- Jangan mengklaim browser `data_channel_close` sebagai initial cause atau provider failure. Exact server-side cause sudah direproduksi sebagai ambiguity PL/pgSQL `expires_at`; candidate repair belum menjadi bukti remote runtime sampai di-apply/deploy secara terotorisasi.
- Jangan mengklaim Phase 6 runtime GO sebelum lease renewal repair dan stable-call verification yang diotorisasi terpisah lulus.

## Durable and ephemeral evidence boundary

Canonical migration/rollback files, repository docs, private database snapshots, serta P1/P2/paid closing JSON di atas adalah durable evidence. Operational helper scripts yang digunakan saat eksekusi berada di `/tmp` dan bersifat ephemeral; jangan mengandalkannya sebagai satu-satunya sumber kebenaran atau menganggap keberadaannya wajib pada sesi berikutnya. Private evidence membawa fakta teredaksi dan checksum; raw transcript, account/session credential, dan provider secret tetap tidak boleh dipindahkan ke repository.

## Safe read-only rechecks

```bash
# Repository state
git status --short
git diff --check

# Local/remote migration parity
supabase migration list --linked

# Project-wide advisor inventory; read-only
supabase db advisors --linked --type security --output json
```

Perintah advisor adalah inventory read-only. Jangan otomatis menerapkan remediation hanya karena finding muncul.
