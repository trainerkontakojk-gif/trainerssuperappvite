# Telefun Functional Hardening & Legacy Parity V2

## Requirement

### Tujuan

Menutup gap parity Telefun yang **masih tersisa** terhadap legacy pada level:

1. fungsi end-to-end (simulasi -> save session -> save recording -> review -> scoring AI),
2. konsistensi data frontend/backend/storage,
3. tampilan dan UX call flow inti.

Target plan ini adalah membuat modul Telefun layak produksi dengan perilaku setara legacy untuk skenario utama, tanpa refactor arsitektur besar.

### Status Saat Ini (Snapshot)

- Parity saat ini: **partial**.
- Fondasi sudah ada: home/chat flow, SettingsModal 4 tab, History/Review/Replay, API telefun, WS proxy telefun, scoring/coaching.
- Gap kritis yang masih perlu ditutup:
  - race condition di akhir panggilan berpotensi menggagalkan finalisasi session/recording/scoring,
  - metadata session belum sepenuhnya paritas legacy (khususnya payload completion/configuration),
  - call-screen UX masih beda di beberapa detail penting dari legacy.

### Acceptance Criteria

| ID | Kriteria |
|---|---|
| AC-01 | Setiap sesi call berakhir dengan hasil deterministik: session tersimpan, durasi tersimpan, status final benar. |
| AC-02 | Rekaman `full_call` dan `agent_only` tersimpan dengan path ownership valid (`<user>/<session>/<type>.webm`) dan bisa diakses via signed URL. |
| AC-03 | Review modal terbuka otomatis setelah finalisasi; jika scoring gagal, sesi tetap tersimpan dan user mendapat status yang jelas. |
| AC-04 | Endpoint Telefun menerima/menyimpan metadata completion yang dibutuhkan parity (durasi, metrics, config ringkas, score/feedback). |
| AC-05 | Replay dan download rekaman selalu memakai signed URL dari API, bukan raw path storage. |
| AC-06 | UI call menampilkan state inti parity (ringing/connected/hold/mute/hangup, status panel, identitas konsumen, timer) tanpa overlap layout. |
| AC-07 | Semua suite Telefun terkait lolos (`web`, `api`, `telefun service`) dan build/type-check lolos. |
| AC-08 | Ada smoke proof di local + hosted (minimal 1 sesi sukses end-to-end). |

### Edge Cases Wajib

- auth token tidak ada/expired sebelum call dimulai,
- user end call cepat (durasi sangat pendek) saat WS baru connect,
- salah satu upload rekaman gagal tetapi session tetap harus tersimpan,
- scoring gagal karena `agent_only` belum tersedia,
- signed URL expired saat review/replay/download,
- WS close code 4001/4003/1006/1011 harus tampil sebagai pesan manusiawi.

### Constraint Teknis

- Backend-first: storage-sensitive flow dan scoring tetap lewat backend/API.
- Tidak menambah library eksternal baru tanpa cek Context7 (sesuai AGENTS.md).
- Tidak mengubah role matrix Telefun existing (`admin/trainer/qa` manager path) kecuali ditemukan bug.
- Perubahan harus minimal dan fokus pada Telefun (`apps/web`, `apps/api`, `apps/telefun`, `packages/types` bila perlu).

---

## Design

### Arsitektur Flow Final (Target)

1. `TelefunLanding.startCall()`:
   - validasi auth,
   - resolve scenario + consumer + identity,
   - create session awal via API (`POST /telefun/sessions`) untuk mendapatkan `sessionId`.
2. `PhoneInterface` menjalankan call + recorder.
3. Saat call selesai:
   - callback `onRecordingReady()` **wajib dieksekusi sebelum teardown final**,
   - `sessionFinalizer` menjalankan urutan:
     - upload `full_call` / `agent_only`,
     - patch metadata sesi,
     - finalize path rekaman,
     - trigger score,
     - patch score/feedback.
4. `ReviewModal` auto-open dengan server record terbaru.
5. History/Replay/Download selalu ambil signed URL via API.

### Keputusan Teknis

