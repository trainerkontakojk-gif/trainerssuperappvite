# Sapaan agen Telefun dan KETIK

## Requirement

AI konsumen membaca nama perkenalan agen dalam percakapan aktual sebelum memilih sapaan. Nama ambigu/tidak tersedia menggunakan Kak; koreksi eksplisit agen mengalahkan perkiraan nama. Identitas konsumen, contoh skrip, dan suara bukan kepastian gender agen.

## Design

Lane C: perubahan aturan prompt pada dua pembangun instruksi yang sudah ada, tanpa mengubah API atau data profil. Nama perkenalan adalah nama yang diketahui konsumen; jangan mengungkap nama akun yang belum diperkenalkan. Nama hanya petunjuk, bukan bukti pasti gender. Telefun tidak lagi mengunci sapaan yang telanjur keliru. KETIK mempertahankan aturan ini di system instruction saat history dikompaksi.

## Tasklist

- [x] Telusuri pembangun prompt, caller, tes pemilik, dan lingkungan.
- [x] Perbarui E2E sapaan Telefun dan tambah E2E prompt KETIK; buktikan RED.
- [x] Terapkan aturan sapaan dan dokumentasikan perilaku.
- [x] Buktikan GREEN, review thermo-nuclear, lint/typecheck/build yang berlaku, format/diff dan Graphify.

## Evidence

Resource preflight awal lulus: free 52%, swap free 1637MB, disk 28GB. Docker awal mati; Fajar memilih menghidupkan lingkungan untuk E2E dan tidak memberi pengecualian tes unit. Tidak memakai penyedia AI nyata; E2E membuktikan instruksi terkirim, bukan kepatuhan model nyata.

- RED Telefun: `pnpm --filter @trainers/web exec playwright test e2e/telefun-consumer-prompt.spec.ts -g 'sapaan agen'` exit 1, 2 kegagalan tepat pada aturan lama yang belum membaca nama. Pada tahap RED ini implementasi Telefun sudah ditulis; GREEN kemudian lulus pada verifikasi akhir di bawah.
- OrbStack pulih pada percobaan start kedua (exit 0); container Supabase masih berhenti. Target `.env.integration`: 127.0.0.1:54321 dan DB 127.0.0.1:54322.
- Resource gate setelah OrbStack pulih: free 53%, swap free 1519MB, load5 51, disk 28GB; STOP pekerjaan berat karena load5 >30. Implementasi KETIK belum ditulis sebelum RED.
- Run lanjutan terjadwal 2026-11-02 18.01 WIB: `/Users/nadindyta/OpenBot/Shared/telefun/resource-gate.sh check` exit 1; free 55%, swap used 301MB, swap free 723MB, load5 23, disk 28GB. STOP karena swap free <768MB. Tidak memulai stack/E2E/build/typecheck, tidak mengubah source; Telefun GREEN dan KETIK RED tetap tertunda. Wait yang ada dipertahankan; tidak membuat atau mengubah jadwal.

- Fajar memberi instruksi eksplisit: “Abaikan gate. Langsung kerjakan”. Resource gate dilewati hanya untuk tugas ini, tanpa mengubah script atau ambang batas; seluruh pemeriksaan dijalankan serial. Docker label proyek trainerssuperappvite dan port54321/54322 dikonfirmasi sebelum start empat container DB/Auth/REST/Kong yang sudah ada.

- KETIK RED: focused Playwright API exit1, 1 gagal tepat karena SAPAAN UNTUK AGEN belum ada; nama Dwi sudah terbawa prompt. Semua request settings/session/turn 200 memakai JWT dan database lokal. DB/Auth/Kong healthy, REST up. Aturan KETIK kemudian ditambahkan, konsisten dengan Telefun.
- Review thermo-nuclear (self-review): tidak ada cabang/field/API baru; aturan berada dalam builder prompt pemiliknya, identitas konsumen tetap terpisah. Tidak mengubah suara, timer, billing, skenario atau data profil. Dua saluran mempertahankan aturan eksplisit agar tidak menambah dependensi API ke frontend; batas bukti tetap instruksi outbound, bukan respons provider nyata.

- GREEN KETIK: `pnpm --filter @trainers/web exec playwright test --config playwright.api.config.ts --project ketik-consumer-prompt-real-backend` exit0, 11/11 passed (36.9s), termasuk sapaan dan regresi lampiran/compaction. Tidak ada panggilan provider nyata.

## Verifikasi akhir — 2026-11-02

Status selesai untuk implementasi lokal Lane C. Tujuh path milik tugas tetap satu-satunya perubahan Git; tidak ada commit/push/deploy atau panggilan model berbayar. Semua fingerprint source, kedua spec, docs, dan plan cocok dengan input runner sebelum pembaruan bukti akhir pada plan ini. KETIK GREEN di atas tidak diulang karena tidak ada perubahan relevan setelahnya.

Runner serial `/Users/nadindyta/OpenBot/Shared/telefun/agent-salutation-run/verify.py` selesai dengan `status=passed`; command dan exit tersimpan dalam `status.json`, output pada log per tahap di direktori yang sama:

- `pnpm --filter @trainers/web exec playwright test e2e/telefun-consumer-prompt.spec.ts` — exit 0, **23/23 passed (2.7m)**, termasuk sapaan marah/ramah.
- `pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json` — exit 0.
- `pnpm --filter @trainers/web typecheck` — exit 0; source dan E2E TypeScript diperiksa.
- `pnpm exec turbo run lint --concurrency=1` — exit 0; 4 tasks successful, web mencatat 68 warnings dan 0 errors.
- `pnpm exec turbo run build --concurrency=1` — exit 0; 3 tasks successful, 1 cached.
- `pnpm exec prettier --check apps/api/src/services/ketik/consumer-response.ts apps/web/src/routes/telefun/services/promptBuilder.ts apps/web/e2e/ketik-consumer-prompt-api.spec.ts apps/web/e2e/telefun-consumer-prompt.spec.ts plans/markdown/consumer-agent-salutation.md` — exit 0.
- `git diff --check` — exit 0.
- `GRAPHIFY_MAX_WORKERS=1 graphify update .` — exit 0, sekali setelah batch kode terakhir. Cache tidak masuk Git; HTML visualisasi dilewati otomatis karena ukuran graph, bukan kegagalan update.

Review akhir thermo-nuclear: **PASS**, tidak ada temuan material tambahan pada diff. Aturan berada di pembangun instruksi pemilik kedua fitur; tidak menambah field/API/cabang, dependensi, atau akses nama akun. Pengulangan teks aturan disengaja untuk menjaga batas modul API dan frontend. Perubahan lama di spec selain aturan sapaan hanya formatting.

Batas bukti awal: E2E Telefun hermetic dan KETIK dengan JWT/database lokal serta provider mocked membuktikan instruksi outbound. Bukti respons model nyata dan batas penerimaan terbaru ada di bagian berikut; produksi belum berubah.

Pemeriksaan penutup memperluas Prettier ke kedua docs: awalnya exit 1 karena dua tabel lama `docs/telefun.md` belum terformat. `pnpm exec prettier --write docs/telefun.md` merapikan tabel tanpa perubahan makna. Prettier seluruh tujuh path kemudian lulus; `git diff --check` akhir lulus. Source dan spec tidak berubah setelah runner; hanya plan dan formatting docs diperbarui, sehingga E2E/typecheck/build tidak diulang.

## Penerimaan AI nyata — 2026-11-02

**Verdict terbaru: NO-GO untuk menyatakan seluruh fitur sapaan siap rilis.** Implementasi dan pemeriksaan statis sebelumnya lulus, tetapi model Telefun nyata melanggar aturan fallback. Tidak ada perubahan source untuk menyembunyikan kegagalan, pengulangan berbayar untuk mencari GREEN, commit, push, atau deploy.

- Persetujuan Fajar: tes provider nyata dan perbaikan binding stack lokal. DB/Kong direkreasi dengan konfigurasi runtime serta volume data yang sama; port54321/54322 sekarang hanya `127.0.0.1`. Health dan volume diverifikasi ulang, container rollback yang berhenti dibersihkan tanpa menghapus volume.
- KETIK: Playwright API E2E memakai router/backend asli, JWT nyata, DB lokal, dan Google `gemini-3.8-flash`; lima kasus dan tujuh generasi nyata lulus. Nama Budi → Pak Budi; Siti → Mbak Siti; Dwi → Kak Dwi; tanpa nama → Kak; koreksi Budi → Mbak Budi dipertahankan pada balasan berikutnya. Nama konsumen berlawanan dengan agen tidak tertukar.
- Telefun: Playwright membuka UI lokal, menangkap konfigurasi aplikasi dan menjalankan `GeminiLiveAdapter` produk ke Google `gemini-3.8-live`. Lima kasus dan tujuh balasan audio nyata: tiga kasus lulus, dua gagal. Dwi disapa “Mbak Dwi”; agen tanpa nama disapa “Mbak”, bukan Kak/tanpa sapaan. Nama laki-laki/perempuan dan koreksi eksplisit beserta satu balasan lanjutannya lulus. Transkripsi input mengenali nama sesuai stimulus.
- Batas Telefun: auth, penyimpanan sesi dan storage memakai fixture lokal; stimulus memakai suara sintetis Damayanti Bahasa Indonesia, PCM16/16kHz, disuntikkan ke input adapter sebagai pengganti nada mic palsu Chromium. Audio respons/transkripsi Google tidak dimock. Ini bukan penerimaan mikrofon/perangkat fisik, bukan E2E backend Telefun lengkap, dan belum menguji seluruh tipe konsumen. Tipe yang diuji adalah ramah.
- KETIK exit0 (`1 passed`, satu matriks lima kasus), Telefun exit1 (`1 failed`, satu matriks dengan dua pelanggaran sapaan). Semua hasil asli tetap disimpan. Kegagalan awal harness KETIK karena package ESM terjadi sebelum panggilan provider, diperbaiki dan dicatat terpisah.
- Cleanup KETIK dibaca ulang: user uji tidak ada, semua lima sesi milik run tidak ada, usage milik user uji tersisa nol. Empat fingerprint source/spec sama dengan versi sebelum tes. Dev server/browser sudah berhenti; stack lokal yang sebelumnya aktif tetap aktif.
- Harness, log, JSON, audio, dan screenshot: `/Users/nadindyta/.hermes/cache/scratch/salutation-live-20261102/`. Laporan tahan lama: `/Users/nadindyta/Downloads/hasil-tes-sapaan-ai-2026-11-02.md`; paket bukti tersanitasi: `/Users/nadindyta/Downloads/bukti-tes-sapaan-ai-2026-11-02.zip`.

