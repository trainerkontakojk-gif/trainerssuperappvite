# Phase 5 — Telefun OpenAI WebRTC Production Hardening

## Status dan scope

Phase 5 sudah diimplementasikan pada boundary OpenAI WebRTC yang tetap **default-off dan non-production**. Gemini Live WebSocket, legacy OpenAI WebSocket, K/A/S scoring contract, dan provider fallback behavior tidak diubah. Local control-plane verification dan hosted database subgate sudah **PASS**; Gate P5 keseluruhan tetap **PARTIAL** karena evidence application deployment/restart, load, review eksternal, dan real-browser/device/network belum tersedia.

## Distributed quota, lease, dan rate limit

- Migration additive `20260801142542_telefun_openai_webrtc_phase5_production_hardening.sql` menambah lease, rate-limit window, metric table, outcome `network_lost`/`orphaned`, encrypted provider reference, counter audit, dan RPC atomic.
- Lease claim memakai advisory transaction lock untuk user/provider cap, expiry-safe counting, token hash, TTL, renew, release idempotency, dan foreign-key-valid attempt yang sudah durable.
- Expired lease tetap menjadi kandidat `claim_telefun_realtime_orphans`; claim lease tidak lagi men-terminal-kan lease sebelum cleanup worker mendapat kesempatan menutup provider/sideband.
- Rollback tersedia di `supabase/rollbacks/rollback_20260801142542_telefun_openai_webrtc_phase5_production_hardening.sql` dan sengaja fail-closed jika outcome Phase 5 belum didrain.
- API session create/write dan broker start memakai database rate-limit RPC dengan scope user/session/provider. Jalur WebRTC fail-closed ketika client RPC tidak tersedia; limiter in-memory lama tetap hanya untuk middleware umum non-WebRTC.

## Orphan cleanup dan recovery

- `createOrphanCleanupWorker` melakukan claim/close provider reference/sideband/complete; kegagalan close dikembalikan sebagai retryable cleanup dan tidak disembunyikan.
- Provider call ID disimpan sebagai opaque AES-GCM reference server-only; browser tidak menerima provider ID, sideband URL, API key, atau canonical session config.
- Lease loss, sideband disconnect, duplicate transcript write, missing usage, cost reconciliation, orphan, dan session cap mengalir ke metric sink bounded. UUID user diubah menjadi SHA-256 `user_id_hash` sebelum persistence.
- Browser menutup attempt sebagai `network_lost` untuk peer/ICE/data-channel failure. Local microphone `track.onended` diklasifikasikan sebagai `device_unplugged`. Recovery policy menghasilkan attempt/session-boundary/discontinuity ID baru dan UI tidak melakukan silent recreate; caller harus membuat sesi baru.

## Security dan transport boundary

- Production `ALLOWED_ORIGINS` wajib exact HTTPS origin tanpa wildcard, path, credential, atau trailing-slash mismatch.
- Broker hanya mengizinkan exact origin CORS/preflight, `application/sdp`, bounded SDP/DELETE body, bounded request/provider/sideband timeout, dan safe error body.
- OpenAI Calls upstream dan sideband URL fixed ke `api.openai.com`; response `Location`/call ID divalidasi sebelum dipakai untuk hangup.
- Web CSP/Permissions Policy disinkronkan di `apps/web/public/serve.json` dan `vercel.json`; browser memakai HTTPS/WSS di production.
- `/health` ditangani sebelum provider work, hanya membaca env/runtime readiness, tidak claim lease, consume quota, membuka socket, atau menulis usage/billing.

## Post-worker gap review

Review langsung terhadap plan menemukan lima gap yang dapat diperbaiki lokal:

1. Lease heartbeat yang hilang hanya menghasilkan metric dan membiarkan provider call hidup sampai orphan sweep. Handle lease sekarang menyediakan `whenLost`; manager segera menutup provider dan memfinalisasi `network_lost`, lalu tetap mencoba release bertoken agar lease tidak tertinggal sampai expiry cleanup.
2. Secret enkripsi provider reference menerima string satu karakter. Env schema sekarang mewajibkan minimal 32 karakter ketika secret disediakan.
3. Metric persistence masih membawa UUID user mentah, berlawanan dengan data-minimization plan. Recorder dan migration/RPC sekarang memakai SHA-256 `user_id_hash`.
4. API limiter mengasumsikan hasil `RETURNS TABLE` Supabase berbentuk object, padahal PostgREST mengembalikan singleton row array. Parser sekarang menerima bentuk singleton array maupun object test-double dan tetap fail-closed untuk payload kosong/malformed.
5. `call-manager.ts` melewati batas maintainability sekitar 1.000 baris. Public contracts, error types, dan binding-state factory diekstrak ke `call-manager-types.ts`; import consumer tetap backward-compatible melalui re-export.

Canonical `docs/telefun.md` dan `docs/database.md` juga disinkronkan karena sebelumnya masih menyatakan Phase 5 sebagai pekerjaan yang seluruhnya deferred dan belum mengindeks migration Phase 5.

## Verification yang dijalankan

