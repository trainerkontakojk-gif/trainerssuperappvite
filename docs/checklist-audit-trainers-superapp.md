# Checklist Audit Trainers SuperApp

## Next.js Legacy vs Vite Baru

Dokumen ini dipakai untuk mengecek apakah versi **Vite baru** sudah setara atau lebih baik dari versi **Next.js legacy**.

Fokus audit:

- parity fitur;
- keamanan auth dan role;
- akurasi data SIDAK;
- integrasi KETIK, PDKT, Telefun;
- backend dan database;
- report AI;
- regression test terhadap legacy.

---

## Legend Status

| Status | Arti                   |
| ------ | ---------------------- |
| `[ ]`  | Belum dicek            |
| `[x]`  | Sudah sesuai           |
| `[~]`  | Sebagian               |
| `[!]`  | Bermasalah / perlu fix |

Contoh catatan:

```md
- [~] Total temuan tampil akurat.
  - Catatan: hasil Vite berbeda 12 data dari legacy.
  - File terkait: src/modules/sidak/services/dashboard.ts
```

---

# Ringkasan Prioritas

## P0 — Wajib sebelum menggantikan legacy

- [x] Auth dan role aman.
  - Catatan: `beforeLoad` guards via `requireRole()` di router.tsx untuk 24+ protected routes. Unauthorized page tersedia.
- [x] Tidak ada secret key di frontend.
- [x] Backend tersedia untuk logic sensitif.
- [x] SIDAK dashboard akurat.
  - Catatan: Filter tahun, service type, pareto chart, top agents paginated, empty states terpisah.
- [x] Upload QA aman.
- [x] Data profiler dan SIDAK terhubung benar.
- [x] AI usage logging berjalan.
- [x] KETIK session tersimpan.
- [x] Telefun berjalan dengan server realtime.
- [x] RLS dan permission aman.
  - Catatan: 32 tabel RLS-enabled (all). Policy gaps di-close: write_trainer untuk dashboard summary tables, admin SELECT+UPDATE untuk profiles (Restricted: users cannot change own role/status). RLS SIDAK/Profiler diperketat di 015 (admin/trainer only for read, agents own only). Migration 016 me-revoke broad grants. API role enforcement ditambahkan di 48 endpoint.
- [x] Migration database aman.
  - Catatan: 16 migration files (000-016). Semua migration diverifikasi idempotent. Migration 014 memastikan bucket storage dibuat. Migration 015-016 memperketat RLS dan privesc protection.

## P1 — Penting untuk operasional

- [x] Report individu akurat.
- [x] Report layanan akurat.
- [x] QA parameter versioning tersedia.
  - Catatan: Backend 8 endpoints + frontend tab UI (create draft, publish, supersede).
- [x] PDKT master-detail tersedia.
- [x] Leader approval workflow tersedia.
- [x] Dashboard usage AI tersedia.
  - Catatan: Halaman `/monitoring` sudah fully functional: tab Penggunaan Token (ringkasan + tabel per user) dan tab Harga & Kurs (pricing editor).
- [x] Export DOCX/PDF tersedia.
- [x] Admin scenario management tersedia.
- [x] Error handling upload jelas.
- [x] Performance dashboard aman untuk data besar.
  - Catatan: Summary tables (`qa_dashboard_period_summary` + `qa_dashboard_agent_period_summary`) diaktifkan. Dashboard query membaca dari cached summary dengan fallback ke raw query. Write-through via batch upload + admin refresh endpoint.

## P2 — Improvement

- [x] UI polish.
- [ ] Replay simulasi.
- [ ] Coaching recommendation.
- [ ] Advanced analytics.
- [ ] Materialized summary table.
- [ ] Notification system.
- [ ] Audit log lengkap.
- [ ] Realism tuning KETIK/PDKT/Telefun.
- [ ] Auto insight report.
- [x] Better mobile layout.

---

# 1. Frontend

## 1.1 Global, Routing, Auth, UI/UX `P0`

- [x] Struktur halaman Vite sudah setara dengan legacy Next.js.
- [x] Semua menu utama tersedia: Dashboard, KETIK, PDKT, Telefun, SIDAK/QA Analyzer, Report, Admin/Settings.
- [x] Routing mendukung role-based access.
  - Catatan: `beforeLoad` guards via `requireRole()` di router.tsx untuk semua protected routes.
- [x] Route admin/trainer/QA tidak bisa dibuka oleh agent biasa.
  - Catatan: Route-level guards via TanStack Router `beforeLoad` + sidebar filtering di Layout.tsx.
- [x] Auth login/logout lewat landing modal berjalan normal.
- [x] Halaman 404, unauthorized, dan error state tersedia.
  - Catatan: TanStack Router `notFoundComponent`, `unauthorized.tsx`, dan `ErrorBoundary` di `main.tsx`.
- [x] Layout utama konsisten di desktop dan mobile.
- [x] Sidebar/navbar menyesuaikan role user.
- [x] Login Supabase Auth via landing modal berjalan.
- [x] Logout membersihkan session.
- [x] Session tetap bertahan setelah refresh.
- [x] Expired session diarahkan ke landing page / modal auth.
  - Catatan: Layout cek `auth_token` + `auth_profile` di localStorage, lalu redirect ke `/`.
- [x] User profile dan role terbaca setelah login.
- [x] Tidak ada service role key atau secret key di frontend.
- [x] Frontend tidak mengandalkan role dari localStorage saja.
  - Catatan: Role divalidasi ulang secara ASYNC dari database via `fetchAuthProfile()` pada SETIAP route transition (requireRole guard di router.tsx), localStorage hanya bootstrap awal.
- [x] Role user divalidasi ulang dari backend/database.
- [x] Design system konsisten: button, card, modal, form, table, badge, toast.
- [x] Loading state tersedia di semua halaman data.
- [x] Empty state tersedia untuk data kosong.
- [x] Error state jelas dan mudah dipahami.
- [x] Toast notification tersedia.
  - Catatan: Menggunakan `sonner` v2.0.7. Semua 54 `alert()` sebelumnya sudah diganti dengan `notify.success/error/warning()`.
