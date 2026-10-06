# Authentication & Role-Based Access Control (RBAC)

## Pengantar untuk Pengguna Umum (Human-Readable Overview)

**Apa itu Sistem Keamanan & Hak Akses (RBAC)?**
Sistem ini adalah pintu gerbang utama Trainers SuperApp yang memastikan setiap orang yang masuk ke dalam aplikasi dikenali dengan benar dan hanya bisa membuka menu atau fitur yang memang menjadi wewenangnya.

**Kegunaan dan Manfaat Langsung bagi Pengguna:**

- **Masuk dengan Mudah dan Cepat**: Pengguna bisa mendaftar atau masuk menggunakan akun email biasa ataupun **Google SSO (Single Sign-On)** hanya dengan satu klik.
- **Keamanan Data yang Terjamin**: Sistem secara otomatis menjaga agar data penting akun tidak bisa diubah sembarangan oleh pihak yang tidak bertanggung jawab.
- **Akses yang Tepat Sasaran**: Memastikan seorang Agen (peserta simulasi) tidak akan salah masuk ke halaman pengaturan manajerial, begitu pula sebaliknya.

---

## Panduan Teknis untuk Pengembang & AI Agent

Dokumen ini menjelaskan struktur teknis bagaimana sistem keamanan, pendaftaran, _auto-provisioning_ Google OAuth, dan hak akses dikelola di Trainers SuperApp (Monorepo).

## Struktur Role

Aplikasi memiliki 4 role utama dengan hierarki akses sebagai berikut:

| Role        | Deskripsi         | Hak Akses Utama                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**   | Pengelola Sistem  | Akses penuh seluruh modul, manajemen user (approve/reject/delete), audit logs, & konfigurasi sistem.                                                                                                                                                                                                                                                                                                                                     |
| **Trainer** | Operasional Utama | Manajemen data Profiler, input & setting QA (SIDAK), monitoring, editor pricing/kurs usage billing, & audit logs terbatas.                                                                                                                                                                                                                                                                                                               |
| **Leader**  | Pengawas Tim      | Melihat dashboard tim, monitoring aktivitas tim, monitoring usage billing lintas akun, melihat data Profiler.                                                                                                                                                                                                                                                                                                                            |
| **Agent**   | Pengguna Simulasi | Akses ke modul simulasi (Ketik, PDKT) dan dashboard pribadi. API Telefun dan WebRTC cleanup dibatasi admin/trainer; admission WebSocket legacy dipertahankan (JWT valid dan ownership). `agent` tidak memiliki akses ke monitoring lintas akun, tetapi tetap dapat melihat quick-view usage miliknya sendiri di modul pribadi (KETIK). PDKT menerima keempat role; template generation dan evaluasi langsung hanya admin/trainer/leader. |

> **SIDAK Heatmap** (`/sidak/heatmap` dan tab Heatmap di `/sidak/agents/$id`, endpoint `GET /api/v1/sidak/heatmap`): **admin dan trainer** melihat seluruh data; **leader** hanya agent dalam scope-nya (`getAccessibleSidakFilters` → `getLeaderScopeSnapshot`), dengan `service_type` dibatasi `allowedServices` bila `serviceTypeLocked`. Admin/trainer query memakai JWT user (`createUserClient`) sehingga RLS `read_admin_trainer` benar-benar berlaku; leader memakai service-role + filter scope app-side karena RLS memang menolak leader — jangan bergantung pada RLS untuk leader, dan jangan memberi leader akses penuh. Leader tetap harus punya modul SIDAK disetujui (tiga lapis: `nav-config`, `beforeLoad: requireCapability("sidak.view")`, dan backend `requireCapability("sidak.read")` beserta resolver scope). Nama mode `qa` di dalam API hanya menandai kolom tanggal `tanggal_sampel`; role `qa` **tidak** mendapat akses.

## Alur Pendaftaran & Approval

Untuk menjaga keamanan internal, pendaftaran user baru melalui proses approval:

1. **Registrasi**: User baru mendaftar melalui halaman auth (menggunakan Email/Password atau **Google SSO**). Registrasi email menggunakan `insert()` langsung ke `profiles` dengan status `pending`.
2. **Auto-Provisioning (Google SSO)**: Untuk pengguna yang baru pertama kali masuk menggunakan Google SSO, sistem akan otomatis membuatkan baris profil menggunakan Service Role dengan status bawaan `pending` dan role bawaan `agent`.
3. **Pending State**: Akun baru secara default memiliki status `pending`.
4. **Waiting Approval**: User `pending` akan otomatis di-redirect ke halaman "Waiting for Approval" saat mencoba masuk (`/waiting-approval`).
5. **Approval**: Admin atau Trainer menyetujui akun melalui menu "Kelola Pengguna" di Dashboard (`/dashboard/users`).
6. **Approved Access**: Setelah disetujui (`status: 'approved'`), user baru dapat mengakses dashboard dan modul sesuai role yang ditetapkan.

## Implementasi Teknis

### 1. Auth Guard

Sistem menggunakan helper untuk menjaga akses route:

- **Backend (Hono)**: Middleware chain — `authMiddleware` (JWT validation dan normalisasi role, global via app.ts) + `requireCapability()` dari katalog bersama; role tak dikenal ditolak 403.
- **Frontend (Vite)**: Route guards di TanStack Router dengan auth checks di komponen Layout (`apps/web/src/components/Layout.tsx`).
- **Auth Pages**: Komponen auth di `apps/web/src/routes/` untuk login, register, reset password.

### 2. Guard Logic — inventaris Fase 0 kontrol akses

Audit source pada **2026-10-06, HEAD `9ad7eea`**, untuk [rencana penyatuan kontrol akses](../plans/markdown/access-control-unification.md). Ini adalah matriks **perilaku source saat ini**, dengan capability **usulan**. Matriks dan rekomendasi D1–D4 disetujui Fajar pada 2026-10-06; capability telah diimplementasikan dari matriks ini. `Ya` membuktikan gate role menerima request, bukan keberhasilan operasi, izin atas setiap baris, atau bukti E2E. Query role remote telah dijalankan read-only (hasil di bawah); DB lokal juga bersih (leader 5, trainer 5). Bukti E2E dan gate akhir dicatat pada log eksekusi plan.

Inventaris AST mencatat **132 pemanggilan `requireRole` pada 18 file**: 131 gate endpoint dan satu gate induk `telefun.use("*", ...)`. Gate induk itu berlaku ke 18 endpoint Telefun. Matriks berikut memuat **162 endpoint modul**, termasuk endpoint auth-only, plus tiga endpoint akun di `app.ts`. Path matriks memakai subrouter `/v1`; `app.ts` memakai basePath `/api`, sehingga path HTTP backend dan proxy web adalah `/api/v1`.

Notasi scope:

- `all`: akses seluruh resource dalam izin operasi itu; tetap tunduk pada RLS/ownership yang ditulis pada kolom scope.
- `self (akun)`: `user_id`/creator akun pemanggil. Berbeda dari `self peserta`, yang memakai peserta tertaut lewat `profiler_peserta.trainer_id`.
- `team/none`: peserta hasil snapshot approval leader, atau hasil kosong bila belum disetujui/tidak ada peserta. Approval ini ditegakkan melalui scope; backend tidak memiliki middleware approval menyeluruh untuk seluruh metadata SIDAK/KTP.
- Shared mailbox PDKT dan arsip report merupakan resource terpisah dari scope peserta. Union `DataScope` contoh plan belum dapat menyatakan semua kontrak ini. Jangan mengubahnya menjadi owner-only atau scope tim tanpa keputusan pemilik produk.

`qa`, `tl`, `spv`, `om` dikeluarkan dari kolom empat role aplikasi; dampaknya dicatat setelah matriks. Hak empat role yang sudah nyata tetap sesuai source. Capability dengan daftar role berbeda sengaja dipisahkan, termasuk dashboard/arsip SIDAK yang menerima agent dan generator/evaluator PDKT yang menolak agent.

#### Matriks endpoint backend

`activity_logs` bersifat append-only: tidak ada endpoint DELETE untuk role mana pun (dihapus 2026-10-06, `plans/markdown/management-pages-redesign.md`). Role `authenticated` hanya punya grant `SELECT, INSERT` di tabel itu (`supabase/migrations/004_admin_core.sql`).

