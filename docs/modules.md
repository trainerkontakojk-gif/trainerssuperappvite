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
  - **Monitoring**: (Trainer/Leader/Admin) Memantau histori simulasi lintas akun yang dipaginasi penuh dari source canonical KETIK/PDKT/Telefun tanpa cap tersembunyi, agregasi penggunaan token bulanan, dan editor harga/kurs untuk role yang diizinkan; detail menampilkan metadata served-consumer dan assessment native per modul, sedangkan row Telefun legacy hanya kompatibilitas bila tidak ada row canonical.
  - **User Management**: (Hanya Admin) Menyetujui pendaftaran, mengubah role, atau menghapus akun.
- **Sub-pages**:
  - `/dashboard/access-approval`: Approval akses leader ke data KTP dan SIDAK.
  - `/dashboard/access-groups`: Manajemen access groups untuk leader scope.
  - `/dashboard/activities`: Log aktivitas sistem (search/filter/pagination/CSV export/delete). Admin dan Trainer dapat melihat semua aktivitas lintas modul (SIDAK, Profiler, User Management).
  - `/dashboard/users`: Manajemen user (admin only).
- **Catatan Teknis**: Halaman `/monitoring` adalah permukaan terproteksi utama untuk monitoring AI usage dengan 3 tab: `Riwayat Simulasi`, `Penggunaan Token`, `Harga & Kurs`. Riwayat Simulasi membaca source sampai habis lewat paging offset-range deterministik, fail-closed dengan 500 jika source/page/profile/coaching read gagal, urutan equal timestamp memakai tie-breaker `id`, memuat metadata served-consumer KETIK/PDKT/Telefun, assessment native lengkap, thread/transcript penuh, dan Telefun coaching recommendations runtime-normalized dari `telefun_coaching_summary`. Periode default penggunaan token selalu mengikuti WIB / `Asia/Jakarta`, bukan timezone browser. Hanya trainer/admin yang dapat mengedit pricing/kurs; leader hanya read-only untuk history + usage.

## 2. KETIK (Kelas Etika & Trik Komunikasi)

Ruang simulasi untuk melatih kemampuan komunikasi tertulis melalui media chat.

- **Fungsi**: Peserta berinteraksi dengan AI yang berperan sebagai pelanggan dalam berbagai skenario.
- **Routes**: `/ketik`, `/ketik/simulation`, `/ketik/history`
- **Fitur Utama**:
  - **Skenario Dinamis**: Latihan berdasarkan berbagai tingkat kesulitan.
  - **Roleplay Konsumen**: Balasan AI difokuskan sebagai konsumen chat natural, bukan evaluator.
  - **Riwayat Sesi**: Peserta bisa meninjau kembali percakapan sebelumnya.
  - **AI Review**: Evaluasi AI menggunakan rubrik Bahasa Indonesia dengan skala `0-100`.
  - **Monitoring detail**: `/monitoring` menampilkan `consumer_name`, `consumer_phone`, `consumer_city`, `simulationDuration`, transcript lengkap, dan score native; jika `consumer_name` hilang, API tetap null dan UI menampilkan unavailable, bukan placeholder buatan.
  - **Usage Bulanan**: Quick-view `Usage Bulan Ini` dengan indikator kenaikan biaya sesi (`+Rp`).
  - **Scenario Image Safety**: Lampiran gambar diakumulasi secara functional; FileReader yang terlambat, pending, atau gagal tidak bisa menimpa draft yang sudah ditutup atau dibuka ulang.
  - **Template Cepat Standar + Pribadi**: Daftar template standar KETIK dikelola admin dan dibaca sama oleh seluruh user. Setiap user juga dapat menambah, mengubah, dan menghapus template pribadi yang hanya aktif di akunnya; shortcut `/` menampilkan keduanya.
