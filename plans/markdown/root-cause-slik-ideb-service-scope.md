# Scope the `proses_ideb_slik` cluster to SLIK findings

Lane: **C**. This changes the shared matcher in `apps/api/src/services/sidak/agent-root-causes.ts`, which feeds both the SIDAK agent detail and the TNA drill-down. It follows up on [`root-cause-slik-ideb-cluster.md`](root-cause-slik-ideb-cluster.md).
Status: **implemented** (2026-10-17). D1 = (a), approved by Fajar. Awaiting Fajar's audit re-run (step 5).

## Requirement

### Problem

The `proses_ideb_slik` cluster was meant only for the SLIK back-office SOP: verifying iDeb registrations, writing rejection reasons, and sending results. Bare `ideb`/`slik` were left out so that Call findings where an agent _explains_ iDeb to a consumer would not match.

Fajar's read-only audit of 2026-10-17 shows that these Call findings match anyway. The audit was `--sample-cluster proses_ideb_slik --sample-service call` (report `.hermes/reports/sidak-root-cause-coverage-20261016-ideb-call.md`, gitignored), over the same 2796 rows and with fallback at 482 = 17.24%.

- The cluster wins **17 Call rows**.
- Matched keywords: `ideb slik` 17/17, `hasil ideb` 5, `pendaftaran ideb` 1, `permohonan ideb` 1. Call agents and QA use the term "iDeb SLIK" with consumers, so the multi-word keywords do not keep them out.
- Without the cluster, these rows would go to `lainnya` 13, `kurang_menggali` 2, `kurang_teliti_verifikasi_data` 1 and `kurang_paham_standar_jawaban` 1.

### Classification of the 17 Call rows

**None of them is the iDeb SOP.** Every row is consumer-facing service: an agent answering, explaining, probing, listening or recording about the consumer's own iDeb SLIK report.

| Indicator                                          | Rows | Typical finding (paraphrased)                                                                                                        |
| -------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------ |
| Kemampuan Menjelaskan                              |    4 | Explanation of SLIK update timing or collectibility was unclear or inconsistent; the agent said "BI Checking" instead of "iDeb SLIK" |
| Keakuratan Solusi / Informasi                      |    4 | Incomplete or wrong answer: re-request limit (7 days), "Data Tidak Ditemukan", facilities under Rp1 juta hidden (SJ 157)             |
| Kemampuan Pencatatan - Kesesuaian Kategori Layanan |    4 | Deskripsi too general, typos, or the consumer's iDeb registration number not recorded                                                |
| Kemampuan Bertanya dan Menganalisa                 |    3 | No mandatory or follow-up probing on a disputed loan listed in the consumer's iDeb                                                   |
| Kemampuan Menyimak                                 |    1 | Didn't listen to the consumer's point about a lender listed in SLIK                                                                  |
| Pilihan Kata & Tata Bahasa                         |    1 | Probing question about the iDeb report not structured                                                                                |

Their training needs are communication, answer accuracy, probing and recording, not the back-office verification SOP. The cluster's recommendation ("cek kesesuaian foto … lampirkan alasan penolakan …") is wrong for all of them.

### Acceptance criteria

1. A Call finding whose text mentions "iDeb SLIK" / "hasil iDeb SLIK" no longer maps to `proses_ideb_slik`, in both SIDAK `GET /api/v1/sidak/agents/:id` and TNA `GET /api/v1/tna/parameters/:indicatorId`.
2. That Call finding keeps the cluster its other keywords give it. "tidak melakukan probing lanjutan … IDEB SLIK" → `kurang_menggali`, and a text with no other keyword → `lainnya`.
3. Every existing assertion in `apps/web/e2e/tna-root-cause-slik-api.spec.ts` (SLIK rows, controls, TNA validation) still passes unchanged.
4. Clustering stays deterministic and keyword-based. Only clusters that declare a service scope are affected.
5. Fajar's audit re-run shows `lainnya` < 20%. The expected value is 495/2796 = **17.70%**, see Projection.

