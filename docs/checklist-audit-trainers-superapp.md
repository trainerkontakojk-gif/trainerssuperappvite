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

| Status | Arti |
|---|---|
| `[ ]` | Belum dicek |
| `[x]` | Sudah sesuai |
| `[~]` | Sebagian |
| `[!]` | Bermasalah / perlu fix |

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
- [ ] Backend tersedia untuk logic sensitif.
- [x] SIDAK dashboard akurat.
  - Catatan: Filter tahun, service type, pareto chart, top agents paginated, empty states terpisah.
- [x] Upload QA aman.
- [x] Data profiler dan SIDAK terhubung benar.
- [ ] AI usage logging berjalan.
- [x] KETIK session tersimpan.
- [x] Telefun berjalan dengan server realtime.
- [ ] RLS dan permission aman.
- [ ] Migration database aman.

## P1 — Penting untuk operasional

- [x] Report individu akurat.
- [x] Report layanan akurat.
- [x] QA parameter versioning tersedia.
  - Catatan: Backend 8 endpoints + frontend tab UI (create draft, publish, supersede).
- [x] PDKT master-detail tersedia.
- [x] Leader approval workflow tersedia.
- [ ] Dashboard usage AI tersedia.
- [x] Export DOCX/PDF tersedia.
- [x] Admin scenario management tersedia.
- [x] Error handling upload jelas.
- [ ] Performance dashboard aman untuk data besar.

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
- [x] Redirect login/logout berjalan normal.
- [x] Halaman 404, unauthorized, dan error state tersedia.
  - Catatan: 404 (`not-found.tsx`), unauthorized (`unauthorized.tsx`), ErrorBoundary di `main.tsx`.
- [x] Layout utama konsisten di desktop dan mobile.
- [x] Sidebar/navbar menyesuaikan role user.
- [x] Login Supabase Auth berjalan.
- [x] Logout membersihkan session.
- [x] Session tetap bertahan setelah refresh.
- [x] Expired session diarahkan ke login.
  - Catatan: Layout cek `auth_token` + `auth_profile` di localStorage, redirect ke `/`.
- [x] User profile dan role terbaca setelah login.
- [x] Tidak ada service role key atau secret key di frontend.
- [x] Frontend tidak mengandalkan role dari localStorage saja.
  - Catatan: Role divalidasi dari database via `fetchProfile()`, auth guard juga cek `auth_profile`.
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
- [x] History sesi KETIK tersedia.
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
- [~] Export DOCX/PDF tersedia jika ditargetkan.
  - Catatan: Print-to-PDF via `@media print` (A4, page breaks, `window.print()`). DOCX belum.
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
- [~] Trainer/admin bisa membuat scenario Telefun.
  - Catatan: Settings modal ada scenario presets + custom instructions. Belum ada CRUD scenario terpisah seperti KETIK/PDKT.
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
- [~] Ada alasan perubahan.
  - Catatan: Belum ada field `change_reason` di schema/UI.
- [ ] Ada preview sebelum apply.
- [ ] Ada validasi sebelum upload batch memakai parameter baru.

---

# 2. Backend

## 2.1 Arsitektur Backend `P0`

- [ ] Backend terpisah dari frontend Vite sudah tersedia.
- [ ] Backend punya struktur module/service yang jelas.
- [ ] Tidak ada business logic sensitif di frontend.
- [ ] Semua query sensitif lewat backend/server.
- [ ] Backend memakai env untuk credential.
- [ ] Service role Supabase hanya ada di backend.
- [ ] Error handling standar tersedia.
- [ ] Response API konsisten.
- [ ] Logging backend tersedia.
- [ ] Request validation tersedia.
- [ ] Rate limit global tersedia.
- [ ] CORS dibatasi ke domain yang benar.

## 2.2 Auth Backend `P0`

