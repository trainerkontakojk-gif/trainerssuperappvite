#!/usr/bin/env bash
# PostToolUse Write|Edit: prettier the touched file, but only if it is new or
# was already prettier-clean at HEAD. Most legacy files are not, and formatting
# them would bury the real change in a whole-file reformat.
f=$(jq -r '.tool_response.filePath // .tool_input.file_path // empty')
case "$f" in *.ts | *.tsx | *.md) ;; *) exit 0 ;; esac
[[ -f "$f" ]] || exit 0
root="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$f")" rev-parse --show-toplevel)}"
prettier="$root/node_modules/.bin/prettier"
[[ -x "$prettier" ]] || exit 0
rel=$(git -C "$root" ls-files --full-name -- "$f" 2>/dev/null)
if [[ -n "$rel" ]]; then
  git -C "$root" show "HEAD:$rel" 2>/dev/null |
    "$prettier" --check --stdin-filepath "$f" >/dev/null 2>&1 || exit 0
fi
"$prettier" --write --log-level warn "$f" >/dev/null 2>&1
exit 0
