# Telefun AI Playback Overlap Fix

## Problem

Live call Telefun mengalami audible overlap ketika AI Gemini mulai berbicara (modelTurn baru) sebelum audio dari giliran sebelumnya selesai diputar. Juga, hold dan interruption tidak membersihkan antrian playback yang belum selesai.

### Root Cause

`LiveSession.playPcm()` memanggil `source.start(startTime)` pada `AudioBufferSourceNode` tanpa menyimpan referensi source tersebut. Akibatnya:

1. **Interruption**: `cancelAiPlayback()` hanya mereset `nextStartTime` dan mengirim pesan `clientContent.interrupted` (yang tidak didukung proxy), tanpa menghentikan source yang sudah dijadwalkan.
2. **Overlap modelTurn baru**: Audio dari giliran sebelumnya tetap diputar meskipun giliran baru sudah mulai — `nextStartTime` digunakan untuk menjadwalkan setelah antrian lama, bukan untuk membersihkannya.
3. **Hold**: `setHold(true)` tidak menghentikan source yang sudah aktif, sehingga audio bocor selama hold.
4. **Server interrupted**: `serverContent.interrupted` hanya mencatat timeline event tanpa membersihkan playback.

### Protocol Reference

Gemini Live docs mensyaratkan realtime playback harus dihentikan dan antrian audio dibersihkan saat `serverContent.interrupted` diterima.

## Changes

### 1. Source Tracking

`apps/web/src/routes/telefun/services/geminiService.ts`
- Menambahkan `activeSources: Set<AudioBufferSourceNode>` — melacak semua source yang sedang aktif/terjadwal.
- Menambahkan `pendingTurnCompletion: boolean` — flag untuk menunda `isAiSpeaking(false)` sampai antrian selesai.

### 2. New Methods

| Method | Fungsi |
|--------|--------|
| `stopActiveSources()` | Menghentikan dan melepas semua source di `activeSources`, mereset `nextStartTime` dan `pendingTurnCompletion`. Tidak menyentuh `isAiSpeaking`. |
| `clearAiPlayback(reason)` | Memanggil `stopActiveSources()` + `setIsAiSpeaking(false)`. |

### 3. `playPcm()` Source Lifecycle

Source yang baru dibuat ditambahkan ke `activeSources`. Handler `onended` dipasang untuk:
1. Menghapus source dari `activeSources` saat selesai natural.
2. Jika `activeSources.size === 0 && pendingTurnCompletion`, mengakhiri `isAiSpeaking(false)`.

### 4. `handleJsonMessage()` Reorder

| Skenario | Perubahan |
|----------|-----------|
| `modelTurn.parts` | Diproses sebelum audio chunks. Bersihkan playback lama hanya jika `pendingTurnCompletion === true`; chunk lanjutan dari turn yang sama tetap diantrikan normal. |
| `turnComplete` | Set `pendingTurnCompletion = true`; jika `activeSources.size === 0`, segera akhiri; jika masih ada source, tunggu `onended`. |
| `interrupted` | Panggil `clearAiPlayback("server_interrupted")` + emit timeline event. |

### 5. `cancelAiPlayback()`

Delegasi ke `clearAiPlayback("interruption_guard")`. Hapus pengiriman WebSocket `{ clientContent: { turns: [], interrupted: true } }` — tidak didukung server.

### 6. `setHold(true)`

Panggil `clearAiPlayback("hold_activated")` untuk menghentikan playback saat hold diaktifkan.

### 7. `cleanupAudio()`

Panggil `clearAiPlayback("cleanup")` sebelum membersihkan node audio lainnya.

## Regression Tests

File: `apps/web/src/__tests__/telefun-live-session-playback.test.ts`

| Test | Hasil |
|------|-------|
| `cancelAiPlayback` stops already scheduled PCM sources | PASS |
| `serverContent.interrupted` clears queued playback and marks AI as not speaking | PASS |
| `turnComplete` does not end local `isAiSpeaking` until queued audio sources finish | PASS |
| same-turn audio chunks are not stopped before `turnComplete` | PASS |
| `clearAiPlayback` resets pending completion with no active source | PASS |
| `setHold(true)` clears active/queued AI playback so hold does not leak old audio | PASS |

## Verification

- Playback tests: 6/6 PASS
- Related Telefun tests including playback, live-protocol, drain, hold, and audio-worklet: 34/34 PASS
- Web lint: 0 errors, 194 existing warnings
- Web build: OK