| Method path                                                         | Capability                     | Admin | Trainer | Leader | Agent | Scope source saat ini                                                          | Approval leader?                       | Bukti source                                         |
| ------------------------------------------------------------------- | ------------------------------ | ----- | ------- | ------ | ----- | ------------------------------------------------------------------------------ | -------------------------------------- | ---------------------------------------------------- |
| `GET /v1/admin/users`                                               | `admin.users`                  | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:31`                    |
| `PUT /v1/admin/users/:id/status`                                    | `admin.users`                  | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:46`                    |
| `PUT /v1/admin/users/:id/role`                                      | `admin.users`                  | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:77`                    |
| `DELETE /v1/admin/users/:id`                                        | `admin.users`                  | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:108`                   |
| `GET /v1/admin/access-groups`                                       | `admin.accessGroups`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:128`                   |
| `POST /v1/admin/access-groups`                                      | `admin.accessGroups`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:143`                   |
| `PUT /v1/admin/access-groups/:id`                                   | `admin.accessGroups`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:167`                   |
| `GET /v1/admin/access-groups/:id/items`                             | `admin.accessGroups`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:189`                   |
| `POST /v1/admin/access-groups/:id/items`                            | `admin.accessGroups`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:205`                   |
| `DELETE /v1/admin/access-groups/items/:itemId`                      | `admin.accessGroups`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:231`                   |
| `GET /v1/admin/access-scope-options`                                | `admin.accessGroups`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:247`                   |
| `GET /v1/admin/leader-requests/pending`                             | `admin.leaderAccess`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:263`                   |
| `GET /v1/admin/leader-requests/approved`                            | `admin.leaderAccess`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:278`                   |
| `POST /v1/admin/leader-requests/:id/approve`                        | `admin.leaderAccess`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:293`                   |
| `POST /v1/admin/leader-requests/:id/reject`                         | `admin.leaderAccess`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:316`                   |
| `POST /v1/admin/leader-requests/:id/revoke`                         | `admin.leaderAccess`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:339`                   |
| `PUT /v1/admin/leader-requests/:id/groups`                          | `admin.leaderAccess`           | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:362`                   |
| `POST /v1/admin/users/:id/reset-password`                           | `admin.users`                  | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:390`                   |
| `GET /v1/admin/activity-logs`                                       | `admin.activityLogs.read`      | Ya    | Ya      | Tidak  | Tidak | all; batas trainer terhadap admin + larangan mutasi diri tetap berlaku         | —                                      | `apps/api/src/routes/admin.ts:414`                   |
| `GET /v1/ai/models`                                                 | `ai.models.read`               | Ya    | Ya      | Ya     | Ya    | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:52`                       |
| `POST /v1/ai/generate`                                              | `ai.generate`                  | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:66`                       |
| `GET /v1/ai/usage`                                                  | `usage.read`                   | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ai.ts:112`                      |
| `GET /v1/ai/usage/summary`                                          | `usage.read`                   | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ai.ts:138`                      |
| `GET /v1/ai/monitoring/history`                                     | `monitoring.read`              | Ya    | Ya      | Ya     | Tidak | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:202`                      |
| `GET /v1/ai/monitoring/history/:module/:id/review`                  | `monitoring.read`              | Ya    | Ya      | Ya     | Tidak | all; tanda tangan recording admin/trainer saja                                 | —                                      | `apps/api/src/routes/ai.ts:225`                      |
| `DELETE /v1/ai/monitoring/history/:module/:id`                      | `monitoring.history.delete`    | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:288`                      |
| `GET /v1/ai/monitoring/aggregation`                                 | `monitoring.read`              | Ya    | Ya      | Ya     | Tidak | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:357`                      |
| `GET /v1/ai/monitoring/pricing`                                     | `monitoring.pricing.read`      | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:497`                      |
| `PUT /v1/ai/monitoring/pricing`                                     | `monitoring.pricing.write`     | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:614`                      |
| `GET /v1/ai/monitoring/billing`                                     | `monitoring.billing.read`      | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:651`                      |
| `POST /v1/ai/monitoring/billing`                                    | `monitoring.billing.write`     | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/ai.ts:674`                      |
| `GET /v1/ketik/scenarios`                                           | `ketik.use`                    | Ya    | Ya      | Ya     | Ya    | all (konfigurasi/global) atau self (generasi aktor)                            | —                                      | `apps/api/src/routes/ketik.ts:24`                    |
| `GET /v1/ketik/consumer-types`                                      | `ketik.use`                    | Ya    | Ya      | Ya     | Ya    | all (konfigurasi/global) atau self (generasi aktor)                            | —                                      | `apps/api/src/routes/ketik.ts:28`                    |
| `POST /v1/ketik/generate`                                           | `ketik.use`                    | Ya    | Ya      | Ya     | Ya    | all (konfigurasi/global) atau self (generasi aktor)                            | —                                      | `apps/api/src/routes/ketik.ts:32`                    |
| `GET /v1/ketik/settings`                                            | `ketik.settings.read`          | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ketik.ts:104`                   |
| `PUT /v1/ketik/templates`                                           | `ketik.templates.shared.write` | Ya    | Tidak   | Tidak  | Tidak | all (konfigurasi/global) atau self (generasi aktor)                            | —                                      | `apps/api/src/routes/ketik.ts:122`                   |
| `PUT /v1/ketik/settings`                                            | `ketik.settings.write`         | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ketik.ts:164`                   |
| `GET /v1/ketik/history`                                             | `ketik.history.read`           | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ketik.ts:204`                   |
| `POST /v1/ketik/history`                                            | `ketik.history.write`          | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ketik.ts:220`                   |
| `DELETE /v1/ketik/history`                                          | `ketik.history.delete`         | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ketik.ts:265`                   |
| `DELETE /v1/ketik/history/:id`                                      | `ketik.history.delete`         | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ketik.ts:281`                   |
| `GET /v1/ketik/review/:sessionId`                                   | `ketik.review.read`            | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ketik.ts:298`                   |
| `POST /v1/ketik/review`                                             | `ketik.review`                 | Ya    | Ya      | Tidak  | Tidak | self (sesi akun)                                                               | —                                      | `apps/api/src/routes/ketik.ts:327`                   |
| `GET /v1/ketik/review/status/:sessionId`                            | `ketik.review.read`            | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/ketik.ts:490`                   |
| `GET /v1/ketik/worker`                                              | `ketik.worker.process`         | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/global) atau self (generasi aktor)                            | —                                      | `apps/api/src/routes/ketik.ts:517`                   |
| `GET /v1/pdkt/history`                                              | `pdkt.history.read`            | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/pdkt/history.ts:14`             |
| `GET /v1/pdkt/history/eval/:id`                                     | `pdkt.history.read`            | Ya    | Ya      | Ya     | Ya    | RLS + shared-mailbox fallback                                                  | —                                      | `apps/api/src/routes/pdkt/history.ts:48`             |
| `POST /v1/pdkt/history/retry-eval`                                  | `pdkt.history.retry`           | Ya    | Ya      | Ya     | Ya    | RLS + shared-mailbox fallback                                                  | —                                      | `apps/api/src/routes/pdkt/history.ts:107`            |
| `DELETE /v1/pdkt/history`                                           | `pdkt.history.delete`          | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/pdkt/history.ts:200`            |
| `DELETE /v1/pdkt/history/:id`                                       | `pdkt.history.delete`          | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/pdkt/history.ts:222`            |
| `GET /v1/pdkt/mailbox`                                              | `pdkt.mailbox.read`            | Ya    | Ya      | Ya     | Ya    | all (shared, RLS/RPC); participant reply admin/trainer                         | —                                      | `apps/api/src/routes/pdkt/mailbox.ts:40`             |
| `GET /v1/pdkt/mailbox/:id`                                          | `pdkt.mailbox.read`            | Ya    | Ya      | Ya     | Ya    | all (shared, RLS/RPC); participant reply admin/trainer                         | —                                      | `apps/api/src/routes/pdkt/mailbox.ts:60`             |
| `POST /v1/pdkt/mailbox/batch`                                       | `pdkt.mailbox.create`          | Ya    | Ya      | Ya     | Ya    | all (shared, RLS/RPC); participant reply admin/trainer                         | —                                      | `apps/api/src/routes/pdkt/mailbox.ts:89`             |
| `DELETE /v1/pdkt/mailbox/:id`                                       | `pdkt.mailbox.delete`          | Ya    | Ya      | Ya     | Ya    | all (shared, RLS/RPC); delete admin/trainer atau creator                       | —                                      | `apps/api/src/routes/pdkt/mailbox.ts:162`            |
| `POST /v1/pdkt/mailbox/batch-delete`                                | `pdkt.mailbox.delete`          | Ya    | Ya      | Ya     | Ya    | all (shared, RLS/RPC); delete admin/trainer atau creator                       | —                                      | `apps/api/src/routes/pdkt/mailbox.ts:183`            |
| `POST /v1/pdkt/mailbox/reply`                                       | `pdkt.mailbox.reply`           | Ya    | Ya      | Ya     | Ya    | all (shared, RLS/RPC); participant reply admin/trainer                         | —                                      | `apps/api/src/routes/pdkt/mailbox.ts:209`            |
| `POST /v1/pdkt/mailbox/evaluate`                                    | `pdkt.evaluate`                | Ya    | Ya      | Ya     | Tidak | input aktor (evaluasi langsung), bukan query mailbox                           | —                                      | `apps/api/src/routes/pdkt/mailbox.ts:271`            |
| `GET /v1/pdkt/settings`                                             | `pdkt.settings.read`           | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/pdkt/settings.ts:12`            |
| `POST /v1/pdkt/settings`                                            | `pdkt.settings.write`          | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/pdkt/settings.ts:42`            |
| `GET /v1/pdkt/scenarios`                                            | `pdkt.use`                     | Ya    | Ya      | Ya     | Ya    | all (katalog) / input aktor                                                    | —                                      | `apps/api/src/routes/pdkt/simulation.ts:35`          |
| `GET /v1/pdkt/consumer-types`                                       | `pdkt.use`                     | Ya    | Ya      | Ya     | Ya    | all (katalog) / input aktor                                                    | —                                      | `apps/api/src/routes/pdkt/simulation.ts:44`          |
| `POST /v1/pdkt/generate-identity`                                   | `pdkt.use`                     | Ya    | Ya      | Ya     | Ya    | all (katalog) / input aktor                                                    | —                                      | `apps/api/src/routes/pdkt/simulation.ts:52`          |
| `POST /v1/pdkt/generate-template`                                   | `pdkt.templates.generate`      | Ya    | Ya      | Ya     | Tidak | all (katalog) / input aktor                                                    | —                                      | `apps/api/src/routes/pdkt/simulation.ts:63`          |
| `POST /v1/pdkt/session/init`                                        | `pdkt.use`                     | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/pdkt/simulation.ts:106`         |
| `POST /v1/pdkt/session/create`                                      | `pdkt.use`                     | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/routes/pdkt/simulation.ts:202`         |
| `GET /v1/profiler/years`                                            | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:20`                 |
| `POST /v1/profiler/years`                                           | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:26`                 |
| `DELETE /v1/profiler/years/:id`                                     | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:50`                 |
| `GET /v1/profiler/folders`                                          | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:72`                 |
| `POST /v1/profiler/folders`                                         | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:82`                 |
| `PUT /v1/profiler/folders/:id`                                      | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:110`                |
| `DELETE /v1/profiler/folders/:id`                                   | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:133`                |
| `POST /v1/profiler/folders/duplicate`                               | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:154`                |
| `GET /v1/profiler/counts`                                           | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:189`                |
| `GET /v1/profiler/peserta`                                          | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:200`                |
| `GET /v1/profiler/peserta/global-pool`                              | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:232`                |
| `GET /v1/profiler/peserta/upcoming-birthdays`                       | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:246`                |
| `GET /v1/profiler/peserta/batch/:batchName`                         | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:257`                |
| `GET /v1/profiler/peserta/options`                                  | `simulation.subject.select`    | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:268`                |
| `GET /v1/profiler/peserta/:id`                                      | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:301`                |
| `POST /v1/profiler/peserta`                                         | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:319`                |
| `PUT /v1/profiler/peserta/:id`                                      | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:383`                |
| `DELETE /v1/profiler/peserta/:id`                                   | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:405`                |
| `POST /v1/profiler/peserta/bulk`                                    | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:426`                |
| `POST /v1/profiler/peserta/copy`                                    | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:464`                |
| `POST /v1/profiler/peserta/move`                                    | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:494`                |
| `PUT /v1/profiler/peserta/reorder`                                  | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:534`                |
| `POST /v1/profiler/peserta/bulk-reorder`                            | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:560`                |
| `GET /v1/profiler/teams`                                            | `profiler.read`                | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none                                            | scope ktp; bukan middleware approval   | `apps/api/src/routes/profiler.ts:601`                |
| `POST /v1/profiler/teams`                                           | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:607`                |
| `DELETE /v1/profiler/teams/:id`                                     | `profiler.write`               | Ya    | Ya      | Tidak  | Tidak | all                                                                            | —                                      | `apps/api/src/routes/profiler.ts:636`                |
| `GET /v1/sidak/periods`                                             | `sidak.config.read`            | Ya    | Ya      | Ya     | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/core.ts:22`               |
| `POST /v1/sidak/periods`                                            | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/core.ts:31`               |
| `DELETE /v1/sidak/periods/:id`                                      | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/core.ts:66`               |
| `GET /v1/sidak/resolved-input-config`                               | `sidak.config.read`            | Ya    | Ya      | Ya     | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/core.ts:90`               |
| `GET /v1/sidak/indicators`                                          | `sidak.config.read`            | Ya    | Ya      | Ya     | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/core.ts:146`              |
| `POST /v1/sidak/indicators`                                         | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/core.ts:156`              |
| `GET /v1/sidak/folders`                                             | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/core.ts:195`              |
| `GET /v1/sidak/folders/:folder/agents`                              | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/core.ts:209`              |
| `GET /v1/sidak/agents`                                              | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/dashboard.ts:27`          |
| `GET /v1/sidak/agents/:id/quickview`                                | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/dashboard.ts:52`          |
| `GET /v1/sidak/agents/:id`                                          | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/dashboard.ts:116`         |
| `GET /v1/sidak/dashboard`                                           | `sidak.dashboard.read`         | Ya    | Ya      | Ya     | Ya    | admin/trainer all; leader team/none; agent self peserta/none                   | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/dashboard.ts:171`         |
| `POST /v1/sidak/dashboard/refresh-summary`                          | `sidak.summary.refresh`        | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/dashboard.ts:216`         |
| `POST /v1/sidak/dashboard/forecast`                                 | `sidak.forecast.generate`      | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/dashboard.ts:253`         |
| `GET /v1/sidak/dashboard/available-years`                           | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/dashboard.ts:336`         |
| `GET /v1/sidak/dashboard/trend`                                     | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/dashboard.ts:362`         |
| `GET /v1/sidak/service-weights`                                     | `sidak.config.read`            | Ya    | Ya      | Ya     | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/dashboard.ts:415`         |
| `PUT /v1/sidak/service-weights/:serviceType`                        | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/dashboard.ts:424`         |
| `GET /v1/sidak/ranking`                                             | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/dashboard.ts:462`         |
| `POST /v1/sidak/forecast/agents`                                    | `sidak.forecast.generate`      | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/forecast.ts:20`           |
| `GET /v1/sidak/heatmap`                                             | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/heatmap.ts:28`            |
| `GET /v1/sidak/jadwal-shifting`                                     | `sidak.schedule.read`          | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/jadwal-shifting.ts:110`   |
| `GET /v1/sidak/jadwal-shifting/month`                               | `sidak.schedule.read`          | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/jadwal-shifting.ts:135`   |
| `POST /v1/sidak/reports/data`                                       | `sidak.reports.generate`       | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/reports.ts:16`            |
| `POST /v1/sidak/reports/ai/generate`                                | `sidak.reports.generate`       | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/reports.ts:62`            |
| `POST /v1/sidak/reports/ai/export-docx`                             | `sidak.reports.generate`       | Ya    | Ya      | Ya     | Tidak | input aktor; arsip baru self (akun)                                            | tidak (gate role)                      | `apps/api/src/routes/sidak/reports.ts:102`           |
| `POST /v1/sidak/reports/ai/export-html`                             | `sidak.reports.generate`       | Ya    | Ya      | Ya     | Tidak | input aktor; arsip baru self (akun)                                            | tidak (gate role)                      | `apps/api/src/routes/sidak/reports.ts:165`           |
| `POST /v1/sidak/reports/ai/chart-data`                              | `sidak.reports.generate`       | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/reports.ts:217`           |
| `POST /v1/sidak/reports/ai/save`                                    | `sidak.reports.generate`       | Ya    | Ya      | Ya     | Tidak | input aktor; arsip baru self (akun)                                            | tidak (gate role)                      | `apps/api/src/routes/sidak/reports.ts:266`           |
| `GET /v1/sidak/reports/archives`                                    | `sidak.archives.read`          | Ya    | Ya      | Ya     | Ya    | admin/trainer all; leader/agent self (akun)                                    | tidak                                  | `apps/api/src/routes/sidak/reports.ts:313`           |
| `GET /v1/sidak/reports/archives/:id`                                | `sidak.archives.read`          | Ya    | Ya      | Ya     | Ya    | admin/trainer all; leader/agent self (akun)                                    | tidak                                  | `apps/api/src/routes/sidak/reports.ts:327`           |
| `DELETE /v1/sidak/reports/archives/:id`                             | `sidak.archives.delete`        | Ya    | Ya      | Ya     | Ya    | admin/trainer all; leader/agent self (akun)                                    | tidak                                  | `apps/api/src/routes/sidak/reports.ts:355`           |
| `POST /v1/sidak/reports/ai/export-pdf`                              | `sidak.reports.generate`       | Ya    | Ya      | Ya     | Tidak | input aktor; arsip baru self (akun)                                            | tidak (gate role)                      | `apps/api/src/routes/sidak/reports.ts:374`           |
| `GET /v1/sidak/rule-versions`                                       | `sidak.config.read`            | Ya    | Ya      | Ya     | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:13`      |
| `GET /v1/sidak/rule-versions/meta`                                  | `sidak.config.read`            | Ya    | Ya      | Ya     | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:35`      |
| `POST /v1/sidak/rule-versions`                                      | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:62`      |
| `PUT /v1/sidak/rule-versions/:id`                                   | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:118`     |
| `DELETE /v1/sidak/rule-versions/:id`                                | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:165`     |
| `POST /v1/sidak/rule-versions/:id/publish`                          | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:197`     |
| `POST /v1/sidak/rule-versions/:id/supersede`                        | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:250`     |
| `GET /v1/sidak/rule-versions/:id/indicators`                        | `sidak.config.read`            | Ya    | Ya      | Ya     | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:301`     |
| `POST /v1/sidak/rule-versions/:id/indicators`                       | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:321`     |
| `DELETE /v1/sidak/rule-versions/:versionId/indicators/:indicatorId` | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:380`     |
| `PUT /v1/sidak/rule-versions/:versionId/indicators/:indicatorId`    | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/rule-versions.ts:408`     |
| `GET /v1/sidak/agents/:id/simulations`                              | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/simulations.ts:67`        |
| `GET /v1/sidak/agents/:id/simulations/:module/:historyId`           | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/simulations.ts:135`       |
| `GET /v1/sidak/temuan`                                              | `sidak.read`                   | Ya    | Ya      | Ya     | Tidak | admin/trainer all; leader team/none (ID peserta; filter layanan sesuai caller) | scope sidak; bukan middleware approval | `apps/api/src/routes/sidak/temuan.ts:17`             |
| `POST /v1/sidak/temuan/batch`                                       | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/temuan.ts:44`             |
| `POST /v1/sidak/temuan/batch/preview`                               | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/temuan.ts:77`             |
| `PUT /v1/sidak/temuan/:id`                                          | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/temuan.ts:111`            |
| `DELETE /v1/sidak/temuan/:id`                                       | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/temuan.ts:140`            |
| `POST /v1/sidak/temuan/perfect-session`                             | `sidak.write`                  | Ya    | Ya      | Tidak  | Tidak | all (konfigurasi/operasi global)                                               | tidak (gate role)                      | `apps/api/src/routes/sidak/temuan.ts:160`            |
| `GET /v1/telefun/annotations/:id`                                   | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/annotations.ts:40`      |
| `POST /v1/telefun/annotations/:id`                                  | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/annotations.ts:100`     |
| `DELETE /v1/telefun/annotations/:annotationId`                      | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/annotations.ts:187`     |
| `POST /v1/telefun/annotations/generate/:id`                         | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/annotations.ts:301`     |
| `GET /v1/telefun/capabilities`                                      | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/capabilities.ts:25`     |
| `POST /v1/telefun/finalize-recording`                               | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | self (akun/sesi), termasuk admin/trainer                                       | —                                      | `apps/api/src/routes/telefun/recordings.ts:171`      |
| `GET /v1/telefun/recording/:id`                                     | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | self (akun/sesi), termasuk admin/trainer                                       | —                                      | `apps/api/src/routes/telefun/recordings.ts:382`      |
| `POST /v1/telefun/score/:id`                                        | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | self (akun/sesi), termasuk admin/trainer                                       | —                                      | `apps/api/src/routes/telefun/recordings.ts:464`      |
| `GET /v1/telefun/coaching-summary/:id`                              | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/recordings.ts:964`      |
| `POST /v1/telefun/remux-recording/:sessionId`                       | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | self (akun/sesi), termasuk admin/trainer                                       | —                                      | `apps/api/src/routes/telefun/remux-recording.ts:203` |
| `GET /v1/telefun/sessions`                                          | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/sessions.ts:285`        |
| `POST /v1/telefun/sessions`                                         | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/sessions.ts:382`        |
| `PATCH /v1/telefun/sessions/:id`                                    | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | self (akun/sesi), termasuk admin/trainer                                       | —                                      | `apps/api/src/routes/telefun/sessions.ts:561`        |
| `GET /v1/telefun/history/:id`                                       | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/sessions.ts:696`        |
| `DELETE /v1/telefun/history/:id`                                    | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | all admin/trainer; owner guard inline tetap berlaku                            | —                                      | `apps/api/src/routes/telefun/sessions.ts:752`        |
| `DELETE /v1/telefun/history`                                        | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | self (akun/sesi), termasuk admin/trainer                                       | —                                      | `apps/api/src/routes/telefun/sessions.ts:834`        |
| `GET /v1/telefun/settings`                                          | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | self (akun), termasuk admin/trainer                                            | —                                      | `apps/api/src/routes/telefun/settings.ts:132`        |
| `PUT /v1/telefun/settings`                                          | `telefun.use`                  | Ya    | Ya      | Tidak  | Tidak | self (akun), termasuk admin/trainer                                            | —                                      | `apps/api/src/routes/telefun/settings.ts:181`        |
| `GET /v1/me/access-status`                                          | `account.accessStatus.read`    | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/app.ts:133`                            |
| `GET /v1/me`                                                        | `account.read`                 | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/app.ts:151`                            |
| `POST /v1/me/revoke-sessions`                                       | `account.sessions.revoke`      | Ya    | Ya      | Ya     | Ya    | self (akun)                                                                    | —                                      | `apps/api/src/app.ts:156`                            |

