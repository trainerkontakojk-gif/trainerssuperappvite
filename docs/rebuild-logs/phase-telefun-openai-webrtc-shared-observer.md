# Phase — Telefun OpenAI WebRTC Shared Observer

> **Historical Phase 2 record — superseded by Phase 3 integration.** The isolation and "no UI cutover" statements below describe the Phase 2 state at that time. Phase 3 now routes the WebRTC transport through `PhoneInterface` behind capability/flag/allowlist gates; the default remains off, non-production, and no paid/manual smoke is implied.

## Scope

Dokumen ini mencatat sinkronisasi canonical docs untuk Phase 2 Telefun OpenAI Realtime WebRTC yang sudah selesai. Fokusnya adalah extraction internal shared OpenAI-only event observer, WS-only tool coordinator, sideband observation-only boundary, bounded diagnostics/frame cap, dan tidak ada perubahan default transport, route, atau UI cutover **pada Phase 2**.

## Architecture

- `apps/telefun/src/providers/openai-realtime-event-observer.ts` menjadi sumber kebenaran event OpenAI-only untuk jalur OpenAI Realtime WebSocket dan WebRTC sideband.
- `apps/telefun/src/providers/openai-realtime-tool-coordinator.ts` tetap menjaga eksekusi tool di jalur WebSocket; sideband hanya observasi/control server-side.
- `apps/telefun/src/realtime-webrtc/sideband-client.ts` membatasi frame dengan `SIDEBAND_MAX_FRAME_BYTES` dan menolak payload terlalu besar sebelum parsing.
- `apps/telefun/src/realtime-webrtc/sideband-event-observer.ts` adalah observer sideband-only untuk transcript, usage, status, dan diagnostic bounded; tidak menjalankan tool.
- Pada Phase 2, browser harness `apps/web/src/routes/telefun/services/openaiWebRtc/` tetap terisolasi; Gemini baseline, `LiveSession`, dan route selection tidak berubah. Status ini kemudian superseded oleh Phase 3 capability-gated `PhoneInterface` integration; Gemini/legacy WS baseline tetap unchanged.

## Files

### Canonical docs yang disinkronkan

- `docs/telefun.md`
- `docs/architecture.md`
- `docs/adr/telefun-openai-webrtc-poc.md`
- `docs/README.md`
- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-docs-sync.md`

### Evidence sources yang dibaca

- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-final-thermo-4.md`
- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-final-thermo-3.md`
- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-final-thermo-2.md`
- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-capacity-repair.md`
- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-cancel-repair.md`
- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-repair.md`
- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-implementation.md`
- `.pi/orchestrator/20260729-121323-telefun-p2/phase2-thermo-review.md`

## TDD / Quality Evidence

- Final Thermo 4: **PASS**.
- Telefun focused verification: **192 tests** passed.
- Broker/DB verification: **38 tests** passed.
- Web verification: **74 tests** passed.
- API verification: **30 tests** passed.
- `pnpm test:core`: passed.
- Telefun/Web/API typechecks: passed.
- Telefun/Web/API builds: passed.
- Root `pnpm lint` gagal hanya karena error API yang sudah ada sebelumnya dan tidak terkait Phase 2.
- Full Web test run punya 6 failure yang sudah ada sebelumnya dan tidak terkait Phase 2.
- Tidak ada paid/manual OpenAI call, deployment, migration, commit, atau push.

## Limitations

- Tidak ada produksi rollout atau UI cutover yang diklaim.
- Tidak ada recording, hold, barge-in, atau fallback parity claim baru.
- Tidak ada smoke OpenAI berbayar/manual.
- Wiki tidak diupdate karena tidak ada public contract change.