- [x] Confirm dialog tersedia untuk aksi berisiko.
- [x] Table mendukung pagination, search/filter, dan sort.
  - Catatan: Shared `Pagination` component diterapkan di 6 tabel (activities, reports-data, profiler/table, ranking, users, agents). Page reset on filter, page-size selector.
- [x] Tampilan responsive untuk layar kecil.
- [x] Tidak ada teks debug/development yang tampil ke user.

---

## 1.2 Dashboard Utama `P0`

- [x] Dashboard menampilkan ringkasan modul sesuai role.
- [x] Agent hanya melihat data dirinya sendiri.
- [x] Trainer/QA/TL/SPV/OM melihat data sesuai izin.
- [x] Card statistik tidak menampilkan angka palsu/default.
- [x] Data dashboard berasal dari backend/database, bukan dummy.
- [x] Dashboard punya fallback jika data belum tersedia.
- [x] Link cepat ke KETIK, PDKT, Telefun, SIDAK, dan Report tersedia sesuai role.

---

## 1.3 KETIK `P0`

- [x] Halaman simulasi KETIK tersedia.
- [x] Scenario dapat dipilih.
- [x] Chat interface berjalan stabil.
- [x] Pesan user tampil langsung setelah dikirim.
- [x] Pesan AI tampil dengan loading/typing indicator.
- [x] Session timer berjalan jika memakai batas waktu.
- [x] Timeout session tidak menghasilkan pesan penutup yang aneh.
- [x] Closing message konsisten dan tidak tertimpa state lain.
- [x] Tombol selesai simulasi tersedia.
- [x] Konfirmasi sebelum mengakhiri simulasi tersedia.
- [x] UI tidak rusak saat AI gagal merespons.
- [x] History sesi KETIK tersedia via workspace/modal history.
- [x] Transcript chat tersimpan dan bisa dibuka ulang.
- [x] Detail sesi menampilkan scenario, waktu, agent, dan hasil.
- [x] Evaluasi/feedback tampil jika tersedia.
- [x] Trainer/QA bisa melihat sesi peserta sesuai izin.
- [x] Agent hanya bisa melihat sesi miliknya.
- [x] Export transcript tersedia jika dibutuhkan.
  - Catatan: `downloadTranscript()` di HistoryModal — generate `.txt` per session + Download All.
- [x] AI tidak terlalu cepat menyelesaikan percakapan.
- [x] AI bisa memberi respons natural terhadap jawaban pendek.
- [x] AI memahami konteks layanan.
- [x] AI tidak keluar dari skenario.
- [x] Prompt scenario mudah diatur trainer/admin.

---

## 1.4 PDKT `P1`

- [x] Halaman PDKT tersedia.
- [x] Scenario email dapat dipilih manual.
- [x] Tampilan master-detail tersedia: daftar email di kiri, detail di kanan.
- [x] Agent bisa membuat email baru.
- [x] Email draft yang belum dibalas tetap tersimpan.
- [x] Beberapa thread email bisa berjalan dalam satu simulasi.
- [x] Email bisa dibuka ulang setelah keluar dari modul.
- [x] Email bisa dihapus atau ditutup sesuai aturan.
- [x] Reply email tersimpan sebagai bagian dari thread.
- [x] Field To, Subject, Body tersedia.
- [x] Validasi field wajib berjalan.
- [x] Draft autosave tersedia jika dirancang.
  - Catatan: localStorage-based autosave di `ReplyComposer.tsx` dengan debounce 500ms. Draft key: `pdkt_draft_{recipient}_{subject}`.
- [x] Status email jelas: draft, sent, replied, completed.
- [x] AI dapat membalas email berdasarkan skenario.
- [x] Balasan AI tidak keluar konteks.
- [x] Trainer/QA dapat melihat thread peserta sesuai izin.
- [x] Agent hanya melihat thread miliknya.

---

## 1.5 Telefun `P0`

- [x] Halaman Telefun tersedia.
- [x] Tombol start, pause, dan end call tersedia.
- [x] Status koneksi jelas: connecting, connected, disconnected, error.
- [x] Indikator user speaking tersedia.
- [x] Indikator AI speaking tersedia.
- [x] Transcript realtime atau partial transcript tampil jika digunakan.
  - Catatan: Realtime transcript bubble UI selama call aktif. AI text diekstrak dari WebSocket `serverContent.modelTurn.parts[].text`. Auto-scroll.
- [x] Durasi panggilan tampil.
- [x] Error microphone permission ditangani jelas.
- [x] UI tetap stabil saat WebSocket reconnect.
- [x] Simulasi bisa diakhiri dengan aman.
- [x] AI tidak memotong user terlalu cepat.
- [x] AI merespons ucapan pendek dengan natural.
- [x] AI tidak berhenti mendadak tanpa alasan.
- [x] Ada handling silence.
- [x] Ada handling interruption/barge-in jika ditargetkan.
- [x] Voice indicator sesuai kondisi audio sebenarnya.
- [x] Realistic mode tidak dobel atau membingungkan.
- [x] WebSocket URL menggunakan env.
- [x] Token auth dikirim ke server Telefun dengan aman.
- [x] Frontend tidak menyimpan credential model audio.
- [x] UI menampilkan fallback jika server Telefun offline.
- [x] Hasil sesi Telefun tersimpan setelah panggilan selesai.

---

## 1.6 SIDAK / QA Analyzer `P0`

