# Rebuild Log - Phase 75: Maintainability Refactor

## Deskripsi

Melakukan refaktorisasi pada high-risk hotspots kode guna meningkatkan maintainability, memecah file berukuran besar, memindahkan ownership domain logic ke service, serta merapikan duplikasi registries dan transport API. Refaktor bersifat behavior-preserving (menjaga behavior tetap sama) dan diamankan menggunakan regression test suites komprehensif.

## File Terpengaruh

### 1. SIDAK Dashboard & Service Extraction
- **[NEW]** [dashboard-types.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/services/sidak/dashboard-types.ts) — Berisi definisi tipe data internal untuk dashboard.
- **[NEW]** [dashboard-aggregation.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/services/sidak/dashboard-aggregation.ts) — Helper pure untuk agregasi temuan, ranking, defect, dan compliance rate.
- **[NEW]** [dashboard-trends.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/services/sidak/dashboard-trends.ts) — Helper pure untuk menghitung tren bulanan dan sparklines.
- **[NEW]** [sidak-ranking-service.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/services/sidak-ranking-service.ts) — Service untuk menghitung data ranking periodik.
- **[NEW]** [sidak-ranking-service.test.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/__tests__/sidak-ranking-service.test.ts) — Test suite baru untuk logic ranking periodik.
- **[MODIFY]** [sidak-service.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/services/sidak-service.ts) — Reduksi tanggung jawab `getDashboardData()` dengan memanggil modul-modul hasil ekstraksi.
- **[MODIFY]** [sidak.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/routes/sidak.ts) — Reduksi domain logic ranking dengan mendelegasikannya ke service baru.

### 2. Telefun API Adapter
- **[NEW]** [telefunApi.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/telefun/telefunApi.ts) — Adapter API formal menggantikan pemanggilan `fetch()` mentah.
- **[NEW]** [telefun-api-adapter.test.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/__tests__/telefun-api-adapter.test.ts) — Test suite untuk verifikasi telefun API wrapper.
- **[MODIFY]** [index.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/telefun/index.tsx) — Mengonsumsi adapter API baru.
- **[FIX]** Telefun recording endpoint response contract — Backend mengembalikan `{ success: true, data: { url }, url }` (nested + top-level) agar kompatibel dengan `fetchApi()` unwrap sekaligus backward-compatible untuk consumer lama. Frontend di 3 lokasi diperbarui: `ReviewModal.tsx:154`, `HistoryModal.tsx:133`, `replay.tsx:64`.

### 3. AI Model Registry
- **[NEW]** [ai-models.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/packages/types/src/ai-models.ts) — Pusat registry statis untuk seluruh model AI di monorepo.
- **[NEW]** [aiModels.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/lib/aiModels.ts) — Helper frontend untuk fetching model list.
- **[MODIFY]** [reports-ai.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/sidak/reports-ai.tsx), [pdktSettings.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/pdkt/pdktSettings.ts), [SettingsModal.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/ketik/components/SettingsModal.tsx) — Mengonsumsi shared model registry.

### 4. Settings Modal Layout Decomposition
- **[NEW]** [useKetikSettingsDraft.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts) & [usePdktSettingsDraft.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts) — Hooks untuk menampung local draft form state.
- **[NEW]** [KetikSystemTab.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/ketik/components/settings/KetikSystemTab.tsx) & [PdktSystemTab.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/pdkt/components/settings/PdktSystemTab.tsx) — Tab sistem terpisah untuk memecah file modal yang besar.
- **[NEW]** [ketik-settings-modal.test.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/__tests__/ketik-settings-modal.test.tsx) & [pdkt-settings-modal.test.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/__tests__/pdkt-settings-modal.test.tsx) — Test characterization untuk settings modal.
- **[MODIFY]** [SettingsModal.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/ketik/components/SettingsModal.tsx) & [SettingsModal.tsx](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/web/src/routes/pdkt/components/SettingsModal.tsx) — Integrasi hooks dan tab sistem baru.

## Pengujian & Verifikasi

- **Targeted Regression Tests:**
  - API SIDAK: `61 passed` (sidak-service, sidak-ranking-service)
  - Web Telefun/KETIK/PDKT: `25 passed` (telefun-api-adapter, ketik-settings-modal, pdkt-settings-modal)
  - TypeScript compile: API dan web langsung lulus (`npx tsc --noEmit`)
  - Full `pnpm lint`, `pnpm build`, dan `pnpm test` belum dijalankan di sesi refactor ini — akan diverifikasi saat pre-push.

## Peningkatan Ukuran File
- `apps/api/src/services/sidak-service.ts`: Turun dari 2946 baris ke 2805 baris.
- `apps/web/src/routes/pdkt/components/SettingsModal.tsx`: Turun dari 1258 baris ke 1084 baris.
- `apps/web/src/routes/ketik/components/SettingsModal.tsx`: Turun dari ~1300+ baris ke 1021 baris.
