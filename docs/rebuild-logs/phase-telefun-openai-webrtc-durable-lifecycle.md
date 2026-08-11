# Phase 4 — Telefun OpenAI WebRTC Durable Lifecycle Repair

## Status and scope

Dokumen ini menyinkronkan canonical docs dengan implementation reality Phase 4 pada source saat ini. Perubahan mencakup durable attempt/transcript/usage/finalization, recording readiness/remux, scoring race protection, browser recording reconciliation, setup cleanup ownership, dan object URL ownership.

Status jalur OpenAI WebRTC tetap **default-off dan non-production**. Gemini Live WebSocket, OpenAI WebSocket legacy, `LiveSession`, provider fallback boundary, scoring rubric, dan batas Phase 5 tidak diubah. Assessment terakhir sempat memberi verdict **SEBAGIAN** karena gap F6 post-enqueue; fix RED→GREEN di bawah menutup gap tersebut. Verifikasi final lulus untuk scope fake-upstream/fake-browser/static; batas evidence di bawah tetap berlaku.

## Durable Telefun lifecycle

`telefun_realtime_attempts` menyimpan satu attempt per session dengan state:

```text
claimed → brokered → sideband_connected → ending → ended
```

`telefun_realtime_transcript_events` menyimpan checkpoint canonical dengan sequence dan dedupe key. Usage menggunakan request ID stabil dan row usage/audit yang sudah ada; token atau biaya tidak dibuat ketika usage upstream hilang atau tidak priceable.

Finalisasi normal dan failed memakai satu barrier:

```text
beginFinalization
  → provider hangup saat sideband admission masih open
  → sealAdmission
  → bounded drain
  → close sideband
  → transcript flush/checkpoint
  → usage persistence atau incomplete audit
  → terminal RPC
```

Frame yang diterima sebelum admission seal tetap masuk queue dan diselesaikan oleh drain. Hangup, drain, checkpoint, usage, atau terminal persistence yang gagal mempertahankan attempt sebagai retryable dan tidak menghasilkan terminal success palsu.

### HTTP end dan graceful shutdown

- DELETE session-bound yang sukses mengembalikan `204` hanya setelah state durable terminal terbukti, termasuk approved no-attempt terminalization yang idempotent.
- Durability/barrier failure mengembalikan `503 Realtime call finalization unavailable`; retry memakai binding/finalization key yang sama. Ownership/attempt conflict tetap `409`, sedangkan error internal yang tidak terklasifikasi memakai response aman `500`.
- Shutdown menolak start WebRTC baru, melakukan snapshot binding aktif, dan mencoba finalisasi failed paling banyak dua kali per binding dengan key yang sama. Manager dan HTTP server close ditunggu dalam satu deadline. `process.exit(0)` hanya untuk keberhasilan keduanya; rejection atau deadline memakai `process.exit(1)`.
- Default manager timeout yang terlihat di source: sideband drain 5 detik, provider hangup 15 detik, persistence 10 detik, dan shutdown 30 detik. Nilai tetap bounded.

## Recording readiness, remux, dan scoring

WebRTC remux memproses semua sibling lebih dahulu. Setelah seluruh `processOne` settle, route memanggil `mark_telefun_recording_ready` **satu kali** dengan output seekable yang berhasil. Storage output diklasifikasikan sebagai `created`, `preexisting`, `unknown`, atau `none`; readiness sebagai `persisted`, `confirmed-unpersisted`, atau `ambiguous`.

Jika RPC mengembalikan error atau data kosong, route melakukan satu read-back terhadap fields berikut sebelum cleanup:

```text
id, user_id, status, telefun_transport,
recording_path, agent_recording_path,
recording_status, recording_ready_at, recording_error,
scoring_ready_at, scoring_status
```

Hanya output `created` yang terbukti `confirmed-unpersisted` yang boleh dihapus. Output `preexisting`, `unknown`, dan `ambiguous` dipertahankan. Original raw hanya dihapus setelah target DB field terbukti menunjuk ke path seekable. Ambiguous reconciliation mengembalikan `503 RECORDING_RECONCILIATION_AMBIGUOUS`; no-commit yang diketahui mengembalikan `503 RECORDING_STATE_UNAVAILABLE`. Cleanup warning tidak mengubah readiness durable.

`complete_telefun_scoring(UUID, NUMERIC, JSONB DEFAULT NULL) RETURNS BOOLEAN` mengambil row lock `FOR UPDATE`. WebRTC hanya dapat selesai bila session `completed`, recording tidak failed, `scoring_ready_at` tersedia, dan `agent_recording_path` persis merupakan owned `agent_only.seekable.webm`. Capture failure juga mengunci row dan mengubah WebRTC scoring `processing` menjadi `failed`, membersihkan claim/retry/readiness, serta menyimpan error bounded. Completion stale yang kalah race membaca row yang sudah failed dan diklasifikasikan `SCORING_NOT_READY`; API/worker tidak menimpa latch atau melakukan re-enqueue. Branch Gemini/legacy OpenAI WebSocket mempertahankan behavior scoring lama.

