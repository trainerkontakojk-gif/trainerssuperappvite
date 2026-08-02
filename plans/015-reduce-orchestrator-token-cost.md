# Plan 015: Enforce cost-aware orchestrator routing and run-family gate budgets

> **Executor instructions**: This plan changes a user-level Pi skill outside the repository. Confirm the operator still authorizes that scope before editing. Follow each step and stop on any STOP condition. Update `plans/README.md` after completion.
>
> **Drift check (run first)**: `git diff --stat e356c91..HEAD -- AGENTS.md`
> Also compare `~/.pi/agent/skills/orchestrator-mode/SKILL.md` with the excerpts below. Because the skill is outside Git, use `shasum -a 256` before editing and record the hash in your report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — undersized models or overly strict worker caps can reduce implementation quality on complex tasks
- **Depends on**: `plans/013-canonicalize-agent-instructions.md`
- **Category**: perf, dx
- **Planned at**: commit `e356c91`, 2026-08-01

## Why this matters

The orchestrator skill labels routing as cost-aware but currently sends every worker to `gpt-5.6-luna` with `max` thinking, including discovery, status, and documentation workers. Existing artifacts contain roughly 93K words, six separate Telefun P4 run directories, and follow-up status/audit/fix runs that bypass the intended two-round gate budget. Model/reasoning tiering and a run-family budget should reduce delegated token use while preserving maximum reasoning for architecture, security, and difficult repairs.

## Current state

`~/.pi/agent/skills/orchestrator-mode/SKILL.md:37-39`:

```md
| All tasks | `openai-codex/gpt-5.6-luna` | All delegated tasks ... |
Use `gpt-5.6-luna` with `max` thinking for all delegated tasks.
```

Other relevant rules:

- Line 27 allows approximately 15 workers per run.
- Line 29 notes workers normally cold-start with no shared context.
- Line 14 prohibits orchestrator implementation.
- Line 76 later allows the orchestrator to fix a trivial issue, contradicting the role boundary.
- Current workspace has six `.pi/orchestrator/*telefun-p4*` directories and multiple `direct-fix`, `audit-fix`, `status`, and `f6-fix` follow-ups.

Preserve these good controls:

- orchestrator-mode remains explicit opt-in;
- one-worker tasks stay in the main session;
- contract-first for cross-boundary work;
- maximum three parallel implementation workers;
- workers receive exact file ownership and verification commands;
- summaries are untrusted until independently verified.

## Commands you will need

| Purpose               | Command                                                                                                                                 | Expected on success                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Model inventory       | `pi --list-models openai-codex`                                                                                                         | exit 0; available model IDs listed |
| Skill backup evidence | `shasum -a 256 ~/.pi/agent/skills/orchestrator-mode/SKILL.md`                                                                           | one hash recorded before editing   |
| Contradiction check   | `rg -n "All tasks\|max.*all delegated\|orchestrator may fix\|≤ ~15" ~/.pi/agent/skills/orchestrator-mode/SKILL.md`                      | no obsolete policy matches         |
| Core-rule check       | `rg -n "explicit opt-in\|Contract-first\|at most 3\|do not implement\|run family\|max 2" ~/.pi/agent/skills/orchestrator-mode/SKILL.md` | preserved/added rules found        |
| Format                | `pnpm exec prettier --check AGENTS.md plans/README.md`                                                                                  | exit 0                             |

## Scope

**In scope**:

- `/Users/nadindyta/.pi/agent/skills/orchestrator-mode/SKILL.md`
- `AGENTS.md` only if its orchestrator summary must align with the revised skill
- `plans/README.md`

**Out of scope**:

- Any other global skill
- Pi source code or npm installation files
- Product code, tests, package config, migrations
- Starting worker sessions to test the policy
- Deleting existing orchestration artifacts
- Hardcoding a cheaper model that `pi --list-models` does not confirm

## Git workflow

The global skill is outside the repository and cannot be protected by the repo's Git history. Record its pre-edit SHA-256 and include a minimal diff in the final report. Do not commit or push repository files unless explicitly requested.

## Steps

