# Migration replay on an empty database

- **Status:** Approved by Fajar 2026-10-10: edit `20260716163000` with an empty-database guard (exception to "never edit an applied migration").
- **Lane:** D (migration file and CI gate). No production apply: `20260716163000` is already recorded in the production ledger and never runs there again.

## Requirement

The CI step "Replay all migrations on a fresh local Supabase" is advisory (`continue-on-error: true`), because a clean replay fails:

```
Applying migration 20260716163000_publish_slik_subparameter_baseline_january.sql...
ERROR: Periode Januari 2026 tidak ditemukan (SQLSTATE P0001)
```

`20260716160000` clones the latest published SLIK rule into a draft. No migration creates that published rule; it exists only in production. On an empty database `160000` therefore inserts no draft, and `163000` raises because the January 2026 period and the draft are missing. `scripts/integration/supabase-bootstrap.sh` (`supabase db reset --local`) stops at the same point.

The CI comment also names `20260910000000_simulation_subject_attribution`. That migration no longer fails: a full replay in an isolated stack with only the `163000` guard completed all 74 files.

**Acceptance:**

- A clean replay of every migration completes, locally and in CI.
- The CI replay step is blocking.
- A database with SLIK rules keeps the current fail-closed behavior of `163000`.
- The local SLIK fixture (`scratch/sidak-local-db/seed-slik-baseline.sh`) still produces the published January 2026 baseline that `sidak-temuan-dates-api.spec.ts` needs.

## Design

- `163000` starts with: if no `qa_service_rule_versions` row has `service_type = 'slik'`, `RAISE NOTICE` and `RETURN`. That state means the database has never held SLIK rules, so there is nothing to promote. Any other state (period missing while rules exist, wrong draft, existing findings) still raises.
- Why an edit and not a new migration: the replay stops at `163000`, so no later migration can run before it. A new migration ordered before it would have to insert synthetic SLIK data into every fresh database.
- Production is unaffected: the Supabase CLI keys migrations by version, `163000` is already applied there, and production rollouts use atomic wrappers, never `db push`.
- The rollback check only covers added migrations (`--diff-filter=A`), so no rollback file is needed for the edit; the guard adds no state to roll back.
- `.github/workflows/ci.yml`: drop `continue-on-error`, rename the step, and replace the advisory comment.
- `.claude/skills/supabase-migration/SKILL.md`: record the one approved exception next to the "never edit" rule.
- Local fixture (gitignored `scratch/`, machine-local): after `supabase start` now completes, `160000` and `163000` are already in the ledger, so the seed script's ledger skip would never build the baseline. The script re-runs both when the published baseline is missing.

## Tasklist

- [x] **T1 RED:** Isolated stack (`project_id = replay-scratch`, ports 553xx, scratchpad copy of the migrations): `supabase start` fails at `163000` with `Periode Januari 2026 tidak ditemukan`.
- [x] **T2 GREEN:** Guard in `163000`; the isolated full replay completes (NOTICE `Belum ada aturan SLIK: baseline Januari 2026 dilewati`). Fail-closed probe: with a published SLIK rule for February 2026 and no January period, the migration still raises `Periode Januari 2026 tidak ditemukan`.
- [x] **T3:** The seed script re-runs `160000` and `163000` while the baseline is missing. Run against the isolated stack (a copy pointed at port 55322 in an unlinked folder; the repo itself is linked to production, so the script's guard refuses there): `published | Baseline SLIK Januari 2026 … | 13`. A second run applies nothing.
- [x] **T4:** CI step blocking; skill note; `git diff --check`.
- [x] **T5:** PR #46 CI run 38041303023: the blocking replay step passed (`Started supabase local development setup.`).
