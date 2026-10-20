# EFEK — garis pembanding menjadi rata-rata layanan

Lane D: report API semantics change shared by api/types/web. No schema, migration, RLS, permission, or SIDAK scoring change. Applies to all four EFEK programs: KETIK (chat), PDKT (email), Telefun (call), CERIWIS (cso).

## Problem

The dashed line in the EFEK charts ("Agent {SERVICE} lain") and the Δ relatif metric compare participants with agents of the same service **who never joined any session of that program** (`programPeople` in `apps/api/src/services/efek/report.ts`, ~L266–312). Once most agents of a service have joined the program, that group is empty for recent months. The comparison becomes `null` and the dashed line stops. Seen in production on CERIWIS: the dashed line ends at −1 in both charts (QA score and findings per session), and Δ relatif cannot be computed for most participants.

## Decision (approved by Fajar, 2026-10-20)

Replace the "non-participants" comparison with the **service average for the same calendar month**:

- **Score:** the equal-weight mean of the monthly SIDAK `finalScore` of every agent audited in that service and month. This includes participants of any program, and it includes agents excluded through the analysis-exclusion filter. It still drops staff rejected by `isAgentExcluded` (QA, TL, trainer, …), exactly like the current `byMonth` filter in `loadScores`.
- **Findings per session:** the pooled Σ countable findings / Σ audit sessions of the same set of agents.
- **Not a control group:** the average includes the participants, so the gap from the average is indicative and understates training effect when most of the service trained. The UI must say this plainly.
- **Same rule for every program:** KETIK, PDKT, Telefun, and CERIWIS all use this rule. The code is already generic over `service_type`; no per-program branching.

## Contract

- **Field names stay** (`comparison_score`, `comparison_findings_per_session`, `comparison_delta`, `relative_delta`, `avg_relative_delta`, `months[].comparison_score`) to avoid an API/type rename. Update their JSDoc in `packages/types/src/efek.ts` to say "rata-rata layanan pada bulan kalender yang sama (termasuk peserta)".
- **`comparison_delta`:** service average after − before, averaged over the participant's own months with data (unchanged mechanics).
- **`relative_delta`:** Δ peserta − Δ rata-rata layanan.
- **Chart behavior is unchanged:** chart points still average only the months where included participants have data, so a dashed point exists wherever a solid point exists and the service had audits that month.
- **Exclusions:** exclusions still only change which participants enter program/session metrics and charts. They never change the service average.

## Implementation

### Backend — `apps/api/src/services/efek/report.ts`

1. Delete `programPeople` and the per-program `exclude` filter. Key the `comparisons` cache by `${service}|${index}` only and rename the helper to something like `serviceAverage(service, index)`. Drop the `code` argument at both call sites (`months` mapping and `side()`).
2. Keep `byMonth` exactly as built in `loadScores` (already excludes `isAgentExcluded` staff and already contains participants). Score = `mean(rows.map(r => r.score))`; findings per session = `ratio(Σfindings, Σsessions)`.
3. Update the file header comment ("compares … with agents of the same service who never joined that program") and the `Comparison` naming/comments to the service-average meaning.
4. No other logic changes: status thresholds, thin flag, windows, `current` month cutoff, and exclusions stay as they are.

### Shared types — `packages/types/src/efek.ts`

JSDoc only (see Contract). No shape change.

### Web — labels and copy (all four programs)

Replace every "Agent {service} lain" / "agent lain" phrase with the service-average wording:

| Place                                                   | Now                                                                      | New                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `efek-program.tsx` ~L184, ~L194 chart `comparisonLabel` | `Agent ${service} lain`                                                  | `Rata-rata layanan ${service}`                                                                                                                                                                        |
| `efek-program.tsx` ~L393 monthly table header           | `Agent lain`                                                             | `Rata-rata layanan`                                                                                                                                                                                   |
| `efek-report-ui.tsx` ~L171 summary stat                 | `Δ relatif agent lain`                                                   | `Δ relatif rata-rata layanan`                                                                                                                                                                         |
| `efek-report-ui.tsx` ~L186–188 `RelativeChart` comment  | non-joiners (dashed)                                                     | service average (dashed)                                                                                                                                                                              |
| `efek-export.ts` ~L93 `comparisonLabel`                 | `Agent ${service} lain`                                                  | `Rata-rata layanan ${service}`                                                                                                                                                                        |
| `efek-export.ts` ~L116 stat                             | `Δ relatif agent lain`                                                   | `Δ relatif rata-rata layanan`                                                                                                                                                                         |
| `efek-export.ts` ~L124 note                             | `… dikurangi perubahan agent {service} lain yang tidak ikut {program} …` | `Δ relatif = perubahan peserta dikurangi perubahan rata-rata layanan {service} pada bulan yang sama. Rata-rata layanan mencakup semua agent yang diaudit, termasuk peserta, jadi bersifat indikatif.` |
| `efek-export.ts` ~L155 monthly table header             | `Agent lain`                                                             | `Rata-rata layanan`                                                                                                                                                                                   |
| `efek.tsx` ~L38 page description                        | `… dibandingkan dengan agent lain di layanan yang sama.`                 | `… dibandingkan dengan rata-rata layanan yang sama pada bulan yang sama.`                                                                                                                             |

- **Caption:** next to the existing "Sumbu bawah dihitung dari bulan pelatihan…" caption on the program page, and in the export, add one sentence: "Garis putus-putus = rata-rata semua agent {service} yang diaudit pada bulan yang sama, termasuk peserta."
- **Service names:** `${service}` is the existing human service label already used on that page (Chat / Email / Call / CSO); reuse it, do not hardcode program names.
- **Out of scope:** `apps/web/src/routes/tna/Evaluation.tsx` ("Kelompok pembanding") belongs to TNA phase 2 evaluation, a different engine. Do not touch it.
- **Final check:** `grep -rn -i "agent lain\|CSO lain\|tidak ikut" apps/web/src/routes/tna/efek*` must return nothing EFEK-comparison related.

