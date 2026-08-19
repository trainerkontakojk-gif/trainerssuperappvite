# Plan Perbaikan Telefun WebRTC Production, Feedback History, dan Ekspansi Mini

- **Status:** Draft siap dieksekusi; implementasi belum dimulai
- **Tanggal baseline:** 2026-08-14 (Asia/Jakarta)
- **Risk lane implementasi:** Lane D — deployment production, kontrak API lintas modul, AI usage/billing, worker, dan migration database
- **Urutan rilis:** Release Train A menstabilkan Full + feedback; Release Train B menambahkan Mini hanya setelah Gate A lulus
- **Baseline rollback:** Gemini Live dan OpenAI WebSocket (`openai-audio`) tetap tersedia dan tidak diubah
- **Batas otorisasi:** plan ini tidak mengizinkan commit, push, migration hosted, perubahan Railway/Vercel, perubahan flag/cohort, atau provider call berbayar

> Semua checkbox implementasi di bawah tetap kosong sampai pekerjaan dan evidence yang disebutkan benar-benar selesai. Executor wajib drift-check source, Git, hosted schema, deployment, dan dokumentasi resmi sebelum mengubah code.

---

## Requirement

### Tujuan

Menyelesaikan tiga masalah tanpa mencampurkan blast radius-nya:

1. mengembalikan jalur **Full `gpt-realtime-2.1` + `openai-webrtc`** ke kondisi production yang konsisten, default-off, dan dapat diuji melalui exact cohort;
2. memastikan sesi WebRTC yang selesai otomatis memperoleh status scoring dan feedback yang terlihat di **History** serta **Review** tanpa reload halaman;
3. menambahkan **`gpt-realtime-2.1-mini` + `openai-webrtc`** secara additive dan fail-closed setelah Full stabil.

OpenAI menyatakan [`gpt-realtime-2.1-mini`](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini) mendukung WebRTC, tetapi aplikasi saat baseline ini masih sengaja mengizinkan Mini hanya melalui `openai-audio`. Dukungan provider harus diverifikasi ulang terhadap dokumentasi resmi pada awal Release Train B.

### Baseline terverifikasi yang harus dipertahankan

| Area | Reality pada 2026-08-14 | Implikasi plan |
| --- | --- | --- |
| Transport Full | Satu hosted exact-cohort run pada Telefun SHA `eaa7e6e` selesai dengan lifecycle, transcript, usage, lease, dan cleanup yang sehat | Perbaikan SDP, single response owner, lease, dan double-truncation tidak boleh diregresikan |
| Availability | Service Telefun production tidak aktif dan health publik `404`; WebRTC flag/cohort tidak terpasang | Tidak boleh mengklaim WebRTC tersedia sebelum service hidup dan gate diverifikasi |
| Artifact | Local HEAD `a30b9bc`, remote candidate `eaa7e6e`, dan API production `4ae2235` tidak identik | Release berikutnya harus membuktikan satu exact SHA lintas Web/API/Telefun/worker |
| Feedback API | Local `a30b9bc` sudah memproyeksikan feedback dari canonical `voice_assessment` untuk terminal WebRTC | Pertahankan helper dan deploy bersama perbaikan UI/worker; jangan membuat parser assessment kedua |
| Feedback hosted | Sesi completed memiliki score dan canonical `voice_assessment`, tetapi feedback legacy kosong | History/detail harus memakai projection authoritative dan client harus refetch |
| Worker scoring | Worker ada di source tetapi tidak mempunyai start script/service aktif; ada eligible job lama yang belum diproses | Worker harus menjadi runtime production eksplisit dan termonitor |
| UI | History dimuat sekali saat mount; WebRTC melewati client scoring; manual assessment hanya mengubah assessment lokal | Tambahkan reconciliation per-session dan satu authoritative upsert path |
| Mini | Voice/scoring OpenAI yang ada telah mengenal Mini, tetapi registry transport, capability, UI, broker, durable type, dan DB claim masih Full-only | Mini adalah Release Train B tersendiri, bukan config toggle |

Jika baseline di atas berubah sebelum eksekusi, executor harus memperbarui bagian ini dan menghentikan pekerjaan bila perubahan tersebut membatalkan desain atau urutan rilis.

### Acceptance criteria Release Train A — Full dan feedback

#### Source dan contract

- [ ] Projection feedback dari canonical `voice_assessment` dipakai konsisten oleh history list dan detail; legacy `feedback` non-kosong tetap dipertahankan.
- [ ] Pending/processing WebRTC tidak menampilkan score `0/10` atau feedback palsu; status tampil sebagai queued/processing.
- [ ] Response scoring membedakan kegagalan retryable dari permanent/exhausted failure, termasuk `scoring_next_attempt_at` yang public-safe; UI tidak menyebut retryable failure sebagai kegagalan final.
- [ ] Sesi `completed + scoring_status=completed` mengembalikan `score`, canonical assessment, dan feedback deterministik yang sama pada list/detail.
- [ ] Manual scoring dan worker scoring berbagi claim/cache/persistence contract; race tidak menghasilkan dua AI call atau overwrite assessment valid.
- [ ] Jalur Gemini dan `openai-audio` tidak berubah behavior-nya.

