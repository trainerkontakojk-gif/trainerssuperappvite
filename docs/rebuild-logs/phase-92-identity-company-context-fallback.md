# Phase 92: Identity & Company Context Fallback

**Goal:** Ensure KETIK, PDKT, and Telefun never display identity or company name placeholders when fields are left blank.

## Implementation Details

### PDKT Module
- **Centralized Resolver:** Created `pdkt-template-resolver.ts` and `pdkt-company-names.ts` in `apps/api/src/services/` to handle placeholder resolution.
- **Company Pools:** Extracted licensed company lists (Perbankan, Asuransi) and unlicensed/illegal fictive names into a shared source of truth.
- **Placeholder Guard:** Implemented a regex-based placeholder detector for bracketed and moustache placeholders, plus sanitization for consumer aliases like `[Nama Nasabah]` and `[Nama Pengirim]`.
- **Bypass Normalization:** Updated both manual sample template and AI-generated template paths to route through the resolver. The frontend now delegates all template rendering to the backend to ensure consistency, and AI generation retries once if placeholders or short output still slip through.
- **Regression Tests:** Added API tests for the resolver and updated service tests to cover company aliases, consumer aliases, and subject sanitization.

### KETIK Module
- **Pure Helper:** Extracted inline random identity logic from `index.tsx` into a pure helper `ketikIdentity.ts`.
- **Regression Tests:** Added unit tests for `resolveKetikSessionIdentity` to ensure empty fields are correctly populated with contextual fallbacks.

### Telefun Module
- **Fallback Verification:** Verified existing `resolveFinalIdentity` logic and added regression tests to `telefun-settings-model-default.test.ts` to lock in the fallback behavior.

## Verification Results

### Automated Tests
- API Tests: `pdkt-template-resolver.test.ts`, `pdkt.test.ts` (PASS)
- Web Tests: not re-run in this repair pass; no web code changed in this follow-up.

### Type Checking
- `apps/api`: `tsc --noEmit` (PASS)

### Manual Verification
- PDKT manual template with placeholders resolved to concrete names.
- KETIK session start with empty settings correctly randomizes identity.
- Telefun call start with empty settings correctly uses fallback pool.
- AI-generated PDKT templates retry once when placeholders or word count still miss the bar.

## Structural Changes
- Decomposed monolithic `pdkt-service.ts` by extracting company pools and template resolution logic.
- Simplified `apps/web/src/routes/pdkt/simulation.tsx` by centralizing template generation logic in the backend.
