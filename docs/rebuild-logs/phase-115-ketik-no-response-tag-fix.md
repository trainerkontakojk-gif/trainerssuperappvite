# Phase 115: KETIK [NO_RESPONSE] Tag Leak Fix

**Ringkasan:** Tag internal `[NO_RESPONSE]` yang kadang muncul sebagai suffix di teks consumer response bocor ke antarmuka chat KETIK. Diperbaiki dengan defense-in-depth: stripping di backend (`sanitizeConsumerText()`) + guard di frontend (`ChatInterface.tsx`).

## Perubahan

### 1. Backend — Stripping di `sanitizeConsumerText()`
- **File:** `apps/api/src/services/ketik/consumer-response.ts`
- Ditambahkan `.replace(/\[NO_RESPONSE\]/gi, "").replace(/\s{2,}/g, " ").trim()` di chain sanitasi.
- Fungsi `sanitizeConsumerText()` di-export untuk testing langsung.
- **Deviasi dari plan:** Ditambahkan `collapse double space` agar `"oke [NO_RESPONSE] lanjut"` → `"oke lanjut"` (bukan `"oke  lanjut"`).

### 2. Frontend — Guard & Pattern Extraction
- **File:** `apps/web/src/routes/ketik/lib/message-utils.ts`
- Ditambahkan `NO_RESPONSE_PATTERN_GLOBAL = /\[NO_RESPONSE\]/gi` (konsisten dengan `SYSTEM_TAG_PATTERN`, `IMAGE_TAG_PATTERN`).
- **File:** `apps/web/src/routes/ketik/components/ChatInterface.tsx`
- `result.text.replace(NO_RESPONSE_PATTERN_GLOBAL, "").trim()` sebelum exact-match check.
- Conditional berubah dari `if (responseText !== "[NO_RESPONSE]")` → `if (responseText)` (menangkap suffix case langsung).
- **Deviasi dari plan:** Pattern diekstrak ke constant, bukan inline regex — DRY dan konsisten dengan kode yang ada.

### 3. Backend Regression Test
- **File:** `apps/api/src/__tests__/ketik-consumer-response.test.ts` (NEW)
- 9 tests: suffix, prefix, middle, standalone, case-insensitive, other-tags-preserved, agent prefix, consumer prefix, previous-message tags.

### 4. Frontend Regression Test
- **File:** `apps/web/src/__tests__/ketik-chat-interface-structure.test.ts`
- 6 tests untuk `NO_RESPONSE_PATTERN_GLOBAL`: suffix, prefix, middle, standalone, case-insensitive, other-tags-preserved.
- **Deviasi dari plan:** Test ditambahkan di `ketik-chat-interface-structure.test.ts` (bukan `ketik-review-progress.test.tsx`) — lebih tepat karena menguji pattern constant, bukan component render.

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/services/ketik/consumer-response.ts` | + strip `[NO_RESPONSE]` + export `sanitizeConsumerText` |
| `apps/web/src/routes/ketik/lib/message-utils.ts` | + `NO_RESPONSE_PATTERN_GLOBAL` constant |
| `apps/web/src/routes/ketik/components/ChatInterface.tsx` | + strip `[NO_RESPONSE]` before display check |
| `apps/api/src/__tests__/ketik-consumer-response.test.ts` | NEW — 9 tests |
| `apps/web/src/__tests__/ketik-chat-interface-structure.test.ts` | + 6 pattern tests |

## Test Results

- **API:** 61 test files, 581 passed, 1 skipped, 0 failed
- **Web:** 469 test files, all passed
- **Lint:** 0 errors (180 pre-existing warnings)
- **Build:** Passed