### Docs

- **`plans/markdown/efek.md` "Comparison" bullet (~L51–53):** rewrite to the service-average rule, plus a dated note (2026-10-20) explaining why (empty non-participant group once most of the service trained). Also adjust "Excluded staff … are never comparison peers" to "never part of the service average".
- **`docs/modules.md` §10 (~L306):** replace "Kelompok pembanding tetap agent layanan yang sama yang tidak pernah mengikuti program; agent yang dikecualikan dari analisis tidak berpindah ke kelompok pembanding." with the service-average rule, and note that exclusions do not change the service average.
- **This file:** check off the tasklist and record evidence at the end.
- **`CHANGELOG.md`:** add an entry under 2026-10-20 (or the commit date), e.g. `- fix(efek): compare participants with the monthly service average so the baseline no longer disappears once most agents have trained`.

## Tests (E2E only, RED first)

Follow `trainers-superapp-tdd`. Run serially, loopback only (`one-test-run.sh` blocks parallel runs). Never point at production. Run from `apps/web` with `pnpm exec playwright test <spec> -g "<name>"`. Do not add or run unit tests.

### Real backend — `apps/web/e2e/tna-efek-report-api.spec.ts` (`--config playwright.api.config.ts`)

1. **Update existing KETIK expectations.** Putri and Budi (non-participants) stay in the fixture, but now Sari, Dimas, and Andi also count toward the chat average. Recompute by hand from the seeded temuan and write the arithmetic as a short comment above each changed number:
   - `comparison_score` in `sari.months[0]`;
   - `comparison_delta` / `relative_delta` for Sari and Dimas;
   - `avg_relative_delta` in the summary and in the exclusions test;
   - chart points at −1 and +3 (`comparison_score`, `comparison_findings_per_session`).

   Rename the comment "Putri and Budi never joined KETIK, so they form the comparison group only" to say they only appear in the service average.

2. **New regression — the CERIWIS production bug.** Seed a 2019 CERIWIS (`cso`) session where **every** CSO agent audited in the window is a participant (no non-participant CSO temuan). Assert:
   - `chart` has non-null `comparison_score` and `comparison_findings_per_session` at offsets 0, +1, +2, +3 (old code: null);
   - the value equals the participants' own monthly mean at each offset;
   - participant `relative_delta` is non-null.

   This must fail on current `main` (RED) before the backend change.

3. **New — every program uses the rule.** For PDKT (`email`) and Telefun (`call`), seed one participant plus one non-participant agent with one month before and one month after. Assert `comparison_score` at those offsets = mean of both agents' scores, and `relative_delta` = Δ peserta − Δ average. Keep it minimal: one test, two programs via a loop or `for` over `[["pdkt","email"],["telefun","call"]]`.
4. **Exclusions keep the average fixed.** In the existing exclusions test, assert the excluded participant's scores still feed the service average: `comparison_score` at −1 is identical with and without the `exclusions` query. Update the test title from "…without … changing the comparison group" to "…without changing the service average".
5. **Fixture isolation.** All new rows stay in 2019 with the spec's `ns` tag and are removed in the existing cleanup. Pin the same 2019 rule snapshot pattern already used; add CSO/email/call indicator rows only if the snapshot lacks them.

### Browser, hermetic — `apps/web/e2e/tna-efek.spec.ts`

1. **Labels and caption.** Update mocked-label assertions to the new copy. Add assertions that the KETIK program page shows legend text "Rata-rata layanan Chat", the monthly table header "Rata-rata layanan", the summary stat "Δ relatif rata-rata layanan", and the new caption sentence.
2. **Export.** Assert the exported HTML contains "Rata-rata layanan Chat" and the new Δ relatif note, and does **not** contain "agent lain".
3. **One more program.** Open `/tna/efek/program/ceriwis` (mock) and assert the legend reads "Rata-rata layanan CSO", so label generation is proven for a non-KETIK program.
4. **Screenshot artifacts.** Capture locator screenshots of the chart region at 390px and 1280px as in the exclusions plan.

## Tasklist

- [ ] Load `trainers-superapp-tdd`; Graphify query on `apps/api/src/services/efek/report.ts` to confirm callers (routes `efek.ts`, `tna.ts`, `sidak/dashboard.ts` training quickview) are unaffected beyond values.
- [ ] RED: API tests 2–4 and updated browser label assertions. Record failing output.
- [ ] GREEN: backend change, type JSDoc, web copy and caption, export.
- [ ] Update KETIK expected numbers with arithmetic comments; run the full `tna-efek-report-api.spec.ts` and `tna-efek-api.spec.ts`, then `tna-efek.spec.ts`, serially.
- [ ] Also run `sidak-agent-efek-training.spec.ts` (shares EFEK services) to confirm no regression.
- [ ] `thermo-nuclear` review and `impeccable` audit on the changed UI copy/caption.
- [ ] `pnpm exec turbo run typecheck lint build --concurrency=1`, `GRAPHIFY_MAX_WORKERS=1 graphify update .`, `git diff --check`.
- [ ] Docs + CHANGELOG; record exact commands, exit codes, and pass counts below.

## Non-goals

- No new "non-participant" toggle or second dashed line. If Fajar later wants both, that is a separate plan.
- No change to TNA phase 2 evaluation cohorts (`Evaluation.tsx`, `docs/modules.md` ~L293).
- No migration, no production query, no deploy.

## Evidence

_(to be filled by the implementer)_
