# Phase 190 Telefun Speaker & Timestamp Transcript

## Goal

Mengubah transcript Telefun dari satu paragraf AI-generated menjadi daftar percakapan bertimestamp dan berlabel pembicara dari Gemini Live transcription event.

## Architecture

```
Gemini Live transcription event (inputTranscription / outputTranscription)
               |
               v
        TranscriptCollector
               |
               v
   TelefunTranscriptEntry[]
               |
               v
  telefun_history.messages (JSONB)
         |             |
         v             v
  Telefun Review   Monitoring Review
         \             /
          v           v
       TelefunTranscript (shared UI component)
```

### Code-Judo

Transcript dipindahkan secara konseptual dari voice assessment domain ke session domain. Keputusan ini menghapus kebutuhan untuk:
- menebak speaker dari isi teks AI assessment
- parsing paragraf berdasarkan tanda baca
- formatter transcript terpisah pada dua halaman
- menjadikan output AI assessment sebagai sumber percakapan

### Source of Truth

| Sumber | Prioritas | Digunakan untuk |
| --- | --- | --- |
| `telefun_history.messages` (structured `TelefunTranscriptEntry[]`) | Tertinggi | Sesi baru |
| `voice_assessment.transcript` (string legacy) | Fallback | Sesi lama |
| Empty state | Default | Saat keduanya kosong |

### Speaker Mapping

| Transcription source | Canonical role | UI label |
| --- | --- | --- |
| `serverContent.inputTranscription` | `agent` | `User/Agent` |
| `serverContent.outputTranscription` | `consumer` | `Konsumen` |

## Changes

### New Files

- `packages/types/src/telefun-transcript.ts` - Canonical Zod schema, types, and parser
- `apps/telefun/src/transcript.ts` - `TranscriptCollector` class (pure stateful unit)
- `apps/telefun/src/transcript.test.ts` - 11 collector unit tests
- `apps/web/src/routes/telefun/components/TelefunTranscript.tsx` - Shared UI component
- `apps/web/src/routes/telefun/components/telefunTranscriptFormatters.ts` - Pure timestamp and speaker label formatters
- `apps/web/src/__tests__/telefun-transcript.test.tsx` - 10 formatter/component tests
- `apps/api/src/__tests__/telefun-monitoring-review-transcript.test.ts` - Monitoring detail endpoint transcript contract
- `apps/api/src/__tests__/telefun-session-transcript-route.test.ts` - PATCH route accepts canonical entries and rejects malformed roles

### Modified Files

- `packages/types/src/telefun.ts` - `messages` type changed to `TelefunTranscriptEntry[] | null`, added `export * from "./telefun-transcript"`
- `apps/telefun/package.json` - Added `@trainers/types` dependency
- `apps/telefun/src/server-protocol.ts` - Added `extractGeminiTranscriptionChunks()` extractor
- `apps/telefun/src/server-protocol.test.ts` - 6 contract tests for extraction
- `apps/telefun/src/server.ts` - Replaced `transcriptMessages` array with `TranscriptCollector`, removed `UtteranceBuffer`, integrated extractor
- `apps/telefun/src/db.ts` - Typed `messages` parameter as `TelefunTranscriptEntry[]`
- `apps/telefun/src/server-silence-detector.test.ts` - Added UtteranceBuffer guard
- `apps/telefun/src/silence.ts` - **Deleted** (dead code - UtteranceBuffer was unused)
- `apps/web/src/routes/telefun/services/liveProtocol.ts` - Added `outputAudioTranscription: {}`
- `apps/web/src/routes/telefun/types.ts` - Added `transcript?: TelefunTranscriptEntry[]`
- `apps/web/src/routes/telefun/telefunApi.ts` - Added `messages` field, parse via `parseTelefunTranscript`
- `apps/web/src/routes/telefun/components/VoiceAssessmentSection.tsx` - Uses shared `TelefunTranscript` with `transcript` prop
- `apps/web/src/routes/telefun/components/ReviewModal.tsx` - Passes `record.transcript`
- `apps/web/src/routes/monitoring/components/TelefunReviewPanel.tsx` - Uses shared `TelefunTranscript` with API `transcript` field
- `apps/api/src/routes/telefun/sessions.ts` - PATCH validator uses `telefunTranscriptSchema`
- `apps/api/src/routes/ai.ts` - Selects `messages`, returns `transcript` field
- `apps/api/src/__tests__/telefun-routes.test.ts` - Added 5 transcript validation tests
- `apps/web/src/__tests__/telefun-api-adapter.test.ts` - Added 3 transcript mapping tests
- `apps/web/src/__tests__/telefun-live-protocol.test.ts` - Added `outputAudioTranscription` assertion

### Deleted Files

- `apps/telefun/src/silence.ts` - Dead `UtteranceBuffer` class (no callbacks ever registered)

## Verification

### Test Results

| Workspace | Tests | Status |
| --- | --- | --- |
| `@trainers/telefun` | 33 passed (4 files) | PASS |
| `@trainers/api` transcript + monitoring focused | 22 passed (4 files) | PASS |
| `@trainers/web` transcript + adapter + protocol | 38 passed (3 files) | PASS |
| Root `test:core` | 199 passed across API, Telefun, and Web core suites | PASS |
| Workspace builds | Telefun, API, and Web | PASS |
| Root lint | 0 errors; existing warnings remain | PASS |

### Gemini Live Contract Verification

Setup field `inputAudioTranscription: {}` sudah ada. `outputAudioTranscription: {}` ditambahkan. Event shape diverifikasi:
- `serverContent.inputTranscription.text` → agent speaker
- `serverContent.outputTranscription.text` → consumer speaker

Audit pasca-eksekusi merujuk dokumentasi resmi Google Live API:

- transcription dikirim independen dari server message lain dan ordering terhadap message lain tidak dijamin;
- output transcription bersifat streaming dan dapat datang sebagai fragmen kecil;
- `turnComplete` adalah batas giliran model, bukan flag final milik setiap input/output chunk.

Referensi:

- https://ai.google.dev/api/live
- https://ai.google.dev/gemini-api/docs/live-guide
- https://googleapis.github.io/js-genai/release_docs/interfaces/types.LiveServerContent.html

Perbaikan audit:

- hapus ingestion `clientContent` agar system/time-cue/interruption prompt tidak bocor sebagai ucapan agen;
- pertahankan whitespace fragment dan concatenate stream tanpa menyisipkan spasi buatan;
- dukung cumulative partial yang memperluas teks sebelumnya;
- pisahkan `turnComplete` dari transcript chunk dan gunakan hanya untuk flush giliran konsumen;
- tambah endpoint-level Monitoring regression test;
- tampilkan shared transcript empty state di Monitoring;
- rapikan wrapping transcript untuk viewport sempit.

## Backward Compatibility

- Sesi lama tanpa `messages` field: `parseTelefunTranscript()` returns `[]`, fallback ke `voice_assessment.transcript`
- Sesi lama dengan `messages` malformed: parser strips invalid entries via `safeParse`
- API tetap mengembalikan `voice_assessment` untuk assessment metrics
- Monitoring review endpoint baru mengembalikan `transcript` array, fallback aman
- Tidak ada migration database; kolom `messages JSONB` sudah ada
