# Phase 121 — Telefun Prompt-First Runtime Cleanup

## Scope

- Menghapus toggle Mode Simulasi Realistis dan menggantinya dengan `simulationChallengeTypes` opsional, maksimal tiga.
- Menjadikan tujuh tantangan percakapan sebagai registry prompt-first.
- Menghapus interupsi lokal berbasis VAD dan long-speech prompt; mempertahankan hold, recording, timeout, watchdog, queue, dan metrik deterministik.
- Menghapus orchestrator/engine realistic-mode dan memindahkan tipe review aktif ke `reviewTypes.ts`.
- Menjaga metadata database legacy dan pembukaan riwayat lama.

## Verification

- Focused web tests: 77 passing.
- Focused API tests: 20 passing.
- Web/API TypeScript checks passing.
- Impeccable hook finding side-stripe pada panel settings diperbaiki dengan border surface standar.

## Compatibility

Parser settings masih membaca `realisticModeDisruptionTypes` sebagai fallback in-memory. Save frontend/API hanya mempertahankan key `simulationChallengeTypes`; kolom history legacy tidak dihapus dan tidak membutuhkan migration.