### Step 1: Verify available routing options

Run `pi --list-models openai-codex`. Build a routing table only from models actually listed. If there is no cheaper model, retain Luna but vary thinking level:

- low/medium reasoning: inventory, status, mechanical docs, focused test execution;
- high reasoning: bounded implementation with established contracts;
- max reasoning: contract architecture, security review, material cross-module repair.

Never lower reasoning solely for auth/RLS, security, schema, migration, billing, or public-contract decisions.

**Verify**: run notes in the skill explain fallback behavior when only Luna is available.

### Step 2: Replace all-Luna/max routing with capability-based routing

Rewrite the routing section so each worker records task class, selected verified model, and reasoning level. The cheapest verified capable route should be the default for low-risk tasks; Luna/max is reserved for critical work.

Remove stale references to a Mini escalation path unless a specific Mini model exists in the verified routing table.

**Verify**: contradiction check no longer finds the all-tasks/max policy.

### Step 3: Enforce a hard worker budget

Set the normal run-family maximum to eight workers, including contract, discovery, implementation, audit, repair, and final gate. Recommended shape:

1. optional contract/discovery worker;
2. at most three implementation workers;
3. one review worker;
4. one bundled repair worker;
5. one final re-gate worker;
6. one contingency slot.

Exceeding eight requires stopping and asking the user, not opening another run silently.

**Verify**: `rg -n "eight\|8 workers\|user approval\|contingency" ~/.pi/agent/skills/orchestrator-mode/SKILL.md` finds the hard budget.

### Step 4: Apply gate budget to a run family

Define a stable feature/run-family ID. Audit, repair, status, and final verification for the same feature must remain under that run family. Creating a new timestamped directory does not reset:

- worker count;
- two-round quality-gate budget;
- prior findings list;
- ownership constraints.

Status checks should be performed by the orchestrator reading logs and diffs, not by spawning a status-only worker.

**Verify**: core-rule check finds `run family` and `max 2` language.

### Step 5: Resolve the role contradiction and improve context reuse

Remove the permission for the orchestrator to make trivial implementation fixes. A repair must remain with a worker or the orchestrator must exit orchestrator-mode explicitly and report the role transition before editing.

Allow session continuation for a strict same-owner repair by default when prior context was verified, rather than cold-starting a new worker. Keep fresh sessions for independent review.

**Verify**: contradiction check has no `orchestrator may fix` match; role-boundary language remains.

### Step 6: Align the repository summary

If Plan 013 leaves an orchestrator summary in `AGENTS.md`, ensure it points to the global skill and states only: explicit opt-in, threshold, contract-first, low parallelism, and run-family budget. Do not duplicate the full skill.

**Verify**: Prettier passes and the repo diff touches no product files.

## Test plan

This is a policy-only change. Verify with static checks:

- no all-task max routing remains;
- no unverified model ID is introduced;
- hard worker and run-family gate budgets exist;
- role boundary is internally consistent;
- explicit opt-in and contract-first remain.

Do not spawn paid worker sessions solely to test documentation.

## Done criteria

- [ ] Global skill pre-edit hash is recorded.
- [ ] Routing varies by complexity and verified model availability.
- [ ] Luna/max is limited to high/critical work.
- [ ] Normal run-family worker budget is at most eight.
- [ ] New timestamps cannot reset gate budgets.
- [ ] Status-only workers are prohibited.
- [ ] Orchestrator role contradiction is removed.
- [ ] Repository summary, if changed, remains concise.

## STOP conditions

Stop if:

- The operator does not explicitly authorize editing the user-level skill.
- `pi --list-models openai-codex` fails or no model inventory can be verified.
- The skill has materially changed since this plan was written.
- A proposed low-cost route would handle security, auth/RLS, migration, billing, or unresolved architecture.
- Implementing enforcement requires changes to Pi source code rather than policy text.

## Maintenance notes

Review actual token/time results after three orchestrated runs. If low-cost workers trigger more repair rounds, raise that task class's default reasoning level rather than reverting all workers to max. Gate budgets must be tracked by feature identity, not directory name.
