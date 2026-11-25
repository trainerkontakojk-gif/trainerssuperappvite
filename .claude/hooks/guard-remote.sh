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

# A production execute_sql may reach Fajar's approval only when it is one
# SELECT/WITH statement with no write, DDL, transaction, session, or known
# side-effect function keyword anywhere (string literals and comments
# included, so a match there errs toward deny). Leading "--" comment lines are
# ignored; any other text before the statement is not.
is_read_only_sql() {
  local sql
  sql=$(printf '%s\n' "$1" | awk 'started || !/^[[:space:]]*(--.*)?$/ { started = 1; print }' |
    tr '[:upper:]' '[:lower:]')
  sql=$(printf '%s' "$sql" | sed -E -e ':a' -e '$!{N;ba' -e '}' -e 's/[[:space:]]*;?[[:space:]]*$//')
  [[ "$sql" =~ ^[[:space:]]*(select|with)([^a-z0-9_]|$) ]] || return 1
  [[ "$sql" == *";"* ]] && return 1
  local write='insert|update|delete|merge|upsert|truncate|drop|alter|create|grant|revoke|copy|call|do|vacuum|analyze|refresh|lock|set|reset|comment|reindex|cluster|listen|unlisten|notify|prepare|execute|deallocate|discard|import|security|begin|commit|rollback|savepoint|into|nextval|setval|set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_advisory[a-z_]*|pg_read[a-z_]*|pg_ls[a-z_]*|pg_sleep|lo_[a-z_]+|dblink[a-z_]*'
  ! printf '%s' "$sql" | grep -Eq "(^|[^a-z0-9_])($write)([^a-z0-9_]|$)"
}
input=$(cat)
tool=$(jq -r '.tool_name' <<<"$input")

if [[ "$tool" == mcp__* ]]; then
  if [[ "$input" == *"$PROD_REF"* ]]; then
    if [[ "$tool" == *__execute_sql ]] &&
      is_read_only_sql "$(jq -r '.tool_input.query // empty' <<<"$input")"; then
      ask "Read-only query on the production Supabase project ($PROD_REF). Fajar approves each one: check that it only reads and calls no function with side effects."
    fi
    deny "Targets the production Supabase project ($PROD_REF). Production changes are done by Fajar, not the agent. Only a single SELECT/WITH execute_sql query may be proposed for approval."
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
