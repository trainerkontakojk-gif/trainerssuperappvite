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

Dokumen ini menjelaskan struktur teknis bagaimana sistem keamanan, pendaftaran, *auto-provisioning* Google OAuth, dan hak akses dikelola di Trainers SuperApp (Monorepo).

## Struktur Role

Aplikasi memiliki 4 role utama dengan hierarki akses sebagai berikut:

| Role | Deskripsi | Hak Akses Utama |
|---|---|---|
| **Admin** | Pengelola Sistem | Akses penuh seluruh modul, manajemen user (approve/reject/delete), audit logs, & konfigurasi sistem. |
| **Trainer** | Operasional Utama | Manajemen data Profiler, input & setting QA (SIDAK), monitoring, editor pricing/kurs usage billing, & audit logs terbatas. |
| **Leader** | Pengawas Tim | Melihat dashboard tim, monitoring aktivitas tim, monitoring usage billing lintas akun, melihat data Profiler. |
| **Agent** | Pengguna Simulasi | Akses ke modul simulasi (Ketik, PDKT, Telefun), melihat dashboard pribadi. |

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
- **Backend (Hono)**: Middleware chain — `authMiddleware` (JWT validation, global via app.ts) + `requireRole()` per-route di 48+ endpoints.
- **Frontend (Vite)**: Route guards di TanStack Router dengan auth checks di komponen Layout (`apps/web/src/components/Layout.tsx`).
- **Auth Pages**: Komponen auth di `apps/web/src/routes/` untuk login, register, reset password.

### 2. Guard Logic
Setiap halaman atau aksi sensitif dilindungi dengan pengecekan role di backend:

```typescript
// Backend Hono middleware chain
// app.ts: authMiddleware global di /v1/*
// per-route: requireRole('admin', 'trainer', ...)
```

Role enforcement coverage per module (Phase B hardening):

| Module | Endpoints | Read Roles | Write Roles |
|--------|-----------|------------|-------------|
| **SIDAK** | 15 | admin, trainer, qa, tl, spv, om | admin, trainer, qa |
| **Profiler** | 23 | admin, trainer, qa, tl, spv, om | admin, trainer, qa |
| **PDKT** | 16 | admin, trainer, qa, tl, spv, om, agent | admin, trainer, qa (AI) |
| **AI Monitoring** | 5 | admin, trainer (aggregation) | admin, trainer, qa (pricing) |
| **KETIK** | 4 | admin, trainer, qa, tl, spv, om, agent | admin, trainer, qa, tl, spv, om, agent |
| **Admin** | 8 | admin only | admin only |

### 3. Profile Read Contract & Recovery

- **PROFILE_FIELDS**: Gunakan subset kolom yang memang diperlukan untuk kueri feature-specific, batasi hanya pada field yang benar-benar ada di skema database.
- **Terminal states tetap hard-fail**: Jika profil berhasil terbaca dan status menunjukkan `rejected` atau `is_deleted = true`, sesi harus dianggap tidak valid dan user di-redirect ke landing page.
- **Pending tetap diarahkan ke waiting approval**: Jika profil berhasil terbaca dan status `pending`, user diarahkan ke `/waiting-approval`.
- **Transient profile read failure tidak lagi menghancurkan sesi**: Jika pembacaan `profiles` gagal sementara, sistem mempertahankan sesi aktif dan membiarkan recovery lanjut di route normal.
- **Default post-login path**: Setelah sesi login aktif, mapping: `pending -> /waiting-approval`, `rejected -> signOut() + error`, lainnya -> `/dashboard`.
- **Proteksi Ghost Profile (*Default-Deny*)**: Jika pengguna memiliki sesi aktif namun baris profilnya tidak ditemukan, sistem menerapkan prinsip *default-deny* dan mengalihkan ke `/waiting-approval`.
- **RLS Hardening**: Tabel `public.profiles` dilindungi oleh kebijakan RLS khusus. Pengguna biasa hanya diizinkan membuat profil miliknya sendiri dalam status `pending`, tanpa role `admin`, dan hanya dapat memperbarui kolom `full_name`.
- **Mutasi Manajerial via Backend**: Perubahan status, role, dan soft-delete pengguna harus memvalidasi caller terlebih dahulu, lalu melakukan mutasi sensitif menggunakan admin client di backend (Hono API).

### 4. Access Matrix Ringkas

| Kondisi | Hasil |
|---|---|
| Tidak ada sesi | Redirect ke login |
| `pending` | Redirect ke `/waiting-approval` |
| `rejected` | Sign-out + redirect ke login |
| `is_deleted = true` | Sign-out + redirect ke login |
| Role tidak diizinkan | Redirect ke `/dashboard` |
| Profil gagal dibaca sementara | Toleran, sesi dipertahankan |
| Profil tidak ditemukan (*Ghost Profile*) | Redirect ke `/waiting-approval` |

### 5. Role Normalization

Aplikasi menormalkan role (misalnya dari `trainers` menjadi `trainer`) untuk memastikan konsistensi. Seluruh perbandingan role di tingkat aplikasi harus melalui fungsi normalisasi.

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

## Monitoring Usage & Billing Access

Route `/dashboard` (tab monitoring) memakai guard untuk `trainer`, `leader`, `admin`.

Kontrak akses untuk fitur monitoring usage billing:

| Permukaan | Admin | Trainer | Leader | Agent |
|---|---|---|---|---|
| Histori simulasi lintas akun | Ya | Ya | Ya | Tidak |
| Tab `Penggunaan Token` lintas akun | Ya | Ya | Ya | Tidak |
| Tab `Harga & Kurs` | Ya | Ya | Tidak | Tidak |
| Quick-view `Usage Bulan Ini` di modul | Ya | Ya | Ya | Ya |

Catatan:
- `leader` tetap dapat melihat agregasi usage lintas akun, tetapi tidak menerima editor pricing/kurs.
- `agent` tidak memiliki akses ke monitoring lintas akun, tetapi tetap dapat melihat quick-view usage miliknya sendiri di modul pribadi (KETIK, PDKT, TELEFUN).

## Referensi Guardrail

- `apps/web/src/components/Layout.tsx` — Layout dengan auth checks
- `apps/web/src/router.tsx` — TanStack Router route definitions
- `apps/api/src/` — Backend Hono middleware dan routes
- `docs/AUTH_KNOWN_ISSUE_PROFILE_SCHEMA_DRIFT.md`
