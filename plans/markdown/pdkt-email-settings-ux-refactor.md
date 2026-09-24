# PDKT Email & Pengaturan UX Refactor (Implemented)

## Requirement

Remove email previews from the PDKT scenario wizard and tidy the third step. Keep manual email authoring in the first step, and use the last step for recipient, attachment, and optional expected-answer settings. Preserve AI/manual behavior, validation, persistence, attachment handling, and API semantics except for removing the preview-only template-generation UI.

## Design

- Keep `creationMode` in `PdktScenariosTab` as the only mode source of truth.
- Keep `creationMode` as the single source of truth and label step 3 `Penerima & Evaluasi` in both modes.
- Remove the preview panel, preview-specific AI generation action, and manual `Edit Email` review state. The manual email remains editable in step 1.
- Reflow step 3 into a responsive two-column form: recipients and attachments together on the left; the optional expected-answer field on the right. Stack naturally on small screens.
- Keep recipient labels (`Penerima Email`, `Lawan Bicara Utama`, `Email Tambahan`, `Tambah Email`) and the automatically included `konsumen@ojk.go.id` notice; preserve recipient defaults and storage semantics.
- Keep `Pengaturan tambahan` collapsed below the main form. Preserve the wizard's scrollable content, sticky footer, validation, focus handling, attachment state, and save behavior.
- Update the existing settings tests to assert that neither creation mode renders an email preview or preview-only action, and cover the revised hierarchy, responsive layout, and retained manual editing. Do not add a duplicate suite.

## Tasklist

- [x] Update the existing focused settings tests for preview removal in AI and manual modes, retained manual email editing, and the new stage-3 form layout; run RED.
- [x] Remove preview-only components/state and reflow step 3 without changing persistence or API contracts.
- [x] Run focused Vitest, web typecheck, lint, formatter, build, and `git diff --check`.
- [x] Perform the source-level UI/accessibility audit and final diff review; record whether browser visual verification was available.

## Current Result

- Removed the AI preview/generation panel and manual preview/review state. Manual email subject/body remain editable in step 1, and the test verifies edited content is saved.
- Step 3 is labeled `Penerima & Evaluasi`; recipients and attachments share the left column, the optional expected-answer field sits on the right, and advanced settings remain collapsed below.
- Focused PDKT settings/recipient tests: 34/34 passed. Web typecheck, touched-file ESLint, Prettier, `git diff --check`, and web build passed. The build emitted Node/Tailwind toolchain warnings.
- Source review confirmed the responsive one/two-column layout and retained field labels/help. Browser visual verification was not run because no local app listener was found on the usual Vite/preview ports; no server was started.

## Previous Result (superseded by the no-preview request)

- AI mode presents recipient and attachment controls before the `Buat Pratinjau`/`Buat Ulang` action and renders an email-shaped preview with primary recipient, subject, and body.
- Manual mode presents the same preview surface, hides AI controls, and opens the existing subject/body editor through `Edit Email` when the trainer needs to change the draft.
- Recipient copy is simplified, `Mode Penerima` is removed from the UI, and `konsumen@ojk.go.id` is shown as automatically included while the persisted `recipientMode` remains compatible.
- Simulation behavior settings are collapsed under `Pengaturan tambahan`; the two-column desktop layout stacks responsively, the content remains scrollable, and the edit footer says `Simpan Skenario`.
- Verification: 33 focused PDKT tests passed, web typecheck passed, touched-file lint passed, production build passed, and `git diff --check` passed.
- Latest browser recheck was blocked by an expired Supabase dogfood session (`403`); no credential or screenshot claim was added.
