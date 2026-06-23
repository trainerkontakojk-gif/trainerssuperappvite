# Panduan Modul Aplikasi

Dokumen ini merinci fitur dan fungsi dari setiap modul utama yang tersedia di Trainers SuperApp.

Konvensi nama modul:

- **KETIK** = Kelas Etika & Trik Komunikasi
- **PDKT** = Paham Dulu Kasih Tanggapan
- **TELEFUN** = Telephone Fun
- **KTP** = Kotak Tool Profil
- **SIDAK** = Sistem Informasi Data Analisis Kualitas

## 1. Unified Dashboard

Dashboard tunggal yang berfungsi sebagai pusat informasi bagi semua tingkatan user.

- **Fungsi**: Menampilkan KPI ringkasan, grafik tren, dan log aktivitas terbaru.
- **Route**: `/dashboard`
- **Fitur Utama**:
  - **KPI Cards**: Ringkasan Total Temuan, Average Findings, Fatal Error Rate, dsb.
  - **Quick Shortcuts**: Navigasi cepat ke modul kerja sesuai role.
  - **Monitoring**: (Trainer/Leader/Admin) Memantau histori simulasi lintas akun, agregasi penggunaan token bulanan, dan editor harga/kurs untuk role yang diizinkan.
  - **User Management**: (Hanya Admin) Menyetujui pendaftaran, mengubah role, atau menghapus akun.
- **Sub-pages**:
  - `/dashboard/access-approval`: Approval akses leader ke data KTP dan SIDAK.
  - `/dashboard/access-groups`: Manajemen access groups untuk leader scope.
  - `/dashboard/activities`: Log aktivitas sistem (search/filter/pagination/CSV export/delete). Admin dan Trainer dapat melihat semua aktivitas lintas modul (SIDAK, Profiler, User Management).
  - `/dashboard/users`: Manajemen user (admin only).
- **Catatan Teknis**: Halaman `/monitoring` adalah permukaan terproteksi utama untuk monitoring AI usage dengan 3 tab: `Riwayat Simulasi`, `Penggunaan Token`, `Harga & Kurs`. Periode default penggunaan token selalu mengikuti WIB / `Asia/Jakarta`, bukan timezone browser. Hanya trainer/admin yang dapat mengedit pricing/kurs; leader hanya read-only untuk history + usage.

## 2. KETIK (Kelas Etika & Trik Komunikasi)

Ruang simulasi untuk melatih kemampuan komunikasi tertulis melalui media chat.

- **Fungsi**: Peserta berinteraksi dengan AI yang berperan sebagai pelanggan dalam berbagai skenario.
- **Routes**: `/ketik`, `/ketik/simulation`, `/ketik/history`
- **Fitur Utama**:
  - **Skenario Dinamis**: Latihan berdasarkan berbagai tingkat kesulitan.
  - **Roleplay Konsumen**: Balasan AI difokuskan sebagai konsumen chat natural, bukan evaluator.
  - **Riwayat Sesi**: Peserta bisa meninjau kembali percakapan sebelumnya.
  - **AI Review**: Evaluasi AI menggunakan rubrik Bahasa Indonesia dengan skala `0-100`.
  - **Usage Bulanan**: Quick-view `Usage Bulan Ini` dengan indikator kenaikan biaya sesi (`+Rp`).
