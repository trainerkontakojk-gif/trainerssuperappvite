# PDKT Email & Pengaturan UX Refactor (Implemented)

## Requirement

Refine the PDKT scenario wizard's `Email & Pengaturan` step so the selected `creationMode` is obvious and the AI and manual email flows have distinct, useful surfaces. Keep shared recipient, attachment, and simulation controls available, preserve scrolling/sticky-footer behavior, and leave persistence, validation, generation, attachment, and API semantics unchanged.

## Design

- Keep `creationMode` in `PdktScenariosTab` as the only mode source of truth.
- Lead the step with one `Isi email` section: AI mode explains that the sample is generated from the scenario description, exposes one concise generate/regenerate action, and shows the generated preview/state; manual mode reuses the existing `sampleEmailTemplate` draft as an editable email representation and contains no AI copy or action.
- Place shared `Email tujuan`, `Lampiran`, and `Pengaturan simulasi` sections after the mode-specific email surface with short helper copy and restrained token-based separation.
- Preserve the wizard's `min-h-0`/`overflow-y-auto` content region and shrink-to-fit sticky footer.
- Update the existing PDKT settings regression suite for mode-exclusive UI and shared sections; do not add a duplicate suite.

## Tasklist

- [x] Add/update focused tests for AI/manual exclusivity and shared Email & Pengaturan sections; run RED.
- [x] Implement the scoped Email & Pengaturan hierarchy and mode-specific surfaces without changing data contracts.
- [x] Run focused Vitest, web typecheck, lint, and `git diff --check`.
- [x] Perform the required source-level UI/accessibility audit and final diff review; browser recheck is documented below.

## Result

- AI mode presents the source context, generator/regenerator, and generated preview.
- Manual mode presents editable subject/body fields in the review stage and hides AI generator controls.
- Recipient and attachment controls stay visible; simulation behavior settings are collapsed under `Pengaturan tambahan` by default.
- Verification: 32 focused PDKT tests passed, web typecheck passed, touched-file lint passed, production build passed, and `git diff --check` passed.
- Latest browser recheck was blocked by an expired Supabase dogfood session (`403`); no credential or screenshot claim was added.
