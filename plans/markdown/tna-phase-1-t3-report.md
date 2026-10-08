# TNA Fase 1 — Laporan T3 (rev. 7)

## Status

T3 selesai: drill-down dan kebutuhan, **Lane D**, mengikuti `plans/markdown/tna-phase-1.md` rev. 7. Branch `feat/tna-phase-1`. T4 belum dimulai. Tidak ada commit, push, deploy, migrasi, atau akses remote. Dirty work T0–T2 dan perubahan lain yang sudah ada dipertahankan.

## Implementasi

- `apps/api/src/routes/tna.ts`: `GET /parameters/detail`, `POST /needs`, `GET /needs`, `GET /needs/:id`, capability `tna.read`/`tna.write`, validasi input dan error Indonesia 400/404/422/503. `GET /programs` tetap katalog aktif, kini berbagi reader dengan drill-down.
- `apps/api/src/services/tna/detail.ts`: D2 memakai langsung `deriveAgentRootCauses` pada findingRows parameter terpilih lintas agent. Tidak ada registry kata kunci baru. Maksimal 5 klaster, 3 bukti/klaster, 10 contoh tiket; agent terdampak dan saran program dari katalog aktif dengan kecocokan klaster/layanan.
- `apps/api/src/services/tna/parameters.ts`: ekstraksi pemilihan periode/bucket dan loader metadata agar daftar, drill-down, dan snapshot validasi menggunakan jalur yang sama. Formula/threshold T2 tidak diubah.
- `apps/api/src/services/tna/read-service.ts`: katalog, daftar kebutuhan dengan filter layanan/periode/outcome dan paginasi penuh, detail `{ need, plans }`; semua memakai user client/JWT sehingga RLS berlaku.
- `apps/api/src/services/tna/write-service.ts`: satu boundary mutasi, menghitung ulang snapshot dari data QA saat POST, kemudian `supabaseAdmin.rpc("tna_create_need", { p_actor_id, p_payload })`. Actor berasal dari auth, suggested cluster berasal dari hasil D2. Setelah sukses memanggil `logActivity` (`module: tna`, `type: add`, action memuat ID kebutuhan).
- `packages/types/src/tna.ts`: kontrak drill-down/detail/filter kebutuhan dan schema respons need. Schema create membuang field tambahan; angka/snapshot/suggested cluster/created_by dari body tidak diteruskan. Validated cluster trainer tetap tersimpan terpisah dari dugaan otomatis.
- `apps/web/e2e/tna-needs-api.spec.ts`: 5 skenario E2E real backend loopback. `helpers/accessMatrix.ts`: 4 entri endpoint T3 baru, tidak melemahkan assertion.
- `docs/modules.md`: kontrak backend sampai T3, batas T4/T5 disebut eksplisit.

`findings = 0`, baik audit ada maupun tidak ada audit, menghasilkan **422 `TNA_NO_FINDINGS`**, tanpa insert. Parameter bukan kandidat dengan temuan > 0 tetap boleh divalidasi. Schema/grant/RPC dari T1 tidak diubah; activity log yang ada menerima modul `tna` tanpa migrasi CHECK tambahan (dibuktikan row log nyata).

## Bukti RED → GREEN

RED sebelum implementasi:

```bash
pnpm --filter @trainers/web exec playwright test tna-needs-api.spec.ts --config playwright.api.config.ts --project tna-real-backend
```

Exit **1**, 1 failed, 4 did not run. Assertion drill-down: expected **200**, received **404**. Backend `/api/v1/tna/parameters/detail` benar-benar dipanggil dengan JWT lokal. File spec merupakan artifact repeatable; fixture randomUUID, guard loopback, cleanup data milik fixture di `afterAll`.

Perintah yang sama setelah implementasi: exit **0**, **5 passed**. Coverage kemudian diperluas dan diverifikasi dalam suite lengkap di bawah.

Bukti anti-pemalsuan: drill-down awal 3 temuan; QA diubah sebelum POST menjadi 2 temuan; body mengirim `validation_snapshot.findings = 999999`, `findings = 999999`, suggested cluster palsu, actor palsu. Respons dan DB menyimpan **2**, tingkat `2/33*100`, actor trainer sebenarnya, suggested cluster `kurang_menggali`. Activity log untuk **ID need yang sama** tepat 1 row. Setelah findings nol, body snapshot palsu tetap mendapat 422 dan jumlah kebutuhan tidak bertambah.

## Verifikasi

