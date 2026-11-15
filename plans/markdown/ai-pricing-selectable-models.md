# Tab Harga hanya menampilkan model yang bisa dipilih — 14 November 2026

Lane D: menyentuh AI billing/usage dan kontrak API monitoring (`/monitoring/pricing`, `/monitoring/models`, `/ai/models`). Wajib `trainers-superapp-tdd` (E2E RED-first) dan `thermo-nuclear` sebelum gate akhir. Tanpa migration dan tanpa mutasi data produksi.

## Requirement

Daftar harga aktif harus sama dengan model yang bisa dipilih; model lama tetap read-only tanpa perubahan biaya historis.

## Masalah

Tab **Monitoring → Harga** menampilkan setiap model di registry teks. Sumbernya ada di `apps/api/src/services/ai-pricing-service.ts:46`: `PRICING_MODELS = [...AI_MODELS, ...TELEFUN_LIVE_MODELS]`, dan `AI_MODELS` berisi seluruh `TEXT_MODELS` (`packages/types/src/ai-models.ts:380`). Akibatnya ada baris harga untuk model yang tidak pernah bisa dipilih di mana pun, misalnya `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview`, dan `gpt-5.6-luna`. Setiap model baru di `TEXT_MODELS` juga otomatis muncul di sana, seperti yang terjadi pada commit Hydrogen (`637291a0`).

Hanya menyaring tampilan tidak cukup. `eligibleModelsForTask` (`packages/types/src/ai-model-policy.ts:80`) hanya mengecek kapabilitas, jadi dropdown **Kebijakan Model per Tugas** tetap menawarkan model-model itu. Kalau admin memilih salah satunya, `setTaskModelPolicy` akan gagal dengan `MODEL_NO_PRICING`. Masalahnya cuma pindah tempat.

## Keputusan (Fajar, 14 Nov 2026)

1. **Desain:** buat satu allowlist eksplisit `SELECTABLE_MODEL_IDS`. Daftar Harga, dropdown Kebijakan Model, dan `/ai/models` semuanya diambil dari allowlist itu. `TEXT_MODELS` tidak diubah dan tetap menjadi registry kapabilitas, timeout, dan normalisasi id lama.
2. **`gpt-5.4-mini` tidak dipertahankan.** Fallback review KETIK pindah ke Gemini, sehingga OpenAI hilang dari daftar utama Harga.
   - `codeDefault` baru untuk `ketik_review_fallback` adalah `gemini-3.5-flash-lite`. Alasannya: modelnya berbeda dari model utama `gemini-3.8-flash`, dan lebih murah serta lebih cepat.
   - **Trade-off yang diterima:** fallback tidak lagi lintas provider. Kalau Gemini down total, model utama dan fallback gagal bersamaan.
3. **Grup "Model lama, hanya untuk riwayat" dibiarkan.** Baris `ai_pricing_settings` untuk model yang keluar dari allowlist tetap ada di database. Baris itu otomatis masuk grup historis lewat logika yang sudah ada (`historical: true`, `editable: false`). Tidak ada migration dan tidak ada penghapusan data.

## Design

### Allowlist (7 model)

| Provider | Model                                                                               | Dipakai oleh                                                  |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Gemini   | `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`                    | pilihan KETIK/PDKT (`KETIK_PDKT_MODEL_IDS`) + kebijakan tugas |
| Gemini   | `gemini-3.8-live`, `gemini-3.1-flash-live-preview`, `gemini-3.0-flash-live-preview` | pilihan suara Telefun (`TELEFUN_LIVE_MODELS`)                 |
| Gemini   | `gemini-3.1-flash-image`                                                            | generate gambar PDKT (`IMAGE_GENERATION_MODELS`)              |

Enam model pindah dari daftar utama ke grup "Model lama": `gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview`, `gpt-5.6-luna`, dan `gpt-5.4-mini`. Ini berlaku untuk model yang punya baris di `ai_pricing_settings`. Model tanpa baris tidak tampil sama sekali.

### Perubahan kode

1. **`packages/types/src/ai-models.ts`**
   - Tambahkan `SELECTABLE_MODEL_IDS`, yang **diturunkan** dari `KETIK_PDKT_MODEL_IDS`, id `TELEFUN_LIVE_MODELS`, dan id `IMAGE_GENERATION_MODELS`. Id tidak ditulis ulang.
   - Tambahkan `SELECTABLE_MODELS`, berisi entri `AI_MODELS` dan `TELEFUN_LIVE_MODELS` yang id-nya ada di allowlist, tanpa duplikat.
   - Karena diturunkan, model baru di `TEXT_MODELS` otomatis **tidak** ikut. Model hanya bisa dipilih kalau sengaja dimasukkan ke salah satu daftar pilihan.
