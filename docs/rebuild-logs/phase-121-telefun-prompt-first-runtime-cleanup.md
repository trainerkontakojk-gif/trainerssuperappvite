# Phase 121 — Telefun Prompt-First Runtime Cleanup

## Scope

- Menghapus toggle Mode Simulasi Realistis dan menggantinya dengan `simulationChallengeTypes` opsional, maksimal tiga.
- Menjadikan tujuh tantangan percakapan sebagai registry prompt-first.
- Menghapus interupsi lokal berbasis VAD dan long-speech prompt; mempertahankan hold, recording, timeout, watchdog, queue, dan metrik deterministik.
- Menghapus orchestrator/engine realistic-mode dan memindahkan tipe review aktif ke `reviewTypes.ts`.
- Menjaga metadata database legacy dan pembukaan riwayat lama.

## Verification

- Focused web tests: 93 passing.
- Focused API tests: 21 passing.
- Web/API TypeScript checks passing.
- `pnpm lint`, `pnpm build`, dan `pnpm test:core` passing; lint hanya melaporkan warning existing.
- Impeccable hook finding side-stripe dan decorative blur pada panel settings diperbaiki dengan border surface standar.

## Post-execution audit fixes

- Challenge `interruption` sekarang benar-benar opt-in; tanpa pilihan tersebut prompt melarang AI menyela agen.
- Coaching summary dan replay annotations baru di-fetch ketika tab Anotasi Replay dibuka.
- Boundary API menolak challenge ID di luar tujuh ID resmi dan tetap membatasi maksimal tiga.
- Sisa helper, timeline event, review load helper, dan realistic-mode metrics type yang tidak punya runtime consumer dihapus.

## Compatibility

Parser settings masih membaca `realisticModeDisruptionTypes` sebagai fallback in-memory. Save frontend/API hanya mempertahankan key `simulationChallengeTypes`; kolom history legacy tidak dihapus dan tidak membutuhkan migration.
