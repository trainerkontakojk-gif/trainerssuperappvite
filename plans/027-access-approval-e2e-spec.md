# Plan 027: Access approval + access groups E2E spec

## Requirement

The approval surfaces are permission-adjacent and have no browser-level evidence: four unit files cover them (`access-approval-grouped-leader-cards` 8 tests, `access-approval-module-information` 16, `access-groups` 5, `leader-access-gate` 11). Prove the behaviour end-to-end.

**Finish line**: `pnpm --filter @trainers/web test:e2e -- access-approval.spec.ts` is green, and the spec passes `expectHermetic` (no unmocked `/api`, no unmocked auth path, no external egress).

In scope: `apps/web/e2e/access-approval.spec.ts`, plus `apps/web/e2e/helpers/accessApprovalMocks.ts` only if a second spec needs the same fixtures.

Out of scope: editing or retiring the four unit files (separate, evidence-backed change), production code, and any non-E2E test.

## Design

- Hermetic harness as usual: `helpers/hermeticShell.ts` plus `assertLocalDevOnlyTarget()` in `beforeAll`; pattern reference [`docs/e2e-testing.md`](../docs/e2e-testing.md).
- Routes: `/dashboard/access-approval` and `/dashboard/access-groups`.
- `leader-access-gate` is a **status branch matrix** driven by `/api/v1/me/access-status`: `approved`, `none`, `pending`, `rejected`, `revoked`, `loading`, `error`. Cover the branches that change what the user can do, not every visual state. The agent fixture already shows how a role override works (`openAgentDetail(page, audit, agent, { role })` in `helpers/sidakAgentReportFixture.ts`).
- `access-approval-grouped-leader-cards` needs an approvals fixture plus mutation routing: one card per leader with a combined KTP + SIDAK badge, the module switcher, and the confirm/reject call going to the **active** request only. Assert the request that was actually sent, not just the toast.
- `access-approval-module-information` is **mostly Tier C**: 10 of its 16 tests are pure label mapping (`"ktp"` → `KTP`, whitespace, null/undefined/unknown → `Modul tidak diketahui`) and a `span`-element check. Cover only the integration half (badges on cards, filtering by the human-readable label).
- `access-groups` needs a folders/agents rule fixture; cover the dropdown enable/disable and the `batch_name` rule save.
- Mock the **API row shape**, not the client type (see the snake_case trap in `docs/e2e-testing.md`).

## Tasklist

- [ ] Drift check; confirm the dev server on `:3005` is local and disposable.
- [ ] Scaffold `access-approval.spec.ts` with an empty `apiMocks`; record `blockedApi` for both routes.
- [ ] Add the minimum mocks; make both routes render hermetically (RED → GREEN).
- [ ] Approval cases: grouped card badge, module switcher, confirm and reject routing to the active request.
- [ ] Role/status cases: a role without access is kept out; the actionable `none` / `rejected` / `revoked` states offer their call to action.
- [ ] Access-groups cases: agent dropdown disabled without a team, enabled after selecting one, and a Team subfolder saved as a `batch_name` rule.
- [ ] Run the spec twice (cold and warm), then typecheck, eslint, prettier, and `git diff --check`.
- [ ] Record which unit contracts are now E2E-proven. Do **not** delete the unit files in this plan.

## Verification

```bash
pnpm --filter @trainers/web test:e2e -- access-approval.spec.ts
pnpm --filter @trainers/web typecheck
pnpm --filter @trainers/web exec eslint apps/web/e2e/access-approval.spec.ts
git diff --check
```

## STOP conditions

- A mutation case cannot be proven without writing to a non-disposable backend → stop and report; keep the unit test.
- The spec would only pass by asserting CSS classes or `z-index` names → stop; assert the outcome instead (for example a hit-test) or leave it in unit.
- Approving or rejecting a request would touch real data → stop; never point Playwright at production.

## Scope guard

Test-only. No production code, no permission or RLS changes, no new dependencies, no unit-test edits, and no commit or push without explicit approval.
