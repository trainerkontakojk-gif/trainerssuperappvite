#!/usr/bin/env bash
# PreToolUse Bash + remote-mutating MCP tools: production and outward actions
# need an explicit user decision (AGENTS.md: no commit/push/deploy/migrate
# without authorization).
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
if [[ "$cmd" =~ $re_push ]]; then ask "git push publishes to the remote; needs Fajar's explicit OK."; fi
if [[ "$cmd" =~ $re_db ]]; then ask "Supabase CLI command that changes a remote/linked database; needs Fajar's explicit OK."; fi
if [[ "$cmd" =~ $re_vercel ]]; then ask "Vercel deploy/env change; needs Fajar's explicit OK."; fi
exit 0
