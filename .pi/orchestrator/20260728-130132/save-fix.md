# Telefun `pasrah` save normalization repair

## RED

Command:
```bash
cd apps/web && pnpm exec vitest run src/__tests__/telefun-settings-model-default.test.ts --config vitest.config.ts
```

Exit: `1`

Result: 30 tests passed, 1 failed. The save-path assertion received `difficulty: "Easy"` for `pasrah` instead of expected `"Hard"`.

## GREEN

Command:
```bash
cd apps/web && pnpm exec vitest run src/__tests__/telefun-settings-model-default.test.ts --config vitest.config.ts
```

Exit: `0`

Result: 1 test file passed; 31 tests passed.

Typecheck command:
```bash
pnpm --filter @trainers/web exec tsc --noEmit
```

Exit: `0`
