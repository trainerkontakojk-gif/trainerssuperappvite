Berikut PRD yang bisa kamu berikan ke agent/codex/opencode untuk **membaca repo online GitHub Trainers SuperApp dan membangun ulang dari awal**.

---

# PRD Rebuild Trainers SuperApp dari Awal

## 1. Ringkasan Proyek

Bangun ulang **Trainers SuperApp** dari awal dengan arsitektur yang lebih ringan, cepat, modular, dan mudah dikembangkan.

Repo lama digunakan sebagai **sumber referensi fitur, flow, data model, business logic, dan UX**, bukan untuk disalin mentah-mentah. Agent wajib membaca repo lama secara menyeluruh sebelum menyusun implementasi.

Repo sumber:

```txt
https://github.com/fajarabr76/Trainerssuperappnext
```

Target utama rebuild:

```txt
Frontend  : Vite + React + TypeScript
Backend   : Hono + TypeScript
Database  : Supabase Postgres
Auth      : Supabase Auth + RLS
UI        : Tailwind CSS + shadcn/ui
State     : TanStack Query + Zustand
Routing   : TanStack Router
Deploy    : Frontend di Vercel/Cloudflare Pages
Backend   : Railway atau VPS + Coolify
Telefun   : service terpisah karena butuh WebSocket persistent
```

---

# 2. Tujuan Rebuild

## Tujuan utama

1. Membuat Trainers SuperApp lebih ringan dan cepat diakses.
2. Memisahkan frontend dan backend dengan jelas.
3. Menghindari ketergantungan penuh pada Next.js server actions.
4. Menjadikan backend sebagai pusat validasi, authorization, AI usage logging, upload processing, dan report generation.
5. Menjaga fitur lama tetap ada, tetapi dengan struktur kode yang lebih rapi.
6. Mengurangi risiko bug akibat query frontend langsung ke Supabase untuk proses penting.
7. Menyiapkan fondasi yang lebih aman untuk modul besar seperti SIDAK, KETIK, PDKT, Telefun, dan Report AI.

---

# 3. Prinsip Rebuild

Agent wajib mengikuti prinsip berikut:

```txt
Jangan copy-paste buta dari repo lama.
Pahami dulu domain, flow, data, dan alasan fitur dibuat.
Ambil business logic yang benar.
Buang technical debt.
Hindari mengulang bug lama.
Pastikan semua logic penting pindah ke backend.
Frontend hanya fokus pada UI dan interaksi pengguna.
```

Repo lama adalah referensi, bukan blueprint final.

---

# 4. Scope Modul

## Modul yang wajib dianalisis dari repo lama

Agent wajib membaca dan memetakan modul berikut:

```txt
Authentication
Role & permission
Dashboard utama
KETIK
PDKT
Telefun integration
SIDAK / QA Analyzer
QA Parameter / Rule Versioning
QA Upload Excel
AI Usage Monitoring
Report by AI
Profiler Peserta
Admin Settings
Leader / QA / SPV / OM access flow
```

## Modul prioritas rebuild tahap awal

Prioritas 1:

```txt
Auth
Layout utama
Role-based navigation
SIDAK / QA Analyzer core
Profiler Peserta
QA Upload Excel
AI Usage Logging
```

Prioritas 2:

```txt
KETIK
PDKT
Report AI
QA dashboard analytics
Rule versioning
```

Prioritas 3:

```txt
Telefun integration
Realtime coaching
Advanced reporting
Approval access flow untuk leader
```

---

# 5. Stack Final yang Digunakan

## Frontend

```txt
Vite
React
TypeScript
TanStack Router
TanStack Query
Zustand
Tailwind CSS
shadcn/ui
React Hook Form
Zod
Recharts
Lucide React
```

## Backend

```txt
Hono
TypeScript
Zod
Supabase JS Admin Client
Drizzle ORM atau SQL langsung
Pino Logger
Rate Limiter
BullMQ atau pg-boss untuk background job
```

## Database

```txt
Supabase Postgres
Supabase Auth
Supabase Storage
RLS tetap digunakan
RPC boleh digunakan untuk operasi atomik penting
```