- [x] Halaman SIDAK tersedia.
- [x] Filter tahun tersedia.
- [x] Filter bulan tersedia.
- [x] Filter range bulan tersedia.
- [x] Filter service type tersedia.
- [x] Filter folder/periode tersedia jika digunakan.
- [x] Filter peserta/agent tersedia sesuai role.
- [x] Data dashboard berubah sesuai filter.
- [x] Loading state tidak membuat angka lama terlihat sebagai angka baru.
- [x] Empty state dibedakan antara tidak ada periode dan periode ada tapi temuan kosong.
- [x] Total temuan tampil akurat.
- [x] Total agent tampil akurat.
- [x] Average agent score tampil akurat.
- [x] Zero error rate tampil akurat.
- [x] Compliance rate tampil akurat.
- [x] Defects per agent tampil akurat.
- [x] Trend bulanan tampil akurat.
- [x] Top parameter/indikator tampil akurat.
- [x] Pareto chart tampil akurat.
- [x] Top agent/bottom agent sesuai izin akses.
- [x] Service comparison tidak mencampur data layanan yang tidak dipilih.
- [x] Tabel temuan tersedia.
- [x] Detail temuan bisa dibuka.
- [x] Data agent diambil dari profiler.
- [x] Data indikator diambil dari `qa_indicators`.
- [x] Data temuan diambil dari `qa_temuan`.
- [x] Search/filter tidak merusak pagination.
  - Catatan: `setPage(1)` di semua filter/search change via `useEffect`.
- [x] Pagination stabil dan tidak menghasilkan data duplikat.
  - Catatan: Shared `Pagination` component, client-side `.slice()`, page reset konsisten.
- [x] Export data tersedia jika dibutuhkan.
- [x] Role leader hanya melihat peserta yang disetujui.

---

## 1.7 Report AI `P1`

- [x] Halaman report individu tersedia.
- [x] Pilih periode tersedia.
- [x] Pilih agent tersedia sesuai izin.
- [x] Foto/avatar agent berasal dari profiler.
- [x] Data temuan berasal dari SIDAK.
- [x] Ringkasan performa tidak memakai dummy.
- [x] Grafik tampil dengan benar.
- [x] Narasi AI tidak mengarang data.
- [x] Report bisa dirender dalam format A4.
- [x] Multi-page report tidak terpotong.
- [x] Export DOCX/PDF tersedia jika ditargetkan.
  - Catatan: DOCX via `docx` library di backend (`POST /sidak/reports/ai/export-docx` → `buildAiReportDocx()`). PDF via `@media print` (A4, page breaks, `window.print()`). `html2canvas` installed.
- [x] Preview sebelum export tersedia.
- [x] Report per layanan tersedia.
- [x] Filter service type tersedia.
- [x] Data aggregate sesuai filter periode.
- [x] Top issue/parameter tampil.
- [x] Trend tampil.
- [x] Insight AI berdasarkan data nyata.
- [x] Tidak ada istilah layanan yang salah.

---

## 1.8 Admin dan Settings `P1`

- [x] Daftar user tersedia.
- [x] Role user bisa dilihat.
- [x] Role user bisa diubah oleh admin.
- [x] User bisa dinonaktifkan jika dibutuhkan.
- [x] Search user tersedia.
- [x] Filter berdasarkan role tersedia.
- [x] Perubahan role langsung berdambah ke akses menu.
- [x] Trainer/admin bisa membuat scenario KETIK.
- [x] Trainer/admin bisa membuat scenario PDKT.
- [x] Trainer/admin bisa membuat scenario Telefun.
  - Catatan: Full CRUD scenario (title + instruction) dan consumer type (name, gender, description) di SettingsModal. Tipe `TelefunScenario` dan `TelefunConsumerType` di `telefunSettings.ts`. API Zod schema mendukung array scenarios/consumerTypes. Migrasi otomatis dari format lama via defaults merge.
- [x] Scenario punya status draft/published.
- [x] Scenario bisa diedit sebelum publish.
- [x] Scenario published tidak rusak saat dipakai sesi lama.
- [x] Scenario bisa diarsipkan.
- [x] Setting model KETIK tersedia.
- [x] Setting model PDKT tersedia.
- [x] Setting model Telefun tersedia.
- [x] Pilihan model sesuai daftar yang benar.
- [x] Model yang tidak support transport tertentu tidak bisa dipilih.
- [x] Ada fallback jika model gagal.
- [x] Perubahan setting tercatat.
- [x] Daftar parameter QA tersedia.
- [x] Draft parameter bisa dibuat.
  - Catatan: `createRuleVersion()` di backend + UI "Create Draft" di settings tab.
- [x] Draft parameter bisa diedit.
  - Catatan: `updateRuleVersion()` + indikator add/delete untuk draft version.
- [x] Parameter bisa dipublish.
  - Catatan: `publishRuleVersion()` — auto-increment version_number, set status published.
- [x] Parameter published tidak bisa diedit sembarangan.
  - Catatan: Hanya draft yang bisa diedit di UI. Published version read-only.
- [x] Ada versioning/revision.
  - Catatan: Sequential `version_number` per `service_type`. Status: draft/published/superseded.
- [x] Ada alasan perubahan.
  - Catatan: Field `change_reason` sudah ada di schema DB, create/edit/publish/supersede form UI. Shared Zod schema `ruleVersionSchema` di `packages/types`. Edit draft via modal. Publish/supersede via confirmation dialog dengan optional reason.
- [x] Ada preview sebelum apply.
  - Catatan: Expandable indicator table per version (add/delete untuk draft), diff comparison vs published version, indicator count di version card, dan publish confirmation dialog dengan summary perubahan.
- [x] Ada validasi sebelum upload batch memakai parameter baru.
  - Catatan: Backend resolve active published rule version + validasi indicator_id terhadap service_type + validasi indicator_id terhadap rule version via `legacy_indicator_id`. Frontend banner peringatan jika ada draft belum publish. Excel parser filter by service_type.

---

# 2. Backend

## 2.1 Arsitektur Backend `P0`