Gate induk Telefun: `apps/api/src/routes/telefun.ts:15`, capability usulan `telefun.use`, admin/trainer saja. Karena itu seluruh pengecekan `isManager` yang masih menyebut `qa` di subrouter **tidak memberikan akses qa** lewat mount produksi. Matriks E2E harus mount facade Telefun, bukan hanya subrouter, agar tidak membuktikan hak palsu.

#### Router web (seluruh 48 deklarasi route)

`Ya` di tabel ini berlaku terhadap **beforeLoad** saat profil valid, bukan akses backend. `—` menandai redirect/halaman auth tanpa gate role di deklarasi itu. Layout dan `LeaderAccessGate` tetap perlu dikarakterisasi terpisah.

| Path                         | Capability / tindakan          | Admin | Trainer | Leader | Agent | Approval leader di beforeLoad? | Bukti source                  |
| ---------------------------- | ------------------------------ | ----- | ------- | ------ | ----- | ------------------------------ | ----------------------------- |
| `/`                          | `layout only`                  | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:63`  |
| `/dashboard`                 | `dashboard.view`               | Ya    | Ya      | Ya     | Ya    | —                              | `apps/web/src/router.tsx:69`  |
| `/dashboard/users`           | `admin.users`                  | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:76`  |
| `/dashboard/access-groups`   | `admin.accessGroups`           | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:83`  |
| `/dashboard/access-approval` | `admin.leaderAccess`           | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:90`  |
| `/dashboard/activities`      | `admin.activityLogs.read`      | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:97`  |
| `/profiler`                  | `profiler.landing`             | Ya    | Ya      | Ya     | Tidak | tidak                          | `apps/web/src/router.tsx:125` |
| `/profiler/table`            | `profiler.view`                | Ya    | Ya      | Ya     | Tidak | ktp                            | `apps/web/src/router.tsx:132` |
| `/profiler/slides`           | `redirect → /profiler`         | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:143` |
| `/profiler/analytics`        | `redirect → /profiler`         | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:149` |
| `/profiler/export`           | `redirect → /profiler`         | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:155` |
| `/profiler/add`              | `profiler.view`                | Ya    | Ya      | Ya     | Tidak | ktp                            | `apps/web/src/router.tsx:161` |
| `/profiler/import`           | `profiler.view`                | Ya    | Ya      | Ya     | Tidak | ktp                            | `apps/web/src/router.tsx:172` |
| `/profiler/teams`            | `profiler.view`                | Ya    | Ya      | Ya     | Tidak | ktp                            | `apps/web/src/router.tsx:183` |
| `/sidak`                     | `sidak.landing`                | Ya    | Ya      | Ya     | Tidak | tidak                          | `apps/web/src/router.tsx:194` |
| `/sidak/dashboard`           | `sidak.view`                   | Ya    | Ya      | Ya     | Tidak | sidak                          | `apps/web/src/router.tsx:201` |
| `/sidak/forecast`            | `sidak.view`                   | Ya    | Ya      | Ya     | Tidak | sidak                          | `apps/web/src/router.tsx:212` |
| `/sidak/input`               | `sidak.config.manage`          | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:223` |
| `/sidak/ranking`             | `sidak.view`                   | Ya    | Ya      | Ya     | Tidak | sidak                          | `apps/web/src/router.tsx:230` |
| `/sidak/settings`            | `sidak.config.manage`          | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:241` |
| `/sidak/periods`             | `sidak.config.manage`          | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:248` |
| `/sidak/heatmap`             | `sidak.view`                   | Ya    | Ya      | Ya     | Tidak | sidak                          | `apps/web/src/router.tsx:255` |
| `/sidak/jadwal-shifting`     | `sidak.schedule.read`          | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:268` |
| `/sidak/agents`              | `sidak.view`                   | Ya    | Ya      | Ya     | Tidak | sidak                          | `apps/web/src/router.tsx:329` |
| `/sidak/agents/$id`          | `sidak.view`                   | Ya    | Ya      | Ya     | Tidak | sidak                          | `apps/web/src/router.tsx:340` |
| `/sidak/reports`             | `sidak.reports.view`           | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:351` |
| `/sidak/reports-data`        | `sidak.reports.view`           | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:358` |
| `/sidak/reports-ai`          | `sidak.reports.view`           | Ya    | Ya      | Tidak  | Tidak | tidak                          | `apps/web/src/router.tsx:365` |
| `/ketik`                     | `ketik.landing`                | Ya    | Ya      | Ya     | Ya    | —                              | `apps/web/src/router.tsx:372` |
| `/ketik/simulation`          | `redirect → /ketik`            | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:379` |
| `/ketik/history`             | `redirect → /ketik`            | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:387` |
| `/pdkt`                      | `pdkt.use`                     | Ya    | Ya      | Ya     | Ya    | tidak                          | `apps/web/src/router.tsx:395` |
| `/pdkt/simulation`           | `pdkt.use`                     | Ya    | Ya      | Ya     | Ya    | tidak                          | `apps/web/src/router.tsx:402` |
| `/pdkt/history`              | `pdkt.use`                     | Ya    | Ya      | Ya     | Ya    | tidak                          | `apps/web/src/router.tsx:409` |
| `/monitoring`                | `monitoring.read`              | Ya    | Ya      | Ya     | Tidak | tidak                          | `apps/web/src/router.tsx:416` |
| `/telefun`                   | `telefun.landing`              | Ya    | Ya      | Ya     | Ya    | —                              | `apps/web/src/router.tsx:423` |
| `/telefun/replay/$id`        | `telefun.landing`              | Ya    | Ya      | Ya     | Ya    | —                              | `apps/web/src/router.tsx:430` |
| `/account`                   | `account.read`                 | Ya    | Ya      | Ya     | Ya    | —                              | `apps/web/src/router.tsx:437` |
| `/waiting-approval`          | `guardWaitingApproval`         | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:472` |
| `/reset-password`            | `guardResetPassword`           | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:479` |
| `/auth/callback`             | `layout only`                  | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:486` |
| `/unauthorized`              | `layout only`                  | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:492` |
| `/qa-analyzer`               | `redirect → /sidak`            | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:588` |
| `/qa-analyzer/$`             | `redirect → /sidak`            | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:596` |
| `/dashboard/monitoring`      | `redirect → /monitoring`       | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:604` |
| `/profiler/download`         | `redirect → /profiler`         | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:612` |
| `/pending`                   | `redirect → /waiting-approval` | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:618` |
| `/preview/profiler-slides`   | `redirect → /profiler`         | —     | —       | —      | —     | —                              | `apps/web/src/router.tsx:626` |

Perbedaan UI/API yang wajib dipertahankan atau diputuskan eksplisit:

- `/telefun` dan `/telefun/replay/$id` hanya `requireAuth()`; nav, Layout warning dan API membatasi admin/trainer. Gunakan capability landing empat role terpisah dari `telefun.use`, atau minta keputusan untuk mengubah redirect/UX.
- `/profiler/add`, `/profiler/import`, `/profiler/teams` menerima leader setelah approval di beforeLoad; API tulis tetap admin/trainer. Menggantinya dengan `profiler.write` akan mempersempit route web leader.
- Halaman report SIDAK dan nav report hanya admin/trainer; API report generate/export menerima leader, API arsip juga menerima agent. Capability `sidak.reports.view`, `sidak.reports.generate`, `sidak.archives.read/delete` perlu dipisah.
- SIDAK dashboard API menerima agent (peserta sendiri), sedangkan router web `/sidak/dashboard` menolak agent. `sidak.dashboard.read` berbeda dari `sidak.view`.
- Endpoint metadata SIDAK (periods, indicators, rule versions, service weights) tidak memanggil snapshot leader. Menambahkan approval backend menyeluruh akan mempersempit hak yang sekarang diterima gate role.

#### Cek inline, service, dan komposisi nav

| Permukaan                                              | Perilaku sekarang / capability usulan                                                                                                                                                                                                                                     | Bukti                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Monitoring signed recording                            | Admin/trainer bisa tanda tangan lintas akun; leader bisa membaca review tanpa signed URL; `monitoring.recording.sign`                                                                                                                                                     | `apps/api/src/routes/ai.ts:48`, `:251`                                                                                           |
| Telefun list/detail/delete manager                     | `admin/trainer/qa` inline; effective produksi admin/trainer oleh parent; `telefun.manage`                                                                                                                                                                                 | `apps/api/src/routes/telefun/sessions.ts:291`, `:720`, `:777`                                                                    |
| Telefun annotation read/create/delete/generate manager | Sama; parent menolak qa; `telefun.manage`                                                                                                                                                                                                                                 | `apps/api/src/routes/telefun/annotations.ts:64`, `:142`, `:211`, `:323`                                                          |
| Telefun recording lintas akun                          | Admin/trainer; `telefun.recording.read`                                                                                                                                                                                                                                   | `apps/api/src/routes/telefun/recordings.ts:406`                                                                                  |
| Telefun coaching manager                               | `admin/trainer/qa` inline, parent admin/trainer; `telefun.manage`                                                                                                                                                                                                         | `apps/api/src/routes/telefun/recordings.ts:988`                                                                                  |
| Archive report                                         | Admin/trainer/qa all; leader/agent self akun. Parent route tidak menerima qa; `sidak.archives.manageAll`                                                                                                                                                                  | `apps/api/src/services/sidak/report-archives.ts:4`, `:46`, `:69`, `:86`                                                          |
| Atribusi peserta                                       | Admin/trainer saja; self semua aktor valid; `simulation.subject.select`                                                                                                                                                                                                   | `apps/api/src/services/simulation-subject-service.ts:40`, `:114`                                                                 |
| PDKT delete mailbox                                    | Admin/trainer atau creator; list/detail shared via JWT/RLS; `pdkt.mailbox.manageAll` + ownership                                                                                                                                                                          | `apps/api/src/services/pdkt/mailbox-service.ts:17`, `:114`, `:239`, `:273`                                                       |
| Admin mutasi user                                      | Trainer tidak boleh menyentuh akun admin/promosi admin; semua caller dilarang mutasi akun sendiri; katalog gate tidak menggantikan validasi target                                                                                                                        | `apps/api/src/services/admin-service.ts:67`, `:106`, `:116`, `:152`                                                              |
| Telefun WebRTC cleanup                                 | Profile aktif, role admin/trainer (alias trainers), sesi owned/historical; start sudah retired; `telefun.cleanup`                                                                                                                                                         | `apps/telefun/src/realtime-webrtc/broker-auth.ts:103`, `:144`                                                                    |
| Telefun WebSocket legacy — **S5**                      | `verifyToken` hanya memvalidasi JWT; tanpa sessionId, `createSession(userId)` memeriksa status tetapi tidak role untuk self. Dengan sessionId, lookup hanya ownership. Gate participant admin/trainer ada terpisah. Harus diputuskan sebelum normalisasi/gate menyeluruh. | `apps/telefun/src/server-auth.ts:64`, `apps/telefun/src/db.ts:54`, `:88`, `:296`, `apps/telefun/src/auth.ts:6`                   |
| SIDAK/Profiler scope                                   | Duplikat admin/trainer all, agent peserta tertaut, leader snapshot per modul                                                                                                                                                                                              | `apps/api/src/services/sidak/access-scope.ts:146`, `:169`, `apps/api/src/services/profiler-service.ts:28`                        |
| SIDAK simulation read/recording                        | Admin/trainer seluruh modul; leader peserta+layanan approved; gagal snapshot 503                                                                                                                                                                                          | `apps/api/src/services/sidak/simulation-access.ts:58`, `:67`, `:82`                                                              |
| Nav modul dasar                                        | PDKT empat role; Telefun admin/trainer; KTP/SIDAK admin/trainer/leader                                                                                                                                                                                                    | `apps/web/src/lib/app-config.ts:60`, `:73`, `:86`, `:99`                                                                         |
| Nav SIDAK                                              | Reports/input/periods/schedule/settings admin/trainer; heatmap admin/trainer/leader                                                                                                                                                                                       | `apps/web/src/components/layout/nav-config.ts:19`, `:27`, `:32`, `:37`, `:45`, `:50`                                             |
| Nav management                                         | Users/approval/groups/activities admin/trainer; monitoring juga leader                                                                                                                                                                                                    | `apps/web/src/components/layout/nav-config.ts:59`, `:65`, `:71`, `:77`, `:83`                                                    |
| Konsumen nav                                           | Sidebar, drawer, mobile tabs dan dashboard membaca daftar role; semua perlu katalog bersama                                                                                                                                                                               | `apps/web/src/components/layout/Sidebar.tsx`, `MobileDrawer.tsx`, `MobileTabBar.tsx:20`, `apps/web/src/routes/dashboard.tsx:139` |
| Layout/warning Telefun                                 | Admin/trainer/trainers auto-grant dan bypass warning                                                                                                                                                                                                                      | `apps/web/src/components/Layout.tsx:34`, `:44`, `:58`, `apps/web/src/routes/telefun/components/MaintenanceModal.tsx:28`          |
| Profiler UI write                                      | Leader/qa read-only; missing profile fallback trainer. Fail-closed adalah perubahan sengaja, harus RED                                                                                                                                                                    | `apps/web/src/hooks/useProfilerAccess.ts:3`, `:12`                                                                               |
| KETIK UI review/peserta                                | Review admin/trainer/qa; picker admin/trainer                                                                                                                                                                                                                             | `apps/web/src/routes/ketik/index.tsx:44`, `:46`                                                                                  |
| PDKT/Telefun picker                                    | Admin/trainer; `simulation.subject.select`                                                                                                                                                                                                                                | `apps/web/src/routes/pdkt/index.tsx:96`, `apps/web/src/routes/telefun/index.tsx:134`                                             |
| Dashboard/SIDAK cards                                  | Manager admin/trainer; leader analytics; agent personal                                                                                                                                                                                                                   | `apps/web/src/routes/dashboard.tsx:130`, `apps/web/src/routes/sidak/index.tsx:73`                                                |
| Monitoring pricing UI                                  | Admin/trainer editor, leader read-only monitoring                                                                                                                                                                                                                         | `apps/web/src/routes/monitoring/MonitoringPage.tsx:23`                                                                           |
| User role options                                      | Trainer hanya agent/leader/trainer; admin empat role; unknown target saat ini default agent                                                                                                                                                                               | `apps/web/src/routes/dashboard/users.tsx:25`, `:31`, `:67`                                                                       |
| LeaderAccessGate                                       | Admin/trainer bypass; agent passthrough; leader approval; unknown ditolak                                                                                                                                                                                                 | `apps/web/src/components/LeaderAccessGate.tsx:95`                                                                                |

#### Dampak penghapusan role lama (D1/D4 disetujui, belum diimplementasikan)

| Gate terdampak                       | Hak empat role setelah penghapusan saja | Dampak nilai lama       | Keputusan |
| ------------------------------------ | --------------------------------------- | ----------------------- | --------- |
| `POST /v1/ai/generate`               | admin, trainer                          | qa ditolak              | D1        |
| `POST /v1/ketik/generate`            | admin, trainer, leader, agent           | qa, tl, spv, om ditolak | D1        |
| `POST /v1/ketik/review`              | admin, trainer                          | qa ditolak              | D1        |
| `GET /v1/ketik/worker`               | admin, trainer                          | qa ditolak              | D1        |
| `GET /v1/pdkt/history`               | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `GET /v1/pdkt/history/eval/:id`      | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `POST /v1/pdkt/history/retry-eval`   | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `DELETE /v1/pdkt/history`            | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `DELETE /v1/pdkt/history/:id`        | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `GET /v1/pdkt/mailbox`               | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `GET /v1/pdkt/mailbox/:id`           | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `POST /v1/pdkt/mailbox/batch`        | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `DELETE /v1/pdkt/mailbox/:id`        | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `POST /v1/pdkt/mailbox/batch-delete` | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `POST /v1/pdkt/mailbox/reply`        | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `GET /v1/pdkt/settings`              | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `POST /v1/pdkt/settings`             | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `GET /v1/pdkt/scenarios`             | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `GET /v1/pdkt/consumer-types`        | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `POST /v1/pdkt/generate-identity`    | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `POST /v1/pdkt/session/init`         | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |
| `POST /v1/pdkt/session/create`       | admin, trainer, leader, agent           | tl, spv, om ditolak     | D4        |

Pengecekan inline manager Telefun dan `REPORT_ADMIN_ROLES` juga kehilangan literal qa, tetapi qa sudah ditolak facade produksi. Policy DB Telefun yang menyebut qa tetap perlu migrasi baru; perubahan RLS belum dieksekusi. Jabatan peserta, mode tanggal SIDAK `qa/agent`, speaker transcript `agent/consumer`, role pesan AI `user/system` dan kolom WFM `tl` bukan role aplikasi.

**Keputusan Fajar, 2026-10-06:** matriks dan D1–D4 disetujui: leader tidak mendapat hak manager baru; default agent hanya setelah distribusi DB bersih; alias ditahan sampai distribusi DB diketahui; kepemilikan akun + shared mailbox/RLS dipertahankan. Scope peserta dipisahkan dari ownership akun/shared. S5: admission WebSocket legacy dipertahankan. Query read-only lokal diizinkan tetapi koneksi gagal `ECONNREFUSED`; daemon Docker/OrbStack belum tersedia, sehingga SQL belum berjalan. Pada instruksi lanjutan, Fajar meminta pemeriksaan mandiri; query read-only remote berhasil pada project yang cocok dengan repo (`ruosnjmtywcrghjgqugz`): admin 3, trainer 3, leader 2, agent 14 (22 profil), tanpa role lain. S1 remote bersih pada snapshot 2026-10-06. Implementasi Fase 1–7 menunggu prasyarat DB/E2E lokal, bukan hasil remote atau persetujuan matriks lagi.

### 3. Profile Read Contract & Recovery

- **PROFILE_FIELDS**: Gunakan subset kolom yang memang diperlukan untuk kueri feature-specific, batasi hanya pada field yang benar-benar ada di skema database.
- **Terminal states tetap hard-fail**: Jika profil berhasil terbaca dan status menunjukkan `rejected` atau `is_deleted = true`, sesi harus dianggap tidak valid dan user di-redirect ke landing page.
- **Pending tetap diarahkan ke waiting approval**: Jika profil berhasil terbaca dan status `pending`, user diarahkan ke `/waiting-approval`.
- **Transient profile read failure tidak lagi menghancurkan sesi**: Jika pembacaan `profiles` gagal sementara, sistem mempertahankan sesi aktif dan membiarkan recovery lanjut di route normal.
- **Default post-login path**: Setelah sesi login aktif, mapping: `pending -> /waiting-approval`, `rejected -> signOut() + error`, lainnya -> `/dashboard`.
- **Proteksi Ghost Profile (_Default-Deny_)**: Jika pengguna memiliki sesi aktif namun baris profilnya tidak ditemukan, sistem menerapkan prinsip _default-deny_ dan mengalihkan ke `/waiting-approval`.
- **RLS Hardening**: Tabel `public.profiles` dilindungi oleh kebijakan RLS khusus. Pengguna biasa hanya diizinkan membuat profil miliknya sendiri dalam status `pending`, tanpa role `admin`, dan hanya dapat memperbarui kolom `full_name`.
- **Mutasi Manajerial via Backend**: Perubahan status, role, dan soft-delete pengguna harus memvalidasi caller terlebih dahulu, lalu melakukan mutasi sensitif menggunakan admin client di backend (Hono API).

### 4. Access Matrix Ringkas

| Kondisi                                  | Hasil                           |
| ---------------------------------------- | ------------------------------- |
| Tidak ada sesi                           | Redirect ke login               |
| `pending`                                | Redirect ke `/waiting-approval` |
| `rejected`                               | Sign-out + redirect ke login    |
| `is_deleted = true`                      | Sign-out + redirect ke login    |
| Role tidak diizinkan                     | Redirect ke `/dashboard`        |
| Profil gagal dibaca sementara            | Toleran, sesi dipertahankan     |
| Profil tidak ditemukan (_Ghost Profile_) | Redirect ke `/waiting-approval` |

### 5. Role Normalization

Aplikasi menormalkan role (misalnya dari `trainers` menjadi `trainer`) untuk memastikan konsistensi. Implementasi saat audit Fase 0 masih berbeda: backend requireRole membandingkan nilai mentah, web menormalkan beberapa alias, dan broker Telefun punya helper sendiri. Penyatuan normalizeRole belum diimplementasikan.

### 6. Client-Side Session Lifetime Guard

Aplikasi menerapkan batas sesi client-side:

- **Max lifetime**: 8 jam (`AUTH_MAX_LIFETIME`). Setelah sesi aktif melebihi batas, user dipaksa sign out.
- **Idle timeout**: 30 menit tidak ada aktivitas (`AUTH_SESSION_TIMEOUT`), modal peringatan muncul dengan countdown 5 menit (`AUTH_GRACE_PERIOD_SEC`).
- **Cross-tab sync**: Status idle disinkronkan antar tab menggunakan `localStorage`.

### 7. Profil SELECT Bergantung pada RLS Policies, Bukan Hanya Table Grants

Setelah migrasi explicit grants, akses baca ke tabel `public.profiles` membutuhkan **dua lapisan izin**:

1. **Table-level grant**: `GRANT SELECT ON public.profiles TO authenticated`
2. **Row-Level Security policy**: Policy SELECT scoped `TO authenticated`

Tanpa lapisan kedua (RLS policy), user `authenticated` akan mendapatkan 0 baris meskipun table grant sudah diberikan.

**Policies SELECT yang wajib ada di `profiles`:**

- `"Users can view own profile"`: `auth.uid() = id`
- `"Admins can view all profiles"`: `get_auth_role() = 'admin'`
- `"Trainers can view all profiles"`: `get_auth_role() IN ('trainer', 'trainers')`
- `"Leaders can view all profiles"`: `get_auth_role() = 'leader'`

**Fungsi pembantu `get_auth_role()`:**

- Didefinisikan sebagai `SECURITY DEFINER STABLE` untuk menghindari rekursi RLS.
- Mengembalikan `lower(coalesce(role, ''))` — selalu lowercase.
- Hanya `authenticated` dan `service_role` yang memiliki `EXECUTE` privilege.

### 8. Smoke Test Wajib Setelah Auth/Profile Refactor

- Login akun `approved` role `agent` harus berhasil dan mendarat di `/dashboard`.
- Login akun `pending` harus selalu berakhir di `/waiting-approval`.
- Login akun `rejected` harus memutus sesi dan menampilkan pesan penolakan.
- Setelah login `agent`, akses route terbatas seperti `/profiler` atau route SIDAK manajerial harus tetap ditolak sesuai matrix akses.

## Logout & Guest Lock Mechanism

Untuk mencegah masalah auto-login otomatis (di mana user yang baru saja logout kembali masuk secara otomatis ke dashboard akibat token/session stale di Supabase), aplikasi menerapkan **Logout Guest Lock**:

1. **Logout Cleanup**: Saat user menekan tombol "Keluar", aplikasi menjalankan `clearAuthLocalState({ markLoggedOut: true })` yang menghapus semua data autentikasi lokal (`auth_token`, `auth_profile`, dll) dan menulis penanda/marker `trainers_logout_guest_lock = "1"` di `localStorage`.
2. **Init & Event Guard**:
   - Selama marker guest lock ini aktif, `initAuth` dan `LandingAuthProvider` akan memblokir/mengabaikan pemulihan sesi otomatis dan event `SIGNED_IN` yang berasal dari data cache Supabase.
   - Halaman landing akan tetap berada dalam guest mode dan menampilkan tombol "Masuk" (bukan "Dashboard").
3. **Pelepasan Lock**: Marker guest lock dilepas secara otomatis (`clearLogoutGuestLock()`) ketika user melakukan aksi login eksplisit (mengirimkan form login/register, melakukan OAuth Google, atau meminta reset password). Hal ini menjamin login baru berjalan normal tanpa hambatan.
4. **Logout biasa tetap lokal**: Tombol "Keluar" di navigasi aplikasi memakai scope `local`, jadi hanya mengakhiri sesi browser/perangkat saat ini.
5. **Logout semua perangkat dipisah di `/account`**: Halaman akun menyediakan aksi "Logout dari Semua Perangkat" untuk mencabut refresh session user di server.
6. **Perangkat lain tidak putus instan**: Karena Supabase masih memakai JWT access token yang sudah terbit, perangkat lain akan dipaksa login ulang saat token mereka diperbarui atau saat sesi itu dipakai kembali.

## Monitoring Usage & Billing Access

Route `/monitoring` memakai guard untuk `trainer`, `leader`, `admin`.

Kontrak akses untuk fitur monitoring usage billing:

| Permukaan                             | Admin | Trainer | Leader | Agent |
| ------------------------------------- | ----- | ------- | ------ | ----- |
| Histori simulasi lintas akun          | Ya    | Ya      | Ya     | Tidak |
| Tab `Penggunaan Token` lintas akun    | Ya    | Ya      | Ya     | Tidak |
| Tab `Harga & Kurs`                    | Ya    | Ya      | Tidak  | Tidak |
| Quick-view `Usage Bulan Ini` di modul | Ya    | Ya      | Ya     | Ya    |

Catatan:

- `leader` tetap dapat melihat agregasi usage lintas akun, tetapi tidak menerima editor pricing/kurs.
- `agent` tidak memiliki akses ke monitoring lintas akun, tetapi tetap dapat melihat quick-view usage miliknya sendiri di modul pribadi (KETIK, TELEFUN). PDKT menerima keempat role sesuai matriks endpoint.

## Referensi Guardrail

- `apps/web/src/components/Layout.tsx` — Layout dengan auth checks
- `apps/web/src/router.tsx` — TanStack Router route definitions
- `apps/api/src/` — Backend Hono middleware dan routes
- `docs/AUTH_KNOWN_ISSUE_PROFILE_SCHEMA_DRIFT.md`

## Atribusi Simulasi — Auth & Permission

- Hanya admin/trainer boleh memilih/membuat atribusi `participant`; role lain memakai `self` dan tidak melihat picker.
- Izin modul tidak memberi izin atribusi. Participant reply PDKT hanya admin/trainer; visibilitas snapshot nama/batch/tim di shared mailbox hanya untuk pembaca berizin (tanpa akses picker/Profiler penuh).
- Resolver memakai actor middleware + lookup minimal; user-JWT untuk lookup/RPC sesuai RLS; tidak menambah admin client untuk bypass lookup gagal. Existing admin writes tetap butuh validasi actor + snapshot eksplisit.

## Katalog dan scope terpadu (2026-10-06)

`packages/types/src/access.ts` adalah katalog tunggal `ROLES`, `Role`, `CAPABILITIES`, `can()` dan metadata approval leader. Boundary menerima empat role canonical (trim/lowercase); alias `trainers`/`agents` dihapus setelah audit lokal dan remote bersih. Nilai tak dikenal mengembalikan `null` dan tidak mendapat capability. `qa` sebagai mode heatmap, jabatan peserta dan speaker transkrip tetap domain terpisah.

`apps/api/src/services/access/scope.ts` memisahkan izin operasi dari row scope:

- `DataScope`: `all` untuk admin/trainer; `self` untuk peserta tertaut lewat `trainer_id`; `team` dari snapshot approval leader; `none` untuk akun tanpa link/approval/peserta.
- `applyPesertaScope()` memakai `in([])` untuk scope kosong, sehingga tidak pernah mengubah array kosong menjadi akses seluruh data.
- Kesalahan lookup/RPC menghasilkan 503 `SCOPE_UNAVAILABLE`; handler resource meneruskan error itu ke envelope global.
- `AccountScope` mempertahankan `user_id` akun untuk history/settings KETIK/PDKT dan manager override Telefun. Shared mailbox PDKT tetap menggunakan kontrak RLS/ownership sebelumnya. Scope peserta tidak digunakan untuk memperluas akses akun/shared.

Katalog juga dipakai guard router, sidebar, mobile navigation dan kontrol UI. Approval leader hanya diwajibkan pada view SIDAK/KTP melalui metadata; backend membatasi data peserta tanpa gate approval menyeluruh pada metadata modul.

### Preflight migrasi remote — HOLD (2026-10-06)

Fajar melarang apply `20261006120000_unify_application_access_roles.sql` ke remote sampai preflight selesai dan ada otorisasi apply terpisah. Pemeriksaan berikut memakai Supabase `execute_sql` read-only pada project `ruosnjmtywcrghjgqugz`, cocok dengan `supabase/.temp/project-ref`. Tidak menjalankan DDL atau mengubah privilege remote.

`SELECT pg_get_functiondef('public.handle_new_user'::regproc);` mengembalikan:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    'user',
    'pending'
  );
  RETURN NEW;
END;
$function$;
```

