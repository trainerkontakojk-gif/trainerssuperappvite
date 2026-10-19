#!/usr/bin/env bash
# Codex Cloud — setup script (fase SETUP, satu-satunya fase yang dapat Secrets).
#
# Pasang di Codex environment editor:
#   Setup script       : bash scripts/codex-cloud-setup.sh
#   Maintenance script : bash scripts/codex-cloud-maintenance.sh
#
# Yang dilakukan:
#   1. Pasang pnpm (versi dari package.json packageManager) + CLI supabase/vercel/railway
#   2. pnpm install --frozen-lockfile
#   3. Render .env + .env.local dari Environment Variables + Secrets
#   4. Salin token ke ~/.codex-cloud-env.sh (0600) yang di-source ~/.bashrc & ~/.profile,
#      supaya token tetap hidup di fase AGENT (Secrets dihapus sebelum agen mulai)
#   5. Login CLI: supabase (token), railway (link best-effort), vercel (token env)
#
# Flags:
#   SKIP_INSTALL=1        lewati langkah instalasi (untuk uji lokal)
#   CODEX_CLOUD_FORCE=1   izinkan overwrite .env yang sudah ada (default: tolak)
#   SKIP_CLI_LOGIN=1      jangan jalankan login/link (offline test)
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '[codex-setup] %s\n' "$*"; }
warn() { printf '[codex-setup] WARN: %s\n' "$*" >&2; }

SKIP_INSTALL="${SKIP_INSTALL:-0}"
SKIP_CLI_LOGIN="${SKIP_CLI_LOGIN:-0}"

# --- Guard: jangan menimpa .env lokal di mesin Fajar -------------------------
if [ -f .env ] && [ "${CODEX_CLOUD_FORCE:-0}" != "1" ]; then
  warn ".env sudah ada dan CODEX_CLOUD_FORCE!=1 — berhenti supaya .env lokal tidak tertimpa."
  warn "Di container Codex cloud file ini tidak ada, jadi guard ini normalnya tidak aktif."
  exit 1
fi

# --- 1. Toolchain ------------------------------------------------------------
if [ "$SKIP_INSTALL" != "1" ]; then
  if [ -f .node-version ] && command -v fnm >/dev/null 2>&1; then
    fnm use --install-if-missing "$(cat .node-version)" >/dev/null 2>&1 || true
  fi

  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@12.9.1 --activate >/dev/null

  missing=0
  for bin in supabase vercel railway; do
    command -v "$bin" >/dev/null 2>&1 || missing=1
  done
  if [ "$missing" = "1" ]; then
    log "install CLI: supabase, vercel, @railway/cli"
    npm install -g --no-fund --no-audit supabase vercel @railway/cli
  fi
fi

# --- 2. Dependencies --------------------------------------------------------
if [ "$SKIP_INSTALL" != "1" ]; then
  log "pnpm install --frozen-lockfile"
  pnpm install --frozen-lockfile
fi

# --- 3. Render .env / .env.local -------------------------------------------
# Key diambil dari .env.example (urutan & komentar dipertahankan). Nilai diambil
# dari environment bila ada; kalau tidak ada, placeholder example dipakai.
python3 - <<'PY'
import os, re, sys

example = ".env.example"
missing = []

def value_for(line: str) -> str:
    m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=", line)
    if not m:
        return line
    key = m.group(1)
    val = os.environ.get(key)
    if val is None or val == "":
        missing.append(key)
        return line
    escaped = val.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'{key}="{escaped}"'

with open(example, encoding="utf-8") as fh:
    lines = [value_for(l.rstrip("\n")) for l in fh]

content = "\n".join(lines) + "\n"
for path in (".env", ".env.local"):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(content)
    os.chmod(path, 0o600)

print(f"[codex-setup] .env + .env.local ditulis ({len(lines)} baris)")
if missing:
    print("[codex-setup] belum diisi (pakai placeholder .env.example): " + ", ".join(missing))
PY