2. **`packages/types/src/ai-model-policy.ts`**
   - `eligibleModelsForTask` menyaring dari `SELECTABLE_MODELS`, bukan `AI_MODELS`. Cek kapabilitas dan provider tetap berjalan. Model dengan metadata `realtime` dikecualikan: `supportsText` pada Live bukan dukungan GenerateContent untuk tugas teks.
   - `ketik_review_fallback.codeDefault` diubah menjadi `"gemini-3.5-flash-lite"`. Perbarui deskripsinya kalau masih menyebut cadangan lintas provider.
   - Dampaknya: kalau ada baris kebijakan yang menunjuk model di luar allowlist, `resolveTaskModel` (`apps/api/src/lib/ai-model-policy.ts:81`) otomatis memakai `codeDefault`. Fallback terbatas ini sudah ada dan sudah dikunci oleh skenario 5 di `monitoring-models-api.spec.ts`.
3. **`apps/api/src/services/ai-pricing-service.ts:46`**: `PRICING_MODELS = SELECTABLE_MODELS`. Respons model aktif mengirim `editable: true`. Logika baris historis di baris 170–180 tidak diubah.
4. **`apps/api/src/lib/ai-models.ts:114` (`getModelsForModule`)**: cabang `qa-analyzer` dan `default` disaring dengan allowlist. Cabang `ketik`, `pdkt`, dan `telefun` sudah merupakan subset.
5. **`apps/api/src/routes/ai.ts:89`**: `/ai/models` tanpa `module` mengembalikan `SELECTABLE_MODELS`, bukan `AI_MODELS`.
6. **Tidak disentuh:** `TEXT_MODELS`, `LEGACY_ALIASES`/`normalizeModelId`, special-case di `apps/api/src/lib/gemini.ts`, tabel fallback biaya di `apps/api/src/lib/ai-usage.ts:110`, dan `lib/openai.ts`. Semuanya tetap melayani id lama dan riwayat.

## Probe produksi (read-only, sebelum deploy)

Jalankan lewat Supabase MCP `execute_sql` pada `ruosnjmtywcrghjgqugz`. Hanya `SELECT` dan hanya agregat.

- **P1 — kebijakan aktif:** `SELECT task, model_id FROM ai_model_policy;`
  - Kalau `ketik_review` = `gemini-3.5-flash-lite`, fallback baru akan sama dengan model utama yang efektif. Sebelum deploy, tetapkan fallback eksplisit di UI atau pilih `codeDefault` lain.
  - Kalau ada baris yang menunjuk model di luar allowlist, catat. Setelah deploy, reset barisnya lewat `DELETE /monitoring/models/:task` supaya log tidak terus berisi warning.
- **P2 — pemakaian 30 hari terakhir per model:** `SELECT model_id, count(*) FROM ai_usage_logs WHERE created_at > now() - interval '30 days' GROUP BY 1;` Hasilnya jadi masukan untuk T4: model di luar allowlist yang masih dipakai menandakan masih ada jalur aktif ke model tersebut.

## Tasklist

### T1 — E2E RED

Perluas `apps/web/e2e/monitoring-models-api.spec.ts`. Project-nya `monitoring-models-real-backend`, yang menjalankan backend nyata in-process dengan Supabase lokal. Tambahkan skenario berikut:

1. Baris non-historis di `GET /monitoring/pricing` harus **sama persis** dengan gabungan id dari:
   - `eligible[].id` di `GET /monitoring/models`;
   - `/ai/models?module=ketik|pdkt|telefun`;
   - model gambar.

   Tidak boleh ada baris ekstra. **Hari ini harus merah.**

2. Setiap model eligible punya baris harga `editable: true`, jadi tidak ada pilihan tanpa harga.
3. Tidak ada baris non-historis dengan `provider: "openai"`. **Hari ini merah.**
4. `GET /monitoring/models` untuk `ketik_review_fallback` mengembalikan `codeDefault: "gemini-3.5-flash-lite"` dan tidak menawarkan `gpt-5.4-mini`. **Hari ini merah.**
5. Baris `ai_pricing_settings` lokal untuk model di luar allowlist tetap muncul di grup historis (`historical: true`, `editable: false`). `PUT` ke baris itu ditolak dengan `UNKNOWN_MODEL`.
6. `PUT /monitoring/models/ketik_review_fallback` dengan `gpt-5.4-mini` ditolak dengan `MODEL_NOT_ELIGIBLE`.

Jalankan spec, lalu simpan output merahnya sebagai bukti.

### T2 — Implementasi minimum

Kerjakan butir 1–5 di bagian "Perubahan kode", lalu jalankan T1 sampai hijau.

### T3 — Selaraskan spec yang terdampak

Spec yang perlu diperbarui:

- `apps/web/e2e/ketik-errors-api.spec.ts:261` saat ini mengharapkan panggilan fallback ke `gpt-5.4-mini`.
  - Ubah harapannya menjadi `gemini-3.5-flash-lite`.
  - Pastikan mock provider Gemini bisa membedakan panggilan utama dan panggilan fallback.
- `apps/web/e2e/monitoring-models.spec.ts:29` dan `apps/web/e2e/monitoring-harga.spec.ts:57` memakai `gpt-5.4-mini` di fixture mock UI. Ganti dengan model dari allowlist.

