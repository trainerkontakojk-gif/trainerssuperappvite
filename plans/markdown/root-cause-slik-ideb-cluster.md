# Root-cause cluster for SLIK iDeb registration process findings

Lane: **C**. This changes the shared cluster enum used by the SIDAK agent detail, the TNA drill-down, TNA need validation (zod) and `tna_programs.trigger_clusters`. It follows the precedent of [`root-cause-hold-cluster.md`](root-cause-hold-cluster.md).
Status: **implemented** (2026-10-17). Decisions (Fajar): D1 = (a) no program/migration; D2 = accept that matched SLIK rows move; D3 = defer the soft-skill cluster; D4 = audited at 17.24%.

## Requirement

### Problem

Fajar's read-only production audit of 2026-10-17 shows `lainnya` above the 20% target in `docs/SIDAK_LOGIC_AND_SCORING.md` ("Coverage Target"):

| Report (`.hermes/reports/`, gitignored)                 | Fallback              | Note                                                                                        |
| ------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- |
| `sidak-root-cause-coverage-20261016-after-hold-cluster` | 710/2796 = 25.39%     | Matching on ketidaksesuaian + sebaiknya only.                                               |
| `sidak-root-cause-coverage-20261016-slik-menit-texts`   | 698/2796 = **24.96%** | Same rows. The audit now also matches on indicator names (65/65 resolved), as the API does. |

To get under 20%, at most 559 rows may stay in fallback, so **at least 140 rows must move** out of `lainnya`.

| Service | Sample | Fallback | Fallback % |
| ------- | -----: | -------: | ---------: |
| slik    |    233 |      205 |     87.98% |
| call    |    947 |      295 |     31.15% |
| chat    |    999 |       98 |      9.81% |
| email   |    444 |       65 |     14.64% |
| others  |    173 |       35 |          — |

`slik` was absent from the 2026-07-09 baseline. It alone accounts for 29% of all fallback rows.

### Classification of the fallback texts (`--sample-texts`, read-only)

**SLIK: a single coherent process, iDeb registration verification.** Its 205 fallback rows reduce to 115 distinct templates once digits are collapsed. The top 15 templates cover 94 rows. Every sampled row falls under one of these iDeb process indicators:

| Indicator (from `qa_indicators`)                                                   | Typical text                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kesesuaian dan kelengkapan pengiriman alasan penolakan permohonan iDeb SLIK (most) | "Agent kurang lengkap / tidak sesuai dalam melampirkan alasan penolakan (pada opsi "Alasan" / "Keterangan Lainnya") pada pendaftaran iDeb yang ditolak" |
| Kelengkapan Pengiriman Hasil iDeb (Penarikan)                                      | "Agent kurang lengkap dalam mengirimkan hasil iDeb milik konsumen … sesuai Nama, NIK … pada pendaftaran iDebku"                                         |
| Ketidaksesuaian penolakan permohonan iDeb SLIK                                     | "Agent tidak sesuai dalam memverifikasi pendaftaran iDeb, yaitu dengan menolak pendaftaran iDeb yang seharusnya diterima"                               |
| Kesesuaian Foto / Kesesuaian verifikasi Dokumen                                    | "Agent tidak sesuai dalam memverifikasi (ulang) foto … "Foto Diri Mengikuti Gambar" … pendaftaran iDebku … ditolak/gagal verifikasi"                    |

These rows miss the existing clusters because they say "**kurang lengkap / tidak sesuai dalam** melampirkan", while `kurang_teliti_verifikasi_data` only matches `tidak melampirkan`. They are also not a system/APPK or answer-accuracy problem. They describe one back-office SOP: verifying iDeb registrations, writing rejection reasons, and sending results. This is a coherent training need, so it gets its own cluster rather than generic keyword expansion of `kurang_teliti_verifikasi_data`, which would need broad words like `melampirkan` or `lengkap`.

**Call `menit`: not a duration.** All 152 Call fallback rows containing `menit` are distinct (151 templates), and `menit` there is a **transcript timestamp** ("memotong pembicaraan konsumen pada menit 03.53", "artikulasi kurang jelas pada menit 08.45"). It is not HOLD, AHT, callback or SLA time. The underlying findings are communication soft skills: intonation and articulation, listening (interrupting), word choice, empathy, and explanation structure. Their indicators are "Kualitas Suara, Artikulasi dan Kecepatan Berbicara", "Kemampuan Menyimak", "Pilihan Kata & Tata Bahasa", "Patience, Empathy dan TTM", "Kemampuan Menjelaskan" and "Kejelasan Informasi & Salam Penutup". **`menit` must not become a keyword.** A soft-skill cluster is a separate decision (D3).

### Acceptance criteria

