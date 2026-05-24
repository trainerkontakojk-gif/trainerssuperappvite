# Phase 30: SIDAK Input Stability & QA Baseline Recovery

## 1. Requirement & Goals

1. Hilangkan crash `agents.map is not a function` saat pilih folder di `/sidak/input`.
2. Pulihkan keterbacaan baseline parameter QA tanpa mengubah tampilan modern.
3. Pastikan snapshot parameter aktif tetap kompatibel dengan rule-version + legacy mapping.

## 2. Implementation Summary

- **Shared Types (`packages/types/src/index.ts`):**
  - Sudah ada `AgentDirectoryResponse` dan `AgentDirectoryEntry`.
  - Kontrak response tidak berubah.

- **Frontend Fix (`apps/web/src/routes/sidak/input.tsx`):**
  - Import `AgentDirectoryResponse` dari `@trainers/types`.
  - Menambahkan `normalizeAgentsResponse()` — pure helper untuk mengekstrak array `AgentEntry[]` dari payload object (`{ agents, batches }`) atau legacy array, dengan fallback `[]` untuk payload invalid.
  - `handleFolderClick()` kini fetch dari `/sidak/agents?year=<current>` dan memfilter by `batch_name` client-side.
  - Menambahkan `unlinkedIndicatorIds` — detection indikator rule-version yang belum ter-link ke `qa_indicators`.
  - `handleSave()` dan `handleImportSave()` memblokir submit jika indikator terpilih termasuk unlinked, dengan pesan actionable.

- **Frontend Fix (`apps/web/src/routes/sidak/settings.tsx`):**
  - Menambahkan computed `publishedWhenDraftEmpty`: saat draft kosong tapi versi published ada, tampilkan warning amber + CTA "Create Revision dari Published" di area parameter kosong.
  - Field `service_type` ditambahkan ke mapping `activeIndicators` untuk memenuhi kontrak `QAIndicator`.

- **Backend Fix (`apps/api/src/services/sidak-service.ts`):**
  - `validateTemuanBatch()`: pesan invalid indicator diperjelas menjadi "Periksa parameter di halaman Settings QA."

- **Frontend Tests (`apps/web/src/__tests__/sidak-input-agents-shape.test.ts`):**
  - 8 unit test untuk `normalizeAgentsResponse`: null/undefined/non-object fallback, object shape, missing agents key, non-array agents, legacy array pass-through.

- **Frontend Tests (`apps/web/src/__tests__/sidak-settings-parity.test.tsx`):**
  - Test baru: "shows CTA Create Revision from Published when draft is empty but published has indicators" — memastikan warning dan tombol muncul.

- **API Tests (`apps/api/src/__tests__/sidak-service.test.ts`):**
  - Test baru: "mentions Settings QA when indicator not in active rule version" — memastikan pesan validasi backend mengandung referensi ke Settings QA.

- **Docs (`plan/markdown/sidak-input-agents-map-and-qa-baseline-fix.md`):**
  - Spec-driven plan dengan Requirement, Design, Tasklist, Risk Register, Rollback Plan.

## 3. Verification & Validation

- **API Tests:** 16 files, 251 passed + 4 skipped.
- **Web Tests:** 20 files, 89 passed.
- **Full Suite:** `pnpm test` — 3 tasks, 3 successful.
- **TypeScript:** `tsc --noEmit` lulus untuk kedua workspace (web + api).
- **Production Build:** `pnpm build` berhasil.

## 4. Key Decisions

- Menggunakan pure function `normalizeAgentsResponse` (diekspor) untuk parsing defensif, tidak menambah dependency baru.
- Filter `batch_name` dilakukan client-side dari response direktori, tetap menghormati exclusion rules backend.
- Draft kosong + published berisi: tampilkan CTA amber, bukan auto-switch (hindari surprise UX).
- Unlinked indicators: block di FE + preserve di BE untuk double-gate.
- Tidak mengubah kontrak API endpoint `/sidak/agents`, hanya hardening konsumer.