#### Worker dan operasional

- [ ] Worker mempunyai start command production yang eksplisit dan gagal cepat bila dijalankan dengan konfigurasi tidak valid atau disabled.
- [ ] Worker berjalan sebagai process/service terpisah; API web process tidak menjalankan loop kedua secara tersembunyi.
- [ ] Health internal worker terikat private service network dan memakai internal-token middleware; endpoint bersifat non-billable dan hanya melaporkan status bounded: enabled, loop alive, last successful poll, last error class, queue counts, serta usia eligible pending tertua tanpa session ID/user ID.
- [ ] Error query queue tidak disamarkan menjadi queue kosong/healthy.
- [ ] Graceful shutdown menghentikan claim baru, mengabort provider work secara bounded, dan secara atomik mengembalikan pekerjaan aktif yang belum selesai ke retryable state tanpa late persistence atau AI call ganda.
- [ ] Alert tersedia untuk worker tidak polling, oldest eligible pending melewati threshold, dan failed/rescheduled spike.

#### Web/UX

- [ ] Status awal dari recording transition/remux dipropagasikan ke saved record sebelum polling pertama; client tidak memulai dari state kosong bila backend sudah menyatakan pending/processing/completed/failed.
- [ ] Setelah finalisasi WebRTC, client mengambil ulang session detail sampai hasil current attempt dapat ditampilkan (`completed`, permanent/exhausted `failed`, atau retryable `failed` dengan jadwal berikutnya) dengan polling bounded dan dapat dibatalkan.
- [ ] Hasil authoritative di-upsert berdasarkan session ID ke `history`, `reviewRecord` yang sedang terbuka, dan local storage yang valid.
- [ ] Polling berhenti saat unmount, session dihapus, session baru menggantikan run, status terminal tercapai, atau timeout tercapai; tidak ada late response yang menimpa session lain.
- [ ] Polling pause saat offline/hidden dan dapat dilanjutkan ketika online/visible; reopening History/Review memicu satu refetch terbaru.
- [ ] UI membedakan “menunggu analisis”, “sedang dianalisis”, “analisis gagal/coba lagi”, dan feedback siap menggunakan text/non-color cue yang accessible.
- [ ] Setelah tombol manual “Mulai Analisis” sukses, parent mengambil detail authoritative sehingga score, feedback, dan assessment berubah bersama.
- [ ] Bila polling timeout atau backend menjadwalkan retry otomatis, UI tidak mengklaim gagal final dan menyediakan refresh/retry yang kompatibel dengan claim worker.

#### Deployment dan pilot

- [ ] Web, API, Telefun, dan worker berasal dari satu exact reviewed Git SHA; artifact/runtime SHA dicatat.
- [ ] Telefun `/health` kembali `200` dengan flags off dan tanpa membuka koneksi provider.
- [ ] API dan Telefun memakai exact HTTPS origins, internal URL/token, OpenAI key server-only, orphan key, dan cohort yang konsisten.
- [ ] Worker backlog lama direkonsiliasi secara bounded sebelum cohort dibuka; tidak ada bulk paid retry tanpa estimasi dan persetujuan biaya.
- [ ] Exact-cohort Full smoke membuktikan bidirectional audio, terminal durable lifecycle, recording/remux, worker scoring, History/Review feedback, usage, dan cleanup.
- [ ] Semua user di luar cohort tetap memakai baseline dan tidak melihat WebRTC sebagai available.

### Gate A — syarat sebelum Mini boleh dimulai

Release Train B tidak boleh dimulai sebelum seluruh kondisi ini terpenuhi:

- [ ] Release Train A source dan provider-free verification lulus.
- [ ] Exact reviewed SHA aktif dan health semua service yang relevan lulus.
- [ ] Minimal satu authorized Full smoke selesai end-to-end dengan feedback muncul tanpa reload.
- [ ] Tidak ada active/ending attempt, lease tertinggal, missing usage, duplicate write, atau eligible scoring backlog yang tidak terjelaskan.
- [ ] Gemini dan OpenAI WebSocket baseline sesudah smoke identik dengan baseline sebelum smoke.
- [ ] Rollback flag Full telah dibuktikan tanpa menghapus history.

### Acceptance criteria Release Train B — Mini WebRTC

