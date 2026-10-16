# Root-cause cluster for Call communication findings, plus near-miss keyword expansion

Lane: **C**. This changes the shared cluster enum used by the SIDAK agent detail, the TNA drill-down, TNA need validation (zod) and `tna_programs.trigger_clusters`. It also changes the shared matcher registry. It follows the precedent of [`root-cause-hold-cluster.md`](root-cause-hold-cluster.md), [`root-cause-slik-ideb-cluster.md`](root-cause-slik-ideb-cluster.md) and [`root-cause-slik-ideb-service-scope.md`](root-cause-slik-ideb-service-scope.md). It resolves the deferred decision D3 of the SLIK plan.
Status: **implemented** (2026-10-17). Decisions (Fajar): D1 yes, D2 yes, D3 yes, D4 no, D5 (a)+(b), D6 (a). Audited by Fajar (`after-komunikasi`): 240/2796 = 8.58% fallback, Call 53/947 = 5.60%, exactly as projected.

## Requirement

### Problem

The overall target is met: Fajar's audit of 2026-10-17 (`after-slik-scope`) shows 495/2796 = 17.70% `lainnya`. Call is the outlier:

| Service | Sample | Fallback | Fallback % |
| ------- | -----: | -------: | ---------: |
| call    |    947 |      295 | **31.15%** |
| chat    |    999 |       98 |      9.81% |
| email   |    444 |       65 |     14.64% |
| others  |    406 |       37 |          — |

Call alone holds 60% of all fallback rows. A Call agent with soft-skill findings gets "Lainnya" as a top root cause in SIDAK and in the TNA drill-down. That gives the trainer no coaching signal.

### Evidence

Fajar's read-only audit `--sample-texts --sample-limit 300` ran on 2026-10-17. Its report is `.hermes/reports/sidak-root-cause-coverage-20261016-call-fallback.{md,json}` (gitignored). It covers **every** fallback row: Call has 295 rows in 291 distinct templates, and all of them are in the report. The totals are unchanged (495 / 17.70%).

### Classification of the 295 Call fallback rows

Each indicator's rows are coherent. Almost every template is unique, so the signal is the **indicator**, not a repeated phrase. `menit`/`detik` are transcript timestamps ("memotong pembicaraan konsumen pada menit 03.53"). They appear in 170 fallback rows and are never a keyword.

| Group                                | Indicator (production name)                        | Rows | What the findings say                                                                                               | Training need                 |
| ------------------------------------ | -------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Communication soft skills (174)**  | Kemampuan Menyimak                                 |   68 | Interrupts the consumer, re-asks information already given, no response to a question                               | listening                     |
|                                      | Pilihan Kata & Tata Bahasa                         |   38 | Informal or non-standard words ("nggak", "yuk"), repetitive "untuk saat ini", unstructured sentences when probing   | word choice                   |
|                                      | Kualitas Suara, Artikulasi dan Kecepatan Berbicara |   35 | Flat or low-energy intonation, unclear articulation, speaking too fast                                              | intonation / articulation     |
|                                      | Kemampuan Menjelaskan                              |   19 | No pause before key information (URL, email), explanation not structured, not to the point, consumer still confused | explanation structure         |
|                                      | Patience, Empathy dan TTM                          |   14 | No empathy sentence (consumer crying or anxious), impatient emphasis, no thanks after verification                  | empathy                       |
| **Call etiquette (20)**              | Salam Pembuka                                      |    8 | Incomplete or wrong-time greeting, greeting after the consumer says "halo"                                          | opening script                |
|                                      | Menyapa Konsumen                                   |    7 | Wrong or inconsistent consumer name                                                                                 | addressing                    |
|                                      | Kejelasan Informasi, Salam Penutup & Magic Word    |    5 | No clarity check before closing, wrong outbound closing                                                             | closing script                |
| **Near-misses of existing clusters** | Kemampuan Pencatatan - Kesesuaian Kategori Layanan |   40 | Description or Jawaban column recorded inaccurately, too general, typos, wrong PUJK                                 | recording → `kurang_teliti_…` |
|                                      | Kemampuan Pencatatan - Kesesuaian Informasi Kontak |   12 | Phone/mobile number in wrong column, wrong name or city                                                             | recording → `kurang_teliti_…` |
|                                      | Keakuratan Solusi / Informasi                      |   31 | "tidak tepat dalam menjawab", "tidak menjawab pertanyaan", incomplete info, no callback after a dropped call        | accuracy → `salah_jawaban`    |
|                                      | Kemampuan Bertanya dan Menganalisa                 |   13 | Irrelevant or unnecessary probing, unstructured probing, incomplete mandatory probing                               | probing → `kurang_menggali`   |
|                                      | Etika Bertelepon                                   |    5 | "permohonan izin HOLD" incomplete, HOLD button not used                                                             | hold → `hold_waktu_tunggu`    |

