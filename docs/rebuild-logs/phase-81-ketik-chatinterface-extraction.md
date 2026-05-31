# Rebuild Log - Phase 81: KETIK ChatInterface Message Utils & Pacing Extraction

## Deskripsi

Mengekstrak inline constants, helpers, dan fungsi pacing dari komponen monolitik `ChatInterface.tsx` (277 baris berkurang menjadi 16 baris) ke modul terpisah di `apps/web/src/routes/ketik/lib/`.

## Detail Perubahan

### Ekstraksi ke `ketik/lib/message-utils.ts` (193 lines)

Fungsi dan konstanta yang diekstrak:
- `IMAGE_TAG_PATTERN`, `IMAGE_TAG_PATTERN_GLOBAL`, `SYSTEM_TAG_PATTERN`, `SYSTEM_TAG_PATTERN_GLOBAL`
- `STRICT_INSTRUCTIONAL_CUES`, `ACTION_VERB_CUES`
- `hasStructuralSteps()`, `countCuesWithBoundary()`, `allowSolutionAcknowledgement()`
- `stripSystemTags()`, `hasImageTag()`, `isImageOnlyText()`, `stripNarrationFromImagePart()`
- `normalizeGeneratedParts()`, `normalizeMessagesForDisplay()`

### Ekstraksi ke `ketik/lib/pacing.ts` (69 lines)

Fungsi dan konstanta yang diekstrak:
- `SessionPhase` type
- `classifyTextBand()`, `isAgentGivingSolution()`, `isSlowEligible()`
- `REALISTIC_RANGES`, `TRAINING_FAST_RANGES`
- `boundedRandom()`

### File Terpengaruh

- **[MODIFY]** `ChatInterface.tsx` — 277 → 16 baris (import + JSX rendering only)
- **[NEW]** `ketik/lib/message-utils.ts`
- **[NEW]** `ketik/lib/pacing.ts`

## Pengujian & Verifikasi

- Tidak ada perubahan logika — murni ekstraksi ke file terpisah
- Semua fungsi dan konstanta di-import kembali di `ChatInterface.tsx` dari modul baru
- Graphify auto-sync