- [ ] Registry shared menyatakan Mini mendukung `openai-audio` dan `openai-webrtc`; pasangan invalid tetap ditolak fail-closed.
- [ ] Capability API bersifat additive: mempertahankan canonical/default Full field selama masa kompatibilitas dan menambahkan allowlist model WebRTC yang benar-benar tersedia bagi user.
- [ ] Mini tetap default-off melalui server-owned allowed-model configuration; tidak otomatis terbuka hanya karena registry diperluas.
- [ ] API settings/session menerima Mini+WebRTC hanya ketika pasangan registry valid dan runtime capability mengizinkan user/model tersebut.
- [ ] Browser tidak mengirim model, voice, prompt, provider URL, atau secret ke broker; broker mengambil model dari owned pre-created `telefun_history` row.
- [ ] Broker memvalidasi persisted model terhadap allowlist server, lalu membangun canonical OpenAI session menggunakan model tersebut.
- [ ] Attempt claim, durable row, lease, usage persistence, dan pricing context menyimpan exact Mini model; tidak ada fallback diam-diam ke Full.
- [ ] Additive migration baru melebarkan model constraint/RPC ke Full dan Mini; migration historis tidak diedit.
- [ ] Voice `marin`/`cedar` diverifikasi untuk Mini dan tetap server-owned dari persisted consumer gender.
- [ ] Full dan Mini masing-masing mempunyai provider-free matrix untuk auth, ownership, capability, SDP/session build, lifecycle, usage, recording, scoring, dan feedback.
- [ ] Mini exact-cohort smoke—bila diotorisasi terpisah—membuktikan model ID, audio, transcript, usage, scoring, feedback, dan cleanup tanpa memengaruhi Full/baseline.

### Non-goals

- Tidak mengganti Gemini Live atau menghapus OpenAI WebSocket.
- Tidak melakukan fallback provider/model di tengah panggilan.
- Tidak membuat browser scoring kembali menjadi owner untuk WebRTC.
- Tidak menerima model/voice/prompt dari browser pada broker endpoint.
- Tidak menyalin canonical assessment menjadi parser/interface baru di Web.
- Tidak menulis ulang migration historis yang sudah pernah diterapkan.
- Tidak membuka WebRTC ke semua user bersamaan dengan perbaikan feedback.
- Tidak menggabungkan Release Train A dan B menjadi satu production rollout atau satu paid smoke.
- Tidak memperbaiki backlog dengan bulk scoring berbayar tanpa jumlah row, estimasi biaya, budget, dan persetujuan eksplisit.

### STOP conditions

Hentikan eksekusi dan minta keputusan bila salah satu terjadi:

- source/remote/deployed SHA tidak dapat dipetakan secara pasti;
- hosted schema berbeda dari migration contract dan strategi additive tidak lagi aman;
- worker claim tidak mencegah race manual-vs-worker atau usage logging tidak exactly-once;
- Mini price/model access/voice contract tidak dapat dibuktikan dari dokumentasi resmi dan fake boundary;
- root/core/full gate memiliki kegagalan baru yang tidak terjelaskan;
- exact cohort bocor ke user lain, health gagal, durable state tidak drained, atau Gemini baseline berubah;
- live/provider action diperlukan tetapi target, approver, budget, stop owner, dan evidence destination belum eksplisit.

---

## Design

### Urutan dependency dan release

```text
Drift check + RED contracts
        |
        v
Release Train A1: API projection + scoring state contract
        |
        +--> A2: production worker + health/backlog evidence
        |
        +--> A3: Web session reconciliation + truthful UX
        |
        v
Flags-off exact-SHA deploy --> Full exact-cohort smoke --> Gate A
                                                       |
                                                       v
Release Train B1: Mini shared/API/Web contracts
        |
        +--> B2: broker/durable/additive migration/usage
        |
        v
Provider-free Mini matrix --> flags-off deploy --> optional authorized Mini smoke
```

Release Train A dan B harus menjadi change set, review, rollback, dan rollout gate yang terpisah. Gate A adalah dependency keras, bukan checklist dokumentasi saja.

### A. API feedback dan scoring state sebagai source of truth

Pertahankan `apps/api/src/lib/telefun-feedback.ts` sebagai satu helper projection. API list/detail tetap menganggap database/AI payload sebagai `unknown`, memvalidasi melalui parser `@trainers/types`, dan hanya membentuk feedback ketika assessment canonical tersedia.

Perluasan contract response bersifat additive:

```ts
type TelefunScoringStatus = "pending" | "processing" | "completed" | "failed";

type TelefunHistoryScoringView = {
  scoring_status: TelefunScoringStatus | null;
  scoring_ready_at: string | null;
  scoring_next_attempt_at: string | null;
  scoring_retryable: boolean;
  score: number | null;
  feedback: string | null;       // projected bila canonical assessment valid
  voice_assessment: unknown;     // tetap diparse di boundary Web
};
```

Aturan:

- `null` score tetap `undefined/—` di Web; jangan dinormalisasi menjadi `0`.
- `completed` tanpa canonical assessment adalah state inkonsisten yang harus terobservasi, bukan feedback kosong yang dianggap sukses.
- `failed` bukan selalu final: transient failure dapat kembali dipilih worker ketika `scoring_next_attempt_at` due. API harus mengekspos public-safe retryability/next-attempt state; permanent atau exhausted failure dibedakan tanpa raw DB/provider error.
- endpoint manual scoring memakai claim yang sama dengan worker. Bila sudah `processing`, respons menyatakan status terkini tanpa memulai AI call kedua.

### B. Worker scoring production

Gunakan worker yang sudah ada sebagai basis, tetapi pisahkan pure batch processor dari executable runtime:

