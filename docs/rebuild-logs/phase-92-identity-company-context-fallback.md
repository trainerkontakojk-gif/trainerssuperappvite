# Phase 92: Identity & Company Context Fallback

**Goal:** Ensure KETIK, PDKT, and Telefun never display identity or company name placeholders when fields are left blank.

## Implementation Details

### PDKT Module
- **Centralized Resolver:** Created `pdkt-template-resolver.ts` and `pdkt-company-names.ts` in `apps/api/src/services/` to handle placeholder resolution.
- **Company Pools:** Extracted licensed company lists (Perbankan, Asuransi) and unlicensed/illegal fictive names into a shared source of truth.
- **Placeholder Guard:** Implemented a robust regex-based placeholder detector for variations like `[Nama Perusahaan]`, `{{company_name}}`, `[Nama Nasabah]`, etc.
- **Bypass Normalization:** Updated both manual sample template and AI-generated template paths to route through the resolver. The frontend now delegates all template rendering to the backend to ensure consistency.
- **Regression Tests:** Added comprehensive API tests for the resolver and updated service tests.

### KETIK Module
- **Pure Helper:** Extracted inline random identity logic from `index.tsx` into a pure helper `ketikIdentity.ts`.
- **Regression Tests:** Added unit tests for `resolveKetikSessionIdentity` to ensure empty fields are correctly populated with contextual fallbacks.

### Telefun Module
- **Fallback Verification:** Verified existing `resolveFinalIdentity` logic and added regression tests to `telefun-settings-model-default.test.ts` to lock in the fallback behavior.

## Verification Results

### Automated Tests
- API Tests: `pdkt-template-resolver.test.ts`, `pdkt.test.ts` (All PASS)
- Web Tests: `ketik-identity.test.ts`, `telefun-settings-model-default.test.ts` (All PASS)

### Type Checking
- `apps/api`: `tsc --noEmit` (PASS)
- `apps/web`: `tsc --noEmit` (PASS)

### Manual Verification
- PDKT manual template with placeholders resolved to concrete names.
- KETIK session start with empty settings correctly randomizes identity.
- Telefun call start with empty settings correctly uses fallback pool.

## Structural Changes
- Decomposed monolithic `pdkt-service.ts` by extracting company pools and template resolution logic.
- Simplified `apps/web/src/routes/pdkt/simulation.tsx` by centralizing template generation logic in the backend.