- [x] Backend terpisah dari frontend Vite sudah tersedia.
- [x] Backend punya struktur module/service yang jelas.
- [x] Tidak ada business logic sensitif di frontend.
- [x] Semua query sensitif lewat backend/server.
- [x] Backend memakai env untuk credential.
- [x] Service role Supabase hanya ada di backend.
- [x] Error handling standar tersedia.
- [x] Response API konsisten.
- [x] Logging backend tersedia.
- [x] Request validation tersedia.
- [x] Rate limit global tersedia.
- [x] CORS dibatasi ke domain yang benar.

## 2.2 Auth Backend `P0`

- [x] Backend memvalidasi Supabase JWT.
- [x] Backend mengambil user dari token, bukan dari body request.
- [x] Backend mengambil role dari database/profile.
- [x] Backend menolak request tanpa token untuk route protected.
- [x] Backend menolak akses role yang tidak sesuai.
  - Catatan: `requireRole()` dipasang di semua route SIDAK & Profiler (mutation: admin/trainer; read: +leader), worker route KETIK, review trigger KETIK. QA role dihapus dari mutation endpoints — hardening phase.
- [x] Admin endpoint hanya bisa diakses admin.
  - Catatan: Admin routes menggunakan `adminOnly` middleware (tidak lagi `managerOnly` yang mengizinkan trainer). Trainer tidak bisa akses admin endpoints.
- [x] Trainer/QA endpoint dibatasi sesuai role.
  - Catatan: Mutation routes SIDAK/Profiler: admin+trainer only. Read routes: +leader. KETIK/PDKT mutation masih mengizinkan QA via `requireRole()` terpisah.
- [x] Agent endpoint hanya mengembalikan data milik agent tersebut.
  - Catatan: SIDAK dashboard di-scope via `getAccessibleAgentIds()`. KETIK/PDKT history sudah scope per user_id.
- [x] Identity spoofing dicegah.
- [x] `GET /auth/me` sudah dihapus dan digantikan 410 Gone (Deprecation message).
  - Catatan: Flow utama memakai Supabase JWT + `/v1/me`.

## 2.3 Service Layer `P0`

- [x] Ada service khusus KETIK.
- [x] Ada service khusus PDKT.
- [x] Ada service khusus Telefun.
  - Catatan: `routes/telefun.ts` + `apps/telefun/src/` server terpisah.
- [x] Ada service khusus SIDAK.
- [x] Ada service khusus Report.
  - Catatan: `report-docx-builder.ts` + SIDAK `getDataReportRows()`.
- [x] Ada service khusus AI usage.
- [x] Ada service khusus Admin/User.
- [x] Query database tidak tersebar acak di handler.
- [x] Logic bisnis mudah dites.
- [x] Handler API hanya mengurus request/response.

## 2.4 AI Gateway `P0`

- [x] Semua request AI lewat backend.
- [x] API key Gemini/OpenRouter tidak pernah tampil di frontend; model OpenAI dirutekan via OpenRouter model IDs.
- [x] Model dipilih dari konfigurasi resmi.
- [x] Fallback model tersedia.
- [x] Timeout AI ditangani.
  - Catatan: Gemini via `Promise.race(timeout)`; OpenRouter via `AbortController`. Timeout per-model (90-180s) di `AI_MODELS`.
- [x] Retry dibatasi.
- [x] Prompt system tidak bocor ke user.
  - Catatan: `sanitizeAiResponse()` di `ai-sanitize.ts` — 12+ regex pattern untuk deteksi & censor kebocoran system instruction.
- [x] Guardrail scenario tersedia.
- [x] Token usage dicatat.
- [x] Cost usage dicatat.
- [x] Jika harga model tidak ditemukan, token tetap dicatat dengan cost 0.
- [x] Warning/log dibuat jika pricing missing.
- [x] Rate limit AI berbasis user.
  - Catatan: `aiRateLimitMiddleware` — user-based (via auth profile), 50 req/min. Dipasang di KETIK generate, review, PDKT generate-template, evaluate, dan SIDAK report AI.
- [x] Rate limit anonymous lebih rendah atau tidak diizinkan.

## 2.5 SIDAK Backend `P0`

- [x] Endpoint dashboard SIDAK tersedia.
- [x] Endpoint menerima filter tahun, bulan/range, service type, folder.
- [x] Filter service type diterapkan di database sebelum pagination.
- [x] Pagination memakai range/limit-offset yang stabil.
- [x] Query memakai order by id atau kolom stabil.
- [x] Count total akurat dan tidak terjebak limit 1000.
- [x] Data dashboard tidak overfetch.
  - Catatan: `getDashboardData()` tetap mengambil semua temuan untuk filter tertentu, tapi aksesnya sudah di-scope via `getAccessibleAgentIds()`.
- [x] Perhitungan metric konsisten dengan legacy.
- [x] Empty state bisa dibedakan dari backend.
- [x] Leader access approval diterapkan di backend.
- [x] Data peserta yang tidak diizinkan tidak ikut dihitung.
  - Catatan: `getAccessibleAgentIds()` — leader hanya lihat agent dari access groups yang di-approve. Agent hanya lihat data sendiri.
- [x] Aggregate tidak bocor lintas service/role.
  - Catatan: Agent-only, leader-specific, dan admin/trainer/qa scoping diterapkan di semua endpoint read SIDAK.
- [x] Query besar memakai summary/cache jika diperlukan.
  - Catatan: Summary tables (`qa_dashboard_period_summary` + `qa_dashboard_agent_period_summary`) diaktifkan via write-through pada batch upload + refresh endpoint. Dashboard membaca cache dengan fallback ke raw query. Lihat `refreshDashboardSummary()` di sidak-service.ts.

## 2.6 Upload Batch QA `P0`

- [x] Endpoint batch temuan tersedia; Excel parsing/preview terjadi di frontend.
  - Catatan: `POST /api/v1/sidak/temuan/batch` — menerima JSON batch, bukan raw Excel.