#### A. End-Call Lifecycle (P0)

- `PhoneInterface` tidak boleh mematikan peluang `onRecordingReady` saat unmount.
- `TelefunLanding` harus memisahkan:
  - event “UI keluar dari call view”
  - event “finalisasi data selesai”.
- Jika `activeSessionId` tidak ada saat finalisasi, lakukan fallback create-session terlebih dahulu agar tidak ada sesi hilang.

#### B. Session Finalizer Contract (P0)

- Kembalian finalizer harus eksplisit:
  - `saveFailed`,
  - `uploadFailed`,
  - `scoringFailed`,
  - `record`.
- UI menampilkan status berbeda untuk setiap kegagalan, bukan satu pesan generik.

#### C. API Session Metadata (P0/P1)

- Perluas payload `POST/PATCH /telefun/sessions` untuk menyimpan metadata parity yang relevan:
  - `configured_duration`,
  - `response_pacing_mode`,
  - `telefun_model_id`,
  - `telefun_transport`,
  - `persona/disruption summary`,
  - `consumer_phone/city` (jika tersedia),
  - `session_metrics`.

#### D. UI/UX Call Parity (P1)

- Ratakan elemen call-screen yang masih beda:
  - informasi konsumen (nama/nomor/kota),
  - state label (ringing, connected, hold, ai speaking/waiting),
  - kontrol hold/mute/hangup.
- Pertahankan style Vite saat ini, tapi perilaku harus setara legacy.

#### E. Optional WS Reconciliation (P2)

- Tambah event `session_created` dari `apps/telefun` saat server membuat sesi fallback tanpa `sessionId` query.
- Frontend bisa patch row yang sama untuk menghindari potensi duplikasi.

### Public Interface / Contract Impact

| Surface | Perubahan |
|---|---|
| `POST /api/v1/telefun/sessions` | payload metadata diperluas (backward compatible, optional fields). |
| `PATCH /api/v1/telefun/sessions/:id` | payload completion diperjelas, termasuk feedback/score/metrics/configuration fields. |
| `CallRecord` frontend | optional field parity ditambah/dirapikan mengikuti data API. |
| Finalizer result | return status granular untuk handling UX. |

---

## Tasklist

### Phase 1 — Stabilize End-Call & Finalization (P0)

- [x] Refactor lifecycle di `apps/web/src/routes/telefun/components/PhoneInterface.tsx` agar callback recording tidak hilang saat end/unmount.
- [x] Refactor orchestration di `apps/web/src/routes/telefun/index.tsx`:
  - pisahkan close UI vs finalize data,
  - fallback create-session jika `activeSessionId` kosong.
- [x] Hardening `apps/web/src/routes/telefun/sessionFinalizer.ts`:
  - status granular (`save/upload/scoring`),
  - urutan deterministik upload -> patch -> finalize -> score -> patch.

**Verification**

- `./node_modules/.bin/vitest run telefun` di `apps/web`.

### Phase 2 — API Metadata Parity & Validation (P0/P1)

- [x] Perluas schema dan handler `apps/api/src/routes/telefun.ts` untuk metadata completion/config parity.
- [x] Pastikan merge settings tidak overwrite modul lain tetap aman.
- [x] Pertahankan strict recording ownership validation.

**Verification**

- `VITE_SUPABASE_URL=https://dummy.supabase.co SUPABASE_SERVICE_ROLE_KEY=dummy ./node_modules/.bin/vitest run telefun-routes telefun-schema-contract` di `apps/api`.

### Phase 3 — Review/History/Replay Robustness (P1)

- [x] Pastikan review/history mapping membaca field baru dengan fallback aman.
- [x] Tambah retry/fallback signed URL pada replay/download jika URL tidak tersedia/expired.
- [x] Sinkronisasi `CallRecord` type dengan payload API terbaru.

**Verification**

- Tambah/ubah test frontend Telefun yang relevan (`telefun-session-finalizer`, replay/history behavior).

### Phase 4 — Call UI Legacy Behavior Closure (P1)