**Conclusion.**

- 194 rows (66%) are communication and call-etiquette findings. None of the existing clusters fits them: they are not accuracy, data, probing or system problems. They share one training need, telephone service communication, which justifies a **new cluster**.
- The other 101 rows are near-misses of existing clusters. They need **keyword expansion**, not a new cluster.

## Design

### New cluster

| Field          | Value                                                                                                                                                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id             | `komunikasi_layanan`                                                                                                                                                                                                                                                                                                                               |
| label (API)    | `Komunikasi & etika layanan telepon kurang optimal`                                                                                                                                                                                                                                                                                                |
| label (TNA)    | `Komunikasi layanan telepon`                                                                                                                                                                                                                                                                                                                       |
| priority       | `4`, the lowest non-fallback priority, placed after `kurang_menggali`. It **loses every tie**, so a row that any existing cluster matches equally keeps that cluster.                                                                                                                                                                              |
| serviceTypes   | `["call"]`. The keywords are Call indicator names. Chat/email have their own etiquette indicators and stay out of scope (D6).                                                                                                                                                                                                                      |
| recommendation | `Latih komunikasi layanan telepon: menyimak tanpa memotong atau mengulang pertanyaan, intonasi bervariasi dengan artikulasi dan tempo jelas, pilihan kata baku dan kalimat terstruktur, penjelasan runtut dengan jeda pada informasi penting, kalimat empati dan sikap sabar, serta salam pembuka, sapaan nama, dan salam penutup sesuai standar.` |

**Keywords.** The texts are too varied for phrase keywords. Words like `intonasi`, `artikulasi` and `empati` would leave many rows unmatched, and `memotong`/`kalimat` are too generic for substring matching. The cluster therefore matches on the indicator name, which `buildSearchText` appends to every row. The names below are normalized: `&` and `,` are removed.

- Soft skills: `kemampuan menyimak`, `pilihan kata`, `kualitas suara`, `kemampuan menjelaskan`, `patience empathy`.
- Etiquette (D2): `salam pembuka`, `menyapa konsumen`, `salam penutup`.
- **Excluded:**
  - `menit`, `detik`: timestamps.
  - `etika bertelepon`: those rows are HOLD findings; see the expansion below.
  - `intonasi`, `empati`, `memotong`: text words that add hits. Extra hits only make the cluster steal more matched rows.

### Keyword expansion for the near-misses (D3)

The expansions use text phrases only. They are all verbatim from the fallback texts.

| Cluster (priority)                  | Add                                                                                                              | Why                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `salah_jawaban` (8)                 | `tidak tepat dalam menjawab`, `tidak tepat dalam memberikan`, `tidak tepat dalam menyampaikan`, `tidak menjawab` | The registry has `tidak sesuai dalam …` but not the `tidak tepat dalam …` variants. `tidak menjawab` is an unanswered question. |
| `kurang_teliti_verifikasi_data` (7) | `tidak sesuai dalam mencatat`, `belum sesuai dalam mencatat`                                                     | `tidak sesuai mencatat` exists but misses the common "… dalam mencatat" form.                                                   |
| `kurang_menggali` (5)               | `kemampuan bertanya` (indicator name, Call "Kemampuan Bertanya dan Menganalisa" and chat "Kemampuan Bertanya")   | Probing-skill findings, including unnecessary or irrelevant probing (D5).                                                       |
| `hold_waktu_tunggu` (9)             | `izin hold`, `tombol hold`, `menggunakan hold`                                                                   | "permohonan izin HOLD" and "tidak menggunakan tombol HOLD" are HOLD procedure. Bare `hold` stays excluded (`threshold`).        |

Non-Call rows that the expansions also catch were checked one by one, and all fit:

- 5 email and 1 chat "tidak menjawab pertanyaan konsumen" rows → `salah_jawaban`;
- 5 chat "Kemampuan Bertanya" probing rows → `kurang_menggali`;
- 2 BKO "tidak sesuai dalam mencatat temuan … pada Kertas Kerja" rows → `kurang_teliti_verifikasi_data`.

### Projection (offline, from the full fallback report)

I simulated the registry on all 495 fallback templates, with weights from their counts. Existing keywords match none of these rows, so only the new keywords decide where each row goes.