Tindak lanjut terbuka: perbaiki kepatuhan fallback sapaan Telefun lalu lakukan acceptance ulang yang terarah dan diotorisasi. Jangan menganggap hasil satu sampel sebagai jaminan probabilistik semua nama, suara, persona, atau durasi panggilan.

## Perbaikan fallback Telefun — persetujuan “oke perbaiki”

### Requirement

Perbaiki dua kegagalan Live tanpa mengubah KETIK, data profil, transport, suara, atau deployment. Pertahankan koreksi eksplisit dan sapaan berbasis nama perkenalan yang tidak ambigu.

### Design

Aturan lama sudah terkirim tetapi tidak dipatuhi: kedua transkrip input dikenali, namun fallback kalah dalam keluaran audio. Penyebab spesifik internal model tidak dapat dipastikan. Hipotesis perbaikan minimal: naikkan aturan sapaan sebelum identitas konsumen, nyatakan sapaan awal netral sebagai aturan keras, larang suara mengubah fallback, dan beri contoh nama ambigu beserta pemeriksaan setiap giliran. Tidak menambah field, classifier, atau pemrosesan audio.

### Tasklist

- [x] RED E2E kontrak fallback/prioritas pada ramah dan marah (2 gagal sesuai aturan yang belum ada).
- [x] Perkuat aturan tunggal pada pembangun prompt Telefun.
- [x] GREEN seluruh E2E prompt dan pemeriksaan web.
- [x] Acceptance Live final: lima kasus/tujuh balasan, lima koneksi tanpa retry; hasil lama tidak ditimpa.
- [x] Review manual thermo-nuclear dan dokumentasi hasil; tanpa commit/push/deploy.

### Bukti perbaikan

- Iterasi pertama `live/` mengatasi Dwi/tanpa nama, tetapi Budi dan Siti juga memakai Kak. Oracle lama hanya melarang gender salah, sehingga exit0 itu tidak cukup untuk kebutuhan sapaan berdasarkan nama. Hasil ini tetap disimpan, bukan dianggap penerimaan final.
- Perbaikan kedua membatasi fallback awal sampai nama diketahui dan menetapkan hierarki eksplisit → nama jelas → netral. E2E RED diperluas (2 gagal), lalu seluruh spec GREEN **23/23 (3.0m)**. Oracle acceptance diperketat untuk mewajibkan sapaan laki-laki/perempuan pada nama jelas dan koreksi, bukan sekadar tidak salah gender.
- `live-final/`: satu run Google `gemini-3.8-live`, exit0, **5 kasus/7 balasan**, 5 koneksi tanpa retry. Budi → Mas Budi, Siti → Mbak Siti, Dwi → Kak, belum bernama → Kak, koreksi → Mbak Budi lalu Mbak pada giliran lanjut. Nama stimulus dikenali benar dan audio nyata ada pada setiap balasan. Ini tidak membuktikan reliabilitas semua nama/persona.
- `pnpm --filter @trainers/web typecheck` exit0; `pnpm exec turbo run lint --concurrency=1` exit0 (68 warning, 0 error); `pnpm exec turbo run build --concurrency=1` exit0. Semua diulang untuk source final.
- Bukti: `/Users/nadindyta/.hermes/cache/scratch/salutation-fallback-repair/`, dua iterasi provider terpisah dan log RED/GREEN dipertahankan. Input TTS Damayanti, adapter produk; auth/session/storage fixture lokal, bukan uji mic fisik atau seluruh backend.
- Review manual: scope hanya aturan prompt tunggal dan kontrak E2E, tidak mengubah KETIK/transport/billing/data profil. Contoh nama hanya pemetaan dan dilarang diperlakukan sebagai nama agen. Tidak ada classifier/field baru. Gbrain code reads permission_denied; Graphify lokal dan inspeksi source menjadi fallback pemetaan caller. Skill thermo-nuclear tidak tersedia, review dikerjakan sendiri.
- Penutup: `GRAPHIFY_MAX_WORKERS=1 graphify update .` selesai exit0; `graph.json` dan `GRAPH_REPORT.md` diperbarui. Visualisasi HTML dilewati karena ukuran graph, bukan kegagalan indeks. Prettier dan `git diff --check` final exit0. Tidak ada perubahan source setelah acceptance final.
