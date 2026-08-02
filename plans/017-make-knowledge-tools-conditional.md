# Plan 017: Make Graphify and Context7 usage conditional, scoped, and batch-owned

> **Executor instructions**: Execute after Plans 013 and 014. Follow every verification command. This is a documentation/policy change only; do not run `graphify update .` because that would mutate generated artifacts outside scope. Update `plans/README.md` when complete.
>
> **Drift check (run first)**: `git diff --stat e356c91..HEAD -- AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md docs/README.md`
> Plans 013–014 are expected to change these files. Stop if they did not establish canonical instructions and risk lanes.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — over-narrowing discovery can miss dependencies; fallback/escalation rules mitigate this
- **Depends on**: `plans/013-canonicalize-agent-instructions.md`, `plans/014-add-risk-based-workflow-lanes.md`
- **Category**: perf, dx, docs
- **Planned at**: commit `e356c91`, 2026-08-01

## Why this matters

Graphify and Context7 are currently mandatory before broad categories of work, even when editing docs, following an established internal pattern, or touching one known file. A workflow audit query returned unrelated SIDAK UI nodes, showing that unconditional graph queries can add latency without useful context. `graphify-out/` is about 140 MB, and the current generated graph diff contains roughly 24K changed lines. Scoped triggers, fallback rules, and one final update owner preserve their value while avoiding repeated worker calls and generated-diff churn.

## Current state

`AGENTS.md:21-30` currently requires:

```md
context7: mandatory before external-library implementation
Graphify: mandatory query before planning/execution
Graphify update after code modifications
Graphify query takes priority over manual grep
Each orchestrator worker must query Graphify first
```

`GEMINI.md:117-125` duplicates Context7 plus ECC lookup. `GEMINI.md:146-174` duplicates a larger unconditional Graphify policy. Plan 013 should have removed these copies from `GEMINI.md`.

Constraints to preserve:

- Context7 must still be used before adopting/upgrading a dependency, first use of an unfamiliar/version-sensitive API, or implementation where current official behavior is uncertain.
- Graphify remains preferred for unknown cross-module architecture and dependency/path discovery.
- Source code, tests, schema, and live Git state remain implementation reality even if a graph is stale.
- Supabase MCP and shadcn registry checks remain required when the task genuinely needs those services.

## Commands you will need

| Purpose            | Command                                                                                                                                           | Expected on success                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Policy check       | `rg -n "Graphify\|required\|optional\|Context7\|version-sensitive\|once per integrated\|fallback" AGENTS.md docs/AGENT_WORKFLOW.md`               | conditional matrix and fallback found |
| Blanket-rule check | `rg -n "WAJIB query sebelum planning/eksekusi\|setiap worker.*Graphify\|SEBELUM mengubah kode.*WAJIB" AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md` | no unconditional matches              |
| Host-adapter check | `wc -l GEMINI.md`                                                                                                                                 | at most 40 lines                      |
| Format             | `pnpm exec prettier --check AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md docs/README.md plans/README.md`                                            | exit 0                                |
| Diff hygiene       | `git diff --check -- AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md docs/README.md plans/README.md`                                                   | exit 0                                |

## Scope

**In scope**:

- `AGENTS.md`
- `GEMINI.md` only if Plan 013 left duplicated tool rules
- `docs/AGENT_WORKFLOW.md`
- `docs/README.md`
- `plans/README.md`

**Out of scope**:

- `graphify-out/**`
- `.env*` and any Context7 credentials
- Global skills or MCP server configuration
- Product source, tests, package manifests, migrations
- Running `graphify update .`
- Installing or removing Graphify, Context7, shadcn, or Supabase tooling

## Git workflow

Use the existing branch. Do not commit, push, query remote databases, or expose credentials.

## Steps

### Step 1: Add a knowledge-tool decision matrix

In `docs/AGENT_WORKFLOW.md`, define:

| Situation                                 | Graphify                                        | Context7                                                                 |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| Lane A docs/config                        | skip                                            | skip                                                                     |
| Lane B known local pattern                | optional; direct source/import inspection first | skip unless external API behavior is uncertain                           |
| Lane C cross-file or unknown dependencies | query specific symbols/paths                    | use for newly touched or version-sensitive external API                  |
| Lane D cross-module architecture          | required before decomposition                   | required when an external library/service contract is part of the change |
| Dependency add/upgrade                    | use only if code relationships are unclear      | required after resolving exact package/library ID                        |

The matrix must not override a user's explicit research request.

**Verify**: policy check finds the matrix terms.

### Step 2: Define Graphify query and fallback behavior

Require specific symbol/module queries rather than broad natural-language requests. If the first query is irrelevant or the graph manifest is stale:

1. retry once with an exact symbol or file path;
2. then fall back to `rg`, direct imports/callers, tests, and schema;
3. record that Graphify was not useful; do not keep querying indefinitely.

Do not state that Graphify outranks live source code.

**Verify**: `rg -n "retry once\|exact symbol\|direct imports\|live source" docs/AGENT_WORKFLOW.md` finds the fallback.

### Step 3: Assign one Graphify update owner

For direct work, update Graphify once after the final integrated code batch when code changed. For orchestrator-mode, workers do not each update generated graph files; the orchestrator/integration owner performs one update after implementation and repairs are complete.

Skip graph updates for docs-only/config-only changes without AST impact. Review generated diffs separately and never use a graph update to overwrite unrelated working-tree changes.

**Verify**: policy check finds `once per integrated` ownership language.

### Step 4: Scope and cache Context7 within a task

Require `resolve-library-id` → `query-docs` only when:

- adding or upgrading a dependency;
- using an external API for the first time in this module;
- behavior is version-sensitive, deprecated, or uncertain;
- an observed error may depend on current library semantics.

Within one task/run, resolve each library/version once and share a concise citation/summary with workers. Do not have every worker repeat the same lookup. Existing code and tests are sufficient for an internal refactor that does not change external API usage.

Never store API keys or raw credentials in summaries.

**Verify**: `rg -n "once.*library\|share.*workers\|adding\|upgrading\|version-sensitive" docs/AGENT_WORKFLOW.md` finds the scoped rule.

### Step 5: Keep summaries concise and remove duplicates

`AGENTS.md` should contain only a short trigger summary and point to the matrix. `GEMINI.md` must remain a host adapter. Update `docs/README.md` navigation only if needed; do not copy the matrix there.

Run all format, blanket-rule, host-adapter, and diff-hygiene checks.

## Test plan

No product tests. Structural verification must prove:

- no unconditional pre-plan/pre-edit Graphify rule remains;
- Lane C/D and dependency-upgrade triggers remain;
- Graphify updates have one integration owner;
- Context7 lookups are shared within a run;
- live code/tests/schema outrank generated graph state;
- no credentials are added.

## Done criteria

- [ ] A lane-based Graphify/Context7 decision matrix exists.
- [ ] Docs/config and known local changes can skip both tools.
- [ ] Cross-module and version-sensitive work retains appropriate requirements.
- [ ] Graphify gets at most one exact-query retry before source fallback.
- [ ] One integration owner runs graph update once per final code batch.
- [ ] Context7 library resolution is reused within a task/run.
- [ ] `GEMINI.md` remains at most 40 lines.
- [ ] All verification commands pass.

## STOP conditions

Stop if:

- Plan 013 or 014 is not complete.
- A higher-priority instruction requires unconditional tool use.
- Changing the policy would require modifying generated Graphify output or exposing MCP credentials.
- The proposed matrix allows security/schema/cross-module work to proceed without enough dependency discovery.

## Maintenance notes

Track whether Graphify queries actually identify useful files. If repeated exact-symbol queries remain irrelevant, address graph quality separately rather than restoring unconditional calls. Cache only concise documentation conclusions, never secrets or full provider responses.
