# PDKT Scenario Creation Mode Flow (Implemented)

## Requirement

Change the PDKT add-scenario entry flow so clicking `Tambah Skenario Baru` first presents two explicit modes before the existing wizard:

- `Skenario AI`: the scenario description is the primary input; the flow must not ask for a final email, and only the fields needed for AI-generated email simulation remain.
- `Email buatan sendiri`: the user provides a subject/body email; the flow must not show or require the AI email generator, and only the fields needed for manual-email simulation remain.

Editing an existing scenario must continue to open the wizard directly. Existing scenario persistence, normalization, API routes, storage shape, and unrelated PDKT settings remain unchanged. Existing scenarios without a stored mode are inferred from `alwaysUseSampleEmail` for backward compatibility; no migration or new persisted field is introduced.

## Design

- Keep the current desktop settings modal and three-stage wizard surface.
- Add a keyboard-accessible mode picker inside the existing scenario editor surface, with two concise Indonesian option buttons and a cancel/close action.
- Add transient creation-mode state in `PdktScenariosTab`; reset it for each new add flow and infer it for edit/reopen.
- AI mode keeps scenario metadata, sender profile, recipient/attachment/simulation settings, and an optional AI example-email helper. It removes manual template inputs and explains that the actual simulation email is generated from the scenario description.
- Manual mode makes the custom subject/body email the main scenario-stage input, keeps sender profile and recipient/attachment/simulation settings, and removes the AI generator. The saved draft uses the existing `sampleEmailTemplate` contract with `alwaysUseSampleEmail: true`; scenario description falls back to the manual email body when needed so the existing backend contract remains valid.
- Preserve existing validation, focus behavior, attachment handling, dirty-close confirmation, edit/reopen behavior, and Bahasa Indonesia copy. Scope visual verification to the desktop layout; do not redesign mobile.

## Tasklist

- [x] Add a focused web regression test covering the mode picker, AI-mode conditional fields, and manual-mode conditional fields.
- [x] Run the focused test and confirm RED before implementation.
- [x] Implement the mode picker and transient mode wiring in the PDKT scenario settings flow.
- [x] Make wizard fields and validation mode-aware without changing shared types/API/storage contracts.
- [x] Update existing characterization tests only where the intentional mode gate changes the add flow; keep edit and other PDKT flows covered.
- [x] Run focused Vitest, web typecheck, touched-file lint, and `git diff --check`.
- [x] Add the follow-up UX refinement: mode-specific first-stage labels, `Tujuan & Pratinjau` hierarchy, two-column recipient/attachment/preview layout, simplified recipient copy, manual preview with controlled editing, collapsed simulation settings, and scroll-safe sticky footer.

## Result

- New scenarios start with a mode picker: **Skenario AI** or **Email buatan sendiri**.
- AI and manual modes have distinct first-stage surfaces and share a third stage named **Tujuan & Pratinjau**.
- Step 3 follows `Penerima Email → Email Tambahan/Lampiran → Pratinjau Email → Simpan`; desktop uses two columns and small screens stack the same order.
- Existing persistence, normalization, API routes, storage shape, and unrelated PDKT settings remain unchanged. The persisted `recipientMode` remains available even though `Mode Penerima` is no longer user-facing.
- Verification: 33 focused PDKT tests passed, web typecheck passed, touched-file lint passed, production build passed, and docs formatting passed.
- Latest browser recheck was blocked by an expired Supabase dogfood session (`403`); no credentials were stored.
- Follow-up regression fix: aligned the pristine `useCrudForm` draft with the wizard snapshot by defaulting `primaryRecipientType` to OJK. Both add-mode/cancel regressions now pass, and the full modal suite passes (34/34).