Spec yang tidak diubah: spec KETIK yang memakai `selectedModel: "gpt-5.4-mini"` sebagai input lama, yaitu:

- `ketik-session-api`
- `ketik-assignment-api`
- `ketik-integrity-api`
- `ketik-flow`
- `ketik-session-browser`

Spec-spec ini menguji koersi id lama, dan perilaku itu tetap berlaku.

### T4 — Audit jangkauan runtime

Grep pemanggil `normalizeModelId` dan `resolveModelProvider`. Pastikan tidak ada jalur aktif yang masih bisa sampai ke model di luar allowlist.

- Catatan: `normalizeModelId` memetakan id `deepseek-*` dan id yang mengandung `/` ke `gpt-5.4-mini`. Input KETIK/PDKT sudah dikoersi oleh `coerceKetikPdktModelId`.
- Kalau ditemukan jalur aktif (cek silang dengan P2), arahkan ke `DEFAULT_AI_MODEL_ID` di dalam plan ini, lengkap dengan E2E-nya.
- Kalau tidak ditemukan, cukup catat hasil auditnya.

### T5 — Review dan gate

1. Jalankan review `thermo-nuclear`.
2. Jalankan `pnpm typecheck`, lint untuk paket yang tersentuh, dan `git diff --check`.
3. Jalankan spec terfokus **satu per satu**, jangan paralel:
   - `monitoring-models-real-backend`
   - `monitoring-pricing-schedule-real-backend`
   - spec `ketik-errors-api`
   - `monitoring-models.spec.ts`
   - `monitoring-harga.spec.ts`
4. Tambahkan entri `CHANGELOG.md`, lalu jalankan `push-ready`. Buat satu commit, lalu push ke `main`.

### T6 — Verifikasi produksi setelah deploy

1. Railway otomatis men-deploy API dari `main`.
2. Setelah deploy selesai, pastikan `GET /monitoring/pricing` di produksi hanya berisi 7 baris editable. Sisanya harus ada di grup "Model lama".
3. Reset baris kebijakan yatim yang ditemukan di P1.
4. Catat bukti verifikasi di `plans/evidence/`.

## Catatan pelaksanaan — 15 November 2026

- Drift: commit `b6b4ba0c` sudah mengaktifkan audio Hydrogen. Pertahankan eligibility assessment Telefun tersebut.
- P1/P2 berhasil melalui `supabase db query --linked` (SELECT agregat), karena Supabase MCP offline (`fetch failed: bad port`). Linked project diverifikasi `ruosnjmtywcrghjgqugz` sebelum query.
- P1: primary KETIK Hydrogen, fallback eksplisit Flash; default_text, SIDAK, dan Telefun juga Hydrogen. Tidak ada kebijakan yatim dan tidak ada benturan primary/fallback. Code default fallback baru Flash Lite tidak menimpa kebijakan eksplisit Flash.
- P2: hanya model selectable tercatat selama 30 hari (Flash 175, Live 3.8 10, Live 3.1 2, Flash Lite 1). Tidak ada penggunaan model retired pada agregat ini.
- T4 menemukan jalur aktif di snapshot KETIK lama dan `/pdkt/mailbox/evaluate`. E2E membuktikan keduanya masih mengarah ke OpenAI sebelum perbaikan. Koersi model kini dijalankan di batas provider kedua layanan, tanpa mengubah snapshot tersimpan, normalisasi ID, registry legacy, atau harga historis.
- Spec Monitoring API tetap satu file meskipun melewati sekitar 1.000 baris: regression baru memakai fixture JWT/DB, cache invalidation, serta cleanup suite yang sama. Pemisahan harness/refactor lintas-spec ditunda agar tidak menambah scope dalam perubahan billing ini.
- Bukti dan status gate: `plans/evidence/ai-pricing-selectable-models-2026-11-15.md`.
- T6.3 hanya berlaku jika P1 menemukan kebijakan yatim; hasil P1 saat ini tidak membutuhkan mutasi produksi.

## Risiko

| Risiko                                                                                        | Mitigasi                                                               |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Gemini down total → review KETIK utama dan fallback gagal bersama                             | Diterima (keputusan 2). Error tetap ramah pengguna, tanpa sukses palsu |
| `ketik_review` produksi = `gemini-3.5-flash-lite` → fallback efektif sama dengan model utama  | Probe P1 sebelum deploy                                                |
| Baris kebijakan produksi menunjuk model yang keluar → warning setiap resolve (cache 60 detik) | Fallback ke `codeDefault` sudah ada; reset barisnya di T6.3            |
| Jalur lama masih mencatat usage dengan id yang keluar                                         | P2 + T4. Baris harganya tetap ada, jadi biayanya tetap terhitung benar |

## Di luar lingkup

- Menghapus baris harga lama di database (keputusan 3).
- Menghapus entri dari `TEXT_MODELS`, `LEGACY_ALIASES`, atau `lib/openai.ts`.
- Mengubah UI tab Harga selain data yang dikirim API.
- Menghitung ulang biaya historis.