- **Akses**: `admin`, `trainer`, `leader`, `qa`, `tl`, `spv`, `om`, dan `agent` dapat memakai simulasi KETIK; analisis AI tetap dibatasi `admin`, `trainer`, dan `qa`.
- **Catatan Teknis**: KETIK menyimpan history chat di `ketik_history`. Review AI bersifat manual — user memicu review setelah sesi selesai. Backend API di `/api/v1/ketik/` menangani chat, review, history, dan settings.
  - **Manual-only review**: Analisis AI hanya dimulai dari tombol "Mulai Analisis" oleh user, bukan otomatis saat sesi selesai.
  - **Retry after failure**: Jika review gagal, user dapat mengklik "Jalankan Ulang Analisis" untuk retry. Job status di-reset dari `failed` ke `queued`.
  - **Status reconciliation**: Polling status merekonsiliasi `ketik_history.review_status` dengan `ketik_review_jobs.status` agar UI tidak stuck pada `pending`.
  - **Scenario image safety**: Lampiran gambar ditambah dengan akumulasi functional; callback FileReader yang terlambat, pending, atau errored diabaikan, dan save tidak jalan sampai pembacaan selesai.
  - **Save & reset safety**: Save scenario, save settings, dan reset settings menunggu request selesai; state draf tetap terbuka bila persisten gagal atau konflik.
  - **Settings versioning**: GET/PUT settings membaca dan mengirim `x-settings-version`. Save wajib membawa header itu; backend memakai optimistic compare-and-swap pada `user_settings.updated_at`. Jika versi stale, respons `409 SETTINGS_CONFLICT` minta user memuat ulang/sinkronisasi lalu retry.
  - **Global quick-template versioning**: GET settings juga mengembalikan `x-ketik-templates-version`. Admin menyimpan perubahan template melalui `PUT /api/v1/ketik/templates` dengan optimistic compare-and-swap pada singleton `ketik_global_settings.updated_at`; versi stale menghasilkan `409 SETTINGS_CONFLICT`.
  - **Template ownership**: Migration `20260910120000_ketik_global_quick_templates.sql` menyalin daftar template dari admin pertama yang memiliki settings ke singleton global. Row `user_settings` lama tidak dihapus; `PUT /api/v1/ketik/settings` menyimpan `personalQuickTemplates` milik user, dan GET menggabungkan template standar global dengan template pribadi. Konflik shortcut standar ditolak/diabaikan agar user tidak dapat menimpa template global.
  - **Best-effort backup**: Recovery cache KETIK memakai `localStorage` per user (`ketik_settings_backup:<userId>`). Backup hanya ditulis setelah GET/save berhasil, dan kegagalan storage/quota diabaikan karena server tetap sumber kebenaran.
  - **CORS exposure**: CORS API mengekspos `x-settings-version` dan `x-ketik-templates-version` agar browser dapat membaca versi terbaru untuk masing-masing resource.
  - **Provider fallback**: Review AI mencoba Gemini terlebih dahulu, lalu fallback langsung ke OpenAI Responses API (`gpt-5.4-mini`) jika Gemini gagal atau key tidak tersedia.
  - **Role restriction**: Hanya role `admin`, `trainer`, dan `qa` yang dapat menjalankan analisis AI. Role lain melihat tombol disabled dengan pesan akses.
  - **Sanitizer safety**: Structured JSON response tidak disanitasi sebelum parsing. Sanitasi hanya diterapkan ke field string setelah parse untuk mencegah corrupt JSON.
  - **Expected AI errors**: Error AI yang sudah dipahami backend tetap ditampilkan ke user, tetapi tidak dicetak sebagai stack trace console oleh chat UI agar simulasi tidak penuh noise.
  - **Legacy model normalization**: Model lama dari OpenRouter/DeepSeek dinormalisasi ke model direct yang tersedia saat settings dibaca, jadi UI lama tetap terbuka tanpa badge baru.
  - **Review lifecycle**: `POST /ketik/review` memproses job secara sinkron (await claimAndProcess). Job `queued` dan job `processing` dengan lease expired langsung di-reclaim. Job `failed` di-reset ke `queued` sebelum retry. Frontend polling memiliki timeout 120s — jika tidak mencapai terminal state, UI forced ke `failed` dengan tombol retry. Status reconciliation di `getKetikReviewStatus()` menandai stale processing (lease +30s grace) dan stale queue (5 menit TTL) sebagai `failed`.
  - **JSON extraction**: Parser review menggunakan `extractJsonObjectText()` untuk extrak JSON object dari output AI. Menangani plain JSON, markdown-fenced `json ... `, dan JSON dengan teks di sekitar. Tanpa ini, output fenced dari provider apa pun bisa menyebabkan parse error walaupun konten JSON-nya valid.
  - **Error messaging**: Polling status (`GET /ketik/review/status/:id`) mengembalikan `errorMessage` dengan teks manusiawi (Indonesia) jika status `failed`. Frontend menampilkan error toast. Job-level `error_message` (untuk log teknis) tidak diekspos langsung ke UI.
  - **Send-while-loading guardrail (ACTIVE, Phase 211)**: Consumer/AI typing atau generation-in-flight tidak boleh menonaktifkan textarea, tombol Send, atau Enter key. Satu-satunya guard yang valid untuk mengirim pesan: input kosong, melebihi batas karakter (`isOverLimit`), dan fase sesi yang tidak aktif/expired. Overlapping send menggunakan mekanisme **latest-wins**: `sendGenerationRef` yang diinkrementasi di awal `handleSend()` + `clearPendingTimeouts()` sebelum setiap pengiriman baru memastikan respons AI yang stale (dari generasi sebelumnya) dibuang. Lihat regression test di `ketik-chat-interface.test.tsx` (5 test case: textarea tetap enabled, typing saat loading, Send button tetap enabled, second send in-flight, Enter saat loading). Perubahan ini bersifat permanen — tidak ada regresi yang boleh mengembalikan blokade isLoading pada input/Send/Enter.
  - **Evaluasi Edukatif**: Review KETIK menghasilkan lapisan edukasi di atas skor deterministik. AI hanya memberi narasi `diagnosis`/`howToFix`/`exampleRewrite` per dimensi; backend menentukan `label`, `score`, `verdict` (threshold 90/75/60), dan `priorityRank: 1..5` (sort skor ASC + urutan dimensi tetap) di `buildKetikEducation()`. Fallback rule-based (`KETIK_EDUCATION_FALLBACK` per score band critical <60 / medium 60-74 / good ≥75) dipakai bila AI tidak mengirim narasi atau untuk histori lama — tanpa rerun AI. Hasil persist di kolom `ketik_session_reviews.education JSONB` (nullable, migration `20260823000000`) termasuk `typosEnriched`. Semua string nested AI disanitasi via `sanitizeKetikEducation()`. Endpoint monitoring `GET /api/ai/monitoring/history/ketik/:id/review` memetakan `education` dengan fallback dari skor tersimpan. UI: `SessionReviewModal` & `KetikReviewPanel` menampilkan "3 Prioritas Perbaikan" (top-3 `priorityRank`) + "Cara Memperbaiki Per Dimensi" dengan contoh rewrite yang bisa dicopy.

## 3. PDKT (Paham Dulu Kasih Tanggapan)

Workspace untuk latihan korespondensi email yang terstandarisasi dengan sistem persistent mailbox.