- **Catatan Teknis**: KETIK menyimpan history chat di `ketik_history`. Review AI bersifat manual — user memicu review setelah sesi selesai. Backend API di `/api/v1/ketik/` menangani chat, review, dan history.
  - **Manual-only review**: Analisis AI hanya dimulai dari tombol "Mulai Analisis" oleh user, bukan otomatis saat sesi selesai.
  - **Retry after failure**: Jika review gagal, user dapat mengklik "Jalankan Ulang Analisis" untuk retry. Job status di-reset dari `failed` ke `queued`.
  - **Status reconciliation**: Polling status merekonsiliasi `ketik_history.review_status` dengan `ketik_review_jobs.status` agar UI tidak stuck pada `pending`.
  - **Provider fallback**: Review AI mencoba Gemini terlebih dahulu, lalu fallback ke OpenRouter (`openai/gpt-4o-mini`) jika Gemini gagal atau key tidak tersedia.
  - **Role restriction**: Hanya role `admin`, `trainer`, dan `qa` yang dapat menjalankan analisis AI. Role lain melihat tombol disabled dengan pesan akses.
  - **Sanitizer safety**: Structured JSON response tidak disanitasi sebelum parsing. Sanitasi hanya diterapkan ke field string setelah parse untuk mencegah corrupt JSON.
  - **Expected AI errors**: Error AI yang sudah dipahami backend tetap ditampilkan ke user, tetapi tidak dicetak sebagai stack trace console oleh chat UI agar simulasi tidak penuh noise.
  - **DeepSeek direct**: Model `DeepSeek V4 Pro` dan `DeepSeek V4 Flash` tersedia untuk KETIK jika `DEEPSEEK_API_KEY` diset di environment backend.
  - **Review lifecycle**: `POST /ketik/review` memproses job secara sinkron (await claimAndProcess). Job `queued` dan job `processing` dengan lease expired langsung di-reclaim. Job `failed` di-reset ke `queued` sebelum retry. Frontend polling memiliki timeout 120s — jika tidak mencapai terminal state, UI forced ke `failed` dengan tombol retry. Status reconciliation di `getKetikReviewStatus()` menandai stale processing (lease +30s grace) dan stale queue (5 menit TTL) sebagai `failed`.
  - **JSON extraction**: Parser review menggunakan `extractJsonObjectText()` untuk extrak JSON object dari output AI. Menangani plain JSON, markdown-fenced `json ... `, dan JSON dengan teks di sekitar. Tanpa ini, output fenced dari OpenRouter bisa menyebabkan parse error walaupun konten JSON-nya valid.
  - **Error messaging**: Polling status (`GET /ketik/review/status/:id`) mengembalikan `errorMessage` dengan teks manusiawi (Indonesia) jika status `failed`. Frontend menampilkan error toast. Job-level `error_message` (untuk log teknis) tidak diekspos langsung ke UI.

## 3. PDKT (Paham Dulu Kasih Tanggapan)

Workspace untuk latihan korespondensi email yang terstandarisasi dengan sistem persistent mailbox.

- **Fungsi**: Simulasi penulisan email balasan untuk keluhan atau pertanyaan pelanggan.
- **Routes**: `/pdkt`, `/pdkt/simulation`, `/pdkt/history`
- **Akses**: Trainer, QA, Admin. Agent dan role lain tidak memiliki akses ke modul ini.
- **Fitur Utama**:
  - **Durable Mailbox**: Inbound email tersimpan secara persisten di database.
  - **Manual Scenario Selection**: User secara eksplisit memilih skenario untuk menghasilkan email baru.
  - **Composer Reply**: Balasan memakai panel composer-style dengan field read-only.
  - **Async Evaluation**: Penilaian AI berjalan di latar belakang setelah balasan dikirim.
  - **History Replay**: Sesi riwayat tetap dapat dilihat walau mailbox item sudah dihapus (soft-delete).
  - **Idempotency**: Create mailbox dilindungi `client_request_id` untuk mencegah duplikasi.
  - **Filtering & Search**: Memudahkan user mencari email tertentu atau memfilter berdasarkan status.
- **Catatan Teknis**:
  - PDKT menggunakan tabel `pdkt_mailbox_items` sebagai penyimpanan utama kotak masuk.
  - Settings disimpan di `user_settings.settings.pdkt` agar tidak menimpa namespace modul lain, dengan fallback baca ke bentuk legacy top-level bila diperlukan. Settings response API selalu mengikuti kontrak `{ success, data }`.
  - Backend API di `/api/v1/pdkt/` menangani mailbox, compose, reply, dan evaluation.
  - Error database mentah dipetakan ke pesan user-friendly via `pdktErrorMessage()` helper.
  - Migrasi field legacy `script` → `sampleEmailTemplate` dijalankan saat settings dibaca.
  - DUMMY_PROFILES pool 20 identitas dengan 25 kota acak untuk variasi identitas konsumen.
  - Usage delta setelah evaluasi async di-retry hingga 2x (2s delay) untuk akurasi.
  - **DeepSeek direct**: Model `DeepSeek V4 Pro` dan `DeepSeek V4 Flash` tersedia di pengaturan PDKT jika `DEEPSEEK_API_KEY` diset di environment backend.
