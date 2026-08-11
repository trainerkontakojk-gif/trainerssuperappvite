# Phase 6 — Audit Kegagalan Koneksi Paid Smoke OpenAI WebRTC

## Verdict

**Server-side start berhasil dan first server finalizer adalah request `browser_delete` setelah SDP broker diterima.** OpenAI Calls auth/start, broker persistence, dan pembukaan sideband sudah berhasil. Sekitar setengah detik kemudian browser mengirim cleanup `DELETE ?outcome=failed`. Ini membuktikan siapa yang meminta finalisasi di server, tetapi belum membuktikan penyebab tepat di browser: `setRemoteDescription`, wait-for-peer/ICE, data channel/provider event, microphone, atau lifecycle UI masih perlu dibedakan dari client stage log.

Trigger paling kuat adalah bug nyata pada implementasi sebelum `8e9fdc3`: `.trim()` menghapus terminal `CRLF` SDP answer. Chromium mereproduksi jalur itu 10/10 sebagai `OperationError / Invalid SDP line`, sedangkan bentuk canonical di HEAD diterima 10/10. Fix source sudah ada di HEAD `8e9fdc3621f0f812f5a655e4935b2dd736b5b27f`. Namun exact bundle Web yang dipakai attempt gagal tidak mempunyai commit SHA immutable, sehingga atribusi runtime terhadap trigger ini berstatus **VALIDATED CANDIDATE**, bukan bukti final untuk setiap attempt. Fix juga belum mempunyai evidence deployment/paid smoke yang sah. Gate Phase 6 tetap **NO-GO**.

## Scope dan batas audit

- Checkout: `main`, HEAD `8e9fdc3`, worktree bersih saat audit dimulai.
- Jalur yang diperiksa: Web UI -> broker SDP Telefun -> OpenAI `/v1/realtime/calls` -> sideband -> browser `setRemoteDescription` -> durable cleanup.
- Evidence runtime: Railway deployment/log yang sudah dihapus, hosted Supabase metadata attempt/metric, source/diff Git, focused fake tests, dan probe Chromium lokal provider-free.
- Audit source awal tidak melakukan deploy, mutation Railway/Supabase, perubahan
  environment, provider retry, atau paid OpenAI call baru. Follow-up operator
  kemudian mengotorisasi rekonsiliasi dan rollback/reapply Phase 5 pada database
  production canonical; scope tetap hanya Telefun OpenAI WebRTC dan provider
  call tetap nol.
- Raw SDP, token, prompt, UUID user/session, dan secret tidak disalin ke laporan.

## Evidence chain

### 1. Broker dan provider berhasil memulai call

Pada dua attempt terakhir di deployment staging yang sama:

| Waktu UTC        |           Broker POST | State server sebelum terminal |                        Cleanup browser |
| ---------------- | --------------------: | ----------------------------- | -------------------------------------: |
| 2026-08-10 07:54 | `201`, sekitar 2.19 s | `sideband_connected=true`     | `DELETE failed`, `204`, sekitar 0.53 s |
| 2026-08-10 09:11 | `201`, sekitar 2.56 s | `sideband_connected=true`     | `DELETE failed`, `204`, sekitar 0.51 s |

First-owner log untuk keduanya adalah:

```text
source=browser_delete
reason=authenticated_delete_fail
requestedOutcome=failed
state=sideband_connected
sidebandConnected=true
```

Tidak ada marker **server-side** `provider_error`, `sideband_close`, `start_failure`, `request_aborted`, `lease_lost`, atau `shutdown` pada window yang sama. Hosted attempt juga sudah mencapai `brokered` dan `sideband_connected`, lalu finalisasi dimulai sekitar setengah detik sesudahnya. Dengan demikian, server-side start berhasil dan browser kemudian meminta cleanup. Marker ini tidak membedakan connect catch dari peer/ICE/data-channel/provider-event atau UI lifecycle yang semuanya dapat berakhir pada browser DELETE.

### 2. Identitas artifact Web tidak immutable

