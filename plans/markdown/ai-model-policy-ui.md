# Pengaturan model AI per tugas (Monitoring → Model)

Lane D: tabel baru, RLS/grant, kontrak API baru, perubahan perilaku pemanggil AI, dan UI. Status: **IMPLEMENTED b66ac4c4; follow-up fixes implemented and verified (2026-11-14); production migrations applied and verified (2026-11-14)** (dibuat 2026-11-13).
Ikuti `AGENTS.md` dan `docs/AGENT_WORKFLOW.md`. Muat `trainers-superapp-tdd` dan `supabase-migration` sebelum mengedit.

## Masalah

Model AI untuk tugas sistem ditulis langsung di kode (`apps/api/src/lib/ai-models.ts:32-42`):

| Konstanta                     | Nilai sekarang                      | Pemanggil                                                                                                                              |
| ----------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `KETIK_REVIEW_MODELS`         | `gemini-3.8-flash` → `gpt-5.4-mini` | `services/ketik/review-processor.ts:41,79`, `services/ketik/review-lifecycle.ts:19-21`                                                 |
| `TELEFUN_ASSESSMENT_MODEL`    | `gemini-3.8-flash`                  | `lib/telefun-transcription.ts:86`, `lib/telefun-analysis.ts:347,451`, `routes/telefun/annotations.ts:439`                              |
| `SIDAK_FORECAST_MODEL`        | `gemini-3.8-flash`                  | `services/sidak/dashboard-forecast.ts:315`                                                                                             |
| `DEFAULT_AI_MODEL_ID` (types) | `gemini-3.8-flash`                  | `lib/gemini.ts:66`, `services/pdkt/session-service.ts:126,303`, `services/pdkt/evaluation-service.ts:594`, `normalizeModelId` fallback |

Akibatnya, mengganti model (misalnya ke Gemini 4 Hydrogen pada 2027-01-01, saat harga 3.8 Flash naik ke harga Hydrogen) harus lewat perubahan kode dan deploy.

Catatan: KETIK dan PDKT **sudah** punya pilihan model per settings (`selectedModel`, `KetikSystemTab.tsx:204`, `KETIK_PDKT_MODEL_IDS`). Celah yang ada adalah model untuk tugas sistem dan model default saat `selectedModel` kosong.

## Requirement

1. Admin/trainer bisa memilih model untuk setiap **tugas AI** dari UI, tanpa deploy:
   - `ketik_review` (primary)
   - `ketik_review_fallback`
   - `telefun_assessment` (scoring suara, content review, coaching summary, annotation assist, transkripsi)
   - `sidak_forecast`
   - `default_text` (dipakai saat `selectedModel` KETIK/PDKT kosong, dan sebagai fallback `normalizeModelId`)
2. Pilihan hanya dari model yang **terdaftar di registry kode** dan **memenuhi kapabilitas tugas**. Tidak ada input model ID bebas.
3. Backend menolak model yang belum punya harga efektif (`ai_pricing_settings`/`ai_pricing_schedule`), supaya `logAiUsage` tidak diam-diam mencatat biaya nol.
4. Bila baris tugas tidak ada atau DB gagal dibaca, perilakunya sama persis dengan hari ini: konstanta kode menjadi fallback. Tidak ada error ke pengguna.
5. Setiap perubahan tercatat: siapa, kapan, nilai lama → nilai baru.
6. Perubahan berlaku untuk panggilan AI **baru**. Sesi atau review yang sedang berjalan tetap memakai model yang sudah di-resolve di awal (lihat D4).
7. `ai_usage_logs.model_id` tetap mencatat model yang benar-benar dipakai. Monitoring Biaya tidak berubah.

## Keputusan default (konfirmasi ke Fajar sebelum T1 bila ragu)

