#!/usr/bin/env bash
# PreToolUse Bash: Git hooks (the changelog pre-commit) must not be skipped
# (docs/AGENT_WORKFLOW.md §4, "Never bypass the hook with --no-verify").
source "$(dirname "$0")/lib.sh"
cmd=$(jq -r '.tool_input.command // empty')
[[ "$cmd" == *git* ]] || exit 0

# Look only at the first line, with quoted text removed, so a commit message
# or heredoc body that merely mentions these flags does not trip the guard.
line=$(head -n 1 <<<"$cmd" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")

reason="Git hooks must not be skipped (AGENTS.md changelog gate). Fix what the hook reports instead."
re_git='(^|[;&|(`[:space:]])git[[:space:]]'
[[ "$line" =~ $re_git ]] || exit 0

re_noverify='[[:space:]]--no-verify([[:space:]=]|$)'
re_hookspath='-c[[:space:]]*core\.hooks[Pp]ath='
re_commit_n='git([[:space:]]+-c[[:space:]]+[^[:space:]]+)*[[:space:]]+commit([[:space:]]+[^;&|]*)?[[:space:]]-[a-zA-Z]*n[a-zA-Z]*([[:space:]]|$)'
[[ "$line" =~ $re_noverify ]] && deny "$reason"
[[ "$line" =~ $re_hookspath ]] && deny "$reason"
[[ "$line" =~ $re_commit_n ]] && deny "$reason"
exit 0
