# PDKT Email & Pengaturan UX Refactor (Implemented)

## Requirement

Remove email previews from the PDKT scenario wizard and balance the sender-profile and evaluation layouts. Keep manual email authoring in the first step. Balance fields across two desktop columns: pair sender-profile fields within each section, and place recipients on the left with attachments and optional expected-answer settings on the right in the final step. Stack naturally on narrow screens. Preserve AI/manual behavior, validation, persistence, attachment handling, and API semantics except for removing the preview-only template-generation UI.

## Design

- Keep `creationMode` in `PdktScenariosTab` as the only mode source of truth.
- Keep `creationMode` as the single source of truth and label step 3 `Penerima & Evaluasi` in both modes.
- Remove the preview panel, preview-specific AI generation action, and manual `Edit Email` review state. The manual email remains editable in step 1.
- Balance sender-profile fields in two-column grids within each semantic section: identity fields form two pairs; character/style controls split evenly, including when per-character fields are visible.
- Reflow step 3 into a responsive two-column form: recipient controls on the left; attachments and optional expected-answer settings on the right. Stack naturally on small screens.
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
- Sender identity and character/style controls use paired responsive grids; the mention-placement control is grouped with communication style. Step 3 balances recipient controls on the left against attachments and expected answers on the right; the columns align at the top and stack on narrow screens.
- Focused PDKT settings/recipient tests: 34/34 passed. `pnpm test:core` passed (API 284, Telefun 158, Web 213); web typecheck and build passed. `pnpm lint` passed with existing warnings elsewhere. Touched-file ESLint, Prettier, and `git diff --check` passed. Build emitted Node/Tailwind toolchain warnings.
- Source review confirmed labels, error/persistence handlers, and responsive structure are unchanged beyond reflow. Browser visual verification was not run because no local app listener was found on the usual Vite/preview ports; no server was started.

## Balance Follow-up (completed)

- [x] Add RED assertions to the existing settings-modal cases for balanced profile fields and the recipient/evaluation column split.
- [x] Reflow profile fields into paired responsive grids and move attachments beside the expected-answer field without changing validation or persistence.
- [x] Run focused tests, web typecheck/lint, formatting, build, and diff check; complete source/UI audit and record browser availability.

## Previous Result (superseded by the no-preview request)

- AI mode presents recipient and attachment controls before the `Buat Pratinjau`/`Buat Ulang` action and renders an email-shaped preview with primary recipient, subject, and body.
- Manual mode presents the same preview surface, hides AI controls, and opens the existing subject/body editor through `Edit Email` when the trainer needs to change the draft.
- Recipient copy is simplified, `Mode Penerima` is removed from the UI, and `konsumen@ojk.go.id` is shown as automatically included while the persisted `recipientMode` remains compatible.
- Simulation behavior settings are collapsed under `Pengaturan tambahan`; the two-column desktop layout stacks responsively, the content remains scrollable, and the edit footer says `Simpan Skenario`.
- Verification: 33 focused PDKT tests passed, web typecheck passed, touched-file lint passed, production build passed, and `git diff --check` passed.
- Latest browser recheck was blocked by an expired Supabase dogfood session (`403`); no credential or screenshot claim was added.
