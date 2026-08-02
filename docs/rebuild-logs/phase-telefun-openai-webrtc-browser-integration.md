# Phase Telefun OpenAI WebRTC — Browser Integration Repair

## Scope

Phase 3 repair untuk jalur POC OpenAI WebRTC. Gemini Live dan OpenAI WebSocket legacy tetap unchanged. Provider calls pada verifikasi memakai fake boundaries saja; tidak ada paid/provider smoke.

## Lifecycle contract

- `PhoneInterface` constructs and assigns the selected transport and lifecycle callbacks synchronously before ringtone; it does not call `connect()` or start media/provider work until ringtone ends.
- End or unmount during ringtone uses that transport's existing idempotent, session-bound failed cleanup path exactly once; constructor failure retains direct authenticated cleanup because no transport exists.
- Browser selalu mengirim authenticated, session-bound `DELETE ?outcome=failed` untuk kegagalan sebelum provider POST maupun setelah provider failure.
- Cleanup DELETE tetap diizinkan untuk session POC milik user saat rollout start flag menjadi false; POST tetap ditolak.
- DELETE gagal tanpa manager binding mengubah pre-created owned session menjadi `failed` tanpa provider work dan idempotent pada retry.
- End normal setelah connected menjadi `completed`; end sebelum connected menjadi `failed`.
- Sideband `error` adalah lifecycle-authoritative, mengirim sinyal error yang hanya memuat bounded code, menutup provider, dan menjalankan finalizer failed sekali. `response.done` berstatus incomplete/cancelled/failed tetap merupakan status response, bukan session failure.
- Browser menampilkan copy tetap: `Terjadi kesalahan pada layanan suara. Silakan coba lagi.`

## Call-manager idempotency repair

- Durable conditional active-row transition/reconciliation remains the idempotency authority for terminal session persistence.
- The process-lifetime `finalizedSessions` map is not used; only active bindings and bounded in-flight no-binding Promise dedupe remain in memory.
- Duplicate cleanup after a settled finalization is safe because it reconciles against the durable terminal row rather than a process-local memory marker.

## Rollout and deployment contract

`TELEFUN_OPENAI_WEBRTC_ALLOWED_USER_IDS` adalah CSV UUID exact, harus sama pada API dan Telefun, hanya development/staging, dan kosong berarti deny-all. `TELEFUN_OPENAI_WEBRTC_POC_ENABLED=false` mematikan POST/provider start; authenticated owner-bound cleanup DELETE adalah exception. Routine CI/deployment tidak melakukan paid smoke.

## Verification

Command dan exit code final dicatat pada repair report `.pi/orchestrator/20260729-192208-telefun-p3/thermo-repair.md`.
