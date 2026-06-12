# P1.4 KETIK/PDKT Critical Service Test Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development`; prioritaskan behavior/risk, bukan mengejar jumlah test.

## Goal

Menutup jalur kritis KETIK/PDKT yang saat ini hanya diuji melalui helper sempit, facade, atau route mock agar refactor service dapat mendeteksi regression behavior.

## Requirements

- Test langsung `generateConsumerResponse()`, bukan hanya `sanitizeConsumerText()`.
- Test langsung public functions penting di `pdkt/mailbox-service.ts` dan `pdkt/session-service.ts`.
- Provider routing, prompt/timing, retry, error mapping, usage context, idempotency, dan malformed AI output tercakup.
- Route tests yang ada tetap dipertahankan; jangan menduplikasi assertion yang sama tanpa nilai baru.
- Coverage target ditentukan per branch kritis, bukan angka minimal test per file.
- Test deterministic: AI, clock, random, dan network di-inject/mock secara eksplisit.

## Design

- Tambahkan dedicated test file per service agar ownership dan failure location jelas.
- Buat dependency injection ringan hanya bila diperlukan untuk mock provider/clock/random tanpa module-mock leakage.
- Gunakan table-driven tests untuk variasi provider, timing cues, role, dan malformed payload.
- Pertahankan Supabase RPC integration sebagai scope terpisah P1.7; plan ini fokus unit/service orchestration.

## Tasklist

- [ ] Petakan branch dan side effect `apps/api/src/services/ketik/consumer-response.ts`.
- [ ] Buat `ketik-consumer-response-service.test.ts` untuk Gemini/OpenRouter routing, timing context, strict script mode, no-response behavior, malformed provider response, provider failure, dan AI usage context.
- [ ] Pertahankan sanitizer tests yang ada sebagai pure helper coverage.
- [ ] Petakan public functions dan branch `apps/api/src/services/pdkt/mailbox-service.ts`.
- [ ] Buat direct service tests untuk `submitMailboxReply()`: exact RPC payload, null/error response, human-friendly error, dan return history id.
- [ ] Tambahkan direct tests untuk fetch/create/delete/bulk yang belum memiliki error/empty/permission branch.
- [ ] Petakan generation/retry/parser branch `apps/api/src/services/pdkt/session-service.ts`.
- [ ] Buat `pdkt-session-service.test.ts` untuk first-attempt success, validation-triggered retry, retry failure fallback, malformed JSON, model/provider selection, identity/template rendering, dan usage context.
- [ ] Hapus hanya assertion duplikat yang terbukti tidak menambah coverage; jangan mengurangi route contract coverage.
- [ ] Stabilkan module mocks dengan `vi.resetModules`/dependency injection agar suite gabungan tidak bocor antar-file.
- [ ] Tambahkan coverage report scoped ke tiga service dan dokumentasikan uncovered critical branches.
- [ ] Verifikasi suite per file dan gabungan minimal dua kali, lalu API typecheck, lint, dan `git diff --check`.

## Risk Assessment

- **Medium:** test terlalu terikat ke prompt literal sehingga refactor copy memicu noise.
- **Medium:** module mock leakage menyebabkan timeout/flaky saat suite gabungan.
- **Low:** mengejar coverage percentage mendorong assertion tanpa nilai behavior.
- **Mitigasi:** assert invariant/contract, dependency injection, combined-suite rerun, dan branch-risk checklist.

## Rollback Plan

- Revert test/helper injection per service secara independen.
- Jangan menghapus existing regression tests saat rollback.
- Tidak ada schema atau runtime data yang berubah dalam plan ini.