- **Fungsi**: Simulasi penulisan email balasan untuk keluhan atau pertanyaan pelanggan.
- **Routes**: `/pdkt`, `/pdkt/simulation`, `/pdkt/history`
- **Akses**: Trainer, QA, Admin, Leader, dan Agent. Agent dan Leader dapat mengakses simulasi PDKT.
- **Fitur Utama**:
  - **Durable Mailbox**: Inbound email tersimpan secara persisten di database.
  - **Manual Scenario Selection**: User secara eksplisit memilih skenario untuk menghasilkan email baru.
  - **Composer Reply**: Balasan memakai panel composer-style dengan field read-only.
  - **PDF Attachments**: Scenario setup menerima lampiran PDF sebagai bukti. Preview dirender sebagai file tile; gambar tetap di-zoom, PDF dibuka di tab baru. Daftar mailbox tidak mengunduh attachment inline; attachment email terpilih dimuat melalui endpoint detail.
  - **Multi-Recipient Email Targets**: Setiap skenario bisa menyimpan daftar email tujuan tambahan per skenario dengan mode `single` atau `multiple`. Field Penerima Utama mengatur arah narasi email awal; skenario baru dan metadata lama yang kosong menggunakan OJK 157 sebagai penerima utama, sedangkan pilihan eksplisit perusahaan terlapor tetap dipertahankan.
  - **Scenario Editor Wizard**: Wizard tiga tahap untuk membuat dan mengedit skenario PDKT. User memilih mode **Skenario AI** (AI membuat contoh email dari deskripsi situasi) atau **Email buatan sendiri** (subject/body ditulis user) sebelum masuk wizard. Label tahap menjadi `Skenario AI`/`Email Anda`, `Profil Pengirim`, lalu `Tujuan & Pratinjau`.
  - **Tujuan & Pratinjau**: Tahap ketiga mengikuti urutan `Penerima Email → Email Tambahan/Lampiran → Pratinjau Email → Simpan`. Pada desktop, penerima dan lampiran berada di kolom kiri, preview email di kolom kanan; pada layar kecil layout ditumpuk dalam urutan yang sama. Mode AI memakai aksi `Buat Pratinjau`/`Buat Ulang` setelah konteks utama tersedia. Mode manual menampilkan preview email dan affordance `Edit Email` untuk membuka editor subject/body tanpa menampilkan kontrol AI.
  - **Progressive Simulation Settings**: Pengaturan perilaku simulasi berada paling bawah dalam disclosure `Pengaturan tambahan` yang tertutup secara default. Area wizard dapat di-scroll tanpa menutup sticky footer; footer edit memakai label `Simpan Skenario`.
  - **Attachment & Submit Safety**: Lampiran skenario diakumulasi secara functional; FileReader yang terlambat atau errored tidak bisa menimpa draft baru, submit/reset native dikunci sampai pembacaan selesai, dan save/reset menunggu request sukses sebelum menutup form.
  - **Async Evaluation**: Penilaian AI berjalan di latar belakang setelah balasan dikirim.
  - **History Replay**: Sesi riwayat tetap dapat dilihat walau mailbox item sudah dihapus (soft-delete).
  - **Idempotency**: Create mailbox dilindungi `client_request_id` untuk mencegah duplikasi.
  - **Retry tanpa regenerasi**: `/session/init` dan `/session/create` mengembalikan draft mailbox opaque yang ditandatangani server ketika email sudah dibuat tetapi persistence gagal; `/mailbox/batch` memverifikasi token actor-bound dan menyimpan email yang sama tanpa memanggil AI lagi.
  - **Atribusi sesi**: Target participant, batch, tim, pelaksana, dan status evaluasi memakai snapshot authoritative yang diproyeksikan konsisten di mailbox, history, monitoring review, dan CSV export. Intent snapshot PDKT hanya dapat dibuat backend melalui service role sebelum dipakai RPC user-JWT; direct RPC tidak dapat memalsukan metadata. Legacy tanpa snapshot tetap ditampilkan sebagai target tidak tercatat.
  - **Monitoring detail**: `/monitoring` menampilkan `identity`, `consumer_type`, `recipient/contact`, snapshot config yang allow-list normalized, email thread penuh, evaluasi lengkap, error, dan timing; tidak ada kontrol delete/reply di permukaan monitoring.
