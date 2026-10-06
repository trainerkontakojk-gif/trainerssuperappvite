# CLAUDE.md — Claude Code project adapter

@AGENTS.md

Keep this file as an adapter only. Do not duplicate project policy here; update `AGENTS.md` instead.

## Claude Code host capabilities

Workflow tools named in `docs/AGENT_WORKFLOW.md` map to these Claude Code capabilities:

- `trainers-superapp-tdd`, `thermo-nuclear`, `ui-ux-pro-max`, `graphify`, `context7` — project skills in `.claude/skills/` (invoke with the Skill tool).
- `impeccable` — user-level skill; Supabase — the connected Supabase MCP (conditional on task need).
- Context7 MCP — registered in `.mcp.json`; Graphify — local `graphify` CLI via Bash.
