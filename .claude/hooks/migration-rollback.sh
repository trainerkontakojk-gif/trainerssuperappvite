#!/usr/bin/env bash
# PostToolUse Write|Edit: every new migration needs its paired rollback file.
source "$(dirname "$0")/lib.sh"
f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
[[ "$f" == */supabase/migrations/*.sql ]] || exit 0
rb="$(dirname "$(dirname "$f")")/rollbacks/rollback_$(basename "$f")"
[[ -f "$rb" ]] && exit 0
note "Migration $(basename "$f") has no rollback yet. Create supabase/rollbacks/rollback_$(basename "$f")."