- **Evaluasi AI (Single-Turn)**:
  - Prompt hanya menerima tepat satu email inbound konsumen dan satu balasan agent OJK 157.
  - Seluruh body kedua email diteruskan ke prompt tanpa konteks thread tambahan.
  - Input dengan jumlah atau komposisi pesan selain satu inbound dan satu balasan ditolak sebelum AI dipanggil.
  - Metadata panjang body dicatat via `console.debug` tanpa menyimpan isi email ke log.
  - **Retry & JSON Contract**: Retry transient error (429/500/503/timeout) hingga 2x dengan delay 250/500ms tetap dipertahankan. Output JSON contract (`score`, `typos`, `clarityIssues`, `contentGaps`, `feedback`) tidak berubah.

## 4. TELEFUN (Telephone Fun)

Modul simulasi komunikasi suara untuk melatih intonasi dan kecepatan respon telepon.

- **Fungsi**: Mempersiapkan peserta untuk menangani panggilan telepon melalui simulasi suara berbasis AI.
- **Route**: `/telefun`
- **Fitur Utama**:
  - **Live Voice Interface**: Panggilan dimulai dari ringtone, izin mikrofon, dan koneksi WebSocket.
  - **Hold & Mute**: User bisa mute mikrofon dan menahan panggilan. Hold memiliki batas layanan (pertama 1 menit, berikutnya 3 menit) yang tidak memutus panggilan. UI menampilkan countdown, peringatan 10 detik terakhir, dan overtime (+MM:SS) setelah batas. Durasi hold dihitung dari timestamp, bukan tick timer. Metrics hold tersimpan di `session_metrics.hold` (intervals, durasi, exceeded count). Penilaian Manajemen Hold: N/A (tidak digunakan), Baik (semua ≤ batas), atau Kurang (ada yang melebihi batas). AI tidak menilai hold — policy aplikasi menentukan hasil secara deterministik.
  - **Recording & History**: Rekaman browser disimpan ke local history dan `telefun_history`.
  - **Voice Assessment**: Analisis otomatis kualitas suara agen.
  - **Realistic Mode**: Mode realistik dengan hold consent, rude hold penalty, dan WPM analysis.
  - **Expanded Voices**: Opsi suara Gemini Live dinamis dengan gender consistency guards.
  - **Maintenance Warning Gate**: Entry to Telefun dari sidebar, dashboard card, atau URL direct `/telefun` dilindungi oleh role-based access gate. User dengan role admin/trainer di-auto-grant akses langsung tanpa modal warning. User dengan role lain (leader, agent) melihat modal "Akses Terbatas" dengan pesan "Modul Telefun hanya dapat diakses oleh Trainer" dan hanya bisa kembali ke dashboard. Status akses di-reset otomatis saat meninggalkan modul Telefun.
  - **Gemini Live JSON Protocol**: Menggunakan format JSON terstruktur untuk setup dan pengiriman chunk audio base64 (MIME `audio/pcm;rate=16000`), menggantikan transfer data binary mentah yang rentan force close. Output suara dari Gemini Live didecode dari JSON inline base64 PCM secara real-time pada sample rate output (default 24 kHz).
  - **Setup Complete Gating**: Pengiriman audio microphone ke WebSocket ditahan (gated) di sisi client dan proxy sampai pesan `setupComplete` dikonfirmasi oleh Gemini.
  - **Deterministic Finalization**: Proses penyimpanan sesi diatur secara deterministik (Upload Rekaman → Patch Metadata → Finalize Path → Request Scoring → Patch Score & Feedback) untuk memastikan analisis suara tidak gagal akibat data audio belum tersedia. Feedback disimpan di kolom `feedback` terpisah secara konsisten.
  - **WebSocket Close-Code Mapping**: Menampilkan pesan error terperinci untuk error status koneksi (seperti token login kadaluarsa `4001`, origin ditolak `4003`, Gemini API error `1011`, atau network terputus `1006`). Close normal dari user (code `1000`) tidak ditampilkan sebagai error; close tanpa status `1005` dipetakan secara khusus sebagai indikasi proxy/network/upstream.
  - **Auto Hangup & Time Cues**: Durasi panggilan dibatasi sesuai `maxCallDuration` dengan reminder audio/text cue bertahap (2 menit, 1 menit, 30 detik, 20 detik). App timer adalah satu-satunya otoritas timeout; AI tidak diminta mengestimasi waktu sendiri.
  - **Self-Close Guard**: Prompt Telefun melarang konsumen menutup sendiri hanya karena solusi awal, arahan website/link/form laporan, estimasi SLA, nomor referensi, atau penjelasan agen sudah terdengar cukup. Konsumen tetap kooperatif, tetapi harus lanjut bertanya/konfirmasi sampai aplikasi mengirim cue penutup.
  - **Gemini Live Session Management**: Untuk sesi panjang (>5 menit), setup menyertakan `contextWindowCompression` dan `sessionResumption`. Proxy server mendeteksi `goAway.timeLeft` dan `sessionResumptionUpdate.newHandle` untuk reconnect proaktif dengan setup caching.
  - **Server Reconnect Lifecycle**: Saat koneksi Gemini putus non-1000, proxy reconnect dengan backoff, re-send cached setup, menyertakan session handle jika ada, dan hanya flush audio setelah `setupComplete`. Client mendapat status "Menyambung ulang..." dan "Tersambung".
  - **Duration Audit Source**: Durasi final sesi memakai elapsed timestamp dari `session_metrics.sessionDurationMs` saat tersedia, sehingga reconnect status seperti "Menyambung ulang..." tidak membuat durasi audit lebih pendek dari runtime aktual.
  - **Keepalive**: Server mengirim ping berkala (30 detik) ke client dan Gemini untuk mengurangi idle disconnect.
  - **AudioWorklet**: Browser modern menggunakan AudioWorklet (`/audio-input-processor.js`) untuk pemrosesan mikrofon. Browser lama atau jika load gagal, fallback ke ScriptProcessorNode. Tidak ada warning deprecasi pada browser modern.
  - **Recording Path RLS Security**: Mengunggah file rekaman ke storage Supabase memakai struktur direktori terproteksi RLS `<user_id>/<session_id>/(full_call|agent_only).webm` dan divalidasi ketat oleh API backend.
  - **Recording Playback Access**: File rekaman di bucket `telefun-recordings` tetap private. Browser tidak boleh memakai `recording_path` mentah sebagai URL audio; backend membuat signed URL sementara. Pemilik sesi dapat memutar rekamannya sendiri dari modul Telefun, sedangkan akses lintas-user untuk mendengar rekaman hanya diberikan kepada `admin` dan `trainer`. Monitoring Telefun detail juga memakai signed URL yang sama dan tidak memberikan URL pemutaran untuk role lain.
  - **Playback Queue Cleanup**: Setiap `AudioBufferSourceNode` yang dibuat oleh `playPcm()` dilacak dalam `activeSources: Set<AudioBufferSourceNode>`. Saat `serverContent.interrupted`, `setHold(true)`, atau turn baru tiba setelah `turnComplete` lama, seluruh source aktif dihentikan dan antrian dibersihkan untuk mencegah overlap audio. Chunk lanjutan dalam turn yang sama tetap diantrikan normal. `turnComplete` tidak langsung mengakhiri `isAiSpeaking` - ditunda sampai source terakhir selesai natural (via `onended`).
