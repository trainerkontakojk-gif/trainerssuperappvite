Verdict: PASS

Findings:
- None.

Evidence:
- `apps/web/src/routes/telefun/telefunSettings.ts` now normalizes `pasrah` to `ConsumerDifficulty.Hard` both in default catalog and on parse/save path via `normalizeTelefunConsumerDifficulty` / `normalizeTelefunConsumerType`.
- `apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts` now maps `consumerTypes` through the same helper in `buildTelefunSettingsForSave()`, so save-time canonicalization matches read-time canonicalization.
- The helper is merge-only for `pasrah` (`{ ...consumerType, difficulty: Hard }`), so custom `name`, `gender`, and `description` are preserved; non-`pasrah` entries are returned unchanged.
- `apps/web/src/routes/telefun/services/promptBuilder.ts` keeps `pasrah` behavior keyed by `consumerType.id === "pasrah"` and adds the hard-sad guidance plus safety guardrails.
- `docs/telefun.md` was synced to reflect `pasrah` default Hard + legacy normalization.

Verification:
- `git diff --check` → exit 0
- `cd apps/web && pnpm exec vitest run src/__tests__/telefun-settings-model-default.test.ts src/__tests__/telefun-prompt-builder.test.ts --config vitest.config.ts` → exit 0
- `git status --short` → exit 0

Scope notes:
- Read-only recheck only; no source/test/docs/config edits made.
- Worktree still contains the existing modified files plus untracked `.pi/` orchestrator artifacts.
