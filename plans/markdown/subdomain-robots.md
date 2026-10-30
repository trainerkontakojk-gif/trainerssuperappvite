# Subdomain robots.txt (API and Telefun)

## Requirement

Follow-up to [Coolify Traffic Analytics Hardening](coolify-traffic-analytics-hardening.md). Fajar asked for a `robots.txt` on `api.trainerssuperapp.my.id` and `telefun.trainerssuperapp.my.id`, which currently return 404 for `/robots.txt`.

- Both hosts serve `GET /robots.txt` → 200 `text/plain` with `User-agent: *` / `Disallow: /`; neither host has crawlable content.
- `HEAD /robots.txt` works; other methods are not served as robots content.
- Existing behavior is unchanged: API `/api/health`, API JSON 404 for unknown routes, Telefun `/health`, Telefun 404 for unknown paths.
- No auth, CORS, rate-limit, RPC type, or route-contract changes. Robots is a crawler hint, not access control.

## Design

1. API (`apps/api/src/app.ts`): the app is `new Hono().basePath("/api")`, so a host-root path cannot be registered on it. Create the host app first and derive `app` from it with `basePath("/api")`; Hono clones share one router, so `app.fetch` (used by `startApiRuntime`) dispatches the root `/robots.txt` route. The `/api/*` middleware does not cover the root path, so the handler applies `applySecurityHeaders` itself. `AppType` and the default export stay the same.
2. Telefun (`apps/telefun/src/server.ts`): add a `/robots.txt` branch in the HTTP request handler beside `/health`: `GET`/`HEAD` → 200 `text/plain`, others → 405 with `Allow: GET, HEAD`.
3. E2E (`apps/web/e2e/subdomain-robots-api.spec.ts`, project in `playwright.api.config.ts`): boot the real API and Telefun entrypoints on loopback with fixture-only env and the existing egress-denying preload, then assert robots content/type, `HEAD`, and that health and 404 behavior are unchanged.

## Tasklist

- [x] Write the E2E spec and run it RED against current code (both hosts 404 on `/robots.txt`).
- [x] Implement API and Telefun robots routes; run GREEN (2/2).
- [x] Focused typecheck/lint for API, Telefun, and the spec; `thermo-nuclear` review. Review moved the duplicated loopback boot into `e2e/helpers/bootLocalService.ts`, shared with `gemini-egress-proxy-api.spec.ts`; both projects pass (14/14).
- [x] Update `docs/deployment.md`, CHANGELOG; commit and push to `main`.
- [ ] After Coolify redeploys API and Telefun, smoke `/robots.txt` on both production hosts.

## Non-goals

- No `X-Robots-Tag` on API/Telefun responses, no sitemap for these hosts, no WAF or User-Agent blocking.