```text
apps/api/src/workers/
├── telefun-scoring-worker.ts          # claim/process batch; testable
└── telefun-scoring-worker-runtime.ts  # env validation, loop, shutdown, internal health
```

Tambahkan start script di workspace API dan root, misalnya `start:telefun-scoring-worker`, lalu deploy sebagai private long-running Railway service dari exact SHA yang sama. Jangan mengimpor loop ini dari `apps/api/src/index.ts`.

Runtime contract:

- interval dan batch size diparse bounded; invalid/disabled configuration pada worker service keluar non-zero;
- satu batch tidak overlap dengan batch berikutnya;
- shutdown menutup admission, meneruskan `AbortSignal` ke analysis/provider boundary, dan menunggu current job sampai deadline;
- bila deadline habis, claim aktif di-reschedule/release secara atomik sebelum exit, atau orchestrator grace period harus sekurangnya claim timeout. Late provider result tidak boleh menulis setelah reclaim dan request ID/claim guard harus mencegah AI call/persistence ganda;
- queue fetch melempar/menandai DB error; `[]` hanya berarti query sukses tanpa job;
- health endpoint hanya bind pada private service network, menggunakan middleware `TELEFUN_INTERNAL_TOKEN`, tidak membuka provider, dan tidak memproses job;
- backlog health mengembalikan aggregate count/age saja dan tidak memuat UUID, transcript, recording path, prompt, atau raw exception;
- backlog lama diaudit lebih dulu. Rekonsiliasi/backfill dibatasi jumlah job per batch dan kill switch tetap tersedia.

### C. Web reconciliation setelah WebRTC selesai

Tambahkan fetch detail typed untuk `GET /telefun/history/:id` dan ekstrak satu helper upsert authoritative yang digunakan oleh:

- initial history load;
- polling setelah finalisasi WebRTC;
- reopening History/Review;
- hasil manual scoring;
- online/visibility recovery.

State machine konseptual:

```text
idle
  -> waiting_for_scoring (pending/not-ready)
  -> processing
  -> completed  -- upsert score + feedback + assessment; stop
  -> failed_retryable -- show scheduled retry/current-poll stop; worker may continue
  -> failed_final     -- show explicit retry if contract permits; stop
  -> timed_out  -- retain pending truth; allow explicit refresh
```

Polling harus session-scoped dan bounded. Baseline awal yang diuji: immediate fetch, lalu backoff `2s, 5s, 10s, 15s` dengan maksimum interval `15s` dan total active wait maksimum `120s`. Timer berhenti/pause ketika hidden atau offline dan dilanjutkan melalui refetch tunggal. Nilai final boleh disesuaikan bila test/runtime evidence membuktikan worker SLA lain; perubahan harus didokumentasikan.

Gunakan `AbortController` dan run/session token agar respons terlambat tidak dapat:

- menghidupkan kembali row yang sudah dihapus;
- menimpa Review session lain;
- menulis local storage setelah unmount;
- mengubah state panggilan baru.

`CallRecord` mendapat scoring state typed. `saveTelefunSession()`/`handleRecordingReady` harus menanam status awal dari recording transition/remux response ke saved record sebelum polling. `mapTelefunSessionRow()` tidak lagi memaksa missing score menjadi `0`. `ReviewModal` dan `HistoryModal` menampilkan state text yang konsisten dan accessible. Perubahan ini bukan redesign layout.

Setelah manual scoring sukses, `VoiceAssessmentSection` boleh menampilkan assessment hasil parse secara langsung, tetapi parent tetap melakukan detail refetch dan authoritative upsert agar `score`, `feedback`, `voiceAssessment`, dan `scoringStatus` sinkron.

### D. Full production artifact dan configuration alignment

Sebelum deploy, bentuk satu candidate baru dari baseline yang telah drift-check dan seluruh Release Train A fix. Jangan mendeploy campuran `a30b9bc`, `eaa7e6e`, dan `4ae2235`.

Urutan rollout Full:

1. deploy API, Telefun, Web, dan worker exact SHA dengan WebRTC flags off;
2. buktikan health, internal connectivity, origins, secrets presence, schema, FFmpeg, dan worker poll tanpa provider call;
3. rekonsiliasi stale attempt/lease/backlog melalui prosedur bounded dan audit-safe;
4. nyalakan flag dan exact cohort yang sama di API/Telefun; user lain tetap deny-all;
5. lakukan satu authorized Full smoke dengan stop control;
6. verifikasi DB lifecycle/usage/recording/scoring, lalu UI History/Review tanpa reload;
7. tutup kembali gate bila acceptance gagal; jangan retry otomatis.

`TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false` atau cohort kosong tetap menjadi rollback utama. Worker mempunyai kill switch terpisah agar scoring dapat dihentikan tanpa mengubah history atau transport baseline.

### E. Mini registry dan capability contract

Perluas shared registry sehingga Mini mengenal `openai-webrtc`, tetapi jangan menjadikan registry sebagai rollout authority. Tambahkan server-owned allowed-model configuration dengan default hanya Full, misalnya:

```text
TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS=gpt-realtime-2.1
```

