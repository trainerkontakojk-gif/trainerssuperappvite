# Gemini: Berhenti Mengirim `temperature`

## Requirement

Google memberi tahu bahwa model Gemini mendatang akan **menolak** parameter sampling `temperature`, `top_p`, `top_k`, dan `thinking_budget`. Hasil audit (2026-10-08):

- `apps/api/src/lib/gemini.ts` → `generateGeminiContent()` **selalu** mengirim `temperature: options.temperature ?? 0.7` di dua tempat:
  - permintaan utama (`generateWithTimeout`, ±baris 105);
  - retry "Developer instruction is not enabled" (±baris 146).
- Akibatnya, walaupun modul tidak memilih temperature, nilai `0.7` tetap terkirim ke Google.
- Pemanggil yang melewati fungsi ini dan ikut terdampak:
  - KETIK: `apps/api/src/routes/ai.ts` (±baris 82), `apps/api/src/services/ketik/consumer-response.ts` (±baris 275);
  - PDKT: `apps/api/src/services/pdkt/shared-utils.ts` (`callAI`, ±baris 25), `apps/api/src/services/pdkt/evaluation-service.ts` (±baris 707);
  - SIDAK: `apps/api/src/services/sidak/ai-report-service.ts` (±baris 92), `apps/api/src/services/sidak/dashboard-forecast.ts` (±baris 339).
- `top_p` / `topP`, `top_k` / `topK`, `thinking_budget` / `thinkingBudget`: tidak ditemukan di jalur Vite.
- Telefun Live (`apps/telefun`): setup yang diperiksa tidak mengirim keempat parameter → **di luar scope**.

Acceptance:

1. Tidak ada request `ai.models.generateContent` dari `generateGeminiContent()` yang membawa `temperature` di `config`, baik di jalur utama maupun di jalur retry.
2. Signature `generateGeminiContent()` tidak berubah. `temperature?: number` tetap diterima (kompatibilitas pemanggil), tetapi diabaikan untuk Gemini.
3. Jalur OpenAI tidak berubah: `apps/api/src/lib/openai.ts` tetap memakai `temperature` sesuai dukungan model (reasoning model sudah meng-omit-nya).
4. Pemanggil KETIK/PDKT/SIDAK **tidak** diubah perilakunya; mereka tetap boleh meneruskan `temperature` (dipakai jika provider = OpenAI).
5. `apps/api` typecheck dan lint lulus.

Di luar scope:

- Menambahkan `thinkingConfig` / `thinking_level` (pakai default model dulu).
- Migrasi ke Interactions API atau ganti model/SDK.
- Mengubah `apps/telefun`.
- Mengubah default `0.7` di `openai.ts`, `routes/ai.ts`, atau `pdkt/shared-utils.ts` (nilai itu masih relevan untuk OpenAI).

Lane: **B** (satu modul `apps/api`, satu file runtime, pola yang sudah ada di `openai.ts` yang meng-omit `temperature` untuk model yang tidak mendukung). Tidak ada perubahan schema, auth/RLS, atau kontrak publik.

## Design

Perubahan minimum di `apps/api/src/lib/gemini.ts`:

```diff
           config: {
             systemInstruction,
             responseMimeType: options.responseMimeType,
             responseSchema: options.responseSchema,
             responseModalities: options.responseModalities,
-            temperature: options.temperature ?? 0.7,
           } as any,
```

```diff
             config: {
               responseMimeType: options.responseMimeType,
               responseSchema: options.responseSchema,
               responseModalities: options.responseModalities,
-              temperature: options.temperature ?? 0.7,
             } as any,
```

Pada definisi option, tambahkan komentar singkat agar pembaca tidak mengira nilainya dipakai:

```ts
  /** Ignored: newer Gemini models reject sampling params. Kept for caller compatibility (OpenAI path). */
  temperature?: number;
```

Perbarui komentar yang menyesatkan di `apps/api/src/services/ketik/consumer-response.ts` (±baris 234, "Gemini uses a conversational temperature…") supaya menyatakan bahwa temperature hanya berlaku untuk OpenAI; Gemini memakai default model. **Jangan** ubah logikanya.

Tidak ada fallback baru. Jika Google tetap menolak request, error mengalir seperti sekarang (tidak diubah menjadi sukses palsu).

### Verifikasi: batasan E2E

Suite Playwright di `apps/web/e2e` bersifat hermetic: semua `/api` di-mock di browser (`helpers/hermeticShell.ts`). Akibatnya E2E **tidak bisa** melihat payload keluar dari `apps/api` ke Google, sehingga tidak bisa membuktikan Acceptance #1.

Sesuai `AGENTS.md`, test non-E2E wajib disetujui Fajar. **Keputusan Fajar (2026-10-08): Opsi A disetujui**, termasuk menjalankan test terisolasi tersebut serta dua test pemanggil yang sudah ada pada langkah 5. Opsi B tidak dipakai dan hanya dicatat sebagai referensi.

- **Opsi A (dipilih):** satu file `apps/api/src/__tests__/gemini.test.ts` mengikuti pola `apps/api/src/__tests__/openai.test.ts`. Mock `@google/genai` (`getGeminiClient` / `ai.models.generateContent`), lalu assert:
  1. jalur utama: `config` tidak memiliki key `temperature` walaupun `temperature: 0.3` diberikan;
  2. jalur retry: error pertama `"Developer instruction is not enabled"` → panggilan kedua juga tanpa `temperature`;
  3. tanpa `temperature` di option → tetap tidak ada key `temperature` (bukan `0.7`).
  Failure mode yang dicakup: default `0.7` masih terkirim, retry path terlewat, key ada dengan nilai `undefined` (assert dengan `not.toHaveProperty("temperature")`).
  **Jangan** tambahkan ke `scripts/test-core.json` atau `scripts/test-fast.json`.