- [ ] Backend memvalidasi Supabase JWT.
- [ ] Backend mengambil user dari token, bukan dari body request.
- [ ] Backend mengambil role dari database/profile.
- [ ] Backend menolak request tanpa token untuk route protected.
- [ ] Backend menolak akses role yang tidak sesuai.
- [ ] Admin endpoint hanya bisa diakses admin.
- [ ] Trainer/QA endpoint hanya bisa diakses role terkait.
- [ ] Agent endpoint hanya mengembalikan data milik agent tersebut.
- [ ] Identity spoofing dicegah.

## 2.3 Service Layer `P0`

- [ ] Ada service khusus KETIK.
- [ ] Ada service khusus PDKT.
- [ ] Ada service khusus Telefun.
- [ ] Ada service khusus SIDAK.
- [ ] Ada service khusus Report.
- [ ] Ada service khusus AI usage.
- [ ] Ada service khusus Admin/User.
- [ ] Query database tidak tersebar acak di handler.
- [ ] Logic bisnis mudah dites.
- [ ] Handler API hanya mengurus request/response.

## 2.4 AI Gateway `P0`

- [ ] Semua request AI lewat backend.
- [ ] API key OpenRouter/Gemini/OpenAI tidak pernah tampil di frontend.
- [ ] Model dipilih dari konfigurasi resmi.
- [ ] Fallback model tersedia.
- [ ] Timeout AI ditangani.
- [ ] Retry dibatasi.
- [ ] Prompt system tidak bocor ke user.
- [ ] Guardrail scenario tersedia.
- [ ] Token usage dicatat.
- [ ] Cost usage dicatat.
- [ ] Jika harga model tidak ditemukan, token tetap dicatat dengan cost 0.
- [ ] Warning/log dibuat jika pricing missing.
- [ ] Rate limit AI berbasis user.
- [ ] Rate limit anonymous lebih rendah atau tidak diizinkan.

## 2.5 SIDAK Backend `P0`

- [ ] Endpoint dashboard SIDAK tersedia.
- [ ] Endpoint menerima filter tahun, bulan/range, service type, folder.
- [ ] Filter service type diterapkan di database sebelum pagination.
- [ ] Pagination memakai range/limit-offset yang stabil.
- [ ] Query memakai order by id atau kolom stabil.
- [ ] Count total akurat and tidak terjebak limit 1000.
- [ ] Data dashboard tidak overfetch.
- [ ] Perhitungan metric konsisten dengan legacy.
- [ ] Empty state bisa dibedakan dari backend.
- [ ] Leader access approval diterapkan di backend.
- [ ] Data peserta yang tidak diizinkan tidak ikut dihitung.
- [ ] Aggregate tidak bocor lintas service/role.
- [ ] Query besar memakai summary/cache jika diperlukan.

## 2.6 Upload Batch QA `P0`

- [ ] Endpoint upload Excel tersedia.
- [ ] Validasi format file tersedia.
- [ ] Validasi periode tersedia.
- [ ] Validasi service type tersedia.
- [ ] Validasi agent/profiler tersedia.
- [ ] Validasi indicator_id tersedia.
- [ ] Mapping parameter QA memakai version yang benar.
- [ ] Foreign key error ditangani sebelum insert.
- [ ] Insert batch memakai transaksi.
- [ ] Jika satu batch gagal, data tidak masuk sebagian tanpa kontrol.
- [ ] Error upload mudah dipahami user.
- [ ] Log upload tersimpan.
- [ ] Duplicate upload dicegah atau diberi warning.
- [ ] Preview data sebelum commit tersedia jika ditargetkan.

## 2.7 Report Backend `P1`

- [ ] Endpoint report individu tersedia.
- [ ] Endpoint report layanan tersedia.
- [ ] Backend mengambil data profiler.
- [ ] Backend mengambil data SIDAK.
- [ ] Backend mengambil data temuan.
- [ ] Backend mengambil data grafik.
- [ ] AI hanya membuat narasi dari data yang sudah disediakan.
- [ ] Backend melarang AI mengarang angka.
- [ ] Export HTML tersedia jika digunakan.
- [ ] Export DOCX tersedia jika ditargetkan.
- [ ] Export PDF tersedia jika ditargetkan.
- [ ] File temporary dibersihkan.
- [ ] Report lama bisa dibuka ulang jika disimpan.