Nilai harus identik di API dan Telefun dan diparse melalui shared exact allowlist rule. Set efektif selalu merupakan irisan registry shared dengan konfigurasi API dan Telefun; env tidak boleh mengenalkan model arbitrary. Missing/empty/invalid config harus fail-closed atau kembali ke default Full-only yang eksplisit; Mini tidak boleh aktif secara implisit setelah code deploy. Flags-off deployment gate harus membandingkan parsed set kedua service. Mismatch tetap fail-closed sebelum provider call, menghasilkan error public-safe, dan pre-created session harus diterminalisasi/cleanup tanpa rate-limit atau active-placeholder churn yang berulang.

Capability response dibuat additive untuk mencegah drift frontend/backend:

```ts
openaiWebRtc: {
  enabled: boolean;
  allowed: boolean;
  transport: "openai-webrtc";
  modelId: "gpt-realtime-2.1"; // compatibility/default selama transisi
  modelIds: readonly TelefunWebRtcModelId[];
}
```

Web mengizinkan transport hanya bila selected model ada pada `modelIds`. API settings/session tetap memvalidasi pasangan melalui shared registry dan runtime gate. Error publik menyebut model/transport tidak tersedia tanpa membocorkan cohort/config server.

### F. Mini broker, durable lifecycle, migration, dan usage

Browser endpoint tetap raw `application/sdp` dengan `sessionId` di path. Model berasal dari row server-owned:

```text
JWT + owner + active session
        -> load persisted telefun_model_id/transport/prompt/gender
        -> validate transport=openai-webrtc
        -> validate model in server allowed-model set
        -> build canonical provider session(modelId, prompt, gender)
        -> claim attempt(modelId)
        -> persist usage with the same modelId
```

Refactor konstanta Full-only menjadi union/allowlist shared yang sempit. `buildCanonicalPocSession` dapat dinamai ulang menjadi canonical WebRTC builder, tetapi seluruh invariant VAD, response ownership, prompt validation, voice resolution, SDP bounds, auth, ownership, and cleanup harus tetap sama.

Validated model harus diteruskan secara eksplisit melalui `http-broker` start input, `WebRtcCallManagerOptions`, `ActiveBinding`, normal usage flush, dan legacy/missing-usage finalizer. `server.ts` memakai model dari binding saat memanggil usage persistence; tidak ada callback yang boleh kembali ke `POC_MODEL_ID`. Uji success, failure, abort, dan legacy finalization agar semuanya mencatat Mini sebagai Mini.

Migration harus additive dengan timestamp baru. Migration tersebut:

- melebarkan `telefun_realtime_attempts.model_id` check menjadi exact set Full + Mini;
- mengganti body RPC claim yang saat ini memaksa Full agar memvalidasi exact allowlist dan kecocokan history row;
- mempertahankan `transport = 'openai-webrtc'`, owner/session/attempt checks, idempotency, grants, dan `search_path` hardening;
- tidak mengubah constraint provider/lease yang memang transport-level;
- mempunyai contract test dan hosted apply/rollback drill pada database disposable/staging terlebih dahulu.

Rollback Mini dilakukan dengan menghapus Mini dari allowed-model config terlebih dahulu. Constraint database tidak boleh dipersempit kembali selama masih ada row Mini; schema additive boleh tetap menerima Mini sementara runtime menolaknya. Jika rollback migration benar-benar diperlukan, audit dan terminalisasi seluruh Mini attempt harus selesai dahulu.

Usage model harus diteruskan dari authorized session/attempt, bukan konstanta Full. `logAiUsage()`/usage RPC tetap exactly-once dengan request ID stabil dan `UsageContext` Telefun. Pricing Mini yang sudah dipakai jalur OpenAI WebSocket harus diverifikasi dapat dipakai WebRTC tanpa mengarang token/cost; metadata tidak lengkap tetap menjadi missing-usage audit state.

### G. Security, privacy, dan observability invariants

- Standard OpenAI key, service role, internal token, orphan key, provider reference, prompt, dan sideband URL tetap server-only.
- Browser tidak menentukan model authoritative; body broker tidak berubah menjadi JSON/multipart config.
- Health dan automated tests tidak membuka provider call.
- Structured logs tidak memuat transcript, SDP, prompt, raw provider payload/error, recording URL/path, UUID user/session, atau credential.
- Metrics mempertahankan hashed user correlation dan bounded provider code/param allowlist yang sudah ada.
- Missing usage tidak dicatat sebagai zero sintetis.
- Manual/worker scoring selalu memakai canonical assessment parser dan provider-matched scoring route.

### H. Perkiraan file yang akan berubah

Daftar ini adalah ownership map, bukan izin untuk mengubah semua file sekaligus.