## Browser recording reconciliation

Queue disimpan pada key:

```text
telefun_recording_reconciliation:v1
```

Entry hanya berisi path Storage deterministic dan metadata bounded, dengan owner UUID `userId` dan `sessionId`. Queue memiliki satu dedupe entry per owner/session, maksimal **32** entry, TTL **7 hari** (`604800000` ms), dan dua fase exact:

- `recording_transition_pending` — ditulis sebelum request transition recording pertama;
- `remux_pending` — ditulis setelah response transition valid `200`, sebelum request remux.

Drain hanya memproses entry milik user yang sedang authenticated. Trigger-nya adalah enqueue, page/auth readiness, `online`, visible `visibilitychange`, dan timer due; satu in-page drain dibagikan agar tidak berjalan ganda. Enqueue yang bergabung dengan drain aktif menunggu drain tersebut lalu menjalankan satu follow-up bounded, sehingga versi/sibling terbaru yang sudah due benar-benar diproses. Timer juga menjadwalkan entry yang sudah due dengan delay `0`; kegagalan mutasi localStorage tidak membuat timer hot-loop. Retry dibatasi delapan percobaan dengan delay `1s, 2s, 5s, 10s, 30s, 60s, 300s, 900s`; percobaan ke-8 menjadi exhausted dan tidak mengulang otomatis. Entry tetap sampai sukses, explicit non-retryable removal, atau TTL.

Queue tidak menyimpan blob, access token, prompt, SDP, provider ID, object URL, atau raw error, dan tidak menghapus object Storage. Kegagalan localStorage diperlakukan konservatif sebagai `saveFailed`. Queue ini per-device dan reload-safe; ia tidak menggantikan server-side orphan recovery Phase 5.

## Browser cleanup and object URL ownership

Phone setup membuat in-memory cleanup owner sebelum transport WebRTC dapat throw. Owner memakai authenticated DELETE `?outcome=failed`; hanya `204` mengubahnya menjadi confirmed. Non-204, timeout, network, atau abort membiarkan component mounted, membuka kembali end guard, mengaktifkan state `cleanupRetryable`, dan mempertahankan tombol **“Coba lagi mengakhiri panggilan”** untuk satu retry bounded per click. Navigasi tidak terjadi sebelum konfirmasi.

Full-call object URL dimiliki oleh `retainedObjectUrlRef` di page. Recording session hanya boleh mengembalikan `retainObjectUrl: true` bila callback telah mendaftarkan URL non-null ke owner tersebut. Owner me-revoke URL secara idempotent saat review close, delete, replacement, unmount, atau abandoned flow. URL tidak dimasukkan ke queue reconciliation.

## Migration and rollback artifacts

Forward artifact:

```text
supabase/migrations/20260801120000_telefun_openai_webrtc_phase4_durable_lifecycle.sql
```

Rollback artifact:

```text
supabase/rollbacks/rollback_20260801120000_telefun_openai_webrtc_phase4_durable_lifecycle.sql
```

Migration additive/transactional menambah recording readiness columns pada `telefun_history`, tables `telefun_realtime_attempts` dan `telefun_realtime_transcript_events`, active-delete guards, lifecycle/transcript/usage/recording/scoring RPC contract, dan schema reload notification. Durable tables mengaktifkan RLS, mencabut table grants dari `public`, `anon`, dan `authenticated`, serta hanya memberi akses table/RPC ke `service_role` melalui server boundary.

Rollback memulihkan body/signature/grant pre-Phase-4 untuk `complete_telefun_scoring`, `claim_telefun_scoring`, dan `enqueue_telefun_scoring` sebelum menghapus Phase 4 functions/triggers/tables/columns. Pada follow-up 2026-08-10, hosted production inspection membuktikan forward migration Phase 4, RLS, dan service-role-only boundary terpasang. Standalone rollback Phase 4 tidak dijalankan; drill yang diotorisasi khusus rollback/reapply Phase 5.

## Verification evidence

Evidence berikut disalin dari tiga implementation reports. RED adalah bukti sebelum implementasi; GREEN/regression adalah bukti fake/static lokal pada scope worker.

### Telefun lifecycle

```bash
pnpm --dir apps/telefun exec vitest run src/realtime-webrtc/sideband-client.test.ts src/realtime-webrtc/call-manager.test.ts src/realtime-webrtc/phase4-durable-contract.test.ts src/server-openai-wiring.test.ts src/server-shutdown.test.ts
```

- RED exit `1`: 5 files, 7 focused assertions failed.
- GREEN exit `0`: 5 files, 49 tests passed.
- Final focused lifecycle/WebRTC matrix exit `0`: 18 files, 276 tests passed.
- `pnpm --dir apps/telefun exec tsc --noEmit -p tsconfig.json`: exit `0`.
- `pnpm --filter @trainers/telefun lint`: exit `0`.
- `pnpm --filter @trainers/telefun build`: exit `0`.
- `git diff --check`: exit `0`.

### API recording/scoring