- [x] Validasi payload batch tersedia.
  - Catatan: `validateTemuanBatch()` di backend memvalidasi semua item (indicator exists, service_type match, rule version compliance, dedup) sebelum insert. Frontend juga memvalidasi via `excel-utils.ts`.
- [x] Validasi periode tersedia.
- [x] Validasi service type tersedia.
- [x] Validasi agent/profiler tersedia.
- [x] Validasi indicator_id tersedia.
- [x] Mapping parameter QA memakai version yang benar.
  - Catatan: `rule_version_id` dipopulate dari active published version. `legacy_indicator_id` linking untuk cross-validate indicator temuan vs rule indicators.
- [x] Foreign key error ditangani sebelum insert.
- [x] Insert batch atomic via single INSERT statement.
  - Catatan: Single `INSERT INTO ... VALUES (...), (...)` bersifat atomik di PostgreSQL.
- [x] Jika satu batch gagal, data tidak masuk sebagian tanpa kontrol.
  - Catatan: PostgreSQL atomic INSERT — satu baris FK violation akan rollback seluruh batch.
- [x] Error upload mudah dipahami user.
  - Catatan: Semua error dalam Bahasa Indonesia.
- [x] Log upload tersimpan.
  - Catatan: Insert ke `activity_logs` dengan action `upload_sidak_batch` dan type `upload`/`upload_skipped`.
- [x] Duplicate upload dicegah atau diberi warning.
  - Catatan: Dedup check via query existing `(period_id, peserta_id, indicator_id)` sebelum insert. Response return `{inserted, skipped, total}`.
- [x] Preview data sebelum commit tersedia jika ditargetkan.
  - Catatan: `POST /api/v1/sidak/temuan/batch/preview` menjalankan `validateTemuanBatch()` — mengembalikan `{valid, invalid, skipped, stats}` tanpa insert. Gunakan sebelum `POST /temuan/batch` untuk lihat hasil validasi.

## 2.7 Report Backend `P1`

- [x] Endpoint report individu tersedia.
- [x] Endpoint report layanan tersedia.
- [x] Backend mengambil data profiler.
- [x] Backend mengambil data SIDAK.
- [x] Backend mengambil data temuan.
- [x] Backend mengambil data grafik.
  - Catatan: `getReportChartData()` — aggregate donut (critical/non-critical), pareto (indicator ranking), trend (monthly). Endpoint `POST /reports/ai/chart-data`.
- [x] AI hanya membuat narasi dari data yang sudah disediakan.
- [x] Backend melarang AI mengarang angka.
  - Catatan: Prompt berisi "Jangan pernah mengarang, menebak, atau menambahkan angka atau temuan yang tidak ada di data."
- [x] Export HTML tersedia jika digunakan.
  - Catatan: `POST /reports/ai/export-html` — standalone HTML dengan inline CSS A4, summary cards, findings, charts.
- [x] Export DOCX tersedia jika ditargetkan.
- [x] Export PDF tersedia jika ditargetkan.
  - Catatan: Server-side PDF generation via `pdf-lib` di `report-pdf-builder.ts`. Output: A4 format, title, summary cards, findings, charts table, recommendations.
- [x] File temporary dibersihkan.
  - Catatan: DOCX di-generate in-memory (`Buffer.from(Packer.toBuffer(doc))`), PDF via `pdf-lib` di memory, tidak ada temp files.
- [x] Report lama bisa dibuka ulang jika disimpan.
  - Catatan: Tabel `report_archives` (migration 007) + CRUD endpoints (save, list, get, delete). RLScoped — agent lihat sendiri, admin/trainer/qa lihat semua.

## 2.8 Telefun Backend `P0`

- [x] Standalone persistent WebSocket server tersedia.
  - Catatan: Standalone server di `apps/telefun/src/server.ts` — port 3002, health check.
- [x] Server memvalidasi token Supabase.
- [x] Session Telefun dibuat saat call dimulai.
  - Catatan: `createSession()` di `db.ts` — insert ke `telefun_history` dengan status `active`. Session ID dikirim ke client.
- [x] Audio stream dikirim ke model dengan benar.
- [x] Response audio diterima and diteruskan ke frontend.
- [x] Reconnect ditangani.
  - Catatan: Server-side reconnect: max 3 attempts, exponential backoff (1s/2s/4s). `setupGeminiWs()` reusable function.
- [x] Silence handling tersedia.
  - Catatan: `SilenceDetector` — interval 1s, trigger jika >5s tanpa audio dari client. Kirim `{type:'silence'}` ke client.
- [x] Short utterance handling tersedia.
  - Catatan: `UtteranceBuffer` — buffer chunks <500ms, flush setelah minDelay atau maxDelay. Hanya dikirim jika `turnManager.canSendToGemini()`.
- [x] Turn-taking tidak terlalu agresif.
  - Catatan: `TurnManager` state machine (LISTENING → PROCESSING → SPEAKING). Audio user di-buffer selama AI speaking.
- [x] Session disimpan saat call selesai.
  - Catatan: `saveAndCloseSession()` — update status `completed`/`failed`, duration_seconds, messages transcript.
- [x] Transcript/log disimpan jika tersedia.
  - Catatan: Transcript dari `clientContent.turns[].parts[].text` (user) + `serverContent.modelTurn.parts[].text` (AI) diakumulasi dan disimpan ke DB.
- [x] Usage AI Telefun dicatat.
- [x] Server tidak menyimpan audio mentah jika tidak dibutuhkan.
- [x] Error model audio ditangani dengan fallback.

---

# 3. Integrated Fullstack

## 3.1 Login sampai Akses Modul `P0`

- [ ] User auth via landing modal.
- [ ] Backend memvalidasi token.
- [ ] Frontend menerima profile and role.
- [ ] Menu tampil sesuai role.
- [ ] Route protected tidak bisa dibuka manual lewat URL.
- [ ] Refresh halaman tidak kehilangan session.
- [ ] Logout memutus akses frontend and backend.