| Workstream | File utama |
| --- | --- |
| API history/scoring | `apps/api/src/lib/telefun-feedback.ts`, `apps/api/src/routes/telefun/sessions.ts`, `apps/api/src/services/telefun-scoring-service.ts`, `apps/api/src/workers/telefun-scoring-worker*.ts` |
| API capability/config | `apps/api/src/routes/telefun/capabilities.ts`, `apps/api/src/lib/env.ts`, settings/session route tests |
| Web feedback state | `apps/web/src/routes/telefun/telefunApi.ts`, `types.ts`, `index.tsx`, `ReviewModal.tsx`, `HistoryModal.tsx`, `VoiceAssessmentSection.tsx`, helper reconciliation baru yang kecil |
| Web Mini selection | `apps/web/src/routes/telefun/services/telefunWebRtcCapability.ts`, settings draft/system tab, start-flow guards |
| Shared model contract | `packages/types/src/ai-models.ts` dan owning tests |
| Broker Mini | `apps/telefun/src/realtime-webrtc/contracts.ts`, `broker-auth.ts`, `http-broker.ts`, `durable-db.ts`, `call-manager-types.ts`, `call-manager*.ts`, `server.ts`, env schema/rollout gate |
| Database | migration additive baru di `supabase/migrations/`; historical Phase 4/5 migrations hanya dibaca/tested |
| Runtime scripts/docs | root/API `package.json`, `docs/telefun.md`, `docs/deployment.md`, `docs/architecture.md`, focused rebuild log/handoff evidence |

### I. Test strategy

Strict TDD dilakukan per behavior, bukan satu batch besar. Extend owning test file bila module yang sama sudah memiliki harness; buat file baru hanya untuk state machine baru yang benar-benar mempunyai boundary sendiri.

| Layer | RED contract minimum |
| --- | --- |
| API feedback | terminal WebRTC canonical assessment diproyeksikan di list/detail; pending/invalid/legacy cases tetap benar |
| Worker | disabled/invalid config fail-fast; DB error bukan empty success; non-overlap; claim race; SIGTERM mid-analysis atomically retryable tanpa late write/double AI call; private authenticated bounded health payload |
| Web reconciliation | initial blank -> pending -> completed updates History + open Review + local storage; failed/timeout/offline/unmount/delete/new-run tidak menghasilkan stale write |
| Manual scoring | success triggers authoritative detail refresh; score/feedback/assessment berubah bersama |
| Shared Mini | Full+WebRTC dan Mini+WebRTC valid; unsupported pairs tetap invalid; default normalization tidak diam-diam memindahkan model |
| Capability | modelIds additive, Full-only default, Mini fail-closed, arbitrary env model rejected, API/Telefun parsed-set mismatch cleanly rejected sebelum provider call |
| Broker | persisted Full/Mini builds exact model; browser model override impossible; unsupported persisted model rejected before provider call |
| Durable DB | additive SQL/RPC accepts exact Full/Mini, rejects other model/transport/owner/state, preserves idempotency/grants |
| Usage | Full/Mini request/model parity pada success/failure/abort/legacy finalizer, exactly-once, missing metadata audit, pricing lookup correct |
| Regression | Gemini, OpenAI WebSocket, SDP canonicalization, response ownership, interruption, lease, recording/remux, scoring all stay green |

Provider-free focused commands yang direncanakan:

```bash
pnpm --filter @trainers/api exec vitest run \
  src/__tests__/telefun-history-feedback.test.ts \
  src/__tests__/telefun-scoring-service.test.ts \
  src/__tests__/telefun-scoring-worker-integration.test.ts \
  src/__tests__/telefun-live-model-registry.test.ts \
  src/__tests__/telefun-routes.test.ts \
  src/__tests__/telefun-phase4-migration-contract.test.ts

pnpm --filter @trainers/web exec vitest run \
  src/__tests__/telefun-landing-history.test.ts \
  src/__tests__/telefun-review-recording-source.test.tsx \
  src/__tests__/telefun-web-rtc-capability.test.ts \
  src/__tests__/telefun-settings-draft-lifecycle.test.tsx \
  src/__tests__/telefun-phone-interface-openai-webrtc.test.tsx \
  src/__tests__/telefun-openai-webrtc-client.test.ts

pnpm --filter @trainers/telefun exec vitest run \
  src/realtime-webrtc/contracts.test.ts \
  src/realtime-webrtc/broker-auth.test.ts \
  src/realtime-webrtc/http-broker.test.ts \
  src/realtime-webrtc/call-manager.test.ts \
  src/realtime-webrtc/phase4-durable-contract.test.ts \
  src/db-webrtc.test.ts
```

Nama test dapat berubah bila owning harness yang tepat berbeda setelah drift-check, tetapi evidence akhir harus memetakan setiap acceptance criterion ke test atau runtime proof yang jelas.

### J. Verification dan release gates

Setelah setiap RED/GREEN workstream, jalankan focused test. Setelah source terintegrasi:

```bash
pnpm typecheck
pnpm test:affected
pnpm lint
pnpm test:core
pnpm build
git diff --check
```

Sebelum merge/release, jalankan `pnpm test:full`, migration validation/DB integration yang relevan, provider-free Chromium SDP proof, serta CI. Ikuti workflow repo untuk `trainers-superapp-tdd`, review `thermo-nuclear`, dan audit `impeccable` pada interaction/accessibility change. Jangan memakai skill Superpowers. Jalankan `graphify update .` tepat sekali setelah integrated code batch selesai, bukan saat plan-only ini.

