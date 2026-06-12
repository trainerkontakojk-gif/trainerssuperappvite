#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────────────────────────────────────────
# Bootstrap script for Supabase local integration tests
# Usage: bash scripts/integration/supabase-bootstrap.sh
# ───────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
echo "ℹ️  Working directory: $SCRIPT_DIR"
cd "$SCRIPT_DIR"

# 1. Prerequisite check: Docker
if ! command -v docker &>/dev/null; then
  echo "❌ Docker is not installed. Install Docker Desktop: https://docs.docker.com/desktop/"
  exit 1
fi

# 2. Check Docker is running
if ! docker info &>/dev/null; then
  echo "❌ Docker daemon is not running. Please start Docker Desktop and try again."
  exit 1
fi

# 3. Prerequisite check: Supabase CLI
if ! command -v supabase &>/dev/null; then
  echo "❌ Supabase CLI is not installed."
  echo "   Install: brew install supabase/tap/supabase"
  echo "   Or:     npm install -g supabase"
  exit 1
fi

# 4. Start this project's Supabase stack.
echo "ℹ️  Starting Supabase (excluding storage-api for test stability)..."
supabase start -x storage-api,imgproxy 2>&1

# 5. Replay every migration and configured seed from a clean database.
echo "ℹ️  Resetting local database from migrations..."
supabase db reset --local 2>&1

# 6. Export environment variables for integration tests.
echo "ℹ️  Exporting Supabase environment variables..."
eval "$(supabase status -o env 2>/dev/null)"

# 7. Fail instead of silently writing unusable credentials.
: "${API_URL:?supabase status did not return API_URL}"
: "${ANON_KEY:?supabase status did not return ANON_KEY}"
: "${SERVICE_ROLE_KEY:?supabase status did not return SERVICE_ROLE_KEY}"
: "${DB_URL:?supabase status did not return DB_URL}"

# 8. Write .env.integration file for test loading.
cat > "$SCRIPT_DIR/apps/api/.env.integration" <<EOF
SUPABASE_URL=${API_URL}
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
SUPABASE_DB_URL=${DB_URL}
EOF

echo "✅ Supabase bootstrap complete!"
echo "   API URL:      ${API_URL}"
echo "   DB URL:       ${DB_URL}"
echo "   Env file:     apps/api/.env.integration"