## 2.8 Telefun Backend `P0`

- [ ] Server WebSocket tersedia di Railway/VPS/server persistent.
- [ ] Server memvalidasi token Supabase.
- [ ] Session Telefun dibuat saat call dimulai.
- [ ] Audio stream dikirim ke model dengan benar.
- [ ] Response audio diterima and diteruskan ke frontend.
- [ ] Reconnect ditangani.
- [ ] Silence handling tersedia.
- [ ] Short utterance handling tersedia.
- [ ] Turn-taking tidak terlalu agresif.
- [ ] Session disimpan saat call selesai.
- [ ] Transcript/log disimpan jika tersedia.
- [ ] Usage AI Telefun dicatat.
- [ ] Server tidak menyimpan audio mentah jika tidak dibutuhkan.
- [ ] Error model audio ditangani dengan fallback.

---

# 3. Integrated Fullstack

## 3.1 Login sampai Akses Modul `P0`

- [ ] User login.
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
- [ ] Riwayat muncul di halaman history.
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

- [ ] Admin/QA upload Excel.
- [ ] Frontend menampilkan preview.
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

- [ ] Tabel profile/user tersedia.
- [ ] Tabel role/permission tersedia.
- [ ] Tabel peserta/profiler tersedia.
- [ ] Tabel scenario KETIK tersedia.
- [ ] Tabel session KETIK tersedia.
- [ ] Tabel scenario PDKT tersedia.
- [ ] Tabel thread/email PDKT tersedia.
- [ ] Tabel session Telefun tersedia.
- [ ] Tabel QA temuan tersedia.
- [ ] Tabel QA indicators tersedia.
- [ ] Tabel QA service rule versions tersedia.
- [ ] Tabel upload logs tersedia.
- [ ] Tabel AI usage logs tersedia.
- [ ] Tabel AI pricing settings tersedia.
- [ ] Tabel report logs/generated reports tersedia jika report disimpan.
- [ ] Tabel access approval tersedia jika leader gating dipakai.

## 4.2 Relasi and Foreign Key `P0`

- [ ] `qa_temuan.agent_id` terhubung ke profiler/user yang benar.
- [ ] `qa_temuan.indicator_id` terhubung ke `qa_indicators`.
- [ ] `qa_temuan.period_id/folder_id` valid.
- [ ] `qa_temuan.service_type` konsisten dengan service di profiler/indicator.
- [ ] Session KETIK terhubung ke user.
- [ ] Session PDKT terhubung ke user.
- [ ] Session Telefun terhubung ke user.
- [ ] AI usage log terhubung ke user jika authenticated.
- [ ] Rule version punya relasi ke service type.
- [ ] Published rule version bisa dilacak dari data upload.
- [ ] Tidak ada orphan records penting.
- [ ] Foreign key error dicegah melalui validasi sebelum insert.

## 4.3 RLS and Security `P0`

- [ ] RLS aktif di tabel yang diakses client.
- [ ] Agent hanya bisa membaca data miliknya.
- [ ] Trainer/QA hanya bisa membaca data sesuai cakupan.
- [ ] TL/SPV/OM hanya bisa membaca data sesuai aturan.
- [ ] Admin bisa mengelola data sesuai kebutuhan.
- [ ] Service role hanya dipakai backend.
- [ ] Policy tidak terlalu longgar dengan `using true`.
- [ ] Insert/update/delete dibatasi sesuai role.
- [ ] Data report tidak bisa dibuka lintas user tanpa izin.
- [ ] Storage foto/avatar punya policy yang aman.
- [ ] Storage report/export punya policy yang aman.

## 4.4 Index and Performa `P0`

- [ ] Index untuk `qa_temuan.service_type`.
- [ ] Index untuk `qa_temuan.period_id`.
- [ ] Index untuk `qa_temuan.agent_id`.
- [ ] Index untuk `qa_temuan.indicator_id`.
- [ ] Index gabungan untuk filter dashboard utama.
- [ ] Index untuk `created_at` pada session/log.
- [ ] Index untuk `user_id` pada session KETIK/PDKT/Telefun.
- [ ] Index untuk AI usage berdasarkan user, module, date.
- [ ] Query dashboard tidak full scan berlebihan.
- [ ] Query report individu cepat.
- [ ] Query report layanan cepat.
- [ ] Query upload validation tidak lambat.
- [ ] Summary table/materialized view dipertimbangkan untuk data SIDAK besar.