- **Catatan Teknis**:
  - PDKT menggunakan tabel `pdkt_mailbox_items` sebagai penyimpanan utama kotak masuk.
  - **Mailbox list/detail contract**: `GET /api/v1/pdkt/mailbox` hanya memilih kolom scalar untuk `PdktMailboxListItem`; empat snapshot JSON berat (`inbound_email`, `emails_thread`, `scenario_snapshot`, dan `config_snapshot`) tidak dibaca dari Supabase pada list path. Setelah item dipilih, `GET /api/v1/pdkt/mailbox/:id` memuat `PdktMailboxItem` lengkap berikut thread dan attachment. Kedua route memakai user JWT/RLS dan role guard yang sama; detail yang tidak terlihat atau sudah dihapus menghasilkan `404`.
  - **Session-open reuse**: landing meneruskan settings beserta `x-settings-version`, history, scenarios, dan consumer types yang sudah siap ke workspace. Workspace hanya melakukan fallback fetch untuk data yang belum tersedia. Perubahan settings/version dan history di dalam workspace disinkronkan kembali ke landing agar pembukaan ulang tidak memakai snapshot stale; request usage baseline tidak menahan perpindahan ke mailbox.
  - Settings disimpan di `user_settings.settings.pdkt` agar tidak menimpa namespace modul lain, dengan fallback baca ke bentuk legacy top-level bila diperlukan. Settings response API selalu mengikuti kontrak `{ success, data }`.
  - **Settings versioning**: GET/POST settings membaca dan mengirim `x-settings-version`. Save wajib membawa header itu; backend memakai optimistic compare-and-swap pada `user_settings.updated_at`. Jika versi stale, respons `409 SETTINGS_CONFLICT` minta user memuat ulang/sinkronisasi lalu retry. Setiap save sukses memperbarui revision landing dan workspace agar save berikutnya memakai versi terbaru.
  - **CORS exposure**: CORS API mengekspos `x-settings-version` agar browser dapat membaca versi terbaru.
  - **No migration/storage redesign**: Perubahan ini tidak menambah migrasi atau merombak storage; namespace `pdkt` tetap disimpan pada row `user_settings` yang sama.
  - **Awaited save/reset**: `usePdktSettingsDraft()` dan wizard menunggu `onSave` selesai sebelum menutup modal; error atau konflik menjaga draf tetap terbuka untuk retry.
  - Setiap skenario bisa menyimpan daftar email tujuan tambahan per skenario dengan mode `single` atau `multiple`; `konsumen@ojk.go.id` tetap menjadi fallback bawaan.
  - Field **Penerima Utama** mengatur arah narasi email awal: jika dipilih perusahaan terlapor, sapaan/isi/penutup ditujukan ke perusahaan dan OJK hanya boleh muncul sebagai fallback, tembusan, atau referensi.
  - Backend API di `/api/v1/pdkt/` menangani mailbox, compose, reply, dan evaluation.
  - Error database mentah dipetakan ke pesan user-friendly via `pdktErrorMessage()` helper.
  - Migrasi field legacy `script` → `sampleEmailTemplate` dijalankan saat settings dibaca.
  - DUMMY_PROFILES pool 20 identitas dengan 25 kota acak untuk variasi identitas konsumen.
  - Usage delta setelah evaluasi async di-retry hingga 2x (2s delay) untuk akurasi.
  - **AI image generation**: Lampiran AI PDKT hanya memakai jalur Gemini-native; jika model aktif tidak mendukung gambar, sistem fallback ke model Gemini gambar default dan tidak pernah memakai OpenRouter/DeepSeek.
  - **Prompt trust boundary**: Seluruh data dinamis untuk generasi dan evaluasi (skenario, persona konsumen, identitas, metadata penerima, email inbound, dan balasan agent) diserialisasi serta di-escape di dalam blok data-only. Teks di dalam blok tersebut tidak diperlakukan sebagai instruksi model.
  - **Prompt contract**: Output AI untuk template dan email awal tetap wajib lolos strict Zod schema. Output evaluasi AI tetap dibaca lewat kontrak kanonik, tetapi service sekarang menormalkan JSON valid yang masih gradeable: aggregate `score` bisa dipakai saat `scoreBreakdown` hilang, `scoreBreakdown` lengkap bisa dipakai saat `score` hilang, issue array yang hilang menjadi kosong, dan field ekstra diabaikan. `scoreBreakdown` pada histori tersimpan tetap opsional agar histori lama masih dapat dibaca.
  - **Scenario Identity Override**: Setiap skenario dapat menyimpan `identity` opsional (`name`, `bodyName`, `email`, `city`). Runtime memilih `scenario.identity` → `customIdentity` global → fallback generator; `pdktPromptScenarioSchema` membuang `identity` mentah dari payload prompt, dan `bodyName` dapat mewarisi `scenario.identity.name` bila field khusus kosong.
  - **Settings Round-trip**: `readPdktSettings()`/`writePdktSettings()` mempertahankan metadata skenario lain saat menyimpan namespace `pdkt` dan hanya men-strip legacy `isLicensed`.
  - **Prompt budget**: Hard ceiling prompt adalah 200.000 karakter, dengan budget aplikasi efektif 199.488 karakter dan reserve adapter provider 512 karakter. Compaction hanya memotong nilai data dinamis; instruksi dan format output tidak dipotong.
  - **Prompt ingress limits**: Schema berbatas diterapkan pada route generate template, inisialisasi/create session, evaluate, mailbox batch, dan mailbox reply. Attachment/base64 serta schema persisted legacy tetap tidak dibatasi oleh kontrak prompt karena attachment tidak diteruskan sebagai data prompt.
  - **Kebijakan panjang**: Consumer dengan stable ID `terburu-buru` memakai 250-500 kata dan 3-5 paragraf; consumer lain memakai 500-1.000 kata dan 5-8 paragraf. Prompt, retry, dan final validation memakai policy yang sama.
  - **Model dan usage**: Fallback model PDKT menggunakan `DEFAULT_AI_MODEL_ID` dari registry kanonikal. Model lama OpenRouter/DeepSeek dinormalisasi ke direct Gemini/OpenAI saat settings dibaca. Mekanisme AI usage logging yang sudah ada tetap dipertahankan.
- **Evaluasi AI (Single-Turn)**:
  - Prompt hanya menerima tepat satu email inbound konsumen dan satu balasan agent OJK 157.
  - Body kedua email diteruskan sebagai data-only yang diserialisasi dan di-escape, tanpa konteks thread tambahan.
  - Input dengan jumlah atau komposisi pesan selain satu inbound dan satu balasan ditolak sebelum AI dipanggil.
  - Metadata panjang body dicatat via `console.debug` tanpa menyimpan isi email ke log.
  - **Scoring deterministik**: Skor dasar dihitung backend sebagai pembulatan rata-rata berbobot setara dari lima dimensi (`recipientDirectionScore`, `normativeResponseScore`, `clarityScore`, `typoScore`, dan `templateComplianceScore`). Recipient conflict cap diterapkan sesudahnya; feedback mencatat cap hanya jika score atau dimensi arah penerima benar-benar berubah.
  - **Retry & JSON Contract**: Retry transient error (429/500/503/timeout) hingga 2x dengan delay 250/500ms tetap dipertahankan. Parser evaluasi tidak lagi gagal hanya karena valid JSON punya gap minor di shape; selama ada jalur numerik yang defensibel, respons dinormalisasi lalu dihitung ulang secara deterministik. Payload tanpa `score` valid maupun `scoreBreakdown` lengkap tetap ditolak.
  - **Evaluasi Edukatif**: Evaluasi PDKT menghasilkan `edu` nested di `pdkt_history.evaluation` JSONB (tanpa migration): `dimensionTips`, `improvementTips` (non-authoritative), `actionItems[{dimension,text,example,priorityRank}]`, dan `suggestedRewrite{subject,body,highlights}`. AI hanya kirim narasi + `dimension` — `priorityRank` ditentukan backend deterministik (sort skor dimensi post-failsafe ASC + urutan dimensi tetap). Failsafe recipient conflict adalah **cap** (overall `min(score,75)`, recipientDirection `min(score,60)`), bukan overwrite; saat cap aktif backend menambah tip deterministik yang menjelaskan sapaan yang benar. Fallback rule-based per band (<60 kritis, 60-74 sedang) mengisi action item untuk tiap dimensi <75 bila AI tidak mengirim `edu`. Semua string nested AI disanitasi via sanitizer per-string. UI: `EmailDetailPane` & `PdktEvaluationPanel` menampilkan tip per baris breakdown, kartu Action Items bernomor prioritas, banner arah penerima saat capped, dan kartu "Contoh Balasan yang Lebih Baik" dengan highlight (tersembunyi untuk histori tanpa rewrite).
  - **Expected-answer alignment**: Skenario dapat menyimpan `expectedAnswer` opsional sebagai referensi evaluasi saja. Referensi tidak masuk prompt generasi email atau proyeksi data simulasi; snapshot retry hanya dikirim dalam token terenkripsi, dan proyeksi pemulihan tidak memuat teks referensi. Setelah balasan dikirim, prompt evaluasi membandingkan inti jawaban secara semantik dan menyimpan kategori `Sesuai`, `Hampir sesuai`, atau `Berbeda sama sekali` beserta alasan ringkas. Kategori hanya menjadi bukti bagi penilaian normatif/kesenjangan konten—tidak menambah dimensi atau mengubah perhitungan skor; nilai kosong/absen mempertahankan hasil evaluasi lama. Trainee dan reviewer melihat kategori/alasan tanpa melihat teks referensi.

