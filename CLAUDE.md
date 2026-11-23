# CLAUDE.md — Claude Code project adapter

@AGENTS.md

Keep this file as an adapter only. Do not duplicate project policy here; update `AGENTS.md` instead.

## Claude Code host capabilities

Workflow tools named in `docs/AGENT_WORKFLOW.md` map to these Claude Code capabilities:

- `trainers-superapp-tdd`, `thermo-nuclear`, `ui-ux-pro-max`, `graphify`, `context7` — project skills in `.claude/skills/` (invoke with the Skill tool).
- `impeccable` — user-level skill; Supabase — the connected Supabase MCP (conditional on task need).
- Context7 MCP — registered in `.mcp.json`; Graphify — local `graphify` CLI via Bash.
- `supabase-migration` and `push-ready` — project skills that sequence the migration and pre-push gates; they defer to `docs/AGENT_WORKFLOW.md`.
- `verify` — project skill that runs the changed surface through its focused local E2E, checks the screenshot or log, and writes the `Verified:` trailer; `push-ready` calls it.

## Claude Code hooks

`.claude/settings.json` wires `.claude/hooks/*.sh` (and `.githooks/` for Git) to enforce `AGENTS.md` guardrails mechanically; each hook explains itself when it blocks. `git config trainers.verifyGate` selects `off`, `observe` (default, warns and logs), or `enforce` (blocks) for the `Verified:` trailer check.