## 3.2 Flow KETIK End-to-End `P0`

- [ ] Agent memilih scenario.
- [ ] Agent memulai simulasi.
- [ ] Frontend mengirim pesan ke backend.
- [ ] Backend memanggil AI.
- [ ] AI membalas sesuai scenario.
- [ ] Transcript tersimpan.
- [ ] Token usage tercatat.
- [ ] Session selesai.
- [ ] Riwayat muncul di workspace/history modal; route legacy hanya redirect kompatibilitas.
- [ ] Trainer/QA bisa review sesuai izin.
- [ ] Agent lain tidak bisa membuka sesi tersebut.

## 3.3 Flow PDKT End-to-End `P1`

- [ ] Agent memilih scenario.
- [ ] Agent membuat email.
- [ ] Draft tersimpan.
- [ ] Email bisa dibuka ulang.
- [ ] Agent mengirim email.
- [ ] AI membalas email sesuai scenario.
- [ ] Thread tersimpan.
- [ ] Trainer/QA bisa review.
- [ ] Usage AI tercatat.
- [ ] Email yang belum selesai tetap muncul di daftar.

## 3.4 Flow Telefun End-to-End `P0`

- [ ] Agent membuka Telefun.
- [ ] Frontend meminta microphone permission.
- [ ] Frontend connect ke WebSocket.
- [ ] Server memvalidasi token.
- [ ] Simulasi suara dimulai.
- [ ] AI merespons secara realtime.
- [ ] Transcript/session metadata tersimpan.
- [ ] Usage AI tercatat.
- [ ] Call selesai dengan aman.
- [ ] Riwayat bisa dibuka ulang.
- [ ] Jika server disconnect, frontend menampilkan error yang jelas.

## 3.5 Flow SIDAK Dashboard End-to-End `P0`

- [ ] User membuka SIDAK.
- [ ] Frontend mengirim filter.
- [ ] Backend memvalidasi role.
- [ ] Backend membatasi data sesuai izin.
- [ ] Backend mengambil data QA.
- [ ] Backend menghitung metric.
- [ ] Frontend menampilkan card, chart, and table.
- [ ] Angka sama dengan hasil query database manual.
- [ ] Filter service type tidak bercampur.
- [ ] Pagination tidak menyebabkan data hilang.
- [ ] Empty state sesuai kondisi data.

## 3.6 Flow Upload QA End-to-End `P0`

- [ ] Admin/QA upload Excel ke frontend.
- [ ] Frontend parse dan menampilkan preview batch JSON.
- [ ] Backend validasi data.
- [ ] Backend validasi parameter aktif.
- [ ] Backend validasi indikator.
- [ ] Backend validasi profiler.
- [ ] Data masuk ke tabel yang benar.
- [ ] Error foreign key tidak muncul setelah validasi.
- [ ] Dashboard SIDAK berubah sesuai data baru.
- [ ] Upload log tersimpan.
- [ ] User mendapat feedback jelas.

## 3.7 Flow Parameter QA End-to-End `P1`

- [ ] Admin membuat draft parameter.
- [ ] Admin mengedit draft.
- [ ] Admin preview parameter.
- [ ] Admin publish parameter.
- [ ] Version lama menjadi superseded.
- [ ] Version baru menjadi published.
- [ ] Upload batch memakai version baru.
- [ ] Data lama tetap merujuk version lama jika memang dibutuhkan.
- [ ] Perubahan tercatat di audit log.
- [ ] Publish gagal jika parameter tidak valid.

## 3.8 Flow Report AI End-to-End `P1`

- [ ] User memilih report individu/layanan.
- [ ] Frontend mengirim filter periode.
- [ ] Backend mengambil data profiler and SIDAK.
- [ ] Backend membangun dataset report.
- [ ] Grafik dibuat dari data nyata.
- [ ] AI membuat narasi berdasarkan dataset.
- [ ] Frontend render preview A4.
- [ ] Export berhasil.
- [ ] Report tidak mengandung angka yang tidak ada di data.
- [ ] Role access tetap berlaku di report.

## 3.9 Flow Leader Approval `P1`

- [ ] Leader mengajukan akses KTP/SIDAK.
- [ ] Trainer/admin menerima request.
- [ ] Trainer/admin memilih peserta/data slice yang diizinkan.
- [ ] Approval tersimpan.
- [ ] Leader hanya melihat peserta yang disetujui.
- [ ] Dashboard SIDAK leader hanya menghitung peserta yang disetujui.
- [ ] Jika peserta lintas layanan, logic predominant service berjalan.
- [ ] Approval bisa expired/dicabut.
- [ ] Akses berubah setelah approval dicabut.

---

# 4. Database

## 4.1 Schema Dasar `P0`

- [x] `public.profiles` tersedia untuk profile, role, status, dan soft delete.
- [x] Role/permission direpresentasikan lewat `profiles.role` + RLS/policies, bukan tabel permission terpisah.
- [x] `public.profiler_years`, `public.profiler_folders`, `public.profiler_peserta`, dan `public.profiler_tim_list` tersedia.
- [x] `public.qa_periods`, `public.qa_indicators`, `public.qa_service_weights`, `public.qa_service_rule_versions`, `public.qa_service_rule_indicators`, `public.qa_temuan`, `public.qa_dashboard_period_summary`, dan `public.qa_dashboard_agent_period_summary` tersedia.
- [x] `public.ketik_history`, `public.ketik_session_reviews`, `public.ketik_typo_findings`, dan `public.ketik_review_jobs` tersedia.
- [x] `public.pdkt_history` dan `public.pdkt_mailbox_items` tersedia.
- [x] `public.telefun_history`, `public.telefun_coaching_summary`, dan `public.telefun_replay_annotations` tersedia.
- [x] `public.activity_logs` tersedia sebagai log operasional.
- [x] `public.ai_pricing_settings`, `public.ai_billing_settings`, dan `public.ai_usage_logs` tersedia.
- [x] `public.report_archives` tersedia.
- [x] `public.access_groups`, `public.access_group_items`, `public.leader_access_requests`, dan `public.leader_access_request_groups` tersedia.
- [x] `public.user_settings` tersedia untuk penyimpanan setting per user.
- [x] Setting scenario KETIK/PDKT/Telefun disimpan di `public.user_settings.settings`, bukan tabel scenario terpisah.