Live smoke bukan bagian automated verification. Ia memerlukan authorization record terpisah yang minimal memuat:

- approver dan expiry;
- environment, exact SHA, exact user cohort, serta model (`Full` atau `Mini`, tidak keduanya);
- maksimum satu provider call, durasi maksimum, zero automatic retry;
- budget USD positif dan abort threshold;
- stop owner serta evidence destination;
- cleanup/reconciliation procedure.

### K. Rollback

#### Release Train A

1. tutup `TELEFUN_OPENAI_WEBRTC_POC_ENABLED` dan/atau kosongkan exact cohort di API + Telefun;
2. pertahankan owner-bound cleanup untuk session yang sudah dibuat;
3. hentikan worker melalui kill switch hanya bila worker bermasalah; jangan hapus pending jobs/history;
4. drain attempt/lease dan audit usage/recording/scoring;
5. verifikasi Gemini dan OpenAI WebSocket baseline;
6. rollback artifact hanya ke exact known-good SHA, bukan campuran per-service.

#### Release Train B

1. hapus Mini dari `TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS` di API + Telefun;
2. pertahankan Full dan baseline transport;
3. terminalisasi/reconcile Mini attempt dan usage;
4. jangan mempersempit DB constraint sebelum tidak ada row Mini yang bergantung padanya;
5. rollback code hanya setelah capability client/server dan stored settings lama tetap terbaca aman.

---

## Tasklist

### Phase 0 — Drift check dan evidence baseline

- [ ] Catat `git status`, HEAD, remote refs, diff/index, dan semua dirty path; lindungi `.vercel/` serta perubahan user lain.
- [ ] Baca plan ini penuh, plan Phase 7/merge-prep, canonical Telefun/assessment/deployment docs, source/test/migration aktual.
- [ ] Verifikasi hosted read-only: active deployments/SHA, health, sanitized env key presence, schema/RPC, attempt/lease, usage, scoring backlog, dan latest terminal Full session.
- [ ] Revalidasi kontrak Mini WebRTC/voice/session terhadap dokumentasi resmi OpenAI; simpan kesimpulan ringkas tanpa secret/provider payload.
- [ ] Query dependency graph secara sempit untuk model/capability/claim/feedback callers; fallback ke `rg` bila graph stale.
- [ ] Tetapkan candidate base dan tulis matriks acceptance-to-evidence sebelum code.
- [ ] STOP bila source/runtime reality membatalkan urutan Release Train A -> Gate A -> Release Train B.

### Phase 1 — RED/GREEN API feedback dan scoring status

- [ ] RED: tambah/extend test list/detail untuk projection, status pending/processing/completed/failed, null score, invalid assessment, dan legacy feedback.
- [ ] GREEN: pertahankan satu canonical projection helper dan response fields additive.
- [ ] RED: manual-vs-worker concurrent scoring tidak membuat duplicate AI call/persistence.
- [ ] GREEN: satukan claim/cache/status semantics dan public-safe error result.
- [ ] Jalankan focused API tests dan catat exit code.

### Phase 2 — RED/GREEN scoring worker runtime

- [ ] RED: worker executable menolak disabled/invalid interval/batch configuration.
- [ ] RED: DB queue error dilaporkan degraded/error, bukan zero jobs.
- [ ] RED: loop tidak overlap; SIGTERM mid-analysis mengabort bounded, me-reschedule/release claim secara atomik, tidak melakukan late write, dan tidak membuat AI call kedua pada reclaim.
- [ ] RED: private internal-token health payload bounded dan tidak mengandung identifier/secret/path/raw error.
- [ ] GREEN: ekstrak runtime, tambah start scripts, liveness/readiness/backlog snapshot, dan structured logs.
- [ ] Tambah deployment config/runbook private worker beserta alert thresholds dan kill switch.
- [ ] Uji backlog reconciliation menggunakan fake/staging data tanpa provider call.

### Phase 3 — RED/GREEN Web feedback reconciliation

- [ ] RED: completed WebRTC awalnya blank/pending lalu detail API completed meng-update History, open Review, dan local storage tanpa reload.
- [ ] RED: recording transition/remux `scoringStatus` mengisi initial saved `CallRecord` sebelum fetch detail pertama.
- [ ] RED: pending/processing tidak menjadi `0/10`; UI menampilkan status non-color yang benar.
- [ ] RED: retryable failure, permanent/exhausted failure, dan timeout berhenti dengan state jujur serta refresh/retry yang tidak berkonflik dengan worker.
- [ ] RED: unmount/delete/new session/late response/offline/hidden tidak menyebabkan stale write atau timer leak.
- [ ] RED: manual scoring success memicu authoritative detail refresh dan meng-update score/feedback/assessment bersama.
- [ ] GREEN: tambah typed detail fetch, session reconciler, authoritative upsert helper, `CallRecord.scoringStatus`, dan UI state minimal.
- [ ] Jalankan focused Web tests, accessibility audit, dan perbaiki temuan interaction material.

### Phase 4 — Integrasi dan flags-off Release Train A