| Scenario                                                       | Rows leaving `lainnya` | Overall fallback     | Call fallback      |
| -------------------------------------------------------------- | ---------------------: | -------------------- | ------------------ |
| Today                                                          |                      — | 495/2796 = 17.70%    | 295/947 = 31.15%   |
| **A (recommended): soft skills + etiquette + text expansions** |                **255** | **240/2796 = 8.58%** | **53/947 = 5.60%** |
| B: soft skills only (D2 no) + text expansions                  |                    235 | 260/2796 = 9.30%     | 73/947 = 7.71%     |
| A without the expansions (D3 no)                               |                    195 | 300/2796 = 10.73%    | 100/947 = 10.56%   |
| C: A + indicator names on existing clusters (D4 yes)           |                    307 | 188/2796 = 6.72%     | 1/947 = 0.11%      |

Where the rows go under A:

- `komunikasi_layanan` +193 (Call);
- `kurang_teliti_verifikasi_data` +20 (18 Call, 2 BKO);
- `salah_jawaban` +20 (14 Call, 5 email, 1 chat);
- `kurang_menggali` +18 (13 Call, 5 chat);
- `hold_waktu_tunggu` +4 (Call).

One Menjelaskan row has "tidak menjawab pertanyaan inti" and goes to `salah_jawaban` on a 1–1 tie (priority 8 > 4).

Under A, 53 Call rows stay in `lainnya`: Pencatatan 34, Keakuratan Solusi 18 and Etika Bertelepon 1. They are recording or accuracy findings phrased without a fixed verb pattern, and only D4 would move them.

Caveats:

- The report truncates texts to 500 characters, so the projected moves via text phrases are a lower bound.
- The audit's `normalizeText` also expands abbreviations. None of the new keywords contains one.

### Rows that may move from an existing cluster

The fallback report has no matched rows, so moves can't be counted in advance. These are the mechanism and the bounds:

- **`komunikasi_layanan`, priority 4.** It takes a matched Call row only when it scores **more** hits than the row's current cluster, because it loses every tie. A soft-skill indicator row gets 1 hit from its name. It needs a second hit from the text, for example "pilihan kata" in the text of a "Pilihan Kata" row, and the current cluster must have only 1 hit. In the fallback rows, **0 of 194** had a second hit, so few moves are expected. Rows in `salah_penggunaan_sistem`, `hold_waktu_tunggu` and `salah_jawaban` with 2 or more hits stay put.
- **Text expansions on existing clusters.** A matched row whose text contains a new phrase gains 1 hit, which can move it on a tie toward the higher-priority cluster:
  - `tidak menjawab` / `tidak tepat dalam …` pull from `kurang_teliti` (7), `kurang_paham` (6) and `kurang_menggali` (5) into `salah_jawaban` (8);
  - `… dalam mencatat` pulls from `kurang_paham` and `kurang_menggali` into `kurang_teliti`;
  - `izin hold` / `tombol hold` pull from `salah_jawaban` (8) into `hold_waktu_tunggu` (9).

  All of these are moves toward the more specific cause.

