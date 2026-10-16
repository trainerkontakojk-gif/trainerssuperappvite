# Root-cause cluster for HOLD / waiting-time findings

Lane: **C**. This changes a shared cluster enum used by the SIDAK agent detail, the TNA drill-down, TNA need validation (zod) and `tna_programs.trigger_clusters`.
Status: **implemented, not committed** (2026-10-17). Decisions: D1 = include `waktu tunggu` + `dead air`; D2 = (a) no program/migration; D3 = reword unit case; D4 = optional audit by Fajar.

## Requirement

### Problem

In production on 2026-10-08 (read-only), all 4 findings for TNA parameter "Etika Bertelepon" (Call, Oktober 2026) landed in `lainnya`. Their text reads like:

- "Agent melakukan HOLD pertama selama 01.04 menit"
- "Seharusnya agent melakukan HOLD pertama max 60 detik"

None of the 7 clusters in `ROOT_CAUSE_REGISTRY` has a HOLD/waiting-time keyword. As a result:

- SIDAK "Akar masalah" shows these findings as "Lainnya".
- The TNA drill-down suggests `lainnya`, so `suggested_cluster_id` is `lainnya` and no program is suggested.
- A trainer cannot pick a HOLD cause in the validation form, because `tnaClusterIdSchema` rejects any id it does not list.

### Inventory (read-only, no production queries)

