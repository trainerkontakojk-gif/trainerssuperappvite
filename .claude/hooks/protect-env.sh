#!/usr/bin/env bash
# PreToolUse Edit|Write|NotebookEdit: never let the agent write real env files.
source "$(dirname "$0")/lib.sh"
f=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
b=$(basename "$f")
case "$b" in
  .env.example) exit 0 ;;
  .env | .env.*) deny "$b holds real secrets; edit it yourself. Agents may only change .env.example." ;;
esac
exit 0