## 4. TELEFUN (Telephone Fun)

Modul simulasi komunikasi suara untuk melatih intonasi dan kecepatan respon telepon.

- **Fungsi**: Mempersiapkan peserta untuk menangani panggilan telepon melalui simulasi suara berbasis Gemini Live.
- **Status provider**: Telefun model selection dan start flow Gemini-only. GPT/OpenAI Realtime Telefun telah concluded/permanently disabled untuk semua user; tidak ada OpenAI card, readiness, capability fetch, WebRTC POST, sideband, atau scoring baru. History, recording, feedback, usage, dan historical realtime pricing tetap readable; pricing historical read-only. Owner-bound DELETE cleanup tetap tersedia hanya untuk historical WebRTC call yang sudah terikat.
- **Batas OpenAI text**: Fallback/direct OpenAI text yang didokumentasikan untuk KETIK atau PDKT adalah operasi API terpisah. Itu tidak membuat model, transport, pricing realtime, atau provider Telefun OpenAI dapat dipilih.
- **Route**: `/telefun`
- **Fitur Utama**:
  - **Live Voice Interface**: Panggilan dimulai dari ringtone, izin mikrofon, dan koneksi WebSocket.
  - **Hold & Mute**: User bisa mute mikrofon dan menahan panggilan. Hold memiliki batas layanan (pertama 1 menit, berikutnya 3 menit) yang tidak memutus panggilan. UI menampilkan countdown, peringatan 10 detik terakhir, dan overtime (+MM:SS) setelah batas. Durasi hold dihitung dari timestamp, bukan tick timer. Metrics hold tersimpan di `session_metrics.hold` (intervals, durasi, exceeded count). Penilaian Manajemen Hold: N/A (tidak digunakan), Baik (semua ≤ batas), atau Kurang (ada yang melebihi batas). AI tidak menilai hold — policy aplikasi menentukan hasil secara deterministik.
  - **Recording & History**: Rekaman browser disimpan ke local history dan `telefun_history`. Saat MUTE atau HOLD aktif, seluruh microphone audio track dinonaktifkan untuk capture sehingga `full_call.webm` dan `agent_only.webm` tetap memiliki timeline yang utuh tetapi periode tersebut berisi silence; `MediaRecorder` tidak dihentikan atau di-restart.
  - **History Modal**: Riwayat panggilan memakai daftar operasional flat dengan divider, bukan kumpulan kartu berulang. `Lihat detail` menjadi aksi utama per sesi; `Lainnya` membuka menu sekunder berisi `Unduh rekaman` dan `Hapus riwayat`. Label target hanya ditampilkan bila memberi konteks tambahan, termasuk penanda eksplisit bila record peserta sudah tidak tersedia. Header tetap menyediakan `Ekspor CSV` dan `Hapus semua`; kontrol interaktif memakai target sentuh minimum 44px.
  - **Voice Assessment**: Analisis otomatis kualitas suara agen.
  - **Realistic Mode**: Mode realistik dengan hold consent, rude hold penalty, dan WPM analysis.
  - **Simulation Challenges**: Skenario tantangan simulasi (max 3) yang diintegrasikan ke dalam Gemini Live system prompt. Tantangan didefinisikan di settings dan diterapkan secara dinamis selama sesi.
  - **Expanded Voices**: Katalog 30 voice Gemini Live/TTS dengan mapping gender aplikasi (14 female, 16 male), gender consistency guards, dan default voice `Kore`.
  - **Monitoring detail**: `/monitoring` memakai `parseVoiceQualityAssessment`, `telefun_coaching_summary.recommendations` yang runtime-normalized, `HoldAssessmentCard`, dan metrik sumber apa adanya (score, WPM, intonasi, artikulasi, filler, tone); row `telefun_history` canonical menang atas row legacy `results` dengan ID yang sama, sedangkan legacy-only tetap incomplete dan recording path hanya disigning dari path owned yang aman.
  - **Maintenance Warning Gate**: Entry to Telefun dari sidebar, dashboard card, atau URL direct `/telefun` dilindungi oleh role-based access gate. User dengan role admin/trainer di-auto-grant akses langsung tanpa modal warning. User dengan role lain (leader, agent) melihat modal "Akses Terbatas" dengan pesan "Modul Telefun hanya dapat diakses oleh Trainer" dan hanya bisa kembali ke dashboard. Status akses di-reset otomatis saat meninggalkan modul Telefun.
  - **Gemini Live JSON Protocol**: Menggunakan format JSON terstruktur untuk setup dan pengiriman chunk audio base64 (MIME `audio/pcm;rate=16000`), menggantikan transfer data binary mentah yang rentan force close. Output suara dari Gemini Live didecode dari JSON inline base64 PCM secara real-time pada sample rate output (default 24 kHz).
  - **Setup Complete Gating**: Pengiriman audio microphone ke WebSocket ditahan (gated) di sisi client dan proxy sampai pesan `setupComplete` dikonfirmasi oleh Gemini.
  - **Deterministic Finalization**: Proses penyimpanan sesi diatur secara deterministik (Upload Rekaman → Patch Metadata → Finalize Path → Request Scoring → Patch Score & Feedback) untuk memastikan analisis suara tidak gagal akibat data audio belum tersedia. Feedback disimpan di kolom `feedback` terpisah secara konsisten. Status scoring dibedakan menjadi `succeeded`, `failed` (scoring sempat dicoba lalu error), dan `skipped` (rekaman agen tidak tersedia sehingga scoring tidak dicoba).
  - **WebSocket Close-Code Mapping**: Menampilkan pesan error terperinci untuk error status koneksi (seperti token login kadaluarsa `4001`, origin ditolak `4003`, Gemini API error `1011`, atau network terputus `1006`). Close normal dari user (code `1000`) tidak ditampilkan sebagai error; close tanpa status `1005` dipetakan secara khusus sebagai indikasi proxy/network/upstream.
  - **Auto Hangup & Time Cues**: Durasi panggilan dibatasi sesuai `maxCallDuration` dengan reminder audio/text cue bertahap (2 menit, 1 menit, 30 detik, 20 detik). App timer adalah satu-satunya otoritas timeout; AI tidak diminta mengestimasi waktu sendiri.
  - **Self-Close Guard**: Prompt Telefun melarang konsumen menutup sendiri hanya karena solusi awal, arahan website/link/form laporan, estimasi SLA, nomor referensi, atau penjelasan agen sudah terdengar cukup. Konsumen tetap kooperatif, tetapi harus lanjut bertanya/konfirmasi sampai aplikasi mengirim cue penutup.
  - **Akses**: Modul Telefun hanya untuk `admin` dan `trainer`. Leader dan Agent tidak diizinkan mengakses modul ini — akan mendapat modal "Akses Terbatas" dan redirect ke dashboard.
  - **Catatan Teknis**:
  - **Evaluasi Edukatif (deterministik)**: `TELEFUN_VOICE_ASSESSMENT_JSON_SCHEMA` tidak diperluas untuk coaching — AI tetap hanya menghasilkan 5 aspek kanonik. Semua coaching diturunkan backend: `improvementTip` (`generateImprovementTip`), `drill` latihan per metrik (`generateDrill`, rule-based parametrik target WPM/filler), `examplePhrase` per metrik (`TELEFUN_EXAMPLE_PHRASES`), `nextSteps`/`drill` hold rule-based dengan batas dari `TELEFUN_FIRST_HOLD_LIMIT_MS`/`TELEFUN_SUBSEQUENT_HOLD_LIMIT_MS`, serta `overallNextSteps` (top-3 dari `improvementPriorities`). Profil komunikasi membawa `coachingVersion: 1`; histori lama tanpa drill/examplePhrase otomatis di-rebuild oleh `enrichAssessmentWithCommunicationProfile()` tanpa rerun AI. UI: `VoiceMetricCards` menampilkan tip + drill + examplePhrase, `HoldAssessmentCard` menampilkan langkah perbaikan + drill, dan "3 Prioritas Latihan Minggu Ini" dirender di assessment section.
  - **Gemini Live Session Management**: Untuk sesi panjang (>5 menit), setup menyertakan `contextWindowCompression` dan `sessionResumption`. Proxy server mendeteksi `goAway.timeLeft` dan `sessionResumptionUpdate.newHandle` untuk reconnect proaktif dengan setup caching.
  - **Server Reconnect Lifecycle**: Saat koneksi Gemini putus non-1000, proxy reconnect dengan backoff, re-send cached setup, menyertakan session handle jika ada, dan hanya flush audio setelah `setupComplete`. Client mendapat status "Menyambung ulang..." dan "Tersambung".
  - **Duration Audit Source**: Durasi final sesi memakai elapsed timestamp dari `session_metrics.sessionDurationMs` saat tersedia, sehingga reconnect status seperti "Menyambung ulang..." tidak membuat durasi audit lebih pendek dari runtime aktual.
  - **Keepalive**: Server mengirim ping berkala (30 detik) ke client dan Gemini untuk mengurangi idle disconnect.
  - **AudioWorklet**: Browser modern menggunakan AudioWorklet (`/audio-input-processor.js`) untuk pemrosesan mikrofon. Browser lama atau jika load gagal, fallback ke ScriptProcessorNode. Tidak ada warning deprecasi pada browser modern.
  - **Recording Path RLS Security**: Mengunggah file rekaman ke storage Supabase memakai struktur direktori terproteksi RLS `<user_id>/<session_id>/(full_call|agent_only).webm` dan divalidasi ketat oleh API backend.
  - **Recording Playback Access**: File rekaman di bucket `telefun-recordings` tetap private. Browser tidak boleh memakai `recording_path` mentah sebagai URL audio; backend membuat signed URL sementara. Pemilik sesi dapat memutar rekamannya sendiri dari modul Telefun, sedangkan akses lintas-user untuk mendengar rekaman hanya diberikan kepada `admin` dan `trainer`. Monitoring Telefun detail juga memakai signed URL yang sama dan tidak memberikan URL pemutaran untuk role lain.
  - **Playback Queue Cleanup**: Setiap `AudioBufferSourceNode` yang dibuat oleh `playPcm()` dilacak dalam `activeSources: Set<AudioBufferSourceNode>`. Saat `serverContent.interrupted`, `setHold(true)`, atau turn baru tiba setelah `turnComplete` lama, seluruh source aktif dihentikan dan antrian dibersihkan untuk mencegah overlap audio. Chunk lanjutan dalam turn yang sama tetap diantrikan normal. `turnComplete` tidak langsung mengakhiri `isAiSpeaking` - ditunda sampai source terakhir selesai natural (via `onended`).
  - **Mute/Hold Capture Gate**: `LiveSession` menerapkan `track.enabled = !isMuted && !isHeld` pada semua microphone audio track setelah `getUserMedia()` dan setiap kali `setMute()` atau `setHold()` mengubah state. Gate capture ini terpisah dari gate pengiriman audio ke Gemini dan dari pembersihan playback AI; recorder tetap berjalan agar timeline rekaman tidak berlubang.
  - **First-Message WebSocket Authentication**: Browser hanya membaca `auth_token` satu kali saat memulai panggilan, meneruskannya melalui `PhoneInterface` ke `LiveSession`, lalu mengirim frame pertama `{ type: "authenticate", token, sessionId? }`. URL WebSocket hanya berisi path `/ws`; credential dan session ID tidak masuk query string atau log target.
  - **Pre-Auth Gate**: Standalone proxy memvalidasi origin/path, menunggu auth maksimal 10 detik, menolak frame non-auth, auth paralel, dan auth duplikat, lalu memverifikasi JWT serta ownership session sebelum mengirim `auth_ok` dan membuka koneksi Gemini. Perubahan client dan server harus dideploy bersamaan.
  - **Local History Recovery**: JSON `telefun_history` yang malformed atau bukan array tidak menghambat pemuatan history server. UI menampilkan warning aman tanpa menyalin payload lokal ke toast/log dan tanpa menghapus data lokal.
  - **Catatan Teknis**: Sesi live default memakai model transport `gemini-3.8-live`; model `gemini-3.1-flash-live-preview` dan `gemini-3.0-flash-live-preview` tetap tersedia sebagai pilihan eksplisit (menggunakan parameter `telefunModelId`). Telefun proxy server di `apps/telefun/` memvalidasi origin/JWT, memverifikasi kepemilikan session ID, dan meneruskan JSON secara aman ke Gemini Live API. Sesi WebSocket melekat langsung ke session row yang dibuat API frontend untuk mencegah data duplikat. Close code 1005 dari browser dipetakan sebagai sinyal diagnostik jaringan, bukan kesalahan pengguna. Proxy menutup upstream dengan code/reason eksplisit pada client close/error (1000/1011).

