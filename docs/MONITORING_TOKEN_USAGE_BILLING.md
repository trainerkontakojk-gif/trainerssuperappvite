# Monitoring Token Usage & Billing

Dokumen ini menjelaskan kontrak fitur monitoring token bulanan, billing Rupiah, editor pricing/kurs, dan quick-view usage di modul simulasi.

## Tujuan Fitur

Fitur ini menambahkan observabilitas usage AI lintas modul dengan dua permukaan utama:

- `/dashboard` (tab monitoring) untuk rekap lintas akun
- quick-view usage bulanan di modul `KETIK`, `PDKT`, dan `TELEFUN` untuk user login

Tujuan utamanya:

- melihat jumlah call sukses, token input/output/total, dan estimasi billing Rupiah per akun
- menyimpan snapshot harga dan kurs saat request terjadi agar histori biaya tidak berubah saat setting baru disimpan
- menjaga pelacakan usage tetap server-side (backend Hono) untuk data lintas akun

## Permukaan UI

### 1. Dashboard Monitoring

Halaman monitoring dengan tiga tab:

- `Riwayat Simulasi` (Redesigned to replace crowded cards with a spacious, premium data table featuring client-side pagination, 4 dynamic growth KPI cards, inline date-range popover, and modular submetric columns to eliminate overstimulation)
- `Penggunaan Token`
- `Harga & Kurs`

Tab `Penggunaan Token`:

- default ke bulan berjalan WIB / `Asia/Jakarta`
- mendukung filter `bulan`, `tahun`, dan `module`
- pencarian `Cari pengguna...` mencakup nama akun (`full_name`) dan email
- tabel utama menampilkan agregasi per akun: call sukses, input tokens, output tokens, total tokens, billing IDR
- baris akun dapat diklik untuk menyeleksi pengguna di breakdown
- tabel breakdown menampilkan data per pengguna, modul, dan model

Tab `Harga & Kurs`:

- hanya tersedia untuk `trainer` dan `admin`
- menampilkan editor harga input/output per model
- menampilkan editor kurs USD/IDR

### 2. Quick-view Modul

KETIK dan PDKT menampilkan tombol `Usage Bulan Ini`. Telefun menampilkan tombol `Usage`.

Scope quick-view:

- KETIK hanya menghitung `module = 'ketik'`
- PDKT hanya menghitung `module = 'pdkt'`
- TELEFUN hanya menghitung `module = 'telefun'`

Isi modal:

- **Estimasi Biaya Bulan Ini** (Metrik Utama)
- **Kenaikan Biaya Sesi Terakhir** (Metrik Utama jika ada sesi baru)
- Call AI, Total Tokens, Input & Output Tokens (Detail Teknis)

QA Analyzer ikut tercatat dalam monitoring usage bulanan, tetapi tidak memiliki quick-view modal khusus.

#### Indikator Kenaikan Biaya Sesi (`+Rp`)

Setelah sesi selesai, tombol `Usage Bulan Ini` menampilkan indikator kenaikan biaya yang disebabkan oleh sesi terakhir.

**Prinsip Utama:**
Indikator ini memprioritaskan pertambahan biaya dalam **Rupiah** untuk memberikan visibilitas langsung terhadap konsumsi saldo AI.

**Cara kerja:**

1. Saat user memulai sesi baru, sistem mengambil snapshot usage bulan berjalan ke baseline sesi aktif.
2. Saat user menutup sesi, sistem menghitung delta terhadap baseline sesi aktif.
3. Delta ditampilkan sebagai badge kecil di tombol `Usage Bulan Ini` dan di header modal.

#### Kebijakan Backfill Biaya (Rp0)

Jika ditemukan data penggunaan (`ai_usage_logs`) pada **bulan berjalan** yang memiliki `estimated_cost_idr = 0` padahal jumlah token positif, sistem mendukung backfill terbatas.

**Aturan Backfill:**