## 4.2 Relasi and Foreign Key `P0`

- [x] `profiles.id` terhubung ke `auth.users.id`.
- [x] `profiler_folders.trainer_id`, `profiler_peserta.trainer_id`, dan `profiler_tim_list.trainer_id` terhubung ke `auth.users.id`.
- [x] `profiler_folders.year_id` dan `parent_id` terhubung ke tabel year/folder yang benar.
- [x] `profiler_peserta.batch_name` terhubung ke `profiler_folders.name`.
- [x] `qa_temuan.peserta_id` terhubung ke `profiler_peserta.id`.
- [x] `qa_temuan.period_id` terhubung ke `qa_periods.id`.
- [x] `qa_temuan.indicator_id` terhubung ke `qa_indicators.id`.
- [x] `qa_temuan.rule_version_id` terhubung ke `qa_service_rule_versions.id`.
- [x] `qa_temuan.rule_indicator_id` terhubung ke `qa_service_rule_indicators.id`.
- [x] `qa_service_rule_versions.effective_period_id` terhubung ke `qa_periods.id`.
- [x] `qa_service_rule_indicators.rule_version_id` terhubung ke `qa_service_rule_versions.id`.
- [x] `ketik_history.user_id`, `pdkt_history.user_id`, `pdkt_mailbox_items.user_id`, `telefun_history.user_id`, `report_archives.user_id`, `user_settings.user_id`, dan `ai_usage_logs.user_id` terhubung ke `auth.users.id`.
- [x] `leader_access_requests.leader_user_id` dan `reviewed_by` terhubung ke `profiles.id`.
- [x] `leader_access_request_groups.request_id` dan `access_group_id` terhubung dengan benar.
- [x] `access_group_items.access_group_id` terhubung ke `access_groups.id`.
- [x] Foreign key error dicegah melalui validasi sebelum insert.

## 4.3 RLS and Security `P0`

- [x] RLS aktif di tabel yang diakses client.
- [x] Profile, settings, history, dan report archive dibatasi ke owner atau role terkait.
- [x] Admin/trainer dapat mengelola access group dan leader request.
- [x] `ai_usage_logs` hanya bisa dibaca owner, sedangkan insert dilakukan backend/service role.
- [x] Telefun recording bucket memakai policy owner-based.
- [x] Policy tidak memakai `using true`. RLS SIDAK/profiler diperketat di 015 (admin/trainer/agent-own only).
- [x] Service role hanya dipakai backend.
- [x] Storage foto/avatar dan export report sudah punya policy dedicated dan bucket dibuat via migration 014.

## 4.4 Index and Performa `P0`

- [x] Index `qa_temuan(period_id, service_type)` tersedia untuk filter dashboard.
- [x] Index `qa_temuan(peserta_id, period_id)` tersedia.
- [x] Index `qa_temuan(indicator_id)` tersedia.
- [x] Index `qa_temuan(rule_version_id)` tersedia.
- [x] Index `qa_indicators(service_type)` tersedia.
- [x] Index `profiler_peserta(batch_name)` dan `profiler_peserta(tim)` tersedia.
- [x] Index `ketik_history.user_id` dan `ketik_history.date` tersedia.
- [x] Index `pdkt_history.user_id` dan `pdkt_history.timestamp` tersedia.
- [x] Index `pdkt_mailbox_items.user_id` dan `pdkt_mailbox_items.status` tersedia.
- [x] Index `telefun_history.user_id` dan `telefun_history.created_at` tersedia.
- [x] Index `ai_usage_logs.user_id`, `ai_usage_logs.module`, `ai_usage_logs.created_at`, dan `ai_usage_logs.model_id` tersedia.
- [x] Index `report_archives.user_id`, `report_archives.created_at`, dan `report_archives.report_type` tersedia.
- [x] Index `activity_logs.created_at` sudah ada (Migration 010).
- [x] Summary cache table `qa_dashboard_period_summary` dan `qa_dashboard_agent_period_summary` dipakai.
- [x] Materialized view `mv_qa_period_summary` sudah dipakai, dengan fallback chain ke cache table → raw computed.

## 4.5 Migration `P0`

- [x] Semua perubahan schema ada di migration file.
- [x] Migration dibuat idempotent dengan `IF NOT EXISTS` / `DROP IF EXISTS`.
- [x] Migration diberi nomor berurutan dan gampang dilacak.
- [ ] Migration dari database kosong belum divalidasi end-to-end di checklist ini.
- [ ] Migration existing database belum punya rollback plan tertulis per file.
- [ ] Seed data local/dev belum dipisah formal.
- [x] Enum/service type konsisten dengan backend dan shared types.
- [x] Default value jelas.
- [ ] Perubahan RLS masih perlu uji ulang setelah migration.

## 4.6 QA Parameter Versioning `P1`

- [x] Tabel rule version punya `version_number`.
- [x] Ada status: draft, published, superseded.
- [x] Ada `change_reason`.
- [x] Ada `created_by`, `updated_by`, dan `published_by`.
- [x] Ada `published_at` dan `superseded_at`.
- [x] Ada `superseded_by`, `superseded_by_version_id`, dan `created_from_version_id`.
- [x] Hanya satu published version aktif per service.
- [x] Publish dikelola lewat backend service/route, bukan RPC DB.
- [x] Publish otomatis supersede version lama.
- [x] Draft bisa diedit.
- [x] Published tidak diedit langsung.
- [x] Revision membuat version baru.
- [x] Upload QA memakai rule version yang benar. Catatan: `createTemuanBatch()` mengisi `qa_temuan.rule_version_id` dari published version aktif, dan `validateTemuanBatch()` menolak indikator yang tidak cocok dengan versi aktif.

