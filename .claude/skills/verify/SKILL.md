---
name: verify
description: Prove a Trainers SuperApp change works by running it — drive the changed surface through a focused local E2E, look at the result, and produce the `Verified:` commit trailer. Use before every commit of a runtime change, and from `push-ready`.
---

# Verify (Claude Code adapter)

Canonical rules live in `docs/AGENT_WORKFLOW.md` §7 (ladder, target safety, flaky tests, three-round escalation) and §4 (Verification trailer). Harness map and traps: `docs/e2e-testing.md`. This skill is the smoke harness: it says which driver proves which surface, how to look at the outcome, and what to write in the trailer.

## 1. Pick the driver for the changed surface

| Surface changed                              | Driver (local or disposable targets only)                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `apps/web` screen or flow                    | Browser spec under `apps/web/e2e/` (hermetic or real-backend, see `docs/e2e-testing.md`), run with `E2E_SCREENSHOT=on` |
| `apps/api` route, contract, auth/RLS, worker | API spec (`*-api.spec.ts`) in its project of `playwright.api.config.ts` or `playwright.access-api.config.ts`           |
| Schema, RLS, grants, migration               | `supabase-migration` skill (clean local replay) plus its real-backend E2E guard                                        |
| Static server headers                        | `playwright.static-security.config.ts`                                                                                 |
| Docs or agent config only (Lane A)           | No product run; format/structure checks and `git diff --check`                                                         |

Never start the root `pnpm dev` (its API and Telefun use the production `.env`). The Playwright configs start only what a spec needs, on loopback targets. If no safe driver exists for the change, stop and ask Fajar — do not substitute a unit test.

## 2. Run it

From the repository root, one Playwright run at a time, output to a scratchpad log:

```bash
# browser spec, keeping a final-state screenshot of each test
E2E_SCREENSHOT=on pnpm --dir apps/web exec playwright test <spec-file> -g "<test name>" --reporter=line --workers=1 > <scratchpad>/verify.log 2>&1; echo "exit=$?"
# API spec
pnpm --dir apps/web exec playwright test <spec-file> -g "<test name>" --config=playwright.api.config.ts --project <name> --reporter=line --workers=1 > <scratchpad>/verify.log 2>&1; echo "exit=$?"
```

Run the RED case first when the task is a fix or new behavior (§6), then GREEN after the change.

## 3. Look at the result

- Read the log: confirm the intended test ran (count and title), not a filtered-out or skipped one. `0 passed` or `skipped` is not evidence.
- For a UI change, open the screenshot Playwright kept under `apps/web/test-results/<test>/` (Read the `.png`) and check that the changed screen shows what the task asked for. A green assertion on the wrong screen is still wrong.
- On failure, read the failure screenshot and `trace.zip` path from the log before changing code.

## 4. When it fails

- Fix the cause in code or test, rerun the same command. One change plus one rerun is one round.
- Never make it green by retrying, adding `waitForTimeout`/sleep, raising timeouts, `test.skip`/`fixme`, loosening an assertion, or editing the check that judges the change (§7 "Flaky tests", "Do not edit the judge").
- After three rounds on the same failure, stop and bring Fajar: the command, the failing excerpt, the three hypotheses tried, and what is needed (§7 "Three-round escalation").

## 5. Write the trailer

Add to the last paragraph of the commit message, next to `Co-Authored-By:`:

```text
Verified: e2e <spec-file> "<test name>" (screenshot checked); pnpm --filter @trainers/web typecheck; pnpm lint
Verified: none - docs-only wording change
```

List only commands that ran and passed in this session. Use `none - <reason>` when no check applies; never omit the trailer.