## 4.5 Migration `P0`

- [ ] Semua perubahan schema ada di migration file.
- [ ] Migration bisa dijalankan dari database kosong.
- [ ] Migration bisa dijalankan di database existing tanpa merusak data.
- [ ] Ada rollback plan untuk perubahan besar.
- [ ] Seed data tersedia untuk local/dev.
- [ ] Enum service type konsisten.
- [ ] Default value jelas.
- [ ] Constraint tidak bertabrakan dengan data lama.
- [ ] Migration tidak menghapus data legacy tanpa backup.
- [ ] Perubahan RLS diuji setelah migration.

## 4.6 QA Parameter Versioning `P1`

- [ ] Tabel rule version punya `version_number`.
- [ ] Ada status: draft, published, superseded, archived.
- [ ] Ada `change_reason`.
- [ ] Ada `created_by`.
- [ ] Ada `updated_by`.
- [ ] Ada `published_at`.
- [ ] Ada `superseded_at`.
- [ ] Ada `superseded_by_version_id`.
- [ ] Hanya satu published version aktif per service/periode jika aturan begitu.
- [ ] Publish dilakukan lewat RPC/transaksi.
- [ ] Publish otomatis supersede version lama.
- [ ] Draft bisa diedit.
- [ ] Published tidak diedit langsung.
- [ ] Revision membuat version baru.
- [ ] Upload QA memakai rule version yang benar.

## 4.7 RPC / Database Function `P1`

- [ ] RPC publish rule version tersedia.
- [ ] RPC validasi upload batch tersedia jika dibutuhkan.
- [ ] RPC dashboard aggregate tersedia jika query terlalu berat di API.
- [ ] RPC memakai security definer dengan hati-hati.
- [ ] RPC tetap memvalidasi role/permission.
- [ ] RPC punya error message yang jelas.
- [ ] RPC diuji untuk edge case.

## 4.8 Data Integrity `P0`

- [ ] Tidak ada data dummy di production.
- [ ] Tidak ada duplikasi agent/profiler.
- [ ] Nama agent konsisten.
- [ ] Foto/avatar profiler valid.
- [ ] Service type profiler konsisten.
- [ ] Data periode konsisten.
- [ ] Data indikator tidak duplicate ambigu.
- [ ] Data temuan punya referensi indikator valid.
- [ ] Nilai/skor berada dalam range yang benar.
- [ ] Tanggal upload and periode penilaian tidak tertukar.
- [ ] Deleted/archived data tidak ikut dashboard aktif kecuali diminta.

## 4.9 AI Usage and Pricing `P0`

- [ ] Tabel AI usage mencatat module: KETIK, PDKT, Telefun, Report.
- [ ] Tabel mencatat user_id.
- [ ] Tabel mencatat model.
- [ ] Tabel mencatat input token.
- [ ] Tabel mencatat output token.
- [ ] Tabel mencatat total token.
- [ ] Tabel mencatat estimated cost.
- [ ] Tabel mencatat request status.
- [ ] Tabel mencatat error jika gagal.
- [ ] Pricing setting tersedia per model.
- [ ] Missing pricing tidak membuat log gagal.
- [ ] Dashboard usage bisa membaca data dengan benar.

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

| Area | Item | Legacy | Vite Baru | Status | Catatan | File terkait |
|---|---|---:|---:|---|---|---|
| SIDAK | Total temuan dashboard | Ada | Belum dicek | `[ ]` | Bandingkan query legacy | `qaService.server.ts` |
| Auth | Role guard | Ada | Sebagian | `[~]` | Perlu validasi backend | `auth/*` |
| KETIK | Session history | Ada | Belum ada | `[!]` | Perlu tabel and UI history | `ketik/*` |

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