- Hanya berlaku untuk baris pada bulan berjalan (WIB).
- Hanya menyasar baris dengan `estimated_cost_idr = 0` dan token > 0.
- Menggunakan harga model dan kurs terbaru saat ini.
- Baris yang sudah memiliki nilai biaya non-zero **tidak disentuh**.

## Boundary Waktu

Seluruh agregasi bulanan menggunakan WIB / `Asia/Jakarta`:

- awal bulan: tanggal 1 pukul `00:00:00.000 WIB`
- akhir bulan: hari terakhir pukul `23:59:59.999 WIB`

## Kontrak Logging

### Usage (AI Calls)

Usage dicatat untuk setiap AI call, baik sukses maupun gagal/timeout di backend.

Yang dicatat pada setiap row `ai_usage_logs`:

- `request_id` unik, `user_id`, `provider`, `model_id`, `module`, `action`
- `status`: `'success'`, `'failed'`, atau `'timeout'`
- `error_message`: pesan error jika gagal/timeout (maks 1000 char); `null` jika sukses
- `input_tokens`, `output_tokens`, `total_tokens` (0 jika gagal/timeout)
- `input_price_usd_per_million`, `output_price_usd_per_million`
- `usd_to_idr_rate`, `estimated_cost_usd`, `estimated_cost_idr` (0 jika gagal/timeout)

Aturan penting:

- request sukses dan gagal/timeout sama-sama dicatat, dengan `status` yang membedakan
- retry/fallback internal tidak boleh menghasilkan row tambahan (setiap request_id unik)
- jika provider tidak memberi metadata token, flow user tetap lanjut tetapi usage tidak dicatat
- jika pricing model belum tersedia, flow user tetap lanjut tetapi usage tidak dicatat (cost 0)

### Activity Logs (Audit Trail)

Mutasi penting di setiap modul dicatat ke tabel `activity_logs` via shared helper `logActivity()` di `apps/api/src/services/activity-log-service.ts`.

Format: `{ user_id, user_name, action, module, type }`

Cakupan per modul:

| Modul   | Events Tercatat                                                                        |
| ------- | -------------------------------------------------------------------------------------- |
| SIDAK   | create/delete period, delete temuan, publish/supersede rule version, save/delete report archive, upload batch temuan |
| KTP     | create/delete year, create/delete folder, create/update/delete peserta, move peserta, create/delete team |
| USER_MGMT | update status/role, delete user, reset password, access approval mutations            |

## Action Map per Modul

Action `usageContext` yang saat ini aktif:

| Modul         | Action                                                                          |
| ------------- | ------------------------------------------------------------------------------- |
| `ketik`       | `chat_response`, `session_timeout`, `generate_consumer_response`               |
| `pdkt`        | `init_email`, `generate_ai_images`, `generate_scenario_images`, `generate_template`, `evaluate_response`, `async_evaluate_agent_response` |
| `telefun`     | `voice_live`, `voice_tts`, `chat_response`, `first_message`, `score_generation` |
| `qa-analyzer` | `report_generation`                                                             |

Catatan:

- `generate_consumer_response` dihitung sebagai biaya simulasi KETIK pada ringkasan usage bulanan.
- `init_email` dihitung sebagai biaya create email PDKT.
- `generate_ai_images` dan `generate_scenario_images` dihitung sebagai biaya lampiran AI PDKT.
- `evaluate_response` dan `async_evaluate_agent_response` dihitung sebagai biaya penilaian AI PDKT.
- `/ai/usage/summary` tetap mengembalikan `simulationCostIdr` dan `reviewCostIdr`, serta menambahkan `breakdownItems` untuk label detail seperti `Create Email`, `Lampiran AI`, dan `Penilaian AI`.

## Pricing dan Kurs

### Pricing Model

Editor pricing selalu dibangun dari dua sumber:

- registry model kanonik di `AI_MODELS` (`apps/api/src/lib/ai-models.ts`)
- row yang sudah tersimpan di `ai_pricing_settings`

Perilaku editor:

- semua model di `AI_MODELS` selalu muncul, walau tabel pricing masih kosong
- nilai `0` berarti usage model tersebut belum dihitung biayanya secara bermakna

