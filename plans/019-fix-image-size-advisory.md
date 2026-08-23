# Plan 019: Patch transitive `image-size` HIGH advisories behind `pptxgenjs`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a8d1f31..HEAD -- package.json pnpm-lock.yaml apps/web/package.json`
> If those changed since this plan was written, re-run the Current-state
> checks below before proceeding; on mismatch, treat as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none (independent of plan 018)
- **Category**: security
- **Planned at**: commit `a8d1f31`, 2026-08-23
- **Final status**: ❌ **BLOCKED (upstream) — closed 2026-08-23 with maintainer-approved risk acceptance; see "Resolution" below**

## Resolution — 2026-08-23 (closed WITHOUT code change)

The plan hit its own STOP condition before Step 1 could land:

1. **The patched version does not exist.** The advisories demand
   `image-size >= 2.0.3`, but the npm 2.x line ends at `2.0.2`
   (`pnpm view image-size versions`; latest release April 2025). Every
   published version is inside the vulnerable range. Confirmed upstream in
   github/advisory-database issue #9028 ("patched version 2.0.3 has never
   been published", verified against the registry 2026-08).
2. **The vulnerable code is unreachable anyway (phantom dependency).**
   Verified locally against the installed `pptxgenjs@4.0.1`:
   - `grep -c "image-size"` over `dist/pptxgen.es.js`,
     `dist/pptxgen.cjs.js`, `dist/pptxgen.min.js` → **0 references** in all
     three bundles; the package only *declares* the dependency.
   - The production web build (`apps/web/dist/assets/*`) contains no
     image-size parser markers (`icns`, `svgSize`) either.
3. A scoped override `"pptxgenjs>image-size": ^2.0.3` was attempted in
   `pnpm-workspace.yaml` and correctly failed to resolve
   (`ERR_PNPM_NO_MATCHING_VERSION`). Note for future executors: on this
   pnpm@11 workspace the field `pnpm.overrides` in root `package.json` is
   IGNORED — overrides live in `pnpm-workspace.yaml` (the repo already uses
   that block for brace-expansion/fast-uri/dompurify/protobufjs).

**Maintainer decision (Fajar, 2026-08-23)**: accept the risk. No vendor
patch, no watchdog. Revisit ONLY when `image-size >= 2.0.3` actually
publishes — then apply the scoped override from Step 1 of this plan as-is.

## Why this matters

`pnpm audit --prod` reports 2 HIGH advisories on the production dependency
graph of `@trainers/web`:

- GHSA-w3rx-r6r6-pgpr — ReDoS in `image-size`
- GHSA-5p2g-fcmc-qvqq — infinite-loop DoS in `image-size`

Both affect `image-size <= 2.0.2`, patched in `>= 2.0.3`. The sole path is
`apps__web > pptxgenjs@4.0.1 > image-size@1.2.1`. `image-size` runs inside
the browser during Profiler PPTX export (`SlideCanvas.tsx` embeds slide
images); a maliciously crafted image processed there can hang or freeze the
user's tab. Upstream won't help soon: `pptxgenjs@4.0.1` IS the latest
release and still declares `image-size: ^1.2.1` (verified via
`npm view` on 2026-08-23), and the fix only exists on the 2.x line. The
supported remediation is a scoped pnpm override forcing `image-size` ≥
2.0.3 under pptxgenjs, guarded by a regression test that actually
exercises pptxgenjs's image pipeline.

## Current state

Verified facts (2026-08-23):

```
$ pnpm why image-size
image-size@1.2.1
└─┬ pptxgenjs@4.0.1
  └── @trainers/web@0.0.0 (dependencies)

Found 1 version of image-size
```

- `apps/web/package.json`: `"pptxgenjs": "^4.0.1"`.
- Root `package.json` has NO `pnpm` field yet (no overrides exist).
- `npm view pptxgenjs version` → `4.0.1`; `npm view pptxgenjs
  dependencies.image-size` → `^1.2.1`.
- PPTX usage lives in `apps/web/src/routes/profiler/utils/
  profilerPptxExport.ts` + `components/slides/SlideCanvas.tsx`
  (client-side export; images drawn to canvas → data URLs → slides).
- Repo convention: conventional commits (e.g. `fix(telefun): …`),
  pnpm workspace, turbo task runners.

Key assumption to keep in mind: **pptxgenjs remains runtime-compatible with
image-size 2.x**. The library only calls it internally to measure embedded
images; the 1→2 major bumped the export shape (named `imageSize` export)
and dropped old Node targets, which matters for pptxgenjs's Node entry but
the web bundle consumes its own graph. The Step-2 test exists precisely to
prove this assumption instead of trusting it.

## Commands you will need

