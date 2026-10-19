#!/usr/bin/env bash
# Codex Cloud — maintenance script (dijalankan saat container cache di-resume).
# Secrets TIDAK tersedia di fase ini, jadi jangan menulis token apa pun di sini.
# Tugasnya cuma menyelaraskan dependency + link dengan commit/branch terbaru.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '[codex-maint] %s\n' "$*"; }

corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@12.9.1 --activate >/dev/null 2>&1 || true

log "pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

if [ ! -f .env ]; then
  printf '[codex-maint] WARN: .env tidak ada — jalankan Reset cache / environment setup ulang\n' >&2
fi

if [ -n "${RAILWAY_PROJECT_ID:-}" ] && { [ -n "${RAILWAY_TOKEN:-}" ] || [ -n "${RAILWAY_API_TOKEN:-}" ]; }; then
  railway link --project "$RAILWAY_PROJECT_ID" \
    ${RAILWAY_ENVIRONMENT:+--environment "$RAILWAY_ENVIRONMENT"} \
    ${RAILWAY_SERVICE:+--service "$RAILWAY_SERVICE"} >/dev/null 2>&1 \
    && log "railway: relinked" || log "railway: link dilewati (token tidak tersedia di fase maintenance)"
fi

log "maintenance selesai"