Snapshot fungsi remote masih menulis literal `user`, sama dengan fungsi dasar repo; tidak ditemukan logika signup tambahan dalam fungsi ini. Distribusi 22 profil canonical sebelumnya tidak membuktikan definisi trigger sudah berubah. Versi migrasi lokal mempertahankan id/email/full_name/status pending dan memakai default role agent; pemeriksaan ini belum mengizinkan penggantian fungsi remote.

| Target                              | Policy yang diminta migrasi                   | Hasil remote                                                                                                           |
| ----------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `storage.objects`                   | `Users read own telefun recordings`           | Ada, SELECT untuk authenticated; hanya bucket telefun-recordings + folder milik auth.uid(), belum ada manager override |
| `public.telefun_coaching_summary`   | `Users can view their own coaching summaries` | Tidak ada; tabel ada dan RLS aktif, tidak ada policy pada tabel ini di pg_policies                                     |
| `public.telefun_replay_annotations` | `Users can view their own replay annotations` | Tidak ada; tabel ada dan RLS aktif, tidak ada policy pada tabel ini di pg_policies                                     |

Policy storage lain yang ditemukan ialah `Users update own telefun recordings` dan `Users upload own telefun recordings`; keduanya bukan pengganti policy SELECT public yang hilang.

Koneksi audit memakai `current_user = session_user = postgres`, `rolsuper = false`, `rolinherit = true`, `rolbypassrls = true`. Owner kedua tabel public adalah postgres. Owner `storage.objects` adalah `supabase_storage_admin`; `pg_has_role(current_user, relowner, 'USAGE')` dan `'MEMBER'` keduanya false untuk storage.objects. Koneksi ini tidak memiliki hak owner yang diperlukan untuk ALTER POLICY pada storage.objects; BYPASSRLS tidak memberi hak DDL tersebut. Privilege runner apply yang berbeda belum diperiksa. Tidak mencoba ALTER POLICY, SET ROLE, atau pemberian membership.