## Decision D1: how to keep Call rows out

**(a) Recommended: limit the cluster to `service_type = "slik"`.**

- Add an optional `serviceTypes?: ServiceType[]` to `RegistryEntry`. `matchCluster` skips an entry when the row's `service_type` is not in it. Entries without the field behave as today.
- Set `serviceTypes: ["slik"]` only on `proses_ideb_slik`. The keywords stay unchanged.
- SLIK assignments stay exactly as they are, and the audit numbers are known in advance.

**(b) Drop keywords. Rejected.**

- Clearing all 17 rows means dropping `ideb slik`, `hasil ideb`, `pendaftaran ideb` and `permohonan ideb`. That leaves only `alasan penolakan`, `gagal verifikasi` and `foto diri mengikuti gambar`.
- Most SLIK rows match through indicator names that contain `permohonan ideb` / `ideb slik` / `hasil ideb`. Up to about 200 of the 203 SLIK rows could fall back to `lainnya`, which is about 24% and above the target.
- The Call text would still be able to match `alasan penolakan` (a consumer's loan rejection).

## Projection for (a)

- Only `call`/`slik` rows came from `lainnya` (216 = 203 SLIK + 13 Call). So scoping returns exactly **13 rows to fallback**: 482 + 13 = 495/2796 = 17.70%, under the limit of 559.
- The 4 other Call rows go back to `kurang_menggali` (2), `kurang_teliti_verifikasi_data` (1) and `kurang_paham_standar_jawaban` (1).
- 33 rows left existing clusters: 4 Call, and 29 others. Before the change only 28 SLIK rows matched a cluster, so **at least one row from another service (chat/email/…) also moved into `proses_ideb_slik`**. Scoping returns it to its previous cluster, not to `lainnya`, so fallback is unaffected. Optional check: Fajar runs `--sample-cluster proses_ideb_slik` without `--sample-service` to see it.

## Implementation (after Fajar approves D1)

1. **RED.** Extend `apps/web/e2e/tna-root-cause-slik-api.spec.ts` with Call rows. Use a Call indicator (for example `Kemampuan Menjelaskan ${namespace}`), seeded the same way under `service_type = 'call'`, for an agent or period with no other spec-owned Call rows. Check the fixture first. Add two rows:
   - a consumer explanation with "hasil iDeb SLIK" and no other keyword → expect `lainnya`;
   - "Agent tidak melakukan probing lanjutan … tercantum dalam IDEB SLIK" → expect `kurang_menggali`.

   Assert both in SIDAK agent detail (`service_type=call`) and in the TNA drill-down for that indicator. Run it and see it fail today:
   `pnpm --filter @trainers/web exec playwright test -c playwright.api.config.ts --project=tna-real-backend tna-root-cause-slik-api.spec.ts` (local Supabase only, one run at a time).

2. **GREEN.**
   - In `agent-root-causes.ts`, add `serviceTypes?` to `RegistryEntry` and pass `row.service_type` into `matchCluster`. Set `serviceTypes: ["slik"]` on `proses_ideb_slik`.
   - Mirror the same change in the registry and matcher of `scripts/sidak/audit-root-cause-coverage.mjs`, so the audit matches the API.
3. **Docs.** Note the service scope under the cluster in `docs/SIDAK_LOGIC_AND_SCORING.md`. Set this plan's status and add a follow-up line to `root-cause-slik-ideb-cluster.md`.
4. **Gates.**
   - `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json`
   - the focused spec GREEN
   - `node scripts/sidak/audit-root-cause-coverage.mjs --dry-run`
   - the `thermo-nuclear` review, and `git diff --check`
5. **Audit.** Fajar re-runs the audit and confirms 495 fallback rows (17.70%) and 0 Call rows in `proses_ideb_slik`.

No migration, no enum change, no AI. Cluster ids and labels are unchanged.