| Source                                                                                                               | Finding                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.hermes/reports/sidak-root-cause-coverage-20260709-final-v2.{md,json}` (last live audit, n=2807 rows with evidence) | `lainnya` = 491 (17.49%). Call has the highest volume of fallback rows: 215/877 (24.52%).                                                                                                                                                                      |
| Same report, top fallback phrases                                                                                    | `menit` occurs in **115** of the 491 fallback rows. It is the only time-unit token in the top 20 and the strongest HOLD signal available. Only sample ids are stored, not the text, so this is an upper bound and not every row is confirmed to be about HOLD. |
| `supabase/seeds/006_qa_temuan.sql` (local seed)                                                                      | 5 rows, none about HOLD or waiting time.                                                                                                                                                                                                                       |
| Local Supabase                                                                                                       | No `supabase_db` container is running, so there was no local `qa_temuan` to query.                                                                                                                                                                             |
| `apps/api/src/__tests__/sidak-agent-root-causes.test.ts:593`                                                         | "Agent tidak sesuai dalam melakukan HOLD pertama." is currently expected to map to `salah_jawaban`, through the generic `tidak sesuai dalam melakukan` keyword.                                                                                                |
| Telefun (`apps/api/src/lib/telefun-hold-assessment.ts`, `HoldStatusDisplay.tsx`)                                     | The house standard is a first hold of at most 1 minute and later holds of at most 3 minutes. This agrees with the "max 60 detik" wording.                                                                                                                      |

Phrasing variants:

- **Confirmed** from production text and repo fixtures: `HOLD pertama`, `melakukan HOLD`, `tidak sesuai dalam melakukan HOLD`, durations written as `01.04 menit` (normalized to `01 04 menit`) and `max 60 detik`.
- **Not confirmed** by any local data: `menunggu`, `waktu tunggu`, `dead air`. They are plausible, but no evidence was available offline.

### Acceptance criteria

1. A finding whose text contains a HOLD phrase maps to the new cluster in both `deriveAgentRootCauses` consumers: SIDAK `GET /api/v1/sidak/agents/:id` (`rootCauses`) and TNA `GET /api/v1/tna/parameters/:indicatorId` (`clusters`). The 4 production-like texts above all map there.
2. Existing assignments do not change for non-HOLD control findings: APPK → `salah_penggunaan_sistem`, `tidak melakukan probing` → `kurang_menggali`, `salah memilih` → `salah_jawaban`, `tidak melampirkan` → `kurang_teliti_verifikasi_data`, and unmatched text → `lainnya`.
3. `POST /api/v1/tna/needs` accepts `validated_cluster_id: "hold_waktu_tunggu"`. Today it returns 400. The TNA validation form lists it, and the need page shows its label.
4. No database migration is needed for the enum itself (verified below).
5. Clustering stays deterministic, uses no AI, and keeps the same matching and sorting algorithm.

## Design

### Database: no CHECK on cluster ids (verified)

- `tna_needs.suggested_cluster_id` / `validated_cluster_id` are plain `text` (`20261008120000_tna_phase1.sql:31`), with no CHECK.
- `tna_programs.trigger_clusters` is `text[]` with no CHECK (`:19`).
- `tna_create_need` passes the payload through as-is, in both `20261008120000` and `20261012150000_tna_need_previous_plan.sql`.
- No later migration adds a cluster constraint (checked with `git grep cluster -- supabase/migrations`).

The enum is enforced only in zod (`tnaClusterIdSchema`). Adding a value therefore needs **no migration**. A migration is needed only if a program should trigger on the new cluster (decision D2).

### Cluster

| Field          | Value                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id             | `hold_waktu_tunggu`                                                                                                                                                                                                           |
| label          | `Durasi hold/waktu tunggu melebihi standar`                                                                                                                                                                                   |
| priority       | `9`: above `salah_jawaban` (8), so a 1-1 tie on HOLD text goes to HOLD; below `salah_nama_perusahaan_produk` (10). Placed after `salah_penggunaan_sistem` in the registry, so that cluster keeps a 9-9 tie on registry order. |
| recommendation | `Latih manajemen hold: minta izin sebelum hold, batasi hold pertama maksimal 60 detik dan hold berikutnya sesuai standar, kembali ke konsumen tepat waktu, dan hindari dead air.`                                             |

Keywords are matched as substrings after normalization, which lowercases the text and replaces punctuation with spaces. Bare words are avoided on purpose:

- **Proposed:** `melakukan hold`, `hold pertama`, `hold kedua`, `hold berikutnya`, `durasi hold`, `waktu hold`, `fitur hold`, `waktu tunggu`, `dead air` (D1).
- **Excluded:**
  - bare `hold`: it is a substring of `threshold`/`stakeholder`, and the matcher has no word boundaries.
  - bare `menunggu`: it is ambiguous ("menunggu konfirmasi/informasi" are follow-up or escalation findings, not waiting time).
  - bare `menit`/`detik`: these also appear in SLA, callback and AHT findings.

How the matcher scores the cases (most keyword matches wins; priority breaks ties):

- "Agent melakukan HOLD pertama selama 01.04 menit": `melakukan hold` + `hold pertama` = 2 matches → `hold_waktu_tunggu`.
- "Agent tidak sesuai dalam melakukan HOLD pertama.": HOLD 2 vs `salah_jawaban` 1 → **moves to `hold_waktu_tunggu`**. This is intended, but it flips the existing unit expectation at `sidak-agent-root-causes.test.ts:593` (D3).
- Non-HOLD texts match none of the new keywords, so their assignment is unchanged.

### One source for the cluster-id list (drift fix)

Today the id list is written out twice: the `RootCauseClusterId` union (`packages/types/src/sidak.ts:588`) and `tnaClusterIdSchema` (`packages/types/src/tna.ts:28`). There is also an untyped label map, `clusterLabels` (`apps/web/src/routes/tna/utils.ts:42`). The change:

- `sidak.ts`: `export const rootCauseClusterIds = [...] as const; export type RootCauseClusterId = (typeof rootCauseClusterIds)[number];`
- `tna.ts`: `tnaClusterIdSchema = z.enum(rootCauseClusterIds)`.
- `utils.ts`: `clusterLabels: Record<RootCauseClusterId, string>`, so a missing label becomes a type error. Add `hold_waktu_tunggu: "Durasi hold/waktu tunggu"`.

### Other touch points

- `scripts/sidak/audit-root-cause-coverage.mjs`: mirror the registry entry (the script says to keep it in sync).
- `docs/SIDAK_LOGIC_AND_SCORING.md` ("Klaster" list, keyword section): add the cluster.
- The SIDAK UI renders `label` from the API, so no web change is needed there.

### E2E proof (RED-first, local real backend only)

Run with `apps/web/playwright.api.config.ts`, never the default config, against a local `supabase start` only. Both specs import the Hono app in-process, the same way `tna-needs-api.spec.ts` does.

1. **`apps/web/e2e/tna-root-cause-hold-api.spec.ts`** (picked up by the existing `tna-real-backend` project via `tna-*-api.spec.ts`; no config change):
   - Seed through `createTnaFixture` (extended if it lacks a Call indicator) with one Call indicator "Etika Bertelepon" and one agent with:
     - 4 HOLD findings (the production-like texts above, including `01.04 menit` and `max 60 detik`);
     - 1 finding for each control cluster (APPK, probing, salah memilih, tidak melampirkan);
     - 1 unmatched finding → `lainnya`.
   - Assert that `GET /api/v1/sidak/agents/:id` `rootCauses` contains `hold_waktu_tunggu` with `findingsCount` 4, and that every control finding stays in its original cluster.
   - Assert that `GET /api/v1/tna/parameters/:id` for that indicator puts the same 4 findings in `hold_waktu_tunggu`, and that `suggested_cluster_id` on the created need is `hold_waktu_tunggu`.
   - Assert that `POST /api/v1/tna/needs` with `validated_cluster_id: "hold_waktu_tunggu"` returns 201 and the row persists.
   - **RED today:** the rows land in `lainnya`, and the POST returns 400.
2. Afterwards, re-run the existing TNA specs whose payloads use cluster ids: `tna-needs-api`, `tna-plan-api`, `tna-evaluation-flow-api`. One Playwright run at a time.

## Open decisions (Fajar)

- **D1 – `dead air` / `waktu tunggu` keywords.** Include them now without offline evidence (recommended: both describe customer waiting), or ship only the confirmed HOLD phrases?
- **D2 – TNA program trigger.** No current program lists `hold_waktu_tunggu`, so a HOLD-only parameter will get no `suggested_programs`. Options:
  - (a) leave it for now (no migration);
  - (b) a new migration plus rollback that adds a program, e.g. `manajemen-hold-call`: "Manajemen Hold & Waktu Tunggu", gap `skill`, `service_types {call}`, modules `{telefun}`, since Telefun already assesses hold;
  - (c) append the cluster to an existing program, e.g. `coaching-individu`.

  Options (b) and (c) need `supabase-migration`, a paired rollback and a local replay. Applying them to remote/production is a separate authorization.

- **D3 – existing unit test at `sidak-agent-root-causes.test.ts:593`.** Its expectation becomes wrong. Proposed: change it to a non-HOLD sentence (e.g. "Agent tidak sesuai dalam melakukan konfirmasi ulang.") so it still covers `tidak sesuai dalam melakukan` → `salah_jawaban`, and let E2E own the HOLD behaviour. Editing or running that unit file needs your OK per AGENTS.md.
- **D4 – coverage measurement.** I will not query production. Optionally, Fajar runs this after merge (read-only) to measure the new `lainnya` share:

  ```bash
  node scripts/sidak/audit-root-cause-coverage.mjs --limit 5000 --label after-hold-cluster
  ```

## Tasklist

- [x] Fajar approves the design and answers D1–D3.
- [x] Load `trainers-superapp-tdd`; impact of `RootCauseClusterId` / `tnaClusterIdSchema` traced with `git grep` (Graphify query not used; `graphify update .` run at end).
- [x] `supabase start -x vector,logflare` (local), then write `tna-root-cause-hold-api.spec.ts`.
- [x] RED: both tests failed on the cluster-count assertion (`lainnya` 4, `salah_jawaban` 2, no `hold_waktu_tunggu`); the POST step was not reached, so its 400 was not observed.
- [x] Types: `rootCauseClusterIds` const in `sidak.ts`, and `tnaClusterIdSchema` derived from it.
- [x] Registry: add the `hold_waktu_tunggu` entry in `agent-root-causes.ts`.
- [x] Web: type `clusterLabels` as `Record<RootCauseClusterId, string>` and add the label.
- [x] Mirror the entry in `audit-root-cause-coverage.mjs`, and update `docs/SIDAK_LOGIC_AND_SCORING.md`.
- [x] D3: adjust the unit expectation (only if approved).
- [x] D2: not needed (option a).
- [x] GREEN: new spec 2/2; full `tna-real-backend` project 58/58 (one run); tsc types/api/web exit 0; `pnpm lint` 0 errors; `git diff --check` clean.
- [x] `thermo-nuclear` review, then `graphify update .`.
- [ ] Report evidence (done in session). Commit only on Fajar's approval (per this task's instruction).
