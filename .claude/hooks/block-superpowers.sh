#!/usr/bin/env bash
# PreToolUse Skill: superpowers skills are disabled for this project (AGENTS.md).
source "$(dirname "$0")/lib.sh"
s=$(jq -r '.tool_input.skill // empty')
[[ "$s" == superpowers:* ]] && deny "superpowers:* skills are disabled in this project (AGENTS.md). Use trainers-superapp-tdd instead."
exit 0