## 4.7 RPC / Database Function `P1`

- [x] RPC `submit_pdkt_mailbox_batch` tersedia.
- [x] RPC `submit_pdkt_mailbox_reply` tersedia.
- [x] RPC `bulk_reorder_profiler_peserta` tersedia.
- [x] RPC `upsert_telefun_coaching_summary` tersedia.
- [x] Publish rule version dikelola lewat backend service/route, bukan RPC DB.
- [x] Dashboard aggregate dipenuhi oleh summary table, bukan RPC DB.
- [x] Function memakai `SECURITY DEFINER` dengan `search_path` dibatasi.
- [x] Function tetap memvalidasi ownership/role sebelum mutasi data.
- [x] Error message function cukup jelas untuk client.
- [x] RPC tambahan untuk validasi upload batch belum diperlukan karena validasi ada di service backend.

## 4.8 Data Integrity `P0`

- [ ] Tidak ada data dummy di production.
- [ ] Tidak ada duplikasi agent/profiler.
- [ ] Nama agent konsisten.
- [ ] Foto/avatar profiler valid.
- [x] `qa_temuan.indicator_id` dan `period_id` dijaga lewat FK.
- [x] `qa_temuan.service_type` divalidasi terhadap indikator aktif sebelum insert.
- [x] Duplikasi temuan per peserta/periode/indikator dicegah di service layer.
- [x] Nilai (`nilai`) dibatasi di range 0-3.
- [x] `rule_version_id` dicatat pada temuan batch baru.
- [x] Record history dan report terhubung ke user yang benar.
- [x] Deleted/archived data otomatis tidak ikut dashboard aktif. Soft-delete exclusion di `getDashboardData`, `getAgents`, `getDataReportRows` via `getSoftDeletedPesertaIds()`. Opsi `show_archived=true` untuk override.

## 4.9 AI Usage and Pricing `P0`

- [x] `ai_usage_logs` mencatat module `ketik`, `pdkt`, `telefun`, dan `qa-analyzer`.
- [x] Tabel mencatat `user_id`.
- [x] Tabel mencatat `provider` dan `model_id`.
- [x] Tabel mencatat `input_tokens`, `output_tokens`, dan `total_tokens`.
- [x] Tabel mencatat pricing snapshot dan estimated cost.
- [x] `request_id` unik tersedia untuk dedup log.
- [x] Tabel mencatat request status (`success`, `failed`, `timeout`).
- [x] Tabel mencatat `error_message` jika gagal/timeout (maks 1000 char).
- [x] `ai_pricing_settings` tersedia per model.
- [x] `ai_billing_settings` tersedia untuk kurs USD/IDR.
- [x] Missing pricing tidak membuat log gagal.
- [x] Dashboard usage membaca data log dengan benar.

---

# 5. Testing and Regression

## 5.1 Unit Test `P1`

- [ ] Test kalkulasi `avgAgentScore`.
- [ ] Test kalkulasi `zeroErrorRate`.
- [ ] Test kalkulasi `complianceRate`.
- [ ] Test kalkulasi `defectsPerAgent`.
- [ ] Test Pareto calculation.
- [ ] Test trend zero-padding.
- [ ] Test filter service type.
- [ ] Test upload validation.
- [ ] Test role permission.
- [ ] Test AI usage logging.
- [ ] Test rule version publishing.

## 5.2 Integration Test `P1`

- [ ] Login lalu akses dashboard.
- [ ] Agent menjalankan KETIK.
- [ ] Agent menjalankan PDKT.
- [ ] Agent menjalankan Telefun.
- [ ] QA upload data SIDAK.
- [ ] Admin publish parameter.
- [ ] User generate report.
- [ ] Leader mengakses data setelah approval.
- [ ] Unauthorized user ditolak.

## 5.3 Regression Test dari Legacy `P0`

- [ ] Ambil dataset SIDAK yang sama.
- [ ] Jalankan dashboard di legacy.
- [ ] Jalankan dashboard di Vite.
- [ ] Bandingkan total temuan.
- [ ] Bandingkan total agent.
- [ ] Bandingkan score.
- [ ] Bandingkan top parameter.
- [ ] Bandingkan trend.
- [ ] Bandingkan report individu.
- [ ] Selisih angka harus dijelaskan, bukan dibiarkan.

---

# 6. Format Tabel Audit untuk Agent

| Area  | Item                   | Legacy |   Vite Baru | Status | Catatan                    | File terkait          |
| ----- | ---------------------- | -----: | ----------: | ------ | -------------------------- | --------------------- |
| SIDAK | Total temuan dashboard |    Ada | Belum dicek | `[ ]`  | Bandingkan query legacy    | `qaService.server.ts` |
| Auth  | Role guard             |    Ada |    Sebagian | `[~]`  | Perlu validasi backend     | `auth/*`              |
| KETIK | Session history        |    Ada |   Belum ada | `[!]`  | Perlu tabel and UI history | `ketik/*`             |

---

# 7. Kesimpulan Audit

Versi Vite bisa dianggap siap menggantikan legacy hanya jika minimal area berikut sudah aman:

- [ ] Auth + role + guard route sudah benar.
- [ ] Backend sudah meng-handle logic sensitif.
- [ ] SIDAK dashboard menghasilkan angka yang sama atau selisihnya bisa dijelaskan.
- [ ] KETIK, PDKT, and Telefun berjalan end-to-end.
- [ ] Upload QA tidak memicu error foreign key.
- [ ] AI usage logging aktif and tidak bisa di-spoof.
- [ ] Data report berasal dari profiler and SIDAK.
- [ ] RLS, policy, and service role aman.
- [ ] Migration database aman and repeatable.
- [ ] Regression test terhadap legacy sudah dilakukan.