| Perintah                                                                                                        | Exit / hasil                                                  |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project tna-real-backend` | **0, 17 passed** (12 T1/T2 + 5 T3)                            |
| `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project gate-stub`        | **0, 24 passed**                                              |
| `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json`                                                        | **0**                                                         |
| `pnpm --filter @trainers/web exec tsc --noEmit -p tsconfig.e2e.json`                                            | **0**                                                         |
| `pnpm --filter @trainers/web exec tsc --noEmit`                                                                 | **0**                                                         |
| `pnpm exec eslint src/routes/tna.ts src/services/tna/*.ts` (cwd `apps/api`)                                     | **0**                                                         |
| `pnpm --filter @trainers/web exec eslint e2e/tna-needs-api.spec.ts e2e/helpers/accessMatrix.ts`                 | **0**                                                         |
| `pnpm exec prettier --check` pada file T3                                                                       | **0**                                                         |
| `git diff --check` + `git diff --no-index --check /dev/null <file baru T3>`                                     | **0**, tidak ada whitespace error                             |
| `graphify update .`                                                                                             | **0**, cache AST diperbarui; HTML dilewati karena >5.000 node |

Cakupan E2E T3: auth 401/403/200/201, detail admin/trainer, count manual 3 temuan/3 affected/5 audited/33 sesi, metadata dan pembanding, clean/phantom/QA excluded, 1.250 temuan lintas paginasi, 5 klaster/3 evidence/10 tiket, create training dan eskalasi, validated cluster berbeda dari suggested cluster, filter layanan/periode/outcome, detail need + plans kosong, bukan kandidat tetap bisa create, snapshot dihitung ulang, body diabaikan, activity log nyata, audit-ada-nol-temuan dan tidak-ada-audit ditolak 422, input invalid 400 dan identitas tidak ditemukan 404. Coverage T1 tetap membuktikan JWT trainer tidak dapat DML atau menjalankan RPC mutasi, guard RPC tidak membuat DB crash.

Cleanup suite diverifikasi lewat `docker exec supabase_db_trainerssuperappvite psql -U postgres -d postgres -Atc "<SQL di bawah>"`: `tna_needs=0`, `tna_plans=0`, row QA fixture=0, peserta fixture=0, activity TNA fixture=0. `docker logs supabase_db_trainerssuperappvite --since 15m 2>&1 | rg -c 'signal 11'`: tidak ada match (exit 1 dari `rg`, bukan failure DB).

Dua kesalahan perintah/check awal sudah dikoreksi: Playwright menganggap spec sebagai nama project bila ditaruh setelah `--project` yang menerima beberapa argumen; spec dipindah sebelum opsi. Glob lint dari root dengan `pnpm --dir` tidak diekspansi ke workspace; perintah diulang dari cwd `apps/api`. Typecheck awal menemukan nullable phantom pada adapter helper SIDAK; dinormalisasi menjadi boolean, semua typecheck diulang dan lulus. Ini tidak diklaim sebagai RED produk.

## Review dan knowledge tools

Skill `trainers-superapp-tdd` tersedia dan dibaca dari `.claude/skills/trainers-superapp-tdd/SKILL.md`; memakai workflow E2E-first, tanpa test non-E2E atau Superpowers. Supabase skill juga dibaca. Graphify query awal tidak relevan; retry exact `deriveAgentRootCauses` memberi caller SIDAK dan helper matcher, kemudian diverifikasi dengan sumber hidup. Context7 via `mcporter`: resolve Supabase, query `/websites/supabase`, kontrak RPC argumen bernama; [referensi resmi RPC](https://supabase.com/docs/reference/javascript/rpc). Changelog Supabase diperiksa; tidak ada perubahan dependency/schema/image pada T3.

Review `thermo-nuclear-code-quality-review` scoped T3: tidak ada temuan material tersisa. Registry dan formula tidak diduplikasi; pemilihan periode/metadata dipakai bersama; mutasi hanya di write-service; route hanya auth/validasi/orkestrasi; tidak ada file melewati 1.000 baris. Review K6: pembacaan TNA/QA memakai user JWT, payload RPC eksplisit, actor dari auth, service-role mutasi TNA hanya di write-service; logActivity mengikuti service aktivitas yang disetujui D6.

## Batas dan handoff

Tidak ada STOP condition tersisa. `logActivity` mengikuti perilaku best-effort service existing; log berhasil dibuktikan pada jalur sukses, kegagalan log bukan transaksi yang sama dengan RPC. Snapshot merupakan hasil pembacaan QA saat POST; tidak mengklaim lock transaksi bersama QA selama perhitungan TypeScript.

T4 (rencana/aktivasi/pembatalan), T5 UI/browser, dan gate T6 (root typecheck/lint/build serta review integrasi) belum dijalankan. Relasi plans sudah dibaca oleh detail need; coverage plan non-kosong mengikuti T4. Tidak ada non-E2E test, perubahan remote, commit, atau push. **Berhenti setelah T3 dan laporkan sebelum T4.**

## Perintah format dan cleanup yang dapat diulang

```bash
pnpm exec prettier --check apps/api/src/routes/tna.ts apps/api/src/services/tna/{parameters,detail,read-service,write-service}.ts packages/types/src/tna.ts apps/web/e2e/tna-needs-api.spec.ts apps/web/e2e/helpers/accessMatrix.ts docs/modules.md plans/markdown/tna-phase-1-t3-report.md
```

SQL read-only cleanup check yang dijalankan dengan `docker exec` di atas:

```sql
SELECT 'tna_needs='||count(*) FROM tna_needs
UNION ALL SELECT 'tna_plans='||count(*) FROM tna_plans
UNION ALL SELECT 'fixture_qa='||count(*) FROM qa_temuan
WHERE peserta_id IN (SELECT id FROM profiler_peserta WHERE batch_name LIKE 'tna-fixture-%')
UNION ALL SELECT 'fixture_profiles='||count(*) FROM profiler_peserta WHERE batch_name LIKE 'tna-fixture-%'
UNION ALL SELECT 'fixture_activity='||count(*) FROM activity_logs WHERE module='tna';
```
