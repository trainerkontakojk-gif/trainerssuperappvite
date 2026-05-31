# Phase 89 — pnpm 11 Migration

## Summary
Upgraded pnpm from 9.0.0 → 11.5.0. Two breaking changes required fixes; all tests pass.

## Changes

### package.json
- `"packageManager": "pnpm@9.0.0"` → `"pnpm@11.5.0"`

### pnpm-workspace.yaml
Added `allowBuilds` block — pnpm 11 blocks all build scripts by default (supply chain security):
- `@google/genai`, `core-js`, `ecc-universal`, `esbuild`, `protobufjs`

### Breaking Changes Encountered

1. **`allowBuilds` required** — pnpm 11 ignores `onlyBuiltDependencies` etc. from pnpm 9. All build scripts must be explicitly approved in `pnpm-workspace.yaml` via `allowBuilds: { "pkg": true }`.

2. **`confirmModulesPurge` TTY prompt** — pnpm 11 prompts to confirm module directory recreation when lockfile changes. Non-TTY environments need `CI=true` or `confirmModulesPurge=false`.

### What Did NOT Break
- No `pnpm.*` config in `package.json` — so the "config must live in `pnpm-workspace.yaml`" migration was moot
- No `.npmrc` — so the "`.npmrc` is auth/registry only" rule was moot
- `pnpm-lock.yaml` format unchanged (v9.0, compatible with pnpm 11)
- All 504 API + 485 web tests pass, 0 regressions

### Command Reference
```bash
# Install with CI flag to skip TTY prompts
CI=true pnpm install

# Approve build scripts (alternative to manual allowBuilds config)
pnpm approve-builds
```
