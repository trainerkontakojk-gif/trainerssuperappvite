# Phase 209 — PDKT Scenario Editor Wizard (Completed)

## Summary

The PDKT add/edit surface is now a single three-step wizard rather than the former two-step editor. Global management menus remain available outside the editor, while add/edit uses only the implemented scenario flow.

## Implemented contract

- Add header: **`Tambah Skenario PDKT`**; edit header: **`Edit Skenario PDKT`**.
- Exact steps: **`1. Skenario`**, **`2. Profil Pengirim`**, **`3. Email & Pengaturan`**.
- Step statuses are **`Belum diisi`**, **`Sedang diisi`**, or **`Selesai`**, derived from live draft/validation state.
- Step 1 contains scenario basics and no LJK/licensed-entity control. The helper uses **`Jelaskan situasi yang akan dihadapi agent dalam simulasi email.`**
- Step 2 contains the two profile cards: `Identitas Pengirim` and `Karakter dan Gaya Komunikasi`.
- Step 3 keeps all settings directly visible when **`Email & Pengaturan`** is active, in two clearly separated sections: **`Konfigurasi Email`** (with helper `Atur penerima, template, dan lampiran untuk skenario ini.`) and **`Pengaturan Simulasi`** (with helper `Sesuaikan perilaku AI yang digunakan dalam simulasi.`). Steps 1 and 2 remain hidden while inactive. The obsolete `Pengaturan Lanjutan` accordion and compact summary are removed.
- Footer labels are exact: step 1 `Batal`/`Lanjut`; step 2 `Kembali`/`Lanjut`; step 3 `Kembali` plus `Buat Skenario` (add) or `Simpan Perubahan` (edit).
- Inline validation, accessible stepper/dialog controls, focus handling, Escape handling, attachment affordances, and mobile dynamic-viewport/safe-area behavior are implemented.
- Dirty confirmation is scoped to the wizard snapshot, so cancelling the editor does not discard unrelated settings edits. The guard copy is **`Perubahan belum disimpan. Yakin ingin keluar?`**.

## Files and contracts

Primary files include:

- `apps/web/src/routes/pdkt/components/SettingsModal.tsx`
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`
- `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts`
- `apps/web/src/routes/pdkt/components/settings/pdktDraftNormalizers.ts`
- `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioForm.tsx`
- `ScenarioWizardStepHeader.tsx`, `ScenarioStickyFooter.tsx`, recipients/template/attachment fields, and settings primitives
- `packages/types/src/pdkt.ts`
- API PDKT settings, catalog, company-name, email-policy, and template-resolver modules

Existing global keys and scenario keys remain namespaced as before; the outer settings POST/save boundary is unchanged. No database migration was added.

## Backward compatibility and OJK preservation

Raw legacy JSON may still contain `isLicensed`. The compatibility boundary strips that obsolete key on read/write, preserves unknown unrelated scenario keys and namespaces, retains supported data, and keeps the legacy `script` to template-body migration. The public type and new serialization do not emit `isLicensed`.

AI/company behavior is now one uniform fictitious/default-off path, including legacy scenarios; licensed catalogs and metadata are not exposed. OJK behavior is preserved, including `konsumen@ojk.go.id`, OJK recipient type, CC/recipient direction, and evaluation semantics.

## Verification

Evidence from the final worker reports:

- Web focused tests: **5 files, 38 tests passed**.
- Focused API tests: **8 files, 117 tests passed**.
- `pnpm test:core` passed: API **134**, Telefun **231**, and web **56** tests; **4 tasks** completed.
- `pnpm build` passed.
- Final Thermo review: **PASS**.
- `git diff --check` passed.
- Root `pnpm lint` failed only on pre-existing unrelated API errors in `telefun-communication-profile.test.ts` and `ketik/prompt-policy.ts` (**5 errors**); the lint gate is not claimed as passed.
- Browser visual/runtime verification was not run; no browser visual claim is made.