- Deployment **Telefun server** dibuat pada 2026-08-10 07:42 UTC. First-owner marker membuktikan observability `66b1a95` ada di server itu, tetapi tidak membuktikan versi JavaScript browser.
- Deployment **Web** `4e24…` dibuat pada 08:57 UTC, mulai melayani asset pada 08:59 UTC, dan aktif saat attempt 09:11 UTC. Metadata CLI menyebut `8e9fdc3`, tetapi `commitHash=null`; snapshot build tidak memberikan bukti isi `brokerApi.ts`.
- Browser mengambil chunk Telefun dari Web deployment tersebut sebelum attempt 09:11. Untuk attempt 07:54 tidak ada asset-hit Web yang dapat mengidentifikasi bundle; halaman mungkin sudah terbuka dari artifact sebelumnya.
- Seluruh deployment staging Web/API/Telefun kemudian berstatus `REMOVED`/tidak aktif; public URL sekarang mengembalikan Railway fallback `404 Application not found`.

Karena Web dan Telefun adalah service terpisah dan CLI upload Web tidak menyimpan commit SHA, timing atau pesan CLI tidak cukup untuk mengklaim attempt 09:11 pasti menggunakan source sebelum maupun sesudah fix. Audit ini sengaja mempertahankan status artifact sebagai **UNKNOWN**.

### 3. Trigger lama direproduksi di Chromium tanpa provider

Probe memakai Chrome for Testing `HeadlessChrome/148.0.7778.96`, dua `RTCPeerConnection` lokal, dan SDP answer yang benar-benar dibuat browser. Sepuluh pasangan fresh dijalankan untuk setiap bentuk input:

| Bentuk SDP answer                                           |          Hasil |
| ----------------------------------------------------------- | -------------: |
| SDP asli browser                                            | 10/10 diterima |
| Terminal `CRLF` dihapus seperti implementasi lama `.trim()` |  0/10 diterima |
| LF-only dengan terminal newline                             | 10/10 diterima |
| Canonical `CRLF` + satu terminal `CRLF` seperti HEAD        | 10/10 diterima |

Varian lama gagal konsisten dengan `OperationError` / `Invalid SDP line` pada `setRemoteDescription`. Probe tidak memakai OpenAI, Railway, Supabase, microphone nyata, atau jaringan provider.

### 4. Source fix di HEAD tepat pada boundary yang gagal

`apps/web/src/routes/telefun/services/openaiWebRtc/brokerApi.ts` sebelumnya:

```ts
const trimmed = answerSdp.trim();
return trimmed;
```

HEAD sekarang mengubah semua line ending menjadi `CRLF`, membatasi ukuran, dan menambahkan tepat satu terminal `CRLF` sebelum SDP diteruskan ke `setRemoteDescription`. Test client juga mengunci LF-only normalization, terminal `CRLF`, dan redaksi diagnostic SDP.

## Diagnosis

### Boundary yang terbukti

```text
OpenAI call + sideband sukses
          |
          v
Telefun mengembalikan SDP answer (HTTP 201)
          |
          v
browser meminta finalisasi sebelum peer connected tercatat
          |
          v
connect/failure cleanup -> DELETE ?outcome=failed -> telepon berakhir
```

### Trigger utama yang tervalidasi, tetapi belum terikat ke artifact runtime

```text
client pre-8e9fdc3 menjalankan answerSdp.trim()
          |
          v
terminal CRLF hilang -> Chromium setRemoteDescription gagal
          |
          v
connect catch -> browser DELETE ?outcome=failed -> telepon berakhir
```

### Dikesampingkan atau dipersempit untuk dua attempt terakhir

- **Model/start endpoint tidak tersedia:** `gpt-realtime-2.1` adalah model Realtime yang valid dan upstream call sudah mengembalikan SDP success. Ini tidak menyingkirkan error provider yang hanya terlihat setelah start pada browser data channel.
- **API key/provider start auth:** upstream call tidak mungkin mencapai `201` + sideband connected jika boundary ini gagal.
- **Supabase migration/claim/lease:** attempt sudah claimed, brokered, dan sideband connected.
- **CORS/origin atau JWT:** POST sudah authenticated dan mengembalikan `201`; wildcard origin tetap merupakan blocker readiness untuk deployment lain, tetapi bukan pemicu dua attempt ini.
- **Server-side provider event/sideband close:** tidak ada marker terkait sebelum finalisasi. Browser-side provider/data-channel event tetap unknown.
- **Connect timeout:** timeout client 15 detik, sedangkan cleanup dimulai kurang dari satu detik setelah broker response.

