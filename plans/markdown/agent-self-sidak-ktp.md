# Agent self view: SIDAK saya + KTP saya

Lane D (permission/access-control change for role `agent`). Date: 2026-11-11.

## Requirement

Decided by Fajar on 2026-11-11:

1. An agent who logs in (password or Google) lands on a new read-only page `/sidak/saya` that shows only their own SIDAK data.
2. KTP (Kotak Tool Profil) for an agent shows only their own `profiler_peserta` row. All fields of that row are shown, read-only, at `/profiler/saya`.
3. An agent whose account is not linked (`profiler_peserta.akun_id` empty) sees an empty state on both pages: "Akun Anda belum ditautkan ke data peserta. Hubungi admin/trainer."
4. Admin, trainer and leader are unchanged. They do not get the new capabilities or pages, and they keep landing on `/dashboard`.

Acceptance:

- `GET /api/v1/sidak/me` works for agents only. It accepts no client ID or filter (a query string returns 400) and returns `{ linked, qa, standing }`.
  - `qa` is the existing `AgentHomeSummary["qa"]` aggregate.
  - `standing` holds the year and service of the latest audit, the team ranks (rank and total only) and the 3-month forecast.
  - Other agents' names, ticket numbers and QA notes never appear in the response, which keeps the existing privacy contract in `docs/modules.md` (agent summary).
  - When the account is unlinked it returns `{ linked:false, qa:null, standing:null }`.
- `GET /api/v1/profiler/me` works for agents only, with no client input. It returns `{ linked:true, peserta }` for the caller's own row, or `{ linked:false, peserta:null }`. It never returns another participant's row.
- Admin, trainer and leader get 403 from both endpoints; anonymous callers get 401.
- After password login an agent's URL is `/sidak/saya`. The agent nav shows "SIDAK" (→ `/sidak/saya`) and "KTP" (→ `/profiler/saya`). The staff `/sidak/*` and `/profiler` routes stay forbidden for agents.

## Design

- Types (`packages/types`):
  - New capabilities `sidak.self.read` and `profiler.self.read`, both `["agent"]`.
  - New contracts `AgentSidakSelf` and `AgentKtpSelf`.
- API:
  - `services/home/agent-summary.ts`: extract `buildAgentSelfQa(actor)`, which returns the summary plus the latest audit context (`pesertaId`, `year`, `serviceType`). `getAgentHomeSummary` keeps its exact output.
  - `services/sidak/agent-self.ts` builds `standing` with `getSidakAgentQuickview`:
    - The `agentId` comes from the server-resolved self scope.
    - It runs with `accessibleAgentIds: null` so the rank compares against the whole team. Only `rank`, `total` and `scopeLabel` leave the server.
    - `efekTraining` is never included.
  - `routes/sidak/dashboard.ts` gets `GET /me`, gated by `sidak.self.read`.
  - `routes/profiler.ts` gets `GET /me`, gated by `profiler.self.read`. It uses `getLinkedPesertaId` and `select * … eq(id).eq(akun_id)`.
  - No migration: the `akun_id` 1:1 link already exists, and the API uses the service role exactly like the agent summary does.
- Web:
  - `lib/app-config.ts`: new modules `sidak-saya` and `ktp-saya`, plus a `getHomePath(role)` helper.
  - The helper is used by `AuthModal.resolvePostLoginPath` and by the auth-callback destination.
  - `nav-config.ts`: agent mobile tabs become `sidak-saya, dashboard, ketik, ktp-saya`, with colors and breadcrumbs.
  - New routes `/sidak/saya` (`routes/sidak/saya.tsx`) and `/profiler/saya` (`routes/profiler/saya.tsx`), each guarded by its own capability.
  - KTP saya reuses `ProfileFields` from `ProfilerParticipantDetail.tsx`, which is now exported.

## Tasklist

- [x] RED: `apps/web/e2e/agent-self-api.spec.ts`, real backend, Playwright project `agent-self-real-backend`.
- [x] RED: `apps/web/e2e/agent-self-browser.spec.ts`, hermetic: login lands on `/sidak/saya`, KTP saya content, unlinked state, nav.
- [x] GREEN: types, then API, then web.
- [x] Update `e2e/helpers/accessMatrix.ts` for the new capabilities.
- [x] Gates: `thermo-nuclear`, `impeccable`, then root typecheck, lint and build, and `git diff --check`.
- [x] Docs: `docs/modules.md` and `docs/auth-rbac.md`. Add a CHANGELOG entry.

## Revision 2 (2026-11-11): full agent detail instead of SIDAK saya

Fajar clarified that the agent view should be the staff page `/sidak/agents/$id` for the agent's own participant, not a summary page. KTP saya also gets a Slide view.

### Requirement