Query katalog yang dapat diulang:

```sql
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN (
  'telefun_coaching_summary', 'telefun_replay_annotations'
)) OR (schemaname = 'storage' AND tablename = 'objects'
  AND policyname ILIKE '%telefun%');

SELECT current_user, session_user, r.rolsuper, r.rolinherit, r.rolbypassrls,
       n.nspname, c.relname, pg_get_userbyid(c.relowner) AS table_owner,
       pg_has_role(current_user, c.relowner, 'USAGE') AS owner_privileges_available,
       pg_has_role(current_user, c.relowner, 'MEMBER') AS owner_role_member
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_roles r ON r.rolname = current_user
WHERE (n.nspname = 'storage' AND c.relname = 'objects')
   OR (n.nspname = 'public' AND c.relname IN (
     'telefun_coaching_summary', 'telefun_replay_annotations'
   ));
```

**Apply remote tetap HOLD:** dua ALTER POLICY public menargetkan policy yang tidak ada, dan koneksi audit tidak dapat ALTER POLICY storage. Sebelum meminta otorisasi apply, siapkan adaptasi migrasi terhadap schema remote, buktikan parity signup/policy pada target disposable, dan verifikasi privilege runner sebenarnya. Migrasi lokal yang lulus E2E belum merupakan bukti kesiapan apply remote.