- ~~**Opsi B:**~~ (tidak dipilih) tanpa test baru. Cukup typecheck, lint, review diff, dan smoke manual ke API lokal dengan `GEMINI_API_KEY` non-produksi (misalnya generate laporan SIDAK di dev lokal).

## Tasklist

> Kerjakan berurutan. Jangan commit/push kecuali diminta. Jangan arahkan apa pun ke produksi.

- [x] **0. Drift check.** Pastikan baris `temperature: options.temperature ?? 0.7` masih ada di `apps/api/src/lib/gemini.ts` (2 kemunculan):
  ```bash
  grep -n "temperature" apps/api/src/lib/gemini.ts
  ```
  Juga pastikan tidak ada parameter sampling lain yang baru muncul:
  ```bash
  grep -rniE "top_?p|top_?k|thinking_?budget" apps/api/src
  ```
  Jika hasilnya berbeda dari Requirement, berhenti dan laporkan.
- [x] **1. RED.** Opsi A sudah disetujui, jadi tidak perlu bertanya lagi. Tulis `apps/api/src/__tests__/gemini.test.ts` **lebih dulu**, lalu jalankan dan pastikan RED (gagal karena `temperature` masih terkirim):
  ```bash
  pnpm --filter @trainers/api exec vitest run src/__tests__/gemini.test.ts --maxWorkers=1
  ```
- [x] **2. Patch.** Hapus kedua baris `temperature` di `config` pada `apps/api/src/lib/gemini.ts`, lalu tambahkan komentar JSDoc pada option `temperature`.
- [x] **3. Komentar KETIK.** Perbarui komentar di `apps/api/src/services/ketik/consumer-response.ts` (±baris 234). Ubah komentar saja, bukan kode.
- [x] **4. GREEN.** Jalankan ulang test pada langkah 1 sampai lulus.
- [x] **5. Cek regresi pemanggil.** Test yang sudah ada di `apps/api/src/__tests__/ketik-consumer-response-service.test.ts` dan `sidak-dashboard-forecast.test.ts` meng-assert `temperature` pada **argumen pemanggil**, bukan payload Google, sehingga seharusnya tetap valid. Fajar sudah mengizinkan menjalankan keduanya (jalankan berurutan, bukan paralel):
  ```bash
  pnpm --filter @trainers/api exec vitest run src/__tests__/ketik-consumer-response-service.test.ts --maxWorkers=1
  pnpm --filter @trainers/api exec vitest run src/__tests__/sidak-dashboard-forecast.test.ts --maxWorkers=1
  ```
- [x] **6. Static checks.**
  ```bash
  pnpm --filter @trainers/api typecheck
  ```
  ```bash
  pnpm --filter @trainers/api lint
  ```
  ```bash
  git diff --check
  ```
- [x] **7. Verifikasi akhir.**
  ```bash
  grep -n "temperature" apps/api/src/lib/gemini.ts
  ```
  Hasil yang diharapkan: hanya tersisa deklarasi option + komentar, tanpa `temperature:` di dalam `config`.
- [x] **8. Laporan.** Laporkan diff, perintah yang benar-benar dijalankan beserta hasilnya, dan bukti RED → GREEN dari `gemini.test.ts`. Jangan klaim cek yang tidak dijalankan.

## Bukti eksekusi

- Drift check: dua writer `temperature` ditemukan; pencarian sampling lainnya hanya menghasilkan false positive (misalnya `topParams` / `stopped`).
- RED: `pnpm --filter @trainers/api exec vitest run src/__tests__/gemini.test.ts --maxWorkers=1` → exit 1, 3 gagal karena key `temperature` bernilai `0.3` (utama/retry) dan `0.7` (default).
- GREEN: perintah yang sama setelah patch → exit 0, 3/3 lulus.
- Regresi: dua perintah langkah 5 dijalankan terpisah → exit 0 masing-masing, KETIK 29/29 dan SIDAK 13/13.
- `pnpm --filter @trainers/api typecheck` → exit 0.
- `pnpm --filter @trainers/api lint` → exit 0, 8 warning pada file di luar perubahan, 0 error.
- `pnpm exec prettier --check apps/api/src/__tests__/gemini.test.ts` → exit 0.
- `git diff --check` → exit 0. Self-review: hanya deklarasi option `temperature` tersisa, OpenAI dan logika pemanggil tidak diubah.
- `GRAPHIFY_MAX_WORKERS=1 graphify update .` → timeout setelah 120 detik; AST extraction selesai tetapi update graph belum terverifikasi. Pemeriksaan proses sesudah timeout tidak menemukan proses Graphify tersisa.
- Build/E2E/provider smoke tidak dijalankan (Lane B, pengecualian non-E2E Opsi A). Tidak ada commit/push atau perubahan remote.

## Follow-up (terpisah, bukan bagian plan ini)

- Evaluasi `thinkingConfig.thinkingLevel` per use case jika kualitas/latensi berubah setelah default model dipakai.
- Pertimbangkan migrasi ke Interactions API.
- Audit ulang `apps/telefun` saat setup Live berubah.
