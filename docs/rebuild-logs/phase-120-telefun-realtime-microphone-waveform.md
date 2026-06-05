# Phase 120: Telefun Realtime Microphone Waveform

Telefun sekarang mempertahankan indikator input suara lama dan menambahkan mini waveform real-time di bawah progress bar. Waveform memakai Web Audio API di frontend untuk visual feedback microphone yang lebih responsif, tanpa mengubah protokol Gemini Live, recording, atau backend.

## Alasan

Progress bar sebelumnya hanya mengikuti callback volume dari LiveSession. Jalur itu bercampur dengan audio processing, recording, dan WebSocket sehingga indikator bisa tampak tidak bergerak saat user berbicara. Hook UI baru membaca microphone untuk visual feedback ringan dan membersihkan resource saat inactive/unmount.

## Perubahan

- **`useMicrophoneActivity`** — Hook Web Audio API reusable: lifecycle `getUserMedia`, `AudioContext`, `AnalyserNode`, RAF loop, RMS level, dan waveform bars. Guard against missing `AudioContext`/`getUserMedia`. Cleanup semua resource pada unmount/inactive.
- **`MicrophoneActivityWaveform`** — Komponen presentasional: render vertical bars dari array level; 4 tone states (silent/normal/warning/danger); fallback quiet bars saat array kosong.
- **`PhoneInterface.tsx`** — Integrasi: `displayVolume = isMuted ? 0 : Math.max(agentVolume, micActivity.level)` sebagai sumber utama progress bar; waveform di-render di bawah progress bar.

## Verifikasi

- `pnpm --filter @trainers/web test src/__tests__/telefun-microphone-activity.test.tsx` — 12 tests PASS.
- `pnpm --filter @trainers/web test src/__tests__/telefun-maintenance.test.tsx` — 6 tests PASS.
- `pnpm --filter @trainers/web lint` — exit 0, 0 errors, 178 existing warnings.
- `pnpm -F @trainers/web exec tsc --noEmit` — 0 TypeScript errors.