- [ ] Jalankan focused regression API/Web/Telefun, workspace checks, specialist reviews, root typecheck/lint/core/build/full, Chromium SDP proof, migration checks, dan CI.
- [ ] Update canonical docs dan satu rebuild log dengan behavior, worker operation, env, rollback, serta exact commands/results.
- [ ] Refresh Graphify satu kali setelah batch source final dan review generated diff terpisah.
- [ ] Bentuk exact reviewed candidate; minta otorisasi sebelum commit/push.
- [ ] Minta otorisasi sebelum deploy; deploy Web/API/Telefun/worker exact SHA dengan flags off.
- [ ] Verifikasi health, artifact parity, exact origins/internal tokens, FFmpeg, worker poll, schema, serta zero provider call.
- [ ] Audit dan reconcile stale attempt/lease/scoring backlog secara bounded; minta persetujuan biaya sebelum scoring job lama yang dapat membuka AI call.

### Phase 5 — Full exact-cohort acceptance dan Gate A

- [ ] Buat authorization record satu Full call dengan target/SHA/cohort/budget/expiry/stop/evidence lengkap.
- [ ] Enable exact cohort konsisten pada API + Telefun; buktikan user lain tetap denied/baseline.
- [ ] Jalankan satu call tanpa automatic retry dan verifikasi audio dua arah, transcript, lifecycle, recording/remux, usage, worker scoring, feedback History/Review tanpa reload, cleanup, dan lease drain.
- [ ] Tutup gate segera pada material error dan jalankan rollback/reconciliation.
- [ ] Verifikasi Gemini/OpenAI WebSocket baseline sesudah smoke.
- [ ] Catat PASS/FAIL jujur dan tandai Gate A hanya jika seluruh acceptance terpenuhi.

### Phase 6 — RED/GREEN Mini shared/API/Web

- [ ] Mulai hanya setelah Gate A lengkap; buat change set terpisah.
- [ ] RED: shared registry menerima Mini+WebRTC tetapi tetap menolak pasangan unsupported.
- [ ] RED: capability Full-only by default dan Mini hanya muncul ketika allowed-model config + user gate mengizinkan.
- [ ] RED: API/Telefun allowed-model mismatch, duplicate/unknown env values, dan stale capability semuanya fail-closed tanpa provider call atau active session leak.
- [ ] RED: settings/session/start flow mempertahankan selected Mini+WebRTC tanpa force ke Full/audio dan menolak capability mismatch.
- [ ] GREEN: implement shared model union, additive `modelIds`, env validation, API pair/runtime gate, dan Web selection/start flow.
- [ ] Verifikasi voice mapping Mini tetap server-owned dan UI tidak mengirim config provider ke broker.

### Phase 7 — RED/GREEN Mini broker, durable DB, dan usage

- [ ] RED: broker Full/Mini memakai exact persisted session model; browser override dan unsupported model ditolak sebelum provider call.
- [ ] RED: canonical builder mempertahankan prompt/VAD/voice/response/interruption invariants untuk kedua model.
- [ ] RED: `http-broker -> manager options -> active binding -> normal/abort/legacy usage finalizer` membawa model yang sama end-to-end dan exactly-once.
- [ ] RED: additive migration/RPC menerima exact Full/Mini, menolak model lain, dan mempertahankan owner/state/idempotency/grants.
- [ ] GREEN: refactor Full constant menjadi validated model input dan tambahkan migration baru; jangan edit migration lama.
- [ ] Jalankan disposable/staging migration apply/rollback drill dan hosted schema verification read-only sebelum production authorization.
- [ ] Jalankan Full+Mini provider-free matrix, regression baseline, root gates, security/quality review, dan CI.

### Phase 8 — Flags-off Mini deploy dan optional acceptance

- [ ] Update canonical docs/runbook/model capability/rollback dan exact verification evidence.
- [ ] Bentuk exact reviewed Mini candidate; minta otorisasi commit/push/deploy terpisah.
- [ ] Deploy code/migration dengan allowed-model config masih Full-only; buktikan Mini tetap unavailable dan Full tidak regresi.
- [ ] Minta authorization record Mini satu call yang terpisah dari Full.
- [ ] Tambahkan Mini ke allowed-model config pada exact cohort saja dan jalankan satu smoke tanpa retry otomatis.
- [ ] Verifikasi exact Mini model di attempt/usage, audio/transcript, durable terminal state, recording/remux, worker scoring, feedback, cleanup, dan baseline Full/Gemini.
- [ ] Rollback Mini config segera bila ada drift, missing usage, lifecycle leak, feedback failure, atau cohort leak.

### Completion report

- [ ] Laporkan file yang berubah, migration, exact test commands/exit codes, review findings, deployed SHA per service, env key presence (tanpa nilai), hosted evidence, paid-call count/cost, dan remaining limitations.
- [ ] Pisahkan status: source complete, provider-free verified, deployed flags-off, Full live accepted, Mini source complete, dan Mini live accepted.
- [ ] Jangan menyebut keseluruhan pekerjaan complete bila salah satu release gate yang diminta masih deferred.