## Status fix dan residual risks

| Item                                         | Status                                    | Catatan                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source fix terminal SDP                      | **DONE di HEAD**                          | Commit `8e9fdc3`; trigger tervalidasi lokal, belum runtime-proven                                                                                                                                                                                                            |
| Current targeted client verification         | **PASS**                                  | Client 69/69, Web typecheck exit 0, Web build exit 0                                                                                                                                                                                                                         |
| Provider-free real Chromium characterization | **PASS sebagai local candidate evidence** | Reproducible probe menjalankan actual `brokerApi.ts`; 10/10 canonical diterima dan 10/10 trimmed ditolak. SHA/blob parity, browser identity, timestamp, exit, network/provider count, dan artifact tersanitasi dipersist tanpa raw SDP. Ini tetap bukan deployed/paid proof. |
| Hosted migration + rollback proof            | **PASS**                                  | Phase 4/5 hadir; stale WebRTC state direkonsiliasi; canonical Phase 5 rollback/reapply committed atomically dengan row/security assertions lulus                                                                                                                             |
| Staging Web/API/Telefun deployment           | **FAIL**                                  | Semua service staging tidak mempunyai deployment aktif; public URLs fallback 404                                                                                                                                                                                             |
| Failed-call Web artifact identity            | **UNKNOWN**                               | Web CLI upload tidak memiliki immutable commit metadata                                                                                                                                                                                                                      |
| P5 technical gate                            | **DB PASS / overall PARTIAL**             | Hosted migration, RLS, grants, reconciliation, dan rollback drill lulus; Railway restart, load lintas replica, external review, serta real-browser/device/network matrix belum ada                                                                                           |
| Phase 6 authorization/budget/cohort          | **NO-GO**                                 | Belum ada authorization YAML lengkap untuk satu paid call baru                                                                                                                                                                                                               |
| Paid smoke pada `8e9fdc3`                    | **NOT RUN**                               | Tidak boleh disimpulkan lulus dari local/fake evidence                                                                                                                                                                                                                       |

Residual risks yang harus ditutup sebelum paid smoke:

1. Deploy exact immutable candidate ke **staging**, bukan production, dan buktikan artifact SHA/parity.
2. Pastikan API capability gate dan Telefun rollout gate memakai exact account yang sama; `ALLOWED_ORIGINS` harus exact HTTPS origin dan bukan `*`.
3. Jalankan health/capability/fake smoke provider-free setelah deploy. `/health` hanya bukti liveness/configuration, bukan bukti OpenAI WebRTC.
4. Paid smoke hanya satu call, satu account, satu model/voice, budget positif eksplisit, zero retry, dengan evidence audio dua arah, transcript, usage, recording, durable end, dan cleanup.
5. Jika smoke pada candidate baru masih gagal, first-owner client log wajib menunjukkan `terminationSource` dan `stage`; jangan melakukan retry sebelum evidence diambil dan authorization baru diterbitkan.

### Verifikasi langsung pada current checkout

| Command                                                                                          | Exit | Hasil                                                           |
| ------------------------------------------------------------------------------------------------ | ---: | --------------------------------------------------------------- |
| `pnpm --filter @trainers/web exec vitest run src/__tests__/telefun-openai-webrtc-client.test.ts` |    0 | 1 file, 69 tests passed                                         |
| `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.json`                                 |    0 | typecheck lulus                                                 |
| `pnpm --filter @trainers/web build`                                                              |    0 | `tsc && vite build` lulus; warning transform Tailwind non-fatal |
| `git diff --check` + ignored-plan no-index whitespace check                                      |    0 | tidak ada whitespace error                                      |

