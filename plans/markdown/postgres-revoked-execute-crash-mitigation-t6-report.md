# T6 report: handoff (2026-10-10)

- **Status: handoff complete. The production migration is NOT applied — it waits on Fajar's rollout window.** No production write occurred in this task; every production statement was a read-only catalog query plus a TEMP-only atomicity probe that created no persistent object.
- **Lane:** D, approved plan `postgres-revoked-execute-crash-mitigation.md`.
- **Shipped:** commit `78277ed` on `fix/postgres-revoked-execute-guard`, PR #38 (14 files, +6679/−0). No `.env`, `scratch/`, `supabase/.temp/`, or `.claude/launch.json` is included.
- **Scope:** handoff only — evidence, rollout commands, rollback path. No product/spec/migration edit, no E2E rerun.

## 1. Production catalog preflight — EXECUTED (read-only)

```bash
cd ~/Downloads/_Projects/trainerssuperappvite
supabase db query --linked -o table -f scratch/prod-preflight/preflight.sql
```

Target verified before running: `supabase/.temp/project-ref` = `ruosnjmtywcrghjgqugz` (production, per Fajar's 2026-10-08 confirmation), `linked-project.json` ref matches, CLI 2.98.2. The file contains catalog `SELECT`s only (`pg_proc`, `pg_namespace`, `supabase_migrations.schema_migrations`, `to_regprocedure`, `to_regnamespace`, `has_function_privilege`); it calls no application function.

Result: **45 rows = 44 `ok` + 1 `info`**, zero review-required statuses.

| Check | Rows | Result |
| --- | --- | --- |
| Group A signatures | 34 | all `ok` — owner `postgres`, `md5(prosrc)` identical to the repo snapshot |
| Group B signatures | 8 | all `ok` — `anon=false`, `auth=true` (exactly the state migration 2 fixes) |
| `MISSING` / `OWNER_NOT_POSTGRES` / `BODY_DIFFERS_FROM_REPO` | 0 | none |
| `UNLISTED` (`WOULD_FAIL_GLOBAL_CHECK`) | 0 | none — migration 2's global self-check cannot abort on an outsider |
| history `20261008150000` / `20261008150001` | 1 | `ok` — neither version is recorded in production yet |
| schema `app_internal` | 1 | `ok` — does not exist in production yet |
| version | 1 | `info` — `current_setting('server_version')` = `17.6` |

Interpretation:

- Production bodies are byte-identical to the repo for all 34 Group A functions, so migration 1 overwrites no divergent production logic.
- Neither migration is recorded and `app_internal` is absent → clean pre-state, the same pre-state T2/T3 already applied successfully locally.
- Group B is the pre-T3 state (`anon` revoked for all 8, `authenticated` retained), which is what migration 2 restores.

Evidence: raw CLI output at `scratch/prod-preflight/preflight.production.out`, SHA-256 `f736920819c943579076c13e69fa3a822fdf80a2161832768472fa1003d841ee`. It sits under gitignored `scratch/`, so it is local evidence, not a portable PR attachment.

Caveat: `current_setting('server_version')` reports only `17.6`, so this run does **not** verify the patch level `17.6.1.121` Fajar confirmed. It does not change the decision — the migration is safe on unaffected versions too.

## 2. Execution-path verification (why the rollout commands look the way they do)

Checked against the live CLI, read-only:

| Probe | Result |
| --- | --- |
| `supabase db query --linked -f <multi-statement file>` | **works** — the whole file runs as one server-side batch |
| `supabase db query --local -f <multi-statement file>` | **fails** — `ERROR: cannot insert multiple commands into a prepared statement` (SQLSTATE 42601) |
| atomicity probe on production: `BEGIN; CREATE TEMP TABLE …; INSERT …; SELECT count(*) …; ROLLBACK;` | exit 0; the temp table is visible to the next statement of the same batch (single session), and `to_regclass('public.t6_tx_probe')` = `ABSENT` afterwards — **no persistent object created** |

Consequences:

- The migration files contain no `BEGIN`/`COMMIT`, and migration 1's header requires the file **and its history row to commit in one transaction**, so the wrappers below add `BEGIN; … COMMIT;` explicitly.
- `supabase db query --local` cannot rehearse a wrapper (multi-statement unsupported); local rehearsal uses `psql` / `docker exec … psql -f -`. `--linked` (production) is the path that supports multi-statement batches.
- `supabase db push` stays forbidden: production migration history is out of sync with the repo (TNA precedent).

## 3. Rollout procedure — NOT executed

Generator: `scratch/prod-preflight/make-rollout-sql.py` (gitignored helper) builds each wrapper and refuses to build if its dollar-quote tag occurs in the SQL.

```bash
cd ~/Downloads/_Projects/trainerssuperappvite

# 0. Re-run the preflight if time has passed since the check above; must be all ok/info
supabase db query --linked -o table -f scratch/prod-preflight/preflight.sql

# 1. Migration 1 (app_internal schema + guard + 34 Group A + Q3 move), one transaction
python3 scratch/prod-preflight/make-rollout-sql.py apply 20261008150000
supabase db query --linked -f scratch/prod-preflight/apply-20261008150000.sql

# 2. Verify step 1 (app_internal present, both versions recorded, every row ok)
supabase db query --linked -o table -f scratch/prod-preflight/preflight.sql

# 3. Migration 2 (7 anon grants + global self-check), one transaction
python3 scratch/prod-preflight/make-rollout-sql.py apply 20261008150001
supabase db query --linked -f scratch/prod-preflight/apply-20261008150001.sql

# 4. Verify step 3 (Group B now anon=true, no new non-ok row)
supabase db query --linked -o table -f scratch/prod-preflight/preflight.sql
```

After step 1 the preflight reports `app_internal` as `EXISTS_ALREADY` and history as `ALREADY_APPLIED`; that is the expected post-migration state, not a failure. Apply the two migrations one at a time and verify between them — migration 2's global self-check assumes migration 1 already guarded Group A.

Rollback (only with Fajar's approval; each wrapper deletes its own history row in the same transaction):

```bash
python3 scratch/prod-preflight/make-rollout-sql.py rollback 20261008150001   # revoke the 7 anon grants
python3 scratch/prod-preflight/make-rollout-sql.py rollback 20261008150000   # restore pre-T2 bodies/ACLs
```

Both rollback files carry the crash-exposure warning: restoring revoked EXECUTE on exposed RPCs reintroduces the crash risk.

Fallback if `db query --linked` ever refuses a wrapper: paste the same wrapper file into the Supabase Dashboard SQL editor for `ruosnjmtywcrghjgqugz`, which runs multi-statement batches in one session. Never split a wrapper into separate runs — that loses the atomic file+history guarantee.

## 4. Wrapper verification performed locally

| Rehearsal | Result |
| --- | --- |
| `dryrun-20261008150001.sql` via `psql -v ON_ERROR_STOP=1 -f -` | exit **0**; the dummy history row rolled back |
| `dryrun-20261008150000.sql` via `psql` | exit **3** at line 1967 — `function public.get_leader_approved_scope_items(uuid, text) does not exist` — **expected**: the local DB already has the Q3 move, so migration 1 is not re-runnable there. `ON_ERROR_STOP` aborted the transaction and left nothing behind |
| history-insert mechanism for the 173 KB migration-1 text (dummy version, rolled back) | exit **0**, `length(statements[1])` = 86,539 bytes, dummy row absent afterwards |
| local state after all rehearsals | unchanged: 2 history rows (`20261008150000`, `20261008150001`), 0 exposed functions without anon/authenticated EXECUTE, `anon` EXECUTE on `public.bulk_reorder_profiler_peserta(jsonb)` still granted |

Wrapper mechanics and the history-row write are therefore proven; migration 1's forward path on the production pre-state is already proven by T2 (applied locally against exactly that pre-state). Nothing above touched production except the read-only catalog queries and the TEMP-only atomicity probe.

## 5. Post-rollout checks (required)

- Re-run the preflight (step 4) and confirm `anon=true` for the 7 restored functions.
- **Telefun smoke check on staging or production immediately after the rollout.** T4 accepted the original-caller coverage gap for the durable Telefun lifecycle (A1–A14, A17–A20) on the basis that those paths are verified in staging at deploy — this is that check. Nothing in this task exercised a real Telefun session against production.
- Confirm no revoked-EXECUTE crash signature in the production logs for the rollout window (the same signature set the T4 runner greps for).
- P3 stays open by decision: `pg_graphql` visibility of guarded functions is documented, not hardened (optional `@graphql` omit directive is Fajar's call).

## 6. What still needs Fajar

1. Rollout window for production — the migration itself is not applied.
2. A Telefun staging/production verification slot right after the rollout.
3. Merge of PR #38 (does not touch production; safe any time).
4. Optional: confirm patch level `17.6.1.121` out of band.