- `pnpm --dir apps/telefun exec vitest run ...` focused WebRTC matrix: **exit 0, 14 files, 131 tests passed**.
- `pnpm --dir apps/api exec vitest run src/__tests__/telefun-phase5-hardening.test.ts src/__tests__/telefun-routes.test.ts`: **exit 0, 2 files, 34 tests passed**.
- `pnpm --dir apps/web exec vitest run ...` focused WebRTC/recovery matrix: **exit 0, 5 files, 59 tests passed**.
- `pnpm --dir apps/telefun exec tsc --noEmit -p tsconfig.json`, API, dan Web: **exit 0**.
- `pnpm build`: **exit 0**; API, Telefun, Web build berhasil. Warning Node deprecation dan Tailwind/Vite builtin skip tetap non-fatal.
- `pnpm test:core`: **exit 0**; API **11 files/142 tests**, Telefun **35/372**, Web **9/151**, Turbo **4/4 tasks**.
- `node /Users/nadindyta/.agents/skills/impeccable/scripts/detect.mjs --json apps/web/src/routes/telefun/components/PhoneInterface.tsx`: **exit 0, findings []**.
- Browser secret/upstream scan, provider diagnostic redaction scan, dan `git diff --check`: **lulus / exit 0**.
- Initial worker run `pnpm lint`: **exit 1** karena 5 error yang saat itu berada di luar scope pada `apps/api/src/__tests__/telefun-communication-profile.test.ts` dan `apps/api/src/services/ketik/prompt-policy.ts`.

### Post-gap verification

- Focused repair RED→GREEN: lease-loss finalization, weak orphan-key rejection, hashed-user metric, dan Supabase singleton-array limiter masing-masing dibuktikan gagal sebelum implementasi lalu lulus setelah perbaikan.
- Final focused Telefun lifecycle refactor: `pnpm --dir apps/telefun exec vitest run src/realtime-webrtc/phase5-production-hardening.test.ts src/realtime-webrtc/call-manager.test.ts src/realtime-webrtc/phase4-durable-contract.test.ts`: **exit 0, 3 files/45 tests**.
- API Phase 5 parser: `pnpm --dir apps/api exec vitest run src/__tests__/telefun-phase5-hardening.test.ts`: **exit 0, 1 file/3 tests**. Focused API route matrix sebelumnya juga lulus **2 files/34 tests**.
- Web recovery/client/PhoneInterface matrix: **exit 0, 3 files/51 tests**.
- `pnpm typecheck`: **exit 0, 4/4 workspaces**.
- `pnpm test:affected`: **exit 0**; API **134 files/1279 passed + 1 skipped**, Telefun **35/374**, Web cached affected result **63/645**.
- `pnpm lint`: **exit 0, 4/4 workspaces**, dengan warning pre-existing tetapi tanpa error. Ini menggantikan status lint initial worker di atas.
- `pnpm test:core`: **exit 0**; API **11/143**, Telefun **35/374**, Web **9/151**, Turbo **4/4 tasks**.
- `pnpm build`: **exit 0, 3/3 build tasks**; warning Node/Tailwind/Vite tetap non-fatal.
- `graphify update .`: **exit 0**, graph code diperbarui setelah repair terintegrasi.
- `git diff --check`: **exit 0**.
- `pnpm validate-migrations`: **exit 1** karena `DATABASE_URL`/`SUPABASE_DB_URL` tidak tersedia; tidak diklaim sebagai SQL execution evidence.

## Hosted database execution update — 2026-08-10

Setelah operator menjelaskan bahwa tidak ada staging database dan memberi
authorization eksplisit untuk database production canonical, operasi berikut
dijalankan secara fail-close hanya pada boundary Telefun OpenAI WebRTC:

- read-only preflight, exact-scope assertions, dan private backup mode `0600`;
- rekonsiliasi lima stale active WebRTC histories, satu stale claimed attempt,
  old orphan compatibility mapping, dan enam usage-audit requirements;
- canonical Phase 5 rollback lalu reapply dalam satu PostgreSQL transaction
  dengan advisory lock dan transactional DDL;
- exact snapshot equality untuk lease/rate-limit/metric rows dan Phase 5 attempt
  columns, serta assertions untuk RLS, 10 function grants, constraints, dan satu
  migration-history row;
- final state 0 active WebRTC history, 0 nonterminal attempt, 0 active/cleanup
  lease, dan 0 Phase-5-only outcome;
- before/after Gemini boundary tetap identik: 47 non-WebRTC histories, empat
  active/pending histories, dan 854 Gemini usage rows dengan latest timestamps
  yang sama;
- local/remote migration list sinkron dan provider call count tetap 0.

Ini menutup **hosted database subgate**. Tidak ada Railway/application deploy,
environment mutation, WebRTC rollout activation, atau paid provider call.

## Evidence limits dan Gate P5

Hosted migration/RLS/grants dan rollback/reapply drill sekarang sudah dibuktikan pada PostgreSQL production canonical. Supabase security advisor masih melaporkan temuan project-wide pre-existing di luar Phase 5, termasuk satu non-WebRTC security-definer view; 10 function Phase 5 sendiri terbukti tidak executable oleh public/anon/authenticated. Belum ada Railway restart/deployment smoke, external security review, load test lintas replica, real browser/device/network matrix, atau paid OpenAI call. Semua provider/browser tests tetap memakai fake upstream/fake browser dan tidak membuktikan provider availability atau production readiness.

Percobaan awal `graphify update .` gagal `Operation not permitted` pada sandbox;
post-gap run yang dicatat di atas kemudian berhasil exit `0`, sehingga kegagalan
awal hanya historical dan bukan limitation final.