| #   | Pertanyaan                                                | Default di rencana ini                                                                                                                                                                                             |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Siapa yang boleh mengubah?                                | **Admin + trainer**, sama dengan `monitoring.pricing.write` (`packages/types/src/access.ts:40`). Capability baru: `monitoring.models.read` / `monitoring.models.write`, supaya bisa dipersempit ke admin nanti.    |
| D2  | Penjadwalan ("berlaku mulai 2027-01-01")?                 | **Tidak di tahap ini.** Ganti manual di hari H. Penjadwalan bisa ditambah kemudian mengikuti pola `ai_pricing_schedule`.                                                                                           |
| D3  | Pilihan per-trainer untuk tugas penilaian?                | **Tidak.** Satu nilai global per tugas, supaya skor KETIK dan Telefun tetap bisa dibandingkan antar-trainer.                                                                                                       |
| D4  | Sesi berjalan saat model diganti?                         | Model di-resolve **sekali per unit kerja**: satu review KETIK, satu analisis Telefun, satu forecast. Tidak ada pergantian model di tengah unit.                                                                    |
| D5  | Mengubah `KETIK_PDKT_MODEL_IDS` (daftar pilihan trainer)? | **Tidak di tahap ini.** Daftar itu tetap di kode. `default_text` hanya mengatur fallback saat `selectedModel` kosong.                                                                                              |
| D6  | Kapabilitas audio untuk `telefun_assessment`              | Tambah flag `supportsAudioInput` di `AiModelInfo.capabilities`. Hanya model yang sudah terbukti lewat E2E/smoke yang diberi flag ini. Gemini 4 Hydrogen **tidak** diberi flag sampai input audionya terverifikasi. |

## Desain

### Tugas dan kebutuhan kapabilitas — `packages/types/src/ai-model-policy.ts` (baru)

```ts
export const AI_TASKS = [
  "ketik_review",
  "ketik_review_fallback",
  "telefun_assessment",
  "sidak_forecast",
  "default_text",
] as const;
export type AiTask = (typeof AI_TASKS)[number];

export const AI_TASK_DEFINITIONS: Record<
  AiTask,
  {
    label: string; // Bahasa Indonesia untuk UI
    description: string;
    codeDefault: string; // = konstanta lama, fallback (R4)
    requires: {
      supportsText?: true;
      supportsImage?: true;
      supportsAudioInput?: true;
    };
    providers?: AIProvider[]; // mis. ketik_review_fallback harus beda provider dari primary (lihat validasi)
  }
>;

export function eligibleModelsForTask(task: AiTask): AiModelInfo[];
```

- `codeDefault` menggantikan konstanta di `apps/api/src/lib/ai-models.ts`. Konstanta lama tetap di-export, diturunkan dari `AI_TASK_DEFINITIONS`, supaya tidak ada nilai ganda.
- `capabilities.supportsAudioInput` ditambahkan ke `AiModelInfo`. Model yang sekarang dipakai Telefun (`gemini-3.8-flash`) diberi `true`.

### Skema — `supabase/migrations/<ts>_ai_model_policy.sql` + `supabase/rollbacks/rollback_<ts>_ai_model_policy.sql`

```sql
CREATE TABLE public.ai_model_policy (
  task text PRIMARY KEY,
  model_id text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_model_policy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL,
  old_model_id text,
  new_model_id text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
```