1. A SLIK iDeb process finding maps to the new cluster in both `deriveAgentRootCauses` consumers: SIDAK `GET /api/v1/sidak/agents/:id` (`rootCauses`) and TNA `GET /api/v1/tna/parameters/:indicatorId` (`clusters`). The four production-like templates above all map there.
2. Existing assignments do not change for the non-SLIK control findings: APPK → `salah_penggunaan_sistem`, HOLD → `hold_waktu_tunggu`, `tidak melakukan probing` → `kurang_menggali`, `salah memilih` → `salah_jawaban`, `tidak melampirkan` → `kurang_teliti_verifikasi_data`. A Call timestamp finding ("memotong pembicaraan konsumen pada menit 03.53") stays in `lainnya`.
3. `POST /api/v1/tna/needs` accepts `validated_cluster_id: "proses_ideb_slik"`. The TNA validation form lists it, and the need page shows its label.
4. No migration for the enum itself. Cluster columns are `text`/`text[]` without CHECK, as verified in the HOLD plan.
5. Clustering stays deterministic, uses no AI, and keeps the same algorithm.
6. Fajar's re-run of the audit shows `lainnya` < 20%.

## Design

### Cluster

| Field          | Value                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id             | `proses_ideb_slik`                                                                                                                                                                                                                                            |
| label (API)    | `Proses verifikasi/pengiriman iDeb SLIK tidak sesuai`                                                                                                                                                                                                         |
| label (TNA)    | `Proses iDeb SLIK`                                                                                                                                                                                                                                            |
| priority       | `8`, placed after `salah_jawaban`. On a 1–1 tie, `salah_jawaban` keeps the row because registry order wins at equal priority; the new cluster wins a tie against `kurang_teliti_verifikasi_data` (7).                                                         |
| recommendation | `Latih SOP verifikasi pendaftaran iDeb: cek kesesuaian foto dan dokumen terhadap instruksi, terima/tolak sesuai ketentuan, lampirkan alasan penolakan lengkap pada opsi Alasan dan Keterangan Lainnya, dan kirim hasil iDeb lengkap sesuai Nama/NIK pemohon.` |

**Keywords.** Matching is by substring after normalization; `iDebku` normalizes to `idebku`, which contains `ideb`.

- **Proposed:** `pendaftaran ideb`, `permohonan ideb`, `hasil ideb`, `ideb slik`, `alasan penolakan`, `gagal verifikasi`, `foto diri mengikuti gambar`.
- **Excluded:**
  - bare `ideb`/`slik`: Call and chat findings that _explain_ SLIK/iDeb to consumers are answer-accuracy or communication findings ("tidak tepat menjawab … pembaruan data SLIK"), not this SOP;
  - `melampirkan`, `lengkap`, `pendaftaran`: too generic;
  - `menit`: a timestamp, see above.

**Projection (offline, from the sampled texts).** The proposed keywords match **all 109 sampled SLIK fallback rows**, about 53% of the 205, and **none of the 126 sampled non-SLIK fallback rows**. The unsampled SLIK rows share the same small set of iDeb indicators, whose names alone already contain `permohonan ideb`, `ideb slik`, `alasan penolakan` or `hasil ideb`. The exceptions are "Kesesuaian Foto" and "Kesesuaian verifikasi Dokumen", which match through `pendaftaran idebku` in the text.

- If about 195 of the 205 rows move, fallback drops to about 503/2796 ≈ **18.0%**.
- If only the sampled 109 rows move, it is 589/2796 = 21.1%, which misses the target. The audit after implementation (D4) decides which case holds.

### Rows that may move from an existing cluster

The API also matches on the indicator name, so a SLIK row matched today scores 2–3 keyword hits from that name (for example "…alasan penolakan permohonan iDeb SLIK"). It will therefore usually move from its current cluster, for example `kurang_teliti_verifikasi_data` via `tidak melampirkan`, to `proses_ideb_slik`. This affects at most the **28 SLIK rows matched today**. Non-SLIK rows are unaffected because none of their sampled texts contain the new keywords. This is **D2**.

### Touch points (same as the HOLD precedent)

- `packages/types/src/sidak.ts`: add `"proses_ideb_slik"` to `rootCauseClusterIds` (`tnaClusterIdSchema` derives from it).
- `apps/api/src/services/sidak/agent-root-causes.ts`: add the registry entry and recommendation.
- `apps/web/src/routes/tna/utils.ts`: add `proses_ideb_slik: "Proses iDeb SLIK"` to `clusterLabels`. The `Record<RootCauseClusterId, string>` type makes a missing label a compile error.
- `scripts/sidak/audit-root-cause-coverage.mjs`: mirror the entry.
- `docs/SIDAK_LOGIC_AND_SCORING.md`: add the cluster and keywords, plus a coverage line with the audit result.
- **Known drift, out of scope:** the audit's `normalizeText` expands abbreviations (`sj`, `info`, …) and the API's does not. The new keywords contain no abbreviations, so this change does not depend on it.

### E2E proof (RED-first, local real backend only)

Run `apps/web/playwright.api.config.ts --project=tna-real-backend` against local `supabase start` only, never the default config and never a remote target.

