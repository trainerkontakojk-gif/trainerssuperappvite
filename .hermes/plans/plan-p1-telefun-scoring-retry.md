# P1.6 Telefun Durable Scoring Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and `superpowers:verification-before-completion`.

## Goal

Menjamin kegagalan sementara saat voice assessment Telefun diproses ulang secara durable tanpa meminta user menekan tombol analisis manual.

## Requirements

- Kegagalan AI/storage/network yang transient dijadwalkan ulang.
- Error permanen seperti recording tidak ada tidak di-retry tanpa batas.
- Retry idempotent dan tidak menyebabkan double billing.
- Backoff, maximum attempts, next-attempt time, dan last error tersimpan di database.
- Manual retry tetap tersedia dan memakai claim/idempotency yang sama.
- UI membedakan `queued`, `processing`, `failed`, dan `completed`.

## Design

- Gunakan lifecycle scoring P1.1 sebagai prerequisite.
- Tambahkan job table ringan atau status fields yang dapat dipoll worker backend; jangan memakai in-memory timer sebagai durability boundary.
- Worker mengklaim job dengan RPC atomik/service role, menjalankan `analyzeVoiceQuality`, lalu complete/reschedule/dead-letter.
- Klasifikasikan error menjadi transient dan permanent.
- Endpoint score menjadi enqueue/claim-aware dan mengembalikan status konsisten.

## Tasklist

- [ ] Tetapkan prerequisite schema/idempotency dari plan P1.1.
- [ ] Tambahkan tests klasifikasi error transient/permanent dan exponential backoff.
- [ ] Buat migration job/status dengan index `next_attempt_at` dan service-role-only access.
- [ ] Buat atomic claim RPC dengan lease timeout untuk recovery worker crash.
- [ ] Extract scoring orchestration dari route ke service yang dapat dipanggil route dan worker.
- [ ] Implement worker/cron entrypoint dengan batch limit dan observability terstruktur.
- [ ] Enqueue otomatis setelah agent recording path berhasil dipersist.
- [ ] Mark completed bila assessment cached valid; jangan panggil AI lagi.
- [ ] Reschedule transient failures sampai max attempts; permanent/exhausted menjadi failed.
- [ ] Update `VoiceAssessmentSection` agar menampilkan status dan manual retry yang benar.
- [ ] Tambahkan integration tests worker claim, retry, stale lease, duplicate enqueue, dan cached completion.
- [ ] Tambahkan operational docs: schedule, env, monitoring query, dan recovery procedure.
- [ ] Verifikasi migration, targeted Telefun tests, worker smoke test, typecheck, lint, dan build.

## Risk Assessment

- **High:** worker paralel dapat double-call AI bila lease/claim salah.
- **High:** job queue tanpa scheduler production membuat sesi tetap queued.
- **Medium:** retry error permanen membuang token/cost.
- **Mitigasi:** atomic claim, cached assessment check, error classification, bounded attempts, dan dashboard monitoring.

## Rollback Plan

- Hentikan scheduler/worker lebih dulu.
- Kembalikan endpoint ke synchronous/manual scoring.
- Pertahankan assessment yang sudah completed.
- Hapus job/RPC/kolom hanya setelah queued/processing jobs diaudit dan tidak diperlukan.
