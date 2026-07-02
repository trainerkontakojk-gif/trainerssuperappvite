# Phase 121 - PDKT PDF Attachments

## Summary

- PDKT scenario setup now accepts PDF evidence attachments in addition to image files.
- Attachment previews render PDFs as a stable file tile instead of a broken image.
- Email detail keeps image zoom behavior and opens PDF attachments in a new tab.

## Verification

```bash
pnpm --filter @trainers/web exec vitest run src/__tests__/pdkt-settings-modal.test.tsx --reporter=dot
pnpm --filter @trainers/web exec eslint src/routes/pdkt/components/settings/PdktScenariosTab.tsx src/routes/pdkt/components/settings/scenarios/ScenarioAttachments.tsx src/routes/pdkt/components/ScenarioImage.tsx src/routes/pdkt/components/EmailDetailPane.tsx src/routes/pdkt/utils/detectMimeType.ts src/__tests__/pdkt-settings-modal.test.tsx
pnpm --filter @trainers/web exec tsc --noEmit
git diff --check
```
