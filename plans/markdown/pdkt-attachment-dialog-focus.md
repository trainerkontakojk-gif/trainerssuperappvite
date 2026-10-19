# PDKT attachment dialog focus regression

## Requirement

After choosing an attachment in the scenario editor, keep the editor visible and usable on mobile and desktop. Preserve file validation, draft state, keyboard access, and the existing upload flow.

## Design

Lane C regression fix. The visually hidden file input is absolutely positioned without a local containing block. Focusing it through its label scrolls the outer overflow-hidden dialog, moving the editor outside its viewport. Make the upload label positioned so the input stays within the upload control.

Own only `ScenarioAttachments.tsx`, the existing attachment scenario in `pdkt-flow.spec.ts`, and this plan. Preserve the unrelated untracked egress audit. No remote changes.

Strengthen the existing E2E instead of adding duplicate coverage: click the upload label, fulfill the file chooser, confirm the thumbnail and editor heading remain in the viewport at 390px and 1280px. Existing direct `setInputFiles` coverage misses the focus-induced scroll.

## Tasklist

- [x] RED: strengthen the existing focused E2E and confirm viewport failure.
- [x] GREEN: position the upload label and rerun the same E2E.
- [x] Review maintainability and UI/accessibility; run detector and Graphify update.
- [x] Run web typecheck, root lint/build, scoped formatting and diff checks.
- [x] Record evidence and report local-only completion.

## Evidence

- `pnpm --dir apps/web exec playwright test pdkt-flow.spec.ts --grep 'touch target 44px: lampiran skenario'`: RED exit 1, heading viewport ratio 0. With the fix, heading remains visible. The delete button on mobile requires scrolling the editor; the test checks it becomes reachable and the header stays visible. Final GREEN exit 0, 1 passed, widths 390px and 1280px, hermetic local targets only.
- `pnpm --filter @trainers/web typecheck`: exit 0.
- Release gate `pnpm typecheck --concurrency=1`: exit 0, 4 tasks successful.
- `pnpm lint`: exit 0, 4 tasks successful; warnings in untouched code.
- `pnpm build --concurrency=1`: exit 0, 3 tasks successful; existing Vite config-loader warning.
- `graphify explain ScenarioAttachments`: confirms callers in ScenarioEditor/PdktScenariosTab. `graphify update .`: exit 0; local ignored cache updated.
- Impeccable detector on ScenarioAttachments: exit 0, no findings. UI review confirms label association, native file input, focus indication, theme tokens, and existing responsive layout are retained. Maintainability review: one positioning utility, no new state, handlers, abstractions, or dependency changes.
- `pnpm exec prettier --check apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioAttachments.tsx plans/markdown/pdkt-attachment-dialog-focus.md`: exit 0. Whole-spec Prettier check reports pre-existing formatting in untouched Storage/history scenarios; comparison with formatted output shows no formatting difference in the changed test block. Those unrelated sections are preserved.
- `git diff --check`: exit 0.

This restores the documented settings-dialog scroll contract; canonical product docs do not need a change. Implementation was verified locally before the user authorized commit, push, and production Web deployment. Release adds the required changelog entry and root typecheck gate; the unrelated egress audit stays untracked.
