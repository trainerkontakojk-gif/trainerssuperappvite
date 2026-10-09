# CLAUDE.md — Claude Code project adapter

@AGENTS.md

Keep this file as an adapter only. Do not duplicate project policy here; update `AGENTS.md` instead.

## Claude Code host capabilities

Workflow tools named in `docs/AGENT_WORKFLOW.md` map to these Claude Code capabilities:

- `trainers-superapp-tdd`, `thermo-nuclear`, `ui-ux-pro-max`, `graphify`, `context7` — project skills in `.claude/skills/` (invoke with the Skill tool).
- `impeccable` — user-level skill; Supabase — the connected Supabase MCP (conditional on task need).
- Context7 MCP — registered in `.mcp.json`; Graphify — local `graphify` CLI via Bash.
- `supabase-migration` and `pr-ready` — project skills that sequence the migration and pre-PR gates; they defer to `docs/AGENT_WORKFLOW.md`.

## Claude Code hooks

`.claude/settings.json` wires the scripts in `.claude/hooks/` to enforce `AGENTS.md` guardrails mechanically:

- `protect-env.sh` blocks agent edits to `.env*` files except `.env.example`.
- `guard-remote.sh` asks before `git push`, remote Supabase CLI commands, Vercel deploys, and remote-mutating Supabase/Vercel MCP calls. It blocks MCP calls aimed at the production project ref.
- `one-test-run.sh` refuses a second concurrent Playwright run.
- `block-superpowers.sh` refuses `superpowers:*` skills.
- `format-changed.sh` runs Prettier on a touched `.ts`/`.tsx`/`.md` file only when that file is new or was already Prettier-clean, so legacy files are not reformatted wholesale.
- `migration-rollback.sh` warns when a migration has no `supabase/rollbacks/rollback_<name>.sql`; CI enforces the same rule for new migrations.
