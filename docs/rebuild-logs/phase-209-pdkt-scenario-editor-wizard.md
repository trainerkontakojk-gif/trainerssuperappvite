# Phase 209: PDKT Scenario Editor Wizard

## Ringkasan

Editor skenario PDKT di settings dipecah menjadi wizard 2 langkah pada surface yang sama untuk mengurangi rasa penuh saat edit skenario. Kontrak data, backend, dan save flow tetap dipertahankan.

## Perubahan

### apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioForm.tsx
- Menjadi shell wizard dengan step header, summary detail lanjutan, panel step 1, panel step 2, dan sticky footer.
- Step 1 memuat kategori, judul, deskripsi, dan toggle LJK resmi.
- Step 2 memuat recipient targets, template email, dan lampiran.

### apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioWizardStepHeader.tsx
- Komponen baru untuk menampilkan navigasi Langkah 1 dan Langkah 2 secara jelas.

### apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioAdvancedSummary.tsx
- Komponen baru untuk menampilkan status ringkas detail lanjutan saat step 2 belum dibuka.
- Summary mencakup email tujuan, template email, dan jumlah lampiran.

### apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioStickyFooter.tsx
- Komponen baru untuk footer sticky yang menjaga aksi step navigation, Batal, dan Simpan tetap terlihat.

### apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx
- Menyimpan active step lokal untuk editor skenario.
- Save invalid step 2 sekarang mengarahkan wizard kembali ke detail lanjutan dan memfokuskan error area.

### apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioTemplateField.tsx
- Copy ambigu `Always use this email` diganti menjadi `Selalu pakai template ini`.
- Target focus untuk body template ditambahkan untuk handoff error.

### apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioRecipientsField.tsx
- Email input tiap baris diberi `aria-invalid` dan id stabil untuk fokus error.

### apps/web/src/__tests__/pdkt-settings-modal.test.tsx
- Ditambahkan regression test untuk:
  - wizard default membuka step 1
  - invalid recipient email memaksa wizard kembali ke step 2
  - simpan skenario langsung dari step 1 tanpa membuka detail lanjutan

## Verifikasi

- `pnpm --filter @trainers/web exec vitest run src/__tests__/pdkt-settings-modal.test.tsx -t "opens the scenario wizard on step 1 with an optional step 2|reopens step 2 and surfaces invalid recipient errors on save|saves a scenario directly from step 1 without opening advanced fields"`
- `pnpm --filter @trainers/web exec vitest run src/__tests__/pdkt-settings-modal.test.tsx -t "opens the scenario wizard on step 1 with an optional step 2"`
- `pnpm --filter @trainers/web exec vitest run src/__tests__/pdkt-settings-modal.test.tsx -t "reopens step 2 and surfaces invalid recipient errors on save"`
- `pnpm --filter @trainers/web exec vitest run src/__tests__/pdkt-settings-modal.test.tsx -t "saves a scenario directly from step 1 without opening advanced fields"`

## Catatan

- Perubahan ini UI-only.
- Normalizer, shape `PdktScenario`, dan backend persistence tetap dipakai seperti sebelumnya.