## Deployment

```txt
apps/web      -> Vercel atau Cloudflare Pages
apps/api      -> Railway atau VPS + Coolify
apps/telefun  -> Railway atau VPS karena butuh WebSocket persistent
```

---

# 6. Struktur Monorepo Target

Gunakan struktur berikut:

```txt
trainers-superapp/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── routes/
│   │   │   ├── features/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   ├── lib/
│   │   │   └── main.tsx
│   │   └── vite.config.ts
│   │
│   ├── api/
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── modules/
│   │   │   ├── middleware/
│   │   │   ├── services/
│   │   │   ├── validators/
│   │   │   ├── jobs/
│   │   │   ├── lib/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── telefun/
│       ├── src/
│       │   ├── websocket/
│       │   ├── services/
│       │   ├── usage/
│       │   └── index.ts
│       └── package.json
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── db/
│   ├── config/
│   └── eslint-config/
│
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── policies/
│
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

---

# 7. Instruksi untuk Membaca Repo Lama

Agent wajib melakukan audit repo lama sebelum coding.

## Area yang harus dicari

Cari folder dan file terkait:

```txt
app/(main)/
app/lib/
app/actions/
app/api/
components/
services/
supabase/
apps/telefun-server/
```

Khusus SIDAK, cek:

```txt
app/(main)/qa-analyzer/
app/(main)/qa-analyzer/services/
app/(main)/qa-analyzer/services/qaService.server.ts
```

Khusus AI usage:

```txt
app/lib/ai-usage.ts
app/lib/ai-models.ts
app/actions/
apps/telefun-server/src/usage.ts
```

Khusus KETIK:

```txt
app/(main)/ketik/
app/(main)/ketik/components/ChatInterface.tsx
```

Khusus Telefun:

```txt
apps/telefun-server/
```

Khusus Supabase:

```txt
supabase/migrations/
database types
RLS policies
RPC functions
table references
```

---

# 8. Output Analisis Awal yang Wajib Dibuat Agent

Sebelum membangun kode baru, agent wajib membuat dokumen:

```txt
docs/repo-analysis.md
```

Isi minimal:

```txt
1. Daftar modul yang ditemukan di repo lama.
2. Mapping halaman lama ke halaman baru.
3. Mapping API/server actions lama ke endpoint Hono baru.
4. Mapping tabel Supabase yang digunakan.
5. Business logic penting yang harus dipertahankan.
6. Bug/technical debt yang tidak boleh dibawa.
7. Fitur yang harus diprioritaskan.
8. Risiko migrasi.
9. Rencana implementasi bertahap.
```

---

# 9. Arsitektur Backend Baru

Backend Hono menjadi pusat semua logic penting.

## Endpoint utama

```txt
/api/auth/me
/api/profile/me
/api/users
/api/roles
/api/permissions

/api/sidak/dashboard
/api/sidak/temuan
/api/sidak/agents
/api/sidak/indicators
/api/sidak/upload
/api/sidak/reports
/api/sidak/rule-versions

/api/ketik/sessions
/api/ketik/scenarios
/api/ketik/messages
/api/ketik/evaluation

/api/pdkt/threads
/api/pdkt/scenarios
/api/pdkt/messages
/api/pdkt/evaluation

/api/ai/usage
/api/ai/models
/api/ai/generate

/api/reports/individual
/api/reports/service
/api/reports/jobs

/api/admin/settings
```

## Middleware backend wajib

```txt
authMiddleware
roleMiddleware
permissionMiddleware
rateLimitMiddleware
requestLogger
errorHandler
auditLogger
```

## Prinsip keamanan backend

```txt
Jangan percaya userId dari frontend untuk operasi sensitif.
Ambil user dari Supabase session/JWT.
Validasi semua payload dengan Zod.
Gunakan admin client hanya di backend.
Jangan expose service role key ke frontend.
Semua upload Excel wajib divalidasi sebelum insert.
Semua AI usage wajib dicatat dari backend.
```

---

# 10. Arsitektur Frontend Baru

Frontend hanya mengonsumsi API backend.

## Routing utama

```txt
/login
/dashboard

