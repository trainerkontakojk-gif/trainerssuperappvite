# Coolify Traffic Analytics Hardening

## Requirement

Act on Fajar's approved recommendations after the Coolify Traffic Analytics review:
- Keep the public landing page crawlable; ask compliant crawlers not to index application routes.
- Serve a real `robots.txt` and a sitemap containing only the public landing page.
- Return a genuine 404 for dotfiles and common scanner paths instead of serving the SPA fallback; preserve normal SPA deep links.
- Set Caddy raw access-log mode to `0640` and retention to 14 days without removing existing logs.
- Do not block by country or User-Agent, disable traffic analytics, expose raw IPs, or claim that robots.txt is access control.

## Design

1. For Railway/Coolify static serving, wrap the existing `serve dist -s` behavior with a minimal `serve-handler`-based server that rejects hidden-file segments (except `.well-known`), ambiguous encodings, and specific unused CMS/scanner paths before SPA fallback. Missing `/assets/*` and known file-like paths must return 404, while normal deep links still return the shell. Preserve the existing `serve.json` headers on errors.
2. For Vercel, use ordered `routes`: return `404` for plain and percent-encoded hidden paths, `400` for encoded separators/backslash, and `404` for scanners; add `X-Robots-Tag: noindex, nofollow` for nested app/API prefixes; continue to the filesystem; then return 404 for missing `/assets/*` and file-like paths before SPA fallback. Carry existing security/cache headers in relevant route entries; do not rely on a top-level `headers` block with the legacy `routes` key. Keep Vercel's default HSTS platform-managed. Vercel may reject `%00` at its edge before configured route headers, so document the observed behavior separately.
3. Add static `robots.txt` and `sitemap.xml` in `apps/web/public`. Allow the homepage; disallow known application route prefixes and same-host `/api/`. The robots file is host-scoped; compliant crawlers disallowed by robots won't fetch those pages to read `X-Robots-Tag`, though external links may produce URL-only indexing. API/Telefun subdomains remain protected by their existing auth and are not modified by this web-host change.
4. Add a focused Playwright configuration that builds and serves the production static artifact only on loopback with E2E-safe environment values. Cover landing, app-route fallback/noindex, robots/sitemap, scanner/dotfile 404s, missing assets, security headers on errors, ambiguous encodings, and `HEAD`. Validate Vercel's compiled route table separately without deploying or loading production environment secrets.
5. Treat the Coolify Caddyfile as managed configuration. Update all access-log writers identically through Coolify labels: `mode 0640`, `roll_keep_for 336h`, `roll_keep 30`, `roll_interval 24h`, retaining the existing `roll_size 20MiB`. Preserve prior files and logs; recreate Web/www, API, Telefun one at a time with health checks; verify the new writer and file mode. The age target can be shortened under exceptional volume if the 30-file cap is reached.
6. Update deployment/security documentation and a scoped rebuild note. Fajar authorized pushing a non-main branch for Vercel Preview only; do not push to production branch or merge without another explicit decision.

## Tasklist

- [x] Add Playwright regression spec/config first; run RED against the existing SPA static server.
- [x] Add the static-serving wrapper and safe path matcher; preserve `serve.json` and SPA routing.
- [x] Add robots.txt/sitemap and route-level noindex headers; add matching Vercel route rules.
- [x] Verify local static E2E (5/5), Web build, focused TypeScript/ESLint, full Web ESLint (0 errors), official Vercel schema, offline Vercel build/output route ordering (15 routes), and `git diff --check`. Full package typecheck remains blocked by two diagnostics in untouched `telefun-agent-silence.spec.ts`. Follow-up Preview commit `7a9b8858` is Ready; `vercel curl` confirms `/%2eenv`/`%252eenv` 404, encoded slash/backslash 400, scanner/missing-asset 404, nested app noindex, robots/sitemap 200. Vercel edge rejects `/%00` with 400 before project CSP/no-store headers.
- [x] Coolify labels applied to Web/www, API, and Telefun (`mode=0640`, `roll_interval=24h`, `roll_keep=30`, `roll_keep_for=336h`, `roll_size=20MiB`); each resource redeployed at `af4b605b` and healthy. Existing `access.log` changed to `0640` in place; no logs deleted. Telefun needed Container Labels set to "Managed manually" before the save persisted (verified 2026-10-30T08:49Z).
- [x] Update deployment docs and rebuild log. Commits `d492b09f` and `7a9b8858` are pushed on `fix/coolify-traffic-analytics-hardening`; the `7a9b8858` Vercel Preview is Ready at `https://trainerssuperappvite-ngd2zbdh2-trainers-superapp.vercel.app`. No production deployment.

## Non-goals

- No country/UA blocking, WAF rollout, route auth changes, Supabase changes, log deletion, or broad app refactor.
- No changes to Caddy's 20 MiB rotation-size threshold unless it prevents the approved 14-day retention; if it does, stop and ask rather than silently increasing disk use.
- No assertion that request counts equal unique people or that a `bot=false` label proves human traffic.