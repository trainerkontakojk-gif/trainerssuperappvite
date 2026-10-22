# Gemini egress proxy

## Requirement

Lane C: add optional server-only `GEMINI_PROXY_URL` to API and Telefun. Unset/empty preserves the existing direct transport. When configured, only `generativelanguage.googleapis.com` uses HTTP CONNECT through an HTTP(S) proxy. Other providers and Supabase remain direct. Invalid URLs fail startup with the variable name, without exposing credentials. Proxy failure must not fall back to direct. No remote infrastructure changes.

## Design

- Live source confirms one API `GoogleGenAI` constructor in `lib/ai-models.ts`; all runtime Gemini requests use `lib/gemini.ts`. No API Live/WebSocket call sites found. Installed SDK 2.30.0 supports `HttpOptions.fetch`.
- API: one small Gemini transport helper, a reusable undici 7.30.0 `ProxyAgent` and its own `fetch`, scoped by exact hostname; no global dispatcher. Preserve the original SDK constructor when unset. Redact transport failures to a fixed safe error before existing callers log them.
- Telefun: one small helper providing a reusable https-proxy-agent 7.0.6 agent only to the existing Gemini WebSocket constructor. Existing adapter diagnostics remain sanitized.
- Validate HTTP(S) URL syntax in each app's existing Zod env validation, treating blank input as absent. Validation messages contain no supplied value.
- E2E: real subprocess entrypoints, explicit dummy env, local Supabase stub and CONNECT-denying proxy. A test-only preload extends the existing fetch deny-egress preload with socket blocking and ephemeral loopback listener discovery. It never opens a real provider connection. Exercise the API annotation-generation endpoint with local auth/profile/history/audio responses, plus Telefun authentication/configuration.
- Graphify `getGeminiClient` query confirms central transport ownership. Context7 verified SDK custom fetch, undici fetch/dispatcher, and ws CONNECT agent APIs against installed declarations.

## Tasklist

- [x] Add focused Playwright spec/project and local-only preload; run RED and preserve output.
- [x] Add optional env validation, app-local helpers, dependencies, and transport wiring.
- [x] Run GREEN and existing dev-database-guard regression, serially.
- [x] Update deployment env tables and changelog.
- [x] Perform manual thermo-nuclear review of scope, unset compatibility, fail-closed behavior and log redaction; update local Graphify once.
- [x] Run affected app typechecks/builds/lints, E2E harness checks, formatting and diff checks; preserve exact evidence.
- [x] Prepare verified integration on main; commit/push receipt and remote hash are recorded separately in the delivery report. No VPS/platform/database/DNS changes.

## Verification evidence

- RED before implementation: 8 expected failures and 4 direct-mode passes. Both proxy flows recorded no CONNECT; invalid env kept both services alive instead of exiting 1. An initial fixture-only cleanup RPC omission was corrected before confirming RED.
- GREEN: 12 passed, no skips/flakes. Real API endpoint `POST /api/v1/telefun/annotations/generate/:id` reaches Gemini through the proxy; local auth/profile/history/storage requests remain direct. Telefun authenticates/configures successfully, retries the same proxy three times (4 CONNECTs total), then closes 1011 while health remains 200. API preserves its existing human-friendly `NO_ANNOTATIONS` failure response and remains healthy.
- Existing `dev-database-guard` project: 8 passed. No unit/Vitest suites added or run.
- API/Telefun tsc, build and lint: exit 0. E2E tsc/lint and root typecheck/lint/build: exit 0. Existing warnings are outside changed paths; no new lint warnings/errors.
- Manual thermo-nuclear review using `code-review-quality` section 3: PASS. No global dispatcher/agent changes, provider fallback changes, raw proxy errors or secret logging; no auth/billing/schema changes. Tiny app-owned transport helpers retain the original unset constructor paths. API rejects redirects on its configured proxy transport to prevent cross-host proxying. No API Live/WebSocket paths exist.
- Package-manager incidental workspace/transitive churn was restored in-place; lockfile diff contains only the two intended direct-dependency importers. Graphify update completed once; generated cache remains untracked/ignored. No external Wiki write (remote writes outside this repo are not authorized).
- Evidence directory: `/Users/nadindyta/.hermes/cache/scratch/gemini-egress-proxy/` (`red-confirmed.log`, `green-final.json`, 12 Playwright trace artifacts, `db-guard-confirmed.log`, `gate-results.json`).
- Coverage boundaries: proxy deliberately responds 403, so no live Gemini success, HTTPS-proxy TLS handshake, WARP/VPS routing or real OpenAI transaction is claimed. OpenAI isolation is supported by exact-host/per-client scope review; Supabase direct traffic is exercised end-to-end. Local stubs do not verify production RLS/data.