/ketik
/ketik/simulation
/ketik/history

/pdkt
/pdkt/simulation
/pdkt/history

/telefun
/telefun/simulation
/telefun/history

/qa-analyzer
/qa-analyzer/dashboard
/qa-analyzer/temuan
/qa-analyzer/upload
/qa-analyzer/parameters
/qa-analyzer/reports
/qa-analyzer/reports/ai
/qa-analyzer/reports/individual/:id

/admin
/admin/users
/admin/roles
/admin/settings
/admin/ai-usage
```

## Prinsip frontend

```txt
Gunakan TanStack Router untuk route.
Gunakan TanStack Query untuk server state.
Gunakan Zustand hanya untuk UI state/local state.
Gunakan shadcn/ui untuk komponen dasar.
Gunakan Recharts untuk grafik.
Gunakan React Hook Form + Zod untuk form.
Jangan query Supabase langsung dari frontend untuk data sensitif.
```

---

# 11. SIDAK / QA Analyzer Requirement

SIDAK adalah modul penting dan harus dibangun dengan hati-hati.

## Data utama

Agent harus memetakan tabel lama seperti:

```txt
qa_temuan
qa_indicators
qa_service_rule_versions
qa_parameter_drafts
profiler_peserta
folder/periode terkait
```

Nama tabel final boleh disesuaikan, tapi jangan menghilangkan makna data lama.

## Fitur wajib SIDAK

```txt
Dashboard temuan
Filter periode
Filter layanan
Filter folder/periode upload
Filter agent
Top agents
Top indicators
Trend temuan
Pareto indicator
Zero error rate
Compliance rate
Defects per agent
Average agent score
Detail temuan per agent
```

## Catatan penting

Pastikan query berat dilakukan di backend, bukan frontend.

Untuk data besar, gunakan:

```txt
pagination
database filter sebelum pagination
stable ordering
summary table atau materialized view jika perlu
caching backend
```

Jangan ulangi bug lama: mengambil semua data lalu filter di frontend.

---

# 12. QA Upload Excel Requirement

Upload Excel harus lewat backend.

Flow:

```txt
1. User upload file.
2. Backend membaca file.
3. Backend validasi struktur kolom.
4. Backend validasi service type.
5. Backend validasi indicator_id.
6. Backend validasi agent/profiler.
7. Backend membuat preview hasil validasi.
8. User confirm import.
9. Backend insert dalam transaction.
10. Backend menulis audit log.
```

## Wajib mencegah error FK

Sebelum insert ke `qa_temuan`, backend harus memastikan:

```txt
indicator_id valid
indicator_id sesuai rule version aktif
service_type sesuai
period/folder valid
agent/profiler valid
```

Jika ada error, tampilkan pesan yang manusiawi:

```txt
"Sebagian indikator tidak ditemukan pada parameter aktif. Periksa kembali versi parameter atau mapping upload."
```

Bukan hanya error mentah PostgreSQL.

---

# 13. Rule Versioning Requirement

Sistem parameter QA harus mendukung versioning.

Status minimal:

```txt
draft
published
superseded
archived
```

Field yang disarankan:

```txt
id
service_type
version_number
status
change_reason
created_by
updated_by
published_by
published_at
superseded_at
superseded_by_version_id
created_at
updated_at
```

Publishing harus atomik.

Disarankan menggunakan RPC database:

```txt
publish_rule_version(version_id, change_reason)
```

Tujuannya agar tidak ada dua versi aktif yang konflik.

---

# 14. KETIK Requirement

KETIK adalah simulasi digital chat.

Fitur wajib:

```txt
Pilih scenario
Mulai simulasi
Chat dengan AI consumer
Timer sesi
Auto closing saat timeout
History sesi
Evaluasi hasil simulasi
Usage logging token
```

Catatan dari repo lama:

```txt
Perhatikan logic timeout di ChatInterface lama.
Jangan sampai fallback closing message yang baik ditimpa ulang oleh AI message yang awkward.
Simpan pesan sebagai struktur yang konsisten.
Pastikan session cleanup aman.
```

---

# 15. PDKT Requirement

PDKT adalah simulasi email.

Flow target:

```txt
1. Agent masuk PDKT.
2. Agent melihat daftar email/thread di panel kiri.
3. Agent membuka email di panel kanan.
4. Agent bisa create email.
5. Email yang belum dibalas tetap tersimpan.
6. Agent bisa lanjut dari thread sebelumnya.
7. Scenario bisa dipilih manual.
8. Reply dikirim ke AI consumer.
9. Evaluasi dibuat setelah thread selesai.
```

UI disarankan:

```txt
Master-detail layout
Left panel: daftar email/thread
Right panel: email viewer + compose/reply
```

---

# 16. Telefun Requirement

Telefun tetap dipisah sebagai service sendiri karena butuh WebSocket persistent.

Target:

```txt
apps/telefun
```

Fitur wajib:

```txt
WebSocket session
Voice simulation
AI consumer response
Turn-taking logic
Realtime usage logging
Session history
Evaluation
```

Catatan deployment:

```txt
Jangan deploy Telefun WebSocket persistent ke Vercel serverless.
Gunakan Railway atau VPS.
```

---

# 17. AI Usage Monitoring Requirement

Semua modul AI wajib mencatat usage.

Modul:

```txt
KETIK
PDKT
Telefun
Report AI
Admin testing
```

Data minimal:

```txt
id
user_id
module
provider
model
prompt_tokens
completion_tokens
total_tokens
input_cost
output_cost
total_cost
request_id
created_at
```

Aturan penting:

```txt
Jika pricing model tidak ditemukan, tetap catat token dengan cost 0.
Jangan drop log hanya karena pricing tidak ada.
Jangan percaya userId dari client.
Gunakan identity dari server auth.
```

---

# 18. Report AI Requirement

Report AI harus menggunakan data asli dari SIDAK dan profiler.

Wajib mengambil dari:

```txt
profiler_peserta
qa_temuan
qa_indicators
qa dashboard aggregation
```

Report tidak boleh mengarang data.

Jenis report:

```txt
Laporan individu
Laporan per layanan
Laporan periode
Laporan coaching
```

Format target:

```txt
HTML preview
PDF export
DOCX export jika memungkinkan
A4 multi-page layout
```

Untuk report berat, gunakan job queue:

```txt
POST /api/reports/jobs
GET /api/reports/jobs/:id
GET /api/reports/jobs/:id/download
```

---

# 19. Role dan Permission

Role minimal:

```txt
admin
trainer
qa
team_leader
spv
operational_manager
agent
```

Permission harus modular.

Contoh:

```txt
sidak.view
sidak.upload
sidak.manage_parameters
sidak.view_reports
ketik.use
ketik.view_history
pdkt.use
telefun.use
admin.manage_users
admin.manage_settings
ai_usage.view
```

Frontend harus menyembunyikan menu berdasarkan permission.

Backend tetap wajib melakukan enforcement permission.

---

# 20. Approval Access Flow untuk Leader

Siapkan desain untuk pembatasan akses leader.

Konsep:

```txt
Leader tidak otomatis melihat semua data.
Leader perlu approval trainer/admin untuk data peserta tertentu.
Jika approval diberikan, leader hanya melihat data peserta yang disetujui.
Untuk SIDAK, dashboard aggregate juga harus dibatasi ke peserta yang disetujui.
```

Tabel disarankan:

```txt
access_requests
access_grants
access_grant_participants
```

Status:

```txt
pending
approved
rejected
expired
revoked
```

---

# 21. Non-Functional Requirement

## Performance

Target:

```txt
Initial load cepat
Dashboard utama < 2 detik untuk data normal
Query berat wajib backend-side
Gunakan pagination
Gunakan caching untuk aggregation
Gunakan lazy loading untuk modul besar
```

## Security

```txt
Service role key hanya di backend.
RLS tetap aktif.
JWT diverifikasi di backend.
Semua endpoint sensitif wajib auth.
Semua mutation wajib permission check.
Audit log untuk upload, publish parameter, delete, dan update penting.
```

## Maintainability

```txt
Feature-based folder structure.
Shared types di packages/types.
Validation schema reusable.
API response konsisten.
Error handling konsisten.
Tidak ada business logic penting di komponen React.
```

---

# 22. Format API Response

Gunakan format konsisten:

```ts
type ApiSuccess<T> = {
  success: true
  data: T
  meta?: Record<string, unknown>
}