1. **`apps/web/e2e/tna-root-cause-slik-api.spec.ts`**, modelled on `tna-root-cause-hold-api.spec.ts`:
   - Seed with `createTnaFixture`, extended for a `slik` indicator if it lacks one. Add one SLIK indicator "Kesesuaian dan kelengkapan pengiriman alasan penolakan permohonan iDeb SLIK" and one SLIK indicator "Kesesuaian Foto", then one agent with:
     - 4 SLIK findings, one per template class above (alasan penolakan, hasil iDeb, wrong rejection, Foto Diri Mengikuti Gambar);
     - control findings: APPK, HOLD, probing, salah memilih, tidak melampirkan (non-SLIK indicator);
     - 1 Call timestamp finding ("Agent memotong pembicaraan konsumen pada menit 03.53.") → `lainnya`.
   - Assert that the SIDAK `rootCauses` contain `proses_ideb_slik` with `findingsCount` 4 and that every control finding stays in its cluster.
   - Assert that the TNA parameter drill-down for the SLIK indicator suggests `proses_ideb_slik`.
   - Assert that `POST /api/v1/tna/needs` with `validated_cluster_id: "proses_ideb_slik"` returns 201 and persists.
   - **RED today:** the SLIK rows land in `lainnya`, and the POST returns 400.
2. GREEN: the new spec passes, followed by **one** run of the whole `tna-real-backend` project, including `tna-root-cause-hold-api`, `tna-needs-api`, `tna-plan-api` and `tna-evaluation-flow-api`.

No unit tests are added or run. If an existing unit expectation in `sidak-agent-root-causes.test.ts` turns out to conflict, I will ask before touching it, as D3 did in the HOLD plan.

## Open decisions (Fajar)

- **D1 – TNA program trigger.** No program lists the new cluster, so a SLIK-only parameter gets no `suggested_programs`.
  - (a) Leave it for now, with no migration. **Recommended**, matching the HOLD precedent.
  - (b) Add a migration plus rollback for a new program, e.g. `sop-verifikasi-ideb-slik`, "SOP Verifikasi & Pengiriman iDeb SLIK", gap `proses`, `service_types {slik}`, no modules.
  - (c) Append the cluster to `akurasi-penggunaan-sistem` (gap `proses`).

  Options (b) and (c) need `supabase-migration` with a local replay. Applying them remotely needs separate authorization.

- **D2 – SLIK rows matched today may move** (at most 28) into `proses_ideb_slik`.
  - Accept it. **Recommended**: those rows are the same iDeb SOP, and grouping them is the better TNA signal.
  - Or limit the keywords to text-only phrases, so the indicator name adds no hits. That keeps today's assignments but risks missing the target.
- **D3 – Call communication soft-skill cluster** (intonation, articulation, listening, word choice, empathy).
  - Defer it to a follow-up only if the D4 audit is still ≥ 20%. **Recommended**: its indicator names also appear in many rows matched today, so it would move far more existing assignments and deserves its own plan.
  - Or include it now.
- **D4 – measurement.** After merge, Fajar runs this read-only audit:

  ```bash
  node scripts/sidak/audit-root-cause-coverage.mjs --limit 5000 --label after-slik-cluster
  ```

## Tasklist

- [x] Fajar approves the design and answers D1–D3 (D1 a, D2 accept, D3 defer).
- [x] Load `trainers-superapp-tdd`; impact traced with `git grep` (`rootCauseClusterIds`, `tnaClusterIdSchema`, `clusterLabels`; no unit fixture mentions iDeb).
- [x] Local `supabase start`, then write `tna-root-cause-slik-api.spec.ts`. `rootCauses` caps at 5 clusters (`maxResults = 5`), so the spec keeps 4 controls (HOLD, `salah_jawaban`, `tidak melampirkan`, `menit` timestamp → `lainnya`); APPK/probing stay covered by the HOLD spec.
- [x] RED: the agent-detail test failed with `lainnya` 5 and `kurang_teliti_verifikasi_data` 2, and no `proses_ideb_slik` (serial mode skipped the drill-down test).
- [x] Types, registry, label, audit mirror and docs updated.
- [x] D1: no migration.
- [x] GREEN: new spec 2/2; full `tna-real-backend` project 60/60 (one run); tsc for types/api/web exit 0; `pnpm lint` exit 0; `git diff --check` clean.
- [x] `thermo-nuclear`: P2, audit script at 1248 lines → dry-run fixture moved to `audit-root-cause-fixture.mjs` (1035 lines, dry-run output unchanged). `graphify update .` run.
- [x] Commit and push to main.
- [x] Fajar ran the D4 audit (`after-slik-cluster`, 2026-10-17): **17.24%** fallback (482/2796), target met. `slik` fallback went from 205 to 2. Result recorded in the docs.
- [ ] Follow-up: review the Call rows that moved into `proses_ideb_slik`. 13 came from `lainnya`, and at least 5 left another cluster. The offline sample predicted no non-SLIK matches. `--sample-texts` samples only fallback rows, so checking them needs a per-cluster sample of matched rows.