- Sama dengan `ai_pricing_schedule`: RLS on tanpa policy, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT ALL ... TO service_role`. Tabel hanya untuk backend.
- **Tidak** ada CHECK pada `task` atau `model_id`. Validasi ada di backend karena registry hidup di kode, dan model yang dihapus dari registry tidak boleh membuat baris lama gagal dibaca (lihat resolver).
- **Tidak ada seed row.** Tabel kosong = perilaku sekarang (R4). Ini membuat apply ke prod tidak berisiko.
- Perubahan dan audit ditulis dalam satu RPC `public.ai_model_policy_set(p_task text, p_model_id text, p_actor uuid)` (`SECURITY INVOKER`, EXECUTE hanya untuk `service_role`), agar upsert dan audit atomik.
- Rollback: drop fungsi, drop kedua tabel. Verifikasi dengan `supabase db reset` lokal.

### Backend

`apps/api/src/lib/ai-model-policy.ts` (baru):

```ts
export async function resolveTaskModel(
  task: AiTask,
): Promise<{ modelId: string; source: "policy" | "code" }>;
export function invalidateAiModelPolicyCache(): void;
```

- Membaca seluruh tabel (paling banyak 5 baris) dengan admin client, di-cache 60 detik memakai `createTtlCache` (`apps/api/src/lib/ttl-cache.ts`). Cache di-invalidate lokal setelah tulis. Railway hanya menjalankan satu instance; instance lain (Coolify) mengikuti dalam 60 detik.
- Validasi saat **baca**: bila `model_id` tidak lagi ada di registry, tidak memenuhi `requires`, atau DB gagal dibaca → pakai `codeDefault` dan `console.warn` sekali per siklus cache. Ini satu-satunya fallback dan sifatnya terbatas (aturan "one primary path, one bounded fallback").
- Pemanggil di tabel Masalah diganti `await resolveTaskModel(...)`. Untuk unit kerja panjang (KETIK review, analisis Telefun), resolve sekali di awal lalu teruskan nilainya (D4). `review-lifecycle.ts:19-21` menghitung timeout dari kedua model hasil resolve.
- `DEFAULT_AI_MODEL_ID` di `normalizeModelId`/`gemini.ts:66` tetap sinkron (konstanta kode). Pemanggil PDKT (`session-service.ts:126,303`, `evaluation-service.ts:594`) memakai `config.selectedModel || await resolveTaskModel("default_text")`. `normalizeModelId` sendiri **tidak** dibuat async, karena dipakai di banyak jalur sinkron dan di web.

Route di `apps/api/src/routes/ai.ts`, di sebelah `/monitoring/pricing`:

- `GET /monitoring/models` (`monitoring.models.read`) → per tugas: `{ task, label, description, modelId, source, codeDefault, eligible: [{ id, name, provider, hasPricing }] , updatedBy, updatedAt }`.
- `PUT /monitoring/models/:task` (`monitoring.models.write`), body `{ modelId }` (zod). Tolak dengan pesan Bahasa Indonesia, tanpa error DB mentah:
  - `400 TASK_UNKNOWN`: tugas tidak dikenal
  - `400 MODEL_NOT_ELIGIBLE`: model tidak terdaftar atau kapabilitasnya tidak cocok
  - `400 MODEL_NO_PRICING`: belum ada harga efektif untuk model ini
  - `400 FALLBACK_SAME_AS_PRIMARY`: `ketik_review_fallback` sama dengan `ketik_review` yang efektif
- `DELETE /monitoring/models/:task` (`monitoring.models.write`) → hapus baris, kembali ke `codeDefault`. Dicatat di audit dengan `new_model_id = codeDefault`.
- `GET /monitoring/models/audit?limit=20`: riwayat perubahan terbaru.
- Tipe respons di `packages/types`. Frontend memakai typed Hono RPC (`hc<AppType>`) / `fetchApi` yang sudah ada.

Tidak ada lifecycle/state baru (aturan "no new implicit state machines" tidak terpicu). Ini hanya nilai konfigurasi.

### UI — tab baru "Model" di `apps/web/src/routes/monitoring/MonitoringPage.tsx`

- Pola sama dengan `PricingTab.tsx`/`PricingRow.tsx`/`PricingEditDialog.tsx`: satu baris per tugas berisi nama tugas, deskripsi singkat, model aktif, dan badge "Bawaan sistem" atau "Diatur oleh <nama>, <tanggal>".
- Tombol ubah membuka dialog pilihan model eligible. Model tanpa harga ditampilkan nonaktif dengan tautan "Atur harga dulu" ke tab Harga.
- Tombol "Kembalikan ke bawaan" muncul bila `source = "policy"`.
- Konfirmasi sebelum simpan menyebut dampaknya, misalnya "Berlaku untuk review KETIK baru. Review yang sedang berjalan tidak berubah."
- Daftar riwayat perubahan ringkas di bawah tabel.
- Tab hanya tampil bila `can(role, "monitoring.models.read")`. Tombol hanya aktif bila `monitoring.models.write`.
- Ini perubahan kecil yang mengikuti pola tab yang ada, bukan redesign, jadi `ui-ux-pro-max` tidak wajib. Tetap jalankan `impeccable` audit pada tab baru sebelum gate akhir.

### Dokumen

- `docs/architecture.md` (bagian AI models): kebijakan model per tugas dan aturan fallback.
- `docs/database.md`: dua tabel baru, RPC, dan bukti apply prod 2026-11-14.

## E2E (RED dulu, target lokal saja)

Spec baru `apps/web/e2e/monitoring-models-api.spec.ts` (API) dan `apps/web/e2e/monitoring-models.spec.ts` (UI):

1. Tabel kosong → `GET` mengembalikan `source: "code"` dan `codeDefault` untuk semua tugas.
2. `PUT` model eligible yang punya harga → tersimpan, audit bertambah satu baris, `GET` mengembalikan `source: "policy"`.
3. `PUT` ditolak: model tanpa harga (`MODEL_NO_PRICING`), model tanpa `supportsAudioInput` untuk `telefun_assessment` (`MODEL_NOT_ELIGIBLE`), fallback sama dengan primary, tugas tidak dikenal.
4. Role tanpa capability (agent/leader) → 403 untuk `PUT`/`DELETE`/`GET`.
5. **Efek nyata:** set `sidak_forecast` ke model lain, picu forecast dengan provider stub lokal yang sudah dipakai spec yang ada, lalu verifikasi `ai_usage_logs.model_id` = model baru. Ulangi untuk `ketik_review`.
6. Baris berisi model yang tidak ada di registry (disisipkan langsung lewat service role) → panggilan AI memakai `codeDefault`, tidak error.
7. `DELETE` → kembali ke `codeDefault`, audit tercatat.
8. UI: trainer melihat tab Model, mengganti model `sidak_forecast`, melihat badge "Diatur oleh …", lalu mengembalikan ke bawaan.

Spec yang sekarang meng-hardcode `gemini-3.8-flash` (±20 file di `apps/web/e2e/`) **tidak** diubah, karena tabel kosong mempertahankan perilaku lama.

## Tasklist

Status implementasi awal dan follow-up (2026-11-14); bukti sesi ini ada di bawah.

- [x] T0 Scope D1–D6 diteruskan oleh permintaan perbaikan Fajar.
- [x] T1 Types/registry dan capability sudah diimplementasikan; root typecheck lulus.
- [x] T2 Migration + rollback tersedia. Forward/rollback SQL follow-up diverifikasi lokal; clean full db reset tidak dijalankan pada sesi ini.
- [x] T3 Regresi API RED-first follow-up: empat kegagalan yang diharapkan teramati. RED sebelum route awal dibuat tidak diverifikasi ulang.
- [x] T4 Backend resolver/cache/route + capability: API GREEN.
- [x] T5 Pemanggil SIDAK/KETIK/Telefun diperbaiki; provider-model dan usage log lokal diverifikasi; regresi KETIK/Telefun lulus.
- [x] T6 UI sudah ada; hermetic browser dan alur browser→backend nyata lulus. Tidak ada perubahan layout pada follow-up.
- [x] T7 Docs architecture/database, rollback index, changelog diperbarui.
- [x] T8 Review, root typecheck/lint/build, E2E dan diff check lulus; satu follow-up commit ke main.
- [x] T9 Dengan izin eksplisit Fajar, `20261113160000_ai_model_policy` lalu `20261114121440_ai_model_policy_atomic_reset` sudah diterapkan dan diverifikasi di prod 2026-11-14. Bukti: `docs/database.md`.

## Tindak lanjut (di luar rencana ini)

- Hydrogen ditambahkan melalui follow-up `gemini-4-hydrogen.md`, tanpa menghapus 3.8 Flash atau mengubah default. Migration harga `20261114130615_add_gemini_4_hydrogen_pricing.sql` disiapkan lokal; prod menunggu izin baru. Uji audio Telefun tetap diperlukan sebelum `supportsAudioInput`.
- 2027-01-01: ganti `ketik_review`, `sidak_forecast`, `default_text` (dan `telefun_assessment` bila audio lolos) ke Hydrogen lewat tab Model.
- Opsional: penjadwalan perubahan model (D2).


## Requirement — follow-up 2026-11-14

Original implementation scope: fix review findings 1–8, verify locally, commit/push main. Production migration was subsequently authorized by Fajar with "apply migration"; completion is recorded below.
Preserve unrelated untracked plans. Gemini-only eligibility for SIDAK/Telefun; audit full_name; atomic reset;
effective scheduled pricing; actual SIDAK/KETIK provider-model and usage evidence; policy-derived KETIK lease;
one Telefun model per scoring unit; rollback index and honest plan status.

## Design — follow-up

Reuse readEffectivePricing for both listing and saving. Add a forward migration (never rewrite applied history)
with a backend-only SECURITY INVOKER reset RPC. Serialize setter/reset per task with transaction advisory locks.
Pass the resolved Telefun model from scoring orchestration through transcription, assessment and coaching.
Graphify exact resolveTaskModel query returned no matching nodes; use live rg callers/schema instead.
Context7 confirms explicit EXECUTE revocation is required; Supabase changelog has no relevant change to this existing RPC API.

## Tasklist — follow-up

- [x] Inspect contract/schema/loopback stack and preserve unrelated work.
- [x] RED: audit names, Gemini provider eligibility, reset failure atomicity, due schedule pricing.
- [x] Implement findings 1–4, 6–7 and add forward/rollback SQL.
- [x] Verify actual model on local provider requests and ai_usage_logs for SIDAK/KETIK (11/11 policy API checks passed before final snapshot regression expansion).
- [x] Run affected Telefun/KETIK regressions and thermo-nuclear review (51 passed, 1 pre-existing embedded-host skip).
- [x] Complete Lane D typecheck/lint/build and final diff check; integrate as one follow-up commit on main.
- [x] Production: both named migrations applied after Fajar approval; schema/history/RLS/grants/RPC bodies verified.

T0–T8 distinguish implementation from local verification. T9 is complete; production schema verification is recorded in `docs/database.md`.


Review findings repaired during follow-up: worker deadline/health still used the fixed KETIK lease;
claims now carry the model pair plus lease to processing/deadline/health. The real provider-path regression
also changes the primary policy after claim admission, proving the captured model remains in use.
Legacy optional claim fields retain compatibility with existing direct test fixtures; production claims always populate them.
No new lifecycle status or scattered status update was introduced.
Local SQL rollback + forward replay in one transaction succeeded; ACL probe returned anon=false,
authenticated=false, service_role=true for reset EXECUTE. Historical migration is unchanged.


### Follow-up evidence

- RED (exit 1): `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project monitoring-models-real-backend --reporter=line --workers=1` — 4 expected regressions failed; 5 passed.
- GREEN (exit 0): same policy project — 11 passed, including actual SIDAK/KETIK provider requests and ai_usage_logs.
- Final API regression (exit 0): `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project monitoring-models-real-backend --project telefun-scoring-real-backend --project ketik-review-worker-real-backend --reporter=line --workers=1` — 51 passed, 1 skipped. Includes policy change after KETIK claim and during Telefun transcription.
- Browser (exit 0): `pnpm --dir apps/web exec playwright test monitoring-models-real-backend.spec.ts monitoring-models.spec.ts --reporter=line --workers=1` — 2 passed. New spec forwards all model requests through real Hono/JWT/local Supabase; shell auth alone remains a browser fixture. Existing spec remains hermetic.
- Provider transport is stubbed locally, no paid/provider traffic. Usage logging and DB writes are real local product code. Playwright attaches selected-model-evidence (provider model paths and usage rows).
- Thermo-nuclear self-review: reused canonical pricing lookup; atomic DB operation; frozen models/lease carried by claim; no new lifecycle state. Existing direct fixture compatibility remains via optional claim metadata. No unresolved scoped finding.
- No meaningful UI/layout change in this follow-up; UI design/polish skills not applicable.
- Local prerequisites verified: trainerssuperappvite container label, loopback 54321/54322, populated public schema, initial policy migration present. OrbStack was started because it was stopped; no production target substituted.

- Final `pnpm typecheck`, `pnpm lint`, `pnpm build`: exit 0 each. Lint warnings remain in unrelated existing files; none in the changed paths.
- Final focused selected-model scenario after the claim-snapshot assertion was added: exit 0, 1 passed (8.8s). This rerun proves the latest spec, beyond the earlier 51-pass regression batch.
- Implementation-session `git diff --check`: exit 0. No unit/non-E2E suites were run. At that point no production deploy command, remote DDL, or paid provider call had been executed; subsequent authorized schema application is recorded below.

- Additional baseline replay on original HEAD product code (only owned paths temporarily restored, all follow-up bytes restored in finally): focused Telefun model freeze and KETIK configured lease both failed as expected (exit 1, 2 failed). Telefun's second eligible audio model is a temporary local-provider registry fixture, restored after the test; production audio capability flags are unchanged.
- Latest focused GREEN: `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project monitoring-models-real-backend --project telefun-scoring-real-backend -g 'one scoring unit|configured fallback timeout|selected SIDAK and KETIK models' --reporter=line --workers=1` — exit 0, 3 passed.
- After the fixture correction, `pnpm --filter @trainers/web typecheck` — exit 0; production code/build inputs did not change after the passing root build.

- Latest spec lint: `pnpm --filter @trainers/web exec eslint e2e/telefun-scoring-api.spec.ts` — exit 0.
- `graphify update .` completed: 19,810 nodes, 37,877 edges, 1,268 communities. HTML visualization skipped automatically because graph exceeds 5,000 nodes; graph.json/GRAPH_REPORT.md were updated in ignored local cache.
- Final JSON-reporter replay of the selected-model scenario: exit 0, 1 passed. Stable extracted evidence: [provider paths and actual usage model IDs](../evidence/ai-model-policy-selected-models-2026-11-14.json). It contains only local-stub model paths and action/model IDs, no JWTs or user data.
- Documentation/code drift repaired: R3 scheduled-pricing support, R5 atomic reset audit, D4 frozen work-unit models, policy-derived lease, missing rollback index, and stale DRAFT status. `profiles.full_name` is the schema source of truth; `nama_lengkap` was the erroneous audit reader.


## Production completion — 2026-11-14

Fajar explicitly authorized "apply migration" after local verification and push of `01795762`.
Preflight confirmed the healthy intended project and absent policy schema/history. Linked dry-run listed only the two authorized migrations.
`supabase db push --linked --yes` exited 0 and applied both in order, preserving their repository version IDs.
Postflight verified exact migration history, column types, RLS/no policies, backend-only table and function permissions,
SECURITY INVOKER/empty search path, matching RPC source MD5s, and zero policy/audit rows. Project remained ACTIVE_HEALTHY.
Final linked dry-run exited 0: Remote database is up to date. No production AI/UI flow was exercised and no model choice was changed.
See `docs/database.md` for the complete apply/verification record. All T0–T9 work is complete.