| Purpose        | Command                                        | Expected on success |
|----------------|------------------------------------------------|---------------------|
| Install        | `pnpm install`                                 | exit 0              |
| Audit          | `pnpm audit --prod`                            | "0 vulnerabilities" |
| Typecheck      | `pnpm turbo run typecheck --filter=@trainers/web` | exit 0           |
| Web tests      | `pnpm turbo run test --filter=@trainers/web`   | exit 0, all pass    |

## Scope

**In scope** (the only files you should modify/create):
- `package.json` (root — add scoped `pnpm.overrides` entry only)
- `pnpm-lock.yaml` (regenerated by `pnpm install`)
- `apps/web/src/__tests__/pptxgen-image-size.test.ts` (create)

**Out of scope** (do NOT touch):
- Anything under `apps/web/src/routes/profiler/` (export logic stays as-is).
- `apps/web/package.json` version pins (do not bump pptxgenjs — 4.0.1 is
  latest; do not touch `xlsx`/`exceljs` — that is plan 018).
- Global (unscoped) overrides: never force `image-size` for the whole
  workspace; scope it to the pptxgenjs path.

## Git workflow

- Branch: `advisor/019-fix-image-size-advisory`
- Commit style: `fix(deps): override image-size to ^2.0.3 under pptxgenjs (GHSA-w3rx-r6r6-pgpr)`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the scoped override

In root `package.json`, add (merge, don't clobber, if `pnpm` exists):

```json
{
  "pnpm": {
    "overrides": {
      "pptxgenjs>image-size": "^2.0.3"
    }
  }
}
```

Then run `pnpm install`.

**Verify**: `pnpm why image-size` → shows `image-size@2.x` (≥ 2.0.3) under
the `pptxgenjs` path, single version.

### Step 2: Prove the PPTX image pipeline still works

Create `apps/web/src/__tests__/pptxgen-image-size.test.ts`. It must exercise
pptxgenjs WITH an embedded image, because that is the only code path that
touches `image-size`. Model the file structure on
`apps/web/src/__tests__/exportAgentReport.test.ts` (imports/describe/expect
style). Content:

```ts
import PptxGenJS from "pptxgenjs";

describe("pptxgenjs + overridden image-size", () => {
  it("writes a deck containing an image without throwing", async () => {
    const pptx = new PptxGenJS();
    const slide = pptx.addSlide();
    // 1x1 transparent PNG
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    slide.addImage({ data: "image/png;base64," + png, x: 1, y: 1, w: 2, h: 2 });
    const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    expect(out.length).toBeGreaterThan(0);
    // zip magic "PK"
    expect(out.subarray(0, 2).toString()).toBe("PK");
  });
});
```

Run: `pnpm turbo run test --filter=@trainers/web -- pptxgen-image-size`
(use `pnpm --filter @trainers/web test <args>` if turbo passthrough differs;
check `apps/web/package.json` scripts).

**Verify**: the new test passes. If it FAILS with an import/runtime error
originating inside `image-size` or `pptxgenjs`, that proves the 2.x override
is NOT compatible → revert Step 1's edit and go to STOP conditions.

### Step 3: Confirm the advisories clear and nothing else broke

**Verify** (all must hold):
- `pnpm audit --prod` → `0 vulnerabilities`.
- `pnpm turbo run typecheck --filter=@trainers/web` → exit 0.
- `pnpm turbo run test --filter=@trainers/web` → exit 0 (all, incl. Step-2 test).
- `git status` → only `package.json`, `pnpm-lock.yaml`, and the new test file changed.

## Test plan

- New test `apps/web/src/__tests__/pptxgen-image-size.test.ts` (Step 2) — the
  regression guard: it fails if the override ever breaks pptxgenjs's image
  measurement path again (e.g. future pptxgenjs bump).
- Verification: `pnpm turbo run test --filter=@trainers/web` → all pass.

## Done criteria

ALL must hold:

- [ ] `pnpm why image-size` → only versions ≥ 2.0.3
- [ ] `pnpm audit --prod` → 0 vulnerabilities
- [ ] New pptxgenjs image test exists and passes
- [ ] `pnpm turbo run typecheck --filter=@trainers/web` exits 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- After the override, the Step-2 test fails with an error traced to
  `image-size`/`pptxgenjs` internals even after one honest debugging attempt
  (compatibility break — maintainer must choose: vendor-patch pptxgenjs,
  fork, or formally accept the risk).
- `pnpm why image-size` shows MULTIPLE versions (an override leak) — report
  the tree instead of forcing a global override.
- Any OTHER package in the workspace requires `image-size` <2 (conflicting
  peer ranges visible during `pnpm install` warnings).

## Maintenance notes

- When a future pptxgenjs release declares `image-size ^2.x` natively,
  delete the override and this test stays as the cheap regression guard.
- Reviewer should scrutinize: the override is SCOPED (`pptxgenjs>image-size`)
  — a global `"image-size": "*"` override would be wrong here.
- Follow-up explicitly deferred: none. (Upstream issue-filing with
  pptxgenjs about the 1.x pin is optional and out of scope.)