#### Resolusi preflight (2026-10-06)

Ketiga `ALTER POLICY` Telefun dihapus dari migrasi. Setelah CHECK empat role berlaku, role `qa` tidak mungkin ada, sehingga `role IN ('admin','trainer','qa')` pada policy lama setara dengan `role IN ('admin','trainer')`; mengubah teks policy tidak menambah keamanan dan hanya menghalangi apply remote (dua policy tidak ada, `storage.objects` milik `supabase_storage_admin`). Isi migrasi sekarang: guard role, default `agent`, CHECK empat role, dan penggantian `handle_new_user` (remote identik dengan versi dasar repo, jadi tidak ada logika yang hilang). Migrasi versi ini diterapkan ulang ke DB lokal loopback dalam satu transaksi (exit 0) dan E2E akses API lulus 74/74.

Urutan apply remote (tetap butuh otorisasi terpisah):

1. Tepat sebelum apply, jalankan `SELECT count(*) FROM public.profiles WHERE role NOT IN ('admin','trainer','leader','agent');`. Trigger lama memberi signup baru role `user`; hasil bukan 0 harus diputuskan dulu, karena guard migrasi akan membatalkan apply.
2. Apply migrasi **sebelum** deploy kode baru, karena `authMiddleware` baru menolak role di luar empat nilai.
3. Deploy API/web/Telefun.

Temuan terpisah, di luar plan ini: remote tidak punya policy untuk `telefun_coaching_summary` dan `telefun_replay_annotations` padahal RLS aktif (drift dari migrasi lokal). Audit 2026-10-06: semua akses lewat service-role di backend, tidak ada pembacaan via user JWT; drift diterima dan aturannya dicatat di `docs/database.md` (Catatan drift Telefun).

### Rencana lanjutan RLS peserta

Usulkan pekerjaan terpisah `can_access_peserta(auth.uid(), peserta_id, module)` sebagai policy SELECT bagi leader: memakai approval approved + access group peserta, fail closed pada scope kosong, indeks join terkait dan parity E2E untuk all/self/team/none. Audit dahulu policy service-role dan relasi `trainer_id`; migrasi bertahap per resource setelah parity terbukti. Rencana ini tidak menambahkan policy peserta baru atau mengubah shared mailbox.