- **Catatan Teknis**: Sesi live default memakai model transport `gemini-3.1-flash-live-preview` (menggunakan parameter `telefunModelId`). Telefun proxy server di `apps/telefun/` memvalidasi origin/JWT, memverifikasi kepemilikan session ID, dan meneruskan JSON secara aman ke Gemini Live API. Sesi WebSocket melekat langsung ke session row yang dibuat API frontend untuk mencegah data duplikat. Close code 1005 dari browser dipetakan sebagai sinyal diagnostik jaringan, bukan kesalahan pengguna. Proxy menutup upstream dengan code/reason eksplisit pada client close/error (1000/1011).

## 5. KTP / Profiler (Kotak Tool Profil)

Sistem manajemen database terstruktur untuk peserta training dan agen aktif.

- **Fungsi**: Penyimpanan terpusat data diri, riwayat training, dan penugasan tim.
- **Routes**: `/profiler`, `/profiler/table`, `/profiler/slides`, `/profiler/analytics`, `/profiler/export`, `/profiler/add`, `/profiler/import`, `/profiler/teams`
- **Fitur Utama**:
  - **Table View**: Search, filter, dan edit data peserta.
  - **Analytics**: Recharts analytics dengan 4 chart.
  - **Export**: Excel/CSV export.
  - **Import**: Excel template generation dan upload.
  - **Teams**: Custom team management.