type ApiError = {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}
```

Contoh error:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INDICATOR_MAPPING",
    "message": "Sebagian indikator pada file upload tidak ditemukan pada parameter aktif."
  }
}
```

---

# 23. Dokumentasi yang Wajib Dibuat

Agent wajib membuat:

```txt
docs/repo-analysis.md
docs/architecture.md
docs/database-schema.md
docs/api-contract.md
docs/auth-permission.md
docs/migration-plan.md
docs/deployment.md
docs/testing-plan.md
```

---

# 24. Testing Requirement

Minimal testing:

```txt
Unit test untuk service penting
Integration test untuk API utama
Upload Excel validation test
Permission test
AI usage logging test
SIDAK aggregation test
Rule versioning test
```

Test prioritas:

```txt
Tidak boleh insert qa_temuan dengan indicator_id invalid.
Tidak boleh publish dua rule version aktif untuk service yang sama.
Tidak boleh user tanpa permission akses endpoint admin.
AI usage tetap tercatat walaupun pricing model tidak ditemukan.
Dashboard SIDAK harus menghitung data sesuai filter backend.
```

---

# 25. Tahapan Implementasi

## Phase 1 — Discovery

```txt
Clone repo lama.
Baca struktur project.
Map semua modul.
Map tabel Supabase.
Map business logic.
Tulis docs/repo-analysis.md.
```

