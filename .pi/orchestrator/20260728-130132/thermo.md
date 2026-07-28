Verdict: NEEDS_FIX

Findings:
- P2 — pasrah difficulty is only normalized on read, not on save. `apps/web/src/routes/telefun/telefunSettings.ts:352-369` forces `pasrah` to Hard while parsing, but the editable consumer UI still lets users set any difficulty (`apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx:87-94`), `buildTelefunSettingsForSave()` forwards `consumerTypes` unchanged (`apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts:351-364`), and the API upsert persists the payload as-is (`apps/api/src/routes/telefun/settings.ts:154-183`). Impact: a user can save `pasrah` back as Easy/Medium; the DB stays non-canonical and only frontend reads hide it. This misses the stated read/save normalization guarantee. Remediation: normalize `consumerTypes` at save time (or in the API route) so `pasrah` is always written as Hard while preserving the other fields.

Evidence:
- Current diff does fix the default catalog and prompt wording, and the focused regression for read-time normalization passes.
- The save path still lacks an explicit pasrah normalization step.

Verification:
- `git diff --check` → exit 0
- `git status --short` → exit 0
- `cd apps/web && pnpm exec vitest run src/__tests__/telefun-settings-model-default.test.ts -t "keeps persisted pasrah metadata but forces Hard difficulty" --config vitest.config.ts` → exit 0
- `cd apps/web && pnpm exec vitest run src/__tests__/telefun-prompt-builder.test.ts -t "emotion instruction for sedih consumer" --config vitest.config.ts` → exit 0

Scope notes:
- Read-only review only; no source/test/docs/config edits.
- Reviewed changed files plus Telefun settings save flow.
