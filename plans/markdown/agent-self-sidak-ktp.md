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
  - `nav-config.ts`: agent mobile tabs become `sidak-saya, ketik, pdkt, ktp-saya`, with colors and breadcrumbs.
  - New routes `/sidak/saya` (`routes/sidak/saya.tsx`) and `/profiler/saya` (`routes/profiler/saya.tsx`), each guarded by its own capability.
  - KTP saya reuses `ProfileFields` from `ProfilerParticipantDetail.tsx`, which is now exported.

## Tasklist

- [x] RED: `apps/web/e2e/agent-self-api.spec.ts`, real backend, Playwright project `agent-self-real-backend`.
- [x] RED: `apps/web/e2e/agent-self-browser.spec.ts`, hermetic: login lands on `/sidak/saya`, KTP saya content, unlinked state, nav.
- [x] GREEN: types, then API, then web.
- [x] Update `e2e/helpers/accessMatrix.ts` for the new capabilities.
- [x] Gates: `thermo-nuclear`, `impeccable`, then root typecheck, lint and build, and `git diff --check`.
- [x] Docs: `docs/modules.md` and `docs/auth-rbac.md`. Add a CHANGELOG entry.
