# Codex Cloud — environment setup

How the Codex cloud container connects to Supabase, Vercel, and Railway. Companion to
[`AGENTS.md`](../AGENTS.md); the production-authorization rules there still apply
(`--prod` deploy, Railway prod, remote Supabase mutations stay gated on Fajar's approval).

## Mental model (why the scripts exist)

Codex cloud runs a repo checkout in an ephemeral container in three phases:

| Phase | Internet | Env Variables | Secrets | What it means here |
|---|---|---|---|---|
| Setup (once per cache build) | on | ✅ | ✅ | Only phase that can see `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `RAILWAY_*_TOKEN` |
| Agent (the actual task) | off by default, configurable | ✅ | ❌ removed | CLI must already be authenticated, or read tokens from a file written in setup |
| Maintenance (cache resumed) | on | ✅ | ❌ removed | Only dependency refresh — never write tokens here |

So: **secrets are consumed in setup and published into `~/.codex-cloud-env.sh` (mode 0600)**,
sourced by `~/.bashrc` and `~/.profile` so the agent phase still has them. `.env` and
`.env.local` are rendered in setup for the same reason.

## 1. Codex environment editor

Repo → Codex settings → Environments → the environment for this repo.

| Field | Value |
|---|---|
| Setup script | `bash scripts/codex-cloud-setup.sh` |
| Maintenance script | `bash scripts/codex-cloud-maintenance.sh` |
| Agent internet access | On + allowlist (below) |
| Package versions | Node 22 (matches `.node-version`) |

### Environment Variables (available in setup **and** agent)

Non-secret values only.

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_APP_URL=http://localhost:3005
VERCEL_ORG_ID=team_M0xzVcpFj7WE93vf6SyD2k3K
VERCEL_PROJECT_ID=prj_j8vMICu9f2rVDUOq3rEBXBoHbD13
RAILWAY_PROJECT_ID=<railway project id>
RAILWAY_ENVIRONMENT=staging
RAILWAY_SERVICE=<service name>
```

### Secrets (setup phase only — the script republishes them)

| Secret | Where to get it | Scope to use |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | dashboard.supabase.com → Account → Access Tokens | personal; read/manage projects |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database | required by `supabase link` / `db push` |
| `VERCEL_TOKEN` | vercel.com/account/tokens | scope to the Trainers team, short expiry |
| `RAILWAY_API_TOKEN` | Railway → Account Settings → Tokens | account/workspace scope, can `link` |
| `RAILWAY_TOKEN` | Railway → Project Settings → Tokens | project scope, cannot `link` |

`RAILWAY_TOKEN` and `RAILWAY_API_TOKEN` are mutually exclusive — the CLI errors if both are set.
Use `RAILWAY_API_TOKEN` when the task needs `railway link` / multi-project work; use
`RAILWAY_TOKEN` for a single project.

Optional, only if the task truly needs them: `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
`OPENAI_API_KEY`, `CONTEXT7_API_KEY`. Anything prefixed `VITE_` is bundled into the browser
build — never put a service-role key or model key behind a `VITE_` name.

> Security note: any token the agent phase can read is a token a prompt-injected agent could
> exfiltrate. Prefer read-only/team-scoped tokens, keep agent network on an allowlist, and
> rotate after experimenting. `SUPABASE_SERVICE_ROLE_KEY` is absent by default for this reason.

## 2. Agent network allowlist

Without these domains the CLIs fail even with valid tokens.

```
api.supabase.com
*.supabase.co
*.supabase.com
api.vercel.com
vercel.com
backboard.railway.com
railway.com
*.up.railway.app
registry.npmjs.org
nodejs.org
github.com
codeload.github.com
objects.githubusercontent.com
```

Direct Postgres (`db.<ref>.supabase.co:5432` / pooler `:6543`) is a raw TCP connection and the
Codex proxy is HTTP/HTTPS — expect `psql`/`supabase db push` to be blocked. Verify with
`psql "$SUPABASE_DB_URL" -c 'select 1'` before relying on it; if blocked, use the REST/RPC
API for data work and apply migrations from a machine or CI that can reach the DB.

## 3. What the setup script does

1. `corepack prepare pnpm@12.9.1` (from `packageManager`), installs `supabase`, `vercel`,
   `@railway/cli` globally when missing.
2. `pnpm install --frozen-lockfile`.
3. Renders `.env` + `.env.local` from `.env.example` order, filled from env/secrets (mode 0600).
4. Writes `~/.codex-cloud-env.sh` (0600) and prepends the source line to `~/.bashrc`/`~/.profile`
   (top of file, because Ubuntu's `.bashrc` returns early for non-interactive shells).
5. `supabase login --token`, best-effort `railway link`, best-effort `vercel whoami`.
   Failures warn instead of aborting the container.

Guards: `SKIP_INSTALL=1` (skip installs), `SKIP_CLI_LOGIN=1` (skip auth), `CODEX_CLOUD_FORCE=1`
(allow overwriting an existing `.env`; without it the script refuses, so a local run cannot
clobber your real `.env`).

Note: `apps/api` reads `process.env` only (no `dotenv`), so server config arrives through the
shell exports — `.env`/`.env.local` are what Vite picks up for `apps/web`.

## 4. Verify inside a Codex task

```
node -v && pnpm -v                  # 22.x, 12.9.1
supabase projects list              # access token works
vercel whoami && vercel project ls  # token + team scope
railway status                      # linked project, else: railway link
psql "$SUPABASE_DB_URL" -c 'select 1'   # DB reachability probe
```

If any of them fails: check the token scope first, then the allowlist, then
**Reset cache** on the environment page — changing scripts, variables, or secrets
invalidates the cached container automatically.

## 5. Boundaries

- Production deploys (`vercel --prod`, Railway production service) and remote Supabase
  mutations are still explicit-approval actions under `AGENTS.md`; connectivity is not permission.
- Keep one token per task class (inspect vs. deploy) so a read-only task cannot ship.
- `.env` and `~/.codex-cloud-env.sh` are container-local and gitignored — nothing here is
  committed, and the cache expires after ~12 hours.
