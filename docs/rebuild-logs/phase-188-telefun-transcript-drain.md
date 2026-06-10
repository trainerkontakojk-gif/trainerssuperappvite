# Phase 188: Telefun Transcript Ordering & Graceful Shutdown

> **Goal:** Fix 2 critical bugs — transcript ordering kacau karena arrival order ≠ conversation order, dan ucapan terakhir hilang saat panggilan ditutup tanpa drain.

## Bug #1: Transcript Ordering

**Root Cause:** `TranscriptCollector` memakai single buffer `ActiveUtterance` global. Gemini API mengirim `inputTranscription` (agent) dan `outputTranscription` (consumer) secara independen — arrival order **tidak dijamin** = urutan percakapan.

**Fix:** Ganti ke **per-speaker lanes** dalam logical turn:

| Before | After |
|--------|-------|
| Single `ActiveUtterance` | `TranscriptLane` per speaker (agent + consumer) |
| Flush on speaker switch | Commit per `completeTurn` / `flush` |
| Arrival order = dialog order | Agent → consumer per logical turn |

## Bug #2: Graceful Shutdown

**Root Cause:** Client langsung `ws.close()` tanpa mengirim `audioStreamEnd` atau menunggu transcription terakhir.

**Fix:** Drain handshake protocol:

```
Client: stop audio → audioStreamEnd → session_end_request
Server: drain → wait turnComplete / quiet window → save → session_end_complete → close
```

## Files Changed

### Task 1: TranscriptCollector Refactor
| File | Change |
|------|--------|
| `apps/telefun/src/transcript.ts` | Ganti single buffer dengan per-speaker lanes + logical turn; `snapshot()` clamp timestamp monotonik |
| `apps/telefun/src/transcript.test.ts` | +5 regression test (output-before-input, lane independen, timestamp monoton, barge-in, clamp timestamp) |

### Task 2: Drain State Machine
| File | Change |
|------|--------|
| `apps/telefun/src/session-drain.ts` | **NEW** — `DrainCoordinator` class (open → draining → finalized); quiet timer hanya aktif setelah Gemini boundary (`boundaryOutcome`), +`notifyInterrupted()`, +`notifyUpstreamClosed()` |
| `apps/telefun/src/session-drain.test.ts` | **NEW** — 12 test cases (state transitions, boundary-driven quiet window, interruption, timers, idempotency) |
| `apps/telefun/src/server-protocol.ts` | +`parseControlMessage`, `SessionEndRequest`, `SessionEndComplete`, type guards |
| `apps/telefun/src/server-protocol.test.ts` | +8 test cases untuk control message parsing |

### Task 3: Server Integration
| File | Change |
|------|--------|
| `apps/telefun/src/server.ts` | +`finalizeSessionOnce` (idempotent, guard `finalized` flag), +`DrainCoordinator` integration via `notifyActivity`/`notifyTurnComplete`, control message interception |

### Task 4: Client Drain
| File | Change |
|------|--------|
| `apps/web/src/routes/telefun/services/liveSessionDrain.ts` | **NEW** — `LiveSessionDrain` class (timeout-based drain promise) |
| `apps/web/src/routes/telefun/services/liveProtocol.ts` | +`buildSessionEndRequest()`, +`SessionEndReason`/`SessionEndOutcome` types, +`isSessionEndCompleteMessage` type guard |
| `apps/web/src/routes/telefun/services/geminiService.ts` | `disconnect()` async: audioStreamEnd → end_request → wait drain → close ws → cleanup |
| `apps/web/src/routes/telefun/components/PhoneInterface.tsx` | `handleEndCall` async, cleanup pakai IIFE |
| `apps/web/src/__tests__/telefun-live-session-drain.test.ts` | **NEW** — 3 integration test (drain handshake, timeout, duplicate disconnect) |
| `apps/web/src/__tests__/telefun-live-protocol.test.ts` | +test drain message builders & type guard |

## Verification
- `pnpm --filter @trainers/telefun test` → **59/59 passed** (5 files)
- `pnpm --filter @trainers/telefun build` → **OK**
- `pnpm --filter @trainers/web test` → **677/677 passed** (89 files)
- `pnpm --filter @trainers/web build` → **OK**
- `pnpm lint` → **OK** (4 tasks)

## Design Decisions

1. **Timestamp:** Tanpa audio timestamp dari Gemini, plan hanya menjamin urutan logical turn dan `startMs` monoton, bukan timing akustik per kata.
2. **Quiet window:** `QUIET_WINDOW_MS=2s` setelah `turnComplete` untuk menangkap transcription terlambat.
3. **Hard timeout:** `HARD_TIMEOUT_MS=10s` mencegah drain menggantung.
4. **Idempotent finalizer:** Guard `finalized` flag mencegah duplicate save dari race condition drain callback vs close handler.

## Rollback
- Hapus handshake control message dan coordinator drain.
- Kembalikan client ke direct close.
- Pertahankan regression tests transcript.

## Post-Release Bug Fix: Interrupted Turn Boundary

**Bug:** `serverContent.interrupted` (Gemini barge-in) tidak di-wire — transkrip fragment bisa tercampur antar turn dan drain coordinator tidak mendeteksi interrupt.

**Root Cause:** Di Task 3 (Server Integration), `DrainCoordinator.notifyInterrupted()` sudah ada di `session-drain.ts` tapi tidak dipanggil di `server.ts`. Juga tidak ada method `interruptTurn()` di `TranscriptCollector`.

**Fix (commit aaa6768 follow-up):**
| File | Change |
|------|--------|
| `apps/telefun/src/transcript.ts` | Tambah method `interruptTurn()` — commit pending lanes saat interrupt |
| `apps/telefun/src/server.ts` | Wiring `parsed.serverContent?.interrupted` → `transcriptCollector.interruptTurn()` + `turnManager.endAiSpeaking()` + `drainCoordinator.notifyInterrupted()` |
| `apps/telefun/src/transcript.test.ts` | + regression test `"keeps post-interruption fragments in a new logical turn"` |
| `apps/telefun/src/server-silence-detector.test.ts` | + contract test `"treats Gemini interruption as transcript and drain boundaries"` |

**Verifikasi:** `pnpm --filter @trainers/telefun test` → **61/61 passed** (5 files, +0/-0 regression)
