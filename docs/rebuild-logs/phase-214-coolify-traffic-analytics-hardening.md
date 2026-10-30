# Phase 214: Web Crawler & Sensitive-Path Hardening

## Problem

Coolify analytics showed requests from crawlers/scanners to a site used by a limited audience. Previously, `robots.txt` and `sitemap.xml` were served through the SPA fallback, and probes such as `/.env` returned the same HTML shell as `/`. That was not evidence of secret-file disclosure, but it obscured the distinction between a real 404 and a client-side route.

## Approved policy

- Keep the public landing page indexable.
- Ask compliant crawlers not to index app routes and same-host `/api/` paths; provide a sitemap containing only the public landing page.
- Return a real 404 for hidden files and common unused scanner paths while preserving valid SPA deep links.
- For Coolify raw logs, Fajar selected 14-day retention and `0640` file permissions. This VPS change remains pending because the durable settings are generated from Coolify-managed Docker labels and require service recreation.

Robots directives are not access control. No country/UA blocking or authentication changes were made.

## Changes

- `apps/web/scripts/serve-static.mjs` wraps `serve-handler`, keeps the existing `serve.json` headers and SPA fallback, denies hidden path segments (except `.well-known`) and known CMS/scanner paths, returns 400 for ambiguous encodings, and returns a secured 404 for missing asset/file-like paths. App/API prefixes receive `X-Robots-Tag: noindex, nofollow`.
- `apps/web/package.json` starts the wrapper and pins the already-used `serve-handler@6.1.7` as a direct dependency.
- `apps/web/public/robots.txt` allows `/` and disallows app prefixes and same-host `/api/`; `sitemap.xml` contains only `https://trainerssuperapp.my.id/`. Crawlers honoring `Disallow` will not fetch those routes to see `X-Robots-Tag`; external links can still cause URL-only indexing.
- `vercel.json` uses ordered Vercel routes for plain/encoded hidden-path 404s, 400s for encoded separators/NUL, scanner 404s, nested app/API noindex prefixes, filesystem serving, missing asset/file-like 404s, and SPA fallback. No top-level `headers` block is relied on because the legacy `routes` key can suppress it; Vercel's default HSTS remains platform-managed.
- `apps/web/e2e/telefun-flow.spec.ts` now obtains its hermetic `connect-src` policy from the route-level CSP entries and asserts those policies stay consistent.
- `docs/deployment.md` documents host scope, the robots/noindex distinction, and that robots.txt does not replace API authentication.

The robots file is scoped to the Web hostname. Separate `api.` and `telefun.` hosts were not changed.

## Verification

- `pnpm --dir apps/web build` — PASS with E2E-only service URLs on loopback.
- `pnpm --filter @trainers/web exec playwright test --config playwright.static-security.config.ts` — PASS, 5/5. Covers public homepage, robots/sitemap, SPA deep links/noindex, dotfiles and scanner 404s, missing file-like assets, security headers/no-store on errors, ambiguous encodings, and `HEAD`.
- `pnpm --filter @trainers/web exec playwright test --config playwright.config.ts --grep 'rekaman diunduh sekali per halaman'` — PASS, 1/1; verifies the existing hermetic Telefun playback flow reads `connect-src` from route-level CSP entries.
- Focused ESLint and TypeScript checks for the changed runtime/E2E/config files — PASS.
- `pnpm --filter @trainers/web lint` — PASS, 0 errors and 68 warnings in other files.
- `pnpm --filter @trainers/web typecheck` — still BLOCKED by two diagnostics in untouched `apps/web/e2e/telefun-agent-silence.spec.ts:247-248` (`TS2684`); focused checks for new files pass.
- Vercel config validation — PASS against the official schema. `vercel build` CLI 54.17.0 — PASS offline in a scratch fixture with manual local settings and no `vercel pull`/production environment. The compiled `.vercel/output/config.json` has 15 routes; checks confirm header `continue`, nested scanner/app prefixes, encoded-dot/ambiguous-path matches, filesystem-before-missing-asset/fallback order, and consistent CSP. Initial Vercel Preview commit `d492b09f` exposed `/%2eenv` returning `200 text/html`; follow-up commit `7a9b8858` is pushed and its Preview is Ready at `https://trainerssuperappvite-ngd2zbdh2-trainers-superapp.vercel.app`. Authenticated `vercel curl` confirms plain/encoded dotfiles and scanner/missing assets return 404; encoded slash/backslash return 400; app nested route has `noindex, nofollow`; robots/sitemap return 200. Vercel edge rejects `/%00` with 400 before project CSP/no-store headers are applied. Preview adds platform `X-Robots-Tag: noindex`; no production deployment occurred. `vercel dev --local` was not accepted as built-route proof because it uses `devCommand` and the local package-manager path hit missing Yarn.
- `git diff --check` — PASS.