## 5. KTP / Profiler (Kotak Tool Profil)

Sistem manajemen database terstruktur untuk peserta training dan agen aktif.

- **Fungsi**: Penyimpanan terpusat data diri, riwayat training, dan penugasan tim.
- **Routes**: `/profiler`, `/profiler/table`, `/profiler/slides`, `/profiler/analytics`, `/profiler/export`, `/profiler/add`, `/profiler/import`, `/profiler/teams`
- **Fitur Utama**:
  - **Table View**: Search, filter, dan edit data peserta dengan responsive grid layout (1-4 kolom) dan glassmorphism cards.
  - **Analytics**: Recharts analytics dengan 4 chart.
  - **Export**: Excel/CSV export.
  - **Import**: Excel template generation dan upload.
  - **Teams**: Custom team management.
  - **Upcoming Birthdays**: Endpoint untuk menampilkan peserta yang berulang tahun dalam rentang waktu tertentu.
- **Catatan Teknis**: File peserta/foto memakai Supabase Storage bucket `profiler-foto`. Backend API di `/api/v1/profiler/` (18+ endpoints) menangani semua operasi CRUD. Reorder authorization dilindungi oleh service_role bypass dengan dedup/validity checks.

## 6. SIDAK (Sistem Informasi Data Analisis Kualitas)

