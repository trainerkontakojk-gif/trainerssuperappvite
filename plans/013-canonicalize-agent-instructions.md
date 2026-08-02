# Plan 013: Canonicalize agent instructions and remove stale host-specific duplication

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report; do not improvise. When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat e356c91..HEAD -- AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md docs/README.md`
> If an in-scope file changed since this plan was written, compare the current text with the excerpts below. Stop if another change already establishes a different canonical-instruction strategy.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED — deleting duplicated text can accidentally delete an active safety or architecture guardrail
- **Depends on**: none
- **Category**: dx, docs
- **Planned at**: commit `e356c91`, 2026-08-01

## Why this matters

The agent bootstrap currently spans `AGENTS.md` (208 lines), `GEMINI.md` (542 lines/86 KB), and `docs/AGENT_WORKFLOW.md` (121 lines). `GEMINI.md` duplicates active rules, embeds hundreds of lines of phase history, and requires ECC/`Task` tooling that is not available in the Pi harness. Reading all three consumes roughly 27K tokens before task-specific context and exposes agents to contradictory instructions. This plan establishes one canonical operational source and turns host-specific files into short adapters.

## Current state

- `AGENTS.md:9` points to `docs/AGENT_WORKFLOW.md` but repeats much of its sequence at lines 162–171.
- `GEMINI.md:19` says ECC is mandatory for every task and lines 19–29 reference a `Task` tool.
- `AGENTS.md:179` says ECC is only supplemental, not a Context7 replacement.
- `AGENTS.md:42` references `thermo-nuclear-code-quality-review`, while the installed Pi skill is named `thermo-nuclear`.
- `AGENTS.md:53` refers to `skill_view`; Pi loads skills by reading their `SKILL.md` files.
- `GEMINI.md:177-542` contains phase progress, key-file inventories, and route/API inventories that belong in canonical docs, not runtime instructions.

Canonical role model to preserve from `docs/AGENT_WORKFLOW.md:27-35`:

```md
Workflow: runtime instruction hierarchy
Intended behavior: approved requirement/spec
Implementation reality: code, schema, tests, runtime
Architecture/contract: canonical docs
Discovery: Wiki
External reference: official docs/Context7
```

## Commands you will need

| Purpose          | Command                                                                                                                   | Expected on success                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Format           | `pnpm exec prettier --check AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md docs/README.md plans/README.md`                    | exit 0                                                                           |
| Size check       | `wc -l AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md`                                                                        | `GEMINI.md` is at most 40 lines; total is materially below the current 871 lines |
| Stale-tool check | `rg -n "ECC.*WAJIB\|via Task\|skill_view\|thermo-nuclear-code-quality-review" AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md` | no matches                                                                       |
| Diff hygiene     | `git diff --check -- AGENTS.md GEMINI.md docs/AGENT_WORKFLOW.md docs/README.md plans/README.md`                           | exit 0                                                                           |

## Scope

**In scope**:

- `AGENTS.md`
- `GEMINI.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/README.md`
- `plans/README.md`

**Out of scope**:

- Product code, tests, package manifests, migrations, and deployment config
- `docs/PHASE_PROGRESS.md` content
- `docs/rebuild-logs/`
- Global Pi skills under `~/.pi/agent/skills/`
- Any change that weakens auth, RLS, secret handling, or test requirements

## Git workflow

- Work on the existing branch; do not create, commit, push, or publish unless explicitly requested.
- Match recent documentation commit style such as `docs: ...` or `chore: ...` if a later operator requests a commit.

## Steps

### Step 1: Establish explicit document ownership

Update `docs/AGENT_WORKFLOW.md` with a short ownership section:

- `AGENTS.md`: concise runtime guardrails and pointers used by all harnesses.
- `docs/AGENT_WORKFLOW.md`: detailed canonical workflow, risk matrix, and conflict rules.
- `GEMINI.md`: Gemini-host adapter only; it must point to `AGENTS.md` and canonical docs rather than duplicate them.
- `docs/PHASE_PROGRESS.md`: historical phase record; read only for history/status tasks.

Do not change the source-of-truth matrix or weaken its conflict handling.

**Verify**: `rg -n "Document Ownership|AGENTS.md|GEMINI.md|PHASE_PROGRESS" docs/AGENT_WORKFLOW.md` shows the ownership section.

### Step 2: Convert `GEMINI.md` into a pointer file

Replace duplicated rules and phase history with a short adapter, following the pointer pattern already used by root `DESIGN.md`. It must:

1. Tell Gemini-hosted agents to read `AGENTS.md` and `docs/AGENT_WORKFLOW.md`.
2. State that host tools are capability-dependent; unavailable `Task`, ECC, MCP, or subagent tools must not be invented.
3. Point phase-history readers to `docs/PHASE_PROGRESS.md`.
4. Point design work to `docs/design.md`.
5. Contain no duplicated model registry, route inventory, phase list, or test matrix.

**Verify**: `wc -l GEMINI.md` reports at most 40 lines, and the stale-tool check has no matches.

### Step 3: Remove redundant operational prose from `AGENTS.md`

Keep high-salience project guardrails in `AGENTS.md`, but replace repeated workflow sequences and long explanatory copies with links to `docs/AGENT_WORKFLOW.md`. Correct installed skill names:

- `thermo-nuclear`, not `thermo-nuclear-code-quality-review`.
- Explain that the harness loads an available skill according to host capability; do not prescribe nonexistent `skill_view`.

Preserve backend-first architecture, Supabase/RLS safety, AI usage logging, Hono RPC, test hygiene, and docs scope restrictions.

**Verify**: stale-tool check returns no matches; `rg -n "Backend-First|RLS|AI usage|Hono RPC|Test Hygiene" AGENTS.md` confirms critical rules remain.

### Step 4: Refresh the docs index

Update `docs/README.md` so contributors know which instruction document to read and that `GEMINI.md` is only a host adapter. Do not add another duplicated workflow summary.

**Verify**: `rg -n "AGENTS.md|AGENT_WORKFLOW.md|GEMINI.md" docs/README.md` finds one clear navigation entry for each.

### Step 5: Run documentation checks

Run the format, size, stale-tool, and diff-hygiene commands from the command table.

**Verify**: all commands exit 0 and no out-of-scope file appears in `git diff --name-only` for this plan's work.

## Test plan

No product test is required because this is instruction/documentation-only. Verification is structural:

- host-specific stale tool names are absent;
- critical safety and architecture terms remain;
- `GEMINI.md` is a short pointer;
- Prettier and `git diff --check` pass.

## Done criteria

- [ ] `GEMINI.md` is at most 40 lines and contains no phase history.
- [ ] `AGENTS.md` uses installed Pi skill names and no nonexistent `skill_view` instruction.
- [ ] `docs/AGENT_WORKFLOW.md` declares document ownership.
- [ ] Auth/RLS/secrets, backend-first, Hono RPC, AI usage logging, and test-hygiene rules remain represented.
- [ ] All commands in the command table pass.
- [ ] Only in-scope files are modified by this plan.
- [ ] `plans/README.md` marks Plan 013 DONE after execution.

## STOP conditions

Stop and report if:

- A higher-priority runtime instruction requires `GEMINI.md` to contain full duplicated rules.
- The installed skill names differ from the ones verified in `~/.pi/agent/skills/`.
- Removing duplicated text would remove the only copy of an active security, architecture, or deployment contract.
- In-scope files have materially drifted from the canonical-role strategy described above.

## Maintenance notes

New workflow rules should be added once to `docs/AGENT_WORKFLOW.md`, with only high-salience summaries in `AGENTS.md`. Never append phase completion history to runtime instruction files. Reviewers should reject future copies of test matrices, route inventories, or model lists in `GEMINI.md`.