## Coolify log status (applied 2026-10-30)

Read-only VPS inspection at `2026-10-30T03:22:39Z` found three production resources (Web with apex/www, API, Telefun) using the same access-log destination and current labels `roll_keep=5`, `roll_keep_for=168h`, `roll_size=20MiB`. Caddy binary is v2.11.4. `/data/coolify/proxy/caddy/access.log` was `0644`, `root:root`, 4,243,883 bytes; filesystem had 19 GB free of 59 GB. Sentinel mounts the Caddy directory read-only and runs with the default root user.

A read-only `caddy adapt --validate` probe on v2.11.4 accepted `roll_interval 24h`, `roll_keep 30`, `roll_keep_for 336h`, `roll_size 20MiB`, and `mode 0640`. Daily rotation plus a 30-file cap makes the 14-day target practical at current traffic, but unusually high volume can hit the count cap earlier. No logs were deleted.

Fajar approved the label update and resource recreation. The first browser attempt stalled on a blank Configuration/Source page, so nothing was saved then. The port 8000 panel is bound on `0.0.0.0` with UFW inactive; use the HTTPS panel, not that plain-HTTP port.

Rollout (verified over SSH at `2026-10-30T08:49Z`):

- Web/www (deployed 08:04Z) and API (08:07Z) were saved and redeployed at commit `af4b605b`. Live container labels: `mode=0640`, `roll_interval=24h`, `roll_keep=30`, `roll_keep_for=336h`, `roll_size=20MiB` (Web on both `caddy_0` and `caddy_1`).
- Telefun: the first save left the stored labels unchanged and queued no deployment. After switching Container Labels to **Managed manually**, the saved labels match Web/API, and the redeploy finished at 08:47:51Z. The new container (created 08:47:49Z) carries the same five values and is healthy; `/health` returns 200.
- Existing `/data/coolify/proxy/caddy/access.log` was changed in place with `chmod 0640` (`root:root`); no rotated archives existed yet. After the Telefun redeploy it stayed `0640` and kept growing (5,420,763 → 5,426,975 bytes), with Telefun requests logged. `backups/` holds only Caddy/compose config backups, not access logs. No logs were deleted.
- `coolify-proxy` logs for the reload window show only the routine port-80 HTTP/2/HTTP/3 warnings, no errors.

## Release state

Hardening commits `d492b09f` and `7a9b8858` (Preview Ready at `https://trainerssuperappvite-ngd2zbdh2-trainers-superapp.vercel.app`) are on `main`; Coolify Web, API, and Telefun run `af4b605b`. Production crawler smoke on `https://trainerssuperapp.my.id` after the redeploy: `/` 200 without `X-Robots-Tag`; `/robots.txt` 200 `text/plain`; `/sitemap.xml` 200 listing only the homepage; `/.env`, `/%2eenv`, `/.git/config`, `/wp-login.php`, `/assets/nope.js` 404 with `noindex, nofollow`; `/dashboard`, `/dashboard/x`, `/telefun`, same-host `/api/` 200 shell with `noindex, nofollow`; `www` 302 to apex.
