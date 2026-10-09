#!/usr/bin/env bash
# PreToolUse Bash: Fajar's Mac can only take one Playwright run at a time.
source "$(dirname "$0")/lib.sh"
cmd=$(jq -r '.tool_input.command // empty')
re='playwright[[:space:]]+test|test:e2e'
[[ "$cmd" =~ $re ]] || exit 0
running=$(pgrep -fl 'node.*playwright.*test' 2>/dev/null | head -3)
if [[ -n "$running" ]]; then
  deny "Another Playwright run is already active; wait for it to finish (one test run at a time). Running: $running"
fi
exit 0