```bash
pnpm --dir apps/api exec vitest run \
  src/__tests__/telefun-remux-route.test.ts \
  src/__tests__/telefun-recording-state.test.ts \
  src/__tests__/telefun-routes.test.ts \
  src/__tests__/telefun-scoring-service.test.ts \
  src/__tests__/telefun-phase4-migration-contract.test.ts \
  src/__tests__/telefun-scoring-migration-contracts.test.ts
```

- RED exit `1`: 4 files failed, 9 tests failed.
- GREEN exit `0`: 6 files, 104 tests passed.
- Final focused remux/recording/scoring matrix exit `0`: 11 files, 122 tests passed.
- `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json`: exit `0`.
- Owned-path ESLint: exit `0`; no owned-path lint errors reported.
- `pnpm --filter @trainers/api build`: exit `0`.
- `pnpm --filter @trainers/api lint`: exit `1` on unrelated errors outside assigned files.
- `git diff --check`: exit `0`.
- `nc -z 127.0.0.1 54322` reported `LOCAL_DB_UNAVAILABLE`; no local SQL execution was performed.

### Web reconciliation

```bash
pnpm --dir apps/web exec vitest run \
  src/__tests__/telefun-phone-interface-openai-webrtc.test.tsx \
  src/__tests__/telefun-phone-interface-end-call.test.ts \
  src/__tests__/telefun-session-finalizer.test.ts \
  src/__tests__/telefun-openai-webrtc-client.test.ts \
  src/__tests__/telefun-openai-webrtc-recording.test.ts \
  src/__tests__/telefun-recording-reconciliation.test.ts
```

- RED exit `1`: 2 failed files, 4 passed; 1 failed test, 68 passed.
- GREEN exit `0`: 6 files, 77 tests passed.
- Final focused WebRTC/reconciliation/finalizer + landing matrix exit `0`: 15 files, 166 tests passed.
- `pnpm --dir apps/web exec tsc --noEmit -p tsconfig.json`: exit `0`.
- `pnpm --filter @trainers/web lint`: exit `0`; 0 errors and 151 existing warnings.
- `pnpm --filter @trainers/web build`: exit `0`; existing non-fatal warnings were reported.
- `git diff --check`: exit `0`.
- `node /Users/nadindyta/.agents/skills/impeccable/scripts/detect.mjs --json apps/web/src/routes/telefun/components/PhoneInterface.tsx apps/web/src/routes/telefun/index.tsx`: exit `0`; findings `[]`.

### Direct fix, independent audit, dan F6 follow-up

- Direct fix menutup T1 claim-conflict false `204`, T2 stale queue snapshot, dan T3 timeout object-URL ownership dengan regression masing-masing. Laporan: `.pi/orchestrator/20260801-1947-telefun-p4-direct-fix/direct-fix.md`.
- Independent audit memberi **GAP-FIXED** untuk T2 (same-key latest-version compare) dan T3 (retired URL/late reclaim/session handback), tanpa temuan material baru. Laporan: `.pi/orchestrator/20260801-2030-telefun-p4-audit/audit-fix.md`.
- Status assessment berikutnya menemukan gap F6 tersisa: enqueue kedua hanya bergabung dengan drain lama dan timer mengabaikan entry yang sudah due. Laporan: `.pi/orchestrator/20260801-2035-telefun-p4-status/phase4-status.md`.
- F6 RED post-enqueue: **1 failed, 8 passed (9 total)** karena API enqueue kedua tidak dipanggil. RED due-timer: **1 failed, 9 passed (10 total)** karena entry due tidak dijadwalkan. GREEN final: focused reconciliation **10/10 passed**. Enqueue kedua untuk sibling dan same-session sekarang masing-masing memanggil finalize/remux tepat sekali, dan storage-write failure tidak memulai hot loop.

### Final verification ladder

- Telefun focused matrix: **18 files / 276 tests passed**.
- API focused matrix: **11 files / 122 tests passed**.
- Web focused matrix: **15 files / 166 tests passed**.
- `pnpm test:core`: API **10/139**, Telefun **34/360**, Web **8/143**; **4/4 Turbo tasks successful**.
- Tiga `tsc --noEmit`: exit `0`.
- Owned-scope ESLint untuk F6 production + test: exit `0`.
- Build Telefun, API, Web, dan root `pnpm build`: exit `0`; Web hanya melaporkan warning Node deprecation/Tailwind builtin-skip non-fatal yang sudah ada.
- `git diff --check`: exit `0`.
- Laporan F6 final: `.pi/orchestrator/20260801-2050-telefun-p4-f6-fix/f6-fix.md`.

## Evidence limits and gate status

F1–F8 lulus pada evidence lokal yang tersedia dan jalur tetap default-off/non-production. Follow-up hosted inspection membuktikan Phase 4 migration/RLS/security boundary terpasang, tetapi standalone Phase 4 rollback belum dijalankan. Tidak ada real provider call, paid/manual smoke, real browser/audio/visual check, application deployment, commit, atau push. P3 conditional action-row/layout-shift tetap deferred dan bukan blocker durable lifecycle.
