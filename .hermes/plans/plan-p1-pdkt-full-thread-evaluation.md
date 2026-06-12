# P1.5 PDKT Full-Thread Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and verify current AI provider limits before implementation.

## Goal

Membuat evaluasi PDKT memahami urutan percakapan email lengkap, bukan hanya email inbound pertama dan balasan agent terakhir.

## Requirements

- Prompt mempertahankan chronological order, sender role, subject, dan body setiap email relevan.
- Balasan agent terakhir tetap menjadi jawaban utama yang dinilai.
- Email tengah menjadi konteks, bukan dinilai sebagai jawaban akhir.
- Thread besar dibatasi secara deterministik berdasarkan budget karakter/token.
- Tidak memasukkan metadata sensitif yang tidak dibutuhkan.
- Existing retry, usage logging, JSON parser, dan evaluation claim lifecycle tetap berjalan.

## Design

- Tambahkan pure formatter `buildPdktEvaluationThreadContext(emails, limits)`.
- Selalu sertakan inbound pertama, balasan agent terakhir, dan sebanyak mungkin pesan terbaru di antaranya.
- Tandai role `KONSUMEN`/`AGENT`, urutan, waktu, dan subject secara eksplisit.
- Ubah `buildPdktEvaluationPrompt` agar menerima `threadContext` dan `finalAgentReply`.
- Catat metadata jumlah pesan included/omitted di usage context atau log aplikasi, tanpa menyimpan body ke log.

## Tasklist

- [ ] Tambahkan tests untuk thread 2 pesan, multi-turn, consecutive inbound, consecutive agent reply, empty body, dan out-of-order timestamp.
- [ ] Tambahkan tests truncation: first inbound dan final reply tidak boleh hilang.
- [ ] Implement pure thread formatter di `apps/api/src/services/pdkt/evaluation-service.ts` atau file helper terpisah jika file melewati batas maintainability.
- [ ] Ubah prompt builder agar menyertakan full bounded context dan instruksi bahwa final agent reply adalah target penilaian.
- [ ] Ubah `evaluateAgentResponse()` untuk memakai formatter, bukan `firstInbound.body` saja.
- [ ] Tambahkan regression test yang membuktikan fakta penting pada email tengah muncul di prompt.
- [ ] Tambahkan regression test yang membuktikan model diminta menandai kontradiksi final reply terhadap konteks tengah.
- [ ] Pertahankan retry transient dan response JSON contract saat refactor.
- [ ] Update dokumentasi PDKT evaluation behavior.
- [ ] Verifikasi targeted PDKT tests, API typecheck, lint, dan `git diff --check`.

## Risk Assessment

- **High:** thread panjang meningkatkan token/cost dan latency.
- **Medium:** truncation yang buruk menghilangkan konteks penting.
- **Medium:** prompt terlalu panjang menurunkan fokus penilaian.
- **Mitigasi:** deterministic budget, pinned first/final messages, tests urutan/truncation, dan logging count tanpa body.

## Rollback Plan

- Kembalikan prompt ke first-inbound/final-reply adapter tanpa mengubah persisted evaluation schema.
- Formatter baru dapat dihapus tanpa migration database.
- Existing evaluations tidak perlu dimigrasikan; retry manual dapat menghasilkan evaluasi baru.