## Phase 2 — Foundation

```txt
Setup monorepo.
Setup apps/web.
Setup apps/api.
Setup packages/ui.
Setup packages/types.
Setup packages/db.
Setup linting, formatting, env validation.
```

## Phase 3 — Auth & Layout

```txt
Implement login.
Implement session handling.
Implement /api/auth/me.
Implement role-based navigation.
Implement protected routes.
```

## Phase 4 — SIDAK Core

```txt
Implement profiler.
Implement qa indicators.
Implement qa temuan.
Implement dashboard API.
Implement filters.
Implement charts.
```

## Phase 5 — Upload Excel

```txt
Implement upload endpoint.
Implement validation preview.
Implement confirm import.
Implement transaction insert.
Implement readable error handling.
```

## Phase 6 — AI Usage

```txt
Implement model config.
Implement usage logging.
Implement rate limit.
Implement fallback pricing.
```

## Phase 7 — KETIK & PDKT

```txt
Implement scenario.
Implement simulation session.
Implement history.
Implement evaluation.
```

## Phase 8 — Report AI

```txt
Implement report data API.
Implement individual report.
Implement service report.
Implement A4 layout.
Implement export flow.
```

## Phase 9 — Telefun

```txt
Move or rebuild Telefun service.
Implement WebSocket.
Implement turn-taking.
Implement usage logging.
```

## Phase 10 — Hardening

```txt
Testing.
Performance audit.
Security audit.
Deployment.
Migration dry-run.
```

---

# 26. Anti-Hallucination Rules untuk Agent

Agent wajib mengikuti aturan berikut:

```txt
Jangan mengarang nama tabel.
Jangan mengarang kolom.
Jangan mengarang business logic.
Jika belum menemukan referensi di repo lama, tulis sebagai asumsi.
Jika ada konflik antara PRD dan repo lama, catat di docs/repo-analysis.md.
Jangan menghapus fitur lama tanpa alasan.
Jangan memindahkan semua query ke frontend.
Jangan expose Supabase service role key.
Jangan membuat endpoint tanpa validasi Zod.
Jangan membuat role check hanya di frontend.
Jangan membuat report AI yang mengarang data.
```

---

# 27. Definition of Done

Rebuild dianggap berhasil jika:

```txt
1. Repo baru dapat dijalankan secara lokal.
2. Frontend Vite dapat login dan membuka dashboard.
3. Backend Hono berjalan dan memvalidasi JWT Supabase.
4. Role-based navigation berjalan.
5. SIDAK core dapat menampilkan data dari Supabase.
6. Upload Excel memiliki validasi sebelum insert.
7. Error FK indicator dapat dicegah sebelum masuk database.
8. AI usage logging berjalan untuk semua request AI.
9. Struktur monorepo rapi dan terdokumentasi.
10. Minimal dokumentasi arsitektur dan API tersedia.
```

---

# 28. Prompt Siap Pakai untuk Agent

Kamu bisa langsung pakai prompt ini:

```txt
Kamu adalah senior full-stack engineer yang bertugas membangun ulang Trainers SuperApp dari awal.

Repo lama:
https://github.com/fajarabr76/Trainerssuperappnext

Tugas utama:
Baca repo lama secara menyeluruh, pahami semua modul, business logic, struktur data, dan technical debt. Setelah itu bangun ulang aplikasi dengan stack baru yang lebih ringan dan cepat:

Frontend:
- Vite
- React
- TypeScript
- TanStack Router
- TanStack Query
- Zustand
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- Recharts

Backend:
- Hono
- TypeScript
- Zod
- Supabase JS Admin Client
- Drizzle ORM atau SQL langsung
- Worker queue untuk proses berat

Database/Auth:
- Supabase Postgres
- Supabase Auth
- Supabase Storage
- RLS tetap aktif

Target struktur:
- apps/web
- apps/api
- apps/telefun
- packages/ui
- packages/types
- packages/db
- packages/config
- supabase/migrations
- docs

Aturan penting:
1. Repo lama adalah referensi, bukan untuk disalin mentah-mentah.
2. Jangan mengarang nama tabel, kolom, atau flow. Baca dari repo lama.
3. Jika ada informasi belum jelas, tulis sebagai asumsi di dokumentasi.
4. Semua logic penting harus berada di backend Hono.
5. Frontend tidak boleh memegang business logic sensitif.
6. Jangan query Supabase langsung dari frontend untuk data sensitif seperti SIDAK, report, upload, AI usage, role, dan permission.
7. Gunakan Supabase service role hanya di backend.
8. Semua endpoint backend wajib validasi payload dengan Zod.
9. Semua endpoint sensitif wajib auth dan permission check.
10. Semua AI usage wajib dicatat dari backend.
11. Jika pricing model tidak ditemukan, tetap catat token dengan cost 0.
12. Upload Excel SIDAK wajib validasi indicator_id, service_type, rule version, periode/folder, dan profiler sebelum insert.
13. Jangan biarkan error foreign key PostgreSQL muncul langsung ke user.
14. Rule versioning QA harus mendukung draft, published, superseded, dan archived.
15. Telefun harus tetap service terpisah karena butuh persistent WebSocket.
16. Report AI harus mengambil data asli dari profiler dan SIDAK, bukan mengarang data.
17. Buat dokumentasi sebelum implementasi besar.

Langkah kerja:
1. Clone dan audit repo lama.
2. Buat docs/repo-analysis.md.
3. Buat docs/architecture.md.
4. Buat docs/database-schema.md.
5. Buat docs/api-contract.md.
6. Buat docs/migration-plan.md.
7. Setup monorepo baru.
8. Implement apps/web dengan Vite React.
9. Implement apps/api dengan Hono.
10. Implement auth, role, permission.
11. Implement SIDAK core.
12. Implement upload Excel dengan validasi.
13. Implement AI usage logging.
14. Implement KETIK, PDKT, Report AI, dan Telefun secara bertahap.
15. Tambahkan testing untuk flow penting.

Definition of Done tahap awal:
- App dapat berjalan lokal.
- Login Supabase berjalan.
- Backend Hono dapat membaca session user.
- Role-based navigation berjalan.
- SIDAK dashboard dapat mengambil data dari backend.
- Upload Excel punya validation preview.
- AI usage logging berjalan.
- Dokumentasi tersedia di folder docs.
```

---

Menurut saya, PRD ini cocok dijadikan **instruksi utama untuk agent**. Setelah ini, kamu bisa minta agent mulai dari **Phase 1: audit repo lama dan buat `docs/repo-analysis.md` dulu**, jangan langsung coding.
