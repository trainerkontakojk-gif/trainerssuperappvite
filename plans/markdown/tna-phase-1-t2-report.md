# TNA Fase 1 — Laporan T2 (SELESAI, rev. 7)

## Status

T2 (mesin metrik) selesai dan sudah mencakup keputusan rencana **rev. 7**: `scope=all` + periode tanpa audit disetujui Fajar, field tingkat-atas `selected_audit_status`, dan sesi dari `scoreRows`. Lane D. Branch `feat/tna-phase-1`; **tidak ada** commit, push, deploy, migrasi remote, atau perubahan pada tabel `tna_*`. T3 belum dimulai.

Perintah verifikasi yang diminta: `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project=tna-real-backend` → **12 passed**.

## Perubahan lanjutan rev. 7 (sesi ini)

### 1. Bug sesi phantom (`buildPeriodBucket`) — RED → GREEN

- Fixture `apps/web/e2e/helpers/tnaFixture.ts` mendapat `addPhantomBatch`/`removePhantomBatch`: batch phantom persis pola SIDAK (`__PHANTOM__<batchId>_1..5`, 5 sesi, `nilai = 3`, `phantom_batch_id` terisi).
- RED: tes diferensial menyisipkan batch phantom pada agent yang **sudah punya row real** (agent 1, periode terpilih) lalu membandingkan metrik sebelum/sesudah. Exit 1: `sampledSessions` 38 vs 33 — batch phantom ikut dihitung sebagai sesi.
- GREEN: `buildPeriodBucket` sekarang menghitung sesi dari `scoreRows` memakai `getScoreRows` SIDAK (guardrail #3): row real dipakai bila ada, phantom hanya untuk agent phantom-only. `getScoreRows` di `apps/api/src/services/sidak/dashboard-aggregation.ts` dibuat generik (`<T extends { is_phantom_padding?: boolean | null }>`) supaya dipakai lintas tipe row; **perubahan runtime nol** (isi fungsi sama). Setelah fix, metrik sebelum/sesudah batch phantom identik (33 = 33) dan setelah batch dihapus tetap 33.

### 2. `selected_audit_status` tingkat-atas

- `packages/types/src/tna.ts`: `tnaParametersResponseSchema.selected_audit_status: "audited" | "no_audit"`.
- `apps/api/src/services/tna/parameters.ts`: diisi dari bucket periode terpilih (`auditedAgents > 0` → `audited`).
- Assertion spec: `audited` pada P2 dan P3, `no_audit` pada periode terpilih yang seluruh barisnya dihapus.

### 3. Tes unit S3 dihapus

- `test("S3 lift keeps scoring session keys and MAX_SAMPLING")` dihapus dari `tna-metrics-api.spec.ts` (unit test fungsi murni, tidak diizinkan).
- Lift `MAX_SAMPLING`/`getTemuanSessionKey` dibuktikan oleh diff mekanis di `apps/api/src/lib/scoring.ts` dan spec E2E SIDAK yang **benar-benar menjalankan scoring** dengan data nyata: **`apps/web/e2e/access-scope-api.spec.ts`** (10 passed) — spec ini menyeed `qa_temuan` lalu memanggil `/v1/sidak/dashboard` sebagai agent dan leader; endpoint itu menjalankan `normalizePeriodScoringRows` + `calculateQAScoreFromTemuan` di `apps/api/src/services/sidak/dashboard-data.ts`. `sidak-dashboard-insights.spec.ts` dan `sidak-agent-report-download.spec.ts` hanya merender skor dari fixture/mock, jadi **bukan** bukti lift.

## RED awal T2 (sesi sebelumnya, tetap berlaku)

| Perintah                                                                       | Hasil                                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `... tna-metrics-api.spec.ts` (sebelum implementasi)                           | Exit 1: `GET /tna/parameters` 404 (expected 400/200), 6 did not run.         |
| `... tna-access-api.spec.ts --grep "parameter metrics"` (sebelum implementasi) | Exit 1: admin 404, expected 200.                                             |
| Probe phantom dengan guard dihapus sementara                                   | Exit 1: alpha `findings` 4 (expected 3), `affectedAgents` 4, `spreadPct` 80. |
| Probe sesi phantom (rev. 7, sebelum fix `scoreRows`)                           | Exit 1: `sampledSessions` 38 (expected 33).                                  |

## Implementasi (ringkas)

- `apps/api/src/lib/scoring.ts` — pure lift `MAX_SAMPLING` + `getTemuanSessionKey` (dipakai `calculateQAScoreFromTemuan` dan mesin TNA).
- `apps/api/src/services/tna/thresholds.ts` — enam konstanta D1.
- `apps/api/src/services/tna/metrics.ts` — bucket audit presence/findings (reuse `isCountableFinding`, `isAgentExcluded`, `getScoreRows`, `MAX_SAMPLING`, `getTemuanSessionKey`), paginasi penuh `qa_temuan`, metrik nullable tanpa pembagian nol, lima `trendStatus`, sinyal, saran intervensi, resolusi metadata K8, `DataScope` (D8; dipanggil `{ kind: "all" }`).
- `apps/api/src/services/tna/parameters.ts` — orkestrasi daftar, universe `scope=all` (semua parameter dengan baris audit, termasuk `findings = 0`), fallback periode pembanding saat periode terpilih tanpa audit, `selected_audit_status`, urutan kritikal → sebaran → tingkat → nama, flag `insufficientData`.
- `apps/api/src/routes/tna.ts` — `GET /tna/parameters` (zod, JWT/RLS, respons divalidasi, 400/404/503 manusiawi).
- `packages/types/src/tna.ts` — `tnaParametersResponseSchema` + `selected_audit_status`.
- `apps/api/src/services/sidak/dashboard-aggregation.ts` — `getScoreRows` generik (pure widening).
- Spec/fixture: `apps/web/e2e/tna-metrics-api.spec.ts` (7 tes), `tna-access-api.spec.ts` (tes `/tna/parameters`), `helpers/tnaFixture.ts` (indikator alpha/critical/beta/delta/bulk, periode ke-4, 1.250 baris bulk, probe phantom & catatan hanya-spasi, `addPhantomBatch`/`removePhantomBatch`), `helpers/accessMatrix.ts`.

## Cakupan kontrak yang terbukti

Phantom-only diaudit tanpa temuan; phantom tidak pernah menjadi temuan; **batch phantom tidak menambah sesi agent yang punya row real (baru)**; baris tak-countable diabaikan; agent non-service dikecualikan; `max(5, sesi)` per agent; lima `trendStatus`; audit-ada-nol-temuan vs tidak-ada-audit (`null`, bukan 0/NaN); `selected_audit_status`; periode tanpa audit tidak dipakai sebagai pembanding; kritikal; data belum cukup; urutan kandidat; `scope=all` vs `candidates`; >1.000 baris lintas paginasi (1.250 findings penuh); auth 401/403/200 dan validasi 400.

## Bukti verifikasi (sesi ini)

| Perintah                                                                                                                         | Hasil                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `... tna-metrics-api.spec.ts --grep "phantom padding never inflates"` (RED)                                                      | Exit 1: `sampledSessions` 38 vs 33                                                                    |
| Perintah sama setelah fix `scoreRows`                                                                                            | Exit 0, 1 passed                                                                                      |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project=tna-real-backend`                  | Exit 0, **12 passed**                                                                                 |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project=gate-stub`                         | Exit 0, **24 passed**                                                                                 |
| `pnpm --filter @trainers/web exec playwright test access-scope-api.spec.ts` (default config; E2E SIDAK yang menjalankan scoring) | Exit 0, **10 passed** (termasuk `/v1/sidak/dashboard` 200 untuk agent & leader)                       |
| `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json`                                                                         | Exit 0                                                                                                |
| `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json`                                                             | Exit 0                                                                                                |
| `pnpm --filter @trainers/web exec tsc --noEmit`                                                                                  | Exit 0                                                                                                |
| ESLint scoped api (`routes/tna.ts`, `services/tna/*`, `lib/scoring.ts`, `sidak/dashboard-aggregation.ts`)                        | Exit 0                                                                                                |
| ESLint scoped web (spec TNA, fixture, access-matrix)                                                                             | Exit 0                                                                                                |
| `pnpm exec prettier --check` pada 11 file TNA/SIDAK yang diubah                                                                  | Exit 0                                                                                                |
| `git diff --check` (tracked) + `git diff --no-index --check /dev/null` (4 file baru)                                             | Exit 0                                                                                                |
| `docker logs supabase_db_trainerssuperappvite --since 20m \| grep -c "signal 11"`                                                | `0`                                                                                                   |
| Sisa data lokal setelah suite                                                                                                    | `qa_temuan` 0, `tna_needs` 0, `tna_plans` 0, fixture peserta/indikator/periode 0, folder `access-*` 0 |

Dev-server root yang sempat ditinggalkan run `access-scope-api.spec.ts` (vite/api/telefun) sudah dihentikan setelah verifikasi; tidak ada listener 3000–3010 yang tersisa.

## Tidak dijalankan

`GET /tna/parameters/detail`, `POST/GET /tna/needs`, jalur rencana/aktivasi/trigger/konkurensi (T3–T4), UI/browser E2E TNA (T5), root `pnpm typecheck`/`pnpm lint`/`pnpm build`, `thermo-nuclear`, `impeccable`, dan seluruh gate T6. Tidak ada commit/push/migrasi remote.

## Handoff

**T2 selesai** sesuai rev. 7. T3 (drill-down & kebutuhan) menunggu konfirmasi Fajar.