- **`kemampuan bertanya`, priority 5.** It loses ties to every existing cluster except the new one, so it only takes rows that already have a second probing hit.
- **Measured after merge (D6):**
  - `--sample-cluster komunikasi_layanan --sample-service call` lists every row the new cluster wins, with `withoutClusterCounts`. That number is exact for a new cluster.
  - For the expanded clusters, moves = (audited cluster count − today's count) − the projected gain from `lainnya` above. Today's counts are `salah_jawaban` 361, `kurang_teliti_verifikasi_data` 347, `kurang_menggali` 53 and `hold_waktu_tunggu` 174.
  - Any count drop in `kurang_paham_standar_jawaban` (51 today) is a move.

### Touch points (same as the HOLD/SLIK precedent)

- `packages/types/src/sidak.ts`: add `"komunikasi_layanan"` to `rootCauseClusterIds`, after `kurang_menggali`. `tnaClusterIdSchema` derives from it.
- `apps/api/src/services/sidak/agent-root-causes.ts`:
  - add the registry entry with `serviceTypes: ["call"]`, after `kurang_menggali`;
  - add the expansion keywords to the four existing entries, each with a short audit-backed comment as in Phase 2.
- `apps/web/src/routes/tna/utils.ts`: add `komunikasi_layanan: "Komunikasi layanan telepon"` to `clusterLabels`. The `Record` type enforces it.
- `scripts/sidak/audit-root-cause-coverage.mjs`: mirror the entry and the keywords.
- `docs/SIDAK_LOGIC_AND_SCORING.md`:
  - list the cluster in "Klaster";
  - add a `### Klaster komunikasi_layanan` section with the keywords, the reason for indicator-name matching and the exclusions;
  - list the Phase-2-style expansions;
  - add a coverage line after the audit;
  - replace the "klaster untuk itu ditunda" sentence.
- No migration for the enum: cluster columns are `text`/`text[]` without CHECK.

### E2E proof (RED-first, local real backend only)

Run `apps/web/playwright.api.config.ts --project=tna-real-backend` against local `supabase start` only. Never use the default config or a remote target, and run one Playwright process at a time.

1. **New `apps/web/e2e/tna-root-cause-komunikasi-api.spec.ts`**, modelled on the SLIK spec, using `createTnaFixture`. Seed spec-owned Call indicators with production names plus the namespace. `rootCauses` returns at most 5 clusters, so the spec uses two agents:
   - **Agent A, mappings** (`participants[3]`, `service_type=call`). Expected clusters, five in total:
     - `komunikasi_layanan` 4. The rows are "Agent memotong pembicaraan konsumen pada menit 03.53." under Kemampuan Menyimak, a non-standard word under Pilihan Kata & Tata Bahasa, a flat intonation under Kualitas Suara, and an incomplete greeting under Salam Pembuka. The timestamp row proves the indicator matches, not `menit`.
     - `kurang_teliti_verifikasi_data` 1: "Agent tidak sesuai dalam mencatat kota domisili konsumen." under Kemampuan Pencatatan.
     - `salah_jawaban` 1: "Agent tidak tepat dalam menjawab pertanyaan konsumen terkait pembaruan data SLIK." under Keakuratan Solusi.
     - `kurang_menggali` 1: "Agent melakukan probing yang tidak diperlukan pada detik 00.10." under Kemampuan Bertanya dan Menganalisa.
     - `hold_waktu_tunggu` 1: "Agent tidak lengkap dalam mengucapkan kalimat permohonan izin HOLD." under Etika Bertelepon.
   - **Agent B, controls** (`participants[4]`, `service_type=call`):
     - Kemampuan Menyimak + "Agent tidak menanyakan nama PUJK" → `kurang_menggali`, because the 1–1 tie goes to priority 5 over 4;
     - Kemampuan Menyimak + "Agent salah mengisi kolom pada APPK" → `salah_penggunaan_sistem`;
     - Kemampuan Pencatatan + "Deskripsi terlalu umum" → `lainnya`, since indicator names on existing clusters are excluded (D4);
     - Keakuratan Solusi + "Agent kurang lengkap memberikan informasi alamat OJK" → `lainnya`.
   - **Scope control:** one `chat` indicator "Salam Pembuka" row → `lainnya`. Assert it through the TNA drill-down for that indicator, because the fixture already seeds chat rows for the agents.
   - **Assertions:**
     - SIDAK `GET /sidak/agents/:id?service_type=call` counts for A and B;
     - the label and `matchedKeywords` of `komunikasi_layanan`;
     - the TNA drill-down for the Kemampuan Menyimak indicator suggests `komunikasi_layanan`;
     - `POST /api/v1/tna/needs` with `validated_cluster_id: "komunikasi_layanan"` returns 201 and persists `suggested_cluster_id,validated_cluster_id`.
   - **RED today:**
     - Agent A's soft-skill, recording, accuracy, probing and izin-HOLD rows all land in `lainnya`;
     - the drill-down suggests `lainnya`;
     - the POST returns 400.
2. **Existing spec that the new cluster would break.** In `tna-root-cause-slik-api.spec.ts`, the Call indicator is `Kemampuan Menjelaskan ${namespace}`, and the row "…hasil iDeb SLIK … bahasa yang mudah dipahami" expects `lainnya`. The new cluster would move it to `komunikasi_layanan`. D5 picks the fix.
3. **GREEN:** the new spec passes, then **one** run of the whole `tna-real-backend` project, including the hold, slik, needs, plan and evaluation specs.

No unit tests are added or run. If an expectation in `sidak-agent-root-causes.test.ts` conflicts, I ask before touching it.

## Open decisions (Fajar)

- **D1 – New cluster `komunikasi_layanan`** (Call, indicator-name keywords, priority 4).
  - Yes. **Recommended**: it moves 193 Call rows and gives trainers a coaching signal where today they see "Lainnya".
  - No: Call stays at 31%. The overall target is already met.
- **D2 – Include call etiquette** (Salam Pembuka, Menyapa Konsumen, Salam Penutup; 20 rows) in the same cluster.
  - Yes. **Recommended**: same channel, same coaching (script and delivery), and one TNA signal.
  - No: the cluster becomes pure soft skills, and those 20 rows stay in `lainnya` (scenario B).
- **D3 – Text keyword expansions** on `salah_jawaban`, `kurang_teliti_verifikasi_data`, `kurang_menggali` and `hold_waktu_tunggu` (62 rows).
  - Yes. **Recommended**: every phrase is verbatim from the fallback texts and fits its cluster.
  - No: keep only the new cluster.
- **D4 – Indicator names on existing clusters** (`kemampuan pencatatan` → `kurang_teliti`, `keakuratan solusi` → `salah_jawaban`), worth +52 rows.
  - No. **Recommended**: each Pencatatan or Keakuratan row matched today gains a hit and moves on ties. For example, a Pencatatan row in `kurang_paham` (6) would move to `kurang_teliti` (7). The scale of those moves can't be projected.
  - Yes: Call fallback drops to about 0%, at the cost of unmeasured moves.
- **D5 – Probing label and the SLIK spec.**
  - (a) Accept that unnecessary or irrelevant probing goes to `kurang_menggali` ("Kurang menggali kebutuhan"). The training (the effective-probing program) is the same. **Recommended.**
  - (b) In the SLIK spec, change the Call indicator to `Keakuratan Solusi / Informasi ${namespace}`, so that the scope assertion keeps testing `proses_ideb_slik` exclusion with `lainnya`. **Recommended.** Its texts hit no new keyword.
  - Alternatively, keep `Kemampuan Menjelaskan` and change that expectation to `komunikasi_layanan`.
- **D6 – TNA program and follow-up.**
  - (a) No migration, as in the HOLD and SLIK precedent. **Recommended.**
  - (b) Add a migration with a rollback for a program `komunikasi-layanan-telepon`, "Komunikasi Layanan Telepon": gap `skill`, `service_types {call}`, modules `{telefun}`. Telefun is the telephone simulation module. That needs `supabase-migration` and a local replay; a remote apply needs separate authorization.
  - Chat/email etiquette indicators (chat "Nama konsumen" 28, "Kejelasan Informasi & Salam Penutup" 20, "Salam Pembuka" 9) are out of scope. Chat fallback is 9.81%.
  - After merge, Fajar runs:

    ```bash
    node scripts/sidak/audit-root-cause-coverage.mjs --limit 5000 --label after-komunikasi --sample-cluster komunikasi_layanan --sample-service call
    ```

## Tasklist

- [x] Fajar answers D1–D6 (D1 yes, D2 yes, D3 yes, D4 no, D5 a+b, D6 a).
- [x] Load `trainers-superapp-tdd`, then trace the impact with `git grep`. Only `tna-root-cause-slik-api.spec.ts` used a soft-skill indicator name.
- [x] RED: `tna-root-cause-komunikasi-api.spec.ts` failed. All 8 mapped rows landed in `lainnya` (serial mode skipped the other 2 tests).
- [x] Types, registry and expansions, label, audit mirror, SLIK spec indicator (D5b), docs.
- [x] GREEN:
  - the komunikasi, slik and hold specs 8/8;
  - the full `tna-real-backend` project 64/64 (one run);
  - `tsc` for api/web/types exit 0, and `pnpm lint` exit 0;
  - audit `--dry-run`, also with `--sample-cluster komunikasi_layanan --sample-service call`, exit 0;
  - `git diff --check` clean.
- [x] `thermo-nuclear`: PASS. One P3 that predates this change: the audit script is 1192 lines (+26 here, a registry mirror). `graphify update .` run.
- [x] Commit and push to main.
- [x] Fajar ran the D6 audit (`after-komunikasi`, 2026-10-17). The results match the projection exactly:
  - overall fallback 240/2796 = **8.58%**; Call 53/947 = **5.60%**;
  - `komunikasi_layanan` holds 193 rows, all Call. `withoutClusterCounts` is `lainnya` 193, so **0 rows moved** into it from another cluster;
  - moves between the existing clusters, computed as each count's delta minus the projected gain from `lainnya`:
    - in: `salah_jawaban` 361 → 387 (+26, projected +20, so 6 moved in), `kurang_menggali` 53 → 77 (+24 vs +18, 6 in), `kurang_teliti_verifikasi_data` 347 → 368 (+21 vs +20, 1 in), `hold_waktu_tunggu` 174 → 178 (+4 vs +4, 0);
    - out: `kurang_paham_standar_jawaban` 51 → 41 (−10) and `salah_penggunaan_sistem` 1084 → 1081 (−3);
    - in total, 13 rows changed cluster. They moved toward the more specific cause, as the D3 bound expected.