Platform analytics kualitas untuk memantau performa agent secara mendalam.

- **Fungsi**: Mengolah data temuan QA menjadi wawasan yang dapat ditindaklanjuti melalui dashboard, ranking, input manual, dan laporan otomatis.
- **Routes**:
  - **Landing** (`/sidak`): 5 card links ke sub-modul (termasuk Forecast).
  - **Dashboard** (`/sidak/dashboard`): KPI ringkasan, tren kualitas, bar charts, top agents, Pareto chart, dan forecast visibility toggle.
  - **Forecast** (`/sidak/forecast`): Workbench analitik untuk proyeksi layanan dan lane agent (`improving`/`declining`/`stable`/`insufficient_data`) dengan service chart, filter parameter, dan proyeksi agent berbasis regresi linear. Filter membedakan `Periode data` dari `Periode proyeksi` 1–6 bulan. UI memakai section flat `Proyeksi temuan`, `Kecukupan data`, `Tren layanan`, dan `Prioritas agent`; row agent memprioritaskan skor/tren, metadata wrap-safe, serta lane desktop memakai max-height dan scroll internal saat daftar panjang.
  - **Input Audit** (`/sidak/input`): Entry temuan manual multi-step + Excel upload. Live score card dengan radial progress ring, konfigurasi audit card, dan show all data toggle.
  - **Ranking** (`/sidak/ranking`): Ranking prioritas temuan agent; rank 1 berarti defect terbanyak. Desktop menampilkan perubahan posisi di satu kolom, sedangkan mobile menampilkannya di bawah nama agar tidak ada informasi ganda.
  - **Settings** (`/sidak/settings`): Service weights configuration dengan versioned rules per service+periode.
  - **Periods** (`/sidak/periods`): Manajemen periode audit.
  - **Agents** (`/sidak/agents`): Direktori agent dengan pencarian nama/tim/batch, filter batch menggunakan satu selector semantik di seluruh breakpoint, toggle untuk menyertakan agen tambahan di luar daftar utama, serta kartu audit yang menampilkan identitas, skor, status, periode, dan perubahan. Grid responsif memakai 1 kolom di mobile, 2 di tablet, dan 3 di desktop; kartu tetap satu surface tanpa nested mini-card atau badge dekoratif. Mendukung skeleton loading, state kosong, retry saat API gagal, serta load-more dinamis dalam batch awal 24 agen.
  - **Agent Detail** (`/sidak/agents/$id`): Full-width Agent Audit Dossier dengan compact score strip, seluruh konten audit, lalu quick list lima Riwayat Simulasi terbaru (KETIK/PDKT/Telefun) di bagian paling bawah, ranking Tim Gabungan/Tim Leader, forecast 3 bulan (konteks tahun+layanan), ticket impact table, root-cause coaching panel, trend benchmark comparison table, dan per-service pills.
  - **Agent Detail Table UX**: Tabel benchmark perbandingan memakai layout penuh yang responsif; header dan nama parameter panjang dapat wrap, sementara nilai numerik tetap rata kanan dan tidak terpotong atau tersembunyi.
  - **Reports** (`/sidak/reports`): Data vs AI report selection.
  - **Reports Data** (`/sidak/reports-data`): Filter form + tabel temuan dengan kolom Layanan, Periode, Agen, Nomor Tiket, Parameter, Temuan, dan Skor + Excel export. Nomor tiket dinormalisasi dan ditampilkan dengan format monospace; isi Temuan dibungkus utuh tanpa truncation agar tetap terbaca.
  - **Reports AI** (`/sidak/reports-ai`): AI-powered report generation.