- [x] Rapikan call-screen state parity (status text, identity info, control behavior).
- [x] Validasi tidak ada overlap/overflow di viewport mobile/desktop.

**Verification**

- Manual smoke `/telefun`:
  - start call,
  - hold/mute/hangup,
  - review auto-open,
  - history row muncul lengkap.

### Phase 5 — Optional WS Canonical Session Event (P2)

- [x] Tambah event `session_created` pada `apps/telefun/src/server.ts` ketika session dibuat server-side.
- [x] Konsumsi event di frontend bila diperlukan untuk canonical patch.

### Phase 6 — P0 Utility Gaps (Audit Closure)

- [x] Fix `resolveTelefunRealisticModeConfig` — mapping consumer type ID (bukan `consumerName`).
- [x] Fix `getTelefunTimeCueThreshold` — tambah guard `totalSeconds > 50/20` di `timingGuards.ts`.
- [x] Fix `ReviewModal` — `recommendations={[]}` diganti `recommendations={recommendations}`.
- [x] Tambah `isValidRecordingPath` + `getOwnedRecordingPathOrNull` di `recordingPath.ts`.
- [x] Buat `replayAnnotationHelpers.ts` (checksum, completeness, sort, truncate, validate).
- [x] Test coverage: 4 file baru + 2 file diperluas (84 test baru, total 99 test).

**Verification**

- `./node_modules/.bin/vitest run` di `apps/telefun`.

---

## Test Strategy

### Automated

1. `apps/web`
   - `./node_modules/.bin/vitest run telefun`
   - `./node_modules/.bin/vite build`
2. `apps/api`
   - `VITE_SUPABASE_URL=https://dummy.supabase.co SUPABASE_SERVICE_ROLE_KEY=dummy ./node_modules/.bin/vitest run telefun-routes telefun-schema-contract`
   - `./node_modules/.bin/tsc -p tsconfig.json`
3. `apps/telefun`
   - `./node_modules/.bin/vitest run`
   - `./node_modules/.bin/tsc -p tsconfig.json`

### Manual Smoke (Local + Hosted)

- local: 1 sesi call pendek + 1 sesi call normal.
- hosted: 1 sesi end-to-end (real token), verifikasi:
  - row `telefun_history`,
  - path recording `full_call` + `agent_only`,
  - review/scoring/summary tersedia,
  - usage log telefun bertambah.

---

## Timeline Estimasi

| Phase | Estimasi |
|---|---:|
| Phase 1 | 0.5 - 1 hari |
| Phase 2 | 0.5 hari |
| Phase 3 | 0.5 hari |
| Phase 4 | 0.5 hari |
| Phase 5 (opsional) | 0.5 hari |
| Verifikasi & docs | 0.5 hari |

Total: **2.5 - 3.5 hari kerja** (tanpa blocker environment).

---

## Dependencies

- `telefun-recordings` bucket aktif dan policy sesuai.
- env Telefun WS + API + Supabase sinkron.
- migration Telefun parity sudah terpasang di target environment.

---

## Risk Register

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Callback recording hilang saat unmount | Session finalization gagal diam-diam | Pisahkan lifecycle UI vs data finalization + regression test. |
| Path upload valid tapi finalize gagal | Review tidak bisa akses rekaman | Granular status + retry/fallback di UI. |
| Drift schema hosted vs lokal | Runtime save/patch error | Contract test + hosted smoke wajib sebelum close. |
| Patch metadata terlalu agresif | Data lama rusak | Field optional + backward compatible handler. |

---

## Rollback Plan

1. Revert bertahap per phase (P0 dulu bila incident).
2. Jika regression di finalizer:
   - rollback ke finalizer sebelumnya,
   - pertahankan endpoint signed URL existing.
3. Jika metadata patch menyebabkan error:
   - disable field baru di frontend payload sementara,
   - backend tetap menerima payload lama.

---

## Definition of Done

- [x] AC-01 s.d. AC-08 terpenuhi.
- [x] Semua command test/build di atas lolos.
- [ ] Smoke local + hosted terdokumentasi.
- [x] Dokumen progress ditambahkan ke `docs/rebuild-logs/`.