- After login (and via the SIDAK nav item) an agent lands on `/sidak/agents/<own pesertaId>`. `/sidak/saya` stays only as a stable redirect URL: it resolves the own ID from `GET /profiler/me`, and shows the "hubungi admin atau trainer" state when the account is unlinked. The summary page, `GET /sidak/me`, its service and its type are removed.
- The agent sees these tabs: Ringkasan (including Bahan coaching), Tren, Temuan (full, with tickets and QA notes, read-only), Heatmap and Simulasi. The sidebar also shows rank/forecast and Unduh laporan. Ganti agen, Input Audit, edit/delete temuan and EFEK training stay hidden.
- Agent access to any other participant ID returns 403 (API), and the web redirects such a request to the agent's own page. Staff behaviour is unchanged.
- KTP saya has a Profil / Slide switch. Slide reuses `SlideCanvas` and `ParticipantSlide`, with PNG/PDF save.

### Design

- New capability `sidak.agent.read` (admin, trainer, leader, agent). It gates only the per-agent read endpoints the detail page uses:
  - `GET /sidak/agents/:id`
  - `GET /sidak/agents/:id/quickview`
  - `GET /sidak/heatmap` (an agent must pass their own `agent_id`)
  - `GET /sidak/agents/:id/simulations` and `GET /sidak/agents/:id/simulations/:module/:historyId`
- Per-participant scope is still enforced in each handler.
- Self-scope fixes:
  - `getAccessibleSidakFilters` returns `agentIds: [pesertaId]` for self.
  - `resolveSidakSimulationAccess` gets an agent self branch (no Telefun recording playback).
  - Quickview and detail pass `accessibleAgentIds: null` for self after the in-scope check, so ranks and cohort averages compare against the real team. Only position, total and averages leave the server; no peer identities.
- `sidak.self.read` stays agent-only. It is used only by the web for the `/sidak/saya` redirect route and the detail route guard.
- The "Unduh laporan" action is client-side from the loaded data, so no report capability is needed.

### Tasklist

- [x] RED: rewrite `agent-self-api.spec.ts` for the detail endpoints, and `agent-self-browser.spec.ts` for the landing, the detail page as agent and KTP Slide.
- [x] GREEN: types/capability, API gates and scope fixes, removal of `/sidak/me`, web route/redirect/guards, detail tweaks for agent, KTP Slide.
- [x] Access matrix, docs, CHANGELOG. Gates: thermo-nuclear, impeccable, root typecheck/lint/build.

### Review notes (thermo-nuclear, 2026-11-11)

- No cross-participant leak found. Open for Fajar to decide (documented in `docs/auth-rbac.md`):
  - P2: simulation history/detail include the session actor's email/name/role. A session a staff member ran for this participant shows that staff identity to the agent.
  - P3: the team comparison row (average + agent count) lets an agent in a two-agent team infer the peer's total.

## Revision 3 (2026-11-11): no Beranda for agents

Fajar: after login an agent should see only their SIDAK QA data; `/dashboard` is not needed. Agents need only SIDAK, KTP, KETIK, Telefun and PDKT. PDKT stays always visible (there is no PDKT assignment concept yet; decided in chat).

### Requirement

- `/dashboard` redirects an agent to `getHomePath(role)` (`/sidak/saya` → own detail). Staff keep Beranda.
- Agent nav (sidebar, drawer, mobile tabs) holds exactly SIDAK saya, KTP saya, KETIK, Telefun, PDKT; no link to `/dashboard` anywhere in the shell (sidebar wordmark and the 403 page button use `getHomePath`).

### Design

- Web only, no API or capability change. `dashboardRoute` gets `guardStaffHome()`; the `dashboard` module is gated on `sidak.read` (the same staff test `dashboard.tsx` already used). Agent mobile tabs: `sidak-saya, ktp-saya, ketik, telefun, pdkt`.
- `AgentHome`, `AgentQaSummary` and `e2e/home-agent.spec.ts` are removed (page unreachable). `GET /v1/home/agent-summary` and its real-backend spec are left in place: removing them is an API change that deploys to Railway; it is now unused by the web and can go in a follow-up.

### Tasklist

- [x] RED: `agent-self-browser.spec.ts` — agent `/dashboard` redirects to own detail; agent nav hrefs exactly the five modules, no `/dashboard` link (both failed before the change).
- [x] GREEN: router guard, module capability, mobile tabs, wordmark, 403 button; `authenticated-shell.spec.ts` agent nav matrix updated.
- [x] Docs: `docs/modules.md`, `docs/e2e-testing.md`.

## Revision 4 (2026-11-11): remove the unused agent-summary API

Fajar asked to delete `GET /v1/home/agent-summary` now that the web no longer calls it.

- Removed the route in `apps/api/src/routes/home.ts`, `services/home/agent-summary.ts`, the `AgentHomeSummary` type, `home-agent-summary-api.spec.ts` and its Playwright project. `sidak.dashboard.read` stays (still used by SIDAK dashboard routes).
- [x] RED/GREEN: `agent-self-api.spec.ts` asserts the endpoint returns 404 for an agent (was 200).