### Kurs USD/IDR

Kurs aktif dibaca dari entri terbaru di `ai_billing_settings`.

Saat kurs baru disimpan:

- request baru memakai kurs terbaru
- histori lama tetap memakai snapshot kurs yang sudah tersimpan di `ai_usage_logs`

## Access Matrix

| Fitur                                 | Admin | Trainer | Leader | Agent |
| ------------------------------------- | ----- | ------- | ------ | ----- |
| Monitoring histori lintas akun        | Ya    | Ya      | Ya     | Tidak |
| Monitoring usage lintas akun          | Ya    | Ya      | Ya     | Tidak |
| Editor pricing model                  | Ya    | Ya      | Tidak  | Tidak |
| Editor kurs USD/IDR                   | Ya    | Ya      | Tidak  | Tidak |
| Quick-view `Usage Bulan Ini` di modul | Ya    | Ya      | Ya     | Ya    |

Catatan:

- akses lintas akun dilakukan server-side di backend (Hono API), bukan direct browser read
- `leader` boleh melihat usage lintas akun, tetapi tidak menerima data editor pricing/kurs

## Smoke Test Manual

- Simpan harga input/output untuk satu model yang sebelumnya bernilai `0`, lalu pastikan refresh editor tetap menampilkan seluruh daftar model
- Ubah kurs USD/IDR, lalu pastikan nilai kurs aktif ikut berubah tanpa menghapus histori lama
- Jalankan satu sesi KETIK sukses, lalu cek quick-view dan monitoring bertambah
- Jalankan satu sesi PDKT sukses, lalu cek quick-view `pdkt`
- Jalankan flow Telefun yang memicu AI call, lalu cek usage muncul untuk modul `telefun`
- Jalankan pembuatan narasi laporan QA Analyzer, lalu cek usage muncul untuk modul `qa-analyzer`
- Login sebagai `leader`; pastikan tab `Penggunaan Token` ada, tetapi tab `Harga & Kurs` tidak ada

## Transport Auth & Error Handling (v35 hardening)

Semua API call monitoring di frontend (`apps/web/src/routes/monitoring.tsx`) menggunakan helper `getApi`/`putApi`/`postApi` dari `apps/web/src/hooks/useApi.ts` yang otomatis menginjeksi `Authorization: Bearer <token>` dari `localStorage.auth_token`. Tidak ada raw `fetch()` tanpa auth header.

### Error Mapping

Error dari backend dimap ke pesan human-friendly:

| Backend Error | Pesan User |
| --- | --- |
| `Unauthorized` / `Invalid token` | Sesi Anda telah berakhir. Silakan login kembali. |
| Pesan lain | Ditampilkan apa adanya |
| Network error | Terjadi kesalahan koneksi. Periksa jaringan Anda. |

### Toast Feedback

Operasi save pricing dan billing memberikan feedback via sonner toast:
- Sukses: "Harga berhasil disimpan." / "Kurs berhasil disimpan."
- Gagal: "Gagal menyimpan harga." / "Gagal menyimpan kurs." + pesan error.

## Batasan v1

- tidak ada backfill histori lama
- tidak ada export CSV/XLSX untuk tab usage token; CSV export tersedia di `/dashboard/activities` untuk activity logs
- quick-view tersedia untuk KETIK, PDKT, dan TELEFUN; QA Analyzer hanya lewat monitoring pusat
- jika model belum punya pricing atau provider tidak memberi metadata token, request user tetap berjalan tetapi usage tidak tercatat

## Referensi

- `apps/api/src/lib/ai-models.ts` — Model registry
- `apps/api/src/lib/ai-usage.ts` — Usage logging
- `apps/web/src/hooks/useApi.ts` — Authenticated API helper (inject bearer token)
- `apps/web/src/routes/monitoring.tsx` — Monitoring page (3 tab, legacy visual parity)
- `apps/web/src/__tests__/monitoring-unauthorized-parity.test.tsx` — Regression tests (20 tests)
- `docs/modules.md`
- `docs/database.md`
- `docs/auth-rbac.md`