- **Catatan Teknis**: File peserta/foto memakai Supabase Storage bucket `profiler-foto`. Backend API di `/api/v1/profiler/` (18 endpoints) menangani semua operasi CRUD.

## 6. SIDAK (Sistem Informasi Data Analisis Kualitas)

Platform analytics kualitas untuk memantau performa agent secara mendalam.

- **Fungsi**: Mengolah data temuan QA menjadi wawasan yang dapat ditindaklanjuti melalui dashboard, ranking, input manual, dan laporan otomatis.
- **Routes**:
  - **Landing** (`/sidak`): 6 card links ke sub-modul.
  - **Dashboard** (`/sidak/dashboard`): KPI ringkasan, tren kualitas, bar charts, dan top agents.
  - **Input Audit** (`/sidak/input`): Entry temuan manual multi-step + Excel upload.
  - **Ranking** (`/sidak/ranking`): Ranking agent berdasarkan skor dan defect.
  - **Settings** (`/sidak/settings`): Service weights configuration.
  - **Periods** (`/sidak/periods`): Manajemen periode audit.
  - **Agents** (`/sidak/agents`): Direktori agent dengan pencarian.
  - **Agent Detail** (`/sidak/agents/$id`): Score history + findings table.
  - **Reports** (`/sidak/reports`): Data vs AI report selection.
  - **Reports Data** (`/sidak/reports-data`): Filter form + temuan table + Excel export.
  - **Reports AI** (`/sidak/reports-ai`): AI-powered report generation.
- **Fitur Utama**:
  - **Versioned Rules**: Parameter penilaian per service+periode dengan versioning.
  - **Scoring Engine**: Perhitungan skor agent dengan weighted/counting mode, clean-session handling, phantom padding exclusion.
  - **Dashboard Summary Rollup**: Cache KPI per periode untuk performa dashboard.
  - **Phantom Padding**: Clean session (audit tanpa temuan real) tetap dihitung sebagai valid audit.
  - **Sesi Tanpa Temuan**: Trainer/admin dapat membuat 5 sesi phantom (nilai=3) ketika agent belum memiliki temuan buruk, memastikan scoring adil dengan padding 5 sesi.
  - **Excel Upload**: Template generation, parsing, dan validasi untuk bulk input temuan.
- **Catatan Teknis**: Backend API di `/api/v1/sidak/` (16 endpoints) di-dekomposisi ke 5 sub-module route handler (`apps/api/src/routes/sidak/{core,dashboard,temuan,rule-versions,reports}.ts`). Business logic di `apps/api/src/services/sidak-service.ts` — barrel dari 13 sub-modules di `apps/api/src/services/sidak/`. Scoring engine di `apps/api/src/lib/scoring.ts`.
