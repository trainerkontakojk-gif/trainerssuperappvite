#!/usr/bin/env bash
# PreToolUse Bash + remote-mutating MCP tools: production and outward actions
# need an explicit user decision.
#
# Owner pre-authorization (Fajar): git push/commit/merge to THIS repo's own
# remote and local terminal work run unattended — the push branch below logs
# instead of asking. Production targets (remote Supabase, Vercel deploys,
# the prod project ref, remote-mutating MCP calls) still ask.
source "$(dirname "$0")/lib.sh"
PROD_REF="ruosnjmtywcrghjgqugz"
input=$(cat)
tool=$(jq -r '.tool_name' <<<"$input")

if [[ "$tool" == mcp__* ]]; then
  if [[ "$input" == *"$PROD_REF"* ]]; then
    deny "Targets the production Supabase project ($PROD_REF). Production changes are done by Fajar, not the agent."
  fi
  ask "Remote-mutating MCP call ($tool). Confirm the target is not production and that this change is authorized."
fi

cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
if [[ "$cmd" == *"$PROD_REF"* ]]; then
  ask "Command references the production Supabase project ($PROD_REF); confirm it is read-only or authorized."
fi
re_push='(^|[;&|[:space:]])git[[:space:]]+push([[:space:]]|$)'
re_db='supabase[[:space:]]+(db[[:space:]]+push|migration[[:space:]]+(repair|up)|link)'
re_vercel='vercel[[:space:]]+(deploy|--prod|promote|rollback|env[[:space:]]+(add|rm))|vercel[[:space:]].*--prod'
if [[ "$cmd" =~ $re_push ]]; then
  # Pre-authorized: audit line instead of a prompt. Pushes to deploy-named
  # branches and anything carrying a release payload are still judged by the
  # auto-mode classifier on their own content.
  mkdir -p "$HOME/.claude/logs" 2>/dev/null
  printf '%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "${CLAUDE_PROJECT_DIR:-$PWD}" "$cmd" \
    >> "$HOME/.claude/logs/git-push-audit.log" 2>/dev/null
  exit 0
fi
if [[ "$cmd" =~ $re_db ]]; then ask "Supabase CLI command that changes a remote/linked database; needs Fajar's explicit OK."; fi
if [[ "$cmd" =~ $re_vercel ]]; then ask "Vercel deploy/env change; needs Fajar's explicit OK."; fi
exit 0