Command di atas dijalankan pada source HEAD `8e9fdc3` selama audit 2026-08-10,
provider call count 0. Source verification itu sendiri tidak melakukan remote
mutation dan bukan pengganti evidence candidate deployment yang immutable;
remote mutation hanya terjadi kemudian pada follow-up database yang diotorisasi
dan dicatat di execution log.

## Execution update — 2026-08-10

Implementasi provider-free dari worktree terisolasi sudah dipindahkan in-place ke
branch `main` pada HEAD
`8e9fdc3621f0f812f5a655e4935b2dd736b5b27f`.

- Ditambahkan command `test:webrtc-sdp-chromium` dan probe provider-free yang
  mengimpor canonicalizer candidate secara langsung, memverifikasi blob
  worktree sama dengan HEAD, memblokir seluruh browser network, dan menyimpan
  evidence tersanitasi. Tidak ada application deployment atau aktivasi
  production WebRTC.
- Focused client 69/69, Phase 6 Telefun 142/142, API 52/52, Web 123/123,
  Telefun Gemini/legacy 168/168, Web legacy/live 70/70, core 685 tests,
  typecheck, lint, build, dan thermo review lulus.
- Canonical `test:full` sekarang exit 0: seluruh 4 root task lulus; Web 146/146
  file dan 1.262/1.262 test lulus. Flake sebelumnya berasal dari contention pada
  host 4-core/8-GB: file gagal berganti antar-run, seluruhnya lulus terisolasi,
  dan test terakhir berjalan 4,157 detik sendiri terhadap batas 5 detik.
  `maxWorkers: 1` menstabilkan suite tanpa menaikkan timeout, skip, atau
  melemahkan assertion.
- Hosted preflight membuktikan Phase 4/5 object dan service-role-only boundary.
  Setelah backup private, lima active history, satu claimed attempt, satu old
  orphan mapping, dan enam usage-audit requirement direkonsiliasi secara
  fail-close. Canonical Phase 5 rollback/reapply kemudian committed atomically.
- Verifikasi akhir menunjukkan 0 active WebRTC history, 0 nonterminal attempt,
  0 active/cleanup lease, dan 0 Phase-5-only outcome. Seluruh enam incomplete
  attempt mempunyai failed OpenAI usage audit.
- Baseline Gemini sebelum/sesudah tetap sama: 47 history non-WebRTC, empat
  active/pending, dan 854 Gemini usage row dengan timestamp terbaru identik.
- Railway staging Web/API/Telefun tidak mempunyai active/latest deployment;
  tidak ada artifact SHA parity atau real-browser staging path.
- Tidak ada deploy aplikasi, perubahan Railway/env, paid call, retry, ataupun
  provider call. Perubahan Supabase hanya reconciliation dan transactional
  Phase 5 rollback/reapply yang diotorisasi. Canonical
  cohort/authorization/budget masih belum tersedia.

Execution log lengkap tersimpan pada
`docs/rebuild-logs/phase-6-telefun-openai-webrtc-paid-smoke-connect-repair-execution.md`
di worktree utama. Status akhir tetap **Phase 6 NO-GO** untuk rollout/paid smoke,
sementara local provider-free repair gate sudah **GO**.

## Kesimpulan audit

Server start berhasil dan server kemudian menerima browser DELETE sebelum peer
connected tercatat; penyebab tepat di browser tetap unknown. Bug terminal SDP
adalah trigger paling kuat yang sudah direproduksi dan diperbaiki di current
HEAD, tetapi artifact Web pada failed call tidak dapat dibuktikan terhadap SHA
itu. Hosted Phase 5 database subgate sekarang lulus tanpa perubahan baseline
Gemini, tetapi runtime staging masih tidak aktif. Oleh karena itu status yang
jujur adalah **server boundary confirmed / exact browser cause unknown / SDP
trigger validated / source candidate fixed / hosted DB gate passed / rollout
unverified / paid smoke NO-GO**, bukan “Phase 6 selesai”. Rencana eksekusi
tersimpan di
`plan/markdown/telefun-openai-webrtc-paid-smoke-connect-repair.md`.