- **Fitur Utama**:
  - **Versioned Rules**: Parameter penilaian per service+periode dengan versioning.
  - **Scoring Engine**: Perhitungan skor agent dengan weighted/counting mode, clean-session handling, phantom padding exclusion.
  - **Dashboard Summary Rollup**: Real-time computation dari data temuan mentah via scoring engine aplikasi.
  - **Forecast Agent**: Proyeksi skor, temuan, dan critical findings per agent dengan regresi linear; klasifikasi lane (improving/declining/stable). Snapshot persistence dengan SHA-256 fingerprinting dan 3-state lifecycle (missing/fresh/stale).
  - **Agent Audit Dossier**: Full-width audit surface dengan compact score strip (month/status/final score/progress bar/Sesi/Temuan/Delta), ticket impact table, dan root-cause coaching panel.
  - **Agent Comparison Table**: Benchmark temuan kumulatif agent terhadap rata-rata tim dan rata-rata service.
  - **Root Cause Diagnosis**: Rule-based clustering (8 klaster) dengan keyword matching dan ticket references. Target coverage: lainnya < 20%.
  - **Folder-Aware Filters**: Dashboard dan ranking dapat difilter berdasarkan folder/batch audit untuk scope yang lebih presisi, termasuk untuk leader scope.
  - **Phantom Padding**: Clean session (audit tanpa temuan real) tetap dihitung sebagai valid audit.
  - **Sesi Tanpa Temuan**: Trainer/admin dapat membuat 5 sesi phantom (nilai=3) ketika agent belum memiliki temuan buruk.
  - **Excel Upload**: Template generation, parsing, dan validasi untuk bulk input temuan.
  - **Rank Change Indicator**: Perubahan prioritas memakai `rankChange = previousRank - currentRank`. Nilai positif berarti prioritas naik menuju rank yang lebih kecil (defect lebih banyak), nilai negatif berarti prioritas turun, `0` berarti tetap, dan `null` berarti agent baru. Pada desktop status hanya muncul di kolom Perubahan posisi; pada mobile status dipindah ke bawah nama. Catatan berbagi peringkat ditampilkan terpisah dari status perubahan.
  - **Agent Ranking Semantics**: Ranking utama adalah prioritas temuan: rank 1 = defect terbanyak dan rank lebih besar = prioritas lebih rendah. Jumlah defect sama memakai competition ranking sehingga berbagi peringkat; tie-break nama hanya mengatur urutan baris, bukan rank bisnis. Ranking ditampilkan dalam konteks Tim Gabungan dan Tim Leader per tahun+layanan.
  - **KPI Delta**: Persentase kenaikan/penurunan di KPI Dashboard dengan unit yang disesuaikan (persentase relatif untuk count/ratio, poin persentase untuk metrik persen).
  - **Riwayat Simulasi**: Filter hanya berdasarkan atribusi `participant` yang cocok dengan `profiler_peserta.id`; detail memakai review Monitoring bersama dan tidak memicu AI. Filter audit tahun/bulan/layanan tidak mengubah daftar simulasi.
  - **Catatan Teknis**: Backend API di `/api/v1/sidak/` di-dekomposisi ke route handler (`apps/api/src/routes/sidak/{core,dashboard,forecast,temuan,rule-versions,reports,simulations}.ts`). Riwayat simulasi memakai `apps/api/src/services/sidak/agent-simulations.ts` dan scope `simulation-access.ts`; renderer detail tetap memakai komponen Monitoring bersama. Scoring engine di `apps/api/src/lib/scoring.ts`.

## 7. Atribusi Subjek Simulasi (KETIK/PDKT/Telefun/Monitoring)

- `user_id` tetap akun pelaksana/pemilik sesi; `simulation_subject_*` adalah atribusi peserta, bukan identitas konsumen.
- Request memakai satu properti `simulationSubject` (`self` | `participant` + UUID). Klien lama tanpa field dinormalisasi ke `self` pada write ingress; read null/absent selalu `unknown` (legacy: "Peserta tidak tercatat — sesi lama").
- PDKT `self` mailbox relatif kepada pembalas (snapshot diambil saat reply; chip "Untuk diri sendiri saat membalas"). Reply `participant` hanya admin/trainer, target immutable, history menyalin snapshot mailbox.
- Snapshot immutable setelah persist; `ON DELETE SET NULL` boleh men-null-kan FK tanpa mengubah snapshot. Rename/move batch tidak mengubah snapshot.
- Pilihan peserta via `GET /api/v1/profiler/peserta/options?search=` (admin/trainer, 2–100 chars, max 20, 4 fields, literal ilike escape).