# --- 4. Token untuk fase AGENT ---------------------------------------------
# Secrets hilang sebelum agen mulai. File 0600 di $HOME ini adalah jembatannya.
PERSIST="$HOME/.codex-cloud-env.sh"
umask 077
: > "$PERSIST"
PERSIST_KEYS="
SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD
VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY VITE_APP_URL VITE_TELEFUN_WS_URL
VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID
RAILWAY_API_TOKEN RAILWAY_TOKEN RAILWAY_PROJECT_ID RAILWAY_ENVIRONMENT RAILWAY_SERVICE
GEMINI_API_KEY OPENAI_API_KEY OPENROUTER_API_KEY DEEPSEEK_API_KEY CONTEXT7_API_KEY
TELEFUN_INTERNAL_URL TELEFUN_INTERNAL_TOKEN
"
persisted=""
for key in $PERSIST_KEYS; do
  val="${!key:-}"
  if [ -n "$val" ]; then
    printf 'export %s=%q\n' "$key" "$val" >> "$PERSIST"
    persisted="$persisted $key"
  fi
done
chmod 600 "$PERSIST"
{
  echo 'export RAILWAY_CLI_NO_UPDATE_CHECK=1'
  echo 'export VERCEL_TELEMETRY_DISABLED=1'
  echo 'export SUPABASE_TELEMETRY_DISABLED=1'
} >> "$PERSIST"

prepend_line() {
  local file="$1" line="$2" tmp
  tmp="$(mktemp)"
  { printf '%s\n' "$line"; cat "$file"; } > "$tmp"
  cat "$tmp" > "$file"   # tulis balik, inode & permission tetap
  rm -f "$tmp"
}

for rc in "$HOME/.bashrc" "$HOME/.profile"; do
  [ -f "$rc" ] || : > "$rc"
  grep -q 'codex-cloud-env.sh' "$rc" 2>/dev/null || \
    prepend_line "$rc" '[ -f "$HOME/.codex-cloud-env.sh" ] && . "$HOME/.codex-cloud-env.sh"'
done
log "token dipublikasikan ke fase agent:$persisted"

# --- 5. Login CLI ----------------------------------------------------------
if [ "$SKIP_CLI_LOGIN" != "1" ] && [ "$SKIP_INSTALL" != "1" ]; then
  if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
    if supabase login --token "$SUPABASE_ACCESS_TOKEN" --name codex-cloud >/dev/null 2>&1; then
      log "supabase: login OK (access token)"
    else
      warn "supabase login gagal (cek token / network allowlist api.supabase.com)"
    fi
  else
    warn "SUPABASE_ACCESS_TOKEN kosong — supabase CLI belum terautentikasi"
  fi

  if [ -n "${RAILWAY_TOKEN:-}" ] || [ -n "${RAILWAY_API_TOKEN:-}" ]; then
    if [ -n "${RAILWAY_PROJECT_ID:-}" ]; then
      railway link --project "$RAILWAY_PROJECT_ID" \
        ${RAILWAY_ENVIRONMENT:+--environment "$RAILWAY_ENVIRONMENT"} \
        ${RAILWAY_SERVICE:+--service "$RAILWAY_SERVICE"} >/dev/null 2>&1 \
        && log "railway: linked $RAILWAY_PROJECT_ID" \
        || warn "railway link gagal (project token mungkin butuh RAILWAY_API_TOKEN account-scope)"
    else
      log "railway: token ada, RAILWAY_PROJECT_ID tidak di-set (skip link)"
    fi
  else
    warn "RAILWAY_TOKEN / RAILWAY_API_TOKEN kosong — railway CLI belum terautentikasi"
  fi

  if [ -n "${VERCEL_TOKEN:-}" ] && [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
    if vercel whoami --token "$VERCEL_TOKEN" >/dev/null 2>&1; then
      log "vercel: token valid (whoami OK)"
    else
      warn "vercel whoami gagal (cek token / allowlist api.vercel.com)"
    fi
  else
    warn "VERCEL_TOKEN / VERCEL_ORG_ID / VERCEL_PROJECT_ID belum lengkap"
  fi
fi

log "setup selesai"
